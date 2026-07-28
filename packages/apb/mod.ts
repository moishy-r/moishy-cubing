/**
 * A solver for the APB method (Advanced Petrus Blocks).
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
 * Beta: solves are correct end to end and verified in tests, but some algsets
 * are still being authored and Winter/Summer Variation is not yet wired up.
 *
 * This package is also the reference implementation of "how to add a method" —
 * copying its shape is the recipe for a `@moishy/cfop`, `@moishy/roux`, etc.
 * See the repository's guides/adding-a-method.md and this package's SPEC.md.
 *
 * @module
 */

import { Method, VERSION as CUBING_CORE_VERSION } from "@moishy/cubing-core";
import { apbDefinition } from "./src/apb.ts";

export const VERSION = "0.1.2";
export const CUBING_CORE_VERSION_USED = CUBING_CORE_VERSION;

export { apbDefinition } from "./src/apb.ts";
export * from "./src/geometry.ts";

/** The APB method, ready to `.solve(scramble, settings?)`. See ./src/apb.ts. */
export const apb: Method = new Method(apbDefinition);
