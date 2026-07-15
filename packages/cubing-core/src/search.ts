// Generic IDA*-style search engine.
//
// One engine, parameterized per use (see /DESIGN.md, "Cube representation" and
// the Step -> Strategy -> Phase model): a `SearchPhase` supplies a goal
// predicate, an admissible pruning-table heuristic, the allowed move set, and a
// `MoveCostModel`. Every phase configures this engine rather than hand-rolling
// its own search.
//
// The search minimizes *MCC cost*, not move count: edge cost comes from the
// `MoveCostModel`, and the heuristic is a lower bound on the remaining cost. As
// long as that heuristic is admissible (never overestimates), the first
// solution found is cost-optimal. With the default heuristic (`() => 0`) the
// engine degrades to a correct uniform-cost iterative deepening.

import { applyMove, type CubeState, toFacelets } from "./cube-state.ts";
import type { Move, MoveFamily } from "./notation.ts";
import { createDefaultMoveCostModel, type MoveCostModel } from "./move-cost.ts";

/** Parameters for one {@link search} run. */
export interface SearchParams {
  /** State to search from. */
  start: CubeState;
  /** Returns true when `state` satisfies the phase's goal. */
  goal: (state: CubeState) => boolean;
  /**
   * Allowed move families. Each is expanded to its three amounts (e.g. `R`
   * yields `R`, `R2`, `R'`). Restricting this is how a phase limits its search
   * (e.g. a last-layer phase using only `U`, `R`, `F`).
   */
  moves: MoveFamily[];
  /**
   * Lower bound on the remaining MCC cost from a state to the goal — a pruning
   * table. Must be admissible (never overestimate) for the result to be
   * cost-optimal, and must return 0 on goal states. Defaults to `() => 0`.
   */
  heuristic?: (state: CubeState) => number;
  /** Cost model for edge costs. Defaults to {@link createDefaultMoveCostModel}. */
  costModel?: MoveCostModel;
  /**
   * Move-ordering constraint: may `next` immediately follow `prev`? Defaults to
   * forbidding two moves of the same family in a row (`R R` is always dominated
   * by `R2`/`R'`), which is safe for cost-optimality. Pass a stricter predicate
   * (e.g. axis canonicalization) to prune commuting duplicates.
   */
  canFollow?: (prev: Move, next: Move) => boolean;
  /**
   * The move physically executed just before this search began, threaded in so
   * the first move's cost and the `canFollow` check see real context. `null`
   * (the default) scores the segment in isolation.
   */
  prevMove?: Move | null;
  /**
   * State-identity key for the A* visited map (see {@link searchAStar}). Two
   * states with the same key are treated as interchangeable — the search keeps
   * only the cheapest path to each key. Defaults to {@link toFacelets} (the full
   * cube, ignoring `lastMove`). A phase whose goal + heuristic depend on only a
   * sub-region can pass a coarser key over just that region's coordinate, merging
   * states that differ only in untracked pieces — a large speedup, exact as long
   * as the key is a sufficient statistic for the goal, the heuristic, and the
   * region's evolution under the allowed moves.
   *
   * `lastMove` is the move that produced `state` (the external `prevMove` for the
   * start). A coarse key MUST fold in `lastMove`'s family: MCC cost is
   * context-sensitive (its penalties depend on the previous move's family), so
   * two paths reaching the same coordinate via different last families are NOT
   * interchangeable — merging them prevMove-blind discards the one whose last
   * move enables a cheaper continuation, losing cost-optimality. Family (not the
   * full move) suffices, since every penalty keys on family. Only consulted by
   * {@link searchAStar} / {@link searchAStarMany} (the IDA* engine keeps no map).
   */
  stateKey?: (state: CubeState, lastMove: Move | null) => string;
  /** Maximum solution length in moves. Bounds the search; defaults to 20. */
  maxDepth?: number;
  /** Cost ceiling: stop once no solution exists at or below this cost. Defaults to Infinity. */
  maxCost?: number;
  /** Cooperative cancellation; checked at each node and throws if aborted. */
  signal?: AbortSignal;
  /**
   * Absolute deadline as a `performance.now()` timestamp (ms). Checked at each
   * node and throws a `TimeoutError` if passed. Needed because the search is
   * synchronous — a `setTimeout` cannot interrupt a blocking run.
   */
  deadline?: number;
}

/** Outcome of a {@link search} run. */
export interface SearchResult {
  /** Whether a solution was found within the depth/cost bounds. */
  found: boolean;
  /** The solution move sequence (empty if the start already satisfies the goal). */
  moves: Move[];
  /** Total MCC cost of the solution, or `Infinity` if none was found. */
  cost: number;
  /** Number of nodes expanded — useful for gauging heuristic quality. */
  nodesVisited: number;
}

