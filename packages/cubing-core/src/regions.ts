// Piece regions: the geometry a method's Steps are defined against.
//
// A Step rarely cares about the whole cube — it places a few pieces and leaves
// the rest scrambled. These are the pieces of that idea, all method-agnostic:
// which slots a Step must fill ({@link PieceRegion}), whether they are filled
// ({@link regionSolved} and friends), how to project a state down to just the
// part a Step recognizes on ({@link pieceSignature} and the other signatures),
// and how to key a search over one region ({@link regionCoordinate},
// {@link axisCanonical}).
//
// Piece indexing is Kociemba's (see cube-state.ts):
//   corners: URF0 UFL1 ULB2 UBR3 DFR4 DLF5 DBL6 DRB7
//   edges:   UR0 UF1 UL2 UB3 DR4 DF5 DL6 DB7 FR8 FL9 BL10 BR11
//
// A method names its own regions over these indices — see `@moishy/apb`'s
// `BLOCK223`, `AFTER_BR`, `F2L` for a worked set. Nothing here assumes any
// particular method, layer, or solving order.

import { type CubeState, normalizeOrientation } from "./cube-state.ts";
import type { Move, MoveFamily } from "./notation.ts";

// --- Goal predicates ---------------------------------------------------------

/**
 * A set of cube pieces: which corner and edge *slots* must hold their home cubie,
 * oriented. Named `PieceRegion` rather than `Region` because `@moishy/cubing-core`
 * exports an unrelated `Region` (a `[fromStepId, toStepId]` step range for
 * Replacements), and a method module imports from both.
 */
export interface PieceRegion {
  corners: readonly number[];
  edges: readonly number[];
}

/** True iff the centers are home — the fixed reference frame is intact. */
export function centersSolved(s: CubeState): boolean {
  for (let i = 0; i < 6; i++) if (s.cn[i] !== i) return false;
  return true;
}

/**
 * True iff every slot in `region` holds its home cubie, correctly oriented —
 * evaluated **up to whole-cube rotation** ({@link normalizeOrientation}).
 *
 * The rotation-normalization is what keeps this both correct and frame-safe. It
 * accepts a region that is solved but held in a rotated frame (a rotation-
 * containing alg, or a rotation-heavy method), which the old absolute `cn`-home
 * check wrongly rejected. But it still rejects slice/wide *center drift* (e.g. an
 * M-slice DF/DB alg): there the pieces did not rotate together with the centers,
 * so normalizing the centers leaves the region's pieces off their home slots.
 * Every step therefore still has to net-preserve the colors, not just the slots.
 */
export function regionSolved(region: PieceRegion): (s: CubeState) => boolean {
  return (s) => {
    const n = normalizeOrientation(s);
    return region.corners.every((i) => n.cp[i] === i && n.co[i] === 0) &&
      region.edges.every((i) => n.ep[i] === i && n.eo[i] === 0);
  };
}

/** True iff `region` is solved *and* all 12 edges are oriented (EO's goal). */
export function regionSolvedAndEO(region: PieceRegion): (s: CubeState) => boolean {
  const solved = regionSolved(region);
  return (s) => solved(s) && normalizeOrientation(s).eo.every((o) => o === 0);
}

/**
 * Strict, fixed-frame region goal: pieces home AND centers home (no rotation
 * tolerance). Used by the block-building *search*, which explores slice/wide
 * moves (they drift centers) under a heuristic built for the home frame — so its
 * goal must be the home frame, or the heuristic becomes inadmissible and A*
 * loses its cost-ordering. Everywhere else the rotation-invariant
 * {@link regionSolved} is correct; APB's block step is intentionally fixed-frame.
 */
export function regionSolvedStrict(region: PieceRegion): (s: CubeState) => boolean {
  return (s) =>
    centersSolved(s) &&
    region.corners.every((i) => s.cp[i] === i && s.co[i] === 0) &&
    region.edges.every((i) => s.ep[i] === i && s.eo[i] === 0);
}

/**
 * Fixed-frame region goal with L–R-axis center *drift* allowed: pieces home in
 * the raw frame, the L and R centers home, but the U/F/D/B centers left wherever
 * the block-building slice/wide moves put them.
 *
 * This is the goal for the Roux FB (`fbDfdb`'s `rouxFB` phase). A Roux FB solves
 * its 6 pieces *including the L center*; requiring only L (index 4) and R (index
 * 1) home — not all six centers as {@link regionSolvedStrict} does — lets the FB
 * be built the cheap, natural way (M-slice/wide moves that leave U/F/D/B drifted)
 * instead of spending moves restoring those centers. Because L and R are home,
 * the residual center permutation is necessarily a rotation about the L–R axis
 * (one of `{id, x, x2, x'}`), which the *following* DFDB alg restores in place
 * (its M/r moves cycle exactly U/F/D/B and never touch FB pieces). The block
 * itself stays physically at bottom-left — no whole-cube reframe.
 *
 * The pruning heuristic for this goal must be rotation-folded over those 4 center
 * states to stay admissible (see `regionHeuristic` in pruning.ts); the strict,
 * all-centers-home table would over-count the U/F/D/B fix the goal does not require.
 */
