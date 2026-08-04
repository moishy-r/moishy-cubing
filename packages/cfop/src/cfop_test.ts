import { assert, assertEquals } from "@std/assert";
import {
  applyMoves,
  invert,
  isSolved,
  parseAlg,
  regionSolved,
  solvedCube,
} from "@moishy/cubing-core";
import { CROSS, F2L, solvedSlotCount } from "@moishy/steps";
import { normalizeOrientation } from "@moishy/cubing-core";
import { Method, type MethodDefinition } from "@moishy/cubing-core";
import { ocllPllStrategy } from "@moishy/steps";
import { oll as ollSet } from "@moishy/algsets/oll";
import { pll as pllSet } from "@moishy/algsets/pll";
import { assertRejects } from "@std/assert";
import { cfop, cfopDefinition, VERSION } from "../mod.ts";

// Twenty scrambles, fixed so a failure is reproducible.
const SCRAMBLES = [
  "D2 F2 U2 R2 B2 D B2 U' L2 D' L2 F' R' U2 B U2 F' L' B2 R2",
  "B2 L2 D' B2 D2 R2 U B2 U2 R2 F2 L' U' F' L2 B U2 R' D' F2",
  "F' L2 U2 F2 D2 F R2 F' U2 B' R2 U' L' B2 D2 R' F2 D2 L U'",
  "U2 R2 B2 U' F2 D' F2 U2 R2 U' B' L' D2 B2 R U' L2 F' R2 D",
  "R2 F2 U R2 D' B2 D F2 U' R2 B2 L' B' D2 F U' L2 B' R U2 L",
  "L2 D2 B2 R2 D' L2 U B2 U2 F2 D' R' F' U B2 L D' B' R2 U2 F",
  "B2 D2 L2 F2 U' B2 U2 F2 U' R2 U L D B' L2 F' R' U2 B D' L'",
  "F2 U2 R2 D B2 D' F2 R2 U' L2 F2 R' D' B U2 L F' U B2 R' D2",
  "U' R2 D2 F2 L2 U' B2 U2 L2 D R2 F' L D' R B2 U' F2 L' B' U2",
  "D B2 U2 F2 R2 U' L2 D' B2 U2 R2 F' D L' B D2 R U2 F' L2 D'",
  "R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'",
  "U F2 D2 L2 B2 U' F2 D' R2 U2 B2 L' F' D B2 R' U L2 D2 F' R",
  "B2 R2 F2 D' L2 D B2 U' F2 L2 U2 R' B U2 L' D F2 R' B2 D' L",
  "D2 L2 F2 U B2 U' R2 D' F2 U2 L2 B' R D2 F' L U' B2 R2 F D",
  "F2 D2 B2 L' U2 L' B2 R B2 R2 U2 B U' F' D2 R B' U L2 F2 D",
  "U2 B2 L2 D R2 U' B2 D2 F2 L2 D' R' U F' R2 B D2 L' F U B2",
  "L2 U2 F2 R' D2 R' F2 L B2 L2 D2 F' U B' D2 L U2 R' F2 D L'",
  "R2 D2 F2 L2 U' F2 D B2 U2 R2 D' L' B U2 F R' D' B2 L F2 U",
  "B2 U' L2 D' F2 U2 B2 R2 U B2 L2 F' D R' B2 U2 L' D2 F U' R",
  "F2 R2 D B2 U' L2 U2 F2 D' R2 B2 L' D' F R2 U B' L2 D2 R U2",
];

const crossSolved = regionSolved(CROSS);
const f2lSolved = regionSolved(F2L);

Deno.test("the method definition is the shape CFOP describes", () => {
  assertEquals(cfopDefinition.id, "cfop");
  assertEquals(
    cfopDefinition.steps.map((s) => s.id),
    ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"],
  );
  // Nothing in the step list names a slot: which pair each F2L step takes is decided
  // per scramble by cost.
  for (const step of cfopDefinition.steps) {
    assert(
      !/fr|fl|bl|br/i.test(step.id),
      `${step.id} names a slot; F2L steps must be interchangeable`,
    );
  }
  assertEquals(cfopDefinition.replacements?.map((r) => r.id), ["zbls", "zbll", "collEpll"]);
  assertEquals(cfopDefinition.extras?.map((e) => e.id), ["winterSummerVariation"]);
});

Deno.test("VERSION matches the manifest", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url)));
  assertEquals(VERSION, manifest.version);
});

