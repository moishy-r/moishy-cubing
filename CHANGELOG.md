# Changelog

All four packages version independently but are released together when a change spans them, so this
is one file. Each entry lists the versions it shipped as.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) — on a `0.x` line, a **minor** bump is the breaking one.

## Unreleased

### Added

- **`@moishy/algsets@0.3.2`: F2L and Advanced F2L case data, all four slots** —
  `@moishy/algsets/f2l` (41 cases x 4 slots, 622 algs) and `@moishy/algsets/advanced-f2l`
  (42/35/28/31 cases for fr/fl/bl/br, 664 algs), scraped from SpeedCubeDB's F2L and AdvancedF2L
  pages, which publish genuinely slot-specific algorithms rather than mirrors. Each subpath exports
  **four** `AlgSet`s (`f2lFr`/`f2lFl`/`f2lBl`/`f2lBr` plus an `f2lBySlot` record): recognition is
  derived per case from its primary alg, so the same case in a different slot is a different state
  and has to be a different set. Authored for `@moishy/cfop`, but nothing in either set is
  CFOP-specific.

  Four things had to be decided from the data rather than the source's presentation, each verified
  by a test:

  - **Alg order is load-bearing.** Every slot's primary is rotation-free and derives a genuine
    fixed-frame state for _that_ slot (centers home, D-layer cross solved, the right slots open); a
    primary containing a net `y` derives a state for a _different_ slot and silently mis-recognizes,
    mechanically the same defect that broke 32 `zbls` cases. 16 plain and 41 advanced (case, slot)
    pairs needed reordering to put an eligible primary first. Later variants are unconstrained and
    many do rotate — CFOP uses rotations freely, and `runPhase` goal-checks every variant.
  - **Advanced F2L's case numbering is not 1:1 with cube states, so this set does not follow it.**
    SpeedCubeDB groups Advanced cases by the _shape_ of the case, and the algs under one heading
    handle the piece being trapped in different slots — so they solve different states and are not
    interchangeable variants at all. Stored verbatim, 117 of 208 front-right variants could not
    solve their own case, and the states they _did_ solve were unrecognized. Cases are therefore
    one-per-state (54 headings collapse to 42/35/28/31), with the contributing headings kept in
    `name`.
  - **Rotated algs are stored verbatim.** Nothing is de-rotated or rewritten: a primary containing a
    `y` derives exactly the same state as a rotation-free one, because `defineAlgSet` now accounts
    for the frame an alg lands in (see the Fixed entry below). An earlier pass here manufactured 17
    rotation-free primaries to work around that bug; none survive.
  - **A consumer must recognize on the pair _plus_ whichever cubies occupy the target slot.** An
    advanced case whose pair sits in an ordinary position — what makes it advanced is a foreign
    piece blocking the slot — has the same pair signature as the plain case for that position, whose
    alg cannot solve it. Measured 5-6 such collisions per slot on the pair alone, 0 with the
    occupant in the key, which is what makes `fallThrough(f2l, advancedF2l)` unambiguous.

  Coverage is walked over the state space, not the stored cases: all 149 non-solved last-slot states
  (the classic 41 up to AUF) are recognized. 5 Advanced algs are not kept — each needs the cross
  _not_ already solved or leaves the centers drifted, so it cannot run in a fixed-frame CFOP solve;
  they are listed in the module doc.

### Changed

- **`@moishy/cubing-core@0.3.1`: rotations are no longer underpriced, so a regrip stops winning
  races it should lose.** 2H base costs go `y` 1.8 -> 2.6, `x` 2.0 -> 3.0, `z` 2.0 -> 3.2. The floor
  is not a matter of taste: for any step whose recognition is AUF-invariant — every last-layer step,
  and the F2L slots — a whole-cube rotation can always be replaced by at most a pre-AUF plus a
  post-AUF, i.e. two quarter turns. Priced below that, a rotation wins on cost alone. A real CFOP
  solve emitted `y R U2 R' U' R U2 L' U R' U' L` (12.90) over the rotation-free
  `U L' U R U' L U2 R' U R U2 R' U'` (13.10) — a regrip to save 0.2, which no solver would do. Now
  the rotation-free route wins. Measured over 10 scrambles: CFOP mean cost 57.41 -> 57.87 (the
  rotations that remain are honestly priced), mean move count 53.0 -> 53.1, spurious rotations 6 ->
  5; APB unchanged, having emitted none. OH was already above the floor at 4.0. A test now pins the
  invariant for all three models.

