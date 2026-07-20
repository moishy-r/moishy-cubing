// Tests for the slice/wide-inclusive block-building search: the axis
// canonicalization and region-coordinate keying (geometry.ts), the cost-based
// center-aware pruning heuristic (pruning.ts), and the phase-chaining pool
// (searchAStarMany). See SPEC "block223" / "Center frame" and DESIGN.

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  applyMoves,
  createDefaultMoveCostModel,
  isSolved,
  type Move,
  type MoveFamily,
  parseAlg,
  scoreAlg,
  search,
  searchAStar,
  searchAStarMany,
  solvedCube,
  toFacelets,
} from "@moishy/cubing-core";
import { apb } from "../mod.ts";
import { axisCanonical, centersSolved, regionCoordinate, regionSolvedStrict } from "./geometry.ts";
import { regionHeuristic } from "./pruning.ts";

const BLOCK_MOVES: MoveFamily[] = [
  "U",
  "D",
  "L",
  "R",
  "F",
  "B",
  "M",
  "E",
  "S",
  "r",
  "l",
  "u",
  "d",
  "f",
  "b",
];
const CROSS = { corners: [] as number[], edges: [5, 6, 7] }; // DF, DL, DB (small region)

// Deterministic pseudo-random outer-move scrambles (no dependency on Math.random).
function scramble(seed: number, len: number): Move[] {
  const fams = ["U", "D", "L", "R", "F", "B"];
  let x = (seed * 40503 + 13) >>> 0;
  const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < len; i++) {
    let f;
    do f = fams[Math.floor(rnd() * 6)]; while (f === last);
    last = f;
    out.push(f + ["", "2", "'"][Math.floor(rnd() * 3)]);
  }
  return parseAlg(out.join(" "));
}

// --- Axis canonicalization ---------------------------------------------------

Deno.test("axisCanonical forbids same family, orders same-axis, allows cross-axis", () => {
  const m = (f: MoveFamily): Move => ({ family: f, amount: 1 });
  // same family: never
  assert(!axisCanonical(m("R"), { family: "R", amount: 2 }));
  // same axis (R-L): only in increasing rank (R < r < M < L < l)
  assert(axisCanonical(m("R"), m("L"))); // rank 0 < 3
  assert(!axisCanonical(m("L"), m("R"))); // rank 3 > 0 → the redundant order
  assert(axisCanonical(m("R"), m("M"))); // 0 < 2
  // cross-axis: always allowed, both directions
  assert(axisCanonical(m("R"), m("U")));
  assert(axisCanonical(m("U"), m("R")));
});

Deno.test("axisCanonical is cost-safe for the shipped 2H and OH models", () => {
  // Guard for the precondition its cost-optimality rests on: reordering a run of
  // commuting same-axis moves, given fixed cross-axis flanks, does not change the
  // segment's MCC cost (rights-before-lefts is a cheapest ordering). If a future
  // cost model breaks this, axis canonicalization must be disabled for it.
  for (
    const model of [
      createDefaultMoveCostModel({ mode: "2H" }),
      createDefaultMoveCostModel({ mode: "OH" }),
    ]
  ) {
    // An L-R axis run flanked by U on both sides, in canonical vs a swapped order.
    const canonical = parseAlg("U R L U"); // R(rank0) before L(rank3)
    const swapped = parseAlg("U L R U");
    assertAlmostEquals(
      scoreAlg(canonical, model),
      scoreAlg(swapped, model),
      1e-9,
      "same-axis reordering changed cost — axisCanonical would be unsafe",
    );
  }
});

// --- Cost-based, center-aware heuristic --------------------------------------

Deno.test("regionHeuristic is admissible, zero on goal, and center-aware", () => {
  const h = regionHeuristic(CROSS.corners, CROSS.edges, BLOCK_MOVES);
  const goal = regionSolvedStrict(CROSS);
  assertEquals(h(solvedCube()), 0);
  // Admissible: never exceeds the true optimal cost (compare vs cost-optimal IDA*
  // on the small cross region, which is tractable).
  for (let i = 0; i < 4; i++) {
    const s = applyMoves(solvedCube(), scramble(i, 8));
    const opt = search({ start: s, goal, moves: BLOCK_MOVES, heuristic: h });
    assert(h(s) <= opt.cost + 1e-9, `heuristic ${h(s)} overestimated true ${opt.cost}`);
  }
  // Center-aware: pieces home but centers drifted (an M2) → non-zero bound.
  const drifted = applyMoves(solvedCube(), parseAlg("M2"));
  assert(!centersSolved(drifted));
  assert(regionSolvedStrict(CROSS)(drifted) === false); // goal rejects drifted centers
  assert(h(drifted) > 0, "center-drifted state must get a positive bound");
});

