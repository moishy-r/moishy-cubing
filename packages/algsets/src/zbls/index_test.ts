import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { zbls } from "./index.ts";

Deno.test("zbls is structurally valid", () => {
  assertValidAlgSet(zbls);
});
Deno.test("zbls has the expected case count", () => {
  assertEquals(zbls.cases.length, 302);
});