const DEFAULT_MAX_DEPTH = 20;
// Tolerance for float threshold comparisons (MCC costs are non-integer).
const EPS = 1e-9;

/** Expands move families into their three amounts: `R` -> `R`, `R2`, `R'`. */
export function movesFromFamilies(families: MoveFamily[]): Move[] {
  const out: Move[] = [];
  for (const family of families) {
    out.push({ family, amount: 1 }, { family, amount: 2 }, { family, amount: 3 });
  }
  return out;
}

const sameFamily = (prev: Move, next: Move) => prev.family !== next.family;

/**
 * Runs a cost-optimal IDA* search. Returns the cheapest (by `MoveCostModel`)
 * move sequence from `start` to a goal state, subject to the allowed moves and
 * depth/cost bounds.
 */
export function search(params: SearchParams): SearchResult {
  const {
    start,
    goal,
    heuristic = () => 0,
    costModel = createDefaultMoveCostModel(),
    canFollow = sameFamily,
    prevMove = null,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxCost = Infinity,
    signal,
    deadline,
  } = params;

  const candidates = movesFromFamilies(params.moves);

  const path: Move[] = [];
  let solution: Move[] | null = null;
  let solutionCost = Infinity;
  let nodesVisited = 0;

  // DFS bounded by `threshold` on f = g + h. Returns the smallest f that
  // exceeded the threshold (the next threshold), or sets `solution` and returns
  // on the first goal reached.
  function dfs(state: CubeState, prev: Move | null, g: number, threshold: number): number {
    if (signal?.aborted) signal.throwIfAborted();
    if (deadline !== undefined && performance.now() > deadline) {
      throw new DOMException("search time budget exceeded", "TimeoutError");
    }
    nodesVisited++;

    const f = g + heuristic(state);
    if (f > threshold + EPS) return f;
    if (goal(state)) {
      solution = path.slice();
      solutionCost = g;
      return f;
    }
    if (path.length >= maxDepth) return Infinity;

    // At the root the predecessor is the *external* prevMove — a fixed, committed
    // prefix, not part of this search's reorderable move sequence. A canonicalizing
    // `canFollow` (e.g. axis ordering) must not prune against it, or it over-prunes
    // legitimate cross-phase-boundary pairs; fall back to `sameFamily` there.
    const cf = path.length === 0 ? sameFamily : canFollow;
    let min = Infinity;
    for (const move of candidates) {
      if (prev && !cf(prev, move)) continue;
      const c = costModel.cost(move, { prevMove: prev, index: path.length });
      path.push(move);
      const t = dfs(applyMove(state, move), move, g + c, threshold);
      if (solution) return t;
      if (t < min) min = t;
      path.pop();
    }
    return min;
  }

  let threshold = heuristic(start);
  while (!solution) {
    if (threshold > maxCost + EPS) break;
    const next = dfs(start, prevMove, 0, threshold);
    if (solution) break;
    if (next === Infinity) break; // nothing left to explore within maxDepth
    threshold = next;
  }

  return {
    found: solution !== null,
    moves: solution ?? [],
    cost: solution ? solutionCost : Infinity,
    nodesVisited,
  };
}

/**
 * Cost-optimal A* search — the same problem as {@link search}, but best-first
 * with an explicit frontier instead of iterative deepening. Each state is
 * expanded at most once, so it does not re-explore on every threshold bump the
 * way IDA* does; with real-valued MCC costs (many distinct thresholds between
 * the heuristic estimate and the true cost) that re-exploration is exactly what
 * makes IDA* thrash. A* trades memory (a visited map + frontier heap) for
 * avoiding it — the right pick for a well-pruned bounded search like
 * block-building. Returns the same cost-optimal result given an admissible
 * heuristic.
 */
