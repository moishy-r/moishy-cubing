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
import { Method, type MethodDefinition, type Move } from "@moishy/cubing-core";
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
    ["cross", "f2l", "oll", "pll"],
  );
  // Nothing in the step list names a slot: which pair each F2L step takes is decided
  // per scramble by cost.
  for (const step of cfopDefinition.steps) {
    assert(
      !/fr|fl|bl|br/i.test(step.id),
      `${step.id} names a slot; F2L steps must be interchangeable`,
    );
  }
  assertEquals(
    cfopDefinition.replacements?.map((r) => r.id),
    ["f2lPseudo", "zbls", "zbll", "collEpll"],
  );
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
    const seen = new Set(res.segments.map((x) => x.unitId));
    for (const id of ["cross", "f2l"]) assert(seen.has(id), `no ${id} segment for "${scramble}"`);
    for (const seg of res.segments) {
      const after = seg.phases.at(-1)?.endState;
      if (!after) continue;
      if (seg.unitId === "cross") assert(crossSolved(after), `cross not solved: "${scramble}"`);
      if (seg.unitId === "f2l") {
        assert(crossSolved(after), `f2l broke the cross for "${scramble}"`);
        assert(f2lSolved(after), `F2L incomplete for "${scramble}"`);
        assertEquals(solvedSlotCount(after), 4, `not all four slots for "${scramble}"`);
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
  let applicable = 0, named = 0;
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
    // Each strategy names the three pairs it inserts, in order — which is also how a slot
    // gets left open for the ZBLS alg. There is no separate "reserve a slot" route.
    assert(
      /^zbls(FR|FL|BL|BR){3}$/.test(seg.strategyId),
      `unexpected zbls strategy id ${seg.strategyId}`,
    );
    named++;

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
  assertEquals(named, applicable, "each firing should name the order it inserted");
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

// The point of reserving a slot: with FR kept back, ZBLS applies to EVERY solve rather
// than to the roughly one in four where the open slot happens to be FR already.
//
// This only works because each reserved insert carries a setup fallback. Without one the
// reserved inserts failed on 39 of 60 crosses — reserving removes options, so a state
// some slot could have handled may have nothing left for the slots still allowed — while
// recognition, once reached, was already 100%. With the fallback: 60/60 inserts, and 59
// of 60 recognised and solved.
Deno.test("ZBLS, forced, applies to every solve", async () => {
  let applied = 0;
  for (const scramble of SCRAMBLES) {
    const res = await cfop.solve(scramble, {
      replacements: { zbls: { enabled: true, mode: "force" } },
    });
    assert(res.solved, `unsolved with zbls forced: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `wrong solution for "${scramble}"`);
    const seg = res.segments.find((s) => s.unitId === "zbls");
    assert(seg, `zbls was forced but did not fire on "${scramble}"`);
    applied++;
    // It must land the whole F2L with every edge oriented — that is what makes the last
    // layer a ZBLL (or, without it, one of the seven OCLL shapes).
    const after = seg.phases.at(-1)!.endState;
    assert(regionSolved(F2L)(after), `F2L incomplete after zbls on "${scramble}"`);
    assert(
      normalizeOrientation(after).eo.every((o) => o === 0),
      `zbls left an edge misoriented on "${scramble}"`,
    );
    // Alignment is at most one rotation, never a y2 — asserted on the ALIGN PHASE, not on
    // the whole segment. Counting rotations across the segment also catches the ones the
    // insert algs legitimately contain (CFOP's F2L data is full of them, and they are
    // executed as written), which is a different thing and not a defect.
    const align = seg.phases.find((p) => p.phaseId === "align");
    assert(align, `no align phase in the zbls segment for "${scramble}"`);
    assert(align.moves.length <= 1, `align emitted ${align.moves.length} moves on "${scramble}"`);
    for (const r of align.moves) {
      assertEquals(r.family, "y", `align emitted a non-y move on "${scramble}"`);
      assert(r.amount !== 2, `align emitted a y2 on "${scramble}"`);
    }
  }
  assertEquals(applied, SCRAMBLES.length, "zbls must apply to every scramble");
});

// ZBLS + ZBLL is what ZBLS is for, and together they now beat plain CFOP outright.
// Measured over 20 random scrambles: cost 59.12 -> 58.09, moves 54.5 -> 54.1, with ZBLS
// applying to 20/20. ZBLS alone is dearer (66.61) — its cost only repays when ZBLL is
// there to collect the oriented edges.
Deno.test("ZBLS + ZBLL beats plain CFOP", async () => {
  let plainCost = 0, zbCost = 0, n = 0, withZbll = 0;
  for (const scramble of SCRAMBLES) {
    const plain = await cfop.solve(scramble);
    const zb = await cfop.solve(scramble, {
      replacements: { zbls: { enabled: true, mode: "force" }, zbll: { enabled: true } },
    });
    assert(zb.solved, `unsolved: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(zb.orientation),
      ...parseAlg(scramble),
      ...zb.orientation,
    ]);
    assert(isSolved(applyMoves(framed, zb.solution)), `wrong solution for "${scramble}"`);
    // ZBLL is `compete`, so on a scramble where plain OLL+PLL happens to be cheaper it
    // correctly does not fire. Count rather than require it.
    if (zb.segments.some((s) => s.unitId === "zbll")) {
      withZbll++;
      assert(!zb.segments.some((s) => s.unitId === "oll"), `oll also ran on "${scramble}"`);
    }
    plainCost += plain.cost;
    zbCost += zb.cost;
    n++;
  }
  assert(
    zbCost < plainCost,
    `ZB should beat plain CFOP in aggregate: ${(zbCost / n).toFixed(2)} vs ${
      (plainCost / n).toFixed(2)
    }`,
  );
});

// --- F2L as one step, whose strategies are the pair orders --------------------
//
// Which pair goes where is one decision, taken once, not four taken in sequence — so it is
// one Step racing 24 order strategies (plus a greedy one as a safety net), not four Steps
// each committing to the cheapest single insert. Every order is fully executed, so the race
// compares real threaded MCC and not the optimistic `peekCost` estimate raising
// `lookahead.depth` would supply. (That was measured and is the wrong tool: 13x the wall
// clock for a slightly worse result.)

const F2L_UNITS = new Set(["f2l", "f2lPseudo", "zbls"]);

/** Cost and move count of whatever covered the F2L span. */
function f2lSpan(res: { segments: { unitId: string; cost: number; moves: Move[] }[] }) {
  let cost = 0, moves = 0;
  for (const seg of res.segments) {
    if (!F2L_UNITS.has(seg.unitId)) continue;
    cost += seg.cost;
    moves += seg.moves.filter((m) => !"xyz".includes(m.family)).length;
  }
  return { cost, moves };
}

Deno.test("F2L is one step, and it names the order it inserted", async () => {
  for (const scramble of SCRAMBLES.slice(0, 6)) {
    const res = await cfop.solve(scramble);
    const seg = res.segments.find((s) => s.unitId === "f2l");
    assert(seg, `no f2l segment for "${scramble}"`);
    // The winner is either a named order or the greedy safety net.
    assert(
      /^order(FR|FL|BL|BR){4}$/.test(seg.strategyId) || seg.strategyId === "greedy",
      `unexpected strategy id ${seg.strategyId}`,
    );
    assert(f2lSolved(seg.phases.at(-1)!.endState), `F2L incomplete on "${scramble}"`);
  }
});

// How the two kinds of strategy actually split, recorded rather than assumed. The greedy
// any-order strategy wins MOST races — 14 of 20 — and that is not a defect: it keeps
// per-level variant pooling, which the 24 orders give up because a Step gets lookahead into
// the next one instead (see `InsertSequenceOptions.branchVariants`, and the aggregate test
// below, which is the claim that matters). An order winning 6 of 20 is what the exhaustive
// search is buying on top.
Deno.test("both kinds of F2L strategy win races, and the orders win some", async () => {
  let byOrder = 0, byGreedy = 0;
  for (const scramble of SCRAMBLES) {
    const seg = (await cfop.solve(scramble)).segments.find((s) => s.unitId === "f2l")!;
    if (seg.strategyId === "greedy") byGreedy++;
    else byOrder++;
  }
  assertEquals(byOrder + byGreedy, SCRAMBLES.length);
  // Both must be live. Zero orders would mean the search is dead weight; zero greedy would
  // mean the safety net is never exercised and its failure mode would go unnoticed.
  assert(byOrder > 0, "no scramble was won by a named order — is the order search dead?");
  assert(byGreedy > 0, "the greedy fallback never won — has it stopped competing?");
});

// The point of the exercise. Against the four-Step greedy shape `@moishy/steps` still
// exports, an exhaustive order is cheaper on the span it covers. Measured over 60 scrambles
// (the 20 here plus 40 seeded): F2L cost 30.32 -> 27.78, F2L moves 27.6 -> 25.9, better on
// 44, worse on 9, tied on 7. Asserted here in aggregate on a subset — per-scramble it can
// lose, since a fixed order forbids un-solving a slot the count-based goal would allow.
Deno.test("the order search beats a greedy walk on F2L, in aggregate", async () => {
  const greedyOnly = { stepOptions: { f2l: { forceStrategy: "greedy" } } };
  let greedy = 0, ordered = 0, n = 0;
  for (const scramble of SCRAMBLES.slice(0, 10)) {
    greedy += f2lSpan(await cfop.solve(scramble, greedyOnly)).cost;
    ordered += f2lSpan(await cfop.solve(scramble)).cost;
    n++;
  }
  assert(
    ordered < greedy,
    `expected cheaper F2L: greedy ${(greedy / n).toFixed(2)} vs ordered ${
      (ordered / n).toFixed(2)
    }`,
  );
});

Deno.test("pseudo-slotting is opt-in, and off by default", async () => {
  const res = await cfop.solve(SCRAMBLES[0]);
  assert(
    !res.segments.some((s) => s.unitId === "f2lPseudo"),
    "f2lPseudo must not fire unless explicitly enabled",
  );
});

// --- Pseudo-slotting ---------------------------------------------------------
//
// Insert pairs against a deliberately offset D layer, correcting with one D later. The
// mechanism is correct and it never wins, for a reason that is arithmetic rather than
// wiring: recognition is defined against an exact cross, so entering an offset and using it
// each cost a D turn and the correction costs another — while a pseudo cross can be at most
// ONE D turn cheaper than the exact one (if `M` leaves the cross solved up to `d`, then
// `M·d` solves it exactly). Its real value is in the cases the offset makes available, and
// an ergonomic cost model cannot see that. Both facts are asserted below.
Deno.test("pseudo-slotting, forced, still solves and lands F2L exactly", async () => {
  for (const scramble of SCRAMBLES.slice(0, 4)) {
    const res = await cfop.solve(scramble, {
      replacements: { f2lPseudo: { enabled: true, mode: "force" } },
    });
    assert(res.solved, `unsolved with f2lPseudo forced: ${scramble}`);
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(framed, res.solution)), `wrong solution for "${scramble}"`);
    const seg = res.segments.find((s) => s.unitId === "f2lPseudo");
    assert(seg, `f2lPseudo forced but did not fire on "${scramble}"`);
    // However the pairs went in, the span must hand over an EXACTLY solved F2L — the D
    // correction is what guarantees the next step sees no offset.
    assert(f2lSolved(seg.phases.at(-1)!.endState), `F2L not exact after pseudo on "${scramble}"`);
  }
});