export function regionSolvedLRHome(region: PieceRegion): (s: CubeState) => boolean {
  return (s) =>
    s.cn[4] === 4 && s.cn[1] === 1 && // L, R centers home ⇒ drift is L–R-axis only
    region.corners.every((i) => s.cp[i] === i && s.co[i] === 0) &&
    region.edges.every((i) => s.ep[i] === i && s.eo[i] === 0);
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
 *
 * The key is a *number*, packed as mixed radix — 24 per tracked piece (slot ×
 * orientation), 36 for the centers, 19 for the last-move family — not a string.
 * A* evaluates this for every generated child (tens of millions in a deep block
 * search), and the string form's allocation and hashing measured as the single
 * largest per-node cost; the packed integer partitions states identically and is
 * ~10x cheaper (0.40µs -> 0.04µs on the 2x2x3 region).
 */
export function regionCoordinate(region: PieceRegion): (s: CubeState, last: Move | null) => number {
  const corners = new Int8Array(region.corners);
  const edges = new Int8Array(region.edges);
  // Guard the packing: each piece contributes a factor of 24, the centers 36 and
  // the last-move family FAMILY_RADIX. Beyond ~9 tracked pieces the product leaves
  // float64's exact-integer range and distinct states would silently collide.
  const span = 24 ** (corners.length + edges.length) * 36 * FAMILY_RADIX;
  if (!Number.isSafeInteger(span)) {
    throw new Error(
      `regionCoordinate: ${corners.length + edges.length} tracked pieces overflow the packed key`,
    );
  }
  const invCp = new Int8Array(8), invEp = new Int8Array(12);
  return (s, last) => {
    const cp = s.cp, ep = s.ep;
    for (let i = 0; i < 8; i++) invCp[cp[i]] = i;
    for (let i = 0; i < 12; i++) invEp[ep[i]] = i;
    let key = 0;
    for (let i = 0; i < corners.length; i++) {
      const slot = invCp[corners[i]];
      key = key * 24 + slot * 3 + s.co[slot];
    }
    for (let i = 0; i < edges.length; i++) {
      const slot = invEp[edges[i]];
      key = key * 24 + slot * 2 + s.eo[slot];
    }
    // A center permutation is a whole-cube rotation, so the images of U and R pin
    // it (see pruning.ts's center coordinate).
    key = key * 36 + s.cn[0] * 6 + s.cn[1];
    return key * FAMILY_RADIX + (last === null ? 0 : FAMILY_INDEX[last.family]);
  };
}

// Every family gets a distinct 1-based digit (0 means "no previous move", i.e. the
// search root), so no two last-move families can ever alias.
const FAMILY_INDEX: Record<MoveFamily, number> = {
  R: 1,
  L: 2,
  U: 3,
  D: 4,
  F: 5,
  B: 6,
  M: 7,
  E: 8,
  S: 9,
  r: 10,
  l: 11,
  u: 12,
  d: 13,
  f: 14,
  b: 15,
  x: 16,
  y: 17,
  z: 18,
};
const FAMILY_RADIX = 19;

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
 * EO recognition: which of the given EO *slots* hold a misoriented edge. Which
 * slots those are is the method's business — APB orients the four U-layer edges
 * plus FR and DR; a method with a different last slot names a different six.
 * Slot-based
 * (not cubie-based) so that a `U` pre-AUF rotates the pattern — the U-layer
 * slots {UR,UF,UL,UB} permute under U — letting `runPhase` align a live state to
 * the one AUF-representative the algset stores (EO is otherwise 4x-redundant).
 */
export function eoSignature(slots: readonly number[]): (s: CubeState) => string {
  return (s) => slots.map((slot) => s.eo[slot]).join("");
}

/**
 * Orientation-only recognition: every piece's orientation, by slot, ignoring
 * permutation entirely. The recognition key for an *orientation* step (OLL /
 * OCLL): two states are the same case iff their corner+edge orientation patterns
 * match, regardless of how the last layer is permuted. Slot-based like
 * {@link eoSignature}, so AUF rotates the pattern and the coset builders /
 * `runPhase` align a live state to the stored representative. (A plain
 * whole-facelet signature would additionally pin the permutation — the bug that
 * kept OLL/OCLL from recognizing any real solve's last layer.)
 */
export function orientationSignature(): (s: CubeState) => string {
  return (s) => `${s.co.join("")}|${s.eo.join("")}`;
}

/**
 * Corner-only recognition: corner orientation + corner permutation, ignoring
 * every edge. The recognition key for COLL, which fixes the last-layer corners
 * (orientation *and* permutation) while leaving edge permutation to EPLL — so two
 * states are the same COLL case iff their corner states match, whatever the edges
 * are doing. Slot-based, so AUF is handled upstream.
 */
export function cornerSignature(): (s: CubeState) => string {
  return (s) => `${s.co.join("")}|${s.cp.join("")}`;
}
