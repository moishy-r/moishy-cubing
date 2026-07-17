// Method: the composition of Steps into a solvable method, plus the solver
// pipeline runner. See /DESIGN.md ("Step -> Strategy -> Phase", "Replacements",
// "Extras", "Color neutrality", "Solver settings", "Solver API shape").
//
// A `Method` is a base class: real methods (APB, CFOP, ...) construct one with
// their step list, replacements, and extras. The runner walks the step list
// greedily per unit (a plain Step, or a Replacement/Extra region), racing the
// unit's candidate strategies by (lookahead-adjusted) MCC and keeping the
// cheapest, threading cube state and `prevMove` continuously across the solve.
//
// Three "consider more than one candidate" mechanisms, kept distinct (see
// /DESIGN.md "Solver settings"):
//   - Strategy selection — enabled Strategies of a Step race by MCC.
//   - Phase-chaining — a `SearchPhase` yields a *pool* of solutions (within a
//     move `slack`), jointly minimized with its downstream Phase(s).
//   - Lookahead — peek `depth` Steps ahead (and across algorithmic-phase pairs
//     inside one Strategy) to pick the variant/branch with the cheapest
//     *continuation*, not just the locally cheapest.

import { applyMoves, type CubeState, isSolved, solvedCube } from "./cube-state.ts";
import { formatAlg, invert, type Move, parseAlg } from "./notation.ts";
import { createDefaultMoveCostModel, type MoveCostModel } from "./move-cost.ts";
import {
  type Phase,
  type PhaseSegment,
  runPhaseCandidates,
  type Step,
  type Strategy,
} from "./step.ts";

// --- Method definition types ---

/** A region of the core-step sequence, `[fromStepId, toStepId]` inclusive. */
export type Region = [fromStepId: string, toStepId: string];

/**
 * An alternative set of strategies for a contiguous range of the method's core
 * steps (its `region`), raced against or replacing the region's normal solving.
 * See /DESIGN.md "Replacements". v1: defined against base steps only, no nesting.
 */
export interface Replacement {
  id: string;
  label?: string;
  /** Inclusive core-step region this replaces. Single-step region = `[x, x]`. */
  region: Region;
  /** Strategies that each solve the whole region on their own. */
  strategies: Strategy[];
  /**
   * Author default: `"compete"` races against the region's normal per-step
   * solving; `"force"` uses only this. Always caller-overridable via settings.
   */
  mode: "compete" | "force";
}

/** Context passed to a boundary trigger. */
export interface ExtraContext {
  prevMove: Move | null;
}

/** Evaluated once at the start of the Extra's region: is the shortcut available? */
export interface BoundaryTrigger {
  kind: "boundary";
  test: (state: CubeState, ctx: ExtraContext) => boolean;
}

/** Scoped to a `checkpoints` label mid-alg (e.g. Winter/Summer Variation). */
export interface CheckpointTrigger {
  kind: "checkpoint";
  label: string;
}

export type ExtraTrigger = BoundaryTrigger | CheckpointTrigger;

/**
 * A Replacement with one addition — a `trigger` gating whether it is even a
 * candidate for this solve. Same region/strategies/mode/settings shape and the
 * same opt-in-only default. See /DESIGN.md "Extras".
 */
export interface Extra {
  id: string;
  label?: string;
  region: Region;
  strategies: Strategy[];
  mode: "compete" | "force";
  trigger: ExtraTrigger;
}

/** Method-recommended default settings (override library defaults; caller overrides these). */
export interface MethodDefaults {
  stepOptions?: Record<string, StepOptions>;
  replacements?: Record<string, ReplacementOptions>;
  extras?: Record<string, ReplacementOptions>;
  lookahead?: LookaheadOptions;
  /** Recommended color-neutrality (orientation set raced through the first step). */
  colorNeutrality?: ColorNeutrality;
}

/** Everything needed to describe a method. */
export interface MethodDefinition {
  id: string;
  label?: string;
  /** Ordered core steps. */
  steps: Step[];
  replacements?: Replacement[];
  extras?: Extra[];
  /** This method's own recommended defaults (see {@link MethodDefaults}). */
  recommendedSettings?: MethodDefaults;
}

// --- Settings & options ---

/** Color-neutrality choice: fixed frame, all 24 orientations, or a custom set. */
export type ColorNeutrality = "fixed" | "full" | Move[][];

