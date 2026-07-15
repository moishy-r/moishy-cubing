import { assert, assertEquals } from "@std/assert";
import { applyAlg, type CubeState, isSolved, solvedCube } from "./cube-state.ts";
import { formatAlg } from "./notation.ts";
import { search } from "./search.ts";

const FACES = ["U", "D", "L", "R", "F", "B"] as const;

// A simple admissible heuristic: every move restores at most 8 cubies (a face
// turn cycles 4 corners + 4 edges), and the cheapest move costs 0.8, so the
// remaining cost is at least (misplaced / 8) * 0.8. Never overestimates.
function misplacedHeuristic(s: CubeState): number {
  let out = 0;
  for (let i = 0; i < 8; i++) if (s.cp[i] !== i || s.co[i] !== 0) out++;
  for (let i = 0; i < 12; i++) if (s.ep[i] !== i || s.eo[i] !== 0) out++;
  return (out / 8) * 0.8;
}

Deno.test("an already-solved start yields an empty solution at zero cost", () => {
  const r = search({ start: solvedCube(), goal: isSolved, moves: [...FACES] });
  assertEquals(r.moves, []);
  assertEquals(r.cost, 0);
  assert(r.found);
});

Deno.test("undoing a single quarter turn finds the prime (cheapest fix)", () => {
  const start = applyAlg(solvedCube(), "R");
  const r = search({ start, goal: isSolved, moves: [...FACES] });
  console.log(`  undo "R"  ->  ${formatAlg(r.moves)}   cost=${r.cost}   nodes=${r.nodesVisited}`);
  assertEquals(formatAlg(r.moves), "R'");
  assertEquals(r.cost, 0.8);
  assert(isSolved(applyAlg(start, formatAlg(r.moves))));
});

Deno.test("solving a 4-move scramble finds a valid 4-move (or better) solution", () => {
  const scramble = "R U R' U'"; // sexy move
  const start = applyAlg(solvedCube(), scramble);
  const r = search({ start, goal: isSolved, moves: [...FACES], maxDepth: 8 });
  console.log(
    `  undo "${scramble}"  ->  ${formatAlg(r.moves)}   cost=${r.cost}   nodes=${r.nodesVisited}`,
  );
  assert(r.found);
  assert(isSolved(applyAlg(start, formatAlg(r.moves))));
  assert(r.moves.length <= 4);
});

Deno.test("restricting the move set keeps the search inside those families", () => {
  const start = applyAlg(solvedCube(), "U2");
  const r = search({ start, goal: isSolved, moves: ["U"] });
  console.log(`  undo "U2" with {U} only  ->  ${formatAlg(r.moves)}   cost=${r.cost}`);
  assertEquals(formatAlg(r.moves), "U2");
  assert(r.moves.every((m) => m.family === "U"));
});

Deno.test("an admissible heuristic finds the same optimum with fewer nodes", () => {
  const start = applyAlg(solvedCube(), "R U F'");
  const plain = search({ start, goal: isSolved, moves: [...FACES], maxDepth: 6 });
  const guided = search({
    start,
    goal: isSolved,
    moves: [...FACES],
    maxDepth: 6,
    heuristic: misplacedHeuristic,
  });
  console.log(
    `  undo "R U F'":  plain ${formatAlg(plain.moves)} (nodes=${plain.nodesVisited})  |  ` +
      `guided ${formatAlg(guided.moves)} (nodes=${guided.nodesVisited})`,
  );
  assertEquals(guided.cost, plain.cost); // same optimal cost
  assert(guided.nodesVisited <= plain.nodesVisited);
  assert(isSolved(applyAlg(start, formatAlg(guided.moves))));
});

Deno.test("a too-shallow depth bound reports no solution", () => {
  const start = applyAlg(solvedCube(), "R U R' U'");
  const r = search({ start, goal: isSolved, moves: [...FACES], maxDepth: 2 });
  assertEquals(r.found, false);
  assertEquals(r.cost, Infinity);
});
