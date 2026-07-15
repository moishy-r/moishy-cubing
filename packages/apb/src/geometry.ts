// APB geometry: the method-wiring layer that turns algset data + cube state
// into the goal predicates and recognition signatures each APB Step needs.
//
// This is exactly the "method wiring" /DESIGN.md defers out of `algsets`: an
// algset stores only algs (recognition derived from `algs[0]`), and it is here
// that we say *which region* a partial step cares about — both for its goal
// (is the region solved?) and its recognition signature (project the state to
// just that region, so a case is recognized regardless of the still-scrambled
// pieces around it). See /DESIGN.md "Algset schema & authoring".
//
// Piece indexing is Kociemba's (see cube-state.ts):
//   corners: URF0 UFL1 ULB2 UBR3 DFR4 DLF5 DBL6 DRB7
//   edges:   UR0 UF1 UL2 UB3 DR4 DF5 DL6 DB7 FR8 FL9 BL10 BR11
//
// APB is solved bottom-left, fixed frame (color neutrality is handled upstream
// by the runner's commit-early rotation choice), so these indices are constant.

import type { AlgSet } from "@moishy/algsets";
import {
  type AlgCase,
  applyMoves,
  type CaseLookup,
  compose,
  type CubeState,
  invert,
  type Move,
  type MoveFamily,
  solvedCube,
  statesEqual,
} from "@moishy/cubing-core";

// --- Piece groups (Kociemba indices) ----------------------------------------

/** 2x2x3 block at bottom-left: corners DLF, DBL; edges DF, DL, DB, FL, BL. */
export const BLOCK223 = { corners: [5, 6], edges: [5, 6, 7, 9, 10] } as const;
/** BR pair: DRB corner + BR edge. */
export const BR_PAIR = { corners: [7], edges: [11] } as const;
/** Last slot (LXS): DFR corner + FR edge + DR edge. */
export const LAST_SLOT = { corners: [4], edges: [8, 4] } as const;

/** block223 + brPair solved (corners DLF,DBL,DRB; edges DF,DL,DB,FL,BL,BR). */
export const AFTER_BR = {
  corners: [5, 6, 7],
  edges: [5, 6, 7, 9, 10, 11],
} as const;
/** Everything below the last layer, i.e. F2L: after LXS all of this is solved. */
export const F2L = {
  corners: [4, 5, 6, 7],
  edges: [4, 5, 6, 7, 8, 9, 10, 11],
} as const;
/** The 6 edge *slots* EO orients (and LXS/ZBLL place): UR, UF, UL, UB, FR, DR. */
export const EO_EDGE_SLOTS = [0, 1, 2, 3, 8, 4] as const;

// --- Goal predicates ---------------------------------------------------------

/** A region (which corner and edge *slots* must hold their home cubie, oriented). */
export interface Region {
  corners: readonly number[];
  edges: readonly number[];
}

/** True iff the centers are home — the fixed reference frame is intact. */
export function centersSolved(s: CubeState): boolean {
  for (let i = 0; i < 6; i++) if (s.cn[i] !== i) return false;
  return true;
}

/**
 * True iff every slot in `region` holds its home cubie, correctly oriented,
 * *and* the centers are home.
 *
 * The center check is essential, not incidental: APB is solved in a fixed frame
 * with no whole-cube rotations, so a slot-solved region whose centers have
 * drifted (e.g. after an M-slice DF/DB alg) is *not* actually color-solved — the
 * block pieces sit in their home slots but the surrounding centers no longer
 * match them. Requiring `cn` identity here forces every step to net-preserve the
 * frame: the block search's center-aware heuristic only accepts a net-center-
 * neutral block even when it uses slice/wide moves, and alg phases pick a center-
 * neutral variant among their interchangeable algs (see /DESIGN.md's "Algset
 * schema" — every core APB set carries one per case). Without it, the frame drifts
 * silently through the piece-index-based middle steps and only surfaces at ZBLL's
 * fixed-frame recognition and the final `isSolved`.
 */
export function regionSolved(region: Region): (s: CubeState) => boolean {
  return (s) =>
    centersSolved(s) &&
    region.corners.every((i) => s.cp[i] === i && s.co[i] === 0) &&
    region.edges.every((i) => s.ep[i] === i && s.eo[i] === 0);
}

