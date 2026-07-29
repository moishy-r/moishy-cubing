# Changelog

All three packages version independently but are released together when a change spans them, so this
is one file. Each entry lists the versions it shipped as.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) — on a `0.x` line, a **minor** bump is the breaking one.

## Unreleased

Nothing yet.

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
