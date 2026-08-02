// The 2x2x3 block step: six strategies for building it, raced against each other.
//
// None of these factorings is APB's — first block then the DF/DB pair, one 2x2x2
// then the rest, a cross then two pairs. A Roux solver wants `rouxFbDfdb`'s first
// phase on its own; Petrus wants `cornerFirst*`; CFOP wants the `CROSS` search
// from ./blocks.ts. They are exported individually for that, and as a ready-made
// Step for a method that wants the whole race.
//
// `rouxFbDfdb` is the one that needs data: its second phase places DF/DB by alg,
// so it takes the `dfdb` algset. That is the reason this package depends on
// `@moishy/algsets` at all — see the package README.

import { type AlgSet, regionLookupRaw } from "@moishy/algsets";
import {
  type CubeState,
  type MethodDefinition,
  pieceSignature,
  regionCoordinate,
  regionSolved,
  type Strategy,
} from "@moishy/cubing-core";
import {
  BACK_222,
  BLOCK223,
  BLOCK_COST_MODEL,
  blockSearch,
  CROSS,
  CROSS_PAIR_BACK,
  CROSS_PAIR_FRONT,
  DIRECT_GROUPS,
  FB_MOVES,
  FRONT_222,
  ROUX_FB,
} from "./blocks.ts";

/** A core Step, as a method definition lists them. */
export type Step = MethodDefinition["steps"][number];

// dfdb places DF (edge 5) + DB (edge 7) onto a solved Roux FB.
//
// The FB (`regionSolvedLRHome`) leaves the U/F/D/B centers drifted about the L–R
// axis; the DFDB alg both places DF/DB *and* restores that drift. Which case
// applies therefore depends on the drift, not only on where DF/DB sit — so
// recognition must read the raw centers (`regionLookupRaw`, no orientation
// normalization) and the signature must include the center permutation `s.cn`.
// (A plain `regionLookup` would `normalizeOrientation` the drift away, collapsing
// distinct center-correction cases onto one key.) The 527-case set already
// encodes every drift; only the recognition wiring changed.
export const dfdbSignature = (s: CubeState): string =>
  pieceSignature([], [5, 7])(s) + "/" + s.cn.join("");

// fbDfdb: Roux FB by search, then DF/DB by alg (phase-chaining feeds the FB
// candidate pool into the DFDB scorer — the reference case for chaining).
/**
 * Roux first block by search, then DF/DB by alg — the reference phase-chaining
 * strategy, and by a wide margin the cheapest of the six to run. Takes the `dfdb`
 * algset so a method can supply its own transition table.
 */
export function rouxFbDfdb(dfdbSet: AlgSet): Strategy {
  const dfdbLookup = regionLookupRaw(dfdbSet, dfdbSignature);
  return {
    id: "fbDfdb",
    label: "RouxFB + DFDB",
    phases: [
      {
        // rouxFB uses the full slice/wide move set and the drift-allowing goal
        // (`lrHome`): it solves the 6 FB pieces incl. the L center, leaving only
        // the U/F/D/B centers drifted about the L–R axis. This is the natural,
        // cheap Roux FB — no moves spent restoring those centers, which the
        // `dfdb` alg below restores while placing DF/DB. `poolStateKey` (which
        // includes `cn`) keeps FB candidates that differ in the DF/DB pair or
        // the drift distinct, so phase-chaining races them and keeps the
        // cheapest combined FB+DFDB.
        ...blockSearch("rouxFB", ROUX_FB, {
          lrHome: true,
          maxDepth: 9,
          moves: FB_MOVES,
          costModel: BLOCK_COST_MODEL,
        }),
        poolStateKey: regionCoordinate({
          corners: [5, 6],
          edges: [6, 9, 10, 5, 7],
        }),
      },
      // frameRelative: the FB leaves the U/F/D/B centers drifted and DFDB
      // restores them in place — homing would relocate the block off BL. Uses the
      // same move-count `BLOCK_COST_MODEL` as the FB so block223 is ranked as a
      // coherent unit (fewest total moves), not FB-moves + DFDB-ergonomics.
      {
        kind: "algorithmic" as const,
        id: "dfdb",
        goal: regionSolved(BLOCK223),
        cases: dfdbLookup,
        auf: ["U" as const],
        frameRelative: true,
        costModel: BLOCK_COST_MODEL,
      },
    ],
  };
}

