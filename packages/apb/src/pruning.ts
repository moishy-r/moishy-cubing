// Pruning tables (pattern databases) for the block-building search phases.
//
// A `SearchPhase` with no heuristic explores blindly — an unpruned search over
// the 15 block-building move families visits millions of nodes for a ~9-move
// 2x2x3. A pruning table is a precomputed lower bound on the *cost* still needed
// to solve a chosen set of pieces, consulted at every search node so hopeless
// branches are cut immediately. See /DESIGN.md ("Cube representation") and SPEC
// ("direct ... needs a precomputed pruning table"). The engine's
// `SearchPhase.heuristic` is exactly this hook, and the search stays cost-optimal
// as long as the heuristic never overestimates.
//
// Two things make this admissible *and* tight for the slice/wide-inclusive,
// MCC-cost-minimizing block search:
//
//  - **Cost-based, not move-count.** Each table stores the minimum *MCC cost*
//    (not move count) to solve its pieces, computed by Dial's shortest-path from
//    solved with edge weight `cost(move, {prevMove: null})`. That per-move cost is
//    a valid lower bound on the move's cost in any context (MCC penalties are
//    additive and non-negative — see move-cost.ts), so the table never
//    overestimates, and it dominates the old `moveCount × cheapestMove` estimate.
//
//  - **Center-aware.** Block goals require the centers home (a fixed frame), and
//    slice/wide moves permute centers. Each region's table folds the 24-state
//    center orientation into the (small) corner table — or, for a corner-less
//    region, keeps a standalone 24-entry center table — so a pieces-home /
//    centers-drifted state gets a non-zero bound instead of ~0. Without this the
//    slice-inclusive search wanders; with it, it stays guided.
//
// Costs are quantized ×1000 to integers so Dial's can bucket by distance and the
// table fits a Uint16Array. Tables are built lazily on first use and cached for
// the process (keyed by region + move set + cost model), so a solve — including
// one racing many orientations — builds each table at most once.

import {
  applyMove,
  createDefaultMoveCostModel,
  type CubeState,
  type Move,
  type MoveCostModel,
  type MoveFamily,
  solvedCube,
} from "@moishy/cubing-core";

// Costs are non-integer (e.g. 0.8, 1.32); ×1000 makes them exact integers so
// Dial's can bucket by distance and the table can be a Uint16Array.
const COST_SCALE = 1000;

// Per-move slot transition for a set of tracked slots: a cubie in slot `s` moves
// to `newSlot[s]` and gains `oriDelta[s]` orientation. Derived from the move's
// effect on a solved cube (no dependency on the cube engine's private tables).
interface Transition {
  newSlot: number[];
  oriDelta: number[];
}

function buildTransitions(
  move: Move,
  slotCount: number,
  kind: "corner" | "edge",
): Transition {
  const sm = applyMove(solvedCube(), move);
  const perm = kind === "corner" ? sm.cp : sm.ep;
  const ori = kind === "corner" ? sm.co : sm.eo;
  const newSlot = new Array(slotCount);
  const oriDelta = new Array(slotCount);
  // Dest slot i receives the cubie from source slot `perm[i]`, gaining `ori[i]`.
  for (let i = 0; i < slotCount; i++) {
    newSlot[perm[i]] = i;
    oriDelta[perm[i]] = ori[i];
  }
  return { newSlot, oriDelta };
}

function movesOf(families: MoveFamily[]): Move[] {
  const out: Move[] = [];
  for (const family of families) {
    out.push({ family, amount: 1 }, { family, amount: 2 }, { family, amount: 3 });
  }
  return out;
}

/** Quantized (×1000, integer) context-free cost of a move — an admissible floor. */
function quantizedCost(model: MoveCostModel, move: Move): number {
  return Math.round(model.cost(move, { prevMove: null, index: 0 }) * COST_SCALE);
}

// --- Center orientation coordinate -------------------------------------------
//
// The centers form (under any block move set) a subgroup of the 24 whole-cube
// orientations — a single point {identity} for outer-only moves, all 24 once
// slices/wides are in. We enumerate the reachable center permutations from solved
// and index them 0..count-1, with a per-move transition table, so a table can
// track "are the centers home" as one small extra coordinate.

interface CenterCoord {
  count: number;
  solvedIndex: number;
  /** transitions[moveIndex][centerIndex] -> resulting centerIndex. */
  transitions: number[][];
  /** Index of a live state's center permutation (assumed reachable). */
  indexOf(cn: number[]): number;
}

