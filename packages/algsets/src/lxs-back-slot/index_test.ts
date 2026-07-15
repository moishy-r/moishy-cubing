import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { lxsBackSlot } from "./index.ts";

Deno.test("lxsBackSlot is structurally valid", () => {
  assertValidAlgSet(lxsBackSlot);
});
Deno.test("lxsBackSlot has the expected case count", () => {
  assertEquals(lxsBackSlot.cases.length, 116);
});
