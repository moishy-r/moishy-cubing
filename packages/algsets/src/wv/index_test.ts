import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { wv } from "./index.ts";

Deno.test("wv is structurally valid", () => {
  assertValidAlgSet(wv);
});
Deno.test("wv has the expected case count", () => {
  assertEquals(wv.cases.length, 27);
});
