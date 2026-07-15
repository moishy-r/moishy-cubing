import { tokenize } from "./alg.ts";

// --- MCC: Move Cost Coefficient ---
//
// A deterministic, per-alg ergonomic cost estimate, computed from the move
// string itself rather than hand-authored per algset entry. This replaces
// storing mcc/ohMcc directly on AlgEntry: every alg (algset entries, fb
// output, any other move string) is scored the same way on demand, so
// there's exactly one cost model to maintain instead of thousands of
// hand-tuned numbers that can drift out of sync with each other.
//
// This is NOT a literal implementation of any single external tool's
// formula. It's a from-scratch, fully deterministic table-driven model —
// every move classification and every penalty is a checkable predicate
// over the token sequence, not a subjective judgment call. It's inspired
// by the same general ergonomic intuitions used elsewhere in the
// community (wrist turns being cheap, slice/pinky turns being expensive,
// double turns costing more than a single quarter turn, rotations being
// costly) but the exact numbers are a starting point, not a ground-truth
// standard — tune the constants below as real solve data suggests.

export type MccMode = "2H" | "OH";
export type OhHandedness = "left" | "right";

export interface MccOptions {
  mode: MccMode;
  // Only relevant when mode is "OH". Defaults to "left", matching the
  // convention used elsewhere in this project (left-handed OH is the
  // baseline; right-handed OH mirrors L/R costs).
  handedness?: OhHandedness;
}

// --- Move classification ---

type MoveFamily =
  | "R"
  | "L"
  | "U"
  | "D"
  | "F"
  | "B" // outer face turns
  | "M"
  | "E"
  | "S" // slice turns
  | "r"
  | "l"
  | "u"
  | "d"
  | "f"
  | "b" // wide turns
  | "x"
  | "y"
  | "z"; // rotations

interface ParsedMccMove {
  family: MoveFamily;
  isDouble: boolean; // "2" suffix
  isPrime: boolean; // "'" suffix
}

