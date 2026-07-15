// EODR — algorithm case data for @moishy/algsets.
//
// EODR — orient all 6 remaining edges and place the DR edge in one step.
// From the eodr Google Sheet
// (https://docs.google.com/spreadsheets/d/16YsmMwgk5M4U8HfF6Gbb4_ufzb2SCKKHeJlVUFRlq5o, gid 1684874333).
// subset = number of misoriented edges (All Oriented / 2 / 4 / 6 Misoriented).
//
// Authored per packages/algsets/AUTHORING.md — algs only; recognition/AUF/cost are derived.

import { type AlgSet, defineAlgSet } from "../define.ts";

export const eodr: AlgSet = defineAlgSet({
  id: "eodr",
  name: "EODR",
  cases: [
    { id: "1", subset: "All Oriented", algs: ["R' U' R U R", "U' S' U2 S", "U S R2 S' R2"] },
    { id: "2", subset: "All Oriented", algs: ["R U R2 U' R U R", "R' U2 R' U2 R", "R' U' R' U R"] },
    { id: "3", subset: "2 Misoriented", algs: ["f U R U' R' f"] },
    { id: "4", subset: "2 Misoriented", algs: ["F R' F' R", "F U R U' R' F'", "U' S' R U' R' S"] },
    { id: "5", subset: "2 Misoriented", algs: ["R' F R F'", "U' F' U F"] },
    { id: "6", subset: "2 Misoriented", algs: ["R' U' f R f' R U R", "S' U R' U' R S U R"] },
    {
      id: "7",
      subset: "2 Misoriented",
      algs: ["R U' R2 U' f R f' R U R", "S' R' F' R U R U' R' U' f"],
    },
    { id: "8", subset: "2 Misoriented", algs: ["R' f R S R' f' R U S'"] },
    { id: "9", subset: "2 Misoriented", algs: ["F R' F' U' R2 U R"] },
    { id: "10", subset: "2 Misoriented", algs: ["f' U' f"] },
    { id: "11", subset: "2 Misoriented", algs: ["f' R' U' R f U R", "U2 R' F R F' R' U' R U R"] },
    { id: "12", subset: "2 Misoriented", algs: ["S' R U R' U' S", "S' R U' R' U S"] },
    { id: "13", subset: "2 Misoriented", algs: ["F U R' U' F' R U R"] },
    { id: "14", subset: "2 Misoriented", algs: ["R U R' f' U2 f"] },
    { id: "15", subset: "2 Misoriented", algs: ["R U2 R' f' U2 f"] },
    { id: "16", subset: "2 Misoriented", algs: ["R' U' R U R S' R U' R' S"] },
    { id: "17", subset: "2 Misoriented", algs: ["R U' R' f' U2 f"] },
    { id: "18", subset: "2 Misoriented", algs: ["f' U2 f"] },
    { id: "19", subset: "2 Misoriented", algs: ["F R F' R U R2", "U R' U' f R2 f' R2 U R"] },
    { id: "20", subset: "2 Misoriented", algs: ["R' U' F R U R U' F'", "U' S' U2 R U' R' S"] },
    { id: "21", subset: "2 Misoriented", algs: ["R U R' f' U' f", "U S' U2 R U R' S"] },
    {
      id: "22",
      subset: "2 Misoriented",
      algs: ["S' R U' R' U' S", "U R U' R' f' U' f"],
    },
    { id: "23", subset: "2 Misoriented", algs: ["R' U' R f R f' U R", "R U' R U' R' F R' F'"] },
    { id: "24", subset: "2 Misoriented", algs: ["f' U f"] },
    { id: "25", subset: "2 Misoriented", algs: ["S' U' R U' R' S"] },
    { id: "26", subset: "2 Misoriented", algs: ["r' U' R2 U' R' U2 r"] },
    {
      id: "27",
      subset: "2 Misoriented",
      algs: ["R F' R' U R F R'", "U2 R F' R' U' R F R'", "U' S' U R U' R' S"],
    },
    { id: "28", subset: "4 Misoriented", algs: ["R' U' R S R' S' U' R U2 R"] },
    { id: "29", subset: "4 Misoriented", algs: ["R' U' S R S' R' U' R U2 R"] },
    { id: "30", subset: "4 Misoriented", algs: ["S' R U' R' F' U' f"] },
    { id: "31", subset: "4 Misoriented", algs: ["F R' F' R S' U' S", "f' U2 F R U R' S"] },
    { id: "32", subset: "4 Misoriented", algs: ["D' r U r' U r U2 r' D"] },
    {
      id: "33",
      subset: "4 Misoriented",
      algs: [
        "R' U' S R U' R U2 R U' S'",
        "S' r U' r' U' S U' r U r'",
        "r' U' R2 M' U2 r' U2 R U' r",
      ],
    },
    { id: "34", subset: "4 Misoriented", algs: ["R' U S R S' R' U' R", "U' f' U' S U' F"] },
    { id: "35", subset: "4 Misoriented", algs: ["r U r' U2 M' U M", "R U' R' S R' U' R U R S'"] },
    { id: "36", subset: "4 Misoriented", algs: ["r U' r' U2 r U r'"] },
    {
      id: "37",
      subset: "4 Misoriented",
      algs: ["R U2 R2 U' R U R S' U' S", "U2 F R' F' R U f' U f"],
    },
    {
      id: "38",
      subset: "4 Misoriented",
      algs: [
        "D' r U2 r' U' r U' r' D",
        "U2 R' U' R S R S' R U R",
        "R' U2 R U S R S' U R",
        "R' U2 R U2 R S' U S",
      ],
    },
    { id: "39", subset: "4 Misoriented", algs: ["R' U' R U R S' U' S"] },
    { id: "40", subset: "4 Misoriented", algs: ["R' U' R S R S' U R"] },
    { id: "41", subset: "4 Misoriented", algs: ["S' U' S"] },
    { id: "42", subset: "4 Misoriented", algs: ["R U' R' U' S' U' S"] },
    { id: "43", subset: "4 Misoriented", algs: ["S' U S"] },
    { id: "44", subset: "4 Misoriented", algs: ["R U' R' S' U' S"] },
    { id: "45", subset: "4 Misoriented", algs: ["R U' R' U S' U' S", "U S' U' R U2 R' S"] },
    { id: "46", subset: "4 Misoriented", algs: ["S' U R U2 R' S"] },
    { id: "47", subset: "4 Misoriented", algs: ["R' U' R S R' S' R U R"] },
    { id: "48", subset: "4 Misoriented", algs: ["R U' R' S' U S"] },
    {
      id: "49",
      subset: "4 Misoriented",
      algs: ["R U' R' U2 S' U' S", "U2 S' U R U R' U' S", "U2 S' U R U' R' U S"],
    },
    { id: "50", subset: "4 Misoriented", algs: ["R' U' S R S' R U R", "S' U S R' U' R U R"] },
    { id: "51", subset: "4 Misoriented", algs: ["R' U' R2 U R U' S' U S"] },
    { id: "52", subset: "4 Misoriented", algs: ["R' U' R2 S R' S' R U R", "U S' U R' F R F' S"] },
    { id: "53", subset: "6 Misoriented", algs: ["S' U' S U' R' F R F'", "S R S' R' U' S R' S' R"] },
    { id: "54", subset: "6 Misoriented", algs: ["F R' F' R U S' U' S"] },
    {
      id: "55",
      subset: "6 Misoriented",
      algs: ["S' U' S U r' U' R2 U r", "r' U' R2 U r U' S' U S", "S' U' S U f' U2 f"],
    },
  ],
});
