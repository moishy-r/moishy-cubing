// The last layer: the goals, the recognition, and the steps every method shares.
//
// OLL is OLL and PLL is PLL whoever is solving them, and the fiddly part is not the
// data — it is the wiring. Each of these lookups exists because the algset's own
// default full-facelet signature does NOT match a live last layer:
//
//   * OLL/OCLL key on *orientation* only, since permutation is PLL's job;
//   * COLL keys on the *corners* only, since edge permutation is EPLL's job;
//   * every one of them is built with `aufInvariantLookup`, because a terminal step
//     needs recognition up to both pre- and post-AUF — a plain pre-AUF-only lookup
//     recognizes just the quarter of states that happen to need no post-AUF.
//
// Two sets are derived rather than authored: OCLL is the seven all-edges-oriented
// cases of OLL (21-27), and EPLL is the PLL cases whose corners are already solved.
//
// All goals are evaluated up to whole-cube rotation, so an alg that ends the cube
// tilted still counts as having done its job and the next step continues from that
// frame — see cubing-core's `runPhase`, which no longer re-homes between phases.

import { type AlgSet, aufInvariantLookup } from "@moishy/algsets";
import {
  applyMoves,
  type CaseLookup,
  cornerSignature,
  type CubeState,
  fallThrough,
  isSolved,
  type MethodDefinition,
  type Move,
  normalizeOrientation,
  orientationSignature,
  parseAlg,
  type Strategy,
} from "@moishy/cubing-core";

/** A core Step, as a method definition lists them. */
type Step = MethodDefinition["steps"][number];

/** The four AUF alignments, as move lists. */
const AUF4: Move[][] = [[], parseAlg("U"), parseAlg("U2"), parseAlg("U'")];

// --- Goals -------------------------------------------------------------------

/** Every corner oriented (up to whole-cube rotation). */
export const cornersOriented = (s: CubeState): boolean =>
  normalizeOrientation(s).co.every((o) => o === 0);

/** Every edge oriented (up to whole-cube rotation). */
export const edgesOriented = (s: CubeState): boolean =>
  normalizeOrientation(s).eo.every((o) => o === 0);

/** The whole last layer oriented — OLL's goal. */
export const llOriented = (s: CubeState): boolean => cornersOriented(s) && edgesOriented(s);

/** Every corner permuted *and* oriented — COLL's goal. */
export const cornersSolved = (s: CubeState): boolean => {
  const n = normalizeOrientation(s);
  return n.cp.every((c, i) => c === i && n.co[i] === 0);
};

/**
 * Corners solved **up to AUF** — the correct test for "is this an EPLL case?".
 *
 * A case's recognition state carries whatever net U-rotation its alg leaves on the
 * corners. Every alg of the Z perm is M-slice based and leaves the corners solved up
 * to a U2, so the strict test rejected it and left the EPLL filter with 3 of its 4
 * cases — making a Z-perm last layer unsolvable. Folding AUF in is exactly right:
 * recognition is AUF-invariant, so corners solved up to a U turn *are* solved. It
 * still rejects the genuine corner-permuting PLLs.
 */
export const cornersSolvedUpToAUF = (s: CubeState): boolean =>
  AUF4.some((u) => cornersSolved(applyMoves(s, u)));

// --- Lookups ------------------------------------------------------------------

/** Full OLL, keyed on last-layer orientation. */
export function ollLookup(oll: AlgSet): CaseLookup {
  return aufInvariantLookup(oll, orientationSignature());
}

/** PLL, keyed on the set's own signature. Terminal, so both-AUF. */
export function pllLookup(pll: AlgSet): CaseLookup {
  return aufInvariantLookup(pll, pll.signature);
}

/** The OLL case ids that orient the corners with the edges already oriented. */
const OCLL_IDS = new Set([
  "oll-21",
  "oll-22",
  "oll-23",
  "oll-24",
  "oll-25",
  "oll-26",
  "oll-27",
]);

/** OCLL — the seven all-edges-oriented OLL cases, reused rather than re-authored. */
export function ocllLookup(oll: AlgSet): CaseLookup {
  return aufInvariantLookup(oll, orientationSignature(), (c) => OCLL_IDS.has(c.id));
}

