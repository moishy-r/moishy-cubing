// Cubie-level cube state: the source of truth for a cube's configuration.
//
// State is stored as permutation + orientation vectors for corners and edges,
// plus a center permutation (see /DESIGN.md, "Cube representation"). Facelet /
// sticker arrays are a derived *view* produced only for rendering — see
// {@link toFacelets} — never the source of truth.
//
// Centers are tracked as a 6-element permutation. They carry no orientation
// (a solid-color center looks the same in all four rotations), but their
// *position* must be tracked so that whole-cube rotations (`x`/`y`/`z`) and
// wide turns project to a correct picture. On a fixed-center puzzle they would
// be redundant; here the move set includes rotations, so they are not.
//
// Piece indexing follows the widely-used Kociemba convention:
//   corners: URF UFL ULB UBR DFR DLF DBL DRB          (0..7)
//   edges:   UR UF UL UB DR DF DL DB FR FL BL BR       (0..11)
//   centers: U R F D L B                                (0..5)
//
// Corner orientation is 0/1/2 (CW twists), edge orientation is 0/1 (flip).
//
// The per-move tables below are machine-generated from a 3D-geometry model and
// validated: the six face tables reproduce the published Kociemba tables
// exactly, every family satisfies `move^4 = identity`, whole-cube rotations
// project to the expected re-coloring, the standard slice/wide/rotation
// identities hold (`r = R M'`, `x = R M' L'`, ...), and the superflip algorithm
// flips all twelve edges in place. See the notation package's tests and the
// cube-state tests for these checks.

import { type Move, type MoveFamily, parseAlg } from "./notation.ts";

/**
 * A cube configuration as cubie permutation + orientation vectors.
 *
 * All arrays are indexed by *position*: `cp[i]` is the corner cubie currently
 * in corner slot `i`, `co[i]` its orientation, and likewise for edges (`ep` /
 * `eo`) and centers (`cn`, no orientation).
 */
export interface CubeState {
  /** Corner permutation: cubie in each of the 8 corner slots. */
  cp: number[];
  /** Corner orientation (0/1/2) per slot. */
  co: number[];
  /** Edge permutation: cubie in each of the 12 edge slots. */
  ep: number[];
  /** Edge orientation (0/1) per slot. */
  eo: number[];
  /** Center permutation: center in each of the 6 face slots (U R F D L B). */
  cn: number[];
}

/** The solved cube. Frozen; use {@link solvedCube} for a mutable fresh copy. */
export const SOLVED: Readonly<CubeState> = Object.freeze({
  cp: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
  co: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  ep: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  eo: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  cn: Object.freeze([0, 1, 2, 3, 4, 5]),
}) as unknown as Readonly<CubeState>;

/** A fresh, mutable solved cube. */
export function solvedCube(): CubeState {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  };
}

/** Deep-copies a cube state. */
export function cloneState(s: CubeState): CubeState {
  return {
    cp: s.cp.slice(),
    co: s.co.slice(),
    ep: s.ep.slice(),
    eo: s.eo.slice(),
    cn: s.cn.slice(),
  };
}

/**
 * Quarter-turn (clockwise, `amount === 1`) transform for each move family,
 * expressed in the same cubie layout as {@link CubeState}. Machine-generated
 * and validated — see the module header.
 */
