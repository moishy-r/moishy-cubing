# Design spec

Living record of the architecture decisions behind this project. Update this
alongside the code - it's the source of truth for "why does it work this way,"
not the chat history that produced it.

## Packages

- `@moishy/cubing-core` - cube engine, base classes, generic search, MCC
  scoring, solver pipeline runner. No algorithm data, no method-specific logic.
- `@moishy/algsets` - algorithm case data only, authored as typed TS modules.
  No solving logic.
- `@moishy/apb` - the APB method plugin. Reference implementation for "how to
  add a new method" - copy this package's shape for `@moishy/cfop`,
  `@moishy/roux`, etc.

Deno workspace, one repo. Each package publishes independently to JSR
(native) and npm (via `dnt`, see `scripts/build_npm.ts`), triggered by
pushing a tag `<package-dir>-v<version>` (see `.github/workflows/release.yml`).
Versions are NOT kept in lockstep across packages - `algsets` will move much
faster than `cubing-core`.

## Cube representation

Cubie-level state: permutation + orientation vectors for corners/edges (and
centers if a future method needs them, e.g. for tracking mid-solve
reduction). Facelet/sticker arrays are derived only when something needs to
render a picture - they are a view, not the source of truth.

A single generic IDA*-style search engine lives in `cubing-core`, parameterized
per use by a goal predicate and a pruning table. Search phases (see below)
configure this engine rather than each strategy hand-rolling its own search.

## Move representation

One canonical `Move` type, shared by move application (permutation
composition) and cost scoring (MCC) - not two parallel representations that
can drift:

```ts
type MoveFamily =
  | "R" | "L" | "U" | "D" | "F" | "B" // outer face turns
  | "M" | "E" | "S"                    // slice turns
  | "r" | "l" | "u" | "d" | "f" | "b"  // wide turns (SiGN-style single letter, not WCA "Rw")
  | "x" | "y" | "z";                   // rotations

interface Move {
  family: MoveFamily;
  amount: 1 | 2 | 3; // 1 = single CW quarter turn, 2 = double/180, 3 = single CCW quarter turn (prime)
}
```

