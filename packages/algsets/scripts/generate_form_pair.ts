// Generates packages/algsets/src/form-pair/index.ts.
//
// See that module's header for what the set is. This script:
//  1. Finds the 15 geometric "pair formed" positions (DBR corner 7 + BR edge 11
//     location/orientation) from eo-pair's or/ou/mr/mu subsets, plus the trivial
//     solved position — 16 anchors total.
//  2. Does a single-source BFS from EACH anchor over the 6-move <R,U> set (R
//     and U never touch block223 and never flip edge orientation, so this stays
//     entirely within the block223-intact, EO-preserving state space), up to
//     depth 6, recording the full path to every reached (corner7,edge11) raw
//     signature.
//  3. For every one of the 251 raw signatures reachable from br-pair's own 89
//     cases x 4 AUFs, finds the GLOBAL minimum move count across all 16 anchors
//     and collects every anchor that ties at that minimum — each tied path,
//     inverted, becomes one interchangeable alg variant for that case (so the
//     method runner's existing phase-chaining can race "which subset is
//     actually cheaper" using the live EO pattern, exactly like any other
//     multi-variant case).
//  4. Verifies every generated alg against an independently-derived br-pair
//     representative, then writes the case list as a `defineAlgSet` module.
//
// Run: deno run -A packages/algsets/scripts/generate_form_pair.ts

import { eoPair as eoPairSet } from "../src/eo-pair/index.ts";
import { brPair as brPairSet } from "../src/br-pair/index.ts";
import {
  applyMove,
  applyMoves,
  type CubeState,
  formatAlg,
  invert,
  type Move,
  type MoveFamily,
  pieceSignature,
  solvedCube,
} from "@moishy/cubing-core";

const posSig = pieceSignature([7], [11]);
const U = (n: number): Move[] => n ? [{ family: "U", amount: n as 1 | 2 | 3 }] : [];

// --- 1. The 16 anchors (15 formed geometric positions + solved) ------------

const INSERT_SUBSETS = ["or", "ou", "mr", "mu"] as const;
const anchorState = new Map<string, CubeState>(); // anchor sig -> representative state
const anchorSubset = new Map<string, string>(); // anchor sig -> subset label
for (const c of eoPairSet.cases) {
  if (!INSERT_SUBSETS.includes(c.subset as typeof INSERT_SUBSETS[number])) continue;
  const st = eoPairSet.recognitionState(c.id);
  const sig = posSig(st);
  if (!anchorState.has(sig)) anchorState.set(sig, st);
  anchorSubset.set(sig, c.subset!);
}
const SOLVED_SIG = posSig(solvedCube());
anchorState.set(SOLVED_SIG, solvedCube());
anchorSubset.set(SOLVED_SIG, "solved");
console.error(`Anchors (incl. solved): ${anchorState.size}`);

// --- 2. Every reachable raw (corner7,edge11) signature: br-pair's 251 ------

const allRawSigs = new Set<string>();
const rawRepresentative = new Map<string, CubeState>();
for (const c of brPairSet.cases) {
  for (let k = 0; k < 4; k++) {
    const st = applyMoves(brPairSet.recognitionState(c.id), U(k));
    const sig = posSig(st);
    if (!allRawSigs.has(sig)) {
      allRawSigs.add(sig);
      rawRepresentative.set(sig, st);
    }
  }
}
console.error(`Raw states to cover: ${allRawSigs.size}`);

// --- 3. Single-source BFS from every anchor, over <R,U>, recording full paths

const RU_MOVES: Move[] = (["R", "U"] as MoveFamily[]).flatMap((family) =>
  ([1, 2, 3] as const).map((amount) => ({ family, amount }))
);
const MAX_DEPTH = 8; // generous; the earlier exploration found max 6

function bfsPathsFrom(anchorSig: string, anchorSt: CubeState): Map<string, Move[]> {
  const paths = new Map<string, Move[]>([[anchorSig, []]]);
  let layer: { state: CubeState; path: Move[]; lastFamily: MoveFamily | null }[] = [
    { state: anchorSt, path: [], lastFamily: null },
  ];
  for (let depth = 0; depth < MAX_DEPTH && layer.length > 0; depth++) {
    const next: typeof layer = [];
    for (const { state, path, lastFamily } of layer) {
      for (const m of RU_MOVES) {
        if (m.family === lastFamily) continue; // same-family repeat always reducible
        const ns = applyMove(state, m);
        const sig = posSig(ns);
        if (paths.has(sig)) continue;
        const np = [...path, m];
        paths.set(sig, np);
        next.push({ state: ns, path: np, lastFamily: m.family });
      }
    }
    layer = next;
  }
  return paths;
}

