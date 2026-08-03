# @moishy/algsets

Algorithm case data for [moishy-cubing](https://github.com/moishy-r/moishy-cubing), authored as
typed TypeScript modules.

The distinguishing idea: **a case stores only its algorithms.** Recognition is _derived_ by applying
the primary alg to a solved cube and inverting — never hand-written, so it cannot drift out of sync
with the algs, and authoring a set means transcribing algs and nothing else.

```sh
deno add jsr:@moishy/algsets    # Deno — https://jsr.io/@moishy/algsets
npm  install @moishy/algsets    # Node — https://www.npmjs.com/package/@moishy/algsets
```

## Use

Every set is its own subpath export, so you only pull in the data you need:

```ts
import { pll } from "@moishy/algsets/pll";

pll.cases.length; // 21
const c = pll.get("t-perm");
c?.algs[0].moves; // primary alg, parsed
c?.algs.length; // interchangeable alternatives

// AlgSet implements CaseLookup, so it drops straight into an AlgorithmicPhase
pll.find(someCubeState); // the matching case, or null
```

Each case carries **one or more interchangeable algs**, primary first. That matters: the solver
tries every variant and keeps whichever leaves the cheapest continuation, which is what makes
lookahead worth having.

## Sets

| Import                          | Cases | Set                       |
| ------------------------------- | ----- | ------------------------- |
| `@moishy/algsets/zbll`          | 472   | ZBLL                      |
| `@moishy/algsets/f2l`           | 41x4  | F2L, all four slots       |
| `@moishy/algsets/advanced-f2l`  | 136   | Advanced F2L (all slots)  |
| `@moishy/algsets/dfdb`          | 527   | DF/DB pair (APB block223) |
| `@moishy/algsets/zbls`          | 301   | ZBLS                      |
| `@moishy/algsets/eo-pair`       | 148   | EO Pair                   |
| `@moishy/algsets/lxs`           | 116   | Last Extended Slot        |
| `@moishy/algsets/lxs-back-slot` | 116   | Last Extended Slot (back) |
| `@moishy/algsets/br-pair`       | 89    | BR Pair                   |
| `@moishy/algsets/fr-pair`       | 89    | FR Pair                   |
| `@moishy/algsets/oll`           | 57    | OLL                       |
| `@moishy/algsets/eodr`          | 55    | EODR                      |
| `@moishy/algsets/coll-epll`     | 40    | COLL + EPLL               |
| `@moishy/algsets/sv`            | 27    | Summer Variation          |
| `@moishy/algsets/wv`            | 27    | Winter Variation          |
| `@moishy/algsets/pll`           | 21    | PLL                       |

Notes:

- **`f2l`** and **`advanced-f2l`** each export **four** `AlgSet`s, not one — `f2lFr` / `f2lFl` /
  `f2lBl` / `f2lBr`, plus an `f2lBySlot` record — because recognition is derived per case and the
  same case in a different slot is a different cube state. SpeedCubeDB publishes genuinely
  slot-specific algs (not mirrors), so all four are kept.
- **Alg order is load-bearing in both sets.** Each slot's primary is rotation-free and derives a
  fixed-frame state for _that_ slot; later variants may contain `y` rotations, which CFOP uses
  freely. A rotated primary would derive a state for a _different_ slot and silently mis-recognize —
  the defect that broke 32 `zbls` cases.
- **`advanced-f2l` does not follow the source's case numbering.** SpeedCubeDB groups Advanced cases
  by case _shape_, and the algs under one heading solve different states (the piece is trapped in
  different slots), so they are not interchangeable variants. Cases here are one-per-state: 54
  headings become 42/35/28/31 states for fr/fl/bl/br. Case counts therefore differ per slot.
- A method consuming these must recognize on the pair's location+orientation **plus whichever cubies
  occupy the target slot**. On the pair alone, an advanced case whose pair sits in an ordinary
  position (blocked slot) collides with the plain case for that position, whose alg cannot solve it
  — 5-6 collisions per slot, and 0 once the occupant is in the key.
- There is no `ocll-pll` set. OCLL + PLL needs no data of its own: OCLL is the seven `oll` cases
  21-27 and PLL is the `pll` set, which is how APB's `ocllPll` replacement builds it. An empty
  placeholder export existed until 0.2.0 and was removed.
- **`zbls`** cases are authored for the **front-right** slot. 32 of them were originally expressed
  against the BR or FL slot and have been conjugated onto FR; a consumer recognizing on a different
  slot must rotate accordingly. The set is 301 rather than the nominal 302 because two entries were
  the same case (differing only in last-layer corner state, which ZBLS does not touch); they are
  merged, both algs kept as variants.

## Authoring a Set

```ts
import { type AlgSet, defineAlgSet } from "@moishy/algsets";

export const mySet: AlgSet = defineAlgSet({
  id: "my-set",
  name: "My Set",
  cases: [
    { id: "sune", name: "Sune", algs: ["R U R' U R U2 R'", "L' U2 L U L' U L"] },
    { id: "case-2", algs: ["F R U R' U' F'"] },
  ],
});
```

That is the entire contract — ids and algs. No recognition state, no AUF, no cost: all three are
computed. `defineAlgSet` enforces unique ids, parses every alg, and derives each case's recognition
state.

Then validate. The harness re-derives each case and checks its algs actually solve it, and that no
two cases collide under the recognition signature:

```ts
import { assertValidAlgSet } from "@moishy/algsets";

Deno.test("my set is valid", () => assertValidAlgSet(mySet));
```

Signature collisions are the failure mode that matters — two cases projecting to the same key means
one of them will be silently mis-recognized at solve time. The harness catches it; don't skip it.

Full brief, including per-set conventions and sourcing notes:
[AUTHORING.md](https://github.com/moishy-r/moishy-cubing/blob/main/packages/algsets/AUTHORING.md).

## Changelog

[CHANGELOG.md](https://github.com/moishy-r/moishy-cubing/blob/main/CHANGELOG.md) — release history
for all four packages.

## License

MIT © Moshe Rosenberg. Algorithms themselves are community knowledge; where a source is known it is
recorded on the individual alg variant.