`isDouble`/`isPrime` are derived (`amount === 2` / `amount === 3`), not
stored separately. A `parseAlg(input: string): Move[]` in `cubing-core`
tokenizes a move string into this type (SiGN-style wide-move convention,
matching the project's existing `reference/mcc.ts`), throwing on invalid
tokens at the parse boundary - nothing downstream (search, cost scoring)
needs to defensively handle malformed input, since by the time a `Move[]`
exists it's already valid. A `formatMove`/`formatAlg` pair goes the other
direction, for rendering.

## Step -> Strategy -> Phase

The composition model for "how a method is wired up":

- **Step** - a named slot in a method's step list, e.g. `2x2x3`, `ZBLL`. What
  shows up in the method's step sequence; what Replacements/Extras reference.
- **Strategy** - one way to solve a Step, e.g. `RouxFB+DFDB` vs
  `DirectBlockbuilding` for `2x2x3`. A Step can register multiple Strategies;
  the solver runs all enabled ones and keeps the best by (lookahead-adjusted)
  MCC, unless a Strategy is pinned (see Strategy pinning below).
- **Phase** - the atomic unit inside a Strategy: `SearchPhase` (generic
  search engine + goal predicate + pruning table, no algs) or
  `AlgorithmicPhase` (case lookup + alg + AUF handling). A Strategy is just an
  ordered list of Phases. `RouxFB+DFDB` = `[SearchPhase(Roux FB),
  AlgorithmicPhase(DF/DB pair)]`. `DirectBlockbuilding` =
  `[SearchPhase(full 2x2x3)]`.

`Search` vs `Algorithmic` lives at the Phase level, which is what lets one
Step blend both approaches.

## Replacements

A Replacement is an alternative set of Strategies registered against a
contiguous range of the method's core steps (its `region`), not a distinct
kind of Step. Two selection modes, set by the method author but overridable
per-solve in settings:

- `"compete"` - the Replacement's Strategies are merged into the same
  candidate pool as the region's original Strategies and raced by MCC; the
  cheaper one wins. Use this when the alternative is a genuine performance
  question (e.g. `BR Pair+EO` vs `EOPair`).
- `"force"` - the Replacement's Strategies entirely replace the region's pool
  when enabled, no comparison. Use this when the alternative exists for a
  knowledge/curriculum reason, not a speed one (e.g. `ZBLL` -> `OCLL+PLL` for
  someone who doesn't know full ZBLL - ZBLL will ~always look cheaper by MCC,
  so racing it would defeat the point).

v1 constraint: Replacements are defined against the base Method's core-step
sequence only - no replacement-of-a-replacement. Revisit if a real method
needs that nesting.

## Extras

Registered against a trigger predicate `(state, ctx) => boolean`, evaluated
at step boundaries by default. Some Extras (e.g. Winter/Summer Variation)
need to fire *mid-alg*, not just between steps - for those, the relevant
`AlgorithmicPhase` case data can declare `checkpoints` (named split points in
the move sequence). The engine runs up to a checkpoint, evaluates any Extras
scoped to that checkpoint's label against current state, and either splices
in the Extra's own continuation or proceeds with the original alg. Cases with
no checkpoints just run straight through - this costs nothing for the common
case. Mid-search (as opposed to mid-alg) Extra triggers are out of scope for
v1.

## MCC (move cost) scoring

Pluggable, not hardcoded:

```ts
interface MoveCostModel {
  cost(move: Move, context: { prevMove: Move | null; index: number }): number;
}
```

Context-aware (can weight a move differently depending on what preceded it -
e.g. same-layer double moves are cheap, opposite-hand transitions aren't) so
that a real OH-aware model is expressible, not just a flat per-move-type
lookup table. A flat table (à la Trangium's BatchSolver ESQ format:
exact-move -> move-family -> turn-amount -> default fallback) is a trivial
special case of this interface, not a separate mechanism. Solver settings
accept `moveCostModel?: MoveCostModel`, defaulting to the library's built-in
model - anyone can supply their own instead.

**Default model**: port of `reference/mcc.ts` (kept in the repo verbatim as
the source of truth for the port - do not treat it as scratch/throwaway).
That file already decomposes cleanly into this interface since every one of
its penalties only ever looks at `(prevMove, curMove)`:

- Base cost per `MoveFamily`, separate tables for 2H and OH-left (OH-right
  mirrors via `R<->L`, `r<->l`; `M`/`E`/`S` are never mirrored, they're
  center-relative).
- A half-turn multiplier (`amount === 2`) on top of the base cost.
- 2H penalties: destabilization (opposite-hand-side move immediately
  following the other hand's side) and overwork (identical move family
  twice in a row, e.g. malformed `R R` instead of `R2`).
- OH penalty: grip-fatigue for same-finger-adjacent face pairs (`U-F`/`F-U`
  in the left-hand baseline).

Porting changes the *shape* but should preserve the *behavior* exactly
unless corrected - see open questions below. The two changes that are
happening regardless of those answers:
1. Operates on the canonical `Move` type (see above), not raw strings - so
   the exact same model drives the IDA* search's live cost function, not
   just post-hoc scoring of a finished algset entry.
2. Drops the `console.warn`-and-skip path for unrecognized tokens - moot
   once `parseAlg` rejects invalid notation at the parse boundary instead.
3. `prevMove` context threads continuously across step/phase boundaries
   during a real solve (a solver is one continuous physical sequence of
   turns) - it is not reset to `null` at the start of each step. It resets
   to `null` only when scoring a single alg/segment in isolation (e.g. an
   algset entry on its own, out of solve context).

## Color neutrality

Setting: fixed color, some-neutrality subset, or full neutrality. Given
"commit early": the solver evaluates all applicable rotations through the
*first* core step only, picks the cheapest, and solves the rest of the
method normally from there. It does not keep multiple rotations alive
through the whole solve.

## Strategy pinning (solve mode vs. demo mode)

Two usage modes, same underlying mechanism:

- **Solve mode** (default) - all enabled Strategies for a Step race, cheapest
  wins.
- **Pinned/demo mode** - settings carry
  `stepOverrides: { [stepId]: { forceStrategy: StrategyId } }`, which skips
  racing for that Step and runs only the named Strategy. This is what an
  example-generator/teaching tool would use (e.g. "show me FB->DFDB
  specifically, not DirectBlockbuilding").

## Solver API shape

Async-first from v1, even though the initial implementation may just be
synchronous-between-awaits under the hood:

```ts
function solve(
  scramble: string,
  settings: SolverSettings,
  opts?: { signal?: AbortSignal; maxDepth?: number; timeBudgetMs?: number },
): Promise<SolveResult>;
```

This keeps the API browser-safe (cancellable, non-blocking) without a
breaking change later when real worker-based parallelism gets added.

## Rendering

The solver's internal result object stays rich always (step/strategy/phase
identity, moves in multiple forms, MCC cost, case id/attribution, AUF,
alternatives considered and their costs, cube-state snapshots per segment,
color-neutrality decision, tags). A thin render layer picks a
subset/format on top of that - output format is not locked in yet and is
cheap to change since it's just a projection, not core solver logic.

## Reference materials

- `reference/mcc.ts` - the user's original MCC implementation. Source of
  truth for the `MoveCostModel` default port described above. Not wired into
  any package yet.

## Implementation roadmap

Rough build order, each step depending on the last:

1. `packages/cubing-core/src/notation.ts` - `Move` type, `parseAlg`,
   `formatMove`/`formatAlg` (SiGN-style, per Move representation above).
2. `packages/cubing-core/src/cube-state.ts` - cubie-level state (corner/edge
   permutation + orientation), move application, solved-state check, facelet
   projection for rendering.
3. `packages/cubing-core/src/move-cost.ts` - `MoveCostModel` interface +
   `createDefaultMoveCostModel`, ported from `reference/mcc.ts` per the MCC
   section above.
4. `packages/cubing-core/src/search.ts` - generic IDA*-style engine,
   parameterized by goal predicate + pruning table + `MoveCostModel`.
5. `packages/cubing-core/src/step.ts` - `Step`/`Strategy`/`Phase`
   (`SearchPhase`/`AlgorithmicPhase`) base types.
6. `packages/cubing-core/src/method.ts` - `Method` base class, Replacement
   (`compete`/`force`), Extra (+ checkpoints), settings schema, solver
   pipeline runner (async, `AbortSignal`, depth/time budget).
7. `packages/algsets` - `defineAlgSet` authoring helper + validation harness
   (derive each case's state signature from its alg at test time rather than
   hand-storing recognition data - see algset schema discussion in chat/PR
   history if not yet copied in here).
8. `packages/apb` - first real `Method` subclass: 2x2x3 (RouxFB+DFDB and
   DirectBlockbuilding strategies), BR Pair, EO, LXS, ZBLL, plus the
   BR-Pair+EO<->EOPair (compete) and ZBLL<->OCLL+PLL (force) replacements.

## Open questions (not yet resolved)

- `reference/mcc.ts`: are the rotation base costs (`x`/`y`/`z`) intentionally
  exempt from the half-turn multiplier (i.e. `x2` costs the same as `x`), or
  is that a gap to fix during the port? Preserve as-is until answered.
- `reference/mcc.ts`: `isPrime` is parsed but never affects any penalty -
  intentional (a prime costs the same as its non-prime counterpart), or
  reserved for a future asymmetry? Preserve as-is until answered.
- Whether `algsets` subpath exports (`@moishy/algsets/zbll`, etc.) get set up
  now or once real case-sets exist (leaning: once they exist).
