// Tests for the slice/wide-inclusive block-building search: the axis
// canonicalization and region-coordinate keying, the cost-based center-aware
// pruning heuristic (both now cubing-core), and the phase-chaining pool
// (searchAStarMany). See SPEC "block223" / "Center frame" and DESIGN.

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  applyMoves,
  axisCanonical,
  centersSolved,
  createDefaultMoveCostModel,
  type CubeState,
  isSolved,
  type Move,
  type MoveFamily,
  parseAlg,
  pieceSignature,
  regionCoordinate,
  regionHeuristic,
  regionHeuristicMulti,
  regionSolvedLRHome,
  regionSolvedStrict,
  scoreAlg,
  search,
  searchAStar,
  searchAStarMany,
  solvedCube,
  toFacelets,
} from "@moishy/cubing-core";
import { apb } from "../mod.ts";
import { dfdb as dfdbSet } from "@moishy/algsets/dfdb";
import { BLOCK223 } from "./geometry.ts";

const ROUX_FB = { corners: [5, 6], edges: [6, 9, 10] };
// Build a synthetic state with solved pieces but a given center permutation, to
// probe the FB goal/heuristic at exact center-drift states.
const withCenters = (cn: number[]) => ({ ...solvedCube(), cn });
// Deterministic string scramble (Move[] → the solver's string input).
const scrStr = (seed: number, len: number) =>
  scramble(seed, len).map((m) => m.family + ["", "", "2", "'"][m.amount]).join(" ");

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

// The `direct` strategy's group set (apb.ts DIRECT_GROUPS), duplicated here so the
// properties it relies on are asserted directly against the heuristic.
const DIRECT_GROUPS = [
  { corners: [5, 6], edges: [5, 6, 7] },
  { corners: [5, 6], edges: [5, 9, 10] },
  { corners: [5, 6], edges: [6, 9] },
  { corners: [5, 6], edges: [6, 10] },
  { corners: [5, 6], edges: [7, 9] },
  { corners: [5, 6], edges: [7, 10] },
];

Deno.test("regionHeuristicMulti: admissible on the full 2x2x3, and tighter than the split", () => {
  const hMulti = regionHeuristicMulti(DIRECT_GROUPS, BLOCK_MOVES);
  // The bound `direct` used before: one corners+centers table maxed with one
  // 5-edge table — admissible, but blind to every corner<->edge interaction.
  const hSplit = regionHeuristic([...BLOCK223.corners], [...BLOCK223.edges], BLOCK_MOVES);
  const goal = regionSolvedStrict(BLOCK223);

  assertEquals(hMulti(solvedCube()), 0);
  // Center-aware: the block's pieces home but the centers drifted must still cost.
  const drifted = applyMoves(solvedCube(), parseAlg("M2"));
  assert(!goal(drifted));
  assert(hMulti(drifted) > 0, "center-drifted state must get a positive bound");

  for (let i = 0; i < 4; i++) {
    // Shallow scrambles keep the ground-truth search (run under the *loose* split
    // heuristic, so it cannot be biased by the bound under test) tractable.
    const s = applyMoves(solvedCube(), scramble(i + 60, 5));
    const opt = searchAStar({
      start: s,
      goal,
      moves: BLOCK_MOVES,
      heuristic: hSplit,
      canFollow: axisCanonical,
      stateKey: regionCoordinate(BLOCK223),
    });
    assert(opt.found);
    assert(
      hMulti(s) <= opt.cost + 1e-9,
      `#${i} multi bound ${hMulti(s)} overestimated true ${opt.cost}`,
    );
    // ...and it really is the tighter of the two, which is the whole point.
    assert(hMulti(s) >= hSplit(s) - 1e-9, `#${i} multi bound is looser than the split`);
  }
});