/** True iff `region` is solved *and* all 12 edges are oriented (EO's goal). */
export function regionSolvedAndEO(region: Region): (s: CubeState) => boolean {
  const solved = regionSolved(region);
  return (s) => solved(s) && s.eo.every((o) => o === 0);
}

// --- Recognition signatures ---------------------------------------------------
//
// A signature projects a state to just the pieces a step recognizes on, so a
// case is matched regardless of the pieces around it that are still scrambled
// (validated for brPair: 0 collisions across all 89 cases, and every recognized
// state solved by its primary alg). AUF is *not* folded in here — `runPhase`
// tries the U-rotations on top (see /DESIGN.md).

/** Slot + orientation of a given corner cubie (where it currently sits). */
function cornerLoc(s: CubeState, cubie: number): string {
  const slot = s.cp.indexOf(cubie);
  return `${slot}.${s.co[slot]}`;
}
/** Slot + orientation of a given edge cubie. */
function edgeLoc(s: CubeState, cubie: number): string {
  const slot = s.ep.indexOf(cubie);
  return `${slot}.${s.eo[slot]}`;
}

/**
 * Signature over the *location + orientation* of specific cubies — the natural
 * recognition key for a partial step: "where are the piece(s) this step
 * places?". Everything else is ignored, so the still-scrambled surroundings
 * don't perturb recognition.
 */
export function pieceSignature(
  cornerCubies: readonly number[],
  edgeCubies: readonly number[],
): (s: CubeState) => string {
  return (s) =>
    cornerCubies.map((c) => cornerLoc(s, c)).join("|") + "/" +
    edgeCubies.map((e) => edgeLoc(s, e)).join("|");
}

/**
 * A state-identity key for a block-building A* over `region`: the
 * location+orientation of every tracked cubie ({@link pieceSignature}), the
 * center permutation, and the family of the move that produced the state. The
 * first two are a sufficient statistic for the region's *evolution* (the goal
 * {@link regionSolved} and the pruning heuristic read exactly these, and each
 * tracked cubie + center evolves independently of the untracked pieces); the
 * last-move family is required because MCC cost is context-sensitive (its
 * penalties key on the previous move's family), so two paths to the same
 * coordinate via different last families reach different *future costs* and must
 * not be merged. Passing this as `searchAStar`'s `stateKey` merges the many
 * full-cube states that agree on the region + last family but differ only in
 * untracked pieces — an exact, large speedup for a single-cheapest block search.
 *
 * NOT for phase-chaining pools: it deliberately collapses states that differ only
 * off-region, which is exactly the downstream diversity a pool needs (see the
 * `poolStateKey` note in step.ts). Use a finer key there.
 */
export function regionCoordinate(region: Region): (s: CubeState, last: Move | null) => string {
  const pieces = pieceSignature(region.corners, region.edges);
  return (s, last) => `${pieces(s)}/${s.cn.join("")}/${last?.family ?? ""}`;
}

// --- Move-ordering: axis/commutation canonicalization ------------------------

// [axis, rank] for each non-rotation family. The 15 families group into 3 axes
// whose members pairwise commute (verified). On the L-R axis the right-hand set
// {R,r,M} is ranked before the left-hand set {L,l} so the canonical ordering has
// the fewest right<->left transitions — the only same-axis adjacency the 2H cost
// model penalizes (destabilization). U-D and F-B have no order-dependent penalty,
// so their intra-axis order is arbitrary.
const AXIS_RANK: Partial<Record<MoveFamily, readonly [number, number]>> = {
  R: [0, 0],
  r: [0, 1],
  M: [0, 2],
  L: [0, 3],
  l: [0, 4],
  U: [1, 0],
  D: [1, 1],
  u: [1, 2],
  d: [1, 3],
  E: [1, 4],
  F: [2, 0],
  B: [2, 1],
  f: [2, 2],
  b: [2, 3],
  S: [2, 4],
};

/**
 * A `canFollow` predicate that forbids consecutive same-family moves (like the
 * engine default) *and* canonicalizes runs of commuting same-axis moves: within
 * one axis, moves must appear in strictly increasing rank. This collapses the
 * redundant orderings a slice/wide-inclusive generator would otherwise explore
 * (`R M` ≡ `M R`, etc.) without dropping any reachable state — the main lever
 * that keeps the 15-family block search affordable.
 *
 * Cost-optimality is preserved for the shipped 2H/OH cost models (guarded by a
 * test): a same-axis run's cost is independent of its internal order given its
 * cross-axis neighbours, and rights-before-lefts minimizes the one order-
 * dependent penalty. The engine applies this only *between the search's own
 * moves* — never against the external `prevMove` at a phase boundary, where
 * commuting pairs are legitimate and non-reorderable (see search.ts). Rotations
 * are unranked (never in a block move set) and fall back to same-family only.
 */
