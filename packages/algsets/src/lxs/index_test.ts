import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { lxs } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// Full recognition/goal validation awaits the method's LXS region signature
// (step 8).

Deno.test("lxs is structurally valid", () => {
  assertValidAlgSet(lxs);
});

Deno.test("lxs has the expected case count", () => {
  assertEquals(lxs.cases.length, 116);
});
