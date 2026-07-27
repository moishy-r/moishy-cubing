// FB + DFDB benchmark harness.
//
// Measures the block223 `fbDfdb` strategy over N seeded scrambles in two modes,
// to answer "does joint FB+DFDB optimization (phase-chaining) beat greedy?":
//
//   (a) no lookahead  — cheapest FB, then cheapest DFDB on it   (phaseChaining slack 0)
//   (b) lookahead     — allow a dearer FB for a cheaper combined FB+DFDB (slack 2)
//
// block223 is optimized by **move count** now (BLOCK_COST_MODEL, matching
// OnionHoney), so STM is the target metric and the primary (a)-vs-(b) signal is
// combined STM. MCC columns report the *ergonomic* cost of the resulting block
// (via scoreAlg) for information — mode (b) minimizes moves, so it can occasionally
// be a touch worse ergonomically while never worse in move count.
//
// Both run in a *fixed* frame so the two modes solve an identical cube (absolute
// numbers are fixed-orientation — dual-CN would be ~1 move lower), and with
// solve-global lookahead off so we isolate the FB→DFDB phase-chaining effect.
//
// Mode (a) uses slack 0 (not phaseChaining disabled): disabling returns the single
// globally-cheapest FB, which — if it lands DF/DB in a config the DFDB set doesn't
// cover — makes DFDB fail and the whole solve fail spuriously. slack 0 returns all
// FBs tied at the minimum cost, so DFDB picks a completable one: honest "best FB,
// then best DFDB" without false failures.
//
// The FB now leaves the U/F/D/B centers drifted about the L–R axis (the block
// still solves the L center); DFDB restores that drift in place. We also report
// how often the FB drifts (confirms the drift path is exercised) and assert DFDB
// always re-homes the centers.
//
// Run:  deno run -A packages/apb/scripts/fb_dfdb_bench.ts [n] [outDir]
//   n       number of scrambles (default 100)
//   outDir  where to write fb_dfdb_bench.{csv,json} (default: current dir)

import { apb } from "../mod.ts";
import { createDefaultMoveCostModel, scoreAlg, type SolveResult } from "@moishy/cubing-core";

// block223 is now optimized by *move count* (BLOCK_COST_MODEL), so a segment's
// internal `.cost` is in move-count units, not ergonomic MCC. For honest reporting
// we take STM straight from `.moves.length` (the optimization target) and compute
// the *true ergonomic MCC* of the resulting moves with the default 2H model.
const MCC = createDefaultMoveCostModel();

const N = Number(Deno.args[0] ?? "100");
const OUT_DIR = Deno.args[1] ?? ".";
const SOLVED_CN = [0, 1, 2, 3, 4, 5].join("");

// Deterministic outer-move scrambles (same LCG as blocksearch_test.ts), so runs
// are reproducible. ~22 moves is a full WCA-style scramble alphabet.
function scramble(seed: number, len: number): string {
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
  return out.join(" ");
}

interface Block {
  ok: boolean;
  fbMcc: number;
  fbStm: number;
  dfdbMcc: number;
  dfdbStm: number;
  combMcc: number;
  combStm: number;
  drift: boolean; // FB left the U/F/D/B centers drifted
  centersHome: boolean; // DFDB re-homed all centers (must always be true)
}

const FAIL: Block = {
  ok: false,
  fbMcc: NaN,
  fbStm: NaN,
  dfdbMcc: NaN,
  dfdbStm: NaN,
  combMcc: NaN,
  combStm: NaN,
  drift: false,
  centersHome: false,
};

function block(res: SolveResult): Block {
  const seg = res.segments.find((s) => s.unitId === "block223");
  if (!seg) return FAIL;
  const fb = seg.phases.find((p) => p.phaseId === "rouxFB");
  const df = seg.phases.find((p) => p.phaseId === "dfdb");
  if (!fb || !df) return FAIL;
  // MCC = the true ergonomic cost of the moves (informational); STM = move count
  // (what block223 now optimizes). fbMcc scores the FB from a fresh start; combMcc
  // scores the whole block threaded, so dfdb's marginal cost is comb − fb.
  const fbMcc = scoreAlg(fb.moves, MCC);
  const combMcc = scoreAlg(seg.moves, MCC);
  return {
    ok: true,
    fbMcc,
    fbStm: fb.moves.length,
    dfdbMcc: combMcc - fbMcc,
    dfdbStm: df.moves.length,
    combMcc,
    combStm: seg.moves.length,
    drift: fb.endState.cn.join("") !== SOLVED_CN,
    centersHome: df.endState.cn.join("") === SOLVED_CN,
  };
}

function run(scr: string, slack: number): Promise<SolveResult> {
  return apb.solve(scr, {
    colorNeutrality: "fixed",
    stepOptions: {
      block223: { forceStrategy: "fbDfdb", phaseChaining: { enabled: true, slack } },
    },
    lookahead: { depth: 0 },
  }, { timeBudgetMs: 30_000 });
}

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Row {
  seed: number;
  a: Block;
  b: Block;
  dStm: number; // a.combStm - b.combStm (≥0 means (b) helped — the target metric)
  dMcc: number; // a.combMcc - b.combMcc (ergonomic side-effect; may be < 0)
}

