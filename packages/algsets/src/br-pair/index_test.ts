import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { brPair } from "./index.ts";

// Structural validation only. The always-on checks confirm the transform
// produced well-formed cases: every alg parsed (at construction), ids are
// unique, and each case is distinguishable from the others by its primary
// alg's derived state (self-recognition under the default full-facelet
// signature).
//
// Deeper checks — that every *alternative* alg is a genuine solution to the
// same case, and recognition on only the BR-pair region — need the phase's
// AUF/rotation-aware recognition, which lands with the method wiring (step 8).
// The source stores alternative algs with an AUF/rotation offset relative to
// the primary, so they are not interchangeable in a fixed frame until then.

Deno.test("br-pair is structurally valid", () => {
  assertValidAlgSet(brPair);
});

Deno.test("br-pair has the expected case count", () => {
  assertEquals(brPair.cases.length, 89);
});
