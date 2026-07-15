import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { sv } from "./index.ts";

Deno.test("sv is structurally valid", () => {
  assertValidAlgSet(sv);
});
Deno.test("sv has the expected case count", () => {
  assertEquals(sv.cases.length, 27);
});