// --- Region-coordinate keying + axis canonicalization stay cost-optimal ------

Deno.test("block search (slice/wide) is cost-optimal with coordinate key + axis canon", () => {
  const h = regionHeuristic(CROSS.corners, CROSS.edges, BLOCK_MOVES);
  const goal = regionSolvedStrict(CROSS);
  for (let i = 0; i < 4; i++) {
    const s = applyMoves(solvedCube(), scramble(i + 20, 10));
    // Reference: plain A* (sameFamily ordering, full-cube key) — no canon, no merge.
    const ref = searchAStar({
      start: s,
      goal,
      moves: BLOCK_MOVES,
      heuristic: h,
      stateKey: (x) => toFacelets(x),
    });
    // Optimized: axis canonicalization + region coordinate key.
    const opt = searchAStar({
      start: s,
      goal,
      moves: BLOCK_MOVES,
      heuristic: h,
      canFollow: axisCanonical,
      stateKey: regionCoordinate(CROSS),
    });
    assertAlmostEquals(opt.cost, ref.cost, 1e-9, `#${i} cost regressed`);
    assert(regionSolvedStrict(CROSS)(applyMoves(s, opt.moves)));
  }
});

// --- Phase-chaining pool ------------------------------------------------------

Deno.test("searchAStarMany returns distinct, cheapest-first solutions", () => {
  const h = regionHeuristic(CROSS.corners, CROSS.edges, BLOCK_MOVES);
  const goal = regionSolvedStrict(CROSS);
  const s = applyMoves(solvedCube(), scramble(3, 10));
  const pool = searchAStarMany({
    start: s,
    goal,
    moves: BLOCK_MOVES,
    heuristic: h,
    canFollow: axisCanonical,
    stateKey: regionCoordinate(CROSS),
    costSlack: 2,
    maxSolutions: 16,
  });
  assert(pool.length > 1, "expected multiple candidates within the cost slack");
  for (let i = 1; i < pool.length; i++) {
    assert(pool[i].cost >= pool[i - 1].cost - 1e-9, "pool not cheapest-first");
  }
  // Every candidate actually reaches the goal, and the cheapest matches the single
  // cost-optimal search.
  for (const c of pool) assert(regionSolvedStrict(CROSS)(applyMoves(s, c.moves)));
  const single = searchAStar({
    start: s,
    goal,
    moves: BLOCK_MOVES,
    heuristic: h,
    canFollow: axisCanonical,
    stateKey: regionCoordinate(CROSS),
  });
  assertAlmostEquals(pool[0].cost, single.cost, 1e-9);
});

// --- End to end: default (dual-CN), slices used, fixed frame -----------------

Deno.test("APB default solves end-to-end with slices, staying center-frame-correct", async () => {
  let usedSlice = 0, choseRotation = 0;
  for (let i = 0; i < 5; i++) {
    const scr = scramble(i + 40, 20);
    const res = await apb.solve(
      scr.map((m) => `${m.family}${["", "", "2", "'"][m.amount]}`).join(" "),
      {},
      {
        timeBudgetMs: 30_000,
      },
    );
    assert(res.solved, `#${i} not solved`);
    // Applying the reported solution to the (orientation-conjugated) scramble solves it.
    const oriented = applyMoves(solvedCube(), [
      ...invertAlg(res.orientation),
      ...scr,
      ...res.orientation,
    ]);
    assert(isSolved(applyMoves(oriented, res.solution)), `#${i} solution does not solve`);
    if (res.solution.some((m) => "MESrludfb".includes(m.family))) usedSlice++;
    if (res.orientation.length > 0) choseRotation++;
  }
  assert(usedSlice > 0, "expected at least one solution to use slice/wide moves");
  assert(choseRotation > 0, "expected dual-CN racing to pick a non-identity orientation");
});

// --- eoPair replacement (search-fed insert) solves end to end ----------------