const rows: Row[] = [];
for (let i = 0; i < N; i++) {
  const scr = scramble(i, 22);
  const a = block(await run(scr, 0));
  const b = block(await run(scr, 2));
  const dMcc = a.ok && b.ok ? a.combMcc - b.combMcc : NaN;
  const dStm = a.ok && b.ok ? a.combStm - b.combStm : NaN;
  rows.push({ seed: i, a, b, dMcc, dStm });
  if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${N}`);
}

// --- Summary ---
const both = rows.filter((r) => r.a.ok && r.b.ok);
const aFail = rows.filter((r) => !r.a.ok).length;
const bFail = rows.filter((r) => !r.b.ok).length;
const badCenters = rows.filter((r) => (r.a.ok && !r.a.centersHome) || (r.b.ok && !r.b.centersHome));
// STM is the optimization target, so "helped" / "regression" key on move count.
const helped = both.filter((r) => r.dStm > 1e-9).length;
const neutral = both.filter((r) => Math.abs(r.dStm) <= 1e-9).length;
const mccImproved = both.filter((r) => r.dMcc > 1e-9).length;
const stmRegressions = both.filter((r) => r.dStm < -1e-9); // should be none: slack2 ⊇ slack0

const summary = {
  n: N,
  solvedBoth: both.length,
  aFail,
  bFail,
  centersLeftUnhome: badCenters.length,
  aDriftPct: rows.filter((r) => r.a.ok && r.a.drift).length / (N - aFail || 1),
  // Primary: combined move count (what block223 optimizes).
  meanCombStm: { a: mean(both.map((r) => r.a.combStm)), b: mean(both.map((r) => r.b.combStm)) },
  medianCombStm: {
    a: median(both.map((r) => r.a.combStm)),
    b: median(both.map((r) => r.b.combStm)),
  },
  lookaheadHelpedPct: helped / (both.length || 1),
  neutralPct: neutral / (both.length || 1),
  meanDeltaStm: mean(both.map((r) => r.dStm)),
  medianDeltaStm: median(both.map((r) => r.dStm)),
  stmRegressions: stmRegressions.map((r) => ({ seed: r.seed, dStm: r.dStm })),
  // Informational: ergonomic MCC of the resulting block (not the target).
  meanCombMcc: { a: mean(both.map((r) => r.a.combMcc)), b: mean(both.map((r) => r.b.combMcc)) },
  mccImprovedPct: mccImproved / (both.length || 1),
  meanDeltaMcc: mean(both.map((r) => r.dMcc)),
  topWins: [...both].sort((a, b) => b.dStm - a.dStm).slice(0, 5).map((r) => ({
    seed: r.seed,
    dStm: r.dStm,
    aStm: r.a.combStm,
    bStm: r.b.combStm,
  })),
};

// --- Output files ---
const csvHead = "seed,a_ok,a_fbMcc,a_fbStm,a_dfdbMcc,a_dfdbStm,a_combMcc,a_combStm,a_drift," +
  "b_ok,b_fbMcc,b_fbStm,b_dfdbMcc,b_dfdbStm,b_combMcc,b_combStm,b_drift,dMcc,dStm";
const num = (x: number) => Number.isFinite(x) ? x.toFixed(3) : "";
const csv = [
  csvHead,
  ...rows.map((r) =>
    [
      r.seed,
      r.a.ok ? 1 : 0,
      num(r.a.fbMcc),
      num(r.a.fbStm),
      num(r.a.dfdbMcc),
      num(r.a.dfdbStm),
      num(r.a.combMcc),
      num(r.a.combStm),
      r.a.drift ? 1 : 0,
      r.b.ok ? 1 : 0,
      num(r.b.fbMcc),
      num(r.b.fbStm),
      num(r.b.dfdbMcc),
      num(r.b.dfdbStm),
      num(r.b.combMcc),
      num(r.b.combStm),
      r.b.drift ? 1 : 0,
      num(r.dMcc),
      num(r.dStm),
    ].join(",")
  ),
].join("\n");

await Deno.writeTextFile(`${OUT_DIR}/fb_dfdb_bench.csv`, csv + "\n");
await Deno.writeTextFile(
  `${OUT_DIR}/fb_dfdb_bench.json`,
  JSON.stringify({ summary, rows }, null, 2),
);

console.log("\n=== FB+DFDB benchmark ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nWrote ${OUT_DIR}/fb_dfdb_bench.csv and .json`);
if (badCenters.length) {
  console.error(`\n!! ${badCenters.length} solves left centers un-home after DFDB — BUG`);
}
if (stmRegressions.length) {
  console.error(
    `\n!! ${stmRegressions.length} STM regressions (b worse than a) — BUG (slack2 ⊇ slack0)`,
  );
}