/** Per-Step strategy selection + phase-chaining. See /DESIGN.md "Solver settings". */
export interface StepOptions {
  /** Pin to one Strategy id, skipping racing entirely (demo mode). */
  forceStrategy?: string;
  /** Strategy ids to enable; omit to enable all registered (default-enabled) ones. */
  enabledStrategies?: string[];
  /** Phase-chaining controls for this Step's multi-phase strategies. */
  phaseChaining?: PhaseChainingOptions;
}

/** Phase-chaining controls (a `SearchPhase` feeding downstream phases). */
export interface PhaseChainingOptions {
  /** Default `true` wherever a strategy's phases support it. */
  enabled?: boolean;
  /** Generate upstream candidates within this many extra moves of optimum (default 2). */
  slack?: number;
}

/** Lookahead controls (solve-global; spans step and algorithmic-phase boundaries). */
export interface LookaheadOptions {
  /** How many Steps ahead to peek; `0` disables lookahead. */
  depth: number;
  /**
   * Restrict to specific adjacent id pairs (core Step ids, or two
   * algorithmic-phase ids within one Strategy). Omit = every adjacent pair.
   */
  scope?: [fromId: string, toId: string][];
}

/** Per-Replacement/Extra opt-in. `enabled` always defaults to `false`. */
export interface ReplacementOptions {
  enabled?: boolean;
  mode?: "compete" | "force";
}

/** Per-solve settings (all optional; sensible defaults applied). */
export interface SolverSettings {
  /** MCC cost model. Defaults to the library's built-in 2H model. */
  moveCostModel?: MoveCostModel;
  /** Color neutrality. Defaults to `"fixed"`. */
  colorNeutrality?: ColorNeutrality;
  /** Per-Step strategy selection + phase-chaining, keyed by step id. */
  stepOptions?: Record<string, StepOptions>;
  /** Per-Replacement opt-in/mode, keyed by replacement id. */
  replacements?: Record<string, ReplacementOptions>;
  /** Per-Extra opt-in/mode, keyed by extra id. */
  extras?: Record<string, ReplacementOptions>;
  /** Lookahead. Defaults to disabled unless the Method recommends otherwise. */
  lookahead?: LookaheadOptions;
  /** Default search depth bound for phases that don't set their own. */
  maxDepth?: number;
}

/** Per-call solver options. */
export interface SolveOptions {
  signal?: AbortSignal;
  maxDepth?: number;
  timeBudgetMs?: number;
}

/** Thrown when settings are structurally invalid (e.g. conflicting force regions). */
export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

// --- Result types ---

/** One committed unit of a solve, with the strategy chosen and alternatives seen. */
export interface SolveSegment {
  /** Step id, replacement id, or extra id. */
  unitId: string;
  kind: "step" | "replacement" | "extra";
  /** Winning strategy id (or `"<original>"` for a competed region's normal solving). */
  strategyId: string;
  moves: Move[];
  cost: number;
  phases: PhaseSegment[];
  /** Other candidates considered for this unit and their costs. */
  alternatives?: { strategyId: string; cost: number }[];
}

/** The full result of a solve. */
export interface SolveResult {
  scramble: string;
  /** Free pre-rotation chosen for color neutrality (not part of the solution cost). */
  orientation: Move[];
  solution: Move[];
  solutionString: string;
  cost: number;
  /** Whether the method reached a solved cube within the bounds. */
  solved: boolean;
  segments: SolveSegment[];
  /** Final cube state after the solution. */
  finalState: CubeState;
}

// --- Defaults ---

const DEFAULT_SLACK = 2;
const BRANCH_CAP = 12; // cap on candidates kept per phase/step, bounds branching

// --- Internal run context & helpers ---

/** A fully constructed candidate solve of a unit (or partial fold). */
interface Cand {
  strategyId: string;
  moves: Move[];
  cost: number;
  endState: CubeState;
  lastMove: Move | null;
  phaseSegs: PhaseSegment[];
}

/** A region alternative (replacement or boundary-triggered extra) as an index range. */
interface RegionAlt {
  id: string;
  kind: "replacement" | "extra";
  fromIdx: number;
  toIdx: number;
  strategies: Strategy[];
  mode: "compete" | "force";
  boundary?: BoundaryTrigger;
}

interface CheckpointExtra {
  id: string;
  fromIdx: number;
  toIdx: number;
  label: string;
  strategies: Strategy[];
}

