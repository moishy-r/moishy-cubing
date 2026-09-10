import { assertEquals } from "@std/assert";
import { applyMoves, pieceSignature } from "@moishy/cubing-core";
import { assertValidAlgSet } from "../validate.ts";
import { regionLookup } from "../lookup.ts";
import { brPair } from "../br-pair/index.ts";
import { eoPair } from "../eo-pair/index.ts";
import { formPair } from "./index.ts";

// Structural validation: unique ids, every case self-recognizable under the
// default full-facelet signature (see `AlgCaseInput.baseState` — recognition
// is still fully alg-derived, just anchored to a waypoint state instead of the
// solved cube).
Deno.test("form-pair is structurally valid", () => {
  assertValidAlgSet(formPair);
});

Deno.test("form-pair has the expected case count", () => {
  // 251 reachable raw (DBR,BR) positions minus the 15 already at a formed
  // position (no case needed — `runPhase`'s zero-move skip covers those).
  assertEquals(formPair.cases.length, 236);
});

// The 16 geometric "formed" positions: eo-pair's or/ou/mr/mu subsets, plus the
// literal solved position. Independent of form-pair's own generation code —
// recomputed here so the test can't share a bug with the generator.
const INSERT_SUBSETS = new Set(["or", "ou", "mr", "mu"]);
const posSig = pieceSignature([7], [11]);
const formedPositions = new Set<string>();
for (const c of eoPair.cases) {
  if (INSERT_SUBSETS.has(c.subset ?? "")) formedPositions.add(posSig(eoPair.recognitionState(c.id)));
}
formedPositions.add("7.0/11.0"); // solved

Deno.test("form-pair: every case's every variant reaches a genuinely formed position", () => {
  for (const c of formPair.cases) {
    const state = formPair.recognitionState(c.id);
    for (let vi = 0; vi < c.algs.length; vi++) {
      const end = applyMoves(state, c.algs[vi].moves);
      const sig = posSig(end);
      if (!formedPositions.has(sig)) {
        throw new Error(
          `form-pair case ${c.id} variant #${vi} lands at ${sig}, which is not a formed position`,
        );
      }
    }
  }
});

Deno.test("form-pair: every one of the 251 reachable (DBR,BR) raw states is covered", () => {
  // Every raw state is either already formed (no case needed) or has a
  // form-pair case recognizing it — via the SAME wrapping apb.ts uses
  // (`regionLookup`, keyed on pieceSignature([7],[11])), since form-pair's own
  // native signature is the default full-facelet one (like br-pair's).
  const lookup = regionLookup(formPair, posSig);
  const U = (n: number) => (n ? [{ family: "U" as const, amount: n as 1 | 2 | 3 }] : []);
  const seen = new Set<string>();
  const uncovered: string[] = [];
  for (const c of brPair.cases) {
    for (let k = 0; k < 4; k++) {
      const state = applyMoves(brPair.recognitionState(c.id), U(k));
      const sig = posSig(state);
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (formedPositions.has(sig)) continue; // already formed, no case needed
      if (!lookup.find(state)) uncovered.push(sig);
    }
  }
  assertEquals(seen.size, 251);
  assertEquals(uncovered, []);
});
