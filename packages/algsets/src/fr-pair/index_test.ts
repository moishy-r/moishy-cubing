import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { frPair } from "./index.ts";

// Structural validation: every alg parsed at construction, ids unique, and each
// case is self-recognized under the default full-facelet signature. The deeper
// contract — every variant genuinely inserts the front pair while preserving
// block223, and region recognition on DFR (4) + FR (8) — is exercised in the apb
// package's tests, where the geometry (region signature/goal) lives.

Deno.test("fr-pair is structurally valid", () => {
  assertValidAlgSet(frPair);
});

Deno.test("fr-pair has the expected case count", () => {
  assertEquals(frPair.cases.length, 89);
});
