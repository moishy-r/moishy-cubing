/**
 * OCLL + PLL — algorithm case data for `@moishy/algsets`.
 *
 * Orients last-layer corners, then a full PLL — the two-look alternative to ZBLL.
 *
 * PLACEHOLDER: the source data for this set was not available at transform time, so the set is
 * defined empty. Add cases with defineAlgSet's authoring form (`{ id, algs: ["..."], name?,
 * subset? }`) as the algs land. OCLL (orient last-layer corners) followed by full PLL — the
 * ZBLL->OCLL+PLL replacement (see /DESIGN.md).
 *
 * ```ts
 * import { ocllPll } from "@moishy/algsets/ocll-pll";
 * ocllPll.cases.length;
 * ```
 *
 * @module
 */

import { type AlgSet, defineAlgSet } from "../define.ts";

/** OCLL + PLL. Recognition is derived from each case's primary alg. */
export const ocllPll: AlgSet = defineAlgSet({
  id: "ocll",
  name: "OCLL + PLL",
  cases: [],
});
