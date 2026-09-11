// Fills the ONE real eo-pair coverage gap needed for a correct <R,U>-only
// forming step: the "all edges already oriented" pattern (EO_EDGE_SLOTS =
// "000000") for the `or`/`ou` geometric positions.
//
// Why only `or`/`ou`, not `mr`/`mu`: R and U never flip the BR edge cubie's
// OWN orientation bit (proven — their `eo` tables are all zero). If a
// scramble's edges are already fully oriented before forming starts, that
// edge's own bit is permanently 0 and can never become 1 under <R,U> alone —
// so a pure-<R,U> forming step can NEVER land on an `mr`/`mu` position (both
// require the edge's own orientation = 1) when EO started fully solved. Only
// `or`/`ou` (edge orientation 0) are reachable there, so those are the only
// 8 positions (4 + 4) that need the "000000" case added.
//
// Run: deno run -A packages/algsets/scripts/generate_eo_pair_all_oriented.ts

import { eoPair as eoPairSet } from "../src/eo-pair/index.ts";
import {
  applyMoves,
  axisCanonical,
  type CubeState,
  eoSignature,
  formatAlg,
  invert,
  type Move,
  type MoveFamily,
  parseAlg,
  pieceSignature,
  regionCoordinate,
  regionHeuristic,
  regionSolvedAndEO,
  runPhase,
  solvedCube,
} from "@moishy/cubing-core";

const posSig = pieceSignature([7], [11]);
const EO_EDGE_SLOTS = [0, 1, 2, 3, 4, 8] as const;
const eoSig = eoSignature(EO_EDGE_SLOTS);
const AFTER_BR = { corners: [5, 6, 7], edges: [5, 6, 7, 9, 10, 11] } as const;
type Subset = "or" | "ou";

// --- 1. One base state per `or`/`ou` position (edge orientation is always 0
// for both, confirmed by their existing case data) ---------------------------

const baseState = new Map<string, CubeState>();
const subsetOf = new Map<string, Subset>();
for (const c of eoPairSet.cases) {
  if (c.subset !== "or" && c.subset !== "ou") continue;
  const st = eoPairSet.recognitionState(c.id);
  const pos = posSig(st);
  if (!baseState.has(pos)) baseState.set(pos, st);
  subsetOf.set(pos, c.subset as Subset);
}
console.error(`or/ou positions found: ${baseState.size} (expect 8)`);

// --- 2. Force every tracked slot OTHER than edge11's own slot to 0, fixing
// global parity (if needed) via the untracked slot 11 — never touching
// edge11's own slot, whose orientation is fixed by the position itself. -----

function forceAllOriented(base: CubeState, edgeOwnSlot: number): CubeState {
  const s: CubeState = {
    cp: base.cp.slice(),
    co: base.co.slice(),
    ep: base.ep.slice(),
    eo: base.eo.slice(),
    cn: base.cn.slice(),
  };
  let flips = 0;
  for (const slot of EO_EDGE_SLOTS) {
    if (slot === edgeOwnSlot) continue; // never touch — fixed by position identity
    if (s.eo[slot] !== 0) {
      s.eo[slot] = 0;
      flips++;
    }
  }
  if (flips % 2 !== 0) s.eo[11] = s.eo[11] === 0 ? 1 : 0; // untracked — restores parity only
  return s;
}

// --- 3. Search <R,U> first (inserting an already-EO-clean formed pair is a
// pure permutation problem, so this is expected to always suffice). ---------

function searchPhaseFor(moves: MoveFamily[]) {
  return {
    kind: "search" as const,
    id: "gen",
    goal: regionSolvedAndEO(AFTER_BR),
    moves,
    useAStar: true,
    canFollow: axisCanonical,
    heuristic: regionHeuristic([7], [11], moves),
    stateKey: (s: CubeState, last: Move | null) =>
      `${regionCoordinate(AFTER_BR)(s, last)}/${eoSig(s)}`,
    maxDepth: 12,
  };
}

interface NewCase {
  position: string;
  subset: Subset;
  alg: string;
  usedFallback: boolean;
}
const generated: NewCase[] = [];
const failed: string[] = [];

for (const [pos, base] of baseState) {
  const [cornerPart, edgePart] = pos.split("/");
  void cornerPart;
  const edgeOwnSlot = Number(edgePart.split(".")[0]);
  const target = forceAllOriented(base, edgeOwnSlot);
  if (eoSig(target) !== "000000") {
    failed.push(`${pos}: expected 000000, got ${eoSig(target)} — bug`);
    continue;
  }
  let seg = runPhase(searchPhaseFor(["R", "U"]), target);
  let usedFallback = false;
  if (!seg) {
    seg = runPhase(searchPhaseFor(["U", "D", "L", "R", "F", "B"]), target);
    usedFallback = true;
  }
  if (!seg) {
    failed.push(`${pos}: no alg found even with the wide move set`);
    continue;
  }
  generated.push({
    position: pos,
    subset: subsetOf.get(pos)!,
    alg: formatAlg(seg.moves),
    usedFallback,
  });
}

console.error(`\nGenerated: ${generated.length}, failed: ${failed.length}`);
if (failed.length) console.error(failed.join("\n"));
console.error(
  `Needed the wide fallback (not pure <R,U>): ${generated.filter((g) => g.usedFallback).length}`,
);

// --- 4. Verify: standard defineAlgSet derivation (solved · invert(alg)) must
// project to (position, "000000") exactly, and the alg must reach the goal. -

let verifyFail = 0;
for (const g of generated) {
  const moves = parseAlg(g.alg);
  const derived = applyMoves(solvedCube(), invert(moves));
  const gotPos = posSig(derived);
  const gotPattern = eoSig(derived);
  if (gotPos !== g.position || gotPattern !== "000000") {
    verifyFail++;
    console.error(
      `VERIFY FAIL: intended ${g.position}/000000, derived ${gotPos}/${gotPattern} (alg "${g.alg}")`,
    );
    continue;
  }
  const end = applyMoves(derived, moves);
  if (!regionSolvedAndEO(AFTER_BR)(end)) {
    verifyFail++;
    console.error(`VERIFY FAIL: ${g.position} alg "${g.alg}" does not reach the goal`);
  }
}
console.error(`Verification failures: ${verifyFail}`);

// --- 5. Emit case entries ----------------------------------------------------

const bySubset: Record<Subset, string[]> = { or: [], ou: [] };
const counter: Record<Subset, number> = { or: 0, ou: 0 };
for (const g of generated.sort((a, b) => a.position.localeCompare(b.position))) {
  counter[g.subset]++;
  const id = `${g.subset}-allOriented-${counter[g.subset]}`;
  bySubset[g.subset].push(
    `    { id: ${JSON.stringify(id)}, subset: ${JSON.stringify(g.subset)}, algs: [${
      JSON.stringify(g.alg)
    }] },`,
  );
}
for (const subset of ["or", "ou"] as Subset[]) {
  console.log(`\n// --- ${subset}: all-already-oriented (${bySubset[subset].length}) ---`);
  console.log(bySubset[subset].join("\n"));
}
