# @moishy/algsets

Algorithm case data for [moishy-cubing](https://github.com/moishy-r/moishy-cubing), authored as
typed TypeScript modules.

The distinguishing idea: **a case stores only its algorithms.** Recognition is _derived_ by applying
the primary alg to a solved cube and inverting — never hand-written, so it cannot drift out of sync
with the algs, and authoring a set means transcribing algs and nothing else.

```sh
deno add jsr:@moishy/algsets   # Deno
npx jsr add @moishy/algsets    # Node
```

## Use

Every set is its own subpath export, so you only pull in the data you need:

```ts
import { pll } from "@moishy/algsets/pll";

pll.cases.length; // 21
const c = pll.byId("t-perm");
c?.algs[0].moves; // primary alg, parsed
c?.algs.length; // interchangeable alternatives

// AlgSet implements CaseLookup, so it drops straight into an AlgorithmicPhase
pll.find(someCubeState); // the matching case, or null
```

Each case carries **one or more interchangeable algs**, primary first. That matters: the solver
tries every variant and keeps whichever leaves the cheapest continuation, which is what makes
lookahead worth having.

## Sets

| Import                          | Cases | Set                                           |
| ------------------------------- | ----- | --------------------------------------------- |
| `@moishy/algsets/zbll`          | 472   | ZBLL                                          |
| `@moishy/algsets/dfdb`          | 527   | DF/DB pair (APB block223)                     |
| `@moishy/algsets/zbls`          | 302   | ZBLS                                          |
| `@moishy/algsets/eo-pair`       | 148   | EO Pair                                       |
| `@moishy/algsets/lxs`           | 116   | Last X-Slot                                   |
| `@moishy/algsets/lxs-back-slot` | 116   | LXS (back slot)                               |
| `@moishy/algsets/br-pair`       | 89    | BR Pair                                       |
| `@moishy/algsets/fr-pair`       | 89    | FR Pair                                       |
| `@moishy/algsets/oll`           | 57    | OLL                                           |
| `@moishy/algsets/eodr`          | 55    | EODR                                          |
| `@moishy/algsets/coll-epll`     | 40    | COLL + EPLL                                   |
| `@moishy/algsets/sv`            | 27    | Summer Variation                              |
| `@moishy/algsets/wv`            | 27    | Winter Variation                              |
| `@moishy/algsets/pll`           | 21    | PLL                                           |
| `@moishy/algsets/ocll-pll`      | **0** | OCLL + PLL — _empty placeholder, no data yet_ |

Known gaps, so you aren't surprised by them:

- **`ocll-pll` is empty.** The set is defined but carries no cases; it is not usable. (APB's
  `ocllPll` replacement doesn't depend on it — it derives OCLL from the OLL set.)
- **`zbls`**: 32 of its 302 cases don't currently solve up to rotation + AUF — transcription gaps
  being worked through.

## Authoring a set

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

## License

MIT © Moshe Rosenberg. Algorithms themselves are community knowledge; where a source is known it is
recorded on the individual alg variant.
