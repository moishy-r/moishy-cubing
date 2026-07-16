// Step -> Strategy -> Phase: the composition model for wiring up a method.
//
// See /DESIGN.md ("Step -> Strategy -> Phase"):
//   - Step     — a named slot in a method's step list (e.g. `2x2x3`, `ZBLL`).
//   - Strategy — one way to solve a Step; an ordered list of Phases. A Step can
//                register several; the solver races them by MCC (step 6).
//   - Phase    — the atomic unit inside a Strategy. Either a `SearchPhase`
//                (configures the generic search engine — no algs) or an
//                `AlgorithmicPhase` (case lookup + alg + AUF handling).
//
// This module defines those base types plus `runPhase`, which executes a single
// phase against a start state. The multi-phase concerns — racing strategies,
// threading context across phases, Replacements, Extras/checkpoints — live in
// the method pipeline runner (step 6); `runPhase` is the primitive it builds on.

import { applyMoves, type CubeState, homingRotation } from "./cube-state.ts";
import type { Move, MoveFamily } from "./notation.ts";
import { createDefaultMoveCostModel, type MoveCostModel } from "./move-cost.ts";
import { search, searchAStar, searchAStarMany, searchMany } from "./search.ts";

/** Discriminant for the two phase kinds. */
export type PhaseKind = "search" | "algorithmic";

/**
 * A phase solved by the generic IDA* engine: a goal predicate + a pruning-table
 * heuristic + an allowed move set. Carries no algorithms.
 */
export interface SearchPhase {
  kind: "search";
  /** Identifier-safe key (e.g. `rouxFB`), used for lookahead scope and lookup. */
  id: string;
  /** Human-facing display label (e.g. `"Roux FB"`). */
  label?: string;
  /** Reached-the-target predicate. */
  goal: (state: CubeState) => boolean;
  /** Allowed move families (each expanded to its three amounts by the engine). */
  moves: MoveFamily[];
  /** Admissible lower-bound remaining-cost heuristic (a pruning table). */
  heuristic?: (state: CubeState) => number;
  /** Move-ordering constraint passed through to the engine. */
  canFollow?: (prev: Move, next: Move) => boolean;
  /** Maximum length of this phase's sub-solution, in moves. */
  maxDepth?: number;
  /**
   * Use the best-first A* engine instead of IDA*. Preferred when the phase has a
   * strong `heuristic` (e.g. a pruning table): A* visits each state once and
   * avoids IDA*'s re-exploration on every cost-threshold bump, which thrashes
   * with real-valued MCC costs. See {@link import("./search.ts").searchAStar}.
   */
  useAStar?: boolean;
  /**
   * State-identity key for the A* visited map when this phase runs as a *single
   * cheapest* search. A coarse region-coordinate key (merging states that agree
   * on the tracked region) is a large speedup — see `SearchParams.stateKey`.
   * Defaults to the full-cube key.
   */
  stateKey?: (state: CubeState, lastMove: Move | null) => string;
  /**
   * State-identity key when this phase feeds a phase-chaining *pool*
   * (multi-candidate generation). Must be *finer* than `stateKey`: it has to keep
   * distinct any two solutions that differ in what the downstream phase reads,
   * or the pool collapses to one candidate. Defaults to `stateKey`, then to the
   * full-cube key. See {@link import("./search.ts").searchAStarMany}.
   */
  poolStateKey?: (state: CubeState, lastMove: Move | null) => string;
}

/**
 * A named split point within a variant's move list, for mid-alg (checkpoint)
 * Extras. `index` is the runtime form (count of moves before the split);
 * authors declare it as an `afterMoves` SiGN prefix, which `defineAlgSet`
 * converts to this index. See /DESIGN.md ("Extras", "Algset schema").
 */
export interface Checkpoint {
  label: string;
  /** Index into the variant's move list where this checkpoint sits (0 = before move 0). */
  index: number;
}

/**
 * One alg that solves a case, plus optional provenance/cost metadata. A case
 * carries several of these (see {@link AlgCase}); they are interchangeable
 * solutions to the *same* recognized state, and the phase runner picks the best
 * one by cost — which is what enables lookahead (try every alg, keep the one
 * that leaves the cheapest continuation). See /DESIGN.md.
 */