function buildCenterCoord(moves: Move[]): CenterCoord {
  // How each move permutes the centers, as applied to an arbitrary state:
  // newCn[i] = cn[perm[i]] where perm = the move's center permutation.
  const perms = moves.map((m) => applyMove(solvedCube(), m).cn);
  const index = new Map<string, number>();
  const states: number[][] = [];
  const enq = (cn: number[]): number => {
    const k = cn.join(",");
    let i = index.get(k);
    if (i === undefined) {
      i = states.length;
      index.set(k, i);
      states.push(cn);
    }
    return i;
  };
  enq(solvedCube().cn);
  for (let i = 0; i < states.length; i++) {
    const c = states[i];
    for (const p of perms) enq(p.map((_, j) => c[p[j]]));
  }
  const transitions = perms.map((p) =>
    states.map((c) => index.get(p.map((_, j) => c[p[j]]).join(","))!)
  );
  return {
    count: states.length,
    solvedIndex: 0,
    transitions,
    indexOf: (cn) => index.get(cn.join(","))!,
  };
}

// --- Cost pattern database ----------------------------------------------------

/**
 * A pattern database over a set of tracked cubies (corners and/or edges) and,
 * optionally, the center orientation: `cost[index] = min MCC cost` to bring those
 * pieces + centers home. Built by Dial's shortest-path from solved over `moves`
 * with quantized per-move cost weights. We only ever build (corners[+centers]) or
 * (edges) — never edges+centers, which would be too large.
 */
// A per-move permutation of a small sub-coordinate (all tracked corners, or all
// tracked edges): subMove[oldSub] -> newSub. Precomputing these turns a Dial's
// relaxation into O(1) table lookups instead of per-digit encode/decode.
function buildSubTable(
  cubies: number[],
  slotCount: number,
  oriMod: number,
  transitions: Transition[],
): Int32Array[] {
  const n = cubies.length;
  const size = slotCount ** n * oriMod ** n;
  const slots = new Int8Array(n), oris = new Int8Array(n);
  return transitions.map((t) => {
    const table = new Int32Array(size);
    for (let idx = 0; idx < size; idx++) {
      let x = idx;
      for (let k = n - 1; k >= 0; k--) {
        oris[k] = x % oriMod;
        x = Math.floor(x / oriMod);
      }
      for (let k = n - 1; k >= 0; k--) {
        slots[k] = x % slotCount;
        x = Math.floor(x / slotCount);
      }
      let ni = 0;
      for (let k = 0; k < n; k++) ni = ni * slotCount + t.newSlot[slots[k]];
      for (let k = 0; k < n; k++) ni = ni * oriMod + (oris[k] + t.oriDelta[slots[k]]) % oriMod;
      table[idx] = ni;
    }
    return table;
  });
}

// Edge sub-tables above this size aren't materialized (they'd cost gigabytes
// across all moves); those DBs relax edges per-digit instead. Corner and center
// sub-spaces are always tiny, so they're always tabulated.
const MAX_EDGE_SUBTABLE = 300_000;

/**
 * A pattern database over a set of tracked cubies (corners and/or edges) and,
 * optionally, the center orientation: `cost[index] = min MCC cost` to bring those
 * pieces + centers home. Built by Dial's shortest-path from solved over `moves`
 * with quantized per-move cost weights. The index factors as
 * `(cornerSub · edgeSubSize + edgeSub) · nCenters + cen`, and each factor is
 * advanced by a precomputed per-move table (corners, centers, and small edge
 * sets) — or per-digit for a large edge set (the 5-edge full block).
 */
class CostPatternDB {
  private readonly dist: Uint16Array;
  private readonly corners: number[];
  private readonly edges: number[];
  private readonly centers: CenterCoord | null;
  private readonly nCenters: number;
  private readonly edgeSubSize: number;
  private readonly stride: number; // edgeSubSize * nCenters

