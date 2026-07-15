import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  type AlgorithmicPhase,
  applyAlg,
  applyMoves,
  isSolved,
  NotationError,
  runPhase,
  solvedCube,
  toFacelets,
} from "@moishy/cubing-core";
import { AlgSetError, defineAlgSet } from "./define.ts";

// A tiny, real case-set: two last-layer cases (the first with two algs) plus a
// "skip". The bare-string and object variant forms are both exercised.
const demo = defineAlgSet({
  id: "demo",
  name: "Demo set",
  cases: [
    {
      id: "sexy",
      // The sexy move has order 6, so 7 repetitions net the same effect — a
      // genuine (if silly) second solution to the same recognized state.
      algs: [
        "R U R' U'",
        {
          alg: "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'",
          source: "7x",
        },
      ],
      name: "Sexy move",
      subset: "triggers",
      tags: ["trigger"],
    },
    { id: "sune", algs: ["R U R' U R U2 R'"], name: "Sune" },
    { id: "skip", algs: [""] },
  ],
});

Deno.test("defineAlgSet parses algs and preserves authoring order + metadata", () => {
  assertEquals(demo.id, "demo");
  assertEquals(demo.name, "Demo set");
  assertEquals(demo.cases.map((c) => c.id), ["sexy", "sune", "skip"]);
  // The primary alg string is parsed into a Move[].
  assertEquals(demo.get("sexy")!.algs[0].moves, [
    { family: "R", amount: 1 },
    { family: "U", amount: 1 },
    { family: "R", amount: 3 },
    { family: "U", amount: 3 },
  ]);
  // The case keeps every variant, with per-variant metadata.
  assertEquals(demo.get("sexy")!.algs.length, 2);
  assertEquals(demo.get("sexy")!.algs[1].source, "7x");
  assertEquals(demo.get("sexy")!.name, "Sexy move");
  assertEquals(demo.get("sexy")!.subset, "triggers");
  assertEquals(demo.get("sexy")!.tags, ["trigger"]);
  assertEquals(demo.get("nope"), undefined);
});

Deno.test("recognition is derived from the primary alg: recognitionState is solved·invert(alg)", () => {
  // The state a case solves is the solved cube run through the inverse of algs[0].
  const sexyState = demo.recognitionState("sexy");
  assertEquals(toFacelets(sexyState), toFacelets(applyAlg(solvedCube(), "U R U' R'")));
  // Applying the primary alg to that state solves the cube — the round trip.
  assert(isSolved(applyMoves(sexyState, demo.get("sexy")!.algs[0].moves)));
  // The second (triple-sexy) variant solves the very same state.
  assert(isSolved(applyMoves(sexyState, demo.get("sexy")!.algs[1].moves)));
  // An empty alg's recognition state is the solved cube itself.
  assert(isSolved(demo.recognitionState("skip")));
});

Deno.test("find recognizes a case by its derived state, and is null otherwise", () => {
  assertEquals(demo.find(demo.recognitionState("sune"))!.id, "sune");
  assertEquals(demo.find(demo.recognitionState("sexy"))!.id, "sexy");
  // A state no case solves is unrecognized.
  assertEquals(demo.find(applyAlg(solvedCube(), "F2 R2")), null);
});

Deno.test("recognitionState returns a fresh copy; mutating it doesn't affect the set", () => {
  const a = demo.recognitionState("sune");
  a.cp[0] = 99;
  // A second read is unaffected, and find still works.
  assertEquals(demo.recognitionState("sune").cp[0] !== 99, true);
  assertEquals(demo.find(demo.recognitionState("sune"))!.id, "sune");
});

Deno.test("recognitionState throws for an unknown id", () => {
  assertThrows(() => demo.recognitionState("ghost"), AlgSetError, "no case with id");
});

Deno.test("defineAlgSet rejects duplicate case ids", () => {
  assertThrows(
    () =>
      defineAlgSet({
        id: "dupes",
        cases: [
          { id: "a", algs: ["R U R' U'"] },
          { id: "a", algs: ["R U2 R'"] },
        ],
      }),
    AlgSetError,
    "duplicate case id",
  );
});

Deno.test("defineAlgSet rejects a case with no algs", () => {
  assertThrows(
    () => defineAlgSet({ id: "empty", cases: [{ id: "x", algs: [] }] }),
    AlgSetError,
    "no algs",
  );
});

Deno.test("defineAlgSet rejects invalid notation at authoring time (any variant)", () => {
  assertThrows(
    () => defineAlgSet({ id: "bad", cases: [{ id: "x", algs: ["R U R'", "R U Q'"] }] }),
    NotationError,
  );
});

Deno.test("a custom signature projection narrows recognition to a sub-region", () => {
  // Recognize on corners only (ignore edge state). "M2" moves only edges, so
  // under a corner-only signature it looks solved.
  const cornersOnly = defineAlgSet({
    id: "corners",
    cases: [{ id: "solved-corners", algs: [""] }],
    signature: (s) => `${s.cp.join(",")}|${s.co.join(",")}`,
  });
  // A pure-edge scramble still matches the solved-corners case.
  assertEquals(cornersOnly.find(applyAlg(solvedCube(), "M2"))!.id, "solved-corners");
  // A corner-moving scramble does not.
  assertEquals(cornersOnly.find(applyAlg(solvedCube(), "R")), null);
});

Deno.test("an AlgSet drops into an AlgorithmicPhase and solves, including AUF", () => {
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "ll",
    goal: isSolved,
    cases: demo, // the AlgSet is itself a CaseLookup
    auf: ["U"],
  };
  // Present the "sune" case, misaligned by a U so runPhase must find a pre-AUF.
  const start = applyMoves(demo.recognitionState("sune"), [{ family: "U", amount: 1 }]);
  const seg = runPhase(phase, start)!;
  assertEquals(seg.caseId, "sune");
  assert(isSolved(seg.endState));
});