export interface AlgVariant {
  /** The move sequence solving the case (from its recognized orientation). */
  moves: Move[];
  /** Attribution for this alg (e.g. `"SpeedCubeDB"`). */
  source?: string;
  /** Named split points within *this variant's* moves, for mid-alg Extras. */
  checkpoints?: Checkpoint[];
}

/**
 * A single algorithm case: one or more interchangeable algs that solve it, plus
 * optional metadata. `algs` is non-empty and ordered; `algs[0]` is the primary
 * (the recognition state is derived from it — see the algsets package). The
 * runner tries every variant and keeps the cheapest that meets the goal.
 */
export interface AlgCase {
  id: string;
  algs: AlgVariant[];
  tags?: string[];
}

/**
 * Recognition for an {@link AlgorithmicPhase}: given a state, return the case
 * whose alg solves it, or `null`. Implemented by the algsets package (step 7);
 * `runPhase` supplies AUF alignment on top, so a lookup only needs to recognize
 * one orientation.
 */
export interface CaseLookup {
  find(state: CubeState): AlgCase | null;
}

/**
 * A phase solved by looking up a known case and applying its alg, wrapped with
 * AUF alignment. The `goal` validates that a given AUF choice actually finishes
 * the phase (e.g. last layer solved).
 */
export interface AlgorithmicPhase {
  kind: "algorithmic";
  /** Identifier-safe key (e.g. `dfdb`), used for lookahead scope and lookup. */
  id: string;
  /** Human-facing display label (e.g. `"DF/DB pair"`). */
  label?: string;
  /** Reached-the-target predicate, used to validate AUF choices. */
  goal: (state: CubeState) => boolean;
  /** Case recognition. */
  cases: CaseLookup;
  /**
   * Families allowed for AUF alignment before and after the case alg. Defaults
   * to `["U"]`. Each contributes identity plus its three amounts.
   */
  auf?: MoveFamily[];
}

/** A phase is one of the two kinds. */
export type Phase = SearchPhase | AlgorithmicPhase;

/** One way to solve a {@link Step}: an ordered list of phases. */
export interface Strategy {
  /** Identifier-safe key (e.g. `fbDfdb`), used as a settings/lookup key. */
  id: string;
  /** Human-facing display label (e.g. `"RouxFB + DFDB"`). */
  label?: string;
  phases: Phase[];
  /** Whether this strategy is enabled unless settings say otherwise (default true). */
  enabledByDefault?: boolean;
}

/** A named slot in a method's step list, offering one or more strategies. */
export interface Step {
  /** Identifier-safe key (e.g. `block223`, not `2x2x3`), used as a settings/lookup key. */
  id: string;
  /** Human-facing display label (e.g. `"2x2x3"`). */
  label?: string;
  strategies: Strategy[];
}

/** Solve-time context threaded through phases by the pipeline runner. */
export interface SolveContext {
  /** Cost model for MCC scoring. Defaults to {@link createDefaultMoveCostModel}. */
  costModel?: MoveCostModel;
  /** The move executed immediately before this phase (continuous across phases). */
  prevMove?: Move | null;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
  /** Absolute `performance.now()` deadline (ms) for search phases. */
  deadline?: number;
  /** Depth bound for search phases when the phase does not set its own. */
  maxDepth?: number;
}

/** The result of running one phase: the moves chosen and rich metadata. */
export interface PhaseSegment {
  phaseId: string;
  kind: PhaseKind;
  /** The moves this phase contributes (including any AUF for algorithmic phases). */
  moves: Move[];
  /** MCC cost of `moves`, threaded from `context.prevMove`. */
  cost: number;
  startState: CubeState;
  endState: CubeState;
  /** Case id for algorithmic phases. */
  caseId?: string;
  /** Index into the case's `algs` of the variant chosen (algorithmic phases). */
  variantIndex?: number;
  /** AUF moves chosen (algorithmic phases). */
  auf?: { pre: Move[]; post: Move[] };
  /** Checkpoints, with indices relative to `moves`. */
  checkpoints?: Checkpoint[];
  tags?: string[];
  /** Nodes expanded (search phases). */
  nodesVisited?: number;
}

