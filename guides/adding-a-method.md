# Adding a Method

The engine has no idea what APB is. A method is pure configuration: you describe your steps, hand
the description to `Method`, and the runner does the racing, lookahead, color neutrality and scoring
for you.

`@moishy/apb` is the worked example — copying its shape is the recipe. This guide is the map.

Before writing a search, check whether [`@moishy/steps`](../packages/steps) already has it. A Roux
first block, a 2x2x2, a 2x2x3, a cross — those are the same searches whatever method calls them, and
they ship ready to compose. A method package is then mostly _wiring_: which algset backs each step,
what its recognition keys on, how the steps sequence.

## The Composition Model

Three nested concepts:

- **Step** — a named slot in the method's ordered pipeline (`cross`, `f2l`, `oll`, `pll`). Steps run
  in order; a step's id is also its settings key.
- **Strategy** — one _way_ to solve a step. A step can register several; the runner races them by
  cost and keeps the best. "Keyhole F2L" and "standard F2L" would be two strategies for one step.
- **Phase** — the atomic unit inside a strategy, and where the real work happens. Either a
  `SearchPhase` (goal predicate + move set + pruning heuristic, no algs) or an `AlgorithmicPhase`
  (recognize a case, apply its alg, handle AUF).

A strategy is just an ordered list of phases. APB's `fbDfdb` is
`[SearchPhase(Roux first block), AlgorithmicPhase(DF/DB pair)]` — search to build the block, then a
lookup to finish it.

```ts
import { Method, type MethodDefinition } from "@moishy/cubing-core";

const myMethod: MethodDefinition = {
  id: "cfop",
  label: "CFOP",
  steps: [crossStep, f2lStep, ollStep, pllStep],
  replacements: [],
  extras: [],
  recommendedSettings: { colorNeutrality: "fixed", lookahead: { depth: 1 } },
};

export const cfop = new Method(myMethod);
```

That's the whole integration surface. `Method` provides `.solve()`.

## Search Phases

A search phase configures the generic engine. You supply _what done looks like_ and _what moves are
allowed_; the engine finds the cheapest way there.

```ts
{
  kind: "search",
  id: "cross",
  goal: (state) => /* is the cross solved? */,
  moves: ["U", "D", "L", "R", "F", "B", "M", "E", "S", "r", "l", "u", "d", "f", "b"],
  heuristic: regionHeuristic([], [5, 6, 7, 4], moves, costModel),
  useAStar: true,
  maxDepth: 8,
}
```

The one thing you cannot skip is the **heuristic** — a pruning table. Without it, a search over the
15 move families explores millions of states for even a short block. The heuristic answers "given
where these pieces are, what's the minimum cost still to come?", and the search discards any branch
that can't beat what it already has.

The rule that keeps results correct: a heuristic must **never overestimate**. Undershoot and you
just search more; overshoot and the engine will confidently return something that isn't optimal.
`@moishy/cubing-core`'s `regionHeuristic` builds these tables automatically for a set of tracked
pieces, and `regionHeuristicMulti` maxes several overlapping ones when a region is too big to
tabulate whole. Use them before writing your own — and if you are building a block at all, reach for
`@moishy/steps`' `blockSearch`, which already wires the table to the goal, the move set, A\*, axis
canonicalization and the region key.

Three further knobs matter for speed, all optional and all in `SearchPhase`: `canFollow` (prune
redundant move orderings), `stateKey` (merge search states that differ only in pieces you don't
track), and `timeBudgetMs` (let an expensive phase drop out of its race instead of failing the
solve).

## Algorithmic Phases

For steps solved by known algorithms:

```ts
{
  kind: "algorithmic",
  id: "pll",
  goal: isSolved,
  cases: regionLookup(pllSet, someSignature),
  auf: ["U"],
}
```

You provide a `CaseLookup` — given a state, which case is it? — and the runner handles AUF alignment
before and after, tries **every** alg the case carries, and keeps the cheapest that actually reaches
the goal. Multiple algs per case is what lookahead exploits.

Case data comes from `@moishy/algsets`, where recognition is _derived from the algs_ rather than
hand-stored. See [AUTHORING.md](../packages/algsets/AUTHORING.md).

## Recognition and Goals

The fiddly part of a new method is not the pipeline — it's saying precisely which pieces a step
cares about. The vocabulary is `@moishy/cubing-core`'s, and APB's `geometry.ts` shows it applied:

- **Region** — the corner and edge slots a step must fill.
  `{ corners: [5, 6], edges: [5, 6, 7, 9, 10] }` is APB's 2x2x3.
- **Goal predicate** — `regionSolved(region)` checks a region up to whole-cube rotation (right for
  most steps); `regionSolvedStrict` additionally pins the centers, which a slice/wide-inclusive
  _search_ needs so its home-frame heuristic stays valid.
- **Recognition signature** — projects a state down to just the pieces a step reads, so a case
  matches regardless of the scrambled pieces around it.

Get the signature wrong and you get silent mis-recognition, so verify it: APB's tests assert every
case in a set produces a distinct signature, and that each recognized state is actually solved by
its alg.

## Replacements and Extras

Both are opt-in, both default to off, and neither is needed to ship a working method.

A **Replacement** covers a _range_ of steps with an alternative route — APB's `eoPair` solves BR
Pair and EO together instead of separately. In `compete` mode the runner solves the region both ways
and keeps the cheaper, so it can never make a solve worse.

An **Extra** is a conditional insertion at a step boundary or mid-algorithm, gated by a `trigger` —
Winter Variation fires part-way through the last slot only when the case allows.

## Checklist

1. Write the region definitions and goal predicates for your steps.
2. Author or reuse algsets for the algorithmic steps; verify recognition is collision-free.
3. Build pruning heuristics for the search steps.
4. Assemble steps → strategies → phases into a `MethodDefinition`.
5. Set `recommendedSettings` — color neutrality and lookahead scope.
6. Test end to end: apply the solution to the scramble and assert the cube is solved. Do it across
   many seeded scrambles, not one.

## Where to Look in the Code

| For                            | Read                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| A full method definition       | [`packages/apb/src/apb.ts`](../packages/apb/src/apb.ts)                         |
| Ready-made block searches      | [`packages/steps/src/blocks.ts`](../packages/steps/src/blocks.ts)               |
| Block strategies to compose    | [`packages/steps/src/block223.ts`](../packages/steps/src/block223.ts)           |
| Regions, goals, signatures     | [`packages/cubing-core/src/regions.ts`](../packages/cubing-core/src/regions.ts) |
| Pruning tables                 | [`packages/cubing-core/src/pruning.ts`](../packages/cubing-core/src/pruning.ts) |
| AlgSet -> CaseLookup adapters  | [`packages/algsets/src/lookup.ts`](../packages/algsets/src/lookup.ts)           |
| Method wiring for one method   | [`packages/apb/src/geometry.ts`](../packages/apb/src/geometry.ts)               |
| Phase types and the runner     | [`packages/cubing-core/src/step.ts`](../packages/cubing-core/src/step.ts)       |
| Racing, lookahead, CN          | [`packages/cubing-core/src/method.ts`](../packages/cubing-core/src/method.ts)   |
| The reasoning behind all of it | [DESIGN.md](../DESIGN.md)                                                       |
