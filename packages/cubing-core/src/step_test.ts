import { assert, assertEquals } from "@std/assert";
import {
  applyAlg,
  applyMoves,
  isSolved,
  SOLVED,
  solvedCube,
  statesEqual,
  toFacelets,
} from "./cube-state.ts";
import { formatAlg, type Move, parseAlg } from "./notation.ts";
import {
  type AlgCase,
  type AlgorithmicPhase,
  type CaseLookup,
  runPhase,
  type SearchPhase,
  type Step,
} from "./step.ts";

// A trivial exact-match case lookup, for demonstrating algorithmic phases
// before the real algsets package (step 7) exists.
function exactLookup(
  entries: { state: ReturnType<typeof solvedCube>; case: AlgCase }[],
): CaseLookup {
  const map = new Map(entries.map((e) => [toFacelets(e.state), e.case]));
  return { find: (s) => map.get(toFacelets(s)) ?? null };
}

// The state that "R U R' U'" solves, and the case describing it.
const SEXY = parseAlg("R U R' U'");
const caseState = applyAlg(solvedCube(), "U R U' R'"); // inverse of sexy
const sexyCase: AlgCase = {
  id: "sexy",
  algs: [{ moves: SEXY, checkpoints: [{ label: "insert", index: 2 }] }],
  tags: ["demo"],
};

Deno.test("a SearchPhase runs the engine and returns a rich segment", () => {
  const start = applyAlg(solvedCube(), "R U'");
  const phase: SearchPhase = {
    kind: "search",
    id: "solve",
    goal: isSolved,
    moves: ["U", "D", "L", "R", "F", "B"],
    maxDepth: 6,
  };
  const seg = runPhase(phase, start)!;
  console.log(
    `  SearchPhase: ${formatAlg(seg.moves)}  cost=${seg.cost}  nodes=${seg.nodesVisited}`,
  );
  assert(seg !== null);
  assertEquals(seg.kind, "search");
  assert(isSolved(seg.endState));
  assert(isSolved(applyAlg(start, formatAlg(seg.moves))));
});

Deno.test("an AlgorithmicPhase recognizes a case and applies its alg", () => {
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: sexyCase }]),
  };
  const seg = runPhase(phase, caseState)!;
  console.log(
    `  AlgorithmicPhase: ${formatAlg(seg.moves)}  caseId=${seg.caseId}  cost=${seg.cost}`,
  );
  assertEquals(seg.caseId, "sexy");
  assertEquals(formatAlg(seg.moves), "R U R' U'");
  assertEquals(seg.auf, { pre: [], post: [] });
  assert(isSolved(seg.endState));
});

Deno.test("a case with multiple algs: the runner picks the cheapest variant", () => {
  // Two interchangeable solutions to the same state: the short sexy move and a
  // deliberately padded one. The runner should choose variant 0 (cheaper).
  // (The sexy move has order 6, so 7 repetitions net the same effect.)
  const multi: AlgCase = {
    id: "sexy-multi",
    algs: [
      { moves: parseAlg("R U R' U'") },
      { moves: parseAlg("R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'") },
    ],
  };
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: multi }]),
  };
  const seg = runPhase(phase, caseState)!;
  assertEquals(seg.caseId, "sexy-multi");
  assertEquals(seg.variantIndex, 0);
  assertEquals(formatAlg(seg.moves), "R U R' U'");
});

Deno.test("AUF alignment: a misaligned case is solved with a pre-AUF", () => {
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: sexyCase }]),
    auf: ["U"],
  };
  const start = applyAlg(caseState, "U'"); // needs a U pre-AUF to realign
  const seg = runPhase(phase, start)!;
  console.log(
    `  AUF case: ${formatAlg(seg.moves)}  pre=${formatAlg(seg.auf!.pre)}  checkpoint@${
      seg.checkpoints![0].index
    }`,
  );
  assertEquals(seg.auf!.pre, [{ family: "U", amount: 1 }]);
  assert(isSolved(applyAlg(start, formatAlg(seg.moves))));
  // Checkpoint index shifts by the pre-AUF length (was 2 in the case, now 3).
  assertEquals(seg.checkpoints![0], { label: "insert", index: 3 });
});

Deno.test("runPhase returns null when the goal is unreachable", () => {
  const searchPhase: SearchPhase = {
    kind: "search",
    id: "solve",
    goal: isSolved,
    moves: ["U", "R", "F"],
    maxDepth: 1, // too shallow for a 4-move scramble
  };
  assertEquals(runPhase(searchPhase, applyAlg(solvedCube(), "R U R' U'")), null);

  const algPhase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: sexyCase }]),
  };
  assertEquals(runPhase(algPhase, applyAlg(solvedCube(), "F2")), null); // unrecognized
});

