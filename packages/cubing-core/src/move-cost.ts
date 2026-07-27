// MCC (move cost) scoring: a pluggable, context-aware ergonomic cost model.
//
// This is the port of `reference/mcc.ts` into the shape described in
// /DESIGN.md ("MCC (move cost) scoring"). The reference file computed a whole
// alg's cost from a string; here the model is expressed as a per-move
// `cost(move, context)` so the *same* model drives both the IDA* search's live
// cost function and post-hoc scoring of a finished algorithm.
//
// Differences from the reference, per DESIGN:
//   1. Operates on the canonical `Move` type, not raw strings, so search and
//      scoring share one representation.
//   2. No `console.warn`-and-skip path for unrecognized tokens — moot, since
//      `parseAlg` rejects invalid notation at the parse boundary and
//      `Move.family` is statically one of the 18 known families.
//   3. `prevMove` context is supplied by the caller and threads continuously
//      across step/phase boundaries during a real solve (see `scoreAlg` for the
//      isolated-segment case, where it starts at `null`).
//
// Two behaviors the reference left open are resolved here (see DESIGN):
//   - Rotations (`x`/`y`/`z`) DO get the half-turn multiplier now (`x2` costs
//     more than `x`), removing the reference's special-case exemption.
//   - Move direction is cost-neutral: `R` and `R'` cost the same. A flat
//     ergonomic model has no basis for a prime penalty, so `amount` only
//     matters via the half-turn multiplier (`amount === 2`).
//
// The numbers are the reference's starting-point constants, not a ground-truth
// standard — tune them as real solve data suggests. Every penalty is a
// deterministic predicate over `(prevMove, move)`.

import { formatMove, isDouble, type Move, type MoveFamily } from "./notation.ts";

/** Context passed to {@link MoveCostModel.cost} for a single move. */
export interface MoveCostContext {
  /**
   * The move physically executed immediately before this one, or `null` at the
   * start of a scored segment. During a real solve this threads continuously
   * across step/phase boundaries; it is `null` only when scoring an alg in
   * isolation.
   */
  prevMove: Move | null;
  /** Index of this move within the segment being scored (0-based). */
  index: number;
}

/**
 * A pluggable move-cost model. Context-aware so a move can be weighted by what
 * preceded it (e.g. hand transitions). A flat per-move-type table is just the
 * special case that ignores `context`.
 */
export interface MoveCostModel {
  cost(move: Move, context: MoveCostContext): number;
}

export type MccMode = "2H" | "OH";
export type OhHandedness = "left" | "right";

/** Options for {@link createDefaultMoveCostModel}. */
export interface DefaultMoveCostOptions {
  /** Two-handed (default) or one-handed. */
  mode?: MccMode;
  /**
   * One-handed handedness; only relevant when `mode` is `"OH"`. Defaults to
   * `"left"` (the baseline table); `"right"` mirrors L/R and r/l costs.
   */
  handedness?: OhHandedness;
}

// --- Base costs ---
//
// 2H: wrist-turn faces (R/L) cheapest, U a fast index flick, slices (M/E/S)
// and D more expensive, F/B awkward push turns. Wide moves cost slightly more
// than their outer counterpart; rotations are a fixed regrip overhead.

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

// OH (left-hand baseline): R and U are the ergonomic gold standard; L, B, D
// are harder without a rotation; slices are uniformly expensive one-handed.

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

// R<->L mirror for right-handed OH. M/E/S are never mirrored (center-relative).
const LR_MIRROR: Partial<Record<MoveFamily, MoveFamily>> = {
  R: "L",
  L: "R",
  r: "l",
  l: "r",
};

const HALF_TURN_MULTIPLIER = 1.65;

// --- Transition penalties (deterministic predicates over adjacent moves) ---

const RIGHT_SIDE_FAMILIES = new Set<MoveFamily>(["R", "r", "M"]);
const LEFT_SIDE_FAMILIES = new Set<MoveFamily>(["L", "l"]);

/**
 * 2H destabilization: a move on the opposite hand's side immediately following
 * the other hand's side move requires re-stabilizing the grip.
 */
function destabilizationPenalty2H(prev: Move, cur: Move): number {
  const prevRight = RIGHT_SIDE_FAMILIES.has(prev.family);
  const prevLeft = LEFT_SIDE_FAMILIES.has(prev.family);
  const curRight = RIGHT_SIDE_FAMILIES.has(cur.family);
  const curLeft = LEFT_SIDE_FAMILIES.has(cur.family);
  return (prevRight && curLeft) || (prevLeft && curRight) ? 0.5 : 0;
}

/**
 * Overwork: the same move family twice in a row (e.g. `R R` instead of `R2`)
 * forces the same finger/wrist action twice with no recovery. Distinct from
 * `R2`, which is priced via the half-turn multiplier.
 */
function overworkPenalty(prev: Move, cur: Move): number {
  return prev.family === cur.family ? 2.25 : 0;
}

// OH grip fatigue: consecutive faces driven by the same finger without a rest.
const OH_SAME_FINGER_PAIRS = new Set<string>(["U-F", "F-U"]);

function ohGripFatiguePenalty(prev: Move, cur: Move): number {
  return OH_SAME_FINGER_PAIRS.has(`${prev.family}-${cur.family}`) ? 2.0 : 0;
}