// Pure-search strategies (no algs). `direct` searches the whole 2x2x3 at
// once; the corner-first/cross strategies solve smaller sub-blocks first.
// `direct` stays disabled by default, but is no longer pathological: guided by
// the maxed multi-table bound (`DIRECT_GROUPS`) it finds the block in ~0.1–1.4s
// per orientation (mean ~0.35s) where the old split heuristic routinely ran past
// 15s or exhausted the heap. It is still the most expensive block223 strategy —
// one deep 7-piece search against three or four tiny guarded ones — and it wins
// only on the scrambles whose shortest 2x2x3 does not factor as "2x2x2 first" or
// "cross first", so it is opt-in via `enabledStrategies`/`forceStrategy`.
/** One search for the whole 7-piece block. The most expensive of the six, and the
 * only one that finds a block which does not factor as 2x2x2-first or cross-first. */
export const direct: Strategy = {
  id: "direct",
  label: "Direct blockbuilding",
  enabledByDefault: false,
  // Single deep search for the whole 7-piece block; capped at 14 STM (a
  // direct block is ~7–13 STM in practice, so this admits it with headroom
  // while still bounding a runaway search).
  phases: [blockSearch("full", BLOCK223, {
    maxDepth: 14,
    heuristicGroups: DIRECT_GROUPS,
    // Firm per-orientation budget. Worst case measured ~1.4s over 24 scrambles on
    // a fast laptop; a shared CI runner is several times slower, and an initial
    // 3s cap duly dropped `direct` mid-release on one. 15s keeps the runaway
    // protection (a pathological scramble costs `direct` its slot in the race
    // rather than the solve's whole budget) with enough headroom that a merely
    // slow machine does not change which strategies answer. Raise or lower per
    // solve with `stepOptions.block223.searchTimeBudgetMs.full`.
    timeBudgetMs: 15_000,
    // One search for the whole 7-piece block legitimately retains ~910k states
    // — measured over 8 scrambles — which is past the engine's safe default
    // (DEFAULT_MAX_NODES, sized so a runaway search cannot exhaust the heap).
    // Raise it here rather than lower the bar for every other search; the 15s
    // budget above is still this phase's primary guard.
    maxNodes: 2_000_000,
  })],
};

// Corner-first and cross strategies are registered but disabled by default.
// Their second phase completes the block with another *search* (not a fast alg
// lookup like fbDfdb's dfdb), so with phase-chaining on they re-run that search
// for every pooled first-phase candidate — much slower to race than fbDfdb,
// for a block that is rarely cheaper. Opt in via `enabledStrategies`. Each first
// phase is capped; each second phase maxes a tight added-pieces table with a
// whole-block guard (`guardGoal`) so it keeps the first block intact rather than
// wandering — measured ~22× fewer nodes at identical block quality.
/** A 2x2x2 at the front, then the rest of the block. */
export const cornerFirstFront: Strategy = {
  id: "cornerFirstFront",
  label: "Corner-first (front)",
  enabledByDefault: false,
  // chaining off by default (fast, 0.5s dual-CN). Its phase-1 pool is wired
  // (poolStateKey below) and effective, but earns its keep only at low slack;
  // slack is step-level (fbDfdb needs 2), so we keep this fast and leave the
  // pool as an opt-in quality mode. See DESIGN / the cornerFirst experiments.
  phaseChaining: false,
  phases: [
    // The first-block pool is keyed on the *whole* block, so its candidates
    // leave the completion pieces in genuinely different places (not near-
    // duplicate 2x2x2s) — that is what makes phase-chaining pick a shorter
    // combined block (~1 move, measured) at negligible cost.
    blockSearch("front222", FRONT_222, {
      maxDepth: 8,
      poolStateKey: regionCoordinate(BLOCK223),
    }),
    blockSearch("rest", BLOCK223, {
      heuristicRegion: { corners: [6], edges: [7, 10] },
      guardGoal: true,
    }),
  ],
};