const isRotation = (m: Move) => m.family === "x" || m.family === "y" || m.family === "z";

Deno.test("homing: an AlgorithmicPhase applies a home-frame alg to a rotated input", () => {
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: sexyCase }]),
    auf: ["U"],
  };
  // The very same case, but the whole cube is held in a rotated frame (an
  // inspection z2 plus a mid-solve y): centers are drifted, so the phase's INPUT
  // is rotated — the scenario APB never hits but rotation-heavy methods do.
  const rotated = applyMoves(caseState, parseAlg("z2 y"));
  assert(!statesEqual(rotated, caseState), "input really is in a rotated frame");

  const seg = runPhase(phase, rotated)!;
  assert(seg !== null, "the rotated case is still recognized and solved");
  assertEquals(seg.caseId, "sexy");
  // The solution reorients the cube first (the homing rotation), then runs the
  // verbatim home-frame alg — exactly what a solver does before a standard alg.
  assert(isRotation(seg.moves[0]), "solution begins by reorienting to the home frame");
  assert(isSolved(seg.endState));
  assert(
    isSolved(applyAlg(rotated, formatAlg(seg.moves))),
    "applying the emitted moves to the ORIGINAL rotated input solves it",
  );
  // Checkpoints stay anchored to the emitted move list: the sexy `insert`
  // checkpoint (index 2 in the alg) shifts by the prepended homing rotation.
  const homeLen = seg.moves.length - 4; // 4 = the sexy alg, no AUF needed here
  assertEquals(seg.checkpoints![0], { label: "insert", index: homeLen + 2 });
});

Deno.test("homing: a home-frame input emits no reorientation (APB path unchanged)", () => {
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: exactLookup([{ state: caseState, case: sexyCase }]),
  };
  const seg = runPhase(phase, caseState)!;
  assert(!seg.moves.some(isRotation), "no rotation is introduced for a home-frame input");
  assertEquals(formatAlg(seg.moves), "R U R' U'");
});

Deno.test("homing: a SearchPhase homes a rotated input then searches the home frame", () => {
  // A fixed-frame goal (exact SOLVED, centers home): with a face-only move set a
  // center-drifted input is unsolvable unless the phase reorients first.
  const phase: SearchPhase = {
    kind: "search",
    id: "solve",
    goal: (s) => statesEqual(s, SOLVED),
    moves: ["U", "D", "L", "R", "F", "B"],
    maxDepth: 6,
  };
  const home = applyAlg(solvedCube(), "R U'");
  const rotated = applyMoves(home, parseAlg("z2"));
  assert(rotated.cn.join("") !== "012345", "input centers are drifted");

  const seg = runPhase(phase, rotated)!;
  assert(seg !== null, "the rotated scramble is solved");
  assert(isRotation(seg.moves[0]), "solution begins by reorienting to the home frame");
  assert(
    statesEqual(applyMoves(rotated, seg.moves), SOLVED),
    "the emitted moves solve the ORIGINAL rotated input to the exact home frame",
  );
});

Deno.test("phases compose: a Strategy's phases chain, threading state and prevMove", () => {
  // Step "demo" with one Strategy = [SearchPhase -> AlgorithmicPhase].
  const step: Step = {
    id: "demo",
    strategies: [{
      id: "search-then-alg",
      phases: [
        {
          kind: "search",
          id: "reach-case",
          goal: (s) => statesEqual(s, caseState),
          moves: ["U", "D", "L", "R", "F", "B"],
          maxDepth: 4,
        },
        {
          kind: "algorithmic",
          id: "finish",
          goal: isSolved,
          cases: exactLookup([{ state: caseState, case: sexyCase }]),
        },
      ],
    }],
  };

  const start = applyAlg(caseState, "F"); // one move away from the case state
  let state = start;
  let prevMove = null as ReturnType<typeof parseAlg>[number] | null;
  const all = [];
  for (const phase of step.strategies[0].phases) {
    const seg = runPhase(phase, state, { prevMove })!;
    all.push(...seg.moves);
    state = seg.endState;
    prevMove = seg.moves.at(-1) ?? prevMove;
  }
  console.log(`  chained solution: ${formatAlg(all)}`);
  assert(isSolved(state));
  assert(isSolved(applyAlg(start, formatAlg(all))));
});
