# @moishy/cfop

A solver for the **CFOP** method — cross, F2L, OLL, PLL — producing human-executable solutions
ranked by turning ergonomics.

```sh
deno add jsr:@moishy/cfop    # Deno
npm  install @moishy/cfop    # Node
```

```ts
import { cfop } from "@moishy/cfop";

const res = await cfop.solve("R U2 F' L D B2 R' U F2 D' L2 B R2 U' F D2 B' L U2 R'");
res.solutionString;
for (const seg of res.segments) console.log(seg.unitId, seg.strategyId, seg.cost);
```

## What it does

Seven core steps: `cross`, `f2l1`–`f2l4`, `oll`, `pll`. The package is configuration only — every
step is assembled in [`@moishy/steps`](../steps), because none of them is CFOP's alone.

**The four F2L steps are interchangeable.** No step names a slot. The goal of step _N_ is "the cross
is intact and at least _N_ slots are solved", and its lookup offers all four slots' cases at once,
so `runPhase`'s existing "try every alg, keep the cheapest that reaches the goal" is the pair race.
Which pair each step takes is decided by cost, per scramble.

Two consequences worth knowing:

- **An already-solved slot costs nothing.** That is what will let an X-cross replace only the
  `cross` step — an X-cross is a normal F2L with one pair pre-solved, not a separate process.
- **The last slot is an ordinary Step**, so a last-slot variant is a Replacement over `[f2l4, f2l4]`
  and Winter/Summer Variation a checkpoint Extra over `[f2l4, oll]`.

**Rotations are used.** CFOP's F2L data contains them and they are executed as written; the frame an
alg leaves is the state the next step continues from. Slots are tracked by cubie so a rotation never
changes which pair a step means, and `slotAt` maps back to the physical position for display.

## Not here yet

- **X-cross**, as a `compete` Replacement over `[cross, cross]`.
- **Last-slot variants** (ZBLS, OLS) and **Winter/Summer Variation**. The data is authored for the
  FR slot, while CFOP's last slot is whichever one the first three steps did not take.
- **Two-look OLL.** APB's `ocllPll` and `collEpll` are _not_ reusable: OCLL and COLL both assume the
  last-layer edges are already oriented, which APB guarantees with a core EO step and CFOP does not.
  A real two-look OLL is edge orientation then OCLL, which needs the edge-orienting cases as their
  own set.

Pre-1.0: solves are verified end to end across 20 scrambles, but the API is not frozen.
