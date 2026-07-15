import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { collEpll } from "./index.ts";

Deno.test("coll is structurally valid", () => {
  assertValidAlgSet(collEpll);
});
Deno.test("coll has the expected case count", () => {
  assertEquals(collEpll.cases.length, 40);
});