interface RunCtx {
  costModel: MoveCostModel;
  def: MethodDefinition;
  stepIndex: Map<string, number>;
  /** Active region alternatives (enabled replacements + enabled boundary extras). */
  regionAlts: RegionAlt[];
  /** Active checkpoint-triggered extras. */
  checkpointExtras: CheckpointExtra[];
  settings: SolverSettings;
  resolveStep: (stepId: string) => StepOptions;
  lookahead: LookaheadOptions;
  scopeHas: (fromId: string, toId: string) => boolean;
  signal?: AbortSignal;
  deadline?: number;
  maxDepth?: number;
}

/** MCC cost of a move sequence, threading `prevMove` in. */
function costOf(moves: Move[], prevMove: Move | null, model: MoveCostModel): number {
  let total = 0;
  let prev = prevMove;
  for (let i = 0; i < moves.length; i++) {
    total += model.cost(moves[i], { prevMove: prev, index: i });
    prev = moves[i];
  }
  return total;
}

const phaseCtx = (ctx: RunCtx, prev: Move | null) => ({
  costModel: ctx.costModel,
  prevMove: prev,
  signal: ctx.signal,
  deadline: ctx.deadline,
  maxDepth: ctx.maxDepth,
});

/**
 * Candidate runs of one Strategy from `start`, jointly minimizing across its
 * phases. Each phase either commits its single cheapest segment or *branches*
 * into a pool (search phase-chaining, or an algorithmic phase feeding a
 * lookahead-scoped downstream phase / the strategy's tail under cross-step
 * lookahead). Returns candidates cheapest-first, capped at {@link BRANCH_CAP}.
 */
function strategyCands(
  strategy: Strategy,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
  chaining: { enabled: boolean; slack: number },
  branchTailVariants: boolean,
): Cand[] {
  const phases = strategy.phases as Phase[];
  let fold: Cand[] = [{
    strategyId: strategy.id,
    moves: [],
    cost: 0,
    endState: start,
    lastMove: prevMove,
    phaseSegs: [],
  }];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const isLast = i === phases.length - 1;
    // Decide whether this phase branches into a pool.
    let branch: "search-pool" | "all-variants" | "best" = "best";
    if (phase.kind === "search") {
      if (chaining.enabled) branch = "search-pool";
    } else {
      if (!isLast && ctx.scopeHas(phase.id, phases[i + 1].id)) branch = "all-variants";
      else if (isLast && branchTailVariants) branch = "all-variants";
    }

    const next: Cand[] = [];
    for (const c of fold) {
      const opts = branch === "search-pool" ? { searchSlack: chaining.slack, max: BRANCH_CAP } : {};
      let segs = runPhaseCandidates(phase, c.endState, phaseCtx(ctx, c.lastMove), opts);
      if (branch === "best") segs = segs.slice(0, 1);
      for (const seg of segs) {
        next.push({
          strategyId: strategy.id,
          moves: [...c.moves, ...seg.moves],
          cost: c.cost + seg.cost,
          endState: seg.endState,
          lastMove: seg.moves.at(-1) ?? c.lastMove,
          phaseSegs: [...c.phaseSegs, seg],
        });
      }
    }
    if (next.length === 0) return [];
    next.sort((a, b) => a.cost - b.cost);
    fold = next.slice(0, BRANCH_CAP);
  }
  return fold;
}

/** The enabled strategies of a Step, honoring `forceStrategy`/`enabledStrategies`. */
function enabledStrategies(step: Step, opts: StepOptions): Strategy[] {
  if (opts.forceStrategy) return step.strategies.filter((s) => s.id === opts.forceStrategy);
  if (opts.enabledStrategies) {
    return step.strategies.filter((s) => opts.enabledStrategies!.includes(s.id));
  }
  return step.strategies.filter((s) => s.enabledByDefault ?? true);
}

/** Candidate runs for a plain Step: the union over its enabled strategies' pools. */
function stepCands(
  step: Step,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
  branchTailVariants: boolean,
): Cand[] {
  const opts = ctx.resolveStep(step.id);
  const chaining = {
    enabled: opts.phaseChaining?.enabled ?? true,
    slack: opts.phaseChaining?.slack ?? DEFAULT_SLACK,
  };
  const cands: Cand[] = [];
  for (const strategy of enabledStrategies(step, opts)) {
    cands.push(...strategyCands(strategy, start, prevMove, ctx, chaining, branchTailVariants));
  }
  cands.sort((a, b) => a.cost - b.cost);
  return cands.slice(0, BRANCH_CAP);
}

