# APB method spec

Living, step-by-step spec for `@moishy/apb`, written up incrementally as each Step of the method
gets discussed. Assumes the mechanisms in the root `/DESIGN.md` (Step/Strategy/Phase, Replacements,
Extras, MCC, strategy selection/phase-chaining/lookahead) as given - this doc only covers what's
specific to APB itself. Read `/DESIGN.md` first.

Background: https://apbmethod.net and https://cubinghistory.com/3x3/Methods/APB

## Method overview

Core Steps, in order: `block223` (2x2x3) -> `brPair` (BR Pair) -> `eo` (EO) -> `lxs` (LXS) -> `zbll`
(ZBLL). Details on `brPair` onward TBD in later sections of this doc.

All block-building for `block223` targets the cube's bottom-left, fixed, with no whole-cube
rotations - color neutrality is handled once, upstream of this Step, by the solver's commit-early
rotation selection (see `/DESIGN.md`'s Color neutrality section), not by anything inside this Step.

**Center frame (implementation note).** The whole method assumes a fixed center frame: since it uses
no whole-cube rotations, a real solution must end with the centers home. Wide/slice moves permute
centers, so nothing inside a piece-index goal forbids a "solved by slot but color-wrong" block after
an M-slice alg - this was a real bug (the frame silently drifted through the middle steps and only
surfaced at ZBLL's fixed-frame recognition and the final solved-check). The fix keeps the frame
intact two ways: (1) the region goal predicates (`geometry.ts` `regionSolved`/`regionSolvedAndEO`)
require the centers home, so every algorithmic step picks a center-neutral variant among its
interchangeable algs (every core APB set carries one per case); and (2) block-building search runs
the full slice/wide move set but its `cn`-identity goal plus a **center-aware** pruning table
(`pruning.ts` tracks the 24 center orientations alongside the pieces) only accept a
net-center-neutral block, so any slice/wide use must restore the frame. Two more levers keep that
15-family search fast: `axisCanonical` (`geometry.ts`) collapses the redundant orderings of
commuting same-axis moves, and a region-coordinate `stateKey` merges A\* states that differ only in
off-region pieces (both are cost-safe — see their docs).

**`fbDfdb` + slice FBs (implementation note).** `rouxFB` uses the full slice/wide move set too, even
though the `dfdb` algset that follows only recognizes the DF/DB pair in the slots an _outer_-move FB
reaches (its signature lookup can't place DF/DB in, e.g., DR). This works because `rouxFB` feeds a
phase-chaining **pool** keyed by the FB region _plus_ the DF/DB pair: the runner keeps whichever FB
candidate `dfdb` can actually finish, cheapest, so the pool self-selects the cheap slice FBs dfdb
covers and drops the ones it can't (verified: 30/30 solved; ~8% cheaper FBs than outer-only, at a
higher but still sub-second FB-search cost). The dfdb data itself is _complete_ — every FB's DF/DB
is solvable by some case+AUF — so a future dfdb recognition rework (a goal-verifying lookup rather
than a plain signature match) could let the single cheapest slice FB be used directly, without
leaning on the pool to filter, and faster. Deferred; see DESIGN "Phase-chaining". The pure-search
strategies build the whole block by search (no mid-block algset), so they use the full move set
unconditionally.

## Step: `block223` (2x2x3)

Goal: a 2x2x3 block (2 corners + 5 edges) solved at bottom-left - Roux's "first block" footprint
extended by the DF/DB edges. Every Strategy below targets this exact placement; none of them use
`x`/`y`/`z` rotations (`M`, `E`, `S` slice moves and wide moves are used - they don't require
re-gripping the cube's reference frame the way a rotation does; see the Center frame note above for
how the fixed frame is preserved, and the one exception for `fbDfdb`'s `rouxFB`). Search Phases for
this Step restrict their move generator to exclude rotations entirely, both because they're
disallowed by convention here and because it shrinks the search space significantly.

Judged by MCC throughout, not raw move count - a short but ergonomically rough solution should not
automatically beat a longer, smoother one. This is the whole reason MCC exists rather than plain
movecount; nothing extra needed here beyond using it consistently.

### Strategies

**`direct`** - `[SearchPhase(full 2x2x3, no algs)]`. The "machine" approach: pure search straight to
a solved 2x2x3. Needs a precomputed pruning table (7-piece pattern database - 2 corners + 5 edges,
permutation + orientation) to be practical; a naive unpruned search at this piece count is too slow
to run per-solve. Table generation is a build-time/offline concern, not something computed live.

**`fbDfdb`** - `[SearchPhase(rouxFB), AlgorithmicPhase(dfdb)]`.

- `rouxFB`: search for Roux's first block (2 corners + 3 edges: the bottom-left 1x2x3 slab).
  Phase-chaining applies here by default (see `/DESIGN.md`) - generate multiple FB candidates within
  `slack` moves of optimal, and jointly minimize FB-cost + DFDB-cost across all of them, rather than
  committing to the single cheapest FB first. This is the reason phase-chaining exists as a concept
  at all; this Strategy is the reference case for it.
- `dfdb`: 527-case algset (user-authored, see `/DESIGN.md`'s Algset schema section for the data
  schema this should follow). Case lookup is a direct state-signature match on the DF/DB pieces
  given the incoming FB state. Pre-AUF applies here like every other algorithmic step in this
  method - the 527 is already the U-rotation-normalized count, not 4x that.
- **r/M substitution**: DFDB algs that resolve via the M slice can legitimately end in either an `r`
  or an `M` move (both solve DF/DB identically; they differ in what they do to the right layer,
  which matters for the next Step, `brPair`). Wherever this substitution is valid for a case, the
  algset should store **both** forms as separate `AlgVariant`s rather than picking one - the
  solver's Lookahead mechanism (not a new mechanism, see `/DESIGN.md`) is what actually chooses
  between them, by comparing the resulting `brPair` case's MCC for each. This only works if
  Lookahead is active between `block223` and `brPair` - see Recommended defaults below.

**`cornerFirst`** - two named variants, `cornerFirstFront` and `cornerFirstBack`, each
`[SearchPhase(2x2x2 variant), SearchPhase(remaining 3 pieces)]`:

- `cornerFirstFront`: 2x2x2 on `DFL, DL, DF, FL`, then the remaining `DBL, DB, BL`.
- `cornerFirstBack`: 2x2x2 on `DBL, DB, BL, DL`, then the remaining `DFL, DF, FL`.
- Phase-chaining applies between the two Phases in both variants, same reasoning as `fbDfdb`.

**`cross1`** -
`[SearchPhase(3-edge cross: DF, DB, DL), SearchPhase(both F2L pairs: DFL+FL, DBL+BL)]`.
Phase-chaining applies here too, for consistency with the other multi-phase Strategies, even though
this Strategy is rarely the winner - per your description, it's usually far from optimal but
occasionally the clear best for a specific scramble. (Implementation: it is registered but
**disabled by default** - see the Recommended defaults note below on why the pure-search strategies
are opt-in.)

### Settings

Uses the general per-step `StepOptions` shape from `/DESIGN.md` under `stepOptions.block223` -
`forceStrategy` (one of `direct`, `fbDfdb`, `cornerFirstFront`, `cornerFirstBack`, `cross1`),
`enabledStrategies`, and `phaseChaining` (`enabled`, `slack`) for the multi-phase Strategies above.

### Recommended defaults (this Method's own settings, overridable by the caller)

- Lookahead into `brPair` enabled - see the method-wide Recommended lookahead defaults section at
  the end of this doc for the full chain.
- Dual-CN color neutrality (8 orientations) enabled - the runner races each through `block223` and
  commits to the cheapest first block (see `/DESIGN.md` Color neutrality; the search is fast enough
  to make racing all 8 cheap).
- **Only `fbDfdb` enabled by default; `direct`/`cornerFirstFront`/`cornerFirstBack`/`cross1` are
  registered but opt-in** (`enabledStrategies`/`forceStrategy`). Originally all five were meant to
  race, but `fbDfdb` is a search→_alg_ chain whose phase-chaining pool races cheaply, whereas the
  pure-search strategies are search→_search_ chains that re-run a second block search per pooled
  first-phase candidate - much slower to race for a block that is rarely cheaper. Revisit if that
  search→search chaining is sped up (e.g. a bounded pool or a lighter second-phase heuristic).

### Open / left to implementation

- Exact default `phaseChaining.slack` value - starting guess of 2 in `/DESIGN.md`, tune once real
  solves can be benchmarked.
- Pruning table size/generation strategy for `direct`'s full-2x2x3 search - implementation detail,
  not a design decision blocking anything else.

## Step: `brPair` (BR Pair)

Goal: solve the BR edge + DBR corner (the back-right F2L pair) - the last piece needed before edge
orientation, since after `block223` + `brPair` every D-layer and E-layer piece is placed (only the 6
U-layer edges and all 4 U-layer corners remain, plus LL-corner permutation/orientation, all handled
by later Steps).

One Strategy, one Phase: `[AlgorithmicPhase(brPair, ~90 cases)]`. No search Phase - this is a pure
recognize-then-execute step, same as every remaining Step in the method. Case recognition is a
direct state-signature match (see `/DESIGN.md`'s Algset schema section), with pre-AUF applying as it
does to every algorithmic step in this method - the ~90 is already the U-rotation-normalized count.

Multiple `AlgVariant`s per case are expected and should all be stored - Lookahead (`brPair -> eo`)
is what picks among them, per case, by whichever resulting EO case scores cheaper. No phase-chaining
here (single Phase, nothing to chain).

## Step: `eo` (EO)

Goal: orient the 6 remaining edges (`UF, UL, UB, UR, FR, DR`) without necessarily placing them
correctly - permutation of these pieces (and of the 4 U-layer corners) is left to `lxs`/`zbll`.
Standard ZZ-style EO, scoped to the 6 edges left unsolved after `block223` + `brPair`.

One Strategy, one Phase: `[AlgorithmicPhase(eo, 11 cases)]`. Same shape as `brPair`: direct
state-signature recognition with pre-AUF (11 is already the U-rotation-normalized count), multiple
`AlgVariant`s per case, Lookahead (`eo -> lxs`) picks among them.

## Step: `lxs` (LXS)

Goal: solve the last F2L pair (`DFR` corner + `FR` edge) and correctly place the last cross-style
edge (`DR`) together, in one combined algorithmic step

- everything going in is already edge-oriented from `eo`, so this is a permutation-focused case set
  rather than needing to fix orientation too.

One Strategy, one Phase: `[AlgorithmicPhase(lxs, 116 cases)]`. Same shape again: direct
state-signature recognition with pre-AUF (116 already U-rotation-normalized), multiple `AlgVariant`s
per case, Lookahead (`lxs -> zbll`) picks among them when active.

## Step: `zbll` (ZBLL)

Goal: solve the entire last layer (corner permutation + orientation, edge permutation - edges are
already oriented from `eo`) in a single alg. 472 cases in the `zbll` set itself; the 21 cases where
corners are already solved are **not** duplicated inside it - they're the separate `pll` set (the
same one `ocllPll`/`collEpll` compose), so 472+21=493 total reachable outcomes, stored as two sets
rather than one folded table. The `zbll` `AlgorithmicPhase` needs to fall through to `pll` for that
degenerate case rather than expecting its own table to cover it.

One Strategy, one Phase: `[AlgorithmicPhase(zbll, 472 cases)]` (falling through to the `pll` set for
the corners-already-solved case, per above). This is the terminal Step - there is no next Step to
look ahead into, so Lookahead doesn't apply here regardless of settings (nothing downstream to
compare against). Pre-AUF applies here exactly as it does everywhere else, computed dynamically like
every other algorithmic step (per `/DESIGN.md`'s Algset schema & authoring section - AUF isn't
stored data anywhere in this project). This is, however, the first (and only) Step in APB where
**post**-AUF is meaningful - every earlier Step's residual U-misalignment just gets absorbed by the
next Step's own pre-AUF, but there's nothing after `zbll` to absorb it, so the solve's final move
may itself need to be an explicit U turn to leave the cube actually, visually solved. Multiple
`AlgVariant`s per case still matter for MCC/OH scoring even without Lookahead to drive selection.

**Recognition here must be post-AUF-invariant, and algs must end in the fixed frame (implementation
note).** Because post-AUF is meaningful only at `zbll`, so is its consequence for _recognition_. The
472+21 stored cases are complete only up to _both_ pre- and post-AUF; a live last-layer state
generally differs from the canonical form a case's `algs[0]` solves _exactly_ by that post-AUF. A
plain pre-AUF-only lookup (as the middle steps use, safe because their residual AUF is absorbed
downstream) recognizes only ~1/4 of last-layer states here. So `zbll`/`pll` use `geometry.ts`
`aufInvariantLookup`, which indexes each case under its whole two-sided U-coset (`Uᵃ·s·Uᵇ`).

Two data realities are handled at this boundary rather than deferred, since both otherwise leave
real last-layer states unsolvable in the fixed frame:

- **Tilted primaries.** A couple of imported primaries end with a net whole-cube rotation (an
  unbalanced `y`) — fine for a speedsolver holding the cube rotated, but they'd leave centers off in
  APB's center-tracked solve. `aufInvariantLookup` puts every variant into the fixed frame
  (`stripRotations`) and derives recognition from the de-rotated primary. This is the
  alt-normalization `/DESIGN.md` flags as the general concern, applied where it's load-bearing.
- **A corrupt import.** The `pll` set's F-perm primary was an OLL alg (it disturbed the D-layer and
  edge orientation), which — because recognition derives from `algs[0]` — silently made the whole
  F-perm orbit (19 states) unrecognizable. Fixed in the `pll` data; a new `pll` test asserts every
  primary is a genuine last-layer permutation.

With these, ZBLL is complete: an APB test enumerates all 7775 EO-solved last-layer states and solves
every one.

## Recommended lookahead defaults (method-wide)

APB's `Method` subclass should ship Lookahead enabled by default, depth 1, scoped to every adjacent
Core Step pair that has a downstream Step to peek into:

```ts
scope: [
  ["block223", "brPair"],
  ["brPair", "eo"],
  ["eo", "lxs"],
  ["lxs", "zbll"],
],
```

(`zbll` is terminal, so it never appears as a `from`.) The solve caller can narrow, widen, deepen,
or disable this via their own settings, same as any other Method-recommended default per
`/DESIGN.md`.

## Replacements

### `ocllPll` - region `[zbll]`, mode `force`

`[AlgorithmicPhase(ocll, 7 cases), AlgorithmicPhase(pll, 21 cases)]`. OCLL orients last-layer
corners only (edges are already oriented from `eo`) - a subset of the general OLL case space,
restricted to the already-EO'd subcase. PLL then permutes everything. Lookahead applies between
`ocll` and `pll` (see `/DESIGN.md`'s refined Lookahead scope note - both phases are algorithmic, so
this is genuine Lookahead, not phase-chaining): choose the OCLL `AlgVariant` that sets up the
cheaper PLL case. Default: registered but **disabled**, like every Replacement in this project -
opt-in only, regardless of how it'd fare in a `compete`. Mode defaults to `force` since there's no
real reason to offer `compete` for a curriculum-motivated alternative, but that's still
caller-overridable like anything else.

### `collEpll` - region `[zbll]`, mode `force`

`[AlgorithmicPhase(coll, 42 cases), AlgorithmicPhase(epll)]`. COLL both orients and permutes
corners; EPLL then only permutes edges. **`epll` is not a separate algset** - it's the same `pll`
data already authored for `ocllPll` above, filtered to the cases where corners are already solved (a
small subset of those 21). No Lookahead needed past COLL, since EPLL's case is fully determined by
COLL's ending state, not chosen among alternatives the way OCLL/PLL's relationship works (COLL
already commits to one specific corner permutation+orientation, unlike OCLL which only fixes
orientation and leaves permutation choice-relevant downstream). Default: registered, **disabled**,
same as every Replacement. Since both `ocllPll` and `collEpll` target the same region in `force`
mode, at most one may be enabled at a time (see `/DESIGN.md`'s Overlapping regions note) - this
should be a settings-validation error if both are enabled simultaneously.

### `eoPair` - region `[brPair, eo]`, mode `compete`

`[SearchPhase(formPair), AlgorithmicPhase(eoPairInsert, 128 cases)]`. `formPair` searches for the BR
edge + DBR corner forming a pair anywhere (U or R layer, any orientation) - kept as a search rather
than an algset (your call, per our discussion): it's a short sub-problem, and going algorithmic
would mean authoring cases for every starting position _and_ orientation of two unpaired pieces, a
much larger and more error-prone surface than the 128 insertion cases. Phase-chaining applies
between `formPair` and `eoPairInsert` (search feeding an algorithmic phase - the standard case).

**Two implementation notes (both were real bugs):** (1) `formPair`'s goal must keep the 2x2x3 solved
_and_ leave the pair in a position `eoPairInsert` recognizes - not just "join the pair fastest." A
search that only forms the pair will happily use a slice that wrecks the block/centers; the goal
therefore requires `regionSolved(BLOCK223)` (a slice used to form the pair has to be undone) plus
recognizability up to pre-AUF. It runs outer-faces-only via A\* guided by a BR-pair pruning table -
fast, and forming the pair while preserving the block is inherently an R/U-area manipulation. (2)
`eoPairInsert` recognizes on the BR pair location+orientation **and the EO pattern** together, not
the pair alone: each case inserts the pair _and_ orients edges, so the same pair position under a
different EO state needs a different alg. The pair-only signature collides badly (only ~12% of cases
distinguishable); pair+EO is collision-free (504/504 self-recognition).

`eoPairInsert`'s 128 cases split into four subsets: misoriented-R, misoriented-U, oriented-R,
oriented-U. Two cases are explicitly out of scope for those 128 and handled separately:

- If the pair is already sitting solved-in-place, this degenerates to standard EO - but **this is a
  separate, dedicated 11-case subset authored as part of `eoPair`'s own data, not a pointer to the
  plain `eo` algset**. Same abstract problem, independently authored data - do not have
  `eoPairInsert`'s dispatch logic fall through to the `eo` algset for this case.
- The case where the front-right pair (rather than BR) is already formed and oriented is handled by
  its own Extra, `backSlotEoLxs` - see Extras below.

Recommended default: registered, **disabled**, same as every Replacement - also consistent with your
own assessment that this historically shows barely any gain for its algorithm count.

### `eodrLs` - region `[eo, lxs]`, mode `compete`

`[AlgorithmicPhase(eodr), AlgorithmicPhase(ls)]`. `eodr` orients all 6 remaining edges _and_ places
`DR`, at the cost of a larger case count than plain `eo` (exact count TBD - pending your algset).
`ls` then only needs the last F2L pair (`DFR`+`FR`), a smaller case count than `lxs` since `DR` is
already handled. Lookahead applies between `eodr` and `ls`, same reasoning as `ocllPll` - both
algorithmic. Recommended default: registered, **disabled**, same as every Replacement - `compete`
mode as the default so it actually gets raced once someone opts in, since unlike `eoPair` this
sounds like a genuine live tradeoff worth evaluating per-scramble.

Since `eoPair`'s region (`[brPair, eo]`) and `eodrLs`'s region (`[eo, lxs]`) overlap at `eo`, having
both enabled invokes the region-covering DP from `/DESIGN.md` rather than a simple independent
race - correct, not just tolerable, per that section.

### Settings recap

All four replacements surface through the general
`replacements: { [replacementId]: { enabled, mode } }` settings shape from `/DESIGN.md`. Every one
defaults to `enabled: false` - opt-in only, no exceptions, regardless of how good or
historically-marginal an idea it is. `mode` defaults per-replacement as noted above but is always
caller-overridable.

## Extras

Extras use the same `region` + `{enabled, mode}` shape as Replacements, plus a `trigger` (see
`/DESIGN.md`'s Extras section for the two trigger kinds). Same opt-in-only default.

### `zbls` - region `[eo, lxs]`, boundary trigger, mode `force`

`[AlgorithmicPhase(zbls, ~300 cases)]`, straight from ZB. Trigger: evaluated at the start of `eo` -
is `DR` already solved (from whatever `brPair` left behind)? If so, EO and the last F2L pair
collapse into one alg, landing directly at `zbll`-ready. Default: registered, **disabled**, mode
`force` - once the trigger's true there's no reason to still race the normal `eo`+`lxs` path.

### `oll` - region `[eo, lxs, zbll]`, boundary trigger, mode `force`

`[AlgorithmicPhase(oll, count TBD - pending your algset), AlgorithmicPhase(pll)]`. `pll` here is the
same 21-case data already used by `ocllPll` - no new authoring needed for that half. `oll` (full
OLL, not assuming pre-oriented edges the way `ocllPll`'s OCLL subset does - `eo` hasn't run in this
branch) is a new algset. Trigger: evaluated at the same boundary as `zbls` (start of `eo`) - is the
_entire_ F2L already solved? Strictly rarer than `zbls`'s condition (whole-F2L-solved implies
DR-solved too), so both triggers can be true simultaneously - no explicit priority rule needed for
this though (see `/DESIGN.md`'s Extras section): `zbls`'s ~300-case table fundamentally represents
"pair not yet solved, EO not yet done" patterns, so a state where the whole F2L is _already_ solved
simply won't structurally match any real `zbls` case - it drops out as a non-candidate on its own,
`oll`+`pll` wins by default in that scenario without needing to be told to. Default: registered,
**disabled**, mode `force`.

### `winterSummerVariation` - region effectively `[lxs, zbll]`, checkpoint trigger, mode `force`

Checkpoint-based, not boundary-based - the relevant `lxs` `AlgVariant`s need a `checkpoint` declared
right before their final ~3-move insert (per `/DESIGN.md`'s Algset schema `checkpoints` field). If
the state at that checkpoint matches a WV/SV case, splice in
`[the WV/SV finishing alg,
AlgorithmicPhase(pll)]` instead of finishing the original `lxs` alg and
continuing to `zbll` - `pll` reused again, third time now. WV/SV's own algset (case count TBD,
pending yours) only needs entries for the finishing portion, not the pairing portion that precedes
the checkpoint. Default: registered, **disabled**, mode `force`.

### `backSlotEoLxs` - region `[brPair, eo, lxs]`, boundary trigger, mode `force`

`[SearchPhase(insertFrontRightPair), AlgorithmicPhase(eoBackSlot, 11 cases), AlgorithmicPhase(lxsBackSlot, 116 cases)]`.
Trigger: evaluated at the start of `brPair` (right after `block223`) - is the front-right pair
already formed and oriented (mirroring `eoPair`'s "pair formed somewhere" idea, but for the _other_
slot, and only detecting it rather than searching to form it)? If so, insert that pair first (short
search, same reasoning as `eoPair`'s `formPair`), then solve EO and the last slot from the back (BR)
side instead of the front.

`eoBackSlot` and `lxsBackSlot` are their own dedicated algsets - **not** derived from or pointing at
plain `eo`/`lxs`, matching how you corrected the `eoPair` degenerate case above; I won't assume a
mirror-transform derivation here either unless you want to explore that as a separate
authoring-effort question later. Lookahead between `eoBackSlot` and `lxsBackSlot` uses the same
mechanism as `eo -> lxs` - just add `["eoBackSlot", "lxsBackSlot"]` as its own static Lookahead
scope entry (it's a fixed, known id pair, just conditionally reached - no need for the
dynamic-boundary generalization `/DESIGN.md` deferred). Default: registered, **disabled**, mode
`force` - per your own note, not worth it for most solvers, included for completeness.