Deno.test("regionHeuristicMulti: a group's bound dominates its subsets' bounds", () => {
  // Why DIRECT_GROUPS lists only the four 2-edge sets neither 3-edge group contains:
  // tracking *more* pieces of the same goal can only raise the bound, so a group
  // contained in another is redundant and would cost lookups and build time for
  // nothing. If this ever fails, the dropped pairs must be restored.
  const bigger = regionHeuristicMulti([{ corners: [5, 6], edges: [5, 6, 7] }], BLOCK_MOVES);
  const smaller = regionHeuristicMulti([{ corners: [5, 6], edges: [5, 6] }], BLOCK_MOVES);
  for (let i = 0; i < 12; i++) {
    const s = applyMoves(solvedCube(), scramble(i + 80, 8));
    assert(
      bigger(s) >= smaller(s) - 1e-9,
      `superset group bound ${bigger(s)} fell below its subset's ${smaller(s)}`,
    );
  }
});

Deno.test("regionHeuristic (foldLR) is admissible for the drift-allowing FB goal", () => {
  const hFold = regionHeuristic(ROUX_FB.corners, ROUX_FB.edges, BLOCK_MOVES, undefined, {
    foldLR: true,
  });
  const hStrict = regionHeuristic(ROUX_FB.corners, ROUX_FB.edges, BLOCK_MOVES);
  const goal = regionSolvedLRHome(ROUX_FB);

  // Zero on all four L–R-axis solved-FB states (id, x, x2, x'); the goal accepts
  // them and the strict, all-centers-home table charges >0 for the drifted three.
  assertEquals(hFold(solvedCube()), 0);
  for (const k of ["x", "x2", "x'"]) {
    const gs = withCenters(applyMoves(solvedCube(), parseAlg(k)).cn);
    assert(goal(gs), `LR goal must accept the ${k} center drift`);
    assertEquals(hFold(gs), 0, `folded heuristic must be 0 on the ${k} drift`);
    assert(hStrict(gs) > 0, `strict heuristic should charge for the ${k} drift`);
  }

  // The fold only *adds* goal states, so its bound never exceeds the strict one.
  for (let i = 0; i < 8; i++) {
    const s = applyMoves(solvedCube(), scramble(i, 10));
    assert(hFold(s) <= hStrict(s) + 1e-9, `folded ${hFold(s)} exceeded strict ${hStrict(s)}`);
  }

  // Admissible: never exceeds the true optimal cost to the LR-home goal. Ground
  // truth via a *zero* heuristic (IDA* then returns the true optimum, independent
  // of the folded table); kept cheap with very shallow scrambles + axis
  // canonicalization so the unguided search still terminates fast.
  for (let i = 0; i < 4; i++) {
    const s = applyMoves(solvedCube(), scramble(i, 2));
    const opt = search({
      start: s,
      goal,
      moves: BLOCK_MOVES,
      heuristic: () => 0,
      canFollow: axisCanonical,
      // Ground truth is deliberately *unguided*, so it expands far more nodes than
      // any real phase — well past the engine's safety ceiling
      // (`DEFAULT_MAX_NODES`, which exists to stop a runaway search exhausting the
      // heap). Lift it here, exactly as a test lifts `searchTimeBudgetMs`, so a
      // failure means "the heuristic overestimates", not "the ceiling cut the
      // reference search short".
      maxNodes: Infinity,
    });
    assert(opt.found);
    assert(hFold(s) <= opt.cost + 1e-9, `folded ${hFold(s)} overestimated true ${opt.cost}`);
  }
});

Deno.test("dfdb raw (DF,DB,cn) recognition signature is collision-free across all cases", () => {
  // The drift-allowing FB leaves the centers drifted, so DFDB recognizes on the
  // raw DF/DB placement + the center permutation (no orientation normalization).
  // Every one of the 527 cases must get a distinct key, or a drifted input would
  // mis-recognize. If this ever fails, widen the signature (see apb.ts dfdbSignature).
  const sig = (s: CubeState) => pieceSignature([], [5, 7])(s) + "/" + s.cn.join("");
  const seen = new Map<string, string>();
  for (const c of dfdbSet.cases) {
    const key = sig(dfdbSet.recognitionState(c.id));
    const prev = seen.get(key);
    assert(prev === undefined, `signature collision: ${c.id} vs ${prev} on "${key}"`);
    seen.set(key, c.id);
  }
  assertEquals(seen.size, dfdbSet.cases.length);
});

