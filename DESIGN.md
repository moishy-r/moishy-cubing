# Design spec

Living record of the architecture decisions behind this project. Update this alongside the code -
it's the source of truth for "why does it work this way," not the chat history that produced it.

## Packages

- `@moishy/cubing-core` - cube engine, base classes, generic search, MCC scoring, solver pipeline
  runner. No algorithm data, no method-specific logic.
- `@moishy/algsets` - algorithm case data only, authored as typed TS modules. No solving logic.
- `@moishy/apb` - the APB method plugin. Reference implementation for "how to add a new method" -
  copy this package's shape for `@moishy/cfop`, `@moishy/roux`, etc.

Deno workspace, one repo. Each package publishes independently to JSR (native) and npm (via `dnt`,
see `scripts/build_npm.ts`), triggered by pushing a tag `<package-dir>-v<version>` (see
`.github/workflows/release.yml`). Versions are NOT kept in lockstep across packages - `algsets` will
move much faster than `cubing-core`.

## Cube representation

Cubie-level state: permutation + orientation vectors for corners/edges (and centers if a future
method needs them, e.g. for tracking mid-solve reduction). Facelet/sticker arrays are derived only
when something needs to render a picture - they are a view, not the source of truth.

A single generic IDA*-style search engine lives in `cubing-core`, parameterized per use by a goal
predicate and a pruning table. Search phases (see below) configure this engine rather than each
strategy hand-rolling its own search.

## Move representation

One canonical `Move` type, shared by move application (permutation composition) and cost scoring
(MCC) - not two parallel representations that can drift:

```ts
type MoveFamily =
  | "R"
  | "L"
  | "U"
  | "D"
  | "F"
  | "B" // outer face turns
  | "M"
  | "E"
  | "S" // slice turns
  | "r"
  | "l"
  | "u"
  | "d"
  | "f"
  | "b" // wide turns (SiGN-style single letter, not WCA "Rw")
  | "x"
  | "y"
  | "z"; // rotations

interface Move {
  family: MoveFamily;
  amount: 1 | 2 | 3; // 1 = single CW quarter turn, 2 = double/180, 3 = single CCW quarter turn (prime)
}
```