export function axisCanonical(prev: Move, next: Move): boolean {
  if (prev.family === next.family) return false;
  const a = AXIS_RANK[prev.family];
  const b = AXIS_RANK[next.family];
  if (a && b && a[0] === b[0]) return a[1] < b[1];
  return true;
}

/**
 * EO recognition: which of the 6 EO *slots* hold a misoriented edge. Slot-based
 * (not cubie-based) so that a `U` pre-AUF rotates the pattern — the U-layer
 * slots {UR,UF,UL,UB} permute under U — letting `runPhase` align a live state to
 * the one AUF-representative the algset stores (EO is otherwise 4x-redundant).
 */
export function eoSignature(): (s: CubeState) => string {
  return (s) => EO_EDGE_SLOTS.map((slot) => s.eo[slot]).join("");
}

// --- CaseLookup builders ------------------------------------------------------

/**
 * Builds a {@link CaseLookup} over an {@link AlgSet}'s cases keyed by a custom
 * `signature` (rather than the algset's own full-facelet default) — the bridge
 * that lets a whole-cube algset recognize on just a region. First-defined case
 * wins a signature (collisions are a data bug, surfaced by the algset's tests).
 */
export function regionLookup(
  algSet: AlgSet,
  signature: (s: CubeState) => string,
  caseFilter?: (c: AlgSet["cases"][number]) => boolean,
): CaseLookup {
  const bySig = new Map<string, AlgCase>();
  for (const c of algSet.cases) {
    if (caseFilter && !caseFilter(c)) continue;
    const sig = signature(algSet.recognitionState(c.id));
    if (!bySig.has(sig)) bySig.set(sig, c);
  }
  return { find: (s) => bySig.get(signature(s)) ?? null };
}

// The four AUF states (identity, U, U2, U') as cube states, for building the
// two-sided U-coset of a last-layer case (see {@link aufInvariantLookup}).
const U_STATES: CubeState[] = [0, 1, 2, 3].map((amount) =>
  amount === 0 ? solvedCube() : applyMoves(solvedCube(), [{ family: "U", amount } as Move])
);

// --- De-rotation (fixed-frame normalization of algs) -------------------------

const ROTATIONS = new Set<MoveFamily>(["x", "y", "z"]);
const NON_ROTATIONS: MoveFamily[] = [
  "R",
  "L",
  "U",
  "D",
  "F",
  "B",
  "M",
  "E",
  "S",
  "r",
  "l",
  "u",
  "d",
  "f",
  "b",
];
const SINGLE_MOVE_STATES = NON_ROTATIONS.map((family) => ({
  family,
  state: applyMoves(solvedCube(), [{ family, amount: 1 }]),
}));

/**
 * The single face/slice/wide move equal to `rot · {family} · rot⁻¹` — i.e. what
 * `family` becomes once the cube has been rotated by `rot`. Computed against the
 * engine (not a hand table) so it is correct for every family, including slices
 * and wides. `rot` is the accumulated rotation moves seen so far.
 */
function conjugateFamily(family: MoveFamily, rot: Move[]): MoveFamily {
  if (rot.length === 0) return family;
  const target = applyMoves(solvedCube(), [...rot, { family, amount: 1 }, ...invert(rot)]);
  for (const { family: g, state } of SINGLE_MOVE_STATES) {
    if (statesEqual(target, state)) return g;
  }
  // A rotation conjugates a quarter-turn to a quarter-turn, so this is unreachable.
  throw new Error(`conjugate of ${family} under rotation is not a single move`);
}

/**
 * Rewrites an alg into an equivalent that ends in the *fixed frame* — same effect
 * on the pieces, but no net whole-cube rotation. It pushes each `x`/`y`/`z` to
 * the end (relabeling every following move through the accumulated rotation) and
 * drops it. See /DESIGN.md's "tilted alg" caveat: some imported last-layer algs
 * end tilted (e.g. an unbalanced `y`), which is fine for a speedsolver holding
 * the cube rotated but not for APB's fixed-frame, center-tracked solve.
 */