/** Cost of a move sequence, threading `prevMove` in (continuous with the solve). */
function segmentCost(moves: Move[], prevMove: Move | null, model: MoveCostModel): number {
  let total = 0;
  let prev = prevMove;
  for (let i = 0; i < moves.length; i++) {
    total += model.cost(moves[i], { prevMove: prev, index: i });
    prev = moves[i];
  }
  return total;
}

// AUF alignment options: identity plus each family's three amounts.
function aufOptions(families: MoveFamily[]): Move[][] {
  const options: Move[][] = [[]];
  for (const family of families) {
    options.push([{ family, amount: 1 }], [{ family, amount: 2 }], [{ family, amount: 3 }]);
  }
  return options;
}

/**
 * Reorients `start` to the home frame so a home-frame alg (or a home-frame
 * pruning heuristic) applies correctly even when the phase's *input* is itself
 * in a rotated frame — a mid-solve rotation, or any step reached after a
 * center-shifting move (as rotation-heavy methods like CFOP/ZB need).
 *
 * Returns the reoriented state plus the whole-cube rotation moves that produced
 * it: a phase runs its recognition/search against `homed`, then *prepends*
 * `homeMoves` to whatever it emits, so its solution begins by reorienting the
 * cube exactly as a solver would before executing a standard alg. When `start`
 * is already home (`homeMoves` empty — always the case for APB, whose block
 * search holds centers home through the terminal ZBLL) this is a no-op and the
 * phase runs byte-for-byte as before. See {@link import("./cube-state.ts").homingRotation}.
 */
function homeStart(start: CubeState): { homed: CubeState; homeMoves: Move[] } {
  const homeMoves = homingRotation(start);
  return { homed: homeMoves.length > 0 ? applyMoves(start, homeMoves) : start, homeMoves };
}

/**
 * Executes a single phase against `start`, returning its best (cheapest by MCC)
 * segment, or `null` if the phase cannot reach its goal.
 *
 * - Search phases run the generic engine over the allowed moves.
 * - Algorithmic phases try each pre-AUF alignment, recognize the case, apply
 *   its alg, and try each post-AUF, keeping the cheapest combination that meets
 *   the goal.
 */
