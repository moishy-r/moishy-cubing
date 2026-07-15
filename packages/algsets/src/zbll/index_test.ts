import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { zbll } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// ZBLL recognition and verifying the alternative algs solve the case need the
// method's AUF/rotation-aware recognition (step 8); the source's alternative
// algs carry AUF-offset/rotation relative to the primary.
//
// This is 472 cases — the 493 ZBLLs minus the 21 that coincide with PLL (kept
// in the separate `pll` set). Whether to fold PLL back in or infer it is a
// method-layer decision (see /DESIGN.md, "Replacements"), left open for now.

Deno.test("zbll is structurally valid", () => {
  assertValidAlgSet(zbll);
});

Deno.test("zbll has the expected case count", () => {
  assertEquals(zbll.cases.length, 472);
});
