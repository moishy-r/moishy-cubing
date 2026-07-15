import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { eodr } from "./index.ts";

Deno.test("eodr is structurally valid", () => {
  assertValidAlgSet(eodr);
});
Deno.test("eodr has the expected case count", () => {
  assertEquals(eodr.cases.length, 55);
});
