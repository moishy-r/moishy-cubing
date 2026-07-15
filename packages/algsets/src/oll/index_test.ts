import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { oll } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// Recognizing OLL by orientation-only (ignoring last-layer permutation) and
// verifying the alternative algs orient the case need the method's OLL
// recognition + AUF handling (step 8).

Deno.test("oll is structurally valid", () => {
  assertValidAlgSet(oll);
});

Deno.test("oll has the expected case count", () => {
  assertEquals(oll.cases.length, 57);
});