/**
 * Builds the library's default {@link MoveCostModel} — the port of
 * `reference/mcc.ts`. Defaults to two-handed; pass `{ mode: "OH" }` (optionally
 * with `handedness`) for one-handed.
 */
export function createDefaultMoveCostModel(
  options: DefaultMoveCostOptions = {},
): MoveCostModel {
  const mode = options.mode ?? "2H";
  const handedness = options.handedness ?? "left";

  const baseCost = (family: MoveFamily): number => {
    if (mode === "2H") return BASE_COST_2H[family];
    const effective = handedness === "right" ? (LR_MIRROR[family] ?? family) : family;
    return BASE_COST_OH_LEFT[effective];
  };

  return {
    cost(move: Move, context: MoveCostContext): number {
      let c = baseCost(move.family);
      if (isDouble(move)) c *= HALF_TURN_MULTIPLIER;

      const prev = context.prevMove;
      if (prev) {
        c += overworkPenalty(prev, move);
        c += mode === "2H"
          ? destabilizationPenalty2H(prev, move)
          : ohGripFatiguePenalty(prev, move);
      }
      return c;
    },
  };
}

// --- Block-building cost model ------------------------------------------------
//
// First-block building wants a DIFFERENT cost profile than last-layer execution:
// move count dominates (a short block is a fast block), ergonomics breaks ties,
// and a handful of moves are essentially never worth doing — above all a wide `b`
// (and `f`), which no one recommends. The default MCC model prices wides only
// slightly above their outer face and is direction-neutral, so a raw-cost search
// happily piles on wides and awkward slices. This model fixes that for the block
// phases only (wired via `SearchPhase.costModel`), leaving last-layer scoring and
// its lookahead untouched.
//
// Shape: cost = MOVE_TAX (a per-move floor that biases toward fewer moves, à la
// onionhoney's `moveCount*100`, but scaled to still let a very awkward move lose
// to an extra clean one) + an ergonomic term that IS direction-dependent (M' ≪ M,
// S' ≪ S) + the same additive transition penalties as the default model. The
// ergonomic term is a plain per-move-name table; unknown names fall back to a
// middling default. Leading whole-cube rotations (the inspection re-hold) are
// priced cheaply — the block may be built from any orientation.

const BLOCK_MOVE_TAX = 1.0;

// Ergonomic term (on top of the tax), by canonical move name. Right-hand/U moves
// are free; wide `b`/`f` and the hard `S` are steep; slices are direction-aware.
const BLOCK_ERGO: Record<string, number> = {
  R: 0.0,
  "R'": 0.0,
  R2: 0.4,
  L: 0.2,
  "L'": 0.2,
  L2: 0.6,
  U: 0.0,
  "U'": 0.0,
  U2: 0.3,
  D: 0.6,
  "D'": 0.6,
  D2: 1.0,
  F: 0.6,
  "F'": 0.6,
  F2: 1.0,
  B: 1.1,
  "B'": 1.1,
  B2: 1.6,
  r: 0.4,
  "r'": 0.4,
  r2: 0.8,
  l: 0.6,
  "l'": 0.6,
  l2: 1.0,
  u: 0.7,
  "u'": 0.7,
  u2: 1.1,
  d: 1.1,
  "d'": 1.1,
  d2: 1.6,
  f: 1.2,
  "f'": 1.2,
  f2: 1.8,
  b: 3.0,
  "b'": 3.0,
  b2: 3.6, // wide b: essentially never worth it
  M: 0.7,
  "M'": 0.3,
  M2: 0.9,
  S: 2.2,
  "S'": 0.6,
  S2: 1.6,
  E: 0.9,
  "E'": 0.9,
  E2: 1.4,
  x: 0.6,
  "x'": 0.6,
  x2: 0.9,
  y: 0.3,
  "y'": 0.3,
  y2: 0.5,
  z: 0.6,
  "z'": 0.6,
  z2: 0.9,
};

/**
 * The block-building {@link MoveCostModel} — move-count-dominant with an honest,
 * direction-aware ergonomic tiebreaker (see the section header). Use it for the
 * block phases' search + pruning heuristic; keep {@link createDefaultMoveCostModel}
 * for last-layer / lookahead scoring.
 */
export function createBlockCostModel(): MoveCostModel {
  return {
    cost(move: Move, context: MoveCostContext): number {
      let c = BLOCK_MOVE_TAX + (BLOCK_ERGO[formatMove(move)] ?? 1.4);
      const prev = context.prevMove;
      if (prev) {
        c += overworkPenalty(prev, move);
        c += destabilizationPenalty2H(prev, move);
      }
      return c;
    },
  };
}

/**
 * Scores a move sequence in isolation with the given model: sums the per-move
 * cost threading `prevMove` from `null`. Rounded to 6 decimals to suppress
 * floating-point noise in comparisons. For a live solve the pipeline runner
 * calls `model.cost` directly, threading `prevMove` across phase boundaries
 * instead of resetting to `null`.
 */
export function scoreAlg(moves: Move[], model: MoveCostModel): number {
  let total = 0;
  let prev: Move | null = null;
  for (let i = 0; i < moves.length; i++) {
    total += model.cost(moves[i], { prevMove: prev, index: i });
    prev = moves[i];
  }
  return Math.round(total * 1e6) / 1e6;
}