/** EPLL — the PLL cases whose corners are already solved (Ua/Ub/Z/H). */
export function epllLookup(pll: AlgSet): CaseLookup {
  return aufInvariantLookup(
    pll,
    pll.signature,
    (c) => cornersSolvedUpToAUF(pll.recognitionState(c.id)),
  );
}

/**
 * COLL, keyed on the corners only, with two fall-throughs the set itself cannot cover.
 *
 * The `coll` set is faithful to its source: its cases are grouped by the seven OCLL
 * orientation shapes, so it has no case for a last layer whose corners are already
 * *oriented but permuted* — those are corner PLLs. Since the phase's goal is
 * `cornersSolved`, it must handle them anyway, so the corner-permuting PLLs are
 * filtered in as the exact complement of the EPLL filter. Keying on corners ignores
 * the edges they also move, which is fine: a corner-solving alg necessarily leaves an
 * even edge permutation, i.e. an EPLL case for the following phase.
 *
 * Last comes the COLL *skip*: corners already solved up to a U turn need no alg at
 * all. Rare (4 of 648 corner states) but reachable, and without it a forced COLL+EPLL
 * would hard-error rather than emit nothing.
 */
export function collLookup(coll: AlgSet, pll: AlgSet): CaseLookup {
  const cornersAlreadySolved: CaseLookup = {
    find: (s) => cornersSolvedUpToAUF(s) ? { id: "coll-skip", algs: [{ moves: [] }] } : null,
  };
  return fallThrough(
    aufInvariantLookup(coll, cornerSignature()),
    aufInvariantLookup(
      pll,
      cornerSignature(),
      (c) => !cornersSolvedUpToAUF(pll.recognitionState(c.id)),
    ),
    cornersAlreadySolved,
  );
}

// --- Steps and strategies -----------------------------------------------------

/** Full OLL as a step: orient the last layer in one alg. */
export function ollStep(oll: AlgSet, opts: { id?: string; label?: string } = {}): Step {
  const id = opts.id ?? "oll";
  return {
    id,
    label: opts.label ?? "OLL",
    strategies: [{
      id,
      phases: [{ kind: "algorithmic", id, goal: llOriented, cases: ollLookup(oll), auf: ["U"] }],
    }],
  };
}

/** PLL as a step: permute the last layer, finishing the solve. */
export function pllStep(pll: AlgSet, opts: { id?: string; label?: string } = {}): Step {
  const id = opts.id ?? "pll";
  return {
    id,
    label: opts.label ?? "PLL",
    strategies: [{
      id,
      phases: [{ kind: "algorithmic", id, goal: isSolved, cases: pllLookup(pll), auf: ["U"] }],
    }],
  };
}

/**
 * OCLL + PLL as one strategy — the two-look last layer for someone who does not know
 * full OLL. Lookahead across `ocll -> pll` picks the OCLL variant that sets up the
 * cheaper PLL.
 */
export function ocllPllStrategy(oll: AlgSet, pll: AlgSet, id = "ocllPll"): Strategy {
  return {
    id,
    label: "OCLL + PLL",
    phases: [
      {
        kind: "algorithmic",
        id: "ocll",
        goal: cornersOriented,
        cases: ocllLookup(oll),
        auf: ["U"],
      },
      { kind: "algorithmic", id: "pll", goal: isSolved, cases: pllLookup(pll), auf: ["U"] },
    ],
  };
}

/** COLL + EPLL as one strategy: solve the corners outright, then permute the edges. */
export function collEpllStrategy(coll: AlgSet, pll: AlgSet, id = "collEpll"): Strategy {
  return {
    id,
    label: "COLL + EPLL",
    phases: [
      {
        kind: "algorithmic",
        id: "coll",
        goal: cornersSolved,
        cases: collLookup(coll, pll),
        auf: ["U"],
      },
      { kind: "algorithmic", id: "epll", goal: isSolved, cases: epllLookup(pll), auf: ["U"] },
    ],
  };
}

/** OLL + PLL as one strategy — for a method wanting both in a single unit. */
export function ollPllStrategy(oll: AlgSet, pll: AlgSet, id = "ollPll"): Strategy {
  return {
    id,
    label: "OLL + PLL",
    phases: [
      { kind: "algorithmic", id: "oll", goal: llOriented, cases: ollLookup(oll), auf: ["U"] },
      { kind: "algorithmic", id: "pll", goal: isSolved, cases: pllLookup(pll), auf: ["U"] },
    ],
  };
}
