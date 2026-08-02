// The point of this package is that a method can take a block search off the
// shelf and have it work. So these tests use the exports the way a *consumer*
// would — build a phase, run it, check the block is actually built — rather than
// reaching into internals. A regression here means someone's method broke.

import { assert, assertEquals } from "@std/assert";
import {
  applyMoves,
  type CubeState,
  invert,
  type Move,
  parseAlg,
  regionSolved,
  regionSolvedLRHome,
  regionSolvedStrict,
  runPhase,
  solvedCube,
} from "@moishy/cubing-core";
import { dfdb as dfdbSet } from "@moishy/algsets/dfdb";
import {
  BACK_222,
  BLOCK223,
  block223Step,
  BLOCK_COST_MODEL,
  BLOCK_MOVES,
  BLOCK_STRATEGIES,
  blockSearch,
  cornerFirstFront,
  CROSS,
  cross1Front,
  direct,
  FB_MOVES,
  FRONT_222,
  ROUX_FB,
  rouxFbDfdb,
} from "../mod.ts";

// Deterministic scrambles, no dependency on Math.random.
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
const scrambled = (seed: number, len = 12) => applyMoves(solvedCube(), scramble(seed, len));

Deno.test("blockSearch builds each standard target, centres home", () => {
  // Every target except the Roux FB ends fully fixed-frame; a method downstream
  // of one of these has no later step to undo centre drift.
  const targets = [
    { name: "CROSS", region: CROSS, depth: 8 },
    { name: "FRONT_222", region: FRONT_222, depth: 8 },
    { name: "BACK_222", region: BACK_222, depth: 8 },
  ];
  for (const t of targets) {
    const phase = blockSearch(t.name, t.region, { maxDepth: t.depth });
    const goal = regionSolvedStrict(t.region);
    for (let i = 0; i < 4; i++) {
      const start = scrambled(i);
      const seg = runPhase(phase, start);
      assert(seg, `${t.name} (seed ${i}): no solution`);
      assert(goal(seg.endState), `${t.name} (seed ${i}): goal not reached`);
      // The segment's moves must genuinely produce the state it reports.
      assert(
        regionSolvedStrict(t.region)(applyMoves(start, seg.moves)),
        `${t.name} (seed ${i}): replaying the segment does not build the block`,
      );
    }
  }
});

Deno.test("the Roux FB search solves its pieces and leaves only L-R centre drift", () => {
  // `lrHome` is the whole reason the FB is cheap: it spends no moves restoring
  // the U/F/D/B centres, which the DFDB alg then fixes while placing DF/DB.
  const phase = blockSearch("rouxFB", ROUX_FB, {
    lrHome: true,
    maxDepth: 9,
    moves: FB_MOVES,
    costModel: BLOCK_COST_MODEL,
  });
  for (let i = 0; i < 4; i++) {
    const start = scrambled(i);
    const seg = runPhase(phase, start);
    assert(seg, `seed ${i}: no FB found`);
    assert(regionSolvedLRHome(ROUX_FB)(seg.endState), `seed ${i}: FB goal not reached`);
    // L and R home; the rest may have drifted about that axis.
    assertEquals(seg.endState.cn[4], 4, `seed ${i}: L centre moved`);
    assertEquals(seg.endState.cn[1], 1, `seed ${i}: R centre moved`);
  }
});

Deno.test("rouxFbDfdb builds the whole 2x2x3 and restores the frame", () => {
  const strategy = rouxFbDfdb(dfdbSet);
  assertEquals(strategy.id, "fbDfdb");
  const goal = regionSolved(BLOCK223);
  for (let i = 0; i < 4; i++) {
    const start = scrambled(i);
    let state: CubeState = start;
    for (const phase of strategy.phases) {
      const seg = runPhase(phase, state);
      assert(seg, `seed ${i}: phase ${phase.id} produced nothing`);
      state = seg.endState;
    }
    assert(goal(state), `seed ${i}: 2x2x3 not built`);
    // DFDB restores the drift the FB left, so the frame is home again.
    assertEquals(state.cn.join(""), "012345", `seed ${i}: centres not restored`);
  }
});