- **`@moishy/algsets@0.3.2`: 87 of coll's 160 algs no longer start with a pointless `y`.** With the
  F2L already solved, a leading whole-cube rotation on a last-layer alg does the same job as the U
  turn the phase's AUF supplies for free — it is a transcription artifact, not technique, and it
  costs a real regrip. The set carried the same alg written from three angles per case
  (`y R U2 R'
  U' R U' R'`, `y2 L' U' L U' L' U2 L`, `y' L U2 L' U' L U' L'`). Each leading
  `y`/`y2`/`y'` is now the matching `U`/`U2`/`U'`, verified case by case to leave every case
  recognizing exactly the states it did before. Leading rotations: 87 -> 0. Cases with no
  rotation-free alg: 2 -> 0.

  Mid-alg rotations are kept and always will be: the E-perm's `x` is real technique and no AUF can
  replace it. pll, oll and zbll needed no change — they have no leading `y` at all, only `x`/`z`,
  which are exactly the legitimate ones. Two tests guard this for coll.

### Added

- **`@moishy/cfop@0.1.0`: a CFOP solver.** Cross, four F2L pair steps, OLL, PLL. Pure configuration
  over `@moishy/steps` — the second method in the repo, and the test of whether extracting `steps`
  was worth it. It was: the package is ~150 lines and every step it lists is shared.

  The F2L steps are interchangeable and none names a slot; which pair each takes is decided by cost
  per scramble (see the `steps@0.2.0` entry). Verified end to end on 20 scrambles, with each step's
  own contract asserted at its boundary and a regression test that no solution contains a rotation
  immediately undone by its inverse.

  Deliberately absent, each for a stated reason rather than an oversight: X-cross (a `compete`
  Replacement over `[cross, cross]`, since an X-cross is a normal F2L with one pair pre-solved, not
  a separate process); the last-slot variants and Winter/Summer Variation (their data is authored
  for the FR slot, while CFOP's last slot is whichever the first three steps did not take); and a
  two-look last layer. That last one is worth recording: **APB's `ocllPll` and `collEpll` are not
  reusable here.** Both OCLL and COLL assume the last-layer edges are already oriented — true in
  APB, which has a core EO step, false in CFOP. Forcing either throws `SettingsError` at the `oll`
  boundary, correctly, and there is a test pinning that.

- **`@moishy/steps@0.2.0`: the shared last-layer wiring** — `ollStep`, `pllStep`, `ocllPllStrategy`,
  `collEpllStrategy`, `ollPllStrategy`, the lookups behind them and the goals they use. APB now
  imports these instead of defining its own; its 57 tests pass unchanged. The wiring is the part
  worth sharing, not the data: each lookup exists because the algset's default full-facelet
  signature does not match a live last layer (OLL keys on orientation, COLL on corners, and every
  one needs both-AUF recognition).

### Changed

- **`@moishy/steps@0.2.0`: `CROSS` is now the real D-layer cross (DR, DF, DL, DB).** It was the
  three edges DF/DL/DB — the edge part of APB's bottom-left 2x2x3, never a method's cross — while
  the module doc advertised it as "CFOP's cross". The three-edge region is still available as
  `CROSS3`, which is what `cross1Front`/`cross1Back` build. **Breaking**: a caller using `CROSS` to
  mean the old three edges must switch to `CROSS3`.

- **`@moishy/steps@0.2.0`: F2L ships as steps, not just searches.** `f2lSteps` gives the four
  pair-insertion steps, plus the pieces they are built from (`F2L_SLOT`, `slotSignature`,
  `anySlotLookup`, `f2lGoal`, `f2lSetupStrategy`, `slotAt`). The package README and module doc are
  corrected to match: it ships reusable _steps_, and always did — `block223Step` was already one.

  F2L is four interchangeable instances of the same work in a scramble-dependent order, which the
  Step/Strategy/Phase model does not obviously express. It needs no new mechanism. A step's identity
  is **"the Nth pair inserted"**, not "the FR pair": the goal of step N is "the cross is intact and
  at least N slots are solved", and the lookup merges all four slots' candidates into one case whose
  `algs` are every slot's options — so `runPhase`'s existing "try every alg, keep the cheapest that
  reaches the goal" _is_ the pair race. Three things fall out:

  - An already-solved slot is a free skip, so an X-cross (which replaces only the cross step, being
    a normal F2L with one pair pre-solved) needs no F2L-side support at all.
  - An Advanced F2L alg that frees a trapped piece opens the slot it came from; if that nets no
    slot, the count goal rejects it. No special case.
  - The last slot is its own Step, so ZBLS/OLS is an ordinary Replacement over `[f2l4, f2l4]` and
    Winter/Summer Variation an ordinary checkpoint Extra — the shape APB already uses for
    `[lxs, zbll]`.

  Slots are tracked by cubie, so a mid-solve rotation never changes which pair a step means;
  `slotAt` maps back to the physical position for display, which is what a solver holding the cube
  sees.

  Two things were measured rather than assumed, both of which cost a wrong first attempt:

  - **Recognition keys on the pair alone, not on what occupies the slot.** Adding the occupant looks
    right — it separates the few Advanced cases whose pair sits in an ordinary position and are
    "advanced" only because a foreign piece blocks the slot. It is wrong twice: unnecessary (that
    blocker belongs to another unsolved slot, so evicting it is free, and the plain alg does exactly
    that — verified for all 6 shared FR positions), and destructive (both sets' states have the
    other three slots solved, so their occupant is always a U-layer cubie, while a live mid-F2L slot
    usually holds another slot's piece). Keyed on the occupant, **7 of 10 real scrambles stalled on
    the first pair**. The two sets are merged per position instead, so both algs compete on cost.
  - **The fallback is a setup, not a search.** Case data alone finishes F2L on 8 of 10 real
    scrambles and stalls on the third pair of the rest, because neither set covers every way three
    unsolved slots can hold each other's pieces. Searching for the whole insertion does not
    terminate — 6 faces to depth 12 with only a pair-sized heuristic. What a solver actually does is
    pull the stuck pair out with a trigger and read off the case it has become, so the fallback
    searches only for a short prefix from which an insert _provably_ finishes the step, then defers
    to the same lookup. That is a few hundred states, and it takes coverage to **10 of 10**. It is
    registered alongside the algorithmic strategy and loses the cost race whenever a case applies.

### Fixed

- **`@moishy/cubing-core@0.3.1` / `@moishy/algsets@0.3.2`: rotations in algorithms now work.** A
  rotation an alg contains is executed, and the frame it leaves is the state the solve continues
  from. Three separate defects had made that untrue, all of them visible in one real APB solve which
  contained `... y2 L U2 R' U L' U' R U' L U' L' y' y' M2 U M' U2 M U M2` — three rotation moves
  whose net effect is nothing.

  - **Recognition dropped an alg's own rotation.** `defineAlgSet` derived a case's state as
    `solved · invert(alg)`, which is only correct when the alg has no net rotation. An alg carrying
    rotation `p` solves its case into the `p` frame — `c · A = solved · p`, so
    `c = solved · p · A⁻¹` — and dropping the `p` yields a state in a rotated frame that normalizes
    to a _different_ case; for a slot-based set, one belonging to another slot. Verified against
    ground truth on the newly scraped F2L data, where every published slot is known: with the `p`,
    every rotated alg lands on its published slot; without it, none do. The correction is adopted
    only when it yields a coherent fixed-frame state, which leaves alone the handful of ZBLL
    primaries that mix rotations with wide moves (`x R2 D2 R U2 R' D2 R U2 l`) and were authored
    against the raw derivation.
  - **The runner re-homed at every phase boundary.** `runPhase` reoriented a rotated input back to
    the home frame and charged for it, so a rotation could never persist. It now evaluates a phase
    in both the as-held and homed frames and keeps the cheaper. For a `y`-type frame this needs no
    rotation at all: below the last layer everything is solved, so a `y` presents the last layer
    exactly as a `U` does and the pre/post AUF already tried absorbs it — measured across every case
    of pll, oll and zbll. An `x`/`z` frame takes the last layer off the top where no U turn reaches
    it, so there a reorientation is genuine and is emitted as one costed move.
  - **`homingRotation` was not minimal.** Its orientation table was built by BFS over quarter-turn
    generators only, so a 180 came back as two moves (`y' y'` rather than `y2`) — double cost for
    one turn of the wrists, even when the reorientation was needed.

  APB gets strictly better and no method needs changing: on the solve above, 61.51 → 49.13 with the
  rotations gone entirely. `apb@0.2.4` also scopes lookahead across `coll → epll`, since a COLL
  variant that ends tilted changes what EPLL costs and the choice is only correct with the
  continuation in view.

  **Also fixed, uncovered by this:** eight `zbls` cases (`f2l-6-2`, `f2l-6-7`, `f2l-8-5`,
  `f2l-13-1`, `f2l-22-4`, `f2l-24-7`, `f2l-26-4`, `f2l-35-1`) were authored for the FL slot — one
  (`f2l-8-5`) for BR — rather than FR. Every variant of each agreed on the same slot, which is what
  ruled out the derivation being at fault: the old formula applied a second, compensating error to
  exactly these rotated primaries and made them look correct, so the earlier pass that rotated 32
  cases onto FR did not miss these by accident. They are not forced onto FR by rewriting their
  moves. Each now carries the rotation that brings the FR pair to the slot its alg solves (`y`, or
  `y'` for the BR one) — turn the cube, then execute the alg you know, which is what a solver
  actually does and is only expressible now that a leading rotation no longer relocates the case.
  The same prefix works for every variant of each case, so they stay interchangeable. All 301 zbls
  cases now target FR, recognize and solve.

- **`@moishy/algsets`: the README and module doc showed `pll.byId(...)`**, which has never existed —
  the accessor is `get`.

---

## 2026-08-02 — `cubing-core@0.3.0` · `algsets@0.3.1` · `steps@0.1.1` · `apb@0.2.3`

### Changed

- **`@moishy/cubing-core`: enabling a `compete` unit can no longer make the solve worse.** The mode
  means "use this only if it helps", but it was judged on its own region: the span DP picks the
  cheapest cover of the region and the runner then continues greedily, so a cheaper region could
  leave a dearer remainder. Enabling APB's `eoPair` alone made the total worse on 14 of 60 scrambles
  (worst +7.9) and all five replacements together on 29 of 60 (worst +11.4) — while the region cover
  itself was never dearer on any of them, exactly as the DP guarantees. A compete unit is now judged
  on the whole solve: the solver runs once with the compete units off and once with them on and
  keeps the cheaper. Regressions are now 0 of 60 for every unit and for all eight at once, and each
  unit fires on exactly the scrambles where it helps. Costs a second solve, but only when a compete
  unit is enabled — they are opt-in and off by default, so the default path is untouched. `force`
  units are not raced: forcing a unit says it must be used, not that it is on offer.

- **`@moishy/cubing-core`: a search whose depth bound admits no solution no longer exhausts the
  heap.** `maxDepth` bounds solution _length_, not work — with no solution under it, A\* has to
  exhaust every state reachable in that many moves, and nothing bounded the visited map or the
  frontier. Lowering APB's `rouxFB` cap from 9 to 7 grew the heap at ~200 MB/s to a fatal,
  uncatchable V8 out-of-memory in under a minute; that is a documented use of
  `StepOptions.searchMaxDepth` ("lower one to bound an experiment"), so it must not be able to kill
  the process. Searches now stop at `SearchParams.maxNodes` (default `DEFAULT_MAX_NODES`, 500k
  retained states ≈ half a gigabyte, costed from measurement) and report `found: false`. The same
  repro now returns in ~2s at a bounded 563 MB. Unlike a wall-clock budget the bound is
  deterministic, so which strategies answer stays machine-independent. A phase whose search is
  legitimately huge raises its own `SearchPhase.maxNodes` — APB's opt-in `direct` retains ~910k
  solving the whole 2x2x3 in one go, and does so.

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

- **`@moishy/steps@0.1.1` — reusable solver steps.** `@moishy/algsets` is the data side of "don't
  write this twice"; this is the search side. A Roux first block, a 2x2x2, a 2x2x3, a cross — the
  same search each time, only the cubies in the goal change — so the machinery and the standard
  targets now live in one package and a method composes them. Ships `blockSearch` — which wires the
  goal, move set, pruning table, A\*, axis canonicalization, region keying, the optional whole-block
  guard and the phase-chaining pool key — the named targets, the move-count-primary block cost
  model, and the six 2x2x3 strategies both individually and as a ready-made `block223Step()`.

  It depends on `@moishy/algsets` for one reason: `rouxFbDfdb`'s second phase places DF/DB by
  algorithm. Shipping that strategy whole is the point — it is the reference phase-chaining case and
  the cheapest of the six, and splitting it would leave every method re-deriving the same pool key,
  frame-relative flag and shared cost model. Dependency order stays linear:
  `cubing-core -> algsets -> steps -> methods`.

  First release is `0.1.1`, not `0.1.0`: npm requires a package to exist before a trusted publisher
  can be attached to it, so `0.1.0` was published by hand to bootstrap that (see the note in
  `release.yml`). A manual publish burns the version for the automated path — neither registry
  allows republishing — so the release workflow ships `0.1.1`, identical in content and carrying the
  provenance attestation the hand-published one lacks.

- **`@moishy/cubing-core` now exports the generic geometry and pruning machinery** it always owned
  in spirit: `PieceRegion`, the goal predicates (`regionSolved`, `regionSolvedStrict`,
  `regionSolvedAndEO`, `regionSolvedLRHome`, `centersSolved`), the signature primitives
  (`pieceSignature`, `orientationSignature`, `cornerSignature`, `eoSignature`), the search keys
  (`regionCoordinate`, `axisCanonical`), the pattern databases (`regionHeuristic`,
  `regionHeuristicMulti`), plus `stripRotations` and `fallThrough`. `eoSignature` now takes the slot
  list, since which edges a method orients is the method's business.

- **`@moishy/algsets` now exports the `AlgSet` -> `CaseLookup` adapters**: `regionLookup`,
  `regionLookupRaw`, `aufInvariantLookup`. They take an `AlgSet`, so this is the only home that does
  not cycle — cubing-core cannot depend on the type.

  None of the above is new code; all of it was internal to `@moishy/apb`, where it was unusable by
  any other method. `apb/src/geometry.ts` drops from 604 lines to 95 and `apb.ts` from 969 to 642,
  leaving the part that is genuinely APB's: its piece groups, and the compositions its own Steps
  recognize on. APB's public surface is unchanged.

- Three **coverage** tests in `@moishy/apb`, walking the state space rather than the stored cases,
  since iterating cases cannot find a class that no case owns — which is why these survived: every
  last-layer orientation state (OLL/OCLL), every last-layer corner state (COLL), and a ratchet
  asserting every algset variant solves its own case.

- **`@moishy/algsets`: `zbll` and `pll` carried the `oll` defect in their _variants_, now
  migrated.** 1572 of 1745 ZBLL and 47 of 89 PLL alternative algs were filed under the wrong case,
  so `runPhase` silently skipped them and those steps had far fewer real options than the data
  suggested. Primaries were correct throughout and ZBLL coverage was already proven complete
  (7775/7775), so this cost no correctness — only the cost race. Every variant now sits under the
  case it actually solves.

  What made the move safe is how structured the misfiling was: in `zbll` all 428 affected cases
  formed **214 mutual swap-pairs** (`t-1` <-> `l-26`, `t-2` <-> `l-28`, ...), with every misfiled
  variant of a case going to the same target; `pll` was messier (6 swaps, 3 chains, 1 split) and the
  same "move each variant to the case it solves" rule handles all of it. Primaries were never
  touched, so recognition and coverage are unchanged by construction. 14 algs were dropped rather
  than moved — they solve no case in their set because they disturb the F2L, i.e. corrupt rather
  than misfiled — and 11 duplicates collapsed after the move. Net effect on solutions: mean cost
  44.12 -> 43.52 and mean length 41.08 -> 40.57 moves over 60 scrambles on shipped defaults.

  All fourteen sets now hold zero misfiled variants, and the ratchet test pins every one of them at
  zero rather than carrying a budget.

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
