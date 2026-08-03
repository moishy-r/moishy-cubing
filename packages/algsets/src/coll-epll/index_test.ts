import { assert, assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { collEpll } from "./index.ts";

Deno.test("coll is structurally valid", () => {
  assertValidAlgSet(collEpll);
});
Deno.test("coll has the expected case count", () => {
  assertEquals(collEpll.cases.length, 40);
});

// A last-layer alg has no business starting with a whole-cube rotation. With the F2L
// already solved, a leading `y` does the same job as the U turn the phase's AUF would
// supply anyway, so it is a transcription artifact rather than technique — and it costs
// a real regrip. This set arrived with 87 of its 160 algs starting with one, three
// presentations of the same alg per case; each is now the matching U turn, verified to
// leave every case recognizing exactly the states it did before.
//
// Mid-alg rotations are a different matter and are kept: some algs genuinely need one
// (the E-perm's `x`, and a handful here), and no AUF can replace those.
Deno.test("no alg starts with a whole-cube rotation", () => {
  const offenders: string[] = [];
  for (const c of collEpll.cases) {
    for (const v of c.algs) {
      if ("xyz".includes(v.moves[0].family)) offenders.push(`${c.id}: ${v.moves[0].family}...`);
    }
  }
  assertEquals(offenders, []);
});

// Every case must offer at least one rotation-free alg, so the cost race is never
// forced into a regrip. Two cases had none before the substitution.
Deno.test("every case has a rotation-free alg", () => {
  for (const c of collEpll.cases) {
    assert(
      c.algs.some((v) => !v.moves.some((m) => "xyz".includes(m.family))),
      `${c.id} has no rotation-free alg`,
    );
  }
});
