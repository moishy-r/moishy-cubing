import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { ocllPll } from "./index.ts";

// Placeholder set (no algs yet). It is trivially valid; the count guard flips
// to a real assertion once cases are added.
Deno.test("ocll is a valid (empty) placeholder set", () => {
  assertValidAlgSet(ocllPll);
  assertEquals(ocllPll.cases.length, 0);
});