/** A 2x2x2 at the back, then the rest of the block. */
export const cornerFirstBack: Strategy = {
  id: "cornerFirstBack",
  label: "Corner-first (back)",
  enabledByDefault: false,
  phaseChaining: false,
  phases: [
    blockSearch("back222", BACK_222, {
      maxDepth: 8,
      poolStateKey: regionCoordinate(BLOCK223),
    }),
    blockSearch("rest", BLOCK223, {
      heuristicRegion: { corners: [5], edges: [5, 9] },
      guardGoal: true,
    }),
  ],
};

// `cross1` ("cross + two F2L pairs", opt-in, rarely the winner per SPEC). The
// full 2-pair completion from a *bare* 3-edge cross has no corner anchor, so a
// single search for it is huge (6–30s even when the block is short). Instead we
// insert the two pairs one at a time, each adding one corner+edge under a
// whole-block guard (`guardGoal`), so every phase is a tiny, well-guided search
// that never hangs. The best *pair order* is scramble-dependent (front-first
// wins ~half the time, ~0.5 moves/scramble at stake), so both orders are
// registered as separate strategies and raced — exactly like cornerFirst's
// Front/Back. Greedy per-pair loses a little cancellation vs solving both at
// once, but this is the only shape that keeps cross1 fast and reliable, and it
// stays short on cross1's niche (near-free cross + easy pairs).
/** The D-layer cross, then the front pair, then the back pair. */
export const cross1Front: Strategy = {
  id: "cross1Front", // front pair (DLF+FL) first, then back pair (DBL+BL)
  label: "Cross-first (front pair first)",
  enabledByDefault: false,
  phaseChaining: false,
  phases: [
    blockSearch("cross", CROSS, { maxDepth: 8 }),
    blockSearch("crossPairFront", CROSS_PAIR_FRONT, {
      heuristicRegion: { corners: [5], edges: [9] },
      guardGoal: true,
      maxDepth: 11,
    }),
    blockSearch("crossPairBack", BLOCK223, {
      heuristicRegion: { corners: [6], edges: [10] },
      guardGoal: true,
    }),
  ],
};

/** The D-layer cross, then the back pair, then the front pair. */
export const cross1Back: Strategy = {
  id: "cross1Back", // back pair (DBL+BL) first, then front pair (DLF+FL)
  label: "Cross-first (back pair first)",
  enabledByDefault: false,
  phaseChaining: false,
  phases: [
    blockSearch("cross", CROSS, { maxDepth: 8 }),
    blockSearch("crossPairBack", CROSS_PAIR_BACK, {
      heuristicRegion: { corners: [6], edges: [10] },
      guardGoal: true,
      maxDepth: 11,
    }),
    blockSearch("crossPairFront", BLOCK223, {
      heuristicRegion: { corners: [5], edges: [9] },
      guardGoal: true,
    }),
  ],
};

/** Every block-building strategy except `rouxFbDfdb`, which needs its algset. */
export const BLOCK_STRATEGIES: Strategy[] = [
  direct,
  cornerFirstFront,
  cornerFirstBack,
  cross1Front,
  cross1Back,
];

/**
 * The whole 2x2x3 step, all six strategies raced. Only `rouxFbDfdb` is enabled by
 * default — the others carry `enabledByDefault: false`.
 */
export function block223Step(
  dfdbSet: AlgSet,
  opts: { id?: string; label?: string } = {},
): Step {
  return {
    id: opts.id ?? "block223",
    label: opts.label ?? "2x2x3",
    strategies: [rouxFbDfdb(dfdbSet), ...BLOCK_STRATEGIES],
  };
}
