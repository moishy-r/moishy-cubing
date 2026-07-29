/**
 * A solver for the APB method (Athefre's Pair & Block).
 *
 * Wires 2x2x3 -> BR Pair -> EO -> LXS -> ZBLL as core steps, plus opt-in
 * replacements (EO Pair, EODR+LS, COLL+EPLL, OCLL+PLL, back-slot EO/LXS) and
 * extras (OLL, ZBLS, Winter/Summer Variation), on top of `@moishy/cubing-core`
 * and case data from `@moishy/algsets`.
 *
 * ```ts
 * import { apb } from "@moishy/apb";
 *
 * const res = await apb.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");
 * res.solutionString;
 * for (const seg of res.segments) console.log(seg.unitId, seg.strategyId);
 * ```
 *
 * Pre-1.0: the solver is verified end to end — every algset is audited against
 * the lookup it is used with, and 540 solves across every replacement and extra
 * all completed — but the public API is not frozen until 1.0.
 *
 * This package is also the reference implementation of "how to add a method" —
 * copying its shape is the recipe for a `@moishy/cfop`, `@moishy/roux`, etc.
 * See the repository's guides/adding-a-method.md and this package's SPEC.md.
 *
 * @module
 */

import { Method, VERSION as CUBING_CORE_VERSION } from "@moishy/cubing-core";
import { apbDefinition } from "./src/apb.ts";

export const VERSION = "0.2.2";
export const CUBING_CORE_VERSION_USED = CUBING_CORE_VERSION;

export { apbDefinition } from "./src/apb.ts";

// The public surface is deliberately narrow: the method, its definition, and the
// piece groups its steps target (useful for reading a SolveResult — highlighting
// the block in a UI, checking what a segment finished).
//
// `src/geometry.ts` holds the rest of the method wiring — goal predicates,
// recognition signatures, CaseLookup builders — and is intentionally NOT
// re-exported. Those are APB's internals: several are meaningless outside its
// algsets (`zblsSignature`, `eodrSignature`), and re-exporting the generic ones
// from the *method* package would freeze them into this contract while their
// proper home is arguably cubing-core or algsets. Building your own method means
// reading geometry.ts as a template, which is what guides/adding-a-method.md says.
export {
  AFTER_BR,
  BLOCK223,
  BR_PAIR,
  EO_EDGE_SLOTS,
  F2L,
  LAST_SLOT,
  type PieceRegion,
} from "./src/geometry.ts";

/** The APB method, ready to `.solve(scramble, settings?)`. See ./src/apb.ts. */
export const apb: Method = new Method(apbDefinition);
