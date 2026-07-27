# moishy-cubing

A TypeScript toolkit for building Rubik's cube **speedsolving-method solvers**. Not a "find the
shortest solution" engine — it produces the solution a _human_ following a given method would
actually execute, ranked by how ergonomic it is to turn.

Runs on Deno, Node, and in the browser. Published to [JSR](https://jsr.io/@moishy).

**[Try the APB solver in your browser →](https://cubing.moishy.dev/apb-demo/)** (runs entirely
client-side, no server)

```ts
import { apb } from "@moishy/apb";

const res = await apb.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");

console.log(res.solutionString); // r2 U R2 U F B2 M' D' U r U2 R' U f R' f' ...
console.log(res.solved, res.solution.length, res.cost); // true 44 46.45

for (const seg of res.segments) {
  console.log(seg.unitId, seg.strategyId, seg.moves.length);
  // block223 fbDfdb 10 · brPair brPair 6 · eo eo 5 · lxs lxs 8 · zbll zbll 15
}
```

## What makes it different

- **Method-shaped, not god's-algorithm.** A solve is a pipeline of named steps (`block223` →
  `brPair` → `eo` → `lxs` → `zbll`), each solved by a _strategy_ — either a search or a lookup into
  a real algorithm set. The output is a solve you could learn from, with every step labelled.
- **Ergonomics are the objective.** Solutions are ranked by a pluggable move-cost model (MCC), not
  by move count, so a longer smooth solution can legitimately beat a shorter awkward one. Two-handed
  and one-handed models ship in the box.
- **Every step races alternatives.** Multiple strategies per step, multiple algs per case, and
  optional _lookahead_ that picks the choice minimizing this step **plus** the next.
- **Colour neutrality is close to free.** Racing 8 (or 24) starting orientations costs only the
  first step's search; the winner is committed and the rest of the solve runs once.

## Packages

| Package                                         | Install                            | What it is                                                                           |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| [`@moishy/cubing-core`](./packages/cubing-core) | `deno add jsr:@moishy/cubing-core` | Cube engine, search, MCC cost models, the Step→Strategy→Phase model, solver pipeline |
| [`@moishy/algsets`](./packages/algsets)         | `deno add jsr:@moishy/algsets`     | Algorithm case data (ZBLL, PLL, OLL, COLL, …) with recognition derived from the algs |
| [`@moishy/apb`](./packages/apb)                 | `deno add jsr:@moishy/apb`         | The APB method — and the reference implementation for adding your own                |

On Node, use `npx jsr add @moishy/apb` (see [Getting started](./guides/getting-started.md)).

## Documentation

**Using the library**

- [Getting started](./guides/getting-started.md) — install, first solve, reading a `SolveResult`
- [Solver settings](./guides/solver-settings.md) — colour neutrality, strategy selection, lookahead,
  replacements and extras
- [Adding a method](./guides/adding-a-method.md) — build your own CFOP/Roux/ZZ plugin

**Internals** — design notes for people working _on_ the library, not with it:

- [DESIGN.md](./DESIGN.md) — architecture: cube representation, cost model, the composition model,
  the pipeline runner
- [packages/apb/SPEC.md](./packages/apb/SPEC.md) — the APB method spec, step by step
- [packages/algsets/AUTHORING.md](./packages/algsets/AUTHORING.md) — how to author an algorithm set

## Development

```sh
deno task check   # type-check every package
deno task test    # run tests across the workspace
deno task fmt     # format
deno task lint    # lint
```

Rebuild the browser demo bundle after changing solver code:

```sh
deno bundle --platform browser --minify -o docs/apb-demo/apb.bundle.js docs/apb-demo/entry.ts
```

`docs/` is the GitHub Pages source for [cubing.moishy.dev](https://cubing.moishy.dev/apb-demo/) — it
holds only the demo page, its bundle, and a redirect from the site root.

## Releasing

Publishing is **manual today**; automation is planned.

Each package versions independently. Bump `version` in that package's `deno.json`, merge to `main`,
then from the package directory:

```sh
deno publish
```

An npm build exists via [`scripts/build_npm.ts`](./scripts/build_npm.ts) (dnt), but nothing has been
published to npm yet — the packages are JSR-only so far.

## License

[MIT](./LICENSE) © Moshe Rosenberg