const pathsByAnchor = new Map<string, Map<string, Move[]>>();
for (const [sig, st] of anchorState) pathsByAnchor.set(sig, bfsPathsFrom(sig, st));

const unreached = [...allRawSigs].filter((s) => ![...pathsByAnchor.values()].some((m) => m.has(s)));
if (unreached.length) {
  console.error(`!! ${unreached.length} raw states unreachable via <R,U> from any anchor:`);
  console.error(unreached.join("\n"));
  throw new Error("form-pair generation: unreachable states");
}

// --- 4. Per raw sig: every anchor tied at the global-minimum move count ----

interface Variant {
  anchorSig: string;
  subset: string;
  alg: Move[];
}
interface CaseData {
  sig: string;
  variants: Variant[]; // primary first
}
const caseData: CaseData[] = [];

for (const sig of allRawSigs) {
  if (anchorState.has(sig)) continue; // already formed — no case needed (runPhase's
  // built-in "skip" seeding handles a state that already satisfies the goal).
  const candidates: { anchorSig: string; dist: number; path: Move[] }[] = [];
  for (const [anchorSig, paths] of pathsByAnchor) {
    const path = paths.get(sig);
    if (path) candidates.push({ anchorSig, dist: path.length, path });
  }
  const minDist = Math.min(...candidates.map((c) => c.dist));
  const winners = candidates.filter((c) => c.dist === minDist);
  // Dedupe identical resulting alg move-sequences (formatted string equality).
  const seenAlgs = new Set<string>();
  const variants: Variant[] = [];
  for (const w of winners) {
    const alg = invert(w.path); // raw sig -> anchor sig, in R/U moves
    const key = formatAlg(alg);
    if (seenAlgs.has(key)) continue;
    seenAlgs.add(key);
    variants.push({ anchorSig: w.anchorSig, subset: anchorSubset.get(w.anchorSig)!, alg });
  }
  caseData.push({ sig, variants });
}

console.error(
  `Cases to author (excludes ${
    anchorState.size - 1
  } already-formed states, minus overlaps): ${caseData.length}`,
);

// --- 5. Verify every variant against an independently-derived representative

let verifyFail = 0;
for (const c of caseData) {
  const rep = rawRepresentative.get(c.sig)!;
  for (const v of c.variants) {
    const end = applyMoves(rep, v.alg);
    const endSig = posSig(end);
    if (endSig !== v.anchorSig || !anchorState.has(endSig)) {
      verifyFail++;
      console.error(
        `VERIFY FAIL: sig=${c.sig} alg="${
          formatAlg(v.alg)
        }" -> ${endSig} (expected ${v.anchorSig})`,
      );
    }
  }
}
console.error(`Verification failures: ${verifyFail}`);
if (verifyFail > 0) throw new Error("form-pair generation: verification failed");

const hist = new Map<number, number>();
for (const c of caseData) {
  hist.set(c.variants[0].alg.length, (hist.get(c.variants[0].alg.length) ?? 0) + 1);
}
console.error("Move-count histogram (primary variant):");
for (const [m, n] of [...hist.entries()].sort((a, b) => a[0] - b[0])) console.error(`  ${m}: ${n}`);
const tieCount = caseData.filter((c) => new Set(c.variants.map((v) => v.subset)).size > 1).length;
console.error(`Cases with cross-subset ties: ${tieCount}`);

// --- 6. Emit the algset module ----------------------------------------------

function idFor(sig: string): string {
  // "0.0/1.0" -> "c0o0-e1o0" (corner slot0 ori0, edge slot1 ori0) — readable,
  // and distinct from every other algset's id style so a collision is obvious.
  const [c, e] = sig.split("/");
  const [cs, co] = c.split(".");
  const [es, eo] = e.split(".");
  return `c${cs}o${co}-e${es}o${eo}`;
}

