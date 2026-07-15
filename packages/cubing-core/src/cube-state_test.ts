import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { NotationError, parseAlg } from "./notation.ts";
import {
  applyAlg,
  applyMove,
  applyMoves,
  cloneState,
  type CubeState,
  isSolved,
  SOLVED,
  solvedCube,
  statesEqual,
  toFacelets,
} from "./cube-state.ts";

const ALL_FAMILIES = "R L U D F B M E S r l u d f b x y z".split(" ");

const SOLVED_FACELETS = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) +
  "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

// URFDLB face-color layout as three-letter-per-face summary (all 9 same color
// for a solid face). Helper builds the full 54-char string.
const mono = (u: string, r: string, f: string, d: string, l: string, b: string) =>
  u.repeat(9) + r.repeat(9) + f.repeat(9) + d.repeat(9) + l.repeat(9) + b.repeat(9);

Deno.test("solvedCube is solved; SOLVED projects to the solved facelet string", () => {
  assert(isSolved(solvedCube()));
  assertEquals(toFacelets(solvedCube()), SOLVED_FACELETS);
});

Deno.test("SOLVED constant is frozen (shared immutable)", () => {
  assertThrows(() => {
    (SOLVED.cp as number[])[0] = 9;
  });
});

Deno.test("applyMove does not mutate its input", () => {
  const s = solvedCube();
  const before = cloneState(s);
  applyMove(s, parseAlg("R")[0]);
  assert(statesEqual(s, before));
});

Deno.test("a single quarter turn is not solved", () => {
  for (const fam of ALL_FAMILIES) {
    const s = applyAlg(solvedCube(), fam);
    assertFalse(isSolved(s), `${fam} should disturb the cube`);
  }
});

Deno.test("every family satisfies move^4 = identity", () => {
  for (const fam of ALL_FAMILIES) {
    const s = applyAlg(solvedCube(), `${fam} ${fam} ${fam} ${fam}`);
    assert(isSolved(s), `${fam}^4 should be solved`);
  }
});

Deno.test("a move and its inverse cancel; a double turn twice cancels", () => {
  for (const fam of ALL_FAMILIES) {
    assert(isSolved(applyAlg(solvedCube(), `${fam} ${fam}'`)), `${fam} ${fam}'`);
    assert(isSolved(applyAlg(solvedCube(), `${fam}2 ${fam}2`)), `${fam}2 ${fam}2`);
    assert(
      isSolved(applyAlg(solvedCube(), `${fam} ${fam} ${fam}'  ${fam}'`)),
      `${fam} ${fam} ${fam}' ${fam}'`,
    );
  }
});

Deno.test("amount is respected: X X X equals X'", () => {
  for (const fam of ALL_FAMILIES) {
    const triple = applyAlg(solvedCube(), `${fam} ${fam} ${fam}`);
    const prime = applyAlg(solvedCube(), `${fam}'`);
    assert(statesEqual(triple, prime), `${fam}^3 === ${fam}'`);
  }
});

Deno.test("sexy move repeated six times returns to solved", () => {
  const s = applyAlg(solvedCube(), "R U R' U' ".repeat(6));
  assert(isSolved(s));
});

Deno.test("superflip flips all 12 edges in place, everything else solved", () => {
  const s = applyAlg(
    solvedCube(),
    "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
  );
  assertEquals(s.eo, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assertEquals(s.ep, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assertEquals(s.cp, [0, 1, 2, 3, 4, 5, 6, 7]);
  assertEquals(s.co, [0, 0, 0, 0, 0, 0, 0, 0]);
  assertEquals(s.cn, [0, 1, 2, 3, 4, 5]);
});

Deno.test("whole-cube rotations recolor the faces as expected", () => {
  // x follows R: F->U, U->B, B->D, D->F; R/L fixed.
  assertEquals(toFacelets(applyAlg(solvedCube(), "x")), mono("F", "R", "D", "B", "L", "U"));
  // y follows U: F->L, L->B, B->R, R->F; U/D fixed.
  assertEquals(toFacelets(applyAlg(solvedCube(), "y")), mono("U", "B", "R", "D", "F", "L"));
  // z follows F: U->R, R->D, D->L, L->U; F/B fixed.
  assertEquals(toFacelets(applyAlg(solvedCube(), "z")), mono("L", "U", "F", "R", "D", "B"));
});

Deno.test("a rotation followed by its inverse is a no-op", () => {
  assert(isSolved(applyAlg(solvedCube(), "x y z z' y' x'")));
});

Deno.test("slice and wide moves match their face+slice compositions", () => {
  const cases: [string, string][] = [
    ["r", "R M'"],
    ["l", "L M"],
    ["u", "U E'"],
    ["d", "D E"],
    ["f", "F S"],
    ["b", "B S'"],
    ["x", "R M' L'"],
    ["y", "U D' E'"],
    ["z", "F B' S"],
  ];
  for (const [move, comp] of cases) {
    assert(
      statesEqual(applyAlg(solvedCube(), move), applyAlg(solvedCube(), comp)),
      `${move} === ${comp}`,
    );
  }
});

Deno.test("applyMoves matches repeated applyMove", () => {
  const moves = parseAlg("R U2 F' D r x' M");
  let step = solvedCube();
  for (const m of moves) step = applyMove(step, m);
  assert(statesEqual(step, applyMoves(solvedCube(), moves)));
});

Deno.test("an algorithm composed with its inverse solves", () => {
  const alg = "R U R' U R U2 R'"; // Sune
  const inv = "R U2 R' U' R U' R'"; // Anti-Sune (its inverse)
  assert(isSolved(applyAlg(solvedCube(), `${alg} ${inv}`)));
});

Deno.test("toFacelets is a valid projection: 54 chars, 9 of each color", () => {
  const f = toFacelets(applyAlg(solvedCube(), "R U R' F2 L' D r x"));
  assertEquals(f.length, 54);
  for (const color of "URFDLB") {
    assertEquals([...f].filter((c) => c === color).length, 9, `9 ${color} stickers`);
  }
});

Deno.test("applyAlg rejects invalid notation at the boundary", () => {
  assertThrows(() => applyAlg(solvedCube(), "R U Q"), NotationError);
});

Deno.test("empty alg leaves the cube unchanged", () => {
  assert(isSolved(applyAlg(solvedCube(), "")));
});

Deno.test("statesEqual distinguishes different states", () => {
  const a: CubeState = solvedCube();
  const b: CubeState = applyAlg(solvedCube(), "R");
  assertFalse(statesEqual(a, b));
  assert(statesEqual(a, solvedCube()));
});