export function stripRotations(moves: Move[]): Move[] {
  const rot: Move[] = [];
  const out: Move[] = [];
  for (const m of moves) {
    if (ROTATIONS.has(m.family)) rot.push(m);
    else out.push({ family: conjugateFamily(m.family, rot), amount: m.amount });
  }
  return out;
}

const isCenterNeutral = (moves: Move[]) =>
  applyMoves(solvedCube(), moves).cn.every((v, i) => v === i);

/**
 * A fixed-frame equivalent of one alg variant: unchanged if it is already
 * center-neutral (the common case — including algs that use internal rotations
 * which cancel out); otherwise de-rotated ({@link stripRotations}). If neither is
 * center-neutral (an alg whose net center shift is a slice, not a rotation — not
 * present in the current last-layer data) it is returned as-is and `runPhase`'s
 * goal check will simply reject it.
 */
function fixedFrameMoves(moves: Move[]): Move[] {
  if (isCenterNeutral(moves)) return moves;
  const stripped = stripRotations(moves);
  return isCenterNeutral(stripped) ? stripped : moves;
}

/**
 * Like {@link regionLookup}, but for a *terminal* full-last-layer step (ZBLL,
 * and the PLL it falls through to): recognizes a case up to **both** pre- and
 * post-AUF.
 *
 * Why this is needed only here. `runPhase` already tries every pre-AUF (a U turn
 * before the alg) and post-AUF (a U turn after). For a *non-terminal* algorithmic
 * step that only has to reach a region goal, that is enough — any residual U
 * misalignment it leaves is simply absorbed by the *next* step's pre-AUF, so its
 * recognition only needs to match up to pre-AUF (which {@link regionLookup}
 * gives). ZBLL is terminal: there is no next step to absorb a residual AUF, so
 * the post-AUF is part of *its* solution, and a live last-layer state generally
 * differs from a stored case's canonical form (the one its `algs[0]` solves
 * *exactly*, post-AUF = identity) by that post-AUF. The 472+21 stored cases are
 * complete only up to both AUFs; a plain full-facelet lookup recognizes just the
 * 1/4 of states that happen to need no post-AUF.
 *
 * Two last-layer states are the same case iff one is `Uᵃ · s · Uᵇ` of the other
 * (a two-sided U-coset — pre-AUF on one side, post-AUF on the other; verified
 * empirically). So we index each case under the signature of every element of
 * that 16-element coset of its recognition state. The stored cases are disjoint
 * cases, so their cosets are disjoint — no new collisions (a genuine collision
 * is still a data bug, surfaced by the set's own tests).
 *
 * Each variant is first put into the fixed frame ({@link stripRotations}) and the
 * recognition state re-derived from that de-rotated primary, so cases whose
 * `algs[0]` ends tilted are both recognized *and* solvable here (their tilted
 * primary would otherwise leave the centers off after `runPhase` applies it).
 */
export function aufInvariantLookup(
  algSet: AlgSet,
  signature: (s: CubeState) => string,
  caseFilter?: (c: AlgSet["cases"][number]) => boolean,
): CaseLookup {
  const bySig = new Map<string, AlgCase>();
  for (const c of algSet.cases) {
    if (caseFilter && !caseFilter(c)) continue;
    const cased: AlgCase = {
      ...c,
      algs: c.algs.map((a) => ({ ...a, moves: fixedFrameMoves(a.moves) })),
    };
    // Recognition state re-derived from the (now fixed-frame) primary, so it sits
    // in the home frame that a live solve state does — a plain signature matches.
    const r = applyMoves(solvedCube(), invert(cased.algs[0].moves));
    for (const pre of U_STATES) {
      for (const post of U_STATES) {
        const key = signature(compose(compose(pre, r), post));
        if (!bySig.has(key)) bySig.set(key, cased);
      }
    }
  }
  return { find: (s) => bySig.get(signature(s)) ?? null };
}

/**
 * Chains lookups: returns the first that recognizes the state. Used by ZBLL to
 * fall through to PLL for the corners-already-solved case, which the 472-case
 * ZBLL set deliberately does not duplicate (see /DESIGN.md, SPEC ZBLL).
 */
export function fallThrough(...lookups: CaseLookup[]): CaseLookup {
  return {
    find(s) {
      for (const l of lookups) {
        const hit = l.find(s);
        if (hit) return hit;
      }
      return null;
    },
  };
}