  constructor(
    corners: number[],
    edges: number[],
    centers: CenterCoord | null,
    moves: Move[],
    model: MoveCostModel,
  ) {
    this.corners = corners;
    this.edges = edges;
    this.centers = centers;
    this.nCenters = centers ? centers.count : 1;
    const nc = corners.length, ne = edges.length;
    const cornerSubSize = 8 ** nc * 3 ** nc;
    this.edgeSubSize = 12 ** ne * 2 ** ne;
    this.stride = this.edgeSubSize * this.nCenters;
    this.dist = new Uint16Array(cornerSubSize * this.stride).fill(0xffff);

    const cornerT = moves.map((m) => buildTransitions(m, 8, "corner"));
    const edgeT = moves.map((m) => buildTransitions(m, 12, "edge"));
    const weights = moves.map((m) => quantizedCost(model, m));
    const nMoves = moves.length;

    const cornerTable = buildSubTable(corners, 8, 3, cornerT);
    const edgeTable = this.edgeSubSize <= MAX_EDGE_SUBTABLE
      ? buildSubTable(edges, 12, 2, edgeT)
      : null;
    const centerTrans = centers ? centers.transitions : null;
    const startCenter = centers ? centers.solvedIndex : 0;

    // Start = every tracked cubie home + oriented, centers home. Home corner/edge
    // sub-indices: slots = the cubie ids, oris = 0 → the low block of the radix.
    let cornerHome = 0;
    for (const c of corners) cornerHome = cornerHome * 8 + c;
    cornerHome *= 3 ** nc;
    let edgeHome = 0;
    for (const e of edges) edgeHome = edgeHome * 12 + e;
    edgeHome *= 2 ** ne;
    const start = (cornerHome * this.edgeSubSize + edgeHome) * this.nCenters + startCenter;
    this.dist[start] = 0;

    const es = new Int8Array(ne), eo = new Int8Array(ne);
    const stride = this.stride, edgeSubSize = this.edgeSubSize, nCenters = this.nCenters;

    // Dial's: buckets indexed by (integer) distance, processed ascending.
    const buckets: number[][] = [[start]];
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (const node of bucket) {
        if (this.dist[node] !== d) continue; // stale (a cheaper path settled it)
        const cornerSub = Math.floor(node / stride);
        const rem = node - cornerSub * stride;
        const edgeSub = Math.floor(rem / nCenters);
        const cen = rem - edgeSub * nCenters;
        if (!edgeTable) this.decodeEdges(edgeSub, es, eo);
        for (let mi = 0; mi < nMoves; mi++) {
          const nc2 = cornerTable[mi][cornerSub];
          const ne2 = edgeTable ? edgeTable[mi][edgeSub] : this.encodeEdges(edgeT[mi], es, eo);
          const cen2 = centerTrans ? centerTrans[mi][cen] : 0;
          const nb = (nc2 * edgeSubSize + ne2) * nCenters + cen2;
          const nd = d + weights[mi];
          if (nd < this.dist[nb]) {
            this.dist[nb] = nd;
            (buckets[nd] ??= []).push(nb);
          }
        }
      }
      buckets[d] = []; // free the settled bucket
    }
  }

  // Decode an edge sub-index into slots/oris scratch (per-digit fallback path).
  private decodeEdges(idx: number, es: Int8Array, eo: Int8Array): void {
    const ne = es.length;
    for (let k = ne - 1; k >= 0; k--) {
      eo[k] = idx % 2;
      idx = Math.floor(idx / 2);
    }
    for (let k = ne - 1; k >= 0; k--) {
      es[k] = idx % 12;
      idx = Math.floor(idx / 12);
    }
  }

  // Apply an edge transition to scratch slots/oris and return the new sub-index.
  private encodeEdges(t: Transition, es: Int8Array, eo: Int8Array): number {
    const ne = es.length;
    let idx = 0;
    for (let k = 0; k < ne; k++) idx = idx * 12 + t.newSlot[es[k]];
    for (let k = 0; k < ne; k++) idx = idx * 2 + (eo[k] + t.oriDelta[es[k]]) % 2;
    return idx;
  }

  /** Max stored distance (quantized) — for the Uint16 overflow assertion. */
  maxDistance(): number {
    let max = 0;
    for (let i = 0; i < this.dist.length; i++) {
      const d = this.dist[i];
      if (d !== 0xffff && d > max) max = d;
    }
    return max;
  }

  /** Min MCC cost (real, un-quantized) to solve the tracked pieces from `state`. */
  cost(state: CubeState): number {
    let cornerSub = 0;
    for (const c of this.corners) cornerSub = cornerSub * 8 + state.cp.indexOf(c);
    for (const c of this.corners) cornerSub = cornerSub * 3 + state.co[state.cp.indexOf(c)];
    let edgeSub = 0;
    for (const e of this.edges) edgeSub = edgeSub * 12 + state.ep.indexOf(e);
    for (const e of this.edges) edgeSub = edgeSub * 2 + state.eo[state.ep.indexOf(e)];
    const cen = this.centers ? this.centers.indexOf(state.cn) : 0;
    return this.dist[(cornerSub * this.edgeSubSize + edgeSub) * this.nCenters + cen] / COST_SCALE;
  }
}