`isDouble`/`isPrime` are derived (`amount === 2` / `amount === 3`), not stored separately. A
`parseAlg(input: string): Move[]` in `cubing-core` tokenizes a move string into this type
(SiGN-style wide-move convention, matching the project's existing `reference/mcc.ts`), throwing on
invalid tokens at the parse boundary - nothing downstream (search, cost scoring) needs to
defensively handle malformed input, since by the time a `Move[]` exists it's already valid. A
`formatMove`/`formatAlg` pair goes the other direction, for rendering.

## Step -> Strategy -> Phase

The composition model for "how a method is wired up":

- **Step** - a named slot in a method's step list, e.g. `2x2x3`, `ZBLL`. What shows up in the
  method's step sequence; what Replacements/Extras reference. A Step's `id` is an identifier-safe
  string (e.g. `block223`, not `2x2x3`) used as a settings/lookup key; a separate `label` (e.g.
  `"2x2x3"`) is what gets displayed. Same convention for Strategy ids (`fbDfdb`, `direct`,
  `cornerFirstFront`, ...) vs. their display labels.
- **Strategy** - one way to solve a Step, e.g. `RouxFB+DFDB` vs `DirectBlockbuilding` for `2x2x3`. A
  Step can register multiple Strategies; the solver runs all enabled ones and keeps the best by
  (lookahead-adjusted) MCC, unless a Strategy is pinned (see Solver settings below).
- **Phase** - the atomic unit inside a Strategy: `SearchPhase` (generic search engine + goal
  predicate + pruning table, no algs) or `AlgorithmicPhase` (case lookup + algs + AUF handling). A
  Strategy is just an ordered list of Phases. `RouxFB+DFDB` =
  `[SearchPhase(Roux FB),
  AlgorithmicPhase(DF/DB pair)]`. `DirectBlockbuilding` =
  `[SearchPhase(full 2x2x3)]`.

`Search` vs `Algorithmic` lives at the Phase level, which is what lets one Step blend both
approaches.

A recognized case carries **one or more interchangeable algs** (`AlgCase.algs`), not a single alg.
`runPhase` tries every variant (and every AUF alignment) and keeps the cheapest that meets the
goal - this is the hook Lookahead uses: with all variants on the table, the pipeline runner can
prefer whichever leaves the cheapest _continuation_, not just the cheapest in isolation. `algs[0]`
is the primary; recognition is derived from it, not from every variant independently (see Algset
schema below - this has a real caveat worth reading before assuming all variants are freely
interchangeable).

`runPhase` also treats a phase as **skippable**: if the goal is already met after nothing but an AUF
alignment (no case alg needed), that zero-alg solution is a candidate - and, being the shortest,
usually the winner. This is what lets a step that a scramble happens to leave already-done just fall
away (EO already oriented, the last layer already permuted, ...) without every algset having to
carry an identity case. Recognition sets deliberately don't store one; the runner supplies it.

The pipeline runner walks the step list one _unit_ at a time (a unit is a single Step, or a
Replacement/Extra region) and commits greedily: it races the unit's candidate Strategies by MCC and
keeps the cheapest before moving on. Lookahead (see Solver settings below) makes this greedy choice
smarter by peeking ahead, but it is still fundamentally a greedy walk, not a global optimization
across the whole solve. `prevMove` threads continuously across units so cross-boundary MCC costs
(destabilization, overwork) are real, not reset at unit boundaries.

Implementation caveat: the search engine's default pruning forbids two moves of the same family in a
row, and this applies across phase/step boundaries too - so a unit that must _begin_ with the same
family the previous unit _ended_ on can be over-pruned. Safe in practice (same-family pairs are
dominated by a single combined move, e.g. `R R` by `R2`), revisit if a real method needs it.

## Algset schema & authoring

Cases are authored via `defineAlgSet({ id, cases: [{ id, algs, ... }] })`. Each case's `algs` is one
or more interchangeable solutions - a bare SiGN string (shorthand), or
`{ alg, source?, checkpoints? }` for one that needs metadata. Cases also take optional `name`,
`subset` (e.g. `eoPair`'s misoriented-R/misoriented-U/oriented-R/oriented-U groupings), and `tags`.

```ts
interface AlgVariant {
  alg: string; // SiGN-style move string
  source?: string; // attribution
  checkpoints?: { afterMoves: string; label: string }[]; // see Extras above
}

interface AlgCase {
  id: string; // stable, e.g. "zbll/pi/s1"
  algs: (string | AlgVariant)[]; // bare string = shorthand for { alg: <string> }
  name?: string;
  subset?: string;
  tags?: string[];
}
```

Notably **no `auf` field** - AUF is not stored data at all. `runPhase` computes both pre- and
post-AUF alignment dynamically at solve time (try the U-rotations, see which one matches / which one
leaves the cube actually solved), the same way case recognition itself is computed rather than
hand-stored. This is what keeps algsets from needing up to 4x as many entries to cover every
U-rotated presentation of what's really the same underlying case - safe to do for essentially every
`AlgorithmicPhase`, not just last-layer-like ones, since a U turn never disturbs whatever a prior
Step already solved (it only touches U-layer pieces) or edge orientation (only ever affected by F/B
quarter turns). Recognition matches live state against a case's derived state via a **signature
projection**, defaulting to the full facelet string (whole-cube exact match - correct because the
phases before an algorithmic phase have already solved everything the alg doesn't touch); an author
can pass a narrower `signature(state) => string` for phases that only care about a sub-region.

Recognition is derived from `algs[0]` (the primary) only, never every variant independently and
never hand-stored: the state a case solves is exactly the solved cube run through the inverse of
`algs[0]` (`applyMoves(solved, invert(algs[0]))`). This gives a free correctness test suite (every
stored alg can be verified against the core engine) and removes an entire category of hand-entry
error.

`defineAlgSet` itself stays deliberately lenient - it parses every alg of every variant eagerly
(throwing `NotationError` at authoring time on bad notation) and enforces only structural invariants
(valid notation, unique case ids, at least one alg per case). It returns an `AlgSet` that _is_ a
`CaseLookup`, dropping straight into an `AlgorithmicPhase`. Everything semantic is the job of the
separate **validation harness**, `validateAlgSet`, run from the set's own tests: always-on
`empty-alg` (warning, per variant) and `signature-collision` (two cases the set can't tell apart,
detected via self-recognition), plus opt-in checks via `ValidateOptions` - `allowedFamilies` (every
variant stays within a move set), `auf` (recognition stays unambiguous once AUF is added), and
`goal` (each variant of each case actually reaches the phase goal from that case's state).
`assertValidAlgSet` is the throw-on-error wrapper for a `Deno.test`.

**Real imported data has a caveat that directly matters for method wiring (i.e. what we're doing
right now writing the APB spec) - flagging this clearly rather than burying it:** case-sets store
each case's _alternative_ algs the way alg databases do, at whatever recognition AUF and cube
orientation they were originally sourced at - so in a fixed frame, only `algs[0]` is provably
guaranteed to solve the case's derived state. What relates an alternative to the primary is
_per-set_:

- ZBLL/PLL variants differ by a recognition-AUF (a _conjugation_ by `U`, not a simple prefix) and/or
  a net whole-cube rotation (some algs end tilted, e.g. an unbalanced `x`). APB's terminal ZBLL step
  handles both: it recognizes up to the two-sided `U`-coset and de-rotates any tilted alg into the
  fixed frame before use (see `packages/apb/SPEC.md`, ZBLL, and geometry.ts `aufInvariantLookup` /
  `stripRotations`). So for a fixed-frame solve, tilted primaries are no longer a blocker there.
- OLL variants only agree up to last-layer _permutation_ - each orients the case but leaves a
  different PLL, so "solves the primary's exact state" is meaningless for them; the right goal is
  orientation-only.
- Partial-step variants (BR pair, DF/DB, LXS, EOPair) only agree on their _region_; off-region
  pieces can differ between variants.

Reconciling this needs each phase's own goal predicate (orientation-only, permutation-up-to-AUF, or
region-masked) - which is exactly method wiring, so this was deliberately deferred to APB's `Method`
subclass rather than solved generically in `algsets` itself. **My explicit concern going into
this**: several places in the APB spec (the `dfdb` r/M substitution most directly, but also any
Lookahead-driven choice among `brPair`/`eo`/`lxs` `AlgVariant`s) assume any stored variant is freely
swappable for scoring purposes. That assumption is only actually safe once each of those phases'
goal predicates are confirmed to be scoped correctly for what their real variants do and don't agree
on - worth a real check during step 8, not an assumption to carry in silently.

ZBLL and PLL are stored as **separate sets**, not one folded table - ZBLL is 472 cases, PLL is its
own 21-case set (`ocllPll`/`collEpll` compose them rather than ZBLL containing them redundantly).

Subpath exports (real, already landed): `@moishy/algsets/zbll`, `/oll`, `/pll`, `/br-pair`,
`/eo-pair`, `/dfdb`, `/lxs`. Placeholders: `/coll-epll`, `/ocll-pll`, `/sv`, `/wv`, `/zbls`. Note
`/oll` and `/pll` already being real, full data is good news for the APB spec's `oll` and
`ocllPll`/`collEpll` - `ocll`/`epll` should be filtered subsets of these existing sets, not newly
authored, matching how the spec already treats `epll`. Still open/unconfirmed, not resolved by this
pass: plain `/eo` isn't in the landed list at all (worth double-checking that's not an oversight);
the naming layer is kebab-case for subpaths vs. camelCase for internal Step/Strategy ids (probably
fine as different layers, not yet explicitly confirmed); no placeholder yet for the `oll` _Extra_
(distinct from the `oll` data set), `eo-back-slot`, or `lxs-back-slot` (expected, these were only
discussed after this landed).

## Replacements

A Replacement is an alternative set of Strategies registered against a contiguous range of the
method's core steps (its `region`), not a distinct kind of Step. Two selection modes, set by the
method author but overridable per-solve in settings:

- `"compete"` - the Replacement's Strategies are merged into the same candidate pool as the region's
  original Strategies and raced by MCC; the cheaper one wins. Use this when the alternative is a
  genuine performance question (e.g. `BR Pair+EO` vs `EOPair`).
- `"force"` - the Replacement's Strategies entirely replace the region's pool when enabled, no
  comparison. Use this when the alternative exists for a knowledge/curriculum reason, not a speed
  one (e.g. `ZBLL` -> `OCLL+PLL` for someone who doesn't know full ZBLL - ZBLL will ~always look
  cheaper by MCC, so racing it would defeat the point).

```ts
interface ReplacementOptions {
  enabled?: boolean; // ALWAYS defaults to false, project-wide - a Replacement
  // is only ever active if the caller explicitly opts in,
  // regardless of how good an idea the Method author
  // thinks it is. No per-Replacement "on by default."
  mode?: "compete" | "force"; // default per the Replacement's own definition,
  // but always caller-overridable - a Method
  // author picks a sensible default mode, they
  // don't get to lock it.
}
// settings.replacements: { [replacementId: string]: ReplacementOptions }
```

v1 constraint: Replacements are defined against the base Method's core-step sequence only - no
replacement-of-a-replacement. Revisit if a real method needs that nesting.

### Overlapping regions

Two `compete`-mode Replacements can have regions that overlap without being identical (e.g. one
covering `[brPair, eo]`, another covering `[eo, lxs]`). When more than one enabled Replacement's
region overlaps another's, the solver cannot just race each region independently against baseline -
it has to find the cheapest way to **cover the whole connected span** using non-overlapping blocks,
where each block is either a single plain Step or one enabled Replacement used across its _entire_
declared region (no partial application). This is a small weighted-interval-scheduling DP over the
Method's step sequence: for each position, the best cost is either "plain Step here + best-so-far up
to the previous position," or "some Replacement ending exactly here + best-so-far up to just before
that Replacement's region starts" - take the minimum across both options at every position.

`force`-mode Replacements are simpler and sit outside this DP: they deterministically consume their
region when enabled, no comparison, and their region is carved out as a fixed block before the DP
runs on whatever remains. Two enabled `force`-mode Replacements are only a conflict if their regions
actually overlap each other (e.g. two different force-mode alternatives both registered against
`[zbll]` - the caller must enable at most one; this should be a settings-validation error, not
silent last-one-wins behavior).

*(Open, deferred: whether Lookahead should be able to peek across a dynamically-_chosen_
Replacement's boundary, e.g. from whatever wins the `eo`-ish slot into `lxs` regardless of whether
that was plain `eo`, `EODR+LS`'s `eodr` phase, or something else. Not required for correctness -
today's model requires Lookahead scope to reference concrete ids - but worth revisiting once there's
more than one method's worth of real replacements to generalize from.)

## Extras

An Extra is a Replacement with one addition: a `trigger` gating whether it's even a candidate for
this particular solve. Same `region` (one or more contiguous core Steps - Extras are not limited to
a single Step any more than Replacements are), same `{enabled, mode}` settings shape, same
`compete`/`force` semantics once triggered, same opt-in-only default. The only new piece is the
trigger, which comes in two forms:

- **Boundary trigger**: `(state, ctx) => boolean`, evaluated once at the start of the Extra's
  `region` - "is this opportunistic shortcut even available right now." If false, the Extra simply
  isn't a candidate for this solve; the region falls back to its normal Steps (or whatever other
  enabled Replacement/Extra applies).
- **Checkpoint trigger**: scoped to a `checkpoints` label on an `AlgorithmicPhase`'s `AlgVariant`
  (see Algset schema above) for Extras that can only be recognized _partway through_ an alg already
  in progress (e.g. Winter/Summer Variation, recognizable only after the "pairing" portion of a
  last-slot insertion, before the "insertion" portion). The engine runs up to the checkpoint,
  evaluates any checkpoint-scoped Extras against current state, and either splices in the Extra's
  own continuation (for the rest of its `region`) or proceeds with the original alg. Cases with no
  checkpoints just run straight through - this costs nothing for the common case. Mid-search (as
  opposed to mid-alg) checkpoint triggers are out of scope for v1.

Multiple triggered Extras (and Replacements) with overlapping regions are resolved by the exact same
region-covering mechanism described above - `enabled` and "trigger evaluates true for the current
state" together determine whether an Extra is even a candidate block; the DP (or `force`'s
deterministic carve-out) takes it from there. No separate priority-ordering rule is needed for
nested/overlapping triggers (e.g. one Extra's trigger condition being a strict special case of
another's, both live for the same state): an `AlgorithmicPhase` case-table lookup that doesn't
structurally match the live state simply fails to produce a candidate at all, the same way any
normal case-lookup miss would - a candidate that can't produce a result just doesn't participate in
the comparison.

## MCC (move cost) scoring

Pluggable, not hardcoded:

```ts
interface MoveCostModel {
  cost(move: Move, context: { prevMove: Move | null; index: number }): number;
}
```

Context-aware (can weight a move differently depending on what preceded it - e.g. same-layer double
moves are cheap, opposite-hand transitions aren't) so that a real OH-aware model is expressible, not
just a flat per-move-type lookup table. A flat table (à la Trangium's BatchSolver ESQ format:
exact-move -> move-family -> turn-amount -> default fallback) is a trivial special case of this
interface, not a separate mechanism. Solver settings accept `moveCostModel?: MoveCostModel`,
defaulting to the library's built-in model - anyone can supply their own instead.

**Default model**: port of `reference/mcc.ts` (kept in the repo verbatim as the source of truth for
the port - do not treat it as scratch/throwaway). That file already decomposes cleanly into this
interface since every one of its penalties only ever looks at `(prevMove, curMove)`:

- Base cost per `MoveFamily`, separate tables for 2H and OH-left (OH-right mirrors via `R<->L`,
  `r<->l`; `M`/`E`/`S` are never mirrored, they're center-relative).
- A half-turn multiplier (`amount === 2`) on top of the base cost.
- 2H penalties: destabilization (opposite-hand-side move immediately following the other hand's
  side) and overwork (identical move family twice in a row, e.g. malformed `R R` instead of `R2`).
- OH penalty: grip-fatigue for same-finger-adjacent face pairs (`U-F`/`F-U` in the left-hand
  baseline).

Porting changes the _shape_ but preserves the _behavior_ of the reference, with two exceptions that
were deliberately decided (not left open) during the actual port:

- **Rotations get the half-turn multiplier.** The reference exempted `x`/`y`/`z` from it (`x2` cost
  the same as `x`); the port applies it uniformly (`x2` = `x` base times the multiplier). A 180
  rotation is genuinely more work than a 90, and dropping the special-case is simpler. Side effect:
  two identical rotations in a row (`x x`) now incur the same overwork penalty as any other repeated
  family, consistent with what that penalty is for.
- **Move direction is cost-neutral.** `isPrime` (`amount === 3`) affects no penalty - `R` and `R'`
  cost the same. A flat ergonomic model has no basis for a direction asymmetry, so `amount` matters
  only via the half-turn multiplier. Reserved for a future model if real data shows an asymmetry.

Three changes happen regardless of those two decisions:

1. Operates on the canonical `Move` type (see above), not raw strings - so the exact same model
   drives the IDA* search's live cost function, not just post-hoc scoring of a finished algset
   entry.
2. Drops the `console.warn`-and-skip path for unrecognized tokens - moot once `parseAlg` rejects
   invalid notation at the parse boundary instead.
3. `prevMove` context threads continuously across step/phase boundaries during a real solve (a
   solver is one continuous physical sequence of turns) - it is not reset to `null` at the start of
   each step. It resets to `null` only when scoring a single alg/segment in isolation via the
   `scoreAlg(moves, model)` helper (starts at `null`); the pipeline runner threads `prevMove` across
   phases itself for a real solve.

## Color neutrality

Setting: fixed color, some-neutrality subset, or full neutrality. Given "commit early": the solver
evaluates all applicable rotations through the _first_ core step only, picks the cheapest, and
solves the rest of the method normally from there. It does not keep multiple rotations alive through
the whole solve.

Implementation note: an orientation is a _free_ reframing, so it must not cost moves. The runner
realizes each candidate orientation `o` by conjugating the scramble (`o⁻¹ · scramble · o`) rather
than pre-rotating the state. Conjugation keeps the center permutation solved (so face-move phases
can still finish) and lets the unchanged canonical goals apply, while the move _families_ - and
therefore the MCC cost - reflect the held frame. The reported solution solves the cube held in
orientation `o`; `full` neutrality is the 24 orientations (BFS-generated). See `allOrientations()`.

## Solver settings: strategy selection, phase-chaining, and lookahead

Three related-but-distinct mechanisms, each independently configurable. Easy to conflate since
they're all "consider more than one candidate and pick the cheapest" - kept separate because they
operate at different scopes and get turned on/off for different reasons.

**Implementation status**: this full model is now implemented in the pipeline runner (the step-8
preparation pass, replacing the earlier `stepOverrides`-only predecessor). `stepOptions`
(`forceStrategy`/`enabledStrategies`/`phaseChaining`), `PhaseChainingOptions` (slack-based upstream
pooling via `searchMany`), `LookaheadOptions` (`depth`/`scope`, spanning both adjacent core-Step
pairs and algorithmic-phase pairs inside one Strategy), opt-in `ReplacementOptions`, the
region-covering DP for overlapping compete regions, force-mode carve-out + conflict validation, and
`MethodDefinition.recommendedSettings` layering are all live and covered by `method_test.ts`. APB
supplies only configuration on top.

**1. Strategy selection** (per Step, e.g. `stepOptions.block223`):

```ts
interface StepOptions {
  forceStrategy?: string; // pin to one Strategy id, e.g. "fbDfdb" - skips racing entirely
  enabledStrategies?: string[]; // omit to enable all registered Strategies for this Step
}
```

Solve mode (default): all enabled Strategies race, cheapest (lookahead- adjusted, see #3) MCC wins.
Pinned/demo mode: `forceStrategy` set, used for teaching tools that want "show me FB->DFDB
specifically." No soft bias mode - force/compete is the whole story, decided as sufficient for now.

**2. Phase-chaining** (per Step, e.g. `stepOptions.block223.phaseChaining`): governs Strategies
whose Phases are chained such that an upstream Phase (typically `SearchPhase`) can yield multiple
candidate branches, each with its own best continuation through the downstream Phase(s) - the
FB->DFDB "try multiple first-block solutions, keep the best FB+DFDB combo" behavior.

```ts
interface PhaseChainingOptions {
  enabled?: boolean; // default true wherever a Strategy's Phases support it
  slack?: number; // upstream candidate pool width. Default 2.
}
```

`slack`'s unit depends on the upstream engine. For a plain (heuristic-less) `SearchPhase` the pool
comes from `searchMany`, where `slack` is **extra moves** of that phase's optimum (a length bound).
For a pruning-table `SearchPhase` (`useAStar`), the pool comes from `searchAStarMany` - a best-first
A\* that keeps popping past the first goal - where `slack` is a **cost** window above the cheapest
solution (A\* pops in cost order, so a cost slack is the natural bound; an admissible heuristic
guarantees the length-slack DFS's intractable branching is avoided). Both are still "candidates
within `slack` of the optimum," just measured in the currency each engine orders by. An A\* upstream
phase feeding a pool must set a `poolStateKey` fine enough to keep distinct any solutions the
downstream phase reads differently (e.g. APB's `rouxFB` keys the pool by the FB region _plus_ the
DF/DB pair, since `dfdb` recognizes on DF/DB and only some FBs leave that pair in a case it
covers) - otherwise the coarse single-search key would collapse the pool to one candidate. See
`searchAStarMany` and `geometry.ts`'s `regionCoordinate`.

This pool is also what lets `rouxFB` search the full slice/wide move set despite `dfdb`'s
recognition only covering the DF/DB placements an outer-move FB reaches: the pool keeps whichever FB
`dfdb` can actually finish (cheapest), so it self-selects the cheap slice FBs dfdb covers and drops
the rest. It's a real (if slightly indirect) example of the mechanism - the pool doubles as a
"downstream-feasibility filter," not just a cost optimizer. The trade is FB-search time: `rouxFB`
now generates and downstream-checks a pool of 15-family candidates rather than one outer-move
solution (still sub-second). A future `dfdb` recognition rework (a goal-verifying lookup instead of
a plain signature match - the dfdb data is complete, so every FB's DF/DB _is_ solvable) would let
the single cheapest slice FB be used directly, without the pool doing the filtering, and faster;
deferred.

This is scoped to _inside one Strategy_, specifically to a `SearchPhase` feeding a downstream
Phase - it is a different mechanism from Lookahead (#3) even though both are "generate candidates,
jointly minimize," because the upstream candidates here come from a search (no fixed enumerable case
list, just many possible move sequences within some slack), which needs the slack-based branching
above rather than a stored `AlgVariant` list.

**Important refinement**: when a multi-phase Strategy's phases are _all_ `AlgorithmicPhase`s (each
with its own small enumerable case table and `AlgVariant` list - e.g. OCLL feeding PLL), the
relationship between them is Lookahead, not phase-chaining, even though it happens inside one
Strategy. Lookahead's `scope` can therefore reference not just core Step ids but any
algorithmic-phase id exposed by a Strategy/Replacement (e.g. `["ocll", "pll"]`), reusing the exact
same mechanism and data structures as step-to-step Lookahead. The dividing line is genuinely "does
the upstream side have a small enumerable set of `AlgVariant`s to choose among" (-> Lookahead), not
"is this inside one Strategy or between two Steps."

**3. Lookahead** (solve-global, not per-step, since it spans step and phase boundaries):

```ts
interface LookaheadOptions {
  depth: number; // how many Steps ahead to peek; 0 = disabled
  scope?: [fromStepId: string, toStepId: string][]; // restrict to specific
  // adjacent Step pairs; omitted = applies between every adjacent pair up
  // to `depth`. E.g. APB's own recommended default scopes this to
  // [["block223", "brPair"], ["eo", "lxs"]] rather than leaving it
  // fully general.
}
```

A `Method` can ship its own recommended defaults for all three of the above (e.g. APB defaulting
Lookahead on between `block223` and `brPair`, since the r/M final-move substitution in `fbDfdb`'s
DFDB `AlgVariant`s depends on it to do anything) - the solve caller's explicit settings always
override the Method's recommended defaults, which override the library's own defaults.

## Solver API shape

Async-first from v1, even though the initial implementation may just be synchronous-between-awaits
under the hood:

```ts
function solve(
  scramble: string,
  settings: SolverSettings,
  opts?: { signal?: AbortSignal; maxDepth?: number; timeBudgetMs?: number },
): Promise<SolveResult>;
```

This keeps the API browser-safe (cancellable, non-blocking) without a breaking change later when
real worker-based parallelism gets added.

## Rendering

The solver's internal result object stays rich always (step/strategy/phase identity, moves in
multiple forms, MCC cost, case id/attribution, AUF, alternatives considered and their costs,
cube-state snapshots per segment, color-neutrality decision, tags). A thin render layer picks a
subset/format on top of that - output format is not locked in yet and is cheap to change since it's
just a projection, not core solver logic.

## Reference materials

- `reference/mcc.ts` - the user's original MCC implementation. Source of truth for the
  `MoveCostModel` default port described above. Not wired into any package yet.

## Implementation roadmap

Rough build order, each step depending on the last:

1. `packages/cubing-core/src/notation.ts` - `Move` type, `parseAlg`, `formatMove`/`formatAlg`
   (SiGN-style, per Move representation above).
2. `packages/cubing-core/src/cube-state.ts` - cubie-level state (corner/edge permutation +
   orientation), move application, solved-state check, facelet projection for rendering.
3. `packages/cubing-core/src/move-cost.ts` - `MoveCostModel` interface +
   `createDefaultMoveCostModel`, ported from `reference/mcc.ts` per the MCC section above.
4. `packages/cubing-core/src/search.ts` - generic IDA*-style engine, parameterized by goal
   predicate + pruning table + `MoveCostModel`.
5. `packages/cubing-core/src/step.ts` - `Step`/`Strategy`/`Phase` (`SearchPhase`/`AlgorithmicPhase`)
   base types.
6. `packages/cubing-core/src/method.ts` - `Method` base class, Replacement (`compete`/`force`),
   Extra (+ checkpoints), settings schema, solver pipeline runner (async, `AbortSignal`, depth/time
   budget). Brought up to the full `stepOptions`/`PhaseChainingOptions`/`LookaheadOptions` model +
   region-covering DP in the step-8 preparation pass - see the Implementation status note in Solver
   settings above.
7. `packages/algsets` - `defineAlgSet` authoring helper + validation harness (derive each case's
   state signature from its alg at test time rather than hand-storing recognition data - see "Algset
   schema & authoring" above).
8. `packages/apb` - first real `Method` subclass: 2x2x3 (RouxFB+DFDB and DirectBlockbuilding
   strategies), BR Pair, EO, LXS, ZBLL, plus the BR-Pair+EO<->EOPair (compete) and ZBLL<->OCLL+PLL
   (force) replacements.

## Open questions (not yet resolved)

- **Recognition/Lookahead safety for real algset data** (see the flagged concern in "Algset schema &
  authoring"): confirm, per algorithmic Step, that its variants' actual relationship (exact-state /
  AUF-conjugation / permutation-only / region-masked) matches what that Step's goal predicate
  assumes, before treating Lookahead-driven variant selection as safe for it. Directly relevant to
  `dfdb`'s r/M substitution and any Lookahead scope touching `brPair`/`eo`/`lxs`. This is step 8
  work, not something to carry in as an assumption.
- Plain `/eo` isn't in the landed subpath-export list (`zbll`, `oll`, `pll`, `br-pair`, `eo-pair`,
  `dfdb`, `lxs`) - confirm whether that's a genuine gap or just missing from the list.
- Naming layer: subpath exports are kebab-case (`br-pair`), internal Step/Strategy ids are camelCase
  (`brPair`) - probably fine as different layers, not yet explicitly confirmed.
- No placeholder yet for the `oll` _Extra_ (distinct from the already-real `oll` data set, which the
  Extra should just reuse), `eo-back-slot`, or `lxs-back-slot` - expected, these postdate the steps
  1-7 pass, just need adding.
- Whether Lookahead should be able to peek across a dynamically-_chosen_ Replacement/Extra's
  boundary rather than only referencing concrete static ids (see the Overlapping regions section) -
  not required for correctness today, worth revisiting once more than one method's worth of real
  replacements exist to generalize from.

Resolved:

- Rotation half-turn multiplier and `isPrime` cost-neutrality - decided during the step 3 port
  (rotations get the multiplier, direction is cost-neutral); see the MCC section above.
- `algsets` subpath exports - set up once real case-sets landed (step 7 data import); see "Algset
  schema & authoring".
- ZBLL/PLL data split - stored as separate sets (ZBLL 472, PLL 21), not one folded 493-entry table;
  see "Algset schema & authoring".
- AUF storage - not a stored field; computed dynamically at solve time by `runPhase`, both pre and
  post; see "Algset schema & authoring".
- Strategy selection / phase-chaining / Lookahead settings model - the fuller three-mechanism
  version in "Solver settings" above is canonical, and the pipeline runner now implements it (plus
  the region-covering DP, opt-in Replacements/Extras, and `recommendedSettings` layering), verified
  by `method_test.ts`. Done in the step-8 preparation pass.
