// PLL — algorithm case data for @moishy/algsets.
//
// Transformed from old/pll.ts via scripts/transform_old_algsets.ts.
// Every source alg is kept as an interchangeable variant; recognition is
// derived from the primary (first) alg of each case. See /DESIGN.md.

import { type AlgSet, defineAlgSet } from "../define.ts";

export const pll: AlgSet = defineAlgSet({
  id: "pll",
  name: "PLL",
  cases: [
    {
      id: "aa",
      name: "Aa Permutation",
      subset: "edge-swap",
      algs: [
        { alg: "x R2' D2' R U R' D2' R U' R x'", source: "SpeedCubeDB" },
        { alg: "x R' U R' D2 R U' R' D2 R2 x'", source: "SpeedCubeDB" },
        { alg: "U' x L2 D2 L' U' L D2 L' U L'", source: "SpeedCubeDB" },
        { alg: "U x' R2 D2 R' U' R D2 R' U R' x", source: "SpeedCubeDB" },
        { alg: "l' U R' D2 R U' R' D2 R2 x'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "ab",
      name: "Ab Permutation",
      subset: "edge-swap",
      algs: [
        { alg: "x R' U R' D2' R U' R' D2' R2' x'", source: "SpeedCubeDB" },
        { alg: "x R2 D2 R U R' D2 R U' R x'", source: "SpeedCubeDB" },
        { alg: "U' x L U' L D2 L' U L D2 L2", source: "SpeedCubeDB" },
        { alg: "U x' R U' R D2 R' U R D2 R2 x", source: "SpeedCubeDB" },
        { alg: "R' B' R U' R D R' U R D' R2 B R", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "e",
      name: "E Permutation",
      subset: "edge-swap",
      algs: [
        { alg: "x' D R U R' D' R U' R' D R U' R' D' R U R' x", source: "SpeedCubeDB" },
        { alg: "U x' R U' R' D R U R' D' R U R' D R U' R' D' x", source: "SpeedCubeDB" },
        { alg: "U R' U' R' D' R U' R' D R U R' D' R U R' D R2", source: "SpeedCubeDB" },
        { alg: "R2 U F' R' U R U' R' U R U' R' U R U' F U' R2", source: "SpeedCubeDB" },
        { alg: "U x' L' U L D' L' U' L D L' U' L D' L' U L D", source: "SpeedCubeDB" },
        { alg: "R' U' R U' R' U R U R2' F' R U R U' R' F U R", source: "SpeedCubeDB" },
        { alg: "U R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", source: "SpeedCubeDB" },
        { alg: "U R' F R f' R' F R2 U R' U' R' F' R2 U R' S", source: "SpeedCubeDB" },
        { alg: "R' U R U' R2 F' U' F U R F R' F' R2", source: "SpeedCubeDB" },
        { alg: "U R2 F R F' R' U' F' U F R2 U R' U' R", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "f",
      name: "F Permutation",
      subset: "adjacent-swap",
      // NOTE: the SpeedCubeDB export's primary alg for this case was
      // "R2 F R F' R U2 R' U R U2 R'" — an OLL alg that disturbs the D-layer and
      // edge orientation, i.e. not an F-perm at all. Because recognition is
      // derived from algs[0], that corrupt primary made the F-perm case
      // unrecognizable (its whole two-sided-AUF orbit went uncovered). Dropped;
      // the real F-perm below is now primary.
      algs: [{
        alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
        source: "SpeedCubeDB",
      }, { alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' F'", source: "SpeedCubeDB" }],
    },
    {
      id: "ga",
      name: "Ga Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R' U' R D' U R2' U R' U R U' R U' R2' D", source: "SpeedCubeDB" },
        { alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'", source: "SpeedCubeDB" },
        { alg: "R2 u R' U R' U' R u' R2 F' U F", source: "SpeedCubeDB" },
        {
          alg: "U R U R' F' R U R' U' R' F R U' R' F R2 U' R' U' R U R' F'",
          source: "SpeedCubeDB",
        },
        { alg: "D' R2 U R' U R' U' R U' R2 U' D R' U R", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "gb",
      name: "Gb Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R2' U R' U R' U' R U' R2' D U' R' U R D'", source: "SpeedCubeDB" },
        { alg: "R' U' R U D' R2 U R' U R U' R U' R2 D", source: "SpeedCubeDB" },
        { alg: "D R' U' R U D' R2 U R' U R U' R U' R2", source: "SpeedCubeDB" },
        { alg: "U F' U' F R2 u R' U R U' R u' R2", source: "SpeedCubeDB" },
        { alg: "R' d' F R2 u R' U R U' R u' R2", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "gc",
      name: "Gc Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "D' R U R' U' D R2' U' R U' R' U R' U R2'", source: "SpeedCubeDB" },
        { alg: "R2 U' R U' R U R' U R2 D' U R U' R' D", source: "SpeedCubeDB" },
        { alg: "U2 R2 F2 R U2 R U2 R' F R U R' U' R' F R2", source: "SpeedCubeDB" },
        { alg: "D R2 U' R U' R U R' U R2 D' U R U' R'", source: "SpeedCubeDB" },
        { alg: "R2 u' R U' R U R' u R2 f R' f'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "gd",
      name: "Gd Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R2' U' R U' R U R' U R2' D' U R U' R' D", source: "SpeedCubeDB" },
        { alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'", source: "SpeedCubeDB" },
        { alg: "D' R U R' U' D R2 U' R U' R' U R' U R2", source: "SpeedCubeDB" },
        { alg: "R U R' y' R2 u' R U' R' U R' u R2", source: "SpeedCubeDB" },
        { alg: "U R2 F' R U R U' R' F' R U2 R' U2 R' F2 R2", source: "SpeedCubeDB" },
        { alg: "M2' U' M2' U2' M2' U' M2'", source: "SpeedCubeDB" },
        { alg: "M2 U' M2 U2 M2 U' M2", source: "SpeedCubeDB" },
        { alg: "M2 U M2 U2 M2 U M2", source: "SpeedCubeDB" },
        { alg: "R2 S2 R2 U' R2 S2 R2", source: "SpeedCubeDB" },
        { alg: "M2 U2 M2 U M2 U2 M2", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "h",
      name: "H Permutation",
      subset: "epll",
      algs: [{ alg: "M2 U M2 U2 M2 U M2", source: "SpeedCubeDB" }, {
        alg: "M2' U M2' U2 M2' U M2'",
        source: "SpeedCubeDB",
      }, { alg: "M2 U' M2 U2 M2 U' M2", source: "SpeedCubeDB" }],
    },
    {
      id: "ja",
      name: "Ja Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "L' R' U2' R U R' U2' L U' R", source: "SpeedCubeDB" },
        { alg: "U R' U L' U2 R U' R' U2 R L", source: "SpeedCubeDB" },
        { alg: "U2 x R2 F R F' R U2 r' U r U2 x'", source: "SpeedCubeDB" },
        { alg: "L' U' L F L' U' L U L F' L2 U L", source: "SpeedCubeDB" },
        { alg: "R U' L' U R' U2 L U' L' U2 L", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "jb",
      name: "Jb Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R U R2' F' R U R U' R' F R U' R'", source: "SpeedCubeDB" },
        { alg: "R U R' F' R U R' U' R' F R2 U' R'", source: "SpeedCubeDB" },
        { alg: "R U2 R' U' R U2 L' U R' U' L", source: "SpeedCubeDB" },
        { alg: "r' F R F' r U2 R' U R U2 R'", source: "SpeedCubeDB" },
        { alg: "L' U R U' L U2 R' U R U2 R'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "na",
      name: "Na Permutation",
      subset: "diagonal-swap",
      algs: [
        { alg: "R U R' U2' R U R2' F' R U R U' R' F R U' R' U' R U' R'", source: "SpeedCubeDB" },
        { alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", source: "SpeedCubeDB" },
        { alg: "F' R U R' U' R' F R2 F U' R' U' R U F' R'", source: "SpeedCubeDB" },
        { alg: "R F U' R' U R U F' R2 F' R U R U' R' F", source: "SpeedCubeDB" },
        { alg: "r' D r U2 r' D r U2 r' D r U2 r' D r U2 r' D r", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "nb",
      name: "Nb Permutation",
      subset: "diagonal-swap",
      algs: [
        { alg: "F r' F' r U r U' r2' D' F r U r' F' D r", source: "SpeedCubeDB" },
        { alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R", source: "SpeedCubeDB" },
        { alg: "r' D' F r U' r' F' D r2 U r' U' r' F r F'", source: "SpeedCubeDB" },
        { alg: "R' U L' U2 R U' L R' U L' U2 R U' L", source: "SpeedCubeDB" },
        { alg: "R' U R U' R' F' U' F R U R' U' R U' f R f'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "ra",
      name: "Ra Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R U2' R D R' U R D' R' U' R' U R U R'", source: "SpeedCubeDB" },
        { alg: "U R U' R' U' R U R D R' U' R D' R' U2 R'", source: "SpeedCubeDB" },
        { alg: "U R U R' F' R U2 R' U2 R' F R U R U2 R'", source: "SpeedCubeDB" },
        { alg: "L U2 L' U2 L F' L' U' L U L F L2", source: "SpeedCubeDB" },
        { alg: "U R U' R' U' R U R' U R' D' R U' R' D R2 U R'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "rb",
      name: "Rb Permutation",
      subset: "adjacent-swap",
      algs: [
        { alg: "R' U R U R' U' R' D' R U R' D R U2' R", source: "SpeedCubeDB" },
        { alg: "R' U2 R U2 R' F R U R' U' R' F' R2", source: "SpeedCubeDB" },
        { alg: "U R2 F R U R U' R' F' R U2 R' U2 R", source: "SpeedCubeDB" },
        { alg: "R' U2 R' D' R U' R' D R U R U' R' U' R", source: "SpeedCubeDB" },
        { alg: "U R' U R U R' U' R' D' R U R' D R U2 R", source: "SpeedCubeDB" },
        { alg: "F R U' R' U R U R2' F' R U R U' R'", source: "SpeedCubeDB" },
        { alg: "R U R' U' R' F R2 U' R' U' R U R' F'", source: "SpeedCubeDB" },
        { alg: "l b d' L' U' F U2 L' U' L' U L U' f' S M r u E U' R'", source: "SpeedCubeDB" },
        { alg: "R U R' U' R' F R2 U' R' U F' L' U L", source: "SpeedCubeDB" },
        { alg: "R2 u R2 u' R2 F2 u' F2 u F2", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "t",
      name: "T Permutation",
      subset: "adjacent-swap",
      algs: [{ alg: "R U R' U' R' F R2 U' R' U' R U R' F'", source: "SpeedCubeDB" }],
    },
    {
      id: "ua",
      name: "Ua Permutation",
      subset: "epll",
      algs: [
        { alg: "M2' U' M' U2' M U' M2'", source: "SpeedCubeDB" },
        { alg: "U2 M2 U M U2 M' U M2", source: "SpeedCubeDB" },
        { alg: "R U R' U R' U' R2 U' R' U R' U R", source: "SpeedCubeDB" },
        { alg: "U R2 U' S' U2 S U' R2", source: "SpeedCubeDB" },
        { alg: "R2 U' R' U' R U R U R U' R", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "ub",
      name: "Ub Permutation",
      subset: "epll",
      algs: [
        { alg: "M2' U M' U2' M U M2'", source: "SpeedCubeDB" },
        { alg: "U2 M2 U' M U2 M' U' M2", source: "SpeedCubeDB" },
        { alg: "R' U R' U' R' U' R' U R U R2", source: "SpeedCubeDB" },
        { alg: "U2 R2 U R U R' U' R' U' R' U R'", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "v",
      name: "V Permutation",
      subset: "diagonal-swap",
      algs: [
        { alg: "D2' R' U R D' R2' U' R' U R' U R' D' R U2' R'", source: "SpeedCubeDB" },
        { alg: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2", source: "SpeedCubeDB" },
        { alg: "R' U R U' R' f' U' R U2 R' U' R U' R' f R", source: "SpeedCubeDB" },
        { alg: "U R U' R U R' D R D' R U' D R2 U R2 D' R2", source: "SpeedCubeDB" },
        { alg: "R' U R' U' y R' F' R2 U' R' U R' F R F", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "U",
      name: "U Permutation",
      subset: "diagonal-swap",
      algs: [
        { alg: "F R' F' R U R U' R' F R U' R' U R U R' F'", source: "SpeedCubeDB" },
        { alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", source: "SpeedCubeDB" },
        { alg: "F R' F R2 U' R' U' R U R' F' R U R' U' F'", source: "SpeedCubeDB" },
        { alg: "R2 U' R2 U' R2 U F U F' R2 F U' F'", source: "SpeedCubeDB" },
        { alg: "F R' F' R U R U' R2 U' R U R f' U' f", source: "SpeedCubeDB" },
      ],
    },
    {
      id: "z",
      name: "Z Permutation",
      subset: "epll",
      algs: [
        { alg: "M U2' M2' U2' M U' M2' U' M2'", source: "SpeedCubeDB" },
        { alg: "M2 U M2 U M' U2 M2 U2 M'", source: "SpeedCubeDB" },
        { alg: "M' U' M2 U' M2 U' M' U2 M2", source: "SpeedCubeDB" },
        { alg: "U M2 U' M2 U' M' U2 M2 U2 M'", source: "SpeedCubeDB" },
        { alg: "U M' U M2 U M2 U M' U2 M2", source: "SpeedCubeDB" },
      ],
    },
  ],
});
