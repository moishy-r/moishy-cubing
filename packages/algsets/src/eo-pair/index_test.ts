import { assert, assertEquals } from "@std/assert";
import { validateAlgSet } from "../validate.ts";
import { eoPair } from "./index.ts";

// EOPair spans several recognition subsets (or, ou, dfr, dbr, mu, mr) that can
// share a full-cube solved state, so under the default full-facelet signature a
// handful of cases across subsets collapse together. Distinguishing them needs
// EOPair's own region signature — recognizing only the EO + pair region — which
// lands with the method wiring (step 8). Until then we assert the *only* errors
// are those cross-subset collisions (nothing structurally wrong with the algs),
// and record the current count as a regression guard.

Deno.test("eo-pair: only cross-subset signature collisions remain (pending region signature)", () => {
  const report = validateAlgSet(eoPair);
  const errors = report.issues.filter((i) => i.severity === "error");
  assert(
    errors.every((i) => i.kind === "signature-collision"),
    `unexpected non-collision errors: ${
      JSON.stringify(errors.filter((i) => i.kind !== "signature-collision"))
    }`,
  );
  assertEquals(errors.length, 4);
});

Deno.test("eo-pair has the expected case count", () => {
  assertEquals(eoPair.cases.length, 148);
});
