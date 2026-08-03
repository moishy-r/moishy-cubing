# Working in This Repo

Conventions and traps that aren't obvious from the code. For what the project _is_, see
[README.md](./README.md); for why it's built this way, [DESIGN.md](./DESIGN.md).

## Packages and What Belongs Where

Dependency order is **`cubing-core` → `algsets` → `steps` → `apb`**; nothing may point back up.

- **`@moishy/cubing-core`** — cube state, notation, MCC cost models, the search engines, the
  Step/Strategy/Phase runner, plus the generic geometry every method needs: piece regions, goal
  predicates, recognition-signature primitives, and the pruning tables. Knows nothing about any
  method.
- **`@moishy/algsets`** — algorithm case data plus `defineAlgSet`/validation, and the `AlgSet` →
  `CaseLookup` adapters. It owns the `AlgSet` type, which is why those adapters cannot live in
  cubing-core (that would cycle).
- **`@moishy/steps`** — reusable _steps_: `blockSearch` and the standard block targets (Roux FB,
  2x2x2, 2x2x3, cross), the block cost model, the six 2x2x3 strategies, and the four F2L pair steps.
  What algsets is for data, this is for the solving side. Note `CROSS` is the four D-layer edges;
  APB's 2x2x3 uses the three-edge `CROSS3`. Depends on algsets for exactly one thing: `rouxFbDfdb`'s
  second phase places DF/DB by alg, so it takes an `AlgSet`.
- **`@moishy/apb`** — the APB method. Pure configuration on top of the other three.

Before writing a search in a method package, check whether `steps` already has it — a first block, a
2x2x2, a cross are the same search whoever is calling them. A method package should be _wiring_:
which algset backs each step, what its recognition keys on, how the steps sequence.

`apb`'s public surface is deliberately small. `src/geometry.ts` keeps only what is genuinely APB's —
its piece groups, and the two-line compositions of the shared signature primitives that its own
Steps recognize on (`zblsSignature`, `eodrSignature`, `wvSvSignature`). Everything generic that used
to sit there moved out; see the CHANGELOG entry for the extraction.

## The Demo, and Testing Every Setting

`docs/apb-demo/index.html` generates its whole options form from `apbDefinition` at runtime, so a
Step/Strategy/Replacement/Extra **`label` in `apb.ts` is what the site displays** — fix labels
there, not in the HTML. The solve runs in `solver.worker.js`; `moveCostModel` cannot cross the
worker boundary (structured clone drops its `cost` method), so the page sends a description and the
worker rebuilds it.

Two things that look like bugs when sweeping the settings space and are not:

- **Two enabled `force`-mode Replacements with overlapping regions throw `SettingsError`** — by
  design. `ocllPll` and `collEpll` both cover `[zbll]`, so enabling both in force mode is a hard
  conflict. Sweep them one at a time, or use `compete`.
- **The `oll` extra fires on ~0 random scrambles.** Its boundary trigger wants F2L already solved,
  which in APB only happens for last-layer-only inputs. There is a test covering that case.

## Before You Finish

```sh
deno task ok        # check · lint · fmt --check · test  — must be green
```

CI runs exactly this, plus a `deno publish` dry run and an npm build/install smoke test.

You do **not** need to rebuild the demo bundle. `docs/apb-demo/apb.bundle.js` is gitignored and
compiled at deploy time by `.github/workflows/pages.yml`, so cubing.moishy.dev always runs the
solver that is on `main`. It used to be committed, and a change once shipped without a rebuild — the
live site ran an old solver until someone noticed.

To preview the page locally, build it once and serve `docs/`:

```sh
deno task bundle
```

## Releasing: Bump Three Things, Not One

A version lives in **three** places per package. Changing only the manifest ships a broken release.

1. `packages/<pkg>/deno.json` → `version`
2. `packages/<pkg>/mod.ts` → the exported `VERSION` constant
3. **Every dependent's dependency range**, in their `deno.json` `imports`

Point 3 is the trap. On a `0.x` line, **`^0.1.0` means `>=0.1.0 <0.2.0`** — so `0.1.0 → 0.1.1` is
fine and needs no dependent changes, but `0.1.x → 0.2.0` strands every dependent on a version that
no longer exists. `^0.0.1` is narrower still: it admits only `0.0.1` exactly.

Dependency order is `cubing-core → algsets → steps → apb`; both registries reject a package whose
dependencies don't resolve. The Release workflow's `all` publishes in exactly that order.

`deno task ok` fails if any of the three drift apart — see
`packages/cubing-core/src/version_test.ts`. Trust that test over your memory.

Then merge to `main` and either push a tag `<pkg>-v<version>` or run the **Release** workflow from
the Actions tab (choose a package, or `all`). **Don't publish by hand** — JSR and npm both
authenticate the workflow over OIDC, there are no tokens, and a manual publish burns the version
number for the automated path. Neither registry lets you republish a version, so a re-run after a
partial failure needs a fresh bump; npm is a separate job gated on JSR for exactly that reason.

Both registries attach Sigstore provenance automatically — no flag. Don't be misled by JSR's API
reporting `rekorLogId: null` and `hasProvenance: false`: the attestation is real and in the public
transparency log (the publish step prints its `search.sigstore.dev` link, and the Rekor entry
resolves), JSR just isn't surfacing it. Nothing to fix on our side; the score is 100 regardless.

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
once (see `regionHeuristicMulti` in `packages/cubing-core/src/pruning.ts`).

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
