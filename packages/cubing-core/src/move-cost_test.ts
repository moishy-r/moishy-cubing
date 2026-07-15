import { assertAlmostEquals, assertEquals } from "@std/assert";
import { parseAlg } from "./notation.ts";
import { createDefaultMoveCostModel, type MoveCostModel, scoreAlg } from "./move-cost.ts";

const twoH = createDefaultMoveCostModel(); // default is 2H
const oh = createDefaultMoveCostModel({ mode: "OH" });
const ohRight = createDefaultMoveCostModel({ mode: "OH", handedness: "right" });

const score = (alg: string, model: MoveCostModel) => scoreAlg(parseAlg(alg), model);

Deno.test("2H base costs: a single move is its table cost, no penalty", () => {
  assertEquals(score("R", twoH), 0.8);
  assertEquals(score("U", twoH), 1.0);
  assertEquals(score("D", twoH), 1.4);
  assertEquals(score("M", twoH), 1.2);
  assertEquals(score("r", twoH), 1.0);
});

Deno.test("2H half-turn multiplier applies to amount === 2", () => {
  assertEquals(score("R2", twoH), 1.32); // 0.8 * 1.65
  assertEquals(score("U2", twoH), 1.65); // 1.0 * 1.65
});

Deno.test("2H prime is cost-neutral: R' costs the same as R", () => {
  assertEquals(score("R'", twoH), score("R", twoH));
  assertEquals(score("F'", twoH), score("F", twoH));
});

Deno.test("2H overwork penalty: same family twice in a row adds 2.25", () => {
  assertEquals(score("R R", twoH), 3.85); // 0.8 + 0.8 + 2.25
  assertEquals(score("R U", twoH), 1.8); // 0.8 + 1.0, no penalty
});

Deno.test("2H destabilization: opposite-hand-side transition adds 0.5", () => {
  assertEquals(score("R L", twoH), 2.1); // 0.8 + 0.8 + 0.5
  assertEquals(score("M L", twoH), 2.5); // M is right-side: 1.2 + 0.8 + 0.5
  assertEquals(score("r l", twoH), 2.5); // 1.0 + 1.0 + 0.5
  assertEquals(score("F B", twoH), 2.6); // neither side: 1.3 + 1.3, no penalty
});

Deno.test("2H Sune sums correctly across a real alg", () => {
  // R U R' U R U2 R' — alternating R/U, no overwork/destab; U2 gets multiplier.
  assertEquals(score("R U R' U R U2 R'", twoH), 6.85);
});

Deno.test("rotations now get the half-turn multiplier (resolved open question)", () => {
  assertEquals(score("x", twoH), 2.0);
  assertEquals(score("x2", twoH), 3.3); // 2.0 * 1.65 — no longer exempt
  assertEquals(score("y2", twoH), 2.97); // 1.8 * 1.65
});

Deno.test("consecutive identical rotations incur overwork", () => {
  assertEquals(score("x x", twoH), 6.25); // 2.0 + 2.0 + 2.25
  assertEquals(score("x y", twoH), 3.8); // 2.0 + 1.8, different families
});

Deno.test("rotations adjacent to face moves add no transition penalty", () => {
  assertEquals(score("R x", twoH), 2.8); // 0.8 + 2.0
  assertEquals(score("x R", twoH), 2.8); // 2.0 + 0.8
});

Deno.test("OH base costs and grip-fatigue penalty", () => {
  assertEquals(score("R", oh), 1.0);
  assertEquals(score("L", oh), 2.5);
  assertEquals(score("U F", oh), 4.6); // 1.0 + 1.6 + 2.0 grip fatigue
  assertEquals(score("F U", oh), 4.6); // symmetric pair
  assertEquals(score("R U", oh), 2.0); // 1.0 + 1.0, no fatigue
});

Deno.test("OH does not apply the 2H destabilization penalty", () => {
  assertEquals(score("R L", oh), 3.5); // 1.0 + 2.5, no destab in OH
});

Deno.test("OH overwork still applies", () => {
  assertEquals(score("R R", oh), 4.25); // 1.0 + 1.0 + 2.25
});

Deno.test("OH right-handed mirrors L/R and r/l, but not slices or rotations", () => {
  assertEquals(score("R", ohRight), 2.5); // mirrors to L's cost
  assertEquals(score("L", ohRight), 1.0); // mirrors to R's cost
  assertEquals(score("r", ohRight), 2.8); // mirrors to l's cost
  assertEquals(score("l", ohRight), 1.3); // mirrors to r's cost
  assertEquals(score("M", ohRight), 2.5); // center-relative, unmirrored
  assertEquals(score("x", ohRight), 4.0); // rotations unmirrored
});

Deno.test("cost is context-aware: same move differs by prevMove", () => {
  const [r] = parseAlg("R");
  const noPrev = twoH.cost(r, { prevMove: null, index: 0 });
  const afterR = twoH.cost(r, { prevMove: r, index: 1 });
  assertAlmostEquals(noPrev, 0.8);
  assertAlmostEquals(afterR, 0.8 + 2.25); // overwork
});

Deno.test("first move never incurs a penalty (prevMove null)", () => {
  const [r] = parseAlg("R");
  assertAlmostEquals(twoH.cost(r, { prevMove: null, index: 0 }), 0.8);
});

Deno.test("scoreAlg of an empty sequence is 0", () => {
  assertEquals(scoreAlg([], twoH), 0);
});

Deno.test("the interface is pluggable: a custom flat model works", () => {
  const flat: MoveCostModel = { cost: () => 1 };
  assertEquals(scoreAlg(parseAlg("R U R' U'"), flat), 4);
  assertEquals(scoreAlg(parseAlg("R2 x M' D"), flat), 4);
});