Deno.test("CFOP solves, and every step does the job it claims", async () => {
  for (const scramble of SCRAMBLES) {
    const res = await cfop.solve(scramble);
    assert(res.solved, `unsolved: ${scramble}`);

    // The solution really solves the scramble, on a cube held in the orientation the
    // colour-neutrality choice committed to (a free reframing, realized by conjugating
    // the scramble — see DESIGN "Colour neutrality").
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `solution does not solve "${scramble}"`);

    // ...and each step's own contract holds at its boundary.
    const seen = new Map<string, number>();
    for (const seg of res.segments) seen.set(seg.unitId, (seen.get(seg.unitId) ?? 0) + 1);
    for (const id of ["cross", "f2l1", "f2l2", "f2l3", "f2l4"]) {
      assert(seen.has(id), `no ${id} segment for "${scramble}"`);
    }
    for (const seg of res.segments) {
      const after = seg.phases.at(-1)?.endState;
      if (!after) continue;
      if (seg.unitId === "cross") {
        assert(crossSolved(after), `cross not solved for "${scramble}"`);
      }
      if (seg.unitId.startsWith("f2l")) {
        const n = Number(seg.unitId.slice(3));
        assert(crossSolved(after), `${seg.unitId} broke the cross for "${scramble}"`);
        assert(solvedSlotCount(after) >= n, `${seg.unitId} did not net a slot for "${scramble}"`);
        if (seg.unitId === "f2l4") assert(f2lSolved(after), `F2L incomplete for "${scramble}"`);
      }
    }
  }
});

// Rotations are part of the solution, not something undone at the next boundary. This
// asserts the property that used to be violated: a rotation followed immediately by
// its own inverse, which is what re-homing between phases produced.
Deno.test("no solution contains a rotation that is immediately undone", async () => {
  let withRotations = 0;
  for (const scramble of SCRAMBLES) {
    const res = await cfop.solve(scramble);
    const moves = res.solution;
    const rotations = moves.filter((m) => "xyz".includes(m.family));
    if (rotations.length > 0) withRotations++;
    for (let i = 1; i < moves.length; i++) {
      const a = moves[i - 1], b = moves[i];
      if (!"xyz".includes(a.family) || a.family !== b.family) continue;
      assert(
        (a.amount + b.amount) % 4 !== 0,
        `"${scramble}" contains ${a.family} undone immediately by its inverse`,
      );
    }
  }
  // Not an aspiration — CFOP's data genuinely rotates, so if this hits zero something
  // has started stripping them.
  assert(withRotations > 0, "no solution used a rotation; are they being suppressed?");
});

// APB's OCLL+PLL and COLL+EPLL are not reusable here, and the reason is worth pinning:
// both assume the last-layer edges are already oriented, which is true in APB (EO is a
// core step) and false in CFOP. Forcing either must fail loudly at the `oll` boundary
// rather than silently produce a wrong solve.
Deno.test("APB's two-look last layer is correctly not applicable to CFOP", async () => {
  const withOcll: MethodDefinition = {
    ...cfopDefinition,
    replacements: [{
      id: "ocllPll",
      label: "OCLL + PLL",
      region: ["oll", "pll"],
      mode: "force",
      strategies: [ocllPllStrategy(ollSet, pllSet)],
    }],
  };
  const method = new Method(withOcll);
  await assertRejects(
    () =>
      method.solve(SCRAMBLES[0], {
        replacements: { ocllPll: { enabled: true, mode: "force" } },
      }),
    Error,
    "ocllPll",
  );
});

// ZBLS: insert three pairs, then finish the fourth with an alg that orients the
// last-layer edges on the way. The span is all four F2L steps because the constraint is
// on the pair *order* — the data is authored for the front-right slot, so the earlier
// steps have to leave a usable one open.
Deno.test("ZBLS is opt-in, and off by default", async () => {
  const res = await cfop.solve(SCRAMBLES[0]);
  assert(
    !res.segments.some((s) => s.unitId === "zbls"),
    "zbls must not fire unless enabled",
  );
});

