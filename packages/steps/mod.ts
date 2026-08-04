/**
 * Reusable solver steps, shared across speedsolving methods.
 *
 * `@moishy/algsets` is the data side of "don't write this twice"; this is the
 * *step* side — searches and whole steps both. A block-building search is the same
 * search whatever method is calling it, and F2L is the same four slots whoever is
 * filling them, so the machinery, the standard targets and the assembled steps live
 * here and a method composes them.
 *
 * ```ts
 * import { blockSearch, CROSS, f2lSteps, block223Step } from "@moishy/steps";
 * import { dfdb } from "@moishy/algsets/dfdb";
 * import { f2lBySlot } from "@moishy/algsets/f2l";
 * import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
 *
 * const cross = blockSearch("cross", CROSS, { maxDepth: 8 }); // CFOP's cross
 * const f2l = f2lSteps([f2lBySlot, advancedF2lBySlot]); // its four pair steps
 * const block = block223Step(dfdb); // the whole 2x2x3 step, six strategies raced
 * ```
 *
 * Everything here is configuration over `@moishy/cubing-core`: it owns the search
 * engines, the goal predicates and the pattern databases. See
 * /guides/adding-a-method.md.
 *
 * @module
 */

export const VERSION = "0.2.0";

export {
  BACK_222,
  BLOCK223,
  BLOCK_COST_MODEL,
  BLOCK_MOVES,
  blockSearch,
  CROSS,
  CROSS3,
  CROSS_PAIR_BACK,
  CROSS_PAIR_FRONT,
  DIRECT_GROUPS,
  FB_MOVES,
  FRONT_222,
  ROUX_FB,
} from "./src/blocks.ts";

export {
  alignOpenSlotToFront,
  alignSlotToFront,
  f2lGoalLeavingOpen,
  lastSlotSignature,
  wvSvExtra,
  wvSvSignature,
  zblsPhase,
  zblsReplacement,
} from "./src/last-slot.ts";

export {
  collEpllStrategy,
  collLookup,
  cornersOriented,
  cornersSolved,
  cornersSolvedUpToAUF,
  edgesOriented,
  epllLookup,
  llOriented,
  ocllLookup,
  ocllPllStrategy,
  ollLookup,
  ollPllStrategy,
  ollStep,
  pllLookup,
  pllStep,
  zbllStrategy,
} from "./src/last-layer.ts";

export {
  anySlotLookup,
  F2L,
  F2L_SLOT,
  F2L_SLOTS,
  f2lGoal,
  f2lLookup,
  f2lSetupStrategy,
  type F2lSlot,
  f2lStep,
  f2lSteps,
  openSlots,
  slotAt,
  slotSignature,
  slotSolved,
  solvedSlotCount,
  variantSlot,
} from "./src/f2l.ts";

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
