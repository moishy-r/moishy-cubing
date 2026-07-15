// COLL + EPLL — algorithm case data for @moishy/algsets.
//
// COLL — corner orientation+permutation of the last layer in one alg (edges already
// oriented). Scraped from https://speedcubedb.com/a/3x3/COLL; subset = corner-orientation
// group (Sune/Anti Sune/L/U/T/Pi/H). Every listed alg kept as an interchangeable variant.
//
// Authored per packages/algsets/AUTHORING.md — algs only; recognition/AUF/cost are derived.

import { type AlgSet, defineAlgSet } from "../define.ts";

export const collEpll: AlgSet = defineAlgSet({
  id: "coll",
  name: "COLL + EPLL",
  cases: [
    {
      id: "as-1",
      name: "AS 1",
      subset: "Anti Sune",
      algs: [
        "y R U2 R' U' R U' R'",
        "R' U' R U' R' U2 R",
        "y2 L' U' L U' L' U2 L",
        "y' L U2 L' U' L U' L'",
      ],
    },
    {
      id: "as-2",
      name: "AS 2",
      subset: "Anti Sune",
      algs: [
        "y2 R2 D R' U R D' R' U R' U' R U' R'",
        "y R' U' R U' R' U R' D' R U R' D R2",
        "U2 R2 D R' U R D' R' U R' U' R U' R'",
        "R U R' f' U' R U2 R' U' R U' R' f R U' R'",
      ],
    },
    {
      id: "as-3",
      name: "AS 3",
      subset: "Anti Sune",
      algs: [
        "y2 R2 D R' U2 R D' R2 U' R U' R'",
        "R' U' F' R U R' U' R' F R2 U' R' U R",
        "y2 M F' r U R' U2 r' F2 r",
        "U2 f' L F L' U2 L' U2 L U2 S",
      ],
    },
    {
      id: "as-4",
      name: "AS 4",
      subset: "Anti Sune",
      algs: [
        "y2 R' U' R U' R2 D' R U2 R' D R2",
        "y2 R U2 R' U2 r' F R F' M'",
        "R' U' R U R' F R U R' U' R' F' R2",
        "y2 R U2 R' U2 L' U R U' R' L",
      ],
    },
    {
      id: "as-5",
      name: "AS 5",
      subset: "Anti Sune",
      algs: [
        "y2 r' F R F' r U R'",
        "R' U L U' R U L'",
        "y2 L' U R U' L U R'",
        "U2 R' F R F' r U R' U' M",
      ],
    },
    {
      id: "as-6",
      name: "AS 6",
      subset: "Anti Sune",
      algs: [
        "R U' R' U2 R U' R' U2 R' D' R U R' D R",
        "R U2 r' F R' F' r U' R U' R'",
        "R U R' F' R U2 R' U' R U' R' F R U' R'",
        "y2 L U2 R' U L' U' R U' L U' L'",
      ],
    },
    {
      id: "s-1",
      name: "S 1",
      subset: "Sune",
      algs: [
        "R U R' U R U2 R'",
        "y' R' U2 R U R' U R",
        "y L' U2 L U L' U L",
        "y2 L U L' U L U2 L'",
      ],
    },
    {
      id: "s-2",
      name: "S 2",
      subset: "Sune",
      algs: [
        "y2 R U R' U R2 D R' U2 R D' R2",
        "r' F2 r U2 R U' r' F M'",
        "L' U2 L U2 R U' L' U L R'",
        "L' U2 L U2 l F' L' F M'",
      ],
    },
    {
      id: "s-3",
      name: "S 3",
      subset: "Sune",
      algs: [
        "L' R U R' U' L U2 R U2 R'",
        "M F R' F' r U2 R U2 R'",
        "y2 R2 D' R U2 R' D R2 U R' U R",
        "f R' F' R U2 R U2 R' U2 S'",
      ],
    },
    {
      id: "s-4",
      name: "S 4",
      subset: "Sune",
      algs: [
        "y' R U R' U R U' R D R' U' R D' R2",
        "R U R' U' R' F R F' r U R' U R U2 r'",
        "y' F R' U2 R F' R' F U2 F' R",
        "L F' U2 F L' F' L U2 L' F",
      ],
    },
    {
      id: "s-5",
      name: "S 5",
      subset: "Sune",
      algs: [
        "R U' L' U R' U' L",
        "R U' r' F R' F' r",
        "l F' L' F l' U' L",
        "r U' r' F R' F' r U M",
      ],
    },
    {
      id: "s-6",
      name: "S 6",
      subset: "Sune",
      algs: [
        "y2 R U R' F' R U R' U R U2 R' F R U' R'",
        "y2 R U R' U r' F R F' r U2 R'",
        "y2 R U R' U L' U R U' L U2 R'",
        "F' R U2 R' U2 R' F2 R U R U' R' F'",
      ],
    },
    {
      id: "l-1",
      name: "L 1",
      subset: "L",
      algs: [
        "y' R U R' U R U' R' U R U' R' U R U2 R'",
        "y' R U2 R' U' R U R' U' R U R' U' R U' R'",
        "y2 R' U2 R U R' U' R U R' U' R U R' U R",
        "R' U' R U' R' U2 R U' R U R' U R U2 R'",
      ],
    },
    {
      id: "l-2",
      name: "L 2",
      subset: "L",
      algs: [
        "R' U2 R' D' R U2 R' D R2",
        "y2 L' U2 L' D' L U2 L' D L2",
        "y' R' U2 R U R2 D' R U R' D R2",
        "y' r D r' U r D' r' U y R U2 R'",
      ],
    },
    {
      id: "l-3",
      name: "L 3",
      subset: "L",
      algs: [
        "y R U2 R D R' U2 R D' R2",
        "U2 R U2 R2 D' R U' R' D R2 U' R'",
        "R' F' R U R' U' R' F R2 U' R' U2 R",
        "y R' U' R U2 L' U R' U' L U' R",
      ],
    },
    {
      id: "l-4",
      name: "L 4",
      subset: "L",
      algs: [
        "y F R' F' r U R U' r'",
        "y2 R2 D R' U R D' R' U' R'",
        "R U R' U' R' F R U R U' R' F'",
        "y F l' U' L U R U' r'",
      ],
    },
    {
      id: "l-5",
      name: "L 5",
      subset: "L",
      algs: [
        "y2 F' r U R' U' r' F R",
        "y x R' U R D' R' U' R D x'",
        "r U R U' r' F R' F'",
        "y' R2 D' R U' R' D R U R",
      ],
    },
    {
      id: "l-6",
      name: "L 6",
      subset: "L",
      algs: [
        "y r U2 R2 F R F' R U2 r'",
        "y' R' U' R U R' F' R U R' U' R' F R2",
        "U' R' U' R U R' F' R U R' U' R' F R2",
        "y F R U R2 F R F' R U' R' F'",
      ],
    },
    {
      id: "u-1",
      name: "U 1",
      subset: "U",
      algs: [
        "R' U' R U' R' U2 R2 U R' U R U2 R'",
        "y2 R U R' U R U2 R2 U' R U' R' U2 R",
        "y R U2 R' U' R U' R' U' R U R' U R U2 R'",
        "y' R U R' U' R U' R' U2 R U' R' U2 R U R'",
      ],
    },
    {
      id: "u-2",
      name: "U 2",
      subset: "U",
      algs: [
        "R' F R U' R' U' R U R' F' R U R' U' R' F R F' R",
        "y' r U R' U' r' F R2 U' R' U' R U2 R' U' F'",
        "y' R' U' R F R2 D' R U R' D R2 U' F'",
        "y F U R U2 R' U R U R2 F' r U R U' r'",
      ],
    },
    {
      id: "u-3",
      name: "U 3",
      subset: "U",
      algs: [
        "y2 R2 D R' U2 R D' R' U2 R'",
        "R U' R' U' R U2 R' U' R' D' R U2 R' D R",
        "R' U R U R' F' R U R' U' R' F R2 U' R' U' R",
        "L2 D L' U2 L D' L' U2 L'",
      ],
    },
    {
      id: "u-4",
      name: "U 4",
      subset: "U",
      algs: [
        "F R U' R' U R U R' U R U' R' F'",
        "y2 R' F2 R U2 R U2 R' F2 R U2 R'",
        "y' F U2 R' D' R U2 R' D R F'",
        "y2 R U2 R' U2 L' U2 R U2 R' U2 L",
      ],
    },
    {
      id: "u-5",
      name: "U 5",
      subset: "U",
      algs: [
        "R2 D' R U2 R' D R U2 R",
        "y2 L2 D' L U2 L' D L U2 L",
        "R2 F' R U R' U' R' F R' U' R2 U2 R2 U R' U R",
        "L U' R U' L' U R' U2 L U' L'",
      ],
    },
    {
      id: "u-6",
      name: "U 6",
      subset: "U",
      algs: [
        "R2 D' R U R' D R U R U' R' U' R",
        "R' U2 R F U' R' U' R U F'",
        "R U' R' U' R U R D R' U R D' R2",
        "R' U2 R U2 R' F' R U R' U' R' F R2",
      ],
    },
    {
      id: "t-1",
      name: "T 1",
      subset: "T",
      algs: [
        "R U2 R' U' R U' R2 U2 R U R' U R",
        "y' R U R2 U' R2 U' R2 U2 R U' R U' R'",
        "R U2 R' r' F2 r U' R U' R' U' r' F r",
        "y' R U R' U R U2 R' L' U' L U' L' U2 L",
      ],
    },
    {
      id: "t-2",
      name: "T 2",
      subset: "T",
      algs: [
        "R' U R U2 R' L' U R U' L",
        "R' U R U2 r' R' F R F' r",
        "y2 R' F R U R' U' R' F' R2 U' R' U2 R",
        "y2 R U' R' U2 L R U' R' U L'",
      ],
    },
    {
      id: "t-3",
      name: "T 3",
      subset: "T",
      algs: [
        "y R' F' r U R U' r' F",
        "y l' U' L U R U' r' F",
        "y2 R' U' R' D' R U R' D R2",
        "y l' U' L U l F' L' F",
      ],
    },
    {
      id: "t-4",
      name: "T 4",
      subset: "T",
      algs: [
        "y2 F R U R' U' R U' R' U' R U R' F'",
        "y2 F R' D' R U2 R' D R U2 F'",
        "y2 R F R' U R U2 R' U R U F' R'",
        "y R U2 R' F2 R U2 R' U2 R' F2 R",
      ],
    },
    {
      id: "t-5",
      name: "T 5",
      subset: "T",
      algs: [
        "y' r U R' U' r' F R F'",
        "R U R D R' U' R D' R2",
        "y2 x' D R U' R' D' R U R' x",
        "R U R' U R' D' R U' R' D R2 U' R'",
      ],
    },
    {
      id: "t-6",
      name: "T 6",
      subset: "T",
      algs: [
        "R' U R2 D r' U2 r D' R2 U' R",
        "y2 R U' R2 D' r U2 r' D R2 U R'",
        "y R' U' R U R2 D' R U2 R' D R2 U' R' U R",
        "y R U R' U' R2 D R' U2 R D' R2 U R U' R'",
      ],
    },
    {
      id: "pi-1",
      name: "Pi 1",
      subset: "Pi",
      algs: [
        "R U2 R2 U' R2 U' R2 U2 R",
        "R' U2 R2 U R2 U R2 U2 R'",
        "y2 L' U2 L2 U L2 U L2 U2 L'",
        "R U R' U R U2 R' U' R U R' U R U2 R'",
      ],
    },
    {
      id: "pi-2",
      name: "Pi 2",
      subset: "Pi",
      algs: [
        "y F U R U' R' U R U' R2 F' R U R U' R'",
        "R' F2 R U2 R U2 R' F2 U' R U' R'",
        "y2 L' U' L U L F' L2 U' L U L' U' L U F",
        "R U R' U R' F R2 U' R' U' R U R' F' U R U' R'",
      ],
    },
    {
      id: "pi-3",
      name: "Pi 3",
      subset: "Pi",
      algs: [
        "R' U' F' R U R' U' R' F R2 U2 R' U2 R",
        "y F U R U' R' U R U2 R' U' R U R' F'",
        "y F R2 U' R2 U R2 U S R2 f'",
        "y' R U R' U R U2 R2 F' r U R U' r' F",
      ],
    },
    {
      id: "pi-4",
      name: "Pi 4",
      subset: "Pi",
      algs: [
        "R U R' U' R' F R2 U R' U' R U R' U' F'",
        "R U2 R' U' R U R' U2 r' F R F' M'",
        "y F' R U R' U R U' R' U' R' F R U' R U' R' U R U R'",
        "y' R' U2 R U R' U R2 U' L' U R' U' L",
      ],
    },
    {
      id: "pi-5",
      name: "Pi 5",
      subset: "Pi",
      algs: [
        "R U' L' U R' U L U L' U L",
        "y' R U2 R' U R' D' R U2 R' D R2 U' R'",
        "y' R U R' U F' R U2 R' U2 R' F R",
        "y2 L' U R U' L U' R' U' R U' R'",
      ],
    },
    {
      id: "pi-6",
      name: "Pi 6",
      subset: "Pi",
      algs: [
        "R' F' U' F U' R U S' R' U R S",
        "y' r U R' U R' F R F' R U' R' U R U2 r'",
        "R2 D' R U R' D R U R U' R' U R U R' U R",
        "R U D' R U R' D R2 U' R' U' R2 U2 R",
      ],
    },
    {
      id: "h-1",
      name: "H 1",
      subset: "H",
      algs: [
        "R U R' U R U' R' U R U2 R'",
        "y' R U2 R' U' R U R' U' R U' R'",
        "y R U2 R' U' R U R' U' R U' R'",
        "y' R' U2 R U R' U' R U R' U R",
      ],
    },
    {
      id: "h-2",
      name: "H 2",
      subset: "H",
      algs: [
        "F R U' R' U R U2 R' U' R U R' U' F'",
        "f R2 S' U' R2 U' R2 U R2 F'",
        "y2 f R U R' U' R F' R U R' U' R' S'",
        "f R U R' U' f' R U R' U' R' F R F'",
      ],
    },
    {
      id: "h-3",
      name: "H 3",
      subset: "H",
      algs: [
        "R U R' U R U L' U R' U' L",
        "R U R' U R U r' F R' F' r",
        "R' F' R U2 R U2 R' F U' R U' R'",
        "R U R2 D' R U2 R' D R U' R U2 R'",
      ],
    },
    {
      id: "h-4",
      name: "H 4",
      subset: "H",
      algs: [
        "y F R U R' U' R U R' U' R U R' U' F'",
        "y F U R U' R' U R U' R' U R U' R' F'",
        "U F R U R' U' R U R' U' R U R' U' F'",
        "y' F R U R' U' R U R' U' R U R' U' F'",
      ],
    },
  ],
});
