// Winter Variation (WV) — algorithm case data for @moishy/algsets.
//
// Winter Variation — solves the last pair while orienting last-layer corners.
// Scraped from https://speedcubedb.com/a/3x3/WV. Every listed alg kept as a variant.
//
// Authored per packages/algsets/AUTHORING.md — algs only; recognition/AUF/cost are derived.

import { type AlgSet, defineAlgSet } from "../define.ts";

export const wv: AlgSet = defineAlgSet({
  id: "wv",
  name: "Winter Variation (WV)",
  cases: [
    {
      id: "wv-1",
      name: "WV 1",
      algs: [
        "U L' U2 R U R' U2 L",
        "L' U2 R U2 R' U2 L",
        "f' L U L' U' L' f",
        "U R' D' R U R' D R U' R U' R'",
      ],
    },
    {
      id: "wv-2",
      name: "WV 2",
      algs: ["U R U' R'", "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'", "U l F' l'"],
    },
    {
      id: "wv-3",
      name: "WV 3",
      algs: [
        "R' F R U R U' R' F'",
        "U' L U' R U L' U R'",
        "U R U' R' U F R' F' r U R U' r'",
        "R' F R F' U L U F U' F' L'",
      ],
    },
    {
      id: "wv-4",
      name: "WV 4",
      algs: [
        "U R2 D R' U' R D' R2",
        "U2 R' D' R U' R' D R2 U' R'",
        "U2 R U' R' L' U2 R U R' U2 L",
        "U R U' R' U' r U R' U' r' F R F'",
      ],
    },
    {
      id: "wv-5",
      name: "WV 5",
      algs: [
        "U R U' R' U R' U' R U' R' U2 R",
        "y' U2 S R2 F R F' R S'",
        "U R U' R' U2 R U2 R' U' R U' R'",
        "U R U R' U' R U R D R' U2 R D' R2",
      ],
    },
    {
      id: "wv-6",
      name: "WV 6",
      algs: [
        "R U' R' U2 R U' R' U2 R U R'",
        "U' R' D' R U2 R' D R2 U' R'",
        "U R U' R' U' R2 D R' U2 R D' R' U2 R'",
      ],
    },
    { id: "wv-7", name: "WV 7", algs: ["U R U R' U' R U' R'", "R' U' R U R U' R' U' R' U R"] },
    { id: "wv-8", name: "WV 8", algs: ["U2 R U' R' U R U2 R'", "U2 R U L' U R' U' L"] },
    {
      id: "wv-9",
      name: "WV 9",
      algs: [
        "U2 F' R U2 R' U2 R' F R",
        "y2 U2 r B2 U R' U' r' F R F'",
        "U2 F2 R U2 R' U2 R' F2 R",
        "U2 L' R U R' U' R U R' U' L U' R U' R'",
      ],
    },
    {
      id: "wv-10",
      name: "WV 10",
      algs: [
        "U R U R2 U' R2 U' R2 U2 R",
        "R' U2 R U R' U R2 U2 R'",
        "R' F R2 U R' U' R U R' U' F'",
        "U2 F2 L' U L U L' U' L F2",
      ],
    },
    {
      id: "wv-11",
      name: "WV 11",
      algs: [
        "U2 R' U' R2 U' R2 U2 R",
        "U R U' R' L' U' L U' L' U2 L",
        "U R U' R' U' R U2 R' U' R U' R'",
        "U R U R' U' R U R' U2 R' F R U R U' R' F'",
      ],
    },
    {
      id: "wv-12",
      name: "WV 12",
      algs: [
        "l' U2 l F2 U L' U L",
        "R' F2 R F2 U L' U L",
        "U R U' R2 U' R' D' R U R' D R2",
        "U R U' R' U' l' U' L U R U' r' F",
      ],
    },
    {
      id: "wv-13",
      name: "WV 13",
      algs: [
        "U2 R U2 R2 U' R U' R' U2 R",
        "R' F R F' R' U' F' U F R",
        "U R U' R D R' U2 R D' R' U2 R'",
        "R2 D R' U' R D' R2 U R U' R'",
      ],
    },
    {
      id: "wv-14",
      name: "WV 14",
      algs: [
        "U2 R2 D R' U2 R D' R2",
        "M' U2 R' F R F' R U2 r'",
        "U2 L' U R U' L U2 R'",
        "U R U' R' U2 R U R' U R U2 R'",
      ],
    },
    { id: "wv-15", name: "WV 15", algs: ["L' U R U' R' L", "r' F R F' M'", "L' U R U' M' x'"] },
    {
      id: "wv-16",
      name: "WV 16",
      algs: [
        "U R' D' R U R' D R2 U2 R'",
        "U2 R U' R' U' R' F R U R U' R' F'",
        "U R U' R' U' R2 D' R U2 R' D R U2 R",
        "U2 L' R U R' U' L R U2 R'",
      ],
    },
    {
      id: "wv-17",
      name: "WV 17",
      algs: [
        "R' F' R U2 R U2 R' F",
        "y2 U L U' F l' U' r' F R F'",
        "U R U' R' l' U' L U l F' L' F",
        "U L' U2 R U' R' U2 L U R U' R'",
      ],
    },
    { id: "wv-18", name: "WV 18", algs: ["U2 R U2 R'", "U2 l F2 l'", "U R U' U R' U R U2 R'"] },
    {
      id: "wv-19",
      name: "WV 19",
      algs: [
        "R' F2 R2 U' R' U' R U R' F2",
        "U L' U2 R U' R' U' R U' R' L",
        "U2 L' U R U' R' L U' R U' R'",
        "U R U' R D' R U2 R' D R U2 R",
      ],
    },
    {
      id: "wv-20",
      name: "WV 20",
      algs: [
        "U R U' R' U' R U R' U R U2 R'",
        "U2 R U' R' U R U' R' U' R' F R U R U' R' F'",
        "U L' U2 L R U R' U L' U L",
        "U R U R' U' R U R2 U' R2 U' R2 U2 R",
      ],
    },
    {
      id: "wv-21",
      name: "WV 21",
      algs: [
        "U R U' R2 U2 R U R' U R",
        "U2 R U' R D R' U' R D' R2",
        "U R U' R' U R U R' U R U2 R'",
      ],
    },
    {
      id: "wv-22",
      name: "WV 22",
      algs: [
        "U R U R D R' U2 R D' R2",
        "U R2 D R' U R D' R' U2 R'",
        "U R U' R' F R' F' r U R U' r'",
        "U2 R U2 R' U R' U' R U' R' U2 R",
      ],
    },
    {
      id: "wv-23",
      name: "WV 23",
      algs: [
        "R2 U R' U R' U' R U R U2 R2",
        "U2 R U2 R D' R U2 R' D R U2 R",
        "U F' L U2 L2 U' L2 U' L' U F",
        "U2 R' D' R U' R' D R2 U' R2 U' R U' R' U2 R",
      ],
    },
    {
      id: "wv-24",
      name: "WV 24",
      algs: ["U2 R U' R' U R U' R' U R U2 R'", "U R U' R' U' F' r U R' U' r' F R"],
    },
    {
      id: "wv-25",
      name: "WV 25",
      algs: [
        "U2 R U2 R2 U2 R U R' U R",
        "U2 R U2 R' U R U R' U R U2 R'",
        "U2 R U' R' U R U' R D R' U' R D' R2",
        "U R U' R' U' R' U2 R2 U R2 U R2 U2 R'",
      ],
    },
    {
      id: "wv-26",
      name: "WV 26",
      algs: [
        "U R U' R2 U' R U' R' U2 R",
        "U R U R' U F2 L' U L U' L' U' L F2",
        "U R' D' R U' R' D R2 U' r' l' U R U' R' L",
        "U R U' R' U R U2 R' U' R U' R'",
      ],
    },
    {
      id: "wv-27",
      name: "WV 27",
      algs: [
        "U R U R' U' R U R' U' R U' R'",
        "U R U' R' F R U R' U' R U R' U' R U R' U' F'",
        "U R U' R' U' R U R' U R U' R' U R U2 R'",
        "U R U' R' U R' U' R U' R' U R U' R' U2 R",
      ],
    },
  ],
});
