// Block building: the searches that assemble a first block, and the pieces they
// are assembled from.
//
// Every block-building method solves some version of this problem — Roux builds a
// first block, Petrus a 2x2x2 then a 2x2x3, CFOP a cross, APB a 2x2x3 — and the
// search is the same search each time. What differs is which cubies the goal
// names. So this module ships the machinery ({@link blockSearch}, the move sets,
// the move-count-primary cost model) and the standard targets, and a method
// composes them rather than re-deriving them.
//
// See /DESIGN.md ("Cube representation", "Color neutrality") for why the search
// is shaped this way, and `@moishy/apb`'s block223 step for a worked composition.

import {
  axisCanonical,
  createDefaultMoveCostModel,
  type CubeState,
  type Move,
  type MoveCostModel,
  type MoveFamily,
  type PieceRegion,
  regionCoordinate,
  regionHeuristic,
  regionHeuristicMulti,
  regionSolvedLRHome,
  regionSolvedStrict,
  type SearchPhase,
} from "@moishy/cubing-core";

// Block-building move set: outer faces + slices + wides (no rotations — those
// require a re-grip, and are handled once, upstream, by color-neutral orientation
// selection). Slice/wide moves permute the centers; the strict block goals
// (`regionSolvedStrict`) require `cn` identity, so those searches only accept
// blocks that net-preserve the fixed frame. The Roux FB is the exception: its
// `regionSolvedLRHome` goal lets the U/F/D/B centers drift about the L–R axis
// (DFDB restores that), so the FB search net-preserves only the L/R centers.
// Three things keep this fast despite the larger generator: the center-aware cost
// pruning table (pruning.ts) guides the search to restore centers (folded to the
// four L–R states for the FB), `axisCanonical` (geometry.ts) collapses redundant
// same-axis orderings, and the region-coordinate A* key merges off-region-only
// differences. See SPEC "block223" and DESIGN "Color neutrality".
export const BLOCK_MOVES: MoveFamily[] = [
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
// Roux FB move set — OnionHoney's `htm_rwm`: outer U/D/F/B/R + wide r + slice M.
// (No L/l, no E/S, no u/d/f/b.) Every family here fixes the L and R centers, so
// any center drift is confined to the L–R axis — exactly what the FB goal
// (`regionSolvedLRHome`) allows and DFDB restores. Matching OnionHoney's set makes
// our first-block search a faithful analogue of its FB analyzer.
export const FB_MOVES: MoveFamily[] = ["U", "D", "F", "B", "R", "r", "M"];

// Move-count-primary cost model for the *whole* block223 (both the FB search and
// the DFDB alg, and the other block strategies), mirroring OnionHoney's block
// analyzer evaluator (`moves.length * 100 + Σ ergonomic cost`): every move costs 1
// plus a tiny ergonomic term, so block-building is ranked by *fewest moves first*,
// with MCC only breaking ties among equal-length options. The ergonomic term is
// kept small enough (max ~0.015/move over the block's move count ⇒ < 1 total) that
// a shorter block always wins. The rest of the solve (brPair/eo/lxs/zbll) keeps the
// full ergonomic MCC model — block-building optimizes move count (what blockbuilders
// care about), the last layer optimizes ergonomics. The search stays A* (which finds
// the same optimum IDA* would, without thrashing on the fractional term).
const BLOCK_ERGO_TIEBREAK = 0.01;
const blockBaseModel = createDefaultMoveCostModel();
export const BLOCK_COST_MODEL: MoveCostModel = {
  cost: (move, ctx) => 1 + BLOCK_ERGO_TIEBREAK * blockBaseModel.cost(move, ctx),
};

// --- Standard block targets ---------------------------------------------------

/** The 2x2x3 block at bottom-left: corners DLF, DBL; edges DF, DL, DB, FL, BL. */
export const BLOCK223 = { corners: [5, 6], edges: [5, 6, 7, 9, 10] } as const;

// The sub-blocks a block-building strategy's search phases target. Each also
// becomes that phase's pruning-table region, so the search is heuristically
// guided rather than blind.
export const FRONT_222 = { corners: [5], edges: [5, 6, 9] }; // DFL, DF/DL/FL
export const BACK_222 = { corners: [6], edges: [6, 7, 10] }; // DBL, DL/DB/BL
export const ROUX_FB = { corners: [5, 6], edges: [6, 9, 10] }; // the 1x2x3 (no DF/DB)
export const CROSS = { corners: [], edges: [5, 6, 7] }; // DF, DL, DB
// cross1 inserts its two F2L pairs one at a time, and races both orders (the best
// order is scramble-dependent — ~0.5 moves/scramble on average). These are the
// cross + the first pair for each order: front pair (DLF+FL) or back pair (DBL+BL).
export const CROSS_PAIR_FRONT = { corners: [5], edges: [5, 6, 7, 9] }; // cross + DLF + FL
export const CROSS_PAIR_BACK = { corners: [6], edges: [5, 6, 7, 10] }; // cross + DBL + BL

// `direct`'s pruning tables: overlapping sub-regions of the 2x2x3, maxed
// (`regionHeuristicMulti`). The whole 7-piece block cannot be one combined table
// (8²·3²·12⁵·2⁵ ≈ 4.6e9 entries), and the corners-vs-edges split `regionHeuristic`
// falls back to never sees a corner↔edge interaction — which is why a single-phase
// whole-block search used to run for tens of seconds. These six *do*: both block
// corners appear in every group, paired with each of two 3-edge sets that together
// cover all five block edges, plus the four 2-edge sets neither triple contains.
// (The six pairs a triple already contains are dominated by it — a table tracking
// more pieces of the same goal is a pointwise-larger bound — so including them
// would cost lookups and build time for nothing.) Measured on 24 scrambles: ~9x
// fewer nodes than the split fallback and no timeouts, at identical block cost.
// Two groups have 3 edges (8²·3²·12³·2³ = 7,962,624 entries, just under
// MAX_COMBINED_SIZE, ~3.5s to build) and four have 2 (331,776 each, ~0.1s).
export const DIRECT_GROUPS: PieceRegion[] = [
  { corners: [5, 6], edges: [5, 6, 7] }, // + the D-layer cross edges DF/DL/DB
  { corners: [5, 6], edges: [5, 9, 10] }, // + DF and both side edges FL/BL
  { corners: [5, 6], edges: [6, 9] },
  { corners: [5, 6], edges: [6, 10] },
  { corners: [5, 6], edges: [7, 9] },
  { corners: [5, 6], edges: [7, 10] },
];

/**
 * A block-building search phase. The `goal` is always the full sub-block the
 * phase must reach; `heuristicRegion` (defaulting to `goal`) is what the pruning
 * table tracks. For a *second* phase (completing the block from a partial one
 * an earlier phase built), pass just the pieces this phase adds: that keeps the
 * heuristic small enough to build a *combined* corner+edge table (tight and fast),
 * whereas tracking the whole 5-edge block would force the loose, slow-to-build
 * full-block table. It stays admissible — tracking a subset of the goal's pieces
 * is always a valid lower bound.
 */
export const blockSearch = (
  id: string,
  goal: PieceRegion,
  opts: {
    // Pieces the pruning table tracks (defaults to `goal`). A second phase should
    // pass just the pieces it *adds* — a tight, combinable table (see doc above).
    heuristicRegion?: PieceRegion;
    // Instead of one table over `heuristicRegion`, max a *set* of overlapping
    // sub-region tables (`regionHeuristicMulti`). This is what a single-phase
    // whole-block search needs: no single combined table fits the full 7-piece
    // 2x2x3, but several overlapping smaller ones do, and their max sees the
    // corner<->edge interaction the corners-vs-edges split cannot. Strict goals
    // only (there is no L-R fold for the multi-table form).
    heuristicGroups?: readonly PieceRegion[];
    moves?: MoveFamily[];
    // `lrHome`: use the drift-allowing Roux FB goal (`regionSolvedLRHome`) — block
    // pieces home + L/R centers home, U/F/D/B free — with the matching L–R-folded
    // heuristic. Only `fbDfdb`'s `rouxFB` sets it; every other block search must
    // end fully centers-home (there is no later step to fix drift), so it stays
    // strict.
    lrHome?: boolean;
    // Search-depth cap (STM); `undefined` inherits the engine default.
    maxDepth?: number;
    // Per-phase cost model; the heuristic is built for the same model so it stays
    // admissible. Defaults to the move-count-primary `BLOCK_COST_MODEL` (matching
    // OnionHoney) for *all* block223 strategies, so they optimize the same objective
    // — fewest moves — and can be raced against each other coherently. (Its small
    // ergonomic tiebreak keeps A*'s ordering meaningful despite integer move costs.)
    costModel?: MoveCostModel;
    // For a *second* phase: also max in a heuristic over the whole `goal` block, so
    // the search is guided to *keep* the block an earlier phase built, not just to
    // add the new pieces. The tight added-pieces table alone under-guides and the
    // search wanders (breaking/rebuilding the first block) — measured ~22× more
    // nodes. Maxing two admissible tables stays admissible (same optimal block), so
    // this is a large speedup at no cost to quality.
    guardGoal?: boolean;
    // Soft per-invocation wall-clock budget; on expiry the phase (and so its
    // strategy) drops out of the step's race instead of failing the solve. Only
    // `direct` sets it — see SearchPhase.timeBudgetMs.
    timeBudgetMs?: number;
    // Ceiling on states retained, overriding the engine default. Only `direct`
    // raises it — see SearchPhase.maxNodes.
    maxNodes?: number;
    // Phase-chaining pool key (only used when this phase feeds a downstream one).
    // Must distinguish candidates by what the *next* phase reads — for a first
    // block, the whole goal block, so the pool offers genuinely different
    // completions rather than near-duplicate first blocks. See SearchPhase.poolStateKey.
    poolStateKey?: (s: CubeState, last: Move | null) => string | number;
  } = {},
): SearchPhase => {
  const heuristicRegion = opts.heuristicRegion ?? goal;
  const moves = opts.moves ?? BLOCK_MOVES;
  // block223 is optimized by move count across all strategies (see `costModel` doc).
  const costModel = opts.costModel ?? BLOCK_COST_MODEL;
  const tight = opts.heuristicGroups
    ? regionHeuristicMulti(opts.heuristicGroups, moves, costModel)
    : regionHeuristic(
      [...heuristicRegion.corners],
      [...heuristicRegion.edges],
      moves,
      costModel,
      { foldLR: opts.lrHome },
    );
  // The guard tracks the whole goal block (only meaningful when the tight table
  // tracks a strict subset — i.e. a second phase with an explicit heuristicRegion).
  const guard = opts.guardGoal && opts.heuristicRegion !== undefined
    ? regionHeuristic([...goal.corners], [...goal.edges], moves, costModel)
    : null;
  const heuristic = guard ? (s: CubeState) => Math.max(tight(s), guard(s)) : tight;
  return {
    kind: "search",
    // Fixed-frame goal: the block search uses slice/wide moves under a home-frame
    // heuristic, so its goal must pin the frame (see geometry.ts). Strict pins all
    // centers home; `lrHome` allows the L–R-axis drift the FB leaves for DFDB.
    // Algorithmic phases use the rotation-invariant `regionSolved`.
    goal: opts.lrHome ? regionSolvedLRHome(goal) : regionSolvedStrict(goal),
    moves,
    id,
    heuristic,
    costModel,
    // A* + the pruning table: cost-optimal without IDA*'s real-cost thrashing.
    useAStar: true,
    // Axis canonicalization collapses the redundant orderings the slice/wide
    // generator would otherwise explore; the region coordinate keys the A* visited
    // map by just the goal's tracked pieces + centers, merging off-region-only
    // differences (a sufficient statistic for reaching the goal).
    canFollow: axisCanonical,
    stateKey: regionCoordinate(goal),
    poolStateKey: opts.poolStateKey,
    maxDepth: opts.maxDepth,
    maxNodes: opts.maxNodes,
    timeBudgetMs: opts.timeBudgetMs,
  };
};