export function searchAStar(params: SearchParams): SearchResult {
  const {
    start,
    goal,
    heuristic = () => 0,
    costModel = createDefaultMoveCostModel(),
    canFollow = sameFamily,
    prevMove = null,
    stateKey = toFacelets,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxCost = Infinity,
    signal,
    deadline,
  } = params;
  const candidates = movesFromFamilies(params.moves);

  interface Node {
    state: CubeState;
    g: number;
    f: number;
    prev: Move | null;
    moves: Move[];
  }
  // Binary min-heap on f = g + h.
  const heap: Node[] = [];
  const swap = (i: number, j: number) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      swap(p, i);
      i = p;
    }
  };
  const pop = (): Node => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        swap(m, i);
        i = m;
      }
    }
    return top;
  };

  const bestG = new Map<string, number>(); // state key -> cheapest g reached
  let nodesVisited = 0;
  push({ state: start, g: 0, f: heuristic(start), prev: prevMove, moves: [] });
  bestG.set(stateKey(start, prevMove), 0);

  while (heap.length > 0) {
    if (signal?.aborted) signal.throwIfAborted();
    if (deadline !== undefined && performance.now() > deadline) {
      throw new DOMException("search time budget exceeded", "TimeoutError");
    }
    const node = pop();
    nodesVisited++;
    if (node.f > maxCost + EPS) break; // cheapest frontier f exceeds the ceiling
    if (goal(node.state)) {
      return { found: true, moves: node.moves, cost: node.g, nodesVisited };
    }
    // Skip stale heap entries (a cheaper path to this state was found later).
    if (node.g > (bestG.get(stateKey(node.state, node.prev)) ?? Infinity) + EPS) continue;
    if (node.moves.length >= maxDepth) continue;
    // Root predecessor is the external prevMove (see note in `search`): don't
    // canonicalize against it.
    const cf = node.moves.length === 0 ? sameFamily : canFollow;
    for (const move of candidates) {
      if (node.prev && !cf(node.prev, move)) continue;
      const g = node.g + costModel.cost(move, { prevMove: node.prev, index: node.moves.length });
      const ns = applyMove(node.state, move);
      const key = stateKey(ns, move);
      if (g >= (bestG.get(key) ?? Infinity) - EPS) continue;
      bestG.set(key, g);
      push({ state: ns, g, f: g + heuristic(ns), prev: move, moves: [...node.moves, move] });
    }
  }
  return { found: false, moves: [], cost: Infinity, nodesVisited };
}

/** Parameters for {@link searchAStarMany}: {@link SearchParams} + pool controls. */
export interface SearchAStarManyParams extends SearchParams {
  /**
   * Collect every solution whose MCC *cost* is within this much of the cheapest
   * solution's cost. A* pops in cost order, so this (not a move-length slack) is
   * the natural pool bound for the guided engine.
   */
  costSlack: number;
  /** Cap on solutions returned (cheapest-cost first). Defaults to 32. */
  maxSolutions?: number;
}

/**
 * A guided multi-solution pool: A* that keeps popping past the first goal,
 * collecting every distinct goal state whose cost is within `costSlack` of the
 * cheapest, cheapest-first, capped at `maxSolutions`. The heuristic-blind
 * {@link searchMany} (a length-bounded DFS) is intractable with a large move
 * set; this uses the pruning heuristic and so stays fast.
 *
 * "Distinct goal state" is exactly what the `stateKey` decides — for phase
 * chaining, pass a `stateKey` fine enough to distinguish solutions the downstream
 * phase treats differently (e.g. include the pieces it reads), or the pool
 * collapses to one entry. Each returned solution is the cheapest path to its key
 * (an A* guarantee), so the pool is a set of genuinely different, each-optimal
 * continuations for the downstream chooser.
 */
export function searchAStarMany(params: SearchAStarManyParams): SearchResult[] {
  const {
    start,
    goal,
    heuristic = () => 0,
    costModel = createDefaultMoveCostModel(),
    canFollow = sameFamily,
    prevMove = null,
    stateKey = toFacelets,
    costSlack,
    maxSolutions = DEFAULT_MAX_SOLUTIONS,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
    deadline,
  } = params;
  const candidates = movesFromFamilies(params.moves);

  interface Node {
    state: CubeState;
    g: number;
    f: number;
    prev: Move | null;
    moves: Move[];
  }
  const heap: Node[] = [];
  const swap = (i: number, j: number) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      swap(p, i);
      i = p;
    }
  };
  const pop = (): Node => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        swap(m, i);
        i = m;
      }
    }
    return top;
  };

  const bestG = new Map<string, number>();
  const solutions: SearchResult[] = [];
  let nodesVisited = 0;
  let cheapest = Infinity;
  push({ state: start, g: 0, f: heuristic(start), prev: prevMove, moves: [] });
  bestG.set(stateKey(start, prevMove), 0);

  while (heap.length > 0) {
    if (signal?.aborted) signal.throwIfAborted();
    if (deadline !== undefined && performance.now() > deadline) {
      throw new DOMException("search time budget exceeded", "TimeoutError");
    }
    const node = pop();
    nodesVisited++;
    // A* pops in f order and a goal has h = 0 (f = g), so once the frontier's
    // cheapest f exceeds the slack window, no further goal can qualify.
    if (node.f > cheapest + costSlack + EPS) break;
    if (solutions.length >= maxSolutions) break;
    if (goal(node.state)) {
      if (node.g < cheapest) cheapest = node.g;
      solutions.push({ found: true, moves: node.moves, cost: node.g, nodesVisited });
      continue; // don't extend past a goal
    }
    if (node.g > (bestG.get(stateKey(node.state, node.prev)) ?? Infinity) + EPS) continue;
    if (node.moves.length >= maxDepth) continue;
    const cf = node.moves.length === 0 ? sameFamily : canFollow;
    for (const move of candidates) {
      if (node.prev && !cf(node.prev, move)) continue;
      const g = node.g + costModel.cost(move, { prevMove: node.prev, index: node.moves.length });
      const ns = applyMove(node.state, move);
      const key = stateKey(ns, move);
      if (g >= (bestG.get(key) ?? Infinity) - EPS) continue;
      bestG.set(key, g);
      push({ state: ns, g, f: g + heuristic(ns), prev: move, moves: [...node.moves, move] });
    }
  }
  return solutions;
}

