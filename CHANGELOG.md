# Changelog

All four packages version independently but are released together when a change spans them, so this
is one file. Each entry lists the versions it shipped as.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semver](https://semver.org/) — on a `0.x` line, a **minor** bump is the breaking one.

## Unreleased

### Added

- **`@moishy/steps@0.4.0`: F2L is one Step whose strategies are the pair orders, searched
  exhaustively.** `f2lOrderedStep` replaces the four numbered Steps with a single `f2l` Step racing
  **one strategy per pair order** — 24 of them — plus a greedy any-order strategy as a safety net.
  Each order is a real, fully executed phase chain, so the runner's ordinary strategy race compares
  actual threaded MCC rather than an estimate.

  Four Steps modelled F2L as four decisions, each committed before the next was looked at. Once the
  orders are searched exhaustively that structure does not exist: there is one decision, the order,
  taken once. Expressing it as four Steps and bolting the search on as a `compete` Replacement made
  the runner solve every scramble _twice_ to compare the real model against the vestigial one —
  5m01s -> 8m22s on this repo's suite for no change in result.

  This is the thing the lookahead note further down says cannot be done with `lookahead.depth`:
  `peekCost` returns an optimistic _minimum_ over the next few steps that the greedy walk then fails
  to achieve, whereas nothing here estimates anything.

  Measured over 60 scrambles (the 20 in the CFOP tests plus 40 seeded, so the numbers are not read
  off the population the tests were tuned on), against the four-Step greedy shape, with the search
  in its original Replacement form:

  |              | F2L cost  | F2L moves | solve cost | solve moves |
  | ------------ | --------- | --------- | ---------- | ----------- |
  | greedy Steps | 30.32     | 27.6      | 59.40      | 54.5        |
  | order search | **27.78** | **25.9**  | **57.39**  | **53.5**    |

  Better on 44 of 60, worse on 9, tied on 7 — a fixed order forbids un-solving a slot the
  count-based goal would allow, which is exactly what the greedy strategy is kept for.

  **As a Step the gain moves out of the span, and it is worth knowing why.** A Step gets lookahead
  into the one after it, so `f2l` minimises span + peek(`oll`) and will knowingly take a dearer F2L
  that leaves a better OLL. Measured over 10 scrambles against `forceStrategy: "greedy"`: F2L span
  26.70 -> 27.06 (the pool is _dearer_ on the span), whole solve 54.65 -> **54.11**. Judge this
  search on the solve, not on the region it covers; asserting on the span asks the wrong question.

  Two findings worth keeping:

  - **The setup fallback is load-bearing here, more than for the four Steps.** Targeting a _named_
    slot hits the case data's coverage gap far more often than "advance any slot" does, because
    naming the slot removes the three alternatives that would otherwise have rescued the step. A
    first probe without it completed only 4 of 24 orders on some scrambles and then lost to the
    greedy runner on a scramble it should have beaten.
  - **Per-level variant pooling and lookahead into the next Step are substitutes.** Fixing the order
    leaves the choice of _which alg_ fills each pair still greedy, and pooling the variants
    (`branchVariants`) fixes that — essential when the search was a Replacement, which gets no
    lookahead across its region boundary (without pooling, 3 of 6 scrambles came out worse than the
    greedy Steps; with it, 0 of 6). As a Step it gets exit lookahead for free, and the two overlap.
    All four combinations over 6 scrambles:

    | pooling | exit lookahead | cost  | s/solve |
    | ------- | -------------- | ----- | ------- |
    | on      | on             | 56.08 | 9.39    |
    | off     | on             | 56.79 | 2.36    |
    | on      | off            | 57.22 | 9.28    |
    | off     | off            | 60.65 | 2.37    |

    Either alone recovers ~3.5 of the ~4.6 available; the second adds 0.71 for **4x** the wall
    clock. So the Step turns pooling off and leans on lookahead; the Replacement form keeps it.

  `f2lSteps` (the four-Step shape) and `f2lOrderReplacement` are still exported for a method that
  wants per-pair granularity. What the single Step costs: nothing can replace only the _last_ slot,
  because no Step names it. Nothing wants to — `zblsReplacement` already spans the whole of F2L,
  since which slot it leaves open is decided by the three inserts before the last.

- **`@moishy/cubing-core@0.3.2`: `regionSolvedUpToD`** — a region goal satisfied when the region is
  solved **up to a shared D-layer offset**, exactly analogous to AUF but on D. Every other region
  goal here is exact (up to whole-cube rotation), which cannot express a pseudo state at all: each
  individual piece is off its home slot. The offset is shared across the whole region on purpose,
  and a test pins it — two sub-regions can each be D-fixable while their union is not, and accepting
  that is the bug a per-slot D tolerance would have. Implemented with precomputed permutation maps
  rather than four `applyMoves` per call, since a goal predicate runs millions of times in a solve,
  and checked against the obvious definition over ~99k states because that derivation is the part
  that could be silently wrong.

- **`@moishy/cubing-core@0.3.2`: `AlgorithmicPhase.branchVariants`** — a phase declares that its
  recognized case's variants must be pooled for joint minimization with the rest of its strategy.
  Same mechanism caller-configured lookahead scope already turned on between two algorithmic phases,
  but declared by the phase, for a strategy that is _meaningless_ without it rather than merely
  improved by it. The pair-order search is the case: left to a caller's `lookahead.scope` it would
  silently degrade to something not worth its wall clock. `aufOptions` is exported alongside it, so
  a setup search can aim at exactly the alignments the insert will try instead of a hand-written
  list that can drift.

- **`@moishy/steps@0.3.0`: pseudo-slotting — `f2lPseudoReplacement`, `pseudoProgress`,
  `dCorrectionPhase`.** The same order search, but each insert may leave the bottom layer turned
  away from the centers, with one D at the end to put it right. The done-predicate is the pluggable
  part (`F2lProgress`), which is why it takes a _set_ of slots: under an offset the solved portion
  is only correct relative to itself, so the cross and every filled slot have to be judged together.

  **It is correct, and it never fires. That is a result, not a gap.** Over 12 scrambles the pseudo
  route returned the identical F2L to the exact order search on all 12, with the D correction
  emitting zero moves every time. The arithmetic says why in two steps. Recognition is defined
  against an exact cross, so entering an offset and using it each cost a D turn and the correction
  costs another. And a pseudo cross cannot pay for them: if a sequence `M` leaves the cross solved
  up to offset `d`, then `M·d` solves it exactly, so **a pseudo cross is at most one D turn cheaper
  than the exact one** — while the correction owes exactly one D turn back. Net zero before the
  offset has bought anything.

  So under a model that charges a D turn the same wherever it sits, pseudo-slotting's entire value
  is in the _cases_ the offset makes available — a shorter insert, a better last slot — and this
  cost model scores turning ergonomics, so that is precisely the kind of payoff it cannot see. The
  mechanism is here and costs ~0.2 s/solve when enabled; what it needs is a reason to prefer the
  offset that is not move count. Both facts are asserted, so if it ever does start firing the test
  will say so.

- **`@moishy/cfop@0.2.0`: both F2L replacements wired** — `f2lOrder` on by default, `f2lPseudo` off.
  The four F2L Steps are untouched: these are additional _covers_ of the span, the same shape `zbls`
  already had, so `f2l4` stays its own Step and ZBLS and Winter/Summer Variation keep working. Turn
  the order search off with `replacements: { f2lOrder: { enabled: false } }` when wall clock matters
  more than move count.

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

### Fixed

- **`@moishy/cubing-core@0.3.3`: a phase no longer emits two moves of the same family in a row.** A
  real CFOP solve contained `U2 U2 R' F' r U R U' r' F` — a pre-AUF that cancelled straight into its
  alg's first move, two turns nobody executes, charged for twice and drawing an overwork penalty on
  top. `runPhase` now merges same-family adjacencies where it assembles a candidate
  (`mergeAdjacent`, exported).

  Doing it there rather than as a tidy-up on the finished solution is the whole point: the merged
  form has to be what the **cost** is computed from, or an alignment that cancels into its alg can
  never win its own race. It also keeps `moves` and `cost` describing the same sequence, which a
  post-pass would break. Measured over 6 scrambles: CFOP cost **55.23 -> 52.73**, moves 50.7 -> 50.0
  — the cost falls further than the moves because a cancelling pair was also drawing the overwork
  penalty, and because better alignments now win elsewhere. APB: 39.8 -> 38.3 moves.

  **Not applied across phase or step boundaries**, though the same waste occurs there (measured: 1
  occurrence in 12 solves, against 2 within phases). Merging there would change the intermediate
  state a segment ends on, so a step's own goal would no longer hold at its own boundary — the
  per-step contract the whole result object is built on. The cost model already charges overwork for
  the adjacency, so the runner avoids it where it can choose to. A test asserts the per-phase
  property so it cannot silently regress.

  Mid-alg checkpoints are translated through the merge and **dropped** where it destroyed the split
  they name (`mergeAdjacentWithPrefixes` reports that as `-1`): a checkpoint that no longer exists
  must not quietly become a splice at the wrong move.

- **The version-drift test never covered `@moishy/cfop`.** It asserts every workspace member's
  exported `VERSION` matches its manifest and that inter-package ranges still resolve — and cfop,
  the newest package, was simply not in its list, so exactly the drift it exists to catch could have
  shipped from it silently. Added.

- **`@moishy/algsets`: `aufInvariantLookup` re-derived recognition with the pre-fix formula, so 24
  `zbls` cases could not be found by the very lookup built from them.** It recomputed
  `solved . invert(algs[0])` itself instead of asking the set for `recognitionState(id)` — silently
  reintroducing the bug `defineAlgSet` had just been fixed for, since an alg carrying a net rotation
  solves its case into the _rotated_ frame and that formula yields a state for a different case. One
  line, and it is why a fix has to be made in the one place a value is derived rather than in each
  copy.

### Changed

- **`@moishy/cfop@0.4.0`: ZBLL and COLL+EPLL are Extras, not Replacements** — breaking for anyone
  who enabled them, since the settings key moves from `replacements` to `extras`.

  The three kinds mean different things and these were the wrong one. A **Strategy** reaches the
  same result a different way. A **Replacement** covers a range of steps with a different route and
  is available on _every_ solve. An **Extra** is conditional — if the case allows it, try this.

  Both of these are conditional: they need the last-layer **edges already oriented**, and nothing in
  plain CFOP orients them (OLL is where that happens, and these replace OLL). So they apply only
  when something upstream did it — ZBLS — or the scramble happened to leave them oriented, which is
  about one solve in eight. Measured over the 20 test scrambles: the edges are oriented at the `oll`
  boundary on 4, and ZBLL fires on 3 of those (the fourth loses the race, which `compete` is for).

  As Replacements they worked by accident: the lookup found no case and the unit quietly produced no
  candidate. Same outcome, wrong statement — and it cost a recognition attempt on every solve. A
  boundary trigger says the condition out loud and is checked once, at the `oll` boundary.

  They stay `compete` once triggered, because "the case is right" is not "this is cheaper": a
  one-alg last layer does not always beat the OLL/PLL pair it replaces.

- **A Method may now recommend a `compete` Replacement ON; `force` stays caller-only.** The
  project-wide rule was that `enabled` always defaults to false, no exceptions — right for `force`,
  where "on" changes what the solver is _allowed_ to do and a caller can be handed a solution they
  cannot execute, but wrong for `compete`, which already carries the guarantee the rule was
  protecting: the runner solves once with the unit off and once on and keeps the cheaper _whole_
  solve. Enabling one cannot make a solve worse; it can only cost time. CFOP's `f2lOrder` is the
  first, and makes the trade explicit — roughly 2x the wall clock for ~3 moves of F2L. /DESIGN.md
  updated.

- **`@moishy/cubing-core@0.3.2`: `aufOptions` builds the PRODUCT of its families, not the union.**
  `["U"]` is unchanged — identity plus the three amounts, identity still first — and every phase
  written before this passed exactly one family, so nothing existing moves. `["U", "D"]` is now all
  16 combinations rather than the seven singles, `D U` and `U D2` included. The union cannot express
  what pseudo-slotting needs: a D turn to make the case recognizable _and_ a U turn to present the
  pair, in one alignment. The product is a superset of the union, so this is additive, and the cost
  (4^families) is paid only where more than one family is asked for.

- **`@moishy/steps@0.3.0`: the F2L setup fallback searches with A\* instead of IDA\*, for an 88x
  node reduction and identical answers.** The reason is the _goal_, not the state space: this goal
  runs a whole trial insert per state, and IDA\* re-expands its entire tree once per cost threshold
  — with real-valued MCC costs there are many thresholds between zero and three moves, so the same
  states get their goal re-evaluated over and over. A\* visits each once, and both are cost-optimal.
  Measured over the 240 setups a 60-scramble CFOP run actually reaches: 254,554 nodes -> 2,886, 4.8x
  less time in the setups, **whole solves 1732 ms -> 775 ms**, and zero cost disagreements — F2L
  cost and move count identical on all 60. This is what made the 24-strategy order search affordable
  at all; before it, one scramble took 141 s.

- **`@moishy/steps@0.4.0`: ZBLS reserves nothing, and recognizes the last slot by where it
  physically is.** Its second argument is now a `Record<F2lSlot, CaseLookup>` (from the new
  `f2lSlotLookups`) rather than the merged `f2lLookup`, because a level that has _named_ the slot it
  is filling does not want four times the algs. And "reserve a slot" turns out to be nothing more
  than **leaving that slot out of the order** — so the dedicated reserving goal
  (`f2lGoalLeavingOpen`) and the separate align-whatever-is-left strategy are both gone, replaced by
  24 order strategies with the race picking the cheapest.

  The reason it can offer all 24 rather than only the six that leave FR: **a last-slot set
  constrains the slot's _physical_ position, not which cubie pair sits in it.** An FR-authored alg
  solves whichever slot the cuber holds at front-right, so an FL- or BR-open state is an ordinary FR
  case after one `y'`/`y`; only BL, needing a `y2`, is out. Brute-forced over the whole set on 88
  real post-three-insert states: **45 solvable within a single `y`**, against the 22 the old
  cubie-keyed `lastSlotSignature("fr")` could see.

  `lastSlotSignature` therefore reads the open pair and the EO pattern _through_ the rotation that
  brings that slot to the front. **It is a partial fix and the honest numbers are these:** end to
  end — recognized _and_ the chosen case's alg reaching the goal — routes that complete go from 22
  to 32 of the 85 states that reach alignment, and slots that were impossible outright now work (a
  BL pair drifted to BR/FL: 4 of 4). But a BR pair at BR completes on 2 of 17 and an FL pair at FL
  on 3 of 20, where every one of those 37 is solvable by _some_ alg in the set. The projection lands
  on a key without always landing on the right case; recognition matches, the alg fails the goal,
  the candidate is dropped. Safe — `runPhase` goal-checks, so a mis-recognition costs a missed route
  and never a wrong solve — but ~35 states remain headroom.

  **Do not read a recognition failure as "no alg applies."** That inference was made here twice and
  was wrong by a factor of two both times: the cubie-keyed signature matched none of those states,
  and a first frame-aware attempt matched none either, while the algs solved them regardless.
  Recognition and solvability are separate questions, and the way to ask the second is to offer
  every alg and let the phase goal judge.

- **`@moishy/algsets`: `zbls` is re-sourced wholly from the community ZBLS spreadsheet** (algs by
  Chad Batten and Tao Yu) — 301 cases, 645 algs — replacing a set stitched together from several
  sources. There is no SpeedCubeDB-style page for ZBLS, so consistency of source matters more here
  than usual: a mixed set is exactly where slot and frame inconsistencies creep in.

  It shows: the ten cases previously authored against the FL/BR slot are simply gone, and the APB
  test that recorded them as known exceptions now asserts an empty list. Nine had been patched by
  hand with a leading rotation; one consistent source removed the need.

  **Every cell and every alg in the sheet is now represented: 302 cases, 648 algs, nothing
  excluded.** Getting there took three corrections, and the generator now asserts
  `kept + excluded === cells` so a silent loss cannot recur — which is what finally caught one.

  - **The grid is not uniform.** Headings 1-40 sit on a 5-row pitch, but F2L 41's heading (A50) is
    only three rows below F2L 37's (A47), so a reader assuming even spacing runs headings 37-40 into
    41's cells. A first pass did that and reported two "duplicate cases" that were the same cells
    (B51, D51) read twice. The sheet holds 302 filled cells — 41 headings x 8 sub-cases, except 37,
    40 and 41 which carry 2 each and 38 and 39 which carry 4 (36x8 + 2+2+2 + 4+4 = 302) — and 302
    matching the canonical ZBLS count is the check that the geometry is right.
  - **`f2l-34-2` (G44) was dropped in silence** by merging on the coarse signature a consuming
    lookup keys on. That signature is lossy: `f2l-33-2` and `f2l-34-2` share it, and each one's alg
    solves the other's state, so they are the same case up to AUF. Merging is gone entirely; both
    are kept, the lookup returns one, and either alg works.
  - **The frame an alg lands in is its net centre permutation, not its `x`/`y`/`z` tokens.** This is
    the new `AlgSetInput.frameDerivation` knob, and `zbls` opts into `"centres"`. `f2l-12-5` (S13)
    has one alg, `R d' R U2 R' U2 F'`, with no rotation token at all — yet its `d'` turns the whole
    first two layers as a unit, so the slot that was front-right when the alg began is elsewhere by
    the end. Read as rotations it derives a state for the wrong slot and looks like an invalid case;
    read as centres it is an ordinary FR case. The default stays `"rotations"`, because a _drifting_
    alg (an M-slice DF/DB insert, where the pieces did not move with the centres) has a centre
    permutation that is not a reframing at all — reading it as one moves the case, which is exactly
    how `dfdb` broke in an earlier attempt.

  Two algs are filed under a different case than the cell they appear in, because that is the case
  they actually solve — placed by applying them to each candidate's derived state, not by reading
  the sheet: `F' U r' F' r U r' F r F` (N15, listed under f2l-11-7) belongs to **f2l-9-7**, and
  `r U2 B U' B' U2 r'` (I35, listed under f2l-26-7) belongs to **f2l-26-6**.

  A case's state also now comes from the largest group of algs in its cell that agree with each
  other. First-match let a single outlier define the case and discard the majority — at I35 one alg
  disagreed with five, at N15 one with two.

- **`@moishy/steps`: a reserved F2L insert now carries a setup fallback, which is what makes ZBLS
  apply to every solve.** The plain F2L steps each have one; the reserved inserts inside
  `zblsReplacement` did not, and that single omission was the whole applicability ceiling. Reserving
  a slot _removes_ options, so a state some slot could have handled may have nothing left for the
  slots still allowed — reserving FR failed on 39 of 60 crosses. With the fallback: 60 of 60.

  Recognition was never the problem, which took an embarrassing detour to establish. A measured "19%
  recognised" was taken over _greedy_ three-pair states, where the open slot is FR only about one
  time in four; over _reserved_ states it was already 100% (21/21 recognised and solved). Measuring
  the wrong population made a solved problem look unsolved.

  The result is what ZBLS is supposed to be. Over 20 random scrambles, forced:

  |             | applies | cost      | moves    |
  | ----------- | ------- | --------- | -------- |
  | plain CFOP  | —       | 59.12     | 54.5     |
  | ZBLS        | 20/20   | 66.61     | 61.3     |
  | ZBLS + ZBLL | 20/20   | **58.09** | **54.1** |

  ZBLS alone is dearer, exactly as expected — it spends moves orienting edges and full OLL was
  already cheap. Paired with ZBLL it beats plain CFOP outright, and it now applies to **every**
  solve rather than the quarter where the last slot happened to land on FR. Alignment is at most a
  single `y` and never a `y2`, asserted per scramble.

- **`@moishy/steps@0.2.0`: an F2L tie between slots now goes to a back slot.** Where two slots are
  equally cheap, filling a back one leaves the FRONT slots open — and those are the ones you can
  see; keeping a back slot open puts the next pair in your blind spot. Free to implement, because
  `runPhase` replaces its best candidate only on a strict improvement, so the first-offered slot
  wins a tie; the slots are simply offered back-first. And the ties are real rather than
  hypothetical: mirrored algs are exactly equal under the cost model (`R U R'` and `L' U' L` are
  both 0.8 + 1.0 + 0.8). Measured over 6 scrambles: CFOP mean cost 59.13 -> 58.41 at identical move
  count.

  It also lines up with what a last-slot alg set wants. Solving the back slots early leaves a FRONT
  slot last, and the front slots are the ones at most a single `y` from FR, where `zbls` is authored
  — while BL, the one that would need a `y2`, is the first filled rather than the last.

  Worth recording what does _not_ work here: raising F2L lookahead depth to search pair orders.
  `peekCost` does recurse to `depth`, so it looks as though depth 3 would evaluate whole orders for
  free. Measured, each level costs ~13x (9.3s -> 125s over 6 scrambles, depth 3+ does not finish)
  and the result is slightly _worse_ (cost 59.13 -> 59.24, moves 53.8 -> 55.2): `peekCost` returns
  an optimistic minimum that the greedy walk then does not achieve, so the adjustment misleads.
  Depth stays at 1; a constraint that has to hold belongs in a phase goal, not in lookahead — which
  is exactly the shape the exhaustive pair-order search above ended up taking.

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

- **`@moishy/steps`: last-slot variants, and `@moishy/cfop` wires ZBLS.** A new `last-slot` module
  with the reusable pieces: `f2lGoalLeavingOpen` (reserve a slot for a last-slot set),
  `alignSlotToFront` / `alignOpenSlotToFront` (bring the open slot round to the physical
  front-right), `lastSlotSignature`, and `zblsReplacement`. CFOP registers ZBLS as a `compete`
  replacement over the whole `[f2l1, f2l4]` span — the span is all four steps because the constraint
  is on the pair _order_, not just the final insert.

  These sets are authored for the FR slot, since that is the one solvers learn, so two strategies
  race to get there: reserve the FR pair deliberately (a goal on the three inserts, not a lookahead
  preference — a constraint that must hold belongs in a goal), or insert greedily and align whatever
  is left. Alignment is at most a single `y`: a slot diagonally opposite is deliberately
  unreachable, since a `y2` to set up a last slot is not something a solver does, so the phase
  offers only `y`/`y'` and the strategy drops out of the race instead.

  **Measured: ZBLS does not pay for itself in CFOP, and `compete` correctly never fires it.** Over 8
  scrambles a route exists on 4 and is cheaper on none — mean cost 58.87 -> 68.31. Structural rather
  than a wiring fault: its payoff is that OLL becomes an OCLL, and full OLL was already about that
  cheap, so the longer insert is not repaid. One scramble got an OLL _skip_ and was still 12.33
  worse. ZBLS is built to feed ZBLL, which is a different method. Kept for completeness and correct
  under `force`.

- **`@moishy/steps` + `@moishy/cfop`: Winter/Summer Variation, ZBLL and COLL+EPLL.** `wvSvExtra`
  (checkpoint Extra over `[f2l4, oll]`) and `zbllStrategy` join the shared modules; CFOP registers
  WV/SV as an extra and ZBLL / COLL+EPLL as `compete` replacements over `[oll, pll]`.

  Three measured results, none of them the expected one:

  - **ZBLL on its own is a clear win**: mean cost 60.04 -> 58.48 and 56.0 -> 54.7 moves over 25
    scrambles, firing on 5 of them — the ones where the last-layer edges happen to come out oriented
    after F2L.
  - **WV/SV never pays in CFOP.** Under `force` it fired and made a solve _worse_ (55.75 -> 58.58),
    so it is `compete` — at which point it fires on 0 of 60. Splicing WV mid-insert buys a solved
    OLL but spends a longer insert to get it, and a lucky short insert plus a short OLL beats it.
  - **ZBLS + ZBLL is the pairing that works**, and it validates what ZBLS is for: over 30 scrambles,
    on the 8 with a ZBLS route, last-layer cost **22.14 -> 15.89** and whole solve 55.85 -> 55.27,
    best case **62.98 -> 46.13** (62 moves to 45).

  **But ZBLS must be forced for that pairing to happen, and the reason is an engine limitation worth
  recording.** A `compete` unit is chosen by the span DP on the cost of its _own_ region, and ZBLS's
  entire payoff lands in a different region — the last layer. The DP's exit lookahead peeks only the
  plain next step, never another replacement, so it cannot see the ZBLL that justifies ZBLS and
  rejects it locally every time. Not worked around here. The shape of a real fix is visible though:
  in a method where ZBLS and ZBLL are _core steps_, nothing has to justify itself region-locally and
  the problem disappears — an argument for ZB being its own method rather than CFOP with two options
  enabled.

  A broader caveat these three share: the cost model scores turning ergonomics, not pauses. The
  practical value of a last-slot variant is often one fewer alg to _recognise_, which MCC cannot
  see, so techniques whose benefit is flow rather than move count will always look worse here than
  they are.

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

### Removed — breaking

- **`@moishy/steps@0.4.0`: `f2lGoalLeavingOpen`.** It existed because a greedy walk cannot name the
  slots it is going to use, so reserving one had to be expressed as a goal that refuses to fill it.
  An order search names them, and `exactProgress` names every slot targeted so far — so nothing can
  quietly fill the reserved slot on the way, and the weaker "do not fill it" formulation has no
  remaining caller. `alignSlotToFront` stays exported for a method assembling its own last-slot
  route, though `zblsReplacement` no longer needs it.

- **`@moishy/cfop@0.3.0`: the step ids `f2l1`..`f2l4` are now a single `f2l`.** They are public
  surface — settings keys, lookahead scope, the demo's generated options form — so anything naming
  them needs updating. `@moishy/steps` still exports `f2lSteps` and `f2lOrderReplacement` for a
  method that wants the four-Step shape; CFOP does not.

- **`@moishy/steps@0.4.0`: `lastSlotSignature` takes no slot argument**, and `zblsReplacement` takes
  per-slot lookups plus no `slot` option. Both follow from recognition being keyed on the open
  slot's physical position rather than on a caller-named cubie pair. Their `region` defaults moved
  from `["f2l1", "f2l4"]` / `["f2l4", "oll"]` to `["f2l", "f2l"]` / `["f2l", "oll"]`; a four-Step
  method passes `region` explicitly.

### Known — measured, not yet implemented

- **~35 of the last-slot states an FR alg provably solves are still not recognized.** See the
  `zblsReplacement` entry above for the measurement. The remaining gap is the projection landing on
  the wrong case, not the technique. A goal-verifying lookup (offer every case, let `runPhase`
  judge) is correct and ~10k `applyMoves` per call, but the order search feeds it a large candidate
  pool, so it needs narrowing first.

- **Pseudo-slotting has no enabler.** It is correct and never fires; the only place it could pay is
  a pseudo _cross_, which needs the pruning table seeded with the four D-rotated home configurations
  to stay admissible. Not built. See the pseudo-slotting entry above for why it cannot win on move
  count alone.

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
