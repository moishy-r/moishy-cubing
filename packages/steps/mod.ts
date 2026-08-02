/**
 * Reusable solver steps, shared across speedsolving methods.
 *
 * `@moishy/algsets` is the data side of "don't write this twice"; this is the
 * search side. A block-building search is the same search whatever method is
 * calling it — only the cubies in the goal change — so the machinery and the
 * standard targets live here, and a method composes them.
 *
 * ```ts
 * import { blockSearch, CROSS, block223Step } from "@moishy/steps";
 * import { dfdb } from "@moishy/algsets/dfdb";
 *
 * const cross = blockSearch("cross", CROSS, { maxDepth: 8 }); // CFOP's cross
 * const block = block223Step(dfdb); // the whole 2x2x3 step, six strategies raced
 * ```
 *
 * Everything here is configuration over `@moishy/cubing-core`: it owns the search
 * engines, the goal predicates and the pattern databases. See
 * /guides/adding-a-method.md.
 *
 * @module
 */

export const VERSION = "0.1.0";

export {
  BACK_222,
  BLOCK223,
  BLOCK_COST_MODEL,
  BLOCK_MOVES,
  blockSearch,
  CROSS,
  CROSS_PAIR_BACK,
  CROSS_PAIR_FRONT,
  DIRECT_GROUPS,
  FB_MOVES,
  FRONT_222,
  ROUX_FB,
} from "./src/blocks.ts";

export {
  block223Step,
  BLOCK_STRATEGIES,
  cornerFirstBack,
  cornerFirstFront,
  cross1Back,
  cross1Front,
  dfdbSignature,
  direct,
  rouxFbDfdb,
  type Step,
} from "./src/block223.ts";