const lines: string[] = [];
lines.push(`// Form Pair — R,U-only algorithms that form the BR pair (DBR corner + BR`);
lines.push(`// edge) as a joinable 2x2x3-intact unit, WITHOUT inserting it or fixing EO.`);
lines.push(`//`);
lines.push(`// Generated by scripts/generate_form_pair.ts — do not hand-edit; re-run the`);
lines.push(`// script instead. See that script's header for the derivation:`);
lines.push(`//`);
lines.push(`//   - R and U never touch block223 (corners 5,6; edges 5,6,7,9,10) and never`);
lines.push(`//     flip edge orientation (see cube-state.ts's QUARTER_TURN table — only`);
lines.push(`//     F/B/S/f/b/x/z have nonzero \`eo\`), so an <R,U>-only forming step leaves`);
lines.push(`//     both block223 and EO completely untouched.`);
lines.push(`//   - "Formed" is purely geometric: DBR corner 7 + BR edge 11's own`);
lines.push(`//     location/orientation matches one of the 15 positions eo-pair's`);
lines.push(`//     or/ou/mr/mu subsets recognize (ignoring the *other* edges' EO, which`);
lines.push(`//     is irrelevant to whether the pair itself is mechanically joined).`);
lines.push(`//   - Each case's \`baseState\` anchors to the eo-pair (or solved-cube) state`);
lines.push(`//     its primary alg actually lands on — recognition is still fully`);
lines.push(`//     alg-derived (\`baseState · invert(algs[0])\`, see \`AlgCaseInput.baseState\`),`);
lines.push(`//     never hand-written, exactly like every other algset here.`);
lines.push(`//   - A case with more than one variant has *tied* shortest paths to`);
lines.push(`//     DIFFERENT eo-pair subsets (e.g. an "or" pair equidistant from a`);
lines.push(`//     "mu" pair) — kept as interchangeable variants so the runner's`);
lines.push(`//     existing phase-chaining can race them against the live EO pattern's`);
lines.push(`//     eoPairInsert cost, same as any other multi-variant case.`);
lines.push(`//   - The 15 states already at a formed position need no case at all:`);
lines.push(`//     \`runPhase\`'s built-in zero-move "skip" path (identity pre-AUF already`);
lines.push(`//     meeting the goal) covers them.`);
lines.push(`//`);
lines.push(`// See /DESIGN.md for the algset schema.`);
lines.push(``);
lines.push(`import { type AlgSet, defineAlgSet } from "../define.ts";`);
lines.push(`import { eoPair as eoPairSet } from "../eo-pair/index.ts";`);
lines.push(`import { type CubeState, solvedCube } from "@moishy/cubing-core";`);
lines.push(``);
lines.push(`// Anchor states: the eo-pair case each variant's primary alg lands on, keyed`);
lines.push(`// by the anchor's own (DBR,BR) position signature. Rebuilt from eo-pair rather`);
lines.push(`// than hand-stored, so the derivation chain stays fully alg-based.`);
lines.push(`const ANCHOR_CASE: Record<string, string> = {`);
// Emit one representative eo-pair case id per non-solved anchor signature.
const anchorCaseId = new Map<string, string>();
for (const c of eoPairSet.cases) {
  if (!INSERT_SUBSETS.includes(c.subset as typeof INSERT_SUBSETS[number])) continue;
  const sig = posSig(eoPairSet.recognitionState(c.id));
  if (!anchorCaseId.has(sig)) anchorCaseId.set(sig, c.id);
}
for (const [sig, id] of anchorCaseId) {
  lines.push(`  ${JSON.stringify(sig)}: ${JSON.stringify(id)},`);
}
lines.push(`};`);
lines.push(``);
lines.push(`function anchorState(sig: string): CubeState {`);
lines.push(`  const caseId = ANCHOR_CASE[sig];`);
lines.push(`  return caseId ? eoPairSet.recognitionState(caseId) : solvedCube();`);
lines.push(`}`);
lines.push(``);
lines.push(`/**`);
lines.push(` * Form Pair. Recognizes the raw (DBR corner 7, BR edge 11) position — the`);
lines.push(` * default full-facelet signature is meaningless here; every consumer must`);
lines.push(` * wrap this with \`regionLookup(formPair, pieceSignature([7], [11]))\`.`);
lines.push(` */`);
lines.push(`export const formPair: AlgSet = defineAlgSet({`);
lines.push(`  id: "formPair",`);
lines.push(`  name: "Form Pair (R,U)",`);
lines.push(`  cases: [`);
for (const c of caseData) {
  const primary = c.variants[0];
  const algsStr = c.variants.map((v) => JSON.stringify(formatAlg(v.alg))).join(", ");
  const subsets = [...new Set(c.variants.map((v) => v.subset))].join("+");
  lines.push(
    `    { id: ${JSON.stringify(idFor(c.sig))}, subset: ${
      JSON.stringify(subsets)
    }, baseState: anchorState(${JSON.stringify(primary.anchorSig)}), algs: [${algsStr}] },`,
  );
}
lines.push(`  ],`);
lines.push(`});`);
lines.push(``);

const outPath = new URL("../src/form-pair/index.ts", import.meta.url);
await Deno.mkdir(new URL("../src/form-pair/", import.meta.url), { recursive: true });
await Deno.writeTextFile(outPath, lines.join("\n"));
console.error(`\nWrote ${outPath.pathname} (${caseData.length} cases).`);
