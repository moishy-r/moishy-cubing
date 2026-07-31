# Changelog

All three packages version independently but are released together when a change spans them, so this
is one file. Each entry lists the versions it shipped as.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) — on a `0.x` line, a **minor** bump is the breaking one.

## Unreleased — `cubing-core@0.3.0` · `algsets@0.3.1` · `apb@0.2.3`

### Changed

- **`@moishy/cubing-core`: a `force`-mode unit that cannot solve its region now throws
  `SettingsError` instead of silently falling back to the core Steps.** The fallback defeated the
  point of `force` — the mode exists for the curriculum case (`ZBLL` -> `OCLL+PLL` for someone who
  does not know full ZBLL), so quietly solving the region with the very Step the caller excluded
  handed them a solution they cannot execute and reported success. It also hid all three data gaps
  below: every solve still verified, so nothing surfaced until the case tables were audited
  directly. Enabling the unit in `compete` mode is the way to say "use it only if it helps"; that
  path is unchanged and still falls back to the core Steps.

### Fixed

- **`@moishy/algsets`: 50 of the 57 `oll` cases had the wrong primary alg.** Recognition is derived
  from `algs[0]`, and in 50 cases that alg solved a _different_ orientation class than the case's
  own (unanimous) variants — so the 57 primaries covered only **39 of the 57** last-layer
  orientation classes. 66 of the 215 non-solved orientation states (~31%) matched no case at all.
  The variants were correct throughout (checked against published algs for OLL 21-27, 33, 45, 51 and
  57), so the fix is to drop the 50 bogus primaries; the correct alg was already present in every
  case. Coverage is now the full 57, one case per class.

  `assertValidAlgSet` could not catch this: each case still solved _its own_ derived state, and the
  set's default full-facelet signature separates cases that collide under the coarser
  orientation-only key APB recognizes OLL with. The same failure mode as the 27 `zbls` cases. Two
  tests now guard it — the primaries must be a bijection onto the 57 classes, and every variant must
  be on its case's class.

- **`@moishy/apb`: `ocllPll` could not solve one OCLL class, and `collEpll` could not solve a Z-perm
  last layer.** The first was the `oll` defect above (the 7-case OCLL filter inherited the missing
  class). The second is separate: every one of the Z perm's five algs is M-slice-based and its `U`
  turns leave the last-layer corners rotated by `U2`, so `z`'s derived recognition state is corners
  solved only _up to AUF_ — and the strict corners-solved filter dropped it, leaving EPLL with 3 of
  its 4 cases. Recognition is a two-sided U coset, so the filter now folds AUF.

