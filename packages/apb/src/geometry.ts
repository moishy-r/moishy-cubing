// APB geometry: the piece groups its Steps target, and the recognition
// signatures those Steps key on.
//
// The generic half of this file now lives in `@moishy/cubing-core` — goal
// predicates, `pieceSignature`/`orientationSignature`/`cornerSignature`,
// `regionCoordinate`, `axisCanonical` — and the AlgSet -> CaseLookup adapters in
// `@moishy/algsets`. What is left is the part that is genuinely APB's: which
// cubies each of its Steps places, and the two- or three-line compositions of the
// generic signature primitives that each Step recognizes on. A different method
// names different groups and composes different signatures; it reuses the
// primitives, not these.
//
// Piece indexing is Kociemba's (see cubing-core cube-state.ts):
//   corners: URF0 UFL1 ULB2 UBR3 DFR4 DLF5 DBL6 DRB7
//   edges:   UR0 UF1 UL2 UB3 DR4 DF5 DL6 DB7 FR8 FL9 BL10 BR11
//
// APB is solved bottom-left, fixed frame (color neutrality is handled upstream
// by the runner's commit-early rotation choice), so these indices are constant.

import { type CubeState, orientationSignature, pieceSignature } from "@moishy/cubing-core";

// --- Piece groups (Kociemba indices) ----------------------------------------

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

// --- Recognition signatures ---------------------------------------------------

// The six edge slots EODR works on: UR, UF, UL, UB (U-layer), FR (E-slice), DR.
const EODR_EDGE_SLOTS = [0, 1, 2, 3, 8, 4] as const;

/**
 * EODR recognition: the orientation of the edge *in each* of the six EODR slots,
 * plus which slot currently holds the DR edge (cubie 4). EODR orients those six
 * edges and *places DR*, but does NOT fix the permutation of the U-layer edges or
 * FR (that is left for LXS/ZBLL) — so recognition keys on orientation-by-slot
 * (the U edges are interchangeable) + the DR location it must route, and nothing
 * else. Keying on the U-edge/FR *positions* (as a plain `pieceSignature` over the
 * six cubies does) over-constrains: it pins a permutation EODR never fixes, so a
 * live state almost never matched one of the 55 stored cases. Slot-based, so AUF
 * is handled upstream. Verified: distinct across all 55 cases, and every reachable
 * post-brPair EODR state is covered.
 */
export function eodrSignature(): (s: CubeState) => string {
  return (s) => `${EODR_EDGE_SLOTS.map((slot) => s.eo[slot]).join("")}|dr${s.ep.indexOf(4)}`;
}

/**
 * ZBLS recognition: the last-slot pair — DFR corner (4) + FR edge (8),
 * location + orientation — plus the edge-orientation pattern (by slot). ZBLS
 * solves the last F2L slot while orienting all edges, landing ZBLL-ready; it does
 * NOT fix the last-layer corner state or the U-edge permutation (ZBLL does), so
 * recognition must ignore those — keying on the algset's default full-facelet
 * signature pinned the last-layer permutation and almost never matched a live
 * state. Slot-based orientation, so AUF is handled upstream.
 */
export function zblsSignature(): (s: CubeState) => string {
  return (s) => `${pieceSignature([4], [8])(s)}/${s.eo.join("")}`;
}

/**
 * Winter/Summer-Variation recognition: taken mid-LXS, at the moment the last
 * F2L pair (DFR corner 4 + FR edge 8) is set up on top and about to be inserted.
 * WV/SV insert that pair *while orienting the last-layer corners* (edges already
 * oriented), landing at PLL. So recognition keys on the last-layer *orientation*
 * (corner + edge orientation, by slot — like OLL/OCLL) PLUS the last pair's
 * location + orientation (which distinguishes the pre-insert setups). It must NOT
 * pin the last-layer permutation (PLL fixes that), so the algset's default
 * full-facelet signature never matched an intermediate insert state. Slot-based
 * orientation, so AUF is handled upstream. Verified collision-free across all
 * wv + sv cases.
 */
export function wvSvSignature(): (s: CubeState) => string {
  return (s) => `${orientationSignature()(s)}/${pieceSignature([4], [8])(s)}`;
}
