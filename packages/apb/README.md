# @moishy/apb

A solver for the **APB** method (Advanced Petrus Blocks), built on
[`@moishy/cubing-core`](https://jsr.io/@moishy/cubing-core).

It produces the solution a human following APB would execute — every step labelled, ranked by how
ergonomic it is to turn, not by move count.

**[Try it in your browser →](https://cubing.moishy.dev/apb-demo/)**

```sh
deno add jsr:@moishy/apb   # Deno
npx jsr add @moishy/apb    # Node
```

> **Beta.** Solves are correct end to end and verified in tests, but some algorithm sets are still
> being authored and Winter/Summer Variation is not yet wired up.

## Use

```ts
import { apb } from "@moishy/apb";

const res = await apb.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");

res.solved; // true
res.solutionString; // "r2 U R2 U F B2 M' D' U r U2 R' U f R' f' ..."
res.solution.length; // 44
res.cost; // 46.45 — ergonomic cost, not move count

for (const seg of res.segments) {
  console.log(seg.unitId, seg.strategyId, seg.moves.length);
}
```

Nothing beyond the scramble is required; the method ships its own recommended settings.

## The method

APB solves a 2x2x3 block, adds a pair, orients edges, finishes the last slot, then does the last
layer in one algorithm:

| Step        | id         | How it's solved                                           |
| ----------- | ---------- | --------------------------------------------------------- |
| 2x2x3 block | `block223` | Search (six strategies available; one enabled by default) |
| BR pair     | `brPair`   | 89-case algset                                            |
| EO          | `eo`       | 11-case algset                                            |
| Last slot   | `lxs`      | 116-case algset                                           |
| Last layer  | `zbll`     | 472-case ZBLL, one alg                                    |

Optional **replacements** cover several steps at once — `eoPair` (BR pair + EO together), `eodrLs`,
`collEpll`, `ocllPll`, `backSlotEoLxs` — and optional **extras** insert at a boundary or mid-alg
(`oll`, `zbls`, `winterSummerVariation`). All are off by default; in `compete` mode a replacement is
only used when it actually beats the normal route, so enabling one cannot make a solve worse.

## First-block strategies

`block223` is where the interesting search happens. Six strategies are registered; only `fbDfdb` is
on by default. Measured over 25 scrambles with dual colour neutrality:

| Strategy                                                    | Default | Time/solve | Mean block    |
| ----------------------------------------------------------- | ------- | ---------- | ------------- |
| `fbDfdb` — Roux first block, then a 527-case DF/DB alg      | **on**  | 0.02s      | 9.8 moves     |
| `direct` — one search for the whole 2x2x3                   | off     | 1.43s      | **7.4 moves** |
| `cornerFirstFront` / `cornerFirstBack` — 2x2x2, then extend | off     | ~0.15s     | 9.7           |
| `cross1Front` / `cross1Back` — bottom line, then two pairs  | off     | ~0.25s     | 12.7          |

`direct` finds the shortest blocks and beats the rest on every scramble tested, but costs ~70× more
than the default. Enable it when block quality matters more than latency:

```ts
await apb.solve(scramble, {
  stepOptions: { block223: { enabledStrategies: ["fbDfdb", "direct"] } },
});
```

Worth knowing before you do: **widening colour neutrality is a cheaper way to get short blocks than
changing strategy.** `fbDfdb` at full CN averages 8.9-move blocks in 0.06s, where `direct` at dual
CN averages 7.3 in 1.45s.

```ts
await apb.solve(scramble, { colorNeutrality: "full" });
```

## Settings

Common ones:

```ts
await apb.solve(scramble, {
  colorNeutrality: "fixed", // "fixed" | "full" | Move[][]; default: dual-CN (8)
  moveCostModel: createDefaultMoveCostModel({ mode: "OH" }),
  lookahead: { depth: 1 }, // choose each step by what it leaves the next
  stepOptions: { block223: { forceStrategy: "fbDfdb" } },
  replacements: { eoPair: { enabled: true } },
}, {
  timeBudgetMs: 10_000,
});
```

Full reference:
[Solver settings](https://github.com/moishy-r/moishy-cubing/blob/main/guides/solver-settings.md).

## Also exported

`apbDefinition` — the raw `MethodDefinition`, so a UI can generate its options form from the method
itself and stay in sync (this is what the demo page does). Plus the geometry helpers (`BLOCK223`,
`regionSolved`, `regionCoordinate`, …) used to define the steps.

## Documentation

- [Getting started](https://github.com/moishy-r/moishy-cubing/blob/main/guides/getting-started.md)
- [Solver settings](https://github.com/moishy-r/moishy-cubing/blob/main/guides/solver-settings.md)
- [SPEC.md](https://github.com/moishy-r/moishy-cubing/blob/main/packages/apb/SPEC.md) — the method
  spec, step by step
- [Adding a method](https://github.com/moishy-r/moishy-cubing/blob/main/guides/adding-a-method.md) —
  this package is the reference implementation

## License

MIT © Moshe Rosenberg