const MCC_MOVE_RE = /^([RLUDFBMESrludfbxyz])(2)?('?)$/;

function parseMccMove(token: string): ParsedMccMove | null {
  const m = MCC_MOVE_RE.exec(token);
  if (!m) return null;
  const [, family, two, prime] = m;
  return {
    family: family as MoveFamily,
    isDouble: two === "2",
    isPrime: prime === "'",
  };
}

// --- Base costs ---
//
// 2H base costs: wrist-turn faces (R/L) are cheapest, U is a fast index
// flick, slice turns (M/E/S) and D are more expensive (regrip/pinky-heavy),
// F/B are awkward push turns. Wide moves cost slightly more than their
// outer-layer counterpart (extra finger coverage), rotations are a fixed
// overhead since they require a full regrip.

const BASE_COST_2H: Record<MoveFamily, number> = {
  R: 0.8,
  L: 0.8,
  U: 1.0,
  D: 1.4,
  F: 1.3,
  B: 1.3,
  M: 1.2,
  E: 1.3,
  S: 1.3,
  r: 1.0,
  l: 1.0,
  u: 1.1,
  d: 1.5,
  f: 1.4,
  b: 1.4,
  x: 2.0,
  y: 1.8,
  z: 2.0,
};

// OH base costs (left-hand baseline): R and U are the ergonomic gold
// standard since they're driven by the fingers holding the cube; L, B,
// and D are all meaningfully harder without a rotation; slices are
// uniformly expensive since they require a regrip with only one hand
// available to both hold and turn.

const BASE_COST_OH_LEFT: Record<MoveFamily, number> = {
  R: 1.0,
  U: 1.0,
  L: 2.5,
  B: 3.0,
  D: 1.8,
  F: 1.6,
  M: 2.5,
  E: 2.5,
  S: 2.5,
  r: 1.3,
  u: 1.2,
  l: 2.8,
  b: 3.3,
  d: 2.1,
  f: 1.9,
  x: 4.0,
  y: 4.0,
  z: 4.0,
};

const LR_MIRROR: Partial<Record<MoveFamily, MoveFamily>> = {
  R: "L",
  L: "R",
  r: "l",
  l: "r",
};

function baseCostOh(family: MoveFamily, handedness: OhHandedness): number {
  const effectiveFamily = handedness === "right" ? (LR_MIRROR[family] ?? family) : family;
  return BASE_COST_OH_LEFT[effectiveFamily];
}

const HALF_TURN_MULTIPLIER = 1.65;

// --- Transition penalties ---
//
// Expressed as checkable predicates over consecutive parsed moves, not
// vague judgment calls. Each predicate below is deterministic: given the
// same two adjacent moves, it always returns the same penalty.

const ROTATION_FAMILIES = new Set<MoveFamily>(["x", "y", "z"]);
const RIGHT_SIDE_FAMILIES = new Set<MoveFamily>(["R", "r", "M"]);
const LEFT_SIDE_FAMILIES = new Set<MoveFamily>(["L", "l"]);

/**
 * 2H destabilization penalty: a move on U or D immediately following a
 * move on the opposite-hand's face (R-side move followed directly by an
 * L-side move or vice versa) requires re-stabilizing the cube's grip,
 * since both hands were just committed to turning rather than holding.
 */
function destabilizationPenalty2H(
  prev: ParsedMccMove,
  cur: ParsedMccMove,
): number {
  const prevIsRightSide = RIGHT_SIDE_FAMILIES.has(prev.family);
  const prevIsLeftSide = LEFT_SIDE_FAMILIES.has(prev.family);
  const curIsRightSide = RIGHT_SIDE_FAMILIES.has(cur.family);
  const curIsLeftSide = LEFT_SIDE_FAMILIES.has(cur.family);
  if (
    (prevIsRightSide && curIsLeftSide) ||
    (prevIsLeftSide && curIsRightSide)
  ) {
    return 0.5;
  }
  return 0;
}

/**
 * 2H overwork penalty: the exact same move family repeated back-to-back
 * without an intervening different move (e.g. "R R" instead of "R2")
 * forces the same finger/wrist action twice in a row with no recovery.
 * Note this is distinct from R2 itself, which is already priced via the
 * half-turn multiplier — this penalty only fires when the same single
 * turn is deliberately split into two consecutive tokens of the same
 * family.
 */
function overworkPenalty(prev: ParsedMccMove, cur: ParsedMccMove): number {
  return prev.family === cur.family ? 2.25 : 0;
}

/**
 * OH grip-fatigue penalty: consecutive moves on faces that in one-handed
 * solving are driven by the same finger without an intervening rest
 * (F immediately following U, or vice versa, both commonly driven by the
 * index finger in left-hand OH) incur a fatigue penalty.
 */
const OH_SAME_FINGER_PAIRS = new Set<string>(["U-F", "F-U"]);

function ohGripFatiguePenalty(prev: ParsedMccMove, cur: ParsedMccMove): number {
  const key = `${prev.family}-${cur.family}`;
  return OH_SAME_FINGER_PAIRS.has(key) ? 2.0 : 0;
}

// --- Per-move scoring ---

function scoreMove2H(move: ParsedMccMove): number {
  const base = BASE_COST_2H[move.family];
  return move.isDouble ? base * HALF_TURN_MULTIPLIER : base;
}

function scoreMoveOh(move: ParsedMccMove, handedness: OhHandedness): number {
  const base = baseCostOh(move.family, handedness);
  return move.isDouble ? base * HALF_TURN_MULTIPLIER : base;
}

// --- Public API ---

/**
 * Computes a deterministic MCC score for a move string under the given
 * mode. Unrecognized tokens (shouldn't normally occur for valid cube
 * notation) are skipped with a console warning rather than silently
 * corrupting the total or throwing and aborting an otherwise-valid
 * comparison.
 */
export function calculateMcc(alg: string, options: MccOptions): number {
  const handedness = options.handedness ?? "left";
  const tokens = tokenize(alg);
  const parsed: ParsedMccMove[] = [];
  for (const tok of tokens) {
    const p = parseMccMove(tok);
    if (!p) {
      console.warn(`calculateMcc: unrecognized move token "${tok}", skipping`);
      continue;
    }
    parsed.push(p);
  }

  let total = 0;
  for (let i = 0; i < parsed.length; i++) {
    const move = parsed[i];

    if (ROTATION_FAMILIES.has(move.family)) {
      total += options.mode === "2H" ? BASE_COST_2H[move.family] : BASE_COST_OH_LEFT[move.family];
      continue;
    }

    total += options.mode === "2H" ? scoreMove2H(move) : scoreMoveOh(move, handedness);

    if (i > 0) {
      const prev = parsed[i - 1];
      if (options.mode === "2H") {
        total += destabilizationPenalty2H(prev, move);
        total += overworkPenalty(prev, move);
      } else {
        total += ohGripFatiguePenalty(prev, move);
        total += overworkPenalty(prev, move);
      }
    }
  }

  return Math.round(total * 1000) / 1000;
}

/** Convenience: score for both modes at once, e.g. for populating comparisons. */
export function calculateMccBoth(
  alg: string,
  handedness?: OhHandedness,
): { mcc: number; ohMcc: number } {
  return {
    mcc: calculateMcc(alg, { mode: "2H" }),
    ohMcc: calculateMcc(alg, { mode: "OH", handedness }),
  };
}
