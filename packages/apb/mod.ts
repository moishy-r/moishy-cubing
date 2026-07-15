// @moishy/apb
//
// The APB method plugin: a Method subclass wiring up 2x2x3, BR Pair, EO,
// LXS, and ZBLL as core steps, plus its registered replacements
// (e.g. BR Pair+EO -> EOPair) and extras (e.g. Winter/Summer Variation),
// built on @moishy/cubing-core and case data from @moishy/algsets.
//
// This is the reference implementation of "how to add a new method" -
// once it's built out, copying this package's shape is the recipe for
// a @moishy/cfop, @moishy/roux, @moishy/zz, etc.

import { Method, VERSION as CUBING_CORE_VERSION } from "@moishy/cubing-core";
import { apbDefinition } from "./src/apb.ts";

export const VERSION = "0.0.1";
export const CUBING_CORE_VERSION_USED = CUBING_CORE_VERSION;

export { apbDefinition } from "./src/apb.ts";
export * from "./src/geometry.ts";

/** The APB method, ready to `.solve(scramble, settings?)`. See ./src/apb.ts. */
export const apb: Method = new Method(apbDefinition);
