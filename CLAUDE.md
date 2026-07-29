# Working in This Repo

Conventions and traps that aren't obvious from the code. For what the project _is_, see
[README.md](./README.md); for why it's built this way, [DESIGN.md](./DESIGN.md).

## Before You Finish

```sh
deno task ok        # check · lint · fmt --check · test  — must be green
```

CI runs exactly this, plus a `deno publish` dry run and an npm build/install smoke test.

If you changed anything under `packages/`, also rebuild the browser demo bundle, or
cubing.moishy.dev silently keeps serving the old solver:

```sh
deno task bundle    # then commit docs/apb-demo/apb.bundle.js
```

Nothing enforces that — a commit once shipped solver changes without it and the live site was a
version behind until someone noticed.

## Releasing: Bump Three Things, Not One

A version lives in **three** places per package. Changing only the manifest ships a broken release.

1. `packages/<pkg>/deno.json` → `version`
2. `packages/<pkg>/mod.ts` → the exported `VERSION` constant
3. **Every dependent's dependency range**, in their `deno.json` `imports`

Point 3 is the trap. On a `0.x` line, **`^0.1.0` means `>=0.1.0 <0.2.0`** — so `0.1.0 → 0.1.1` is
fine and needs no dependent changes, but `0.1.x → 0.2.0` strands every dependent on a version that
no longer exists. `^0.0.1` is narrower still: it admits only `0.0.1` exactly.

Dependency order is `cubing-core → algsets → apb`; both registries reject a package whose
dependencies don't resolve.

`deno task ok` fails if any of the three drift apart — see
`packages/cubing-core/src/version_test.ts`. Trust that test over your memory.

Then merge to `main` and either push a tag `<pkg>-v<version>` or run the **Release** workflow from
the Actions tab (choose a package, or `all`). **Don't publish by hand** — JSR and npm both
authenticate the workflow over OIDC, there are no tokens, and a manual publish burns the version
number for the automated path. Neither registry lets you republish a version, so a re-run after a
partial failure needs a fresh bump; npm is a separate job gated on JSR for exactly that reason.

## Wall-Clock Budgets Make Tests Machine-Dependent

`SearchPhase.timeBudgetMs` lets an expensive phase drop out of its step's race instead of hanging a
solve. The cost is that _which strategies answer_ now depends on machine speed — a budget tuned on a
fast laptop dropped APB's `direct` on a slower CI runner and failed a release.

Any test that asserts a specific strategy ran must lift the budget with
`stepOptions.<step>.searchTimeBudgetMs.<phaseId>`, so a failure means "the strategy is broken", not
"the runner was busy".

## Search Heuristics Must Never Overestimate

Every `SearchPhase.heuristic` is an admissible lower bound on remaining cost. Undershoot and the
search just does more work; **overshoot and it silently returns non-optimal solutions** — no error,
no test failure unless you compare against a known optimum.

Maxing several admissible bounds stays admissible. Summing them does **not**: it was measured here
and is wrong for cube regions, because one slice/wide move can advance two disjoint piece groups at
once (see `regionHeuristicMulti` in `packages/apb/src/pruning.ts`).

A heuristic must be built for the same cost model as the phase that uses it, or admissibility is
lost.

## Algset Data: Only Algs

A case stores `id` + `algs` and nothing else. Recognition is _derived_ by inverting the primary alg;
cost and AUF are computed. Never hand-write recognition state, AUF or cost — see
[AUTHORING.md](./packages/algsets/AUTHORING.md).

Two things to check whenever you touch a set:

- **Signature collisions.** Two cases projecting to the same recognition key means one is silently
  mis-recognized and solved with the wrong alg. `assertValidAlgSet` catches collisions within a set;
  a coarser _phase_ signature can still collide across the AUF/rotation coset, which is how 27 zbls
  cases were quietly broken.
- **Slot convention.** APB recognizes last-slot sets on the **FR** slot (DFR corner 4, FR edge 8).
  Algs transcribed for another slot look fine in isolation — they solve their own case — but their
  derived recognition state has the wrong slot open. That was the actual zbls bug, long mis-recorded
  as bad transcription.

## Verify Claims Against the Code

Comments here are unusually load-bearing and several have been wrong. Measure before you write a
number down, and prefer a test over a comment. When a doc and the behavior disagree, fix the doc in
the same change.

Throwaway experiment scripts go in `packages/apb/_*.ts` and are deleted before committing.