const QUARTER_TURN: Record<MoveFamily, CubeState> = {
  R: {
    cp: [4, 1, 2, 0, 7, 5, 6, 3],
    co: [2, 0, 0, 1, 1, 0, 0, 2],
    ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  },
  L: {
    cp: [0, 2, 6, 3, 4, 1, 5, 7],
    co: [0, 1, 2, 0, 0, 2, 1, 0],
    ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  },
  U: {
    cp: [3, 0, 1, 2, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  },
  D: {
    cp: [0, 1, 2, 3, 5, 6, 7, 4],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  },
  F: {
    cp: [1, 5, 2, 3, 0, 4, 6, 7],
    co: [1, 2, 0, 0, 2, 1, 0, 0],
    ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11],
    eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
    cn: [0, 1, 2, 3, 4, 5],
  },
  B: {
    cp: [0, 1, 3, 7, 4, 5, 2, 6],
    co: [0, 0, 1, 2, 0, 0, 2, 1],
    ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7],
    eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
    cn: [0, 1, 2, 3, 4, 5],
  },
  M: {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 3, 2, 7, 4, 1, 6, 5, 8, 9, 10, 11],
    eo: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    cn: [5, 1, 0, 2, 4, 3],
  },
  E: {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 8],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    cn: [0, 2, 4, 3, 5, 1],
  },
  S: {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [2, 1, 6, 3, 0, 5, 4, 7, 8, 9, 10, 11],
    eo: [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    cn: [4, 0, 2, 1, 3, 5],
  },
  r: {
    cp: [4, 1, 2, 0, 7, 5, 6, 3],
    co: [2, 0, 0, 1, 1, 0, 0, 2],
    ep: [8, 5, 2, 1, 11, 7, 6, 3, 4, 9, 10, 0],
    eo: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    cn: [2, 1, 3, 5, 4, 0],
  },
  l: {
    cp: [0, 2, 6, 3, 4, 1, 5, 7],
    co: [0, 1, 2, 0, 0, 2, 1, 0],
    ep: [0, 3, 10, 7, 4, 1, 9, 5, 8, 2, 6, 11],
    eo: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    cn: [5, 1, 0, 2, 4, 3],
  },
  u: {
    cp: [3, 0, 1, 2, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [3, 0, 1, 2, 4, 5, 6, 7, 11, 8, 9, 10],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    cn: [0, 5, 1, 3, 2, 4],
  },
  d: {
    cp: [0, 1, 2, 3, 5, 6, 7, 4],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 5, 6, 7, 4, 9, 10, 11, 8],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    cn: [0, 2, 4, 3, 5, 1],
  },
  f: {
    cp: [1, 5, 2, 3, 0, 4, 6, 7],
    co: [1, 2, 0, 0, 2, 1, 0, 0],
    ep: [2, 9, 6, 3, 0, 8, 4, 7, 1, 5, 10, 11],
    eo: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0],
    cn: [4, 0, 2, 1, 3, 5],
  },
  b: {
    cp: [0, 1, 3, 7, 4, 5, 2, 6],
    co: [0, 0, 1, 2, 0, 0, 2, 1],
    ep: [4, 1, 0, 11, 6, 5, 2, 10, 8, 9, 3, 7],
    eo: [1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1],
    cn: [1, 3, 2, 4, 0, 5],
  },
  x: {
    cp: [4, 5, 1, 0, 7, 6, 2, 3],
    co: [2, 1, 2, 1, 1, 2, 1, 2],
    ep: [8, 5, 9, 1, 11, 7, 10, 3, 4, 6, 2, 0],
    eo: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    cn: [2, 1, 3, 5, 4, 0],
  },
  y: {
    cp: [3, 0, 1, 2, 7, 4, 5, 6],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [3, 0, 1, 2, 7, 4, 5, 6, 11, 8, 9, 10],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    cn: [0, 5, 1, 3, 2, 4],
  },
  z: {
    cp: [1, 5, 6, 2, 0, 4, 7, 3],
    co: [1, 2, 1, 2, 2, 1, 2, 1],
    ep: [2, 9, 6, 10, 0, 8, 4, 11, 1, 5, 7, 3],
    eo: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    cn: [4, 0, 2, 1, 3, 5],
  },
};

/**
 * Composes `m` after `s`: returns the state reached by applying transform `m`
 * to state `s`. Both are in the {@link CubeState} layout; a move's own table is
 * just the transform applied to the solved cube, and any state is itself a valid
 * transform — so this doubles as group multiplication of two cube states (used
 * e.g. to build the AUF-conjugate variants of a last-layer case).
 */
