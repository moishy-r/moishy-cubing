# @moishy/steps

Reusable solver steps for speedsolving methods — the _step_ side of "don't write this twice".

```sh
deno add jsr:@moishy/steps    # Deno — https://jsr.io/@moishy/steps
npm  install @moishy/steps    # Node — https://www.npmjs.com/package/@moishy/steps
```

Building a method rather than a step? Start from [`@moishy/apb`](https://jsr.io/@moishy/apb) and
[the guide](../../guides/adding-a-method.md); this package is what such a method composes.

[`@moishy/algsets`](../algsets) already does this for algorithm data: a PLL case is a PLL case
whoever is solving it, so the data lives in one package and every method imports it. Steps are the
same. A Roux first block, a 2x2x2, a 2x2x3, a cross are the same _search_ each time, with only the
cubies in the goal changing; F2L is the same four slots whoever is filling them. This package holds
those searches, the standard targets and the assembled steps, so a method is composition rather than
re-derivation.

```ts
import { block223Step, blockSearch, CROSS, f2lSteps, ROUX_FB } from "@moishy/steps";
import { dfdb } from "@moishy/algsets/dfdb";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";

// CFOP's cross: the four D-layer cross edges, pruning-guided A*.
const cross = blockSearch("cross", CROSS, { maxDepth: 8 });

// ...and its four pair steps. Each inserts whichever pair is cheapest.
const f2l = f2lSteps([f2lBySlot, advancedF2lBySlot]);

// Roux's first block, on its own.
const fb = blockSearch("rouxFB", ROUX_FB, { lrHome: true, maxDepth: 9 });

// Or the whole 2x2x3 step, six strategies raced against each other.
const block = block223Step(dfdb);
```

## What's here

**`blockSearch(id, goal, opts)`** — a block-building search phase. Wires the goal, the move set, an
admissible pruning table, A\*, axis canonicalization and region-coordinate keying, plus the optional
whole-block guard heuristic and phase-chaining pool key. This is the piece worth sharing: getting a
slice/wide-inclusive search to be both cost-optimal and fast took all of those together.

**Standard targets** — `ROUX_FB`, `CROSS` (the four D-layer edges), `CROSS3` (the three-edge region
of APB's 2x2x3, not a method's cross), `FRONT_222`, `BACK_222`, `BLOCK223`, `CROSS_PAIR_FRONT`,
`CROSS_PAIR_BACK`, and `DIRECT_GROUPS` (the overlapping sub-regions that make a single whole-block
search tractable).

**Move sets and the block cost model** — `BLOCK_MOVES` (outer + slices + wides), `FB_MOVES` (the
Roux-FB generator that fixes L and R), and `BLOCK_COST_MODEL`, which ranks by move count first with
a small ergonomic tiebreak. Blockbuilders optimize move count; the last layer optimizes ergonomics.

**Six 2x2x3 strategies** — `rouxFbDfdb`, `direct`, `cornerFirstFront`, `cornerFirstBack`,
`cross1Front`, `cross1Back`, exported individually so a method can take one, and as `block223Step()`
for a method that wants the whole race.

## Why it depends on @moishy/algsets

Only `rouxFbDfdb` needs it: its second phase places DF/DB by algorithm, so it takes an `AlgSet`.
Shipping the strategy whole is the point — it is the reference phase-chaining case and the cheapest
of the six, and splitting it would leave every method re-deriving the same pool key, frame-relative
flag and shared cost model. Everything else here is algset-free.

Dependency order across the workspace is `cubing-core → algsets → steps → methods`; nothing points
back up.

## What isn't here

Method wiring. Which pieces _your_ steps target, which algset backs each one, the signatures your
recognition keys on — that is the method's business, and it is what a method package is. See
[`@moishy/apb`](../apb) for a worked example and [the guide](../../guides/adding-a-method.md) for
the recipe.
