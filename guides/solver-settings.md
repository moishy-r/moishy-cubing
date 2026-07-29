# Solver Settings

Everything you can change about how a solve is produced. `solve()` takes two objects:

```ts
apb.solve(scramble, settings, options);
//                  ^^^^^^^^  ^^^^^^^ SolveOptions
//                  SolverSettings
```

`SolverSettings` shapes **what solution you get**; `SolveOptions` bounds **how much work is spent
finding it**. Both are optional, and every method ships recommended defaults for the first.

```ts
const res = await apb.solve(scramble, {
  moveCostModel, // how solutions are ranked
  colorNeutrality, // which starting orientations to race
  stepOptions, // per-step strategy selection + phase chaining
  lookahead, // peek at the next step when choosing this one
  replacements, // opt-in alternative routes spanning several steps
  extras, // opt-in insertions at a step boundary or mid-alg
  maxDepth, // default search-depth bound
}, {
  timeBudgetMs,
  signal,
  maxDepth,
});
```

---

## Move Cost Model

The objective function. Defaults to the built-in two-handed MCC model.

```ts
import { createDefaultMoveCostModel } from "@moishy/cubing-core";

// One-handed, left hand
await apb.solve(scramble, {
  moveCostModel: createDefaultMoveCostModel({ mode: "OH", handedness: "left" }),
});
```

`mode` is `"2H"` (default) or `"OH"`. The model prices each move by base difficulty plus transition
penalties (regrips, awkward same-axis sequences). Any object with a `cost(move, context)` method
works, so you can supply your own.

Note that some steps deliberately override this: APB's block-building phases rank by _move count_
(matching how blockbuilders think) while the last layer keeps ergonomic MCC. That's a property of
the method, not something you set here.

## Color Neutrality

Which starting orientations to race. The winner is chosen on the **first step only** and then
committed, so the cost is one extra first-step search per orientation, not a full extra solve.

```ts
await apb.solve(scramble, { colorNeutrality: "fixed" }); //  1 — the orientation given
await apb.solve(scramble, { colorNeutrality: "full" }); // 24 — every orientation
await apb.solve(scramble, { colorNeutrality: [[], parseAlg("y"), parseAlg("z2")] }); // custom
```

APB recommends **dual-CN** by default: 8 orientations — either of the two opposite colors of one
axis on the bottom, times the four choices of front face.

Widening this is usually the cheapest way to get a better first block. Measured on APB, mean 2x2x3
length: 11.2 moves fixed → 9.8 dual → 8.9 full, for `fbDfdb` — a bigger gain than switching to a
more expensive strategy. The chosen rotation comes back as `res.orientation` and is free (it models
inspection, not turning).

## Step Options

Keyed by step id. For APB: `block223`, `brPair`, `eo`, `lxs`, `zbll`.

```ts
await apb.solve(scramble, {
  stepOptions: {
    block223: {
      enabledStrategies: ["fbDfdb", "direct"], // race exactly these
      forceStrategy: "fbDfdb", // or pin one, skipping the race entirely
      phaseChaining: { enabled: true, slack: 2 },
      searchMaxDepth: { rouxFB: 12 }, // per-phase depth cap override
    },
  },
});
```

**`enabledStrategies`** overrides which of a step's registered strategies compete. Some ship
disabled by default because they're slow or rarely win — APB's `block223` registers six and enables
only `fbDfdb`:

| Strategy                               | Note                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `fbDfdb`                               | Roux first block search + a 527-case DF/DB algorithm — the only one on by default |
| `direct`                               | one search for the whole 2x2x3; shortest blocks, ~70× the time                    |
| `cornerFirstFront` / `cornerFirstBack` | 2x2x2 first, then extend                                                          |
| `cross1Front` / `cross1Back`           | bottom line first, then two pairs                                                 |

**`forceStrategy`** pins one, skipping racing entirely — useful for demos and for comparing
strategies head to head.

**`phaseChaining`** applies to multi-phase strategies. Instead of committing the cheapest output of
phase 1 and then solving phase 2, it keeps a pool of phase-1 candidates within `slack` of optimum
and picks the pair with the best _combined_ cost. `slack` defaults to 2.

**`searchMaxDepth`** overrides a specific search phase's built-in depth cap, keyed by phase id.
Raise it to let a hard scramble through; lower it to bound an experiment.

**`searchTimeBudgetMs`** overrides a search phase's wall-clock budget, same keying. A phase that
runs out of budget drops out of its step's race rather than failing the solve — which means the
outcome depends on how fast your machine is. Raise it when you need a slow strategy to answer
_deterministically_ rather than merely quickly:

```ts
await apb.solve(scramble, {
  stepOptions: {
    block223: { forceStrategy: "direct", searchTimeBudgetMs: { full: 120_000 } },
  },
});
```

## Lookahead

Choose this step's solution by what it leaves for the _next_ step, not just its own cost.

```ts
await apb.solve(scramble, { lookahead: { depth: 0 } }); // off
await apb.solve(scramble, { lookahead: { depth: 1 } }); // peek one step ahead, every pair
await apb.solve(scramble, {
  lookahead: {
    depth: 1,
    scope: [["block223", "brPair"], ["lxs", "zbll"]], // only these pairs
  },
});
```

This is what makes multiple algs per case pay off: when a case has several interchangeable
solutions, the runner tries each and keeps the one whose _successor_ is cheapest. APB recommends
`depth: 1` scoped to its adjacent step pairs.

Lookahead costs real time — it solves the next step once per candidate — so scope it rather than
enabling it everywhere if solves feel slow.

## Replacements

An alternative route through a _range_ of steps, replacing the normal per-step solving. All are
opt-in.

```ts
await apb.solve(scramble, { replacements: { eoPair: { enabled: true, mode: "compete" } } });
```

- **`compete`** (default): solve the region both ways and keep whichever is cheaper. Cannot make a
  solve worse.
- **`force`**: always take the replacement, even when it loses.

APB registers `ocllPll`, `collEpll`, `eoPair`, `eodrLs`, and `backSlotEoLxs`.

## Extras

An optional insertion at a step boundary or mid-algorithm, fired only when its trigger matches —
e.g. Winter Variation, applied part-way through the last slot when the case allows.

```ts
await apb.solve(scramble, { extras: { winterSummerVariation: { enabled: true } } });
```

Same `enabled` / `mode` shape as replacements. APB registers `oll`, `zbls`, and
`winterSummerVariation`.

## Bounding the Work (`SolveOptions`)

```ts
await apb.solve(scramble, settings, {
  timeBudgetMs: 10_000,
  signal: abortController.signal,
  maxDepth: 20,
});
```

- **`timeBudgetMs`** — wall-clock budget for the whole solve. On exhaustion the solver returns
  `solved: false` with the segments it had committed, rather than throwing.
- **`signal`** — an `AbortSignal` for cancellation from outside (a UI stop button, a worker).
- **`maxDepth`** — default search-depth bound in moves, for phases that don't set their own.

A phase may also declare its own `timeBudgetMs`; when that expires the _phase_ drops out of its
step's race and the other strategies still answer, rather than the solve failing. APB's `direct`
uses this so a pathological scramble costs one strategy, not the solve.

## Recommended Defaults

Omitting a setting takes the method's recommendation, not a library-wide default. APB recommends
dual-CN plus `depth: 1` lookahead across its adjacent step pairs. Passing `{}` gets you those;
passing an explicit value overrides just that one. Read them programmatically:

```ts
import { apbDefinition } from "@moishy/apb";
apbDefinition.recommendedSettings;
```