export function compose(s: CubeState, m: CubeState): CubeState {
  const cp = new Array(8), co = new Array(8);
  for (let i = 0; i < 8; i++) {
    cp[i] = s.cp[m.cp[i]];
    co[i] = (s.co[m.cp[i]] + m.co[i]) % 3;
  }
  const ep = new Array(12), eo = new Array(12);
  for (let i = 0; i < 12; i++) {
    ep[i] = s.ep[m.ep[i]];
    eo[i] = (s.eo[m.ep[i]] + m.eo[i]) % 2;
  }
  const cn = new Array(6);
  for (let i = 0; i < 6; i++) cn[i] = s.cn[m.cn[i]];
  return { cp, co, ep, eo, cn };
}

/** Applies a single {@link Move} to a state, returning a new state. */
export function applyMove(s: CubeState, move: Move): CubeState {
  const table = QUARTER_TURN[move.family];
  let result = compose(s, table);
  for (let i = 1; i < move.amount; i++) result = compose(result, table);
  return result;
}

/** Applies a sequence of moves in order, returning a new state. */
export function applyMoves(s: CubeState, moves: Move[]): CubeState {
  let result = s;
  for (const move of moves) result = applyMove(result, move);
  return result;
}

/**
 * Convenience: applies a notation string to a state (parses via `parseAlg`,
 * which throws on invalid notation). `applyAlg(solvedCube(), "R U R' U'")`.
 */
export function applyAlg(s: CubeState, alg: string): CubeState {
  return applyMoves(s, parseAlg(alg));
}

/** True iff the state is exactly solved (identity permutation and orientation). */
export function isSolved(s: CubeState): boolean {
  for (let i = 0; i < 8; i++) if (s.cp[i] !== i || s.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (s.ep[i] !== i || s.eo[i] !== 0) return false;
  for (let i = 0; i < 6; i++) if (s.cn[i] !== i) return false;
  return true;
}

/** Structural equality of two cube states. */
export function statesEqual(a: CubeState, b: CubeState): boolean {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < 12; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  for (let i = 0; i < 6; i++) if (a.cn[i] !== b.cn[i]) return false;
  return true;
}

// --- Facelet projection (derived view, for rendering) ---

// Facelet indices 0..53 in Kociemba URFDLB order: U 0-8, R 9-17, F 18-26,
// D 27-35, L 36-44, B 45-53; within a face, row-major reading order. The tables
// below list, per cubie slot, its facelet indices; slot 0 of each is the
// orientation-reference facelet (U/D for corners and U/D-or-F/B edges).
const CORNER_FACELET = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const EDGE_FACELET = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
const CENTER_FACELET = [4, 13, 22, 31, 40, 49];

const FACE_LETTERS = "URFDLB";

/**
 * Projects a cube state to a 54-character facelet string in Kociemba URFDLB
 * order (U 0-8, R 9-17, F 18-26, D 27-35, L 36-44, B 45-53; each face read
 * row-major). Each character is a face letter `U R F D L B` naming the color.
 * This is a derived rendering view, not the source of truth.
 */
export function toFacelets(s: CubeState): string {
  const f = new Array<string>(54);
  for (let p = 0; p < 6; p++) f[CENTER_FACELET[p]] = FACE_LETTERS[s.cn[p]];
  for (let p = 0; p < 8; p++) {
    const cubie = s.cp[p];
    for (let k = 0; k < 3; k++) {
      f[CORNER_FACELET[p][(k + s.co[p]) % 3]] =
        FACE_LETTERS[Math.floor(CORNER_FACELET[cubie][k] / 9)];
    }
  }
  for (let p = 0; p < 12; p++) {
    const cubie = s.ep[p];
    for (let k = 0; k < 2; k++) {
      f[EDGE_FACELET[p][(k + s.eo[p]) % 2]] = FACE_LETTERS[Math.floor(EDGE_FACELET[cubie][k] / 9)];
    }
  }
  return f.join("");
}
