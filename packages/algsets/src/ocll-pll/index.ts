// OCLL + PLL — algorithm case data for @moishy/algsets.
//
// PLACEHOLDER: the source data for this set was not available at transform
// time, so the set is defined empty. Add cases with defineAlgSet's authoring
// form (`{ id, algs: ["..."], name?, subset? }`) as the algs land.
//
// OCLL (orient last-layer corners) followed by full PLL — the ZBLL->OCLL+PLL replacement (see /DESIGN.md).

import { type AlgSet, defineAlgSet } from "../define.ts";

export const ocllPll: AlgSet = defineAlgSet({
  id: "ocll",
  name: "OCLL + PLL",
  cases: [],
});