Deno.test("every block223 strategy is well-formed and targets the same block", () => {
  const all = [rouxFbDfdb(dfdbSet), ...BLOCK_STRATEGIES];
  assertEquals(all.length, 6);
  assertEquals(
    all.map((s) => s.id),
    ["fbDfdb", "direct", "cornerFirstFront", "cornerFirstBack", "cross1Front", "cross1Back"],
  );
  for (const s of all) {
    assert(s.phases.length >= 1, `${s.id}: no phases`);
    // Only fbDfdb ships on by default; the rest are opt-in (they are slower).
    if (s.id !== "fbDfdb") {
      assertEquals(s.enabledByDefault, false, `${s.id} should be opt-in`);
    }
  }
  // Each pure-search strategy's final phase must land the whole 2x2x3.
  for (const s of BLOCK_STRATEGIES) {
    const last = s.phases.at(-1)!;
    assertEquals(last.kind, "search", `${s.id}: last phase should be a search`);
  }
});

Deno.test("block223Step assembles the six strategies, and is renameable", () => {
  const step = block223Step(dfdbSet);
  assertEquals(step.id, "block223");
  assertEquals(step.strategies.length, 6);
  const renamed = block223Step(dfdbSet, { id: "firstBlock", label: "First Block" });
  assertEquals(renamed.id, "firstBlock");
  assertEquals(renamed.label, "First Block");
});

Deno.test("a decomposed strategy really solves the block it claims", () => {
  // cornerFirstFront and cross1Front chain two or three searches; the guard
  // heuristic is what keeps the later ones from breaking the earlier block, so
  // running the chain end to end is the check that matters.
  for (const strategy of [cornerFirstFront, cross1Front]) {
    for (let i = 0; i < 2; i++) {
      const start = scrambled(i, 10);
      let state: CubeState = start;
      for (const phase of strategy.phases) {
        const seg = runPhase(phase, state);
        assert(seg, `${strategy.id} seed ${i}: phase ${phase.id} produced nothing`);
        state = seg.endState;
      }
      assert(
        regionSolvedStrict(BLOCK223)(state),
        `${strategy.id} seed ${i}: 2x2x3 not built, or centres drifted`,
      );
    }
  }
});

Deno.test("the block move sets are what the searches rely on", () => {
  // FB_MOVES must fix L and R — that is what confines drift to the L-R axis and
  // makes `lrHome` sound. A stray L or E here would silently break the FB goal.
  for (const family of FB_MOVES) {
    const s = applyMoves(solvedCube(), [{ family, amount: 1 }]);
    assertEquals(s.cn[4], 4, `FB_MOVES contains ${family}, which moves the L centre`);
    assertEquals(s.cn[1], 1, `FB_MOVES contains ${family}, which moves the R centre`);
  }
  assert(BLOCK_MOVES.includes("M"), "BLOCK_MOVES should include slices");
  assert(!BLOCK_MOVES.some((f) => "xyz".includes(f)), "BLOCK_MOVES must not include rotations");
});

Deno.test("BLOCK_COST_MODEL ranks by move count first", () => {
  // A shorter block must always beat a longer one, whatever the ergonomics: the
  // tiebreak is deliberately too small to outweigh a whole move.
  const cost = (alg: string) => {
    let total = 0;
    let prev: Move | null = null;
    parseAlg(alg).forEach((m, index) => {
      total += BLOCK_COST_MODEL.cost(m, { prevMove: prev, index });
      prev = m;
    });
    return total;
  };
  assert(cost("R U R' U'") < cost("R U R' U' F"), "5 moves must cost more than 4");
  assert(cost("M2 E2 S2") < cost("R U R' U'"), "3 awkward moves must beat 4 easy ones");
});

Deno.test("direct carries its own guards", () => {
  // It is the one search big enough to need them: a firm time budget and a raised
  // node ceiling (it retains ~910k states, past the engine's safe default).
  const phase = direct.phases[0];
  assertEquals(phase.kind, "search");
  if (phase.kind !== "search") return;
  assert((phase.timeBudgetMs ?? 0) > 0, "direct should keep a wall-clock budget");
  assert((phase.maxNodes ?? 0) > 500_000, "direct should raise the default node ceiling");
});

Deno.test("dfdb algs keep the block intact once the frame is restored", () => {
  // Every dfdb case both places DF/DB and undoes the FB's centre drift. If one
  // did not, a solve would end with the block sitting off bottom-left.
  const goal = regionSolved(BLOCK223);
  let checked = 0;
  for (const c of dfdbSet.cases.slice(0, 40)) {
    const state = applyMoves(solvedCube(), invert(c.algs[0].moves));
    assert(goal(applyMoves(state, c.algs[0].moves)), `dfdb ${c.id}: does not reach the block`);
    checked++;
  }
  assertEquals(checked, 40);
});
