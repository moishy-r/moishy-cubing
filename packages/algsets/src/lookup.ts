// AlgSet -> CaseLookup adapters: the bridge between stored case data and the
// recognition a Step performs.
//
// An algset stores only algs, and derives each case's recognition state by
// inverting its primary. A Step, though, recognizes on a *projection* of the cube
// — the pieces it places, an orientation pattern, a corner state — because
// everything around them is still scrambled. These builders key an AlgSet's cases
// by whatever signature the Step recognizes on (see `@moishy/cubing-core`'s
// `pieceSignature`, `orientationSignature`, `cornerSignature`) and hand back a
// `CaseLookup` that drops straight into an `AlgorithmicPhase`.
//
// They live here rather than in cubing-core because they take an `AlgSet`, and
// this package owns that type; cubing-core cannot depend on it without a cycle.

import {
  type AlgCase,
  applyMoves,
  type CaseLookup,
  compose,
  type CubeState,
  type Move,
  normalizeOrientation,
  solvedCube,
} from "@moishy/cubing-core";
import type { AlgSet } from "./define.ts";

// --- CaseLookup builders ------------------------------------------------------

/**
 * Builds a {@link CaseLookup} over an {@link AlgSet}'s cases keyed by a custom
 * `signature` (rather than the algset's own full-facelet default) — the bridge
 * that lets a whole-cube algset recognize on just a region. First-defined case
 * wins a signature (collisions are a data bug, surfaced by the algset's tests).
 *
 * Recognition is rotation-invariant: both the stored recognition state and the
 * queried state are normalized to the home frame ({@link normalizeOrientation})
 * before the signature is taken, so a case whose alg contains a whole-cube
 * rotation is still recognized, and a live state reached in a rotated frame
 * matches the same case. (For the rotation-free core sets this is a no-op.)
 */
export function regionLookup(
  algSet: AlgSet,
  signature: (s: CubeState) => string,
  caseFilter?: (c: AlgSet["cases"][number]) => boolean,
): CaseLookup {
  const sig = (s: CubeState) => signature(normalizeOrientation(s));
  const bySig = new Map<string, AlgCase>();
  for (const c of algSet.cases) {
    if (caseFilter && !caseFilter(c)) continue;
    const key = sig(algSet.recognitionState(c.id));
    if (!bySig.has(key)) bySig.set(key, c);
  }
  return { find: (s) => bySig.get(sig(s)) ?? null };
}

/**
 * Like {@link regionLookup} but **raw** — it does *not* normalize orientation, so
 * the signature sees the actual center permutation. Required by DFDB under the
 * drift-allowing FB (see {@link regionSolvedLRHome}): the FB leaves U/F/D/B
 * centers drifted, and which DFDB case applies depends on that drift, not only on
 * where DF/DB sit relative to the block. `regionLookup` would `normalizeOrientation`
 * the drift away, collapsing cases that share a block-relative DF/DB placement but
 * need different center corrections onto one key. The signature passed here must
 * therefore *include* the center state (e.g. `s.cn`), and it is taken verbatim on
 * both the stored recognition state and the queried state.
 *
 * Safe for DFDB because its algs contain no whole-cube rotations, so each stored
 * `recognitionState = applyMoves(solved, invert(algs[0]))` is already a valid raw,
 * fixed-frame key. Do NOT use this for sets whose primaries end tilted.
 */
export function regionLookupRaw(
  algSet: AlgSet,
  signature: (s: CubeState) => string,
  caseFilter?: (c: AlgSet["cases"][number]) => boolean,
): CaseLookup {
  const bySig = new Map<string, AlgCase>();
  for (const c of algSet.cases) {
    if (caseFilter && !caseFilter(c)) continue;
    const key = signature(algSet.recognitionState(c.id));
    if (!bySig.has(key)) bySig.set(key, c);
  }
  return { find: (s) => bySig.get(signature(s)) ?? null };
}

// The four AUF states (identity, U, U2, U') as cube states, for building the
// two-sided U-coset of a last-layer case (see {@link aufInvariantLookup}).
const U_STATES: CubeState[] = [0, 1, 2, 3].map((amount) =>
  amount === 0 ? solvedCube() : applyMoves(solvedCube(), [{ family: "U", amount } as Move])
);

/**
 * Like {@link regionLookup}, but indexes each case under **both** pre- and
 * post-AUF (a two-sided U-coset). Recognition is rotation-invariant, so algs are
 * used verbatim (see the tail of this comment).
 *
 * Why both-AUF is *needed* for a terminal step. `runPhase` already tries every pre-AUF (a U turn
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
 * Recognition is rotation-invariant (both sides normalized via
 * {@link normalizeOrientation}), so algs are used **verbatim** — a case whose
 * primary contains a whole-cube rotation is recognized here, and `runPhase`
 * applies that alg as-is (the cube ends solved up to rotation, which the
 * rotation-invariant goal accepts). No de-rotation / move rewriting.
 */
export function aufInvariantLookup(
  algSet: AlgSet,
  signature: (s: CubeState) => string,
  caseFilter?: (c: AlgSet["cases"][number]) => boolean,
): CaseLookup {
  const sig = (s: CubeState) => signature(normalizeOrientation(s));
  const bySig = new Map<string, AlgCase>();
  for (const c of algSet.cases) {
    if (caseFilter && !caseFilter(c)) continue;
    // Ask the set for the case's state rather than re-deriving it. Recomputing
    // `solved . invert(algs[0])` here silently reintroduced the bug `defineAlgSet` was
    // fixed for: an alg carrying a net whole-cube rotation solves its case into the
    // ROTATED frame, so that formula yields a state for a different case entirely. This
    // lookup then indexed rotated-primary cases under the wrong key, and 24 zbls cases
    // could not be found by the very lookup built from them.
    const r = algSet.recognitionState(c.id);
    for (const pre of U_STATES) {
      for (const post of U_STATES) {
        const key = sig(compose(compose(pre, r), post));
        if (!bySig.has(key)) bySig.set(key, c);
      }
    }
  }
  return { find: (s) => bySig.get(sig(s)) ?? null };
}