/** Candidate runs for a region alternative (replacement/extra) over its whole region. */
function regionAltCands(
  alt: RegionAlt,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
): Cand[] {
  // No cross-boundary lookahead into/out of a dynamically-chosen region (deferred
  // in /DESIGN.md); intra-strategy lookahead still applies via strategyCands.
  const chaining = { enabled: true, slack: DEFAULT_SLACK };
  const cands: Cand[] = [];
  for (const strategy of alt.strategies) {
    cands.push(...strategyCands(strategy, start, prevMove, ctx, chaining, false));
  }
  cands.sort((a, b) => a.cost - b.cost);
  return cands.slice(0, BRANCH_CAP);
}

/**
 * Peek cost: the minimum achievable cost of solving `depth` consecutive plain
 * Steps starting at `fromIdx`, from `state`. Used by lookahead to compare
 * continuations. Only peeks plain Steps; stops at a region-consumed boundary or
 * the end of the step list. Returns 0 when nothing (more) to peek.
 */
function peekCost(
  fromIdx: number,
  state: CubeState,
  prevMove: Move | null,
  depth: number,
  ctx: RunCtx,
): number {
  if (depth <= 0 || fromIdx >= ctx.def.steps.length) return 0;
  // If a region alternative starts here, lookahead across it is deferred — stop.
  if (ctx.regionAlts.some((a) => a.fromIdx === fromIdx)) return 0;
  const step = ctx.def.steps[fromIdx];
  const cands = stepCands(step, state, prevMove, ctx, depth > 1);
  if (cands.length === 0) return Infinity;
  let best = Infinity;
  for (const c of cands) {
    const rest = peekCost(fromIdx + 1, c.endState, c.lastMove, depth - 1, ctx);
    if (rest === Infinity) continue;
    best = Math.min(best, c.cost + rest);
  }
  return best === Infinity ? cands[0].cost : best;
}