Deno.test("pseudo-slotting does not pay from an exact cross", async () => {
  let used = 0, dearer = 0, n = 0;
  for (const scramble of SCRAMBLES.slice(0, 4)) {
    const exact = await cfop.solve(scramble);
    const pseudo = await cfop.solve(scramble, {
      replacements: { f2lPseudo: { enabled: true, mode: "force" } },
    });
    // Did any offset actually get used? The correction phase emits a move only if so.
    const correction = pseudo.segments
      .find((s) => s.unitId === "f2lPseudo")?.phases
      .find((p) => p.phaseId === "dCorrect");
    assert(correction, "the pseudo route must always run its correction phase");
    if (correction.moves.length > 0) used++;
    if (f2lSpan(pseudo).cost > f2lSpan(exact).cost + 1e-9) dearer++;
    n++;
  }
  // Recorded as the measurement it is, not as an aspiration: on these scrambles the offset
  // is never worth using, so the pseudo route returns the same F2L as the exact one. If
  // this ever starts failing, pseudo-slotting has found a reason to fire — which would be
  // interesting, and worth reading the module doc in @moishy/steps' f2l-order before
  // "fixing".
  assertEquals(used, 0, `the D offset was used on ${used}/${n} — see f2l-order's module doc`);
  assertEquals(dearer, 0, `pseudo came out dearer on ${dearer}/${n}, which compete would hide`);
});