- **`@moishy/apb`: `collEpll` could not solve a last layer whose corners were already oriented.**
  `coll-epll` is faithful to its source (SpeedCubeDB's COLL): its 40 cases are grouped by the seven
  OCLL _orientation_ shapes, so it has no case for corners that are oriented but permuted — those
  are corner PLLs. APB's `coll` phase goal is `cornersSolved`, so it has to handle them: 23 of the
  647 non-solved corner classes had no case, plus the 4-state "corners solved up to AUF" skip.
  `collLookup` now falls through to the corner-permuting PLLs and then to an empty-alg skip — the
  same "derive the half we don't author" move as `epll`, with no new algorithm data. All five
  replacements now fire on every solve of a 60-scramble sweep in both modes.

- **`@moishy/apb`: the `eoPair` replacement is labelled "EOPair"**, not "BR Pair + EO". The demo
  builds its options form from `apbDefinition`, so this is what the site shows.

### Added

- Three **coverage** tests in `@moishy/apb`, walking the state space rather than the stored cases,
  since iterating cases cannot find a class that no case owns — which is why these survived: every
  last-layer orientation state (OLL/OCLL), every last-layer corner state (COLL), and a ratchet
  asserting every algset variant solves its own case.

### Known

- **`zbll` and `pll` carry the `oll` defect in their _variants_** — 1572 of 1745 ZBLL and 47 of 89
  PLL alternative algs solve a different case than the one they are filed under, so `runPhase`
  silently skips them. Primaries are correct and ZBLL coverage is proven complete (7775/7775), so
  this costs no correctness — only the cost race, which has far fewer real options than the data
  suggests. The mis-pairing is systematic and repairable (`t-1`'s four variants all solve `l-26`;
  `t-2`'s all solve `l-28`; `pll` `aa`'s solve `ab`). The ratchet test pins the counts so they can
  only fall. The other twelve sets are clean.

---

## 2026-07-29 — `cubing-core@0.2.2` · `algsets@0.3.0` · `apb@0.2.2`

### Removed — breaking

- **`@moishy/algsets`: `zbls` is 301 cases, not 302.** `f2l-34-2` was the same case as `f2l-33-2` —
  they differ only in last-layer corner state, which ZBLS does not touch, so each one's alg solves
  the other's state and only the first-defined was ever reachable through the lookup. Merged,
  keeping both algs as variants of `f2l-33-2`. The id `f2l-34-2` no longer resolves, which is why
  this is a minor rather than a patch.

### Changed

- The demo bundle is built at deploy time rather than committed, so
  [cubing.moishy.dev](https://cubing.moishy.dev/apb-demo/) can no longer serve a solver older than
  `main`. `docs/apb-demo/apb.bundle.js` is gitignored.
- The demo drops its "beta" framing; what is left is the practical note (runs in your browser on a
  background thread, heavy settings are slow, you can cancel). The packages describe themselves as
  **pre-1.0** — the solver is verified, the API is what is not yet frozen.
- Added this changelog, linked from every README.

## 2026-07-29 — `cubing-core@0.2.1` · `algsets@0.2.2` · `apb@0.2.1`

### Fixed

- APB stands for **Athefre's Pair & Block**. The published module doc and README said "Advanced
  Petrus Blocks".
- Step names now match [apbmethod.net](https://apbmethod.net): 2x2x3, BR Pair, Edge Orientation,
  Last Extended Slot, Last Layer. `lxs` is "Last Extended Slot", not "Last X-Slot".
- The last layer is **493** cases — 472 ZBLL falling through to the 21 PLLs when the corners are
  already solved — not 472.
- US spelling throughout, and title case for every heading.

### Changed

- Node install instructions use `npm install @moishy/…` directly instead of the JSR shim, and link
  both registries.

## 2026-07-28 — `cubing-core@0.2.0` · `algsets@0.2.1` · `apb@0.2.0`

### Removed — breaking

- **`@moishy/apb` no longer re-exports `src/geometry.ts`.** It published 29 symbols where every real
  consumer used two. Now 10: `apb`, `apbDefinition`, `VERSION`, `CUBING_CORE_VERSION_USED`, the
  piece groups (`BLOCK223`, `AFTER_BR`, `F2L`, `BR_PAIR`, `LAST_SLOT`, `EO_EDGE_SLOTS`) and
  `PieceRegion`. Goal predicates, recognition signatures and lookup builders are internals — read
  `geometry.ts` as a template instead.
- **`@moishy/cubing-core`** no longer exports `movesFromFamilies`, `runPhaseCandidates`,
  `PhaseCandidateOptions` or `homingRotation`. `Method` drives all four. `runPhase` stays public —
  unit-testing a phase in isolation is a real workflow.

### Changed — breaking

- **`apb`'s `Region` is now `PieceRegion`.** `@moishy/cubing-core` exports an unrelated `Region` (a
  `[fromStepId, toStepId]` step range), and a method module imports from both.

## 2026-07-28 — `algsets@0.2.0` · `apb@0.1.2`

### Removed — breaking

- **`@moishy/algsets/ocll-pll`.** An empty placeholder, unused, and redundant: OCLL is `oll` cases
  21-27 and PLL is the `pll` set, which is how APB's `ocllPll` replacement builds it.

### Added

- A cross-set audit test: every algset is checked against the lookup and goal it is actually used
  with, not just its own tests. That gap is what let the `zbls` bug survive. 1,456 case checks
  across 16 lookups, all clean.

## 2026-07-28 — `algsets@0.1.2` · `apb@0.1.1`

### Fixed

- **`zbls`: all 32 broken cases.** They were not bad transcriptions — every alg solved its own case
  correctly. 22 were authored against the BR slot and 10 against FL, while APB recognizes on FR, so
  their recognition states had the wrong slot open; being defined early they also hijacked the
  signature from 27 legitimate FR cases. Conjugated onto FR (24 came out rotation-free). All cases
  now recognize and solve.
- The demo page said Winter/Summer Variation was "not implemented". It is, and it fires.

### Changed

- The demo runs the solver in a Web Worker, so the tab no longer freezes for the length of a solve.
  Adds a Cancel button and a live elapsed counter.
- `SearchPhase.timeBudgetMs`: a soft per-invocation budget whose expiry drops the phase from its
  step's race instead of failing the solve.

## 2026-07-28 — `algsets@0.1.1`

### Changed

- Module docs on all 15 algset entrypoints, taking the package from 82 to 100 on JSR.

## 2026-07-28 — `cubing-core@0.1.0` · `algsets@0.1.0` · `apb@0.1.0`

First release with automated publishing, and the first to npm.

### Added

- **Release automation.** JSR and npm both publish from GitHub Actions over OIDC — no tokens. CI
  runs the full gate plus a publish dry run and an npm build/install smoke test on every PR.
- **Published to npm** for the first time, dual ESM/CJS via dnt.
- READMEs for all three packages, user guides, and an MIT LICENSE. All three reached 100 on JSR.
- `regionHeuristicMulti` — the maxed multi-table pruning bound that makes APB's `direct`
  block-building strategy practical (~30x faster; it previously timed out or exhausted the heap).

### Fixed

- `build_npm.ts` emitted no `dependencies` and dropped every subpath export, so `@moishy/algsets`
  would have shipped 1 export instead of 16 and thrown `Cannot find module` on first require.

## 2026-07-15 — `cubing-core@0.0.1` · `algsets@0.0.1` · `apb@0.0.1`

Initial publish to JSR.