/** Picks the cheapest candidate for a plain Step, adjusted by lookahead if in scope. */
function chooseStepCand(
  stepIdx: number,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
): Cand | null {
  const step = ctx.def.steps[stepIdx];
  const nextIdx = stepIdx + 1;
  const nextStep = ctx.def.steps[nextIdx];
  const lookaheadActive = ctx.lookahead.depth > 0 && nextStep !== undefined &&
    !ctx.regionAlts.some((a) => a.fromIdx === nextIdx) &&
    ctx.scopeHas(step.id, nextStep.id);

  const cands = stepCands(step, start, prevMove, ctx, lookaheadActive);
  if (cands.length === 0) return null;
  if (!lookaheadActive) return cands[0];

  let best: Cand | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    const ahead = peekCost(nextIdx, c.endState, c.lastMove, ctx.lookahead.depth, ctx);
    const score = c.cost + (ahead === Infinity ? 0 : ahead);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Turns a committed {@link Cand} into a {@link SolveSegment}. */
function toSegment(
  unitId: string,
  kind: SolveSegment["kind"],
  cand: Cand,
  alternatives?: { strategyId: string; cost: number }[],
): SolveSegment {
  return {
    unitId,
    kind,
    strategyId: cand.strategyId,
    moves: cand.moves,
    cost: cand.cost,
    phases: cand.phaseSegs,
    alternatives,
  };
}

/**
 * Weighted-interval DP over a connected span `[fromIdx, toIdx]` of the core-step
 * sequence, covering it with non-overlapping blocks — each a single plain Step
 * or one enabled compete-mode region alternative used across its entire region
 * (see /DESIGN.md "Overlapping regions"). Returns the cheapest cover's segments.
 */
function solveSpanDP(
  fromIdx: number,
  toIdx: number,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
  competeAlts: RegionAlt[],
): { segments: SolveSegment[]; endState: CubeState; lastMove: Move | null } | null {
  // best[p] = cheapest cover of [fromIdx, p) with its resulting state/prevMove/segments.
  interface Cell {
    cost: number;
    state: CubeState;
    lastMove: Move | null;
    segments: SolveSegment[];
  }
  const n = toIdx - fromIdx + 1;
  const best: (Cell | null)[] = Array(n + 1).fill(null);
  best[0] = { cost: 0, state: start, lastMove: prevMove, segments: [] };

  // Choosing the span's FINAL cover by span-cost alone ignores that a pricier
  // cover — e.g. a compete replacement — may leave a much cheaper continuation
  // (the reason a replacement can lose a race it should win: it costs a little
  // more locally but sets up a far easier next step). So the final cover is
  // scored by span cost PLUS a lookahead into the step right after the span,
  // mirroring the plain-step path's `chooseStepCand`. Intermediate cells stay
  // pure-cost (they are prefixes, and their own next step is inside the span).
  const afterIdx = toIdx + 1;
  const afterStep = ctx.def.steps[afterIdx];
  const exitLookahead = ctx.lookahead.depth > 0 && afterStep !== undefined &&
    !ctx.regionAlts.some((a) => a.fromIdx === afterIdx) &&
    ctx.scopeHas(ctx.def.steps[toIdx].id, afterStep.id);
  const coverScore = (cell: Cell, end: number): number => {
    if (end !== n || !exitLookahead) return cell.cost;
    const ahead = peekCost(afterIdx, cell.state, cell.lastMove, ctx.lookahead.depth, ctx);
    return cell.cost + (ahead === Infinity ? 0 : ahead);
  };

  for (let end = 1; end <= n; end++) {
    const pos = fromIdx + end - 1; // absolute index of the block's last step
    // Option A: a plain Step occupying just `pos`.
    const prev = best[end - 1];
    if (prev) {
      const cand = chooseStepCandNoLookahead(pos, prev.state, prev.lastMove, ctx);
      if (cand) {
        const cell: Cell = {
          cost: prev.cost + cand.cost,
          state: cand.endState,
          lastMove: cand.lastMove,
          segments: [...prev.segments, toSegment(ctx.def.steps[pos].id, "step", cand)],
        };
        if (!best[end] || coverScore(cell, end) < coverScore(best[end]!, end)) best[end] = cell;
      }
    }
    // Option B: a compete region ending exactly at `pos`.
    for (const alt of competeAlts) {
      if (alt.toIdx !== pos) continue;
      const startCellIdx = alt.fromIdx - fromIdx;
      if (startCellIdx < 0) continue;
      const base = best[startCellIdx];
      if (!base) continue;
      const cands = regionAltCands(alt, base.state, base.lastMove, ctx);
      if (cands.length === 0) continue;
      const cand = cands[0];
      const cell: Cell = {
        cost: base.cost + cand.cost,
        state: cand.endState,
        lastMove: cand.lastMove,
        segments: [
          ...base.segments,
          toSegment(
            alt.id,
            alt.kind,
            cand,
            cands.map((c) => ({ strategyId: c.strategyId, cost: c.cost })),
          ),
        ],
      };
      if (!best[end] || coverScore(cell, end) < coverScore(best[end]!, end)) best[end] = cell;
    }
  }

  const final = best[n];
  if (!final) return null;
  return { segments: final.segments, endState: final.state, lastMove: final.lastMove };
}

/** Plain-step candidate without lookahead (used inside the span DP). */
function chooseStepCandNoLookahead(
  stepIdx: number,
  start: CubeState,
  prevMove: Move | null,
  ctx: RunCtx,
): Cand | null {
  const cands = stepCands(ctx.def.steps[stepIdx], start, prevMove, ctx, false);
  return cands[0] ?? null;
}

// --- Color-neutrality orientations ---

let cachedFull: Move[][] | null = null;

/** The 24 cube orientations as shortest rotation sequences (BFS over x/y/z). */
export function allOrientations(): Move[][] {
  if (cachedFull) return cachedFull;
  const rotations = parseAlg("x y z x' y' z'");
  const seen = new Map<string, Move[]>();
  const key = (s: CubeState) => s.cn.join(",");
  seen.set(key(solvedCube()), []);
  let frontier: { state: CubeState; seq: Move[] }[] = [{ state: solvedCube(), seq: [] }];
  while (frontier.length && seen.size < 24) {
    const next: typeof frontier = [];
    for (const { state, seq } of frontier) {
      for (const r of rotations) {
        const ns = applyMoves(state, [r]);
        const k = key(ns);
        if (seen.has(k)) continue;
        const nseq = [...seq, r];
        seen.set(k, nseq);
        next.push({ state: ns, seq: nseq });
      }
    }
    frontier = next;
  }
  cachedFull = [...seen.values()];
  return cachedFull;
}

function resolveOrientations(cn: ColorNeutrality | undefined): Move[][] {
  if (cn === "full") return allOrientations();
  if (Array.isArray(cn)) return cn.length ? cn : [[]];
  return [[]]; // "fixed" or undefined
}

// --- The Method class ---

/**
 * A solvable method. Construct with a {@link MethodDefinition}; call
 * {@link Method.solve}. Real methods live in their own packages (e.g.
 * `@moishy/apb`) and construct/subclass this.
 */
export class Method {
  readonly definition: MethodDefinition;

  constructor(definition: MethodDefinition) {
    this.definition = definition;
  }

  /**
   * Solves a scramble. Async-first (see DESIGN): cancellable via `opts.signal`,
   * time-bounded via `opts.timeBudgetMs`. On time-budget exhaustion, resolves
   * with a partial result (`solved: false`); on external abort, rejects.
   */
  solve(
    scramble: string,
    settings: SolverSettings = {},
    opts: SolveOptions = {},
  ): Promise<SolveResult> {
    return Promise.resolve().then(() => this.solveSync(scramble, settings, opts));
  }

  private buildCtx(settings: SolverSettings, opts: SolveOptions): RunCtx {
    const def = this.definition;
    const rec = def.recommendedSettings ?? {};
    const stepIndex = new Map(def.steps.map((s, i) => [s.id, i]));

    // Effective per-Step options: caller overrides Method-recommended.
    const resolveStep = (stepId: string): StepOptions => ({
      ...rec.stepOptions?.[stepId],
      ...settings.stepOptions?.[stepId],
    });

    // Effective replacement/extra opt-in: caller overrides Method-recommended;
    // `enabled` defaults to false project-wide, `mode` to the definition's own.
    const optFor = (
      id: string,
      kind: "replacements" | "extras",
    ): ReplacementOptions => ({ ...rec[kind]?.[id], ...settings[kind]?.[id] });

    const region = ([from, to]: Region): [number, number] => {
      const a = stepIndex.get(from);
      const b = stepIndex.get(to);
      if (a === undefined || b === undefined) {
        throw new SettingsError(`region references unknown step id in [${from}, ${to}]`);
      }
      return [a, b];
    };

    const regionAlts: RegionAlt[] = [];
    for (const r of def.replacements ?? []) {
      const o = optFor(r.id, "replacements");
      if (!o.enabled) continue;
      const [fromIdx, toIdx] = region(r.region);
      regionAlts.push({
        id: r.id,
        kind: "replacement",
        fromIdx,
        toIdx,
        strategies: r.strategies,
        mode: o.mode ?? r.mode,
      });
    }
    const checkpointExtras: CheckpointExtra[] = [];
    for (const e of def.extras ?? []) {
      const o = optFor(e.id, "extras");
      if (!o.enabled) continue;
      const [fromIdx, toIdx] = region(e.region);
      if (e.trigger.kind === "checkpoint") {
        checkpointExtras.push({
          id: e.id,
          fromIdx,
          toIdx,
          label: e.trigger.label,
          strategies: e.strategies,
        });
      } else {
        regionAlts.push({
          id: e.id,
          kind: "extra",
          fromIdx,
          toIdx,
          strategies: e.strategies,
          mode: o.mode ?? e.mode,
          boundary: e.trigger,
        });
      }
    }

    // Settings validation: two enabled force-mode *Replacements* whose regions
    // overlap are a hard conflict (see /DESIGN.md "Overlapping regions").
    const forceRepls = regionAlts.filter((a) => a.kind === "replacement" && a.mode === "force");
    for (let i = 0; i < forceRepls.length; i++) {
      for (let j = i + 1; j < forceRepls.length; j++) {
        const a = forceRepls[i], b = forceRepls[j];
        if (a.fromIdx <= b.toIdx && b.fromIdx <= a.toIdx) {
          throw new SettingsError(
            `force-mode replacements ${JSON.stringify(a.id)} and ${JSON.stringify(b.id)} ` +
              `have overlapping regions; enable at most one`,
          );
        }
      }
    }

    const lookahead: LookaheadOptions = settings.lookahead ?? rec.lookahead ?? { depth: 0 };
    const scopeSet = lookahead.scope ? new Set(lookahead.scope.map(([a, b]) => `${a}>${b}`)) : null;
    const scopeHas = (fromId: string, toId: string) =>
      lookahead.depth > 0 && (scopeSet === null || scopeSet.has(`${fromId}>${toId}`));

    return {
      costModel: settings.moveCostModel ?? createDefaultMoveCostModel(),
      def,
      stepIndex,
      regionAlts,
      checkpointExtras,
      settings,
      resolveStep,
      lookahead,
      scopeHas,
      signal: opts.signal,
      deadline: opts.timeBudgetMs !== undefined ? performance.now() + opts.timeBudgetMs : undefined,
      maxDepth: opts.maxDepth ?? settings.maxDepth,
    };
  }

  private solveSync(scramble: string, settings: SolverSettings, opts: SolveOptions): SolveResult {
    opts.signal?.throwIfAborted();
    const ctx = this.buildCtx(settings, opts);
    const scrambleMoves = parseAlg(scramble);
    const initial = applyMoves(solvedCube(), scrambleMoves);
    const orientations = resolveOrientations(
      settings.colorNeutrality ?? this.definition.recommendedSettings?.colorNeutrality,
    );

    let orientation: Move[] = [];
    let committed: SolveSegment[] = [];
    let state = initial;

    try {
      if (ctx.def.steps.length === 0) {
        return this.assemble(scramble, orientation, committed, initial, true);
      }

      // Color neutrality: commit early — pick the orientation whose FIRST unit is
      // cheapest, then solve the rest from there. Each orientation `o` is a free
      // reframing realized by conjugating the scramble (o⁻¹ · scramble · o).
      let bestFirst:
        | { orientation: Move[]; unit: WalkStep; oriented: CubeState }
        | null = null;
      for (const o of orientations) {
        const oriented = applyMoves(solvedCube(), [...invert(o), ...scrambleMoves, ...o]);
        const unit = walkOne(0, oriented, null, ctx);
        if (!unit) continue;
        const cost = unit.segments.reduce((a, s) => a + s.cost, 0);
        if (!bestFirst || cost < bestFirst.unit.segments.reduce((a, s) => a + s.cost, 0)) {
          bestFirst = { orientation: o, unit, oriented };
        }
      }
      if (!bestFirst) return this.assemble(scramble, orientation, committed, initial, false);

      orientation = bestFirst.orientation;
      committed = [...bestFirst.unit.segments];
      state = bestFirst.unit.endState;
      let prevMove = bestFirst.unit.lastMove;
      let i = bestFirst.unit.nextIdx;

      while (i < ctx.def.steps.length) {
        const unit = walkOne(i, state, prevMove, ctx);
        if (!unit) return this.assemble(scramble, orientation, committed, state, false);
        committed.push(...unit.segments);
        state = unit.endState;
        prevMove = unit.lastMove;
        i = unit.nextIdx;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return this.assemble(scramble, orientation, committed, state, false);
      }
      throw err;
    }

    return this.assemble(scramble, orientation, committed, state, isSolved(state));
  }

  private assemble(
    scramble: string,
    orientation: Move[],
    segments: SolveSegment[],
    finalState: CubeState,
    solved: boolean,
  ): SolveResult {
    const solution = segments.flatMap((s) => s.moves);
    return {
      scramble,
      orientation,
      solution,
      solutionString: formatAlg(solution),
      cost: Math.round(segments.reduce((a, s) => a + s.cost, 0) * 1e6) / 1e6,
      solved,
      segments,
      finalState,
    };
  }
}

/** One committed unit of the walk: its segment(s), resulting state, and next index. */
interface WalkStep {
  segments: SolveSegment[];
  endState: CubeState;
  lastMove: Move | null;
  nextIdx: number;
}

/**
 * Commits the next unit starting at core-step index `i`, in priority order:
 * force region alternatives (deterministic carve-out) -> a connected span of
 * compete region alternatives (interval DP) -> a plain Step (with lookahead and
 * checkpoint-extra splicing). Returns `null` if the unit cannot be solved.
 */
function walkOne(i: number, state: CubeState, prevMove: Move | null, ctx: RunCtx): WalkStep | null {
  // 1. Force blocks starting at i (replacements always; boundary extras if their
  //    trigger passes). The cheapest that actually produces a result wins — a
  //    force block whose case-table can't match simply drops out (see DESIGN).
  const forceHere = ctx.regionAlts.filter((a) =>
    a.mode === "force" && a.fromIdx === i &&
    (a.boundary ? a.boundary.test(state, { prevMove }) : true)
  );
  if (forceHere.length > 0) {
    let best: { alt: RegionAlt; cand: Cand; alts: { strategyId: string; cost: number }[] } | null =
      null;
    for (const alt of forceHere) {
      const cands = regionAltCands(alt, state, prevMove, ctx);
      if (cands.length === 0) continue;
      if (!best || cands[0].cost < best.cand.cost) {
        best = {
          alt,
          cand: cands[0],
          alts: cands.map((c) => ({ strategyId: c.strategyId, cost: c.cost })),
        };
      }
    }
    if (best) {
      return {
        segments: [toSegment(best.alt.id, best.alt.kind, best.cand, best.alts)],
        endState: best.cand.endState,
        lastMove: best.cand.lastMove,
        nextIdx: best.alt.toIdx + 1,
      };
    }
    // No force block produced a result — fall through to normal solving.
  }

  // 2. Connected span of enabled compete region alternatives overlapping i.
  const competeAlts = ctx.regionAlts.filter((a) => a.mode === "compete" && a.fromIdx >= i);
  let spanEnd = i;
  const inSpan: RegionAlt[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of competeAlts) {
      if (inSpan.includes(a)) continue;
      if (a.fromIdx <= spanEnd) { // overlaps the span so far
        // boundary extras: gate by trigger at the span-start state (approximation)
        if (a.boundary && !a.boundary.test(state, { prevMove })) continue;
        inSpan.push(a);
        spanEnd = Math.max(spanEnd, a.toIdx);
        grew = true;
      }
    }
  }
  if (inSpan.length > 0) {
    const dp = solveSpanDP(i, spanEnd, state, prevMove, ctx, inSpan);
    if (dp) {
      return {
        segments: dp.segments,
        endState: dp.endState,
        lastMove: dp.lastMove,
        nextIdx: spanEnd + 1,
      };
    }
    // DP failed — fall through to a plain step.
  }

  // 3. Plain Step at i, with lookahead.
  const cand = chooseStepCand(i, state, prevMove, ctx);
  if (!cand) return null;
  const step = ctx.def.steps[i];
  const spliced = spliceCheckpointExtras(i, cand, prevMove, ctx);
  if (spliced) return spliced;
  return {
    segments: [toSegment(step.id, "step", cand, undefined)],
    endState: cand.endState,
    lastMove: cand.lastMove,
    nextIdx: i + 1,
  };
}

