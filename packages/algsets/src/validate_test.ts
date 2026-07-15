import { assert, assertEquals, assertThrows } from "@std/assert";
import { isSolved } from "@moishy/cubing-core";
import { defineAlgSet } from "./define.ts";
import { assertValidAlgSet, type IssueKind, validateAlgSet } from "./validate.ts";

// A clean last-layer set: distinct, non-AUF-equivalent cases, all U/R/F moves.
const clean = defineAlgSet({
  id: "clean",
  cases: [
    { id: "sexy", algs: ["R U R' U'"] },
    { id: "sune", algs: ["R U R' U R U2 R'"] },
    { id: "tperm", algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  ],
});

const kinds = (r: { issues: { kind: IssueKind }[] }) => r.issues.map((i) => i.kind);

Deno.test("a clean set passes validation with no issues", () => {
  const report = validateAlgSet(clean, { auf: ["U"], allowedFamilies: ["U", "R", "F"] });
  assert(report.ok, `expected ok, got: ${JSON.stringify(report.issues)}`);
  assertEquals(report.issues, []);
});

Deno.test("goal check passes when each alg solves its own state", () => {
  const report = validateAlgSet(clean, { goal: isSolved });
  assert(report.ok);
});

Deno.test("signature-collision: two cases that solve the same state", () => {
  const set = defineAlgSet({
    id: "collide",
    cases: [
      { id: "sune-a", algs: ["R U R' U R U2 R'"] },
      { id: "sune-b", algs: ["R U R' U R U2 R'"] }, // identical net effect → same signature
    ],
  });
  const report = validateAlgSet(set);
  assert(!report.ok);
  assert(kinds(report).includes("signature-collision"));
  // The second case is the one that lost the signature race.
  assert(report.issues.some((i) => i.kind === "signature-collision" && i.caseId === "sune-b"));
});

Deno.test("auf-ambiguity: a case that is a U-rotation of another", () => {
  // recog(b) = applyMoves(recog(a), U): prefix a's alg with U' to shift its state.
  const set = defineAlgSet({
    id: "auf-amb",
    cases: [
      { id: "sune", algs: ["R U R' U R U2 R'"] },
      { id: "sune-rot", algs: ["U' R U R' U R U2 R'"] },
    ],
  });
  // Without AUF the two are distinct states, so no error.
  assert(validateAlgSet(set).ok);
  // With AUF declared, rotating one onto the other is flagged.
  const report = validateAlgSet(set, { auf: ["U"] });
  assert(!report.ok);
  assert(kinds(report).includes("auf-ambiguity"));
});

Deno.test("disallowed-move: an alg using a family outside the allowed set", () => {
  const set = defineAlgSet({
    id: "wide",
    cases: [{ id: "uses-r-wide", algs: ["r U R' U'"] }],
  });
  const report = validateAlgSet(set, { allowedFamilies: ["U", "R", "F"] });
  assert(!report.ok);
  const issue = report.issues.find((i) => i.kind === "disallowed-move");
  assert(issue);
  assertEquals(issue!.caseId, "uses-r-wide");
});

Deno.test("goal-not-reached: reported when the alg misses the goal", () => {
  // A goal no non-empty case can satisfy: "state is not solved" after solving.
  const report = validateAlgSet(clean, { goal: (s) => !isSolved(s) });
  assert(!report.ok);
  assertEquals(report.issues.every((i) => i.kind === "goal-not-reached"), true);
  assertEquals(report.issues.length, clean.cases.length);
});

Deno.test("empty-alg: a warning by default, an error when opted in", () => {
  const set = defineAlgSet({ id: "with-skip", cases: [{ id: "skip", algs: [""] }] });

  const asWarning = validateAlgSet(set);
  assert(asWarning.ok); // warnings don't fail the set
  assertEquals(asWarning.issues[0].kind, "empty-alg");
  assertEquals(asWarning.issues[0].severity, "warning");

  const asError = validateAlgSet(set, { emptyAlgIsError: true });
  assert(!asError.ok);
  assertEquals(asError.issues[0].severity, "error");
});

Deno.test("assertValidAlgSet is silent on a clean set and throws on errors", () => {
  assertValidAlgSet(clean, { auf: ["U"], allowedFamilies: ["U", "R", "F"] });

  const bad = defineAlgSet({
    id: "bad",
    cases: [
      { id: "a", algs: ["R U R' U R U2 R'"] },
      { id: "b", algs: ["R U R' U R U2 R'"] },
    ],
  });
  assertThrows(() => assertValidAlgSet(bad), Error, "failed validation");
});

Deno.test("goal check runs on every variant: a bad non-primary alg is caught", () => {
  // algs[1] is a real solution to a *different* case, so it doesn't solve this
  // case's state — the per-variant goal check must flag it.
  const set = defineAlgSet({
    id: "bad-variant",
    cases: [{ id: "sune", algs: ["R U R' U R U2 R'", "R U R' U'"] }],
  });
  const report = validateAlgSet(set, { goal: isSolved });
  assert(!report.ok);
  const issue = report.issues.find((i) => i.kind === "goal-not-reached");
  assert(issue);
  assertEquals(issue!.caseId, "sune");
  // The primary alg is fine; only the second variant is reported.
  assertEquals(report.issues.filter((i) => i.kind === "goal-not-reached").length, 1);
});