// ZBLS, forced. In `compete` it correctly never fires — see the test below and the
// module doc: in CFOP it costs about 9 more than it saves, because its payoff is that
// OLL becomes an OCLL, and full OLL was already about that cheap. (Its real payoff
// needs ZBLL, which is a different method.) So the thing to verify is that the route
// is CORRECT where it exists, not that it wins.
Deno.test("ZBLS, forced, solves and lands every edge oriented", async () => {
  const F2L_REGION = regionSolved(F2L);
  let applicable = 0, reserved = 0, aligned = 0;
  for (const scramble of SCRAMBLES) {
    let res;
    try {
      res = await cfop.solve(scramble, {
        replacements: { zbls: { enabled: true, mode: "force" } },
      });
    } catch {
      // No ZBLS route on this scramble — a forced unit with no candidate is a hard
      // error by design, and the commonest cause is the last slot landing diagonally
      // opposite FR, which would need a y2.
      continue;
    }
    applicable++;
    assert(res.solved, `unsolved with zbls forced: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `wrong solution for "${scramble}"`);

    const seg = res.segments.find((s) => s.unitId === "zbls")!;
    assert(seg, `zbls forced but produced no segment on "${scramble}"`);
    if (seg.strategyId === "zblsReserved") reserved++;
    if (seg.strategyId === "zblsAligned") aligned++;

    // What ZBLS promises: F2L complete AND every edge oriented, so OLL is an OCLL.
    const after = seg.phases.at(-1)!.endState;
    assert(F2L_REGION(after), `zbls left F2L incomplete on "${scramble}"`);
    assert(
      normalizeOrientation(after).eo.every((o) => o === 0),
      `zbls did not orient every edge on "${scramble}"`,
    );

    // Alignment is at most a single y. A y2 to set up the last slot is not a thing a
    // solver does, so the phase offers only y and y' and drops out otherwise.
    for (const p of seg.phases) {
      if (p.phaseId !== "align") continue;
      assert(p.moves.length <= 1, `align emitted ${p.moves.length} moves on "${scramble}"`);
      for (const m of p.moves) {
        assertEquals(m.family, "y", `align emitted a non-y move on "${scramble}"`);
        assert(m.amount !== 2, `align emitted a y2 on "${scramble}"`);
      }
    }
  }
  // Measured, not aspirational: roughly half the scrambles admit a ZBLS route. Zero
  // would mean the wiring broke.
  assert(applicable > 0, "no scramble admitted a ZBLS route at all");
  assertEquals(reserved + aligned, applicable, "each firing should name one strategy");
});

// A compete unit is judged on the whole solve, so enabling it can never make things
// worse. This is the property that makes it safe to leave on.
Deno.test("enabling ZBLS never makes a solve more expensive", async () => {
  for (const scramble of SCRAMBLES.slice(0, 8)) {
    const off = await cfop.solve(scramble);
    const on = await cfop.solve(scramble, { replacements: { zbls: { enabled: true } } });
    assert(
      on.cost <= off.cost + 1e-9,
      `zbls made "${scramble}" worse: ${off.cost.toFixed(2)} -> ${on.cost.toFixed(2)}`,
    );
  }
});

// ZBLL over [oll, pll]: the whole last layer in one alg, but only once the edges are
// already oriented. On its own that happens by luck (the four LL edges must all come out
// oriented); paired with ZBLS it is what ZB actually is.
Deno.test("ZBLL fires on its own only when the edges happen to be oriented", async () => {
  let fired = 0;
  for (const scramble of SCRAMBLES) {
    const res = await cfop.solve(scramble, { replacements: { zbll: { enabled: true } } });
    assert(res.solved, `unsolved with zbll enabled: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `wrong solution for "${scramble}"`);
    const seg = res.segments.find((s) => s.unitId === "zbll");
    if (!seg) continue;
    fired++;
    // When it does fire it must genuinely finish the cube in that one unit.
    assert(isSolved(seg.phases.at(-1)!.endState), `zbll did not solve on "${scramble}"`);
  }
  assert(fired > 0, "zbll never fired — has the edges-oriented case stopped being reachable?");
});

// ZBLS + ZBLL is the pairing the two are designed for, and it is where ZBLS finally pays:
// spend a few moves orienting the edges during the last insert, collect the whole last
// layer in one alg. Measured over 30 random scrambles, on the 8 where a ZBLS route
// exists: last-layer cost 22.14 -> 15.89, whole solve 55.85 -> 55.27, best case
// 62.98 -> 46.13. ZBLS must be FORCED to see it — see the note in cfop.ts about why a
// compete unit whose payoff lands outside its own region is never selected.
Deno.test("ZBLS + ZBLL solves, and the last layer collapses to one alg", async () => {
  let applicable = 0, withZbll = 0;
  for (const scramble of SCRAMBLES) {
    let res;
    try {
      res = await cfop.solve(scramble, {
        replacements: { zbls: { enabled: true, mode: "force" }, zbll: { enabled: true } },
      });
    } catch {
      continue; // no ZBLS route on this scramble
    }
    applicable++;
    assert(res.solved, `unsolved: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `wrong solution for "${scramble}"`);
    if (res.segments.some((s) => s.unitId === "zbll")) {
      withZbll++;
      // ZBLS oriented the edges, so the last layer went in one unit rather than two.
      assert(
        !res.segments.some((s) => s.unitId === "oll"),
        `both zbll and oll ran on "${scramble}"`,
      );
    }
  }
  assert(applicable > 0, "no scramble admitted a ZBLS route");
  assert(withZbll > 0, "ZBLS never handed a solved-edge last layer to ZBLL");
});
