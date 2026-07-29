# @moishy/apb

A solver for the **APB** method (Athefre's Pair & Block), built on
[`@moishy/cubing-core`](https://jsr.io/@moishy/cubing-core).

It produces the solution a human following APB would execute — every step labeled, ranked by how
ergonomic it is to turn, not by move count.

**[Try it in your browser →](https://cubing.moishy.dev/apb-demo/)**

```sh
deno add jsr:@moishy/apb    # Deno — https://jsr.io/@moishy/apb
npm  install @moishy/apb    # Node — https://www.npmjs.com/package/@moishy/apb
```

> **Beta.** The solver is verified end to end: every algset is audited against the lookup it is used
> with, and 540 solves across every replacement and extra all completed. What is not yet frozen is
> the public API — that happens at 1.0.

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

## The Method

APB solves a 2x2x3 block, adds a pair, orients edges, finishes the last slot, then does the last
layer in one algorithm:

| Step               | id         | How It's Solved                                                                                     |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| 2x2x3              | `block223` | Search (six strategies available; one enabled by default)                                           |
| BR Pair            | `brPair`   | 89-case algset                                                                                      |
| Edge Orientation   | `eo`       | 11-case algset                                                                                      |
| Last Extended Slot | `lxs`      | 116-case algset                                                                                     |
| Last Layer         | `zbll`     | 493 cases in one alg — 472 ZBLL, falling through to the 21 PLLs when the corners are already solved |

Optional **replacements** cover several steps at once — `eoPair` (BR pair + EO together), `eodrLs`,
`collEpll`, `ocllPll`, `backSlotEoLxs` — and optional **extras** insert at a boundary or mid-alg
(`oll`, `zbls`, `winterSummerVariation`). All are off by default; in `compete` mode a replacement is
only used when it actually beats the normal route, so enabling one cannot make a solve worse.

## 2x2x3 Strategies

`block223` is where the interesting search happens. Six strategies are registered; only `fbDfdb` is
enabled by default. Mean block length in STM and mean wall-clock per solve, measured over 25
scrambles with dual color neutrality:

| Strategy                                                    | Time   | STM     |
| ----------------------------------------------------------- | ------ | ------- |
| `fbDfdb` — Roux first block, then a 527-case DF/DB alg      | 0.02s  | 9.8     |
| `direct` — one search for the whole 2x2x3                   | 1.43s  | **7.4** |
| `cornerFirstFront` / `cornerFirstBack` — 2x2x2, then extend | ~0.15s | 9.7     |
| `cross1Front` / `cross1Back` — bottom line, then two pairs  | ~0.25s | 12.7    |

`direct` finds the shortest blocks and beats the rest on every scramble tested, but costs ~70× more
than the default. Enable it when block quality matters more than latency:

```ts
await apb.solve(scramble, {
  stepOptions: { block223: { enabledStrategies: ["fbDfdb", "direct"] } },
});
```

Worth knowing before you do: **widening color neutrality is a cheaper way to get short blocks than
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
[Solver Settings](https://github.com/moishy-r/moishy-cubing/blob/main/guides/solver-settings.md).

## Also Exported

`apbDefinition` — the raw `MethodDefinition`, so a UI can generate its options form from the method
itself and stay in sync (this is what the demo page does). Plus the piece groups APB's steps target
(`BLOCK223`, `AFTER_BR`, `F2L`, `BR_PAIR`, `LAST_SLOT`, `EO_EDGE_SLOTS`) and the `PieceRegion` type,
for reading a result.

The method-wiring helpers in `src/geometry.ts` (goal predicates, recognition signatures, lookup
builders) are deliberately **not** exported: they are internals, and some are specific to APB's
algsets. To build your own method, read that file as a template — see
[Adding a Method](https://github.com/moishy-r/moishy-cubing/blob/main/guides/adding-a-method.md).

## Documentation

- [Getting Started](https://github.com/moishy-r/moishy-cubing/blob/main/guides/getting-started.md)
- [Solver Settings](https://github.com/moishy-r/moishy-cubing/blob/main/guides/solver-settings.md)
- [SPEC.md](https://github.com/moishy-r/moishy-cubing/blob/main/packages/apb/SPEC.md) — the method
  spec, step by step
- [Adding a Method](https://github.com/moishy-r/moishy-cubing/blob/main/guides/adding-a-method.md) —
  this package is the reference implementation

## License

MIT © Moshe Rosenberg