Deno.test("fbDfdb: drift-allowing FB + DFDB completes a strict 2x2x3 and full solve", async () => {
  for (let i = 0; i < 12; i++) {
    const res = await apb.solve(scrStr(i, 22), {
      colorNeutrality: "fixed",
      stepOptions: { block223: { forceStrategy: "fbDfdb" } },
    }, { timeBudgetMs: 30_000 });
    const seg = res.segments.find((s) => s.unitId === "block223");
    assert(seg, `#${i} block223 did not run`);
    // After DFDB the full 2x2x3 is solved AND all centers are home (drift restored).
    assert(
      regionSolvedStrict(BLOCK223)(seg!.phases.at(-1)!.endState),
      `#${i} block223 not strictly solved (centers or pieces off)`,
    );
    assert(res.solved, `#${i} full solve failed`);
  }
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

// --- Phase 2: the opt-in block strategies build a strict 2x2x3 ---------------

// direct / corner-first / cross-1 each build the *full* 2x2x3 (incl. DF/DB and
// the D center), so they must end fully centers-home (strict). Force each with
// phase-chaining off (one first-phase candidate → one second search, avoiding the
// per-candidate blowup) and confirm it builds a strict block and completes a full
// solve within its depth cap.
//
// corner-first and cross-1 are three-phase (cross → pair → pair, each guarded);
// `direct` is a single deep whole-block search, guided by the maxed multi-table
// bound (`DIRECT_GROUPS` in apb.ts). All four run the same scramble set: `direct`
// used to need a hand-picked pair of seeds because the loose corners-vs-edges split
// left it timing out (>30s) or exhausting the heap on most scrambles.
for (
  const { id, seeds } of [
    { id: "cornerFirstFront", seeds: [200, 201, 202, 203, 204] },
    { id: "cornerFirstBack", seeds: [200, 201, 202, 203, 204] },
    { id: "cross1Front", seeds: [200, 201, 202, 203, 204] },
    { id: "cross1Back", seeds: [200, 201, 202, 203, 204] },
    { id: "direct", seeds: [200, 201, 202, 203, 204] },
  ]
) {
  Deno.test(`block223 strategy '${id}' builds a strict 2x2x3 and full solve`, async () => {
    for (const seed of seeds) {
      const res = await apb.solve(scrStr(seed, 20), {
        colorNeutrality: "fixed",
        stepOptions: {
          block223: {
            forceStrategy: id,
            phaseChaining: { enabled: false },
            // This test is about correctness, not speed. `direct` ships a wall-clock
            // budget so it can drop out of a race instead of hanging a solve — which
            // makes it machine-dependent, and a slow CI runner really did drop it
            // here, failing the run. Lift the budget so the assertion below means
            // "the strategy is broken", never "the runner was busy".
            searchTimeBudgetMs: { full: 120_000 },
          },
        },
      }, { timeBudgetMs: 120_000 });
      const seg = res.segments.find((s) => s.unitId === "block223");
      assert(seg && seg.strategyId === id, `seed ${seed} ${id} did not run`);
      assert(
        regionSolvedStrict(BLOCK223)(seg!.phases.at(-1)!.endState),
        `seed ${seed} ${id} did not build a strict 2x2x3`,
      );
      assert(res.solved, `seed ${seed} ${id} full solve failed`);
    }
  });
}

Deno.test("searchMaxDepth override lifts a phase's static cap", async () => {
  // A pathologically tight cap makes fbDfdb's rouxFB unsolvable → block223 fails.
  const scr = scrStr(3, 20);
  const tight = await apb.solve(scr, {
    colorNeutrality: "fixed",
    stepOptions: { block223: { forceStrategy: "fbDfdb", searchMaxDepth: { rouxFB: 2 } } },
  }, { timeBudgetMs: 20_000 });
  assert(!tight.solved, "a 2-move FB cap should make block223 (hence the solve) fail");
  // Lifting it back well past the FB length solves normally again.
  const loose = await apb.solve(scr, {
    colorNeutrality: "fixed",
    stepOptions: { block223: { forceStrategy: "fbDfdb", searchMaxDepth: { rouxFB: 20 } } },
  }, { timeBudgetMs: 20_000 });
  assert(loose.solved, "raising the cap should solve again");
});

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