/** Parameters for {@link searchMany}: a {@link SearchParams} plus the pool controls. */
export interface SearchManyParams extends SearchParams {
  /**
   * Collect every solution whose *move length* is within this many extra moves
   * of the shortest solution found (per /DESIGN.md's phase-chaining `slack`).
   * `0` returns only shortest-length solutions.
   */
  slack: number;
  /** Cap on solutions returned (cheapest by MCC first). Defaults to 32. */
  maxSolutions?: number;
}

const DEFAULT_MAX_SOLUTIONS = 32;

/**
 * Enumerates a *pool* of solutions rather than the single cheapest — the
 * upstream candidate generator for phase-chaining (see /DESIGN.md). It returns
 * every solution whose move length is within `slack` of the shortest solution's
 * length, each scored by the {@link MoveCostModel}, sorted cheapest-MCC-first
 * and capped at `maxSolutions`.
 *
 * Length-bounded (not cost-bounded) on purpose: `slack` is "extra moves of
 * optimum" in the spec, and a slightly-longer upstream solution is exactly what
 * phase-chaining wants to keep alive when it enables a much cheaper downstream.
 */
export function searchMany(params: SearchManyParams): SearchResult[] {
  const {
    start,
    goal,
    costModel = createDefaultMoveCostModel(),
    canFollow = sameFamily,
    prevMove = null,
    maxDepth = DEFAULT_MAX_DEPTH,
    slack,
    maxSolutions = DEFAULT_MAX_SOLUTIONS,
    signal,
    deadline,
  } = params;

  const candidates = movesFromFamilies(params.moves);
  const path: Move[] = [];
  let nodesVisited = 0;

  // Depth-bounded DFS collecting every solution whose goal first occurs at depth
  // <= limit (a branch stops the moment it reaches the goal — a longer path that
  // merely re-passes through the goal is not a distinct solution).
  function collect(limit: number, out: { moves: Move[]; cost: number }[]): void {
    function dfs(state: CubeState, prev: Move | null, g: number): void {
      if (signal?.aborted) signal.throwIfAborted();
      if (deadline !== undefined && performance.now() > deadline) {
        throw new DOMException("search time budget exceeded", "TimeoutError");
      }
      nodesVisited++;
      if (goal(state)) {
        out.push({ moves: path.slice(), cost: g });
        return; // don't extend past the goal
      }
      if (path.length >= limit || path.length >= maxDepth) return;
      // Root predecessor is the external prevMove (see note in `search`).
      const cf = path.length === 0 ? sameFamily : canFollow;
      for (const move of candidates) {
        if (prev && !cf(prev, move)) continue;
        const c = costModel.cost(move, { prevMove: prev, index: path.length });
        path.push(move);
        dfs(applyMove(state, move), move, g + c);
        path.pop();
      }
    }
    dfs(start, prevMove, 0);
  }

  // Find the shortest solution length (Lmin) by increasing the depth limit.
  let lmin = -1;
  for (let limit = 0; limit <= maxDepth; limit++) {
    const found: { moves: Move[]; cost: number }[] = [];
    collect(limit, found);
    if (found.length > 0) {
      lmin = limit;
      break;
    }
  }
  if (lmin < 0) return [];

  // Collect every solution within `slack` moves of Lmin.
  const all: { moves: Move[]; cost: number }[] = [];
  collect(Math.min(lmin + slack, maxDepth), all);

  // Dedup by move sequence, sort cheapest-MCC-first, cap.
  const seen = new Set<string>();
  const unique: { moves: Move[]; cost: number }[] = [];
  for (const s of all) {
    const key = s.moves.map((m) => `${m.family}${m.amount}`).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  unique.sort((a, b) => a.cost - b.cost);
  return unique.slice(0, maxSolutions).map((s) => ({
    found: true,
    moves: s.moves,
    cost: s.cost,
    nodesVisited,
  }));
}