export function runPhase(
  phase: Phase,
  start: CubeState,
  context: SolveContext = {},
): PhaseSegment | null {
  const costModel = context.costModel ?? createDefaultMoveCostModel();
  const prevMove = context.prevMove ?? null;
  // Reorient a rotated input to the home frame first; the phase runs against the
  // homed state and prepends the rotation to its solution (no-op when home).
  const { homed, homeMoves } = homeStart(start);
  const innerPrev = homeMoves.length > 0 ? homeMoves[homeMoves.length - 1] : prevMove;

  if (phase.kind === "search") {
    const engine = phase.useAStar ? searchAStar : search;
    const result = engine({
      start: homed,
      goal: phase.goal,
      moves: phase.moves,
      heuristic: phase.heuristic,
      canFollow: phase.canFollow,
      costModel,
      prevMove: innerPrev,
      stateKey: phase.stateKey,
      maxDepth: phase.maxDepth ?? context.maxDepth,
      signal: context.signal,
      deadline: context.deadline,
    });
    if (!result.found) return null;
    const moves = homeMoves.length > 0 ? [...homeMoves, ...result.moves] : result.moves;
    // result.cost is threaded from innerPrev (the last homing move); prefix the
    // homing rotations' own cost, threaded from the external prevMove.
    const cost = homeMoves.length > 0
      ? segmentCost(homeMoves, prevMove, costModel) + result.cost
      : result.cost;
    return {
      phaseId: phase.id,
      kind: "search",
      moves,
      cost,
      startState: start,
      endState: applyMoves(start, moves),
      nodesVisited: result.nodesVisited,
    };
  }

  // Algorithmic phase: recognize a case (up to AUF), then try each of its
  // interchangeable algs and each post-AUF, keeping the cheapest that solves.
  const auf = aufOptions(phase.auf ?? ["U"]);
  let best: PhaseSegment | null = null;

  // "Skip" solution: the phase's goal may already be satisfied after nothing but
  // an AUF alignment — e.g. edge orientation is already done, or the last layer
  // is already permuted. Recognition sets carry no identity case for this, so it
  // is handled here rather than as data. A skip is usually the cheapest option,
  // so it is seeded first and the case search only replaces it if truly cheaper.
  for (const pre of auf) {
    const endState = applyMoves(homed, pre);
    if (!phase.goal(endState)) continue;
    const moves = homeMoves.length > 0 ? [...homeMoves, ...pre] : [...pre];
    const cost = segmentCost(moves, prevMove, costModel);
    if (best && cost >= best.cost) continue;
    best = {
      phaseId: phase.id,
      kind: "algorithmic",
      moves,
      cost,
      startState: start,
      endState,
      auf: { pre, post: [] },
    };
  }

  for (const pre of auf) {
    const aligned = applyMoves(homed, pre);
    const matched = phase.cases.find(aligned);
    if (!matched) continue;
    for (let vi = 0; vi < matched.algs.length; vi++) {
      const variant = matched.algs[vi];
      const afterAlg = applyMoves(aligned, variant.moves);
      for (const post of auf) {
        const moves = [...homeMoves, ...pre, ...variant.moves, ...post];
        const endState = applyMoves(afterAlg, post);
        if (!phase.goal(endState)) continue;
        const cost = segmentCost(moves, prevMove, costModel);
        if (best && cost >= best.cost) continue;
        const offset = homeMoves.length + pre.length;
        const checkpoints = variant.checkpoints?.map((c) => ({
          label: c.label,
          index: c.index + offset,
        }));
        best = {
          phaseId: phase.id,
          kind: "algorithmic",
          moves,
          cost,
          startState: start,
          endState,
          caseId: matched.id,
          variantIndex: vi,
          auf: { pre, post },
          checkpoints,
          tags: matched.tags,
        };
      }
    }
  }

  return best;
}

/** Options for {@link runPhaseCandidates}. */
export interface PhaseCandidateOptions {
  /**
   * For a `SearchPhase`, generate a *pool* within this many extra moves of the
   * shortest solution (phase-chaining `slack`). Omitted → single cheapest only.
   * Ignored by algorithmic phases (whose pool is their case's variants).
   */
  searchSlack?: number;
  /** Cap on candidates returned (cheapest-MCC-first). */
  max?: number;
}

/**
 * Like {@link runPhase}, but returns a *pool* of candidate segments (cheapest
 * first) instead of collapsing to the single best — the primitive the pipeline
 * runner's phase-chaining and lookahead build on:
 *
 * - `SearchPhase`: the single cheapest, or (with `searchSlack`) every solution
 *   within that move-slack of the shortest (see {@link searchMany}).
 * - `AlgorithmicPhase`: one candidate per interchangeable variant of the
 *   recognized case — each scored with its own cheapest AUF alignment — so a
 *   downstream chooser (lookahead) can pick the variant with the best
 *   continuation, not just the locally cheapest.
 *
 * Returns `[]` when the phase cannot reach its goal.
 */