/**
 * If the chosen run for step `i` contains an algorithmic phase segment with a
 * checkpoint matching an enabled checkpoint-extra whose region starts at `i`,
 * splice the extra's continuation in place of the alg's tail and let it consume
 * the rest of the extra's region. Returns `null` if nothing splices.
 */
function spliceCheckpointExtras(
  i: number,
  cand: Cand,
  prevMove: Move | null,
  ctx: RunCtx,
): WalkStep | null {
  const extrasHere = ctx.checkpointExtras.filter((e) => e.fromIdx === i);
  if (extrasHere.length === 0) return null;

  // Find the first algorithmic phase segment carrying a matching checkpoint.
  for (let p = 0; p < cand.phaseSegs.length; p++) {
    const seg = cand.phaseSegs[p];
    if (seg.kind === "algorithmic" && seg.checkpoints?.length) {
      for (const cp of [...seg.checkpoints].sort((a, b) => a.index - b.index)) {
        const extra = extrasHere.find((e) => e.label === cp.label);
        if (!extra) continue;
        const prefix = seg.moves.slice(0, cp.index);
        const stateAtCp = applyMoves(seg.startState, prefix);
        const prefixPrev = prefix.at(-1) ?? cand.phaseSegs[p - 1]?.moves.at(-1) ?? prevMove;
        const cont = regionAltCands(
          {
            id: extra.id,
            kind: "extra",
            fromIdx: extra.fromIdx,
            toIdx: extra.toIdx,
            strategies: extra.strategies,
            mode: "force",
          },
          stateAtCp,
          prefixPrev,
          ctx,
        );
        if (cont.length === 0) continue;
        const chosen = cont[0];
        // moves = phases before this one + this phase's prefix + the extra's continuation.
        const before = cand.phaseSegs.slice(0, p).flatMap((s: PhaseSegment) => s.moves);
        const moves = [...before, ...prefix, ...chosen.moves];
        const cost = costOf(moves, prevMove, ctx.costModel);
        const seg2: SolveSegment = {
          unitId: extra.id,
          kind: "extra",
          strategyId: chosen.strategyId,
          moves,
          cost,
          phases: [...cand.phaseSegs.slice(0, p), ...chosen.phaseSegs],
        };
        return {
          segments: [seg2],
          endState: chosen.endState,
          lastMove: chosen.lastMove,
          nextIdx: extra.toIdx + 1,
        };
      }
    }
  }
  return null;
}
