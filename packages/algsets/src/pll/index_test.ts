import { assert, assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { pll } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// PLL recognition (permutation up to AUF) and verifying the alternative algs
// solve the case need the method's AUF/rotation-aware recognition (step 8):
// the source's alternative algs carry AUF-offset/rotation relative to the
// primary, so they are not interchangeable in a fixed frame yet.
//
// This is the 21 canonical PLLs. The OCLL+PLL replacement of ZBLL (see
// /DESIGN.md, "Replacements") will consume this set alongside an OCLL set.

Deno.test("pll is structurally valid", () => {
  assertValidAlgSet(pll);
});

Deno.test("pll has the expected case count", () => {
  assertEquals(pll.cases.length, 21);
});

// Each primary alg must actually be a PLL: its derived recognition state permutes
// only the last layer, with everything oriented. This catches a mislabelled
// import (e.g. an OLL alg pasted into a PLL case) that structural validation
// alone passes — as happened to the F-perm, whose corrupt primary disturbed the
// D-layer and edge orientation and silently made the whole case unrecognizable.
Deno.test("every pll primary alg is a genuine last-layer permutation", () => {
  for (const c of pll.cases) {
    const s = pll.recognitionState(c.id);
    assert(s.co.every((o) => o === 0), `${c.id}: corners not all oriented`);
    assert(s.eo.every((o) => o === 0), `${c.id}: edges not all oriented`);
    for (let i = 4; i < 8; i++) assert(s.cp[i] === i, `${c.id}: disturbs D-layer corner ${i}`);
    for (let i = 4; i < 12; i++) assert(s.ep[i] === i, `${c.id}: disturbs a non-LL edge ${i}`);
  }
});
