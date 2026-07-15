import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { dfdb } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// Full recognition/goal validation awaits the method's DF/DB region signature
// (step 8).

Deno.test("dfdb is structurally valid", () => {
  assertValidAlgSet(dfdb);
});

Deno.test("dfdb has the expected case count", () => {
  assertEquals(dfdb.cases.length, 527);
});
