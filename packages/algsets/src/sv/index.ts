// Summer Variation (SV) — algorithm case data for @moishy/algsets.
//
// Summer Variation — solves the last pair while influencing last-layer state.
// Scraped from https://speedcubedb.com/a/3x3/SV. Every listed alg kept as a variant.
//
// Authored per packages/algsets/AUTHORING.md — algs only; recognition/AUF/cost are derived.

import { type AlgSet, defineAlgSet } from "../define.ts";

export const sv: AlgSet = defineAlgSet({
  id: "sv",
  name: "Summer Variation (SV)",
  cases: [
    {
      id: "sv-1",
      name: "SV 1",
      algs: [
        "U2 R' D' r U2 r' D R",
        "L R U' R' U L' U2 R U' R'",
        "U2 R U R' U2 L U' R U R' L'",
        "R U R D R' U2 R D' R' U2 R'",
      ],
    },
    {
      id: "sv-2",
      name: "SV 2",
      algs: [
        "U2 R' D' R U R' D R U R U R'",
        "L' R U R' U L U R U2 L' U' L U2 R'",
        "R U R' U2 R U R' U R U2 R'",
        "R U R' U R' U2 R U R' U R",
      ],
    },
    {
      id: "sv-3",
      name: "SV 3",
      algs: [
        "R U R D R' U R D' R' U' R'",
        "U2 R L U' R' U' L' U' L U' L'",
        "R U' R' U' R2 D R' U' R D' R2",
        "M x D L U L' D' L R'",
      ],
    },
    { id: "sv-4", name: "SV 4", algs: ["U2 L R U' R' U L'", "R' D' r U2 r' D R2 U R'"] },
    {
      id: "sv-5",
      name: "SV 5",
      algs: [
        "R U2 R' U' R' F R U R U' R' F'",
        "L' U2 L U L' U L R U2 R'",
        "R U' L' U L U2 R' L' U L",
        "U2 L U F2 r U2 r' U' L'",
      ],
    },
    { id: "sv-6", name: "SV 6", algs: ["R U' R' U' R U' R'"] },
    {
      id: "sv-7",
      name: "SV 7",
      algs: ["R U R'", "R U' U' U' R'", "B' D' B2 R' U' B U B2 R D R U R'"],
    },
    {
      id: "sv-8",
      name: "SV 8",
      algs: [
        "R U M' U R' U' r' F R F'",
        "U2 M' F' U2 F M",
        "R U2 R' U' L' U R U' R' L",
        "R U2 R' U' r' F R F' M'",
      ],
    },
    {
      id: "sv-9",
      name: "SV 9",
      algs: ["R U' R' L' U R U' R' L U' R U' R'", "R U' R2 F R F' U' S' R U' R' S"],
    },
    {
      id: "sv-10",
      name: "SV 10",
      algs: ["R U R' U' R U R' U R U2 R'", "U2 R' D' R U' R' D R U' R U R'"],
    },
    { id: "sv-11", name: "SV 11", algs: ["M F R' F' r", "L' R U R' U' L", "R U2 R' U R U2 R'"] },
    {
      id: "sv-12",
      name: "SV 12",
      algs: [
        "R U2 R' U F' R U2 R' U2 R' F R",
        "R2 U R' U R' U' R2 U R' U' R U' R2",
        "R U R' U R U2 R2 U' R2 U' R2 U2 R",
      ],
    },
    {
      id: "sv-13",
      name: "SV 13",
      algs: [
        "U L' R U R' U R U' R' U2 L",
        "R U2 R2 D' R U R' D R2 U2 R'",
        "R U' R' U' R U' R' U' R U R' U R U2 R'",
      ],
    },
    { id: "sv-14", name: "SV 14", algs: ["U2 L R U' R2 U L' U' R", "U2 L' R U R' U' L U2 R U R'"] },
    { id: "sv-15", name: "SV 15", algs: ["R U2 R' U R U' R' U R U2 R'"] },
    { id: "sv-16", name: "SV 16", algs: ["R U' R D R' U2 R D' R2"] },
    { id: "sv-17", name: "SV 17", algs: ["R U R2 U2 R U R' U R"] },
    {
      id: "sv-18",
      name: "SV 18",
      algs: ["R U2 R D R' U' R D' R2", "R U2 R' U R' D' R U' R' D R2 U' R'"],
    },
    {
      id: "sv-19",
      name: "SV 19",
      algs: [
        "R U R2 F' r U R U' r' F",
        "R U L' U' L' U R' U' L U L",
        "R U' R' F' R U2 R' U2 R' F R",
        "R U2 R' U' R' F' R U2 R U2 R' F",
      ],
    },
    { id: "sv-20", name: "SV 20", algs: ["R U' R' U' R U R' U' R U' R'"] },
    { id: "sv-21", name: "SV 21", algs: ["R U' R2 U' R2 U' R2 U2 R"] },
    { id: "sv-22", name: "SV 22", algs: ["R U R2 U' R U' R' U2 R"] },
    {
      id: "sv-23",
      name: "SV 23",
      algs: ["R U' R' U' R U' R2 U' R U' R' U2 R", "R U2 R' U R U2 R2 U2 R U R' U R"],
    },
    { id: "sv-24", name: "SV 24", algs: ["R U R' U R' U' R U' R' U2 R"] },
    {
      id: "sv-25",
      name: "SV 25",
      algs: [
        "R U R D' R U' R' D R U R",
        "R U2 R' U R U' R' U R U' R' U R U2 R'",
        "R U' R' U' R U R' U' R U R' U' R U' R'",
        "U' r' F R2 F' r U R' U R'",
      ],
    },
    { id: "sv-26", name: "SV 26", algs: ["U' R U R D R' U R D' R2"] },
    {
      id: "sv-27",
      name: "SV 27",
      algs: [
        "R' U L U' R2 U R' L'",
        "R U R' U' R U2 R' U' R U' R'",
        "R U R' U2 R' U' R U' R' U2 R",
      ],
    },
  ],
});