export function runPhaseCandidates(
  phase: Phase,
  start: CubeState,
  context: SolveContext = {},
  opts: PhaseCandidateOptions = {},
): PhaseSegment[] {
  const costModel = context.costModel ?? createDefaultMoveCostModel();
  const prevMove = context.prevMove ?? null;
  // Reorient a rotated input to the home frame (no-op when already home); the
  // phase runs against `homed` and prepends `homeMoves` to every candidate.
  const { homed, homeMoves } = homeStart(start);
  const innerPrev = homeMoves.length > 0 ? homeMoves[homeMoves.length - 1] : prevMove;
  const homePrefixCost = homeMoves.length > 0 ? segmentCost(homeMoves, prevMove, costModel) : 0;

  if (phase.kind === "search") {
    // No pool requested → single cheapest (runPhase homes internally).
    if (opts.searchSlack === undefined) {
      const only = runPhase(phase, start, context);
      return only ? [only] : [];
    }
    // A* phases pool via the guided `searchAStarMany` (best-first, cost-slack),
    // keyed by `poolStateKey` — which must be fine enough to keep distinct any
    // solutions the downstream phase treats differently (e.g. an FB's DF/DB pair),
    // or the pool collapses to one. IDA*-based `searchMany` is only for non-A*
    // (heuristic-less) search phases, where its length-slack DFS is affordable.
    const results = phase.useAStar
      ? searchAStarMany({
        start: homed,
        goal: phase.goal,
        moves: phase.moves,
        heuristic: phase.heuristic,
        canFollow: phase.canFollow,
        costModel,
        prevMove: innerPrev,
        stateKey: phase.poolStateKey ?? phase.stateKey,
        maxDepth: phase.maxDepth ?? context.maxDepth,
        costSlack: opts.searchSlack,
        maxSolutions: opts.max,
        signal: context.signal,
        deadline: context.deadline,
      })
      : searchMany({
        start: homed,
        goal: phase.goal,
        moves: phase.moves,
        heuristic: phase.heuristic,
        canFollow: phase.canFollow,
        costModel,
        prevMove: innerPrev,
        maxDepth: phase.maxDepth ?? context.maxDepth,
        slack: opts.searchSlack,
        maxSolutions: opts.max,
        signal: context.signal,
        deadline: context.deadline,
      });
    return results.map((r) => {
      const moves = homeMoves.length > 0 ? [...homeMoves, ...r.moves] : r.moves;
      return {
        phaseId: phase.id,
        kind: "search" as const,
        moves,
        cost: homePrefixCost + r.cost,
        startState: start,
        endState: applyMoves(start, moves),
        nodesVisited: r.nodesVisited,
      };
    });
  }

  // Algorithmic: one candidate per variant of the recognized case, each with
  // its own cheapest (pre, post) AUF alignment that meets the goal.
  const auf = aufOptions(phase.auf ?? ["U"]);
  const perVariant = new Map<number, PhaseSegment>();

  // "Skip" candidate: the goal already met by an AUF alignment alone, no case
  // alg needed (see runPhase). Included in the pool so lookahead can weigh it.
  let skip: PhaseSegment | null = null;
  for (const pre of auf) {
    const endState = applyMoves(homed, pre);
    if (!phase.goal(endState)) continue;
    const moves = homeMoves.length > 0 ? [...homeMoves, ...pre] : [...pre];
    const cost = segmentCost(moves, prevMove, costModel);
    if (skip && cost >= skip.cost) continue;
    skip = {
      phaseId: phase.id,
      kind: "algorithmic",
      moves,
      cost,
      startState: start,
      endState,
      auf: { pre, post: [] },
    };
  }

  for (const pre of auf) {
    const aligned = applyMoves(homed, pre);
    const matched = phase.cases.find(aligned);
    if (!matched) continue;
    for (let vi = 0; vi < matched.algs.length; vi++) {
      const variant = matched.algs[vi];
      const afterAlg = applyMoves(aligned, variant.moves);
      for (const post of auf) {
        const moves = [...homeMoves, ...pre, ...variant.moves, ...post];
        const endState = applyMoves(afterAlg, post);
        if (!phase.goal(endState)) continue;
        const cost = segmentCost(moves, prevMove, costModel);
        const existing = perVariant.get(vi);
        if (existing && cost >= existing.cost) continue;
        const offset = homeMoves.length + pre.length;
        const checkpoints = variant.checkpoints?.map((c) => ({
          label: c.label,
          index: c.index + offset,
        }));
        perVariant.set(vi, {
          phaseId: phase.id,
          kind: "algorithmic",
          moves,
          cost,
          startState: start,
          endState,
          caseId: matched.id,
          variantIndex: vi,
          auf: { pre, post },
          checkpoints,
          tags: matched.tags,
        });
      }
    }
  }

  const out = [...perVariant.values()];
  if (skip) out.push(skip);
  out.sort((a, b) => a.cost - b.cost);
  return opts.max === undefined ? out : out.slice(0, opts.max);
}