Deno.test("eoPair replacement forms the pair keeping the block, then solves", async () => {
  // formPair must reach a state the eoPairInsert algset recognizes WITHOUT
  // disturbing the 2x2x3 — a pure "pair together fastest" search broke the block
  // and left nothing insertable. Forcing the replacement must still fully solve.
  const cfg = {
    replacements: { eoPair: { enabled: true, mode: "force" as const } },
    colorNeutrality: "fixed" as const,
  };
  for (let i = 0; i < 6; i++) {
    const scr = scramble(i, 20);
    const s = scr.map((m) => `${m.family}${["", "", "2", "'"][m.amount]}`).join(" ");
    const res = await apb.solve(s, cfg, { timeBudgetMs: 20_000 });
    assert(res.solved, `#${i} eoPair did not solve`);
    assert(isSolved(applyMoves(applyMoves(solvedCube(), scr), res.solution)), `#${i} bad solution`);
    // The eoPair region really ran (a formPair search segment is present).
    assert(res.segments.some((seg) => seg.phases.some((p) => p.phaseId === "formPair")));
  }
});

// --- dfdb r/M substitution driven by lookahead into brPair -------------------

Deno.test("lookahead into brPair picks the cheaper dfdb r/M variant, never worse", async () => {
  // Many dfdb cases store both an `r`-ending and an `M`-ending variant: both solve
  // DF/DB but leave the R layer (and so the BR pair) differently, giving different
  // brPair costs (SPEC "block223" r/M substitution). With lookahead active on
  // block223->brPair the runner should pick the block223 variant that minimizes
  // block223 + brPair together — so the combined cost with lookahead must never
  // exceed the greedy (lookahead-off) cost, and should beat it on some scrambles.
  const base = {
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
    colorNeutrality: "fixed" as const,
  };
  const withLA = {
    ...base,
    lookahead: { depth: 1, scope: [["block223", "brPair"]] as [string, string][] },
  };
  const noLA = { ...base, lookahead: { depth: 0 } };
  const pairCost = (res: { segments: { unitId: string; phases: { cost: number }[] }[] }) =>
    res.segments.filter((s) => s.unitId === "block223" || s.unitId === "brPair")
      .reduce((a, s) => a + s.phases.reduce((x, p) => x + p.cost, 0), 0);
  const asString = (s: Move[]) =>
    s.map((m) => `${m.family}${["", "", "2", "'"][m.amount]}`).join(" ");

  let cheaper = 0, worse = 0;
  for (let i = 0; i < 12; i++) {
    const scr = asString(scramble(i, 20));
    const a = pairCost(await apb.solve(scr, withLA, { timeBudgetMs: 20_000 }));
    const b = pairCost(await apb.solve(scr, noLA, { timeBudgetMs: 20_000 }));
    if (a < b - 1e-9) cheaper++;
    if (a > b + 1e-9) worse++;
  }
  assertEquals(worse, 0, "lookahead made block223+brPair more expensive on some scramble");
  assert(cheaper > 0, "lookahead never improved the r/M choice — is it wired?");
});

function invertAlg(moves: Move[]): Move[] {
  return moves.map((m) => ({ family: m.family, amount: ((4 - m.amount) % 4 || 4) as 1 | 2 | 3 }))
    .reverse();
}

// Regression: the block cost model (cubing-core `createBlockCostModel`, wired via
// the block phases' `SearchPhase.costModel`) makes block-building move-count-
// dominant and wide-averse. Above all, a wide `b` — which no one would ever do —
// must never appear in a first block, and awkward wides/slices should be rare.
// (The default MCC model, priced flatly, emitted a wide `b` in ~1/4 of solves.)
Deno.test("block223 never emits a wide b and keeps wides sparse", async () => {
  let wideB = 0, wides = 0, blocks = 0, moves = 0;
  for (let i = 0; i < 16; i++) {
    const scr = scramble(i * 7 + 1, 20).map((m) => `${m.family}${["", "", "2", "'"][m.amount]}`)
      .join(" ");
    const r = await apb.solve(scr, {}, { timeBudgetMs: 20_000 });
    assert(r.solved, `${scr}: must solve`);
    const block = r.segments[0].moves;
    blocks++;
    moves += block.length;
    for (const m of block) {
      if (m.family === "b") wideB++;
      if ("rludfb".includes(m.family)) wides++;
    }
  }
  assertEquals(wideB, 0, "a first block must never contain a wide b");
  assert(wides / blocks < 3, `too many wide moves per block (${(wides / blocks).toFixed(1)})`);
  assert(moves / blocks < 12, `blocks unexpectedly long (${(moves / blocks).toFixed(1)} avg)`);
});
