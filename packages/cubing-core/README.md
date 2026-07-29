# @moishy/cubing-core

The cube engine and solver framework behind
[moishy-cubing](https://github.com/moishy-r/moishy-cubing): cubie-level state, notation, a pluggable
ergonomic cost model, guided search, and the Step → Strategy → Phase pipeline that methods are built
from.

Zero dependencies. Runs on Deno, Node, and in the browser.

```sh
deno add jsr:@moishy/cubing-core    # Deno — https://jsr.io/@moishy/cubing-core
npm  install @moishy/cubing-core    # Node — https://www.npmjs.com/package/@moishy/cubing-core
```

Looking for a ready-made solver? See [`@moishy/apb`](https://jsr.io/@moishy/apb). This package is
the toolkit you use to build one.

## Cube State

State is stored at the **cubie** level — corner and edge permutation and orientation, plus center
orientation — so slice moves, wide moves and whole-cube rotations are all first-class, and "are the
centers still where they started?" is a question you can ask.

```ts
import {
  applyAlg,
  formatAlg,
  invert,
  isSolved,
  parseAlg,
  solvedCube,
  toFacelets,
} from "@moishy/cubing-core";

const state = applyAlg(solvedCube(), "R U R' U'");
isSolved(state); // false
toFacelets(state); // 54-char facelet string
formatAlg(invert(parseAlg("R U R' U'"))); // "U R U' R'"
```

Notation is SiGN style: `R L U D F B` faces, `M E S` slices, lowercase `r l u d f b` wides, `x y z`
rotations, `'` for counter-clockwise, `2` for a half turn.

## Move Cost (MCC)

The library's objective function. Rather than counting moves, it estimates how hard a sequence is to
**execute** — base difficulty per move plus transition penalties for regrips and awkward same-axis
sequences.

```ts
import { createDefaultMoveCostModel, parseAlg, scoreAlg } from "@moishy/cubing-core";

const twoHanded = createDefaultMoveCostModel();
const oneHanded = createDefaultMoveCostModel({ mode: "OH", handedness: "left" });

scoreAlg(parseAlg("R U R' U'"), twoHanded); // 3.60
```

Any object with `cost(move, context)` works, so you can model your own hands. A block-building
variant (`createBlockCostModel`) is also exported — move-count-dominant and wide-averse, for the
phases where blockbuilders care about turn count rather than smoothness.

## Search

A goal predicate, a move set, and an admissible heuristic:

```ts
import { searchAStar, solvedCube } from "@moishy/cubing-core";

const result = searchAStar({
  start: state,
  goal: (s) => /* ... */,
  moves: ["U", "D", "L", "R", "F", "B"],
  heuristic: (s) => /* lower bound on remaining cost */,
  maxDepth: 8,
});
result.moves; // cheapest sequence found
result.nodesVisited;
```

`search` (IDA*) and `searchAStar` (A*, best when you have a strong pruning table) both return the
cost-optimal solution. `searchAStarMany` returns a _pool_ of distinct near-optimal solutions, which
is what lets a later step choose the predecessor that suits it.

The heuristic must never overestimate the remaining cost, or optimality is lost.

## Building a Method

A method is data. Steps run in order; each registers strategies that race by cost; each strategy is
a list of phases that are either searches or algorithm lookups.

```ts
import { Method, type MethodDefinition } from "@moishy/cubing-core";

const definition: MethodDefinition = {
  id: "cfop",
  steps: [crossStep, f2lStep, ollStep, pllStep],
  recommendedSettings: { colorNeutrality: "fixed", lookahead: { depth: 1 } },
};

export const cfop = new Method(definition);
const res = await cfop.solve("R U R' U'");
```

The runner handles strategy racing, phase chaining, cross-step lookahead, color-neutral orientation
selection, replacements and extras, and time/abort budgets.

Full walkthrough:
[Adding a Method](https://github.com/moishy-r/moishy-cubing/blob/main/guides/adding-a-method.md).

## Documentation

- [Getting Started](https://github.com/moishy-r/moishy-cubing/blob/main/guides/getting-started.md)
- [Solver Settings](https://github.com/moishy-r/moishy-cubing/blob/main/guides/solver-settings.md)
- [Adding a Method](https://github.com/moishy-r/moishy-cubing/blob/main/guides/adding-a-method.md)
- [DESIGN.md](https://github.com/moishy-r/moishy-cubing/blob/main/DESIGN.md) — the architecture and
  the reasoning behind it

## License

MIT © Moshe Rosenberg