const defaultModel = createDefaultMoveCostModel();

/** A signature of a cost model over a family set — for cache keying. */
function modelSignature(model: MoveCostModel, moves: Move[]): string {
  return moves.map((m) => quantizedCost(model, m)).join(",");
}

const cache = new Map<string, (s: CubeState) => number>();

// A combined corner+edge table is far tighter than maxing separate ones (it
// captures the corner/edge interaction), but its size is the product of both
// coordinate spaces. Build it when that product is affordable; otherwise fall
// back to two smaller tables maxed. ~8M entries (a 16 MB Uint16Array) is the cap:
// small blocks (≤3 tracked edges) fit, the full 2x2x3 (5 edges) does not.
const MAX_COMBINED_SIZE = 8_000_000;

/**
 * An admissible, cost-based, center-aware MCC heuristic for solving a region (the
 * given corner + edge cubies, with the centers home) using `moveFamilies`.
 *
 * When the combined corner+edge coordinate is small enough it builds one *joint*
 * corner+edge table (tight — it sees the piece interaction) maxed with a small
 * standalone center table. Otherwise (the full 5-edge block) it falls back to a
 * joint corner+center table maxed with an edge table — looser, but the only
 * affordable option at that size. Each table is a lower bound on the true
 * remaining cost, so the `max` is admissible either way.
 *
 * `moveFamilies` MUST be a superset of the phase's own move set (a smaller set
 * could make some real moves unavailable in the table and overestimate); passing
 * exactly the phase's families gives the tightest bound. `costModel` must match
 * the search's cost model for the bound to be tight — a cheaper model than the
 * table's would overestimate; the default 2H model is a valid floor for any
 * model. Tables are built lazily on first call and cached (keyed by region + move
 * set + cost-model signature).
 */
export function regionHeuristic(
  corners: number[],
  edges: number[],
  moveFamilies: MoveFamily[],
  costModel: MoveCostModel = defaultModel,
): (s: CubeState) => number {
  const moves = movesOf(moveFamilies);
  const key = `${corners.join(",")}|${edges.join(",")}|${[...moveFamilies].sort().join("")}|${
    modelSignature(costModel, moves)
  }`;
  const cached = cache.get(key);
  if (cached) return cached;

  const combinedSize = 8 ** corners.length * 3 ** corners.length *
    12 ** edges.length * 2 ** edges.length;
  const combinable = combinedSize <= MAX_COMBINED_SIZE;

  let dbA: CostPatternDB | null = null; // pieces (combined or corner+center)
  let dbB: CostPatternDB | null = null; // center-only or edge
  let centerCoord: CenterCoord | null = null;

  const heuristic = (s: CubeState): number => {
    // Lazy build on first use (keeps method construction cheap).
    if (!centerCoord) centerCoord = buildCenterCoord(moves);
    if (!dbA) {
      if (combinable) {
        // Tight: joint corner+edge pieces (no centers) + a standalone center DB.
        dbA = new CostPatternDB(corners, edges, null, moves, costModel);
        dbB = new CostPatternDB([], [], centerCoord, moves, costModel);
      } else {
        // Fallback: joint corner+center + edge (the 5-edge block is too large to
        // combine corners with edges).
        dbA = new CostPatternDB(corners, [], centerCoord, moves, costModel);
        dbB = new CostPatternDB([], edges, null, moves, costModel);
      }
      assertNoOverflow(dbA, "pieces");
      assertNoOverflow(dbB!, "aux");
    }
    return Math.max(dbA.cost(s), dbB!.cost(s));
  };
  cache.set(key, heuristic);
  return heuristic;
}

function assertNoOverflow(db: CostPatternDB, label: string): void {
  const max = db.maxDistance();
  if (max >= 0xffff) {
    throw new Error(
      `pruning: ${label} table cost ${max} overflows Uint16 — widen the store`,
    );
  }
}
