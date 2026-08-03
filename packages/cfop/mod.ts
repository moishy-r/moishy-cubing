/**
 * A solver for the CFOP method (Cross, F2L, OLL, PLL).
 *
 * Wires the cross, four interchangeable F2L pair steps, OLL and PLL as core steps,
 * plus the opt-in two-look last-layer replacements (OCLL+PLL, COLL+EPLL), on top of
 * `@moishy/cubing-core`, the shared steps in `@moishy/steps` and the case data in
 * `@moishy/algsets`.
 *
 * ```ts
 * import { cfop } from "@moishy/cfop";
 *
 * const res = await cfop.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");
 * res.solutionString;
 * for (const seg of res.segments) console.log(seg.unitId, seg.strategyId);
 * ```
 *
 * Unlike APB, this method uses rotations: its F2L data contains them and they are
 * executed as written, with the frame an alg leaves carried into the next step.
 *
 * Pre-1.0. The four F2L steps are interchangeable — each solves whichever pair is
 * cheapest — which is also what will let an X-cross replace only the cross step, and
 * a last-slot variant replace only `f2l4`. Neither is wired yet; see src/cfop.ts.
 *
 * @module
 */

import { Method, VERSION as CUBING_CORE_VERSION } from "@moishy/cubing-core";
import { cfopDefinition } from "./src/cfop.ts";

export const VERSION = "0.1.0";
export const CUBING_CORE_VERSION_USED = CUBING_CORE_VERSION;

export { cfopDefinition } from "./src/cfop.ts";

/** The CFOP method, ready to `.solve()`. */
export const cfop: Method = new Method(cfopDefinition);
