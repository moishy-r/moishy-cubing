import { assert, assertEquals, assertFalse } from "@std/assert";
import { applyMoves, type CubeState, solvedCube } from "./cube-state.ts";
import { type Move, parseAlg } from "./notation.ts";
import { type PieceRegion, regionSolved, regionSolvedUpToD } from "./regions.ts";

// The CFOP cross, and the cross plus the front-right slot, as a method would name them.
const CROSS: PieceRegion = { corners: [], edges: [4, 5, 6, 7] };
const FR: PieceRegion = { corners: [4], edges: [8] };
const CROSS_FR: PieceRegion = { corners: [4], edges: [4, 5, 6, 7, 8] };

const at = (alg: string) => applyMoves(solvedCube(), parseAlg(alg));
const D_OFFSETS: Move[][] = ["", "D", "D2", "D'"].map((d) => (d ? parseAlg(d) : []));

/** The definition, spelled out: some D turn leaves the region exactly solved. */
function upToDByDefinition(region: PieceRegion): (s: CubeState) => boolean {
  const solved = regionSolved(region);
  return (s) => D_OFFSETS.some((d) => solved(d.length === 0 ? s : applyMoves(s, d)));
}

Deno.test("regionSolvedUpToD accepts an exactly solved region", () => {
  const upToD = regionSolvedUpToD(CROSS_FR);
  assert(upToD(solvedCube()));
  // Algs that leave the cross and the FR slot alone: a U turn, and the keyhole triple.
  for (const alg of ["U2", "L' U L"]) {
    assert(regionSolved(CROSS_FR)(at(alg)), `${alg} should leave the region exactly solved`);
    assert(upToD(at(alg)));
  }
});

Deno.test("regionSolvedUpToD accepts a D offset that regionSolved rejects", () => {
  for (const d of ["D", "D2", "D'"]) {
    assertFalse(regionSolved(CROSS_FR)(at(d)), `regionSolved should reject ${d}`);
    assert(regionSolvedUpToD(CROSS_FR)(at(d)), `regionSolvedUpToD should accept ${d}`);
  }
});

Deno.test("regionSolvedUpToD rejects a region no D turn can fix", () => {
  const upToD = regionSolvedUpToD(CROSS_FR);
  for (const alg of ["R", "F2", "R U R'", "D R"]) {
    assertFalse(upToD(at(alg)), `${alg} is not solvable by a D turn`);
  }
});

// The reason it takes a region rather than a piece: the offset is **shared**. Two
// sub-regions can each be solvable by a D turn while their union is not, because the turns
// they need differ — and that state is not "pseudo" in any useful sense, since no single D
// puts it right. Accepting it is the bug a per-slot D tolerance would have.
Deno.test("regionSolvedUpToD requires ONE offset across the whole region", () => {
  const s = at("D L2 B2 L2 B2");
  assert(regionSolvedUpToD(CROSS)(s), "the cross alone is solvable by a D turn");
  assert(regionSolvedUpToD(FR)(s), "the FR slot alone is too");
  assertFalse(
    regionSolvedUpToD(CROSS_FR)(s),
    "but not together: they need different offsets, so no single D turn solves the union",
  );
});

// The implementation does not turn the cube per call — it indexes precomputed permutation
// maps, because a goal predicate runs millions of times in a solve. That derivation is the
// thing that could silently be wrong, so check it against the obvious definition over a
// wide spread of states rather than over hand-picked algs.
Deno.test("regionSolvedUpToD agrees with its definition on every state tried", () => {
  const families = ["U", "D", "L", "R", "F", "B"];
  const amounts = ["", "2", "'"];
  const regions = [CROSS, FR, CROSS_FR, { corners: [4, 5], edges: [4, 5, 6, 7, 8, 9] }];
  const fast = regions.map(regionSolvedUpToD);
  const slow = regions.map(upToDByDefinition);

  let checked = 0, accepted = 0;
  // Every alg to depth 3, plus a D prefix on each so offset states are well represented
  // (they are rare among random states and are the whole point of the predicate).
  const algs: string[] = [""];
  for (const a of families.flatMap((f) => amounts.map((m) => f + m))) {
    algs.push(a);
    for (const b of families.flatMap((f) => amounts.map((m) => f + m))) {
      algs.push(`${a} ${b}`);
      for (const c of families.flatMap((f) => amounts.map((m) => f + m))) {
        algs.push(`${a} ${b} ${c}`);
      }
    }
  }
  for (const alg of algs) {
    for (const prefix of ["", "D ", "D2 ", "D' "]) {
      const s = at(`${prefix}${alg}`.trim());
      for (let i = 0; i < regions.length; i++) {
        const got = fast[i](s);
        assertEquals(got, slow[i](s), `disagreement on "${prefix}${alg}" for region ${i}`);
        checked++;
        if (got) accepted++;
      }
    }
  }
  // Guard against a vacuous pass: the predicate must actually be saying yes sometimes and
  // no sometimes over this population.
  assert(checked > 90_000, `only ${checked} checks`);
  assert(accepted > 0 && accepted < checked, `degenerate: ${accepted}/${checked} accepted`);
});

// Evaluated up to whole-cube rotation, like every other region goal here, so "D" means the
// bottom of the frame the cube is held in. Note the state has to be built by turning the
// bottom layer and *then* tilting: an absolute `D` applied after an `x` turns a different
// physical layer, and is correctly not accepted.
Deno.test("regionSolvedUpToD reads the D layer of the frame the cube is held in", () => {
  const upToD = regionSolvedUpToD(CROSS_FR);
  for (const frame of ["", "y", "y2", "y'", "x", "z'", "x y"]) {
    const tilt = frame ? parseAlg(frame) : [];
    const held = applyMoves(solvedCube(), tilt);
    assert(upToD(held), `solved should hold in frame "${frame}"`);
    assert(regionSolved(CROSS_FR)(held), `solved should hold exactly in frame "${frame}"`);
    // Offset first, then tilt: the bottom layer of the held frame is turned.
    const offset = applyMoves(at("D"), tilt);
    assert(upToD(offset), `a D offset should hold in frame "${frame}"`);
    assertFalse(regionSolved(CROSS_FR)(offset), `and not be exactly solved in "${frame}"`);
  }
  // The other way round, for an axis-changing tilt: an absolute D after an `x` is the F
  // layer of the held frame, which no D turn of that frame fixes.
  assertFalse(upToD(applyMoves(at("x"), parseAlg("D"))));
});
