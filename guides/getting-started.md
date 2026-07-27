# Getting started

Install a method package and solve a scramble. This guide covers installation, your first solve, and
how to read what comes back.

> Prefer to poke at it first? The [browser demo](https://cubing.moishy.dev/apb-demo/) exposes every
> setting described here, with no install.

## Install

The packages live on [JSR](https://jsr.io/@moishy). Install the method you want; it pulls in
`@moishy/cubing-core` and `@moishy/algsets` itself.

**Deno**

```sh
deno add jsr:@moishy/apb
```

**Node** (npm, pnpm, yarn, bun — see
[jsr.io/docs/npm-compatibility](https://jsr.io/docs/npm-compatibility))

```sh
npx jsr add @moishy/apb
```

**Browser** — bundle it yourself; the library is dependency-free and runs client-side:

```sh
deno bundle --platform browser --minify -o apb.bundle.js entry.ts
```

## Your first solve

`apb.solve()` takes a scramble in [SiGN notation](#notation) and returns a `Promise<SolveResult>`.

```ts
import { apb } from "@moishy/apb";

const res = await apb.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");

console.log(res.solved); // true
console.log(res.solutionString); // "r2 U R2 U F B2 M' D' U r U2 R' U f R' f' ..."
console.log(res.solution.length); // 44   (moves)
console.log(res.cost); // 46.45 (MCC — see below)
```

Nothing is required beyond the scramble; every setting has a default, and each method ships its own
recommended ones.

## Reading the result

The interesting part is `segments` — one entry per solved _unit_ (a step, or a replacement spanning
several steps), in execution order:

```ts
for (const seg of res.segments) {
  console.log(
    seg.unitId, // "block223" | "brPair" | "eo" | "lxs" | "zbll"
    seg.strategyId, // which strategy won the race for this step
    seg.caseId, // for algorithmic steps: which case was recognized
    seg.moves.length,
    seg.cost,
  );
}
```

For the scramble above:

| unit       | strategy | moves                                  |
| ---------- | -------- | -------------------------------------- |
| `block223` | `fbDfdb` | `r2 U R2 U F B2 M' D' U r`             |
| `brPair`   | `brPair` | `U2 R' U f R' f'`                      |
| `eo`       | `eo`     | `U F R' F' R`                          |
| `lxs`      | `lxs`    | `U' R U2 R' U2 R U R'`                 |
| `zbll`     | `zbll`   | `U R U R' U R U' R D R' U' R D' R2 U2` |

Each segment also carries `phases` (the sub-steps inside a strategy, e.g. the FB search and the DFDB
algorithm that make up `block223`), `startState`/`endState` snapshots, and `alternatives` — the
strategies that lost the race and what they would have cost. That last one is what makes the result
useful for a trainer UI: you can show the road not taken.

### `cost` is not move count

`cost` is the **MCC** (move-cost model) score: an ergonomic estimate of how hard the sequence is to
execute, not how long it is. Regrips, awkward faces and wide/slice moves cost more than a clean `R`
or `U`. The solver minimizes _this_, so it will happily return a longer solution that turns better.

Score any sequence yourself:

```ts
import { createDefaultMoveCostModel, parseAlg, scoreAlg } from "@moishy/cubing-core";

scoreAlg(parseAlg("R U R' U'"), createDefaultMoveCostModel()); // 3.60
```

To optimize for one-handed instead, pass a different model — see
[Solver settings](./solver-settings.md#move-cost-model).

### Verifying a solution

`orientation` is the free pre-rotation colour neutrality picked. It is **not** part of the solution
and costs nothing — it models turning the cube over during inspection. To check a solution against
the original scramble, conjugate by it:

```ts
import { applyMoves, invert, isSolved, parseAlg, solvedCube } from "@moishy/cubing-core";

const scramble = parseAlg("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");
const framed = applyMoves(solvedCube(), [
  ...invert(res.orientation),
  ...scramble,
  ...res.orientation,
]);
isSolved(applyMoves(framed, res.solution)); // true
```

If you solve with `colorNeutrality: "fixed"` the orientation is always empty and you can skip this.

## Cube primitives

`@moishy/cubing-core` is usable on its own for cube manipulation, independent of any solver:

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

State is stored at the **cubie** level (corner/edge permutation + orientation + centre orientation),
so slice and wide moves and whole-cube rotations are all first-class.

### Notation

SiGN style: `R L U D F B` faces, `M E S` slices, lowercase `r l u d f b` wides, `x y z` rotations,
with `'` for counter-clockwise and `2` for a half turn. `parseAlg` throws `NotationError` on
anything it doesn't recognize.

## Bounding the work

Searching is capped so a solve cannot run away:

```ts
const res = await apb.solve(scramble, {}, {
  timeBudgetMs: 10_000, // give up after 10s and return solved: false
  signal: controller.signal, // AbortSignal — cancel from outside
  maxDepth: 20, // default search-depth bound for phases without their own
});
```

On budget exhaustion the solver returns a `SolveResult` with `solved: false` and whatever segments
it committed, rather than throwing.

## Next

- [Solver settings](./solver-settings.md) — every knob: colour neutrality, strategy selection,
  lookahead, replacements, extras
- [Adding a method](./adding-a-method.md) — build a CFOP/Roux/ZZ plugin on the same engine
