// Exhaustive pair-order search: solve F2L by trying every order the four pairs could
// go in, and keeping whichever order actually came out cheapest.
//
// **Why this exists.** The four F2L Steps each pick greedily. Step N races every slot's
// candidates and commits to the cheapest single insert, and a locally cheap insert can
// leave the remaining three pairs in a mess that costs more than it saved. Measured over
// 60 scrambles, that is worth ~3 moves — about a tenth of F2L.
//
// **Why it is not lookahead.** Raising `lookahead.depth` looks like the same idea and is
// not: `peekCost` returns the *minimum* achievable cost over the next few steps, and the
// greedy walk that follows then routinely fails to achieve it (its candidate pool is
// re-derived, re-capped at `BRANCH_CAP`, and re-chosen under a different window), so the
// adjustment misleads. Measured: depth 2 cost 13x the wall clock of depth 1 for a *worse*
// result, depth 3 does not finish. Nothing here estimates anything. Each order is a real,
// fully executed phase chain, so its number is the threaded MCC of the moves it actually
// emits, and the runner's ordinary strategy race compares those.
//
// **The four Steps survive.** This is a `compete` Replacement over the F2L span, which is
// structurally the same thing `zblsReplacement` already is — another *cover* of the span,
// not a collapse of it. `f2l4` remains its own Step, so a last-slot Replacement still has
// something to replace.
//
// One consequence to know rather than discover: while this cover is the one in use, a
// *checkpoint* Extra attached to `f2l4` (Winter/Summer Variation) cannot splice, because the
// runner offers checkpoints on plain Steps and the span was covered in one unit. That is
// true of any span-covering replacement, `zbls` included, and `compete` keeps it from
// costing anything — the runner solves once with the compete units off, where WV/SV is free
// to fire, and once with them on, and keeps the cheaper whole solve.
//
// **The done-predicate is pluggable, and joint rather than per-slot.** Pseudo-slotting
// inserts pairs against a deliberately offset D layer, and "is this one slot done" has no
// answer under that — a per-slot D offset means nothing. What is well defined is whether
// the cross *plus a given set of slots* is in place, sharing one offset. So the parameter
// is an {@link F2lProgress}: given the slots that should be done, a predicate on the
// state. {@link exactProgress} is the ordinary reading, {@link pseudoProgress} the other.

import type {
  AlgorithmicPhase,
  CaseLookup,
  CubeState,
  MoveFamily,
  Phase,
  PieceRegion,
  Replacement,
  Step,
  Strategy,
} from "@moishy/cubing-core";
import { parseAlg, regionSolved, regionSolvedUpToD } from "@moishy/cubing-core";
import { CROSS } from "./blocks.ts";
import { F2L_OFFER_ORDER, F2L_SLOT, f2lGoal, type F2lSlot, insertSetupPhase } from "./f2l.ts";

/**
 * "The cross plus exactly these slots are in place."
 *
 * The one thing an insert sequence needs to know, and the one thing pseudo-slotting
 * changes. Taking a *set* of slots rather than one slot is what makes it expressible:
 * under a D-layer offset the solved portion is only correct relative to itself, so the
 * cross and every filled slot have to be judged together.
 */
export type F2lProgress = (slots: readonly F2lSlot[]) => (s: CubeState) => boolean;

/**
 * The ordinary reading: the cross solved, and each named slot holding its own pair.
 *
 * Note this is stricter than the count-based `f2lGoal` the plain Steps use, and
 * deliberately so. An order search has committed to *which* pairs are done by now, so an
 * alg that fills one of the remaining slots by emptying an earlier one is not a valid
 * continuation of this order — under a count goal it would net zero and be rejected
 * anyway at that level, but it could also net +1 by filling two and breaking one, leaving
 * a slot this order never targets again and an incomplete F2L at the end. Naming the
 * slots removes the possibility.
 */
export const exactProgress: F2lProgress = (slots) => regionSolved(crossPlus(slots));

/** The cross plus the named slots, as one region. */
export function crossPlus(slots: readonly F2lSlot[]): PieceRegion {
  return {
    corners: slots.flatMap((slot) => [...F2L_SLOT[slot].corners]),
    edges: [...CROSS.edges, ...slots.flatMap((slot) => [...F2L_SLOT[slot].edges])],
  };
}

/** How an insert sequence is built. */
export interface InsertSequenceOptions {
  /** What "the cross plus these slots are in place" means. Default {@link exactProgress}. */
  progress?: F2lProgress;
  /** Alignment families each insert may use before and after its alg. Default `["U"]`. */
  auf?: MoveFamily[];
  /**
   * Alignment families the *setup search's* goal assumes the following insert has.
   * Default `["U"]` — deliberately **not** `auf`.
   *
   * `aufOptions` is a product, so `["U", "D"]` is 16 alignments and the setup's goal, which
   * runs a whole trial insert per state, becomes 16x16 per candidate. Multiplied by a
   * few thousand search states that is the difference between a solve and a hang.
   *
   * Assuming *fewer* alignments than the insert really has is the safe direction: the setup
   * then only stops where a U-only insert already works, and an insert with more alignments
   * available can still do at least that. What it costs is coverage, not correctness — a
   * tangle that only a D-using insert could resolve is not found. Assuming *more* would be
   * the unsafe direction, aiming the search at a goal the insert cannot reach.
   */
  setupAuf?: MoveFamily[];
  /** Depth of the setup fallback search, in moves. Default 3; `0` omits it entirely. */
  setupDepth?: number;
  /** Prefix for the generated phase ids, so two sequences in one method don't collide. */
  idPrefix?: string;
  /**
   * Pool each insert's interchangeable algs for joint minimization with the rest of the
   * sequence (`AlgorithmicPhase.branchVariants`). Default `true`.
   *
   * Fixing the order is only half the search — which alg fills a pair changes what the next
   * pair faces — so a sequence that commits its locally cheapest insert at every level is
   * still greedy inside each level. As a `compete` Replacement, where the runner gives a
   * region no lookahead across its boundary, that is worth a lot: without pooling, 3 of 6
   * scrambles came out *worse* than the greedy Steps; with it, 0 of 6.
   *
   * **As a core Step it is nearly redundant, and four times the wall clock.** A Step gets
   * lookahead into the step after it, and that turns out to buy most of the same thing —
   * both are "do not commit to the locally cheapest thing". Measured over 6 scrambles, all
   * four combinations:
   *
   * | pooling | exit lookahead | cost  | s/solve |
   * | ------- | -------------- | ----- | ------- |
   * | on      | on             | 56.08 | 9.39    |
   * | off     | on             | 56.79 | 2.36    |
   * | on      | off            | 57.22 | 9.28    |
   * | off     | off            | 60.65 | 2.37    |
   *
   * Either alone recovers ~3.5 of the ~4.6 available; the second adds 0.71 for 4x the clock.
   * So {@link f2lOrderedStep} turns it off and leans on lookahead, while a Replacement-shaped
   * order search leaves it on because it has no lookahead to lean on.
   */
  branchVariants?: boolean;
  /**
   * Prefix for the generated *strategy* ids, which are `<prefix><the order it inserts>` —
   * `orderBLBRFRFL`, `zblsBLBRFR`. Default `"order"`. A caller wrapping a sequence in extra
   * phases sets this so the winning strategy still says which route *and* which order won.
   */
  strategyPrefix?: string;
}

/** A pair order as an id fragment: `["bl", "fr"]` -> `"BLFR"`. */
function orderTag(order: readonly F2lSlot[]): string {
  return order.map((slot) => slot.toUpperCase()).join("");
}

/**
 * The phases that insert `order`'s pairs, in that order: for each, a short setup search
 * and then the insert itself.
 *
 * The setup is not optional padding. The case data covers a pair in the U layer or its
 * own slot and (via `advanced-f2l`) many trapped configurations, but not every way three
 * unsolved slots can hold each other's pieces — and *targeting a named slot* hits that
 * gap far more often than "advance any slot" does, because naming the slot removes the
 * three alternatives that would otherwise have rescued the step. Omitting it is why the
 * first probe of this idea completed only 4 of 24 orders on some scrambles and then lost
 * to the greedy runner on a scramble it should have beaten.
 *
 * Each insert's goal names every slot targeted *so far*, so the sequence is monotone: the
 * last one's goal is the whole F2L. That also keeps multi-slotting free — an alg that
 * fills two slots satisfies this level and leaves the next a zero-move skip, with no
 * mechanism required beyond the data.
 */
export function insertSequencePhases(
  order: readonly F2lSlot[],
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: InsertSequenceOptions = {},
): Phase[] {
  const progress = opts.progress ?? exactProgress;
  const auf = opts.auf ?? ["U"];
  const setupAuf = opts.setupAuf ?? ["U"];
  const setupDepth = opts.setupDepth ?? 3;
  const prefix = opts.idPrefix ?? "insert";
  const phases: Phase[] = [];
  for (let k = 0; k < order.length; k++) {
    const goal = progress(order.slice(0, k + 1));
    const id = `${prefix}${k + 1}`;
    // Only the target slot's own cases. The merged all-slot lookup would offer four
    // times the algs for no gain: this level has *named* the slot it is filling, and an
    // alg is here to fill it. Multi-slotting is unaffected — an alg from this slot's set
    // that happens to fill a second slot still leaves the next level a zero-move skip.
    const slotCases = cases[order[k]];
    if (setupDepth > 0) {
      phases.push(insertSetupPhase(`${id}Setup`, goal, slotCases, setupAuf, setupDepth));
    }
    phases.push({
      kind: "algorithmic",
      id,
      goal,
      cases: slotCases,
      auf,
      // See InsertSequenceOptions.branchVariants for what this buys and what it costs.
      // Set on every insert including the sequence's last: `strategyCands` ignores it on a
      // strategy's *final* phase, and whether this insert is final depends on what the
      // caller appends afterwards (ZBLS adds an alignment and its own alg), which this
      // builder cannot see. Letting the runner decide is simpler and right.
      branchVariants: opts.branchVariants ?? true,
    });
  }
  return phases;
}

/** A strategy that inserts `order`'s pairs in that order, and nothing else. */
export function insertSequenceStrategy(
  order: readonly F2lSlot[],
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: InsertSequenceOptions & { label?: string } = {},
): Strategy {
  return {
    id: `${opts.strategyPrefix ?? "order"}${orderTag(order)}`,
    label: opts.label ?? `F2L order ${order.map((s) => s.toUpperCase()).join("-")}`,
    phases: insertSequencePhases(order, cases, opts),
    // Every setup here is a non-final search phase, so phase-chaining would pool each
    // one within its move slack and multiply the pools level over level — 12^4 chains
    // per order, times the orders. The pool buys nothing anyway: a setup is a trigger to
    // make *some* insert work, and the insert that follows is a lookup, not a search
    // whose difficulty varies with which trigger preceded it.
    phaseChaining: false,
  };
}

/**
 * Every ordering of `slots`, `take` at a time (default: all of them), listed so that the
 * first is `slots`' own order.
 *
 * The listing order is a real tie-break, not cosmetic. `regionAltCands` sorts the
 * strategies' candidates by cost with a stable sort, so the first-listed order wins an
 * exact tie — and ties are common here, since mirrored algs cost exactly the same. Pass
 * slots in {@link F2L_OFFER_ORDER} and equal-cost orders resolve back-slots-first, which
 * is the same preference the greedy path expresses.
 */
export function slotOrders(
  slots: readonly F2lSlot[] = F2L_OFFER_ORDER,
  take: number = slots.length,
): F2lSlot[][] {
  if (take === 0) return [[]];
  const out: F2lSlot[][] = [];
  for (let i = 0; i < slots.length; i++) {
    const rest = [...slots.slice(0, i), ...slots.slice(i + 1)];
    for (const tail of slotOrders(rest, take - 1)) out.push([slots[i], ...tail]);
  }
  return out;
}

/**
 * One strategy per pair order — the exhaustive search itself, as a list the runner's
 * ordinary strategy race walks.
 *
 * 24 strategies for the whole F2L. `take: 3` gives the 24 ways to pick and order three of the
 * four, which is what a last-slot route wants: *which* slot it leaves open is then something
 * the strategy named rather than something the walk happened to leave. Narrowing `slots`
 * excludes a slot outright — 6 orders of the other three — which is all "reserving a slot"
 * ever needed to mean.
 */
export function insertOrderStrategies(
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: InsertSequenceOptions & { slots?: readonly F2lSlot[]; take?: number } = {},
): Strategy[] {
  const slots = opts.slots ?? F2L_OFFER_ORDER;
  return slotOrders(slots, opts.take ?? slots.length)
    .map((order) => insertSequenceStrategy(order, cases, opts));
}

/**
 * The whole of F2L as **one core Step**, its strategies being every pair order plus a greedy
 * one — the shape a method should reach for by default.
 *
 * The four-Step alternative ({@link import("./f2l.ts").f2lSteps}) models F2L as four
 * decisions, one per pair, each committed before the next is looked at. Once the orders are
 * searched exhaustively that decision structure does not exist: there is one decision, the
 * order, taken once. Expressing it as four Steps and then bolting the order search on as a
 * `compete` Replacement makes the runner solve the whole scramble *twice* to compare the real
 * model against the vestigial one — measured at 5m01s -> 8m22s on this repo's test suite for
 * no change in result. As a Step there is nothing to race.
 *
 * The greedy strategy is kept alongside the 24 as insurance, not as a competitor: its goals
 * are the count-based ones, so it can complete a state where every *fixed* order is stuck (an
 * alg that fills one slot by emptying another nets zero for a named order but can still
 * advance a count). It loses the race whenever any order works, which is essentially always.
 *
 * What this costs, stated plainly: no Replacement can cover only the *last* slot any more,
 * because there is no `f2l4` Step to name. Nothing wants that today — `zblsReplacement`
 * already spans the whole span, since which slot it leaves open is decided by the three
 * inserts before it — but a future OLS-over-the-last-pair-only would have to re-do all four.
 */
export function f2lOrderedStep(
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  greedyCases: CaseLookup,
  opts: InsertSequenceOptions & { id?: string; label?: string } = {},
): Step {
  return {
    id: opts.id ?? "f2l",
    label: opts.label ?? "F2L",
    strategies: [
      // Pooling off: a Step gets lookahead into the next one, which buys nearly the same
      // thing for a quarter of the clock — see InsertSequenceOptions.branchVariants.
      ...insertOrderStrategies(cases, { branchVariants: false, ...opts }),
      greedyInsertStrategy(greedyCases),
    ],
  };
}

/**
 * Insert four pairs by the count-based goals — "any slot, cheapest first" — as a single
 * strategy.
 *
 * This is the greedy walk the four Steps perform, folded into one strategy so it can race the
 * fixed orders inside one Step. It is a safety net: a named order forbids un-solving a slot it
 * has already targeted, and a count goal does not, so there are states the orders cannot
 * finish and this can.
 */
export function greedyInsertStrategy(cases: CaseLookup, idPrefix = "greedy"): Strategy {
  const phases: Phase[] = [];
  for (let n = 1; n <= 4; n++) {
    const goal = f2lGoal(n);
    phases.push(insertSetupPhase(`${idPrefix}${n}Setup`, goal, cases));
    phases.push({
      kind: "algorithmic",
      id: `${idPrefix}${n}`,
      goal,
      cases,
      auf: ["U"],
      branchVariants: true,
    });
  }
  return { id: "greedy", label: "F2L (greedy, any order)", phases, phaseChaining: false };
}

// --- Pseudo-slotting ----------------------------------------------------------------
//
// Insert pairs against a D layer that is deliberately turned away from the centers, and
// put it right with a single D later. The pieces are correct *relative to each other*
// throughout; only their relationship to the centers is deferred.
//
// **Measured: from an exact cross this never fires, and it provably cannot.** Over 12
// scrambles the pseudo route returned the identical F2L to the exact order search on all
// 12, with the D correction emitting zero moves every time — the offset was not used
// once. That is not a wiring fault, and the arithmetic says why in two steps.
//
//  1. Recognition is defined against an exact cross. Every stored F2L case's state has
//     the cross solved, so an insert can only be recognized after the offset has been
//     turned *back* out — which is why `auf` must include D at all. So entering an offset
//     and using it both cost a D turn, and the correction at the end costs a third.
//  2. A pseudo cross cannot pay for them. If a sequence `M` leaves the cross solved up to
//     offset `d`, then `M·d` solves it exactly — so the exact optimum is at most
//     `cost(M) + cost(d)`, i.e. **a pseudo cross can be at most one D turn cheaper than
//     the exact one**, and the correction owes exactly one D turn back. Net zero, before
//     the offset has bought anything.
//
// So under a model that charges a D turn the same wherever it sits, pseudo-slotting's
// entire value is in the *cases* the offset makes available — a shorter insert, a better
// last slot — not in move count. This cost model scores turning ergonomics, so a technique
// whose payoff is "the case you get is nicer" is exactly the kind it cannot see. The
// mechanism is here, correct, and costs ~0.2s a solve when enabled; what it needs to be
// worth enabling is a reason to prefer the offset that is not move count.

/**
 * Progress measured up to a shared D-layer offset — the pseudo reading of "in place".
 *
 * The cross and every filled slot are judged as **one** region, which is what makes the
 * offset shared rather than per-slot (see `regionSolvedUpToD`). Drop-in alternative to
 * {@link exactProgress}, and the reason {@link F2lProgress} takes a set of slots.
 */
export const pseudoProgress: F2lProgress = (slots) => regionSolvedUpToD(crossPlus(slots));

// D turns offered as a case, so the correction phase emits one D and nothing else — the
// same trick the last-slot alignment uses for `y`. A search over the D family would be
// free to spend several.
const D_TURNS: CaseLookup = {
  find: () => ({
    id: "dCorrect",
    algs: [{ moves: parseAlg("D") }, { moves: parseAlg("D2") }, { moves: parseAlg("D'") }],
  }),
};

/**
 * Put a pseudo F2L right: one D turn, or none.
 *
 * `runPhase` tries the zero-move option first, so a sequence that happened not to use an
 * offset pays nothing — which is what lets one strategy cover both the pseudo and the
 * ordinary route rather than needing two.
 */
export function dCorrectionPhase(id = "dCorrect"): AlgorithmicPhase {
  return {
    kind: "algorithmic",
    id,
    goal: regionSolved(crossPlus(F2L_OFFER_ORDER)),
    cases: D_TURNS,
    // No AUF: a U turn cannot fix a D offset, and offering one would only add noise.
    auf: [],
  };
}

/**
 * Pseudo-slotting as a `compete` Replacement over a method's F2L span: the same
 * exhaustive pair-order search, but every insert may leave the bottom offset, and one D
 * at the end puts it right.
 *
 * `auf: ["U", "D"]` is what makes it possible, and it needs the *product* the alignment
 * builder now produces rather than the union it used to: an insert has to be able to turn
 * the D layer back to exact so the case is recognizable **and** turn U to present the
 * pair, i.e. a `D U`, which a union can never express. See cubing-core's `aufOptions`.
 *
 * The price is that alignment: 16 options each side instead of 4, so 16x the (pre, post)
 * pairs per variant. `setupAuf` is deliberately left at `["U"]` to keep the setup search
 * out of that multiplication — see {@link InsertSequenceOptions.setupAuf}.
 *
 * Read the measurement above before enabling it: it is correct, and it never wins.
 */
export function f2lPseudoReplacement(
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: InsertSequenceOptions & { id?: string; region?: [string, string] } = {},
): Replacement {
  const strategies = insertOrderStrategies(cases, {
    progress: pseudoProgress,
    auf: ["U", "D"],
    idPrefix: "pseudo",
    strategyPrefix: "pseudo",
    ...opts,
  }).map((s): Strategy => ({
    ...s,
    label: `Pseudo ${s.label}`,
    phases: [...s.phases, dCorrectionPhase()],
  }));
  return {
    id: opts.id ?? "f2lPseudo",
    label: "F2L pseudo-slotting",
    region: opts.region ?? ["f2l", "f2l"],
    mode: "compete",
    strategies,
  };
}

/**
 * The exhaustive pair-order search as a `compete` Replacement over a method's F2L span.
 *
 * `compete` rather than `force` because the runner judges a compete unit on the **whole
 * solve**, not just the span (it solves once with the unit off and once on, keeping the
 * cheaper). That is exactly the right comparison: an order search minimizes F2L, and a
 * cheaper F2L can hand the last layer a worse case. Opt-in and off by default, like every
 * Replacement.
 */
export function f2lOrderReplacement(
  cases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: InsertSequenceOptions & { id?: string; region?: [string, string] } = {},
): Replacement {
  return {
    id: opts.id ?? "f2lOrder",
    label: "F2L pair order (exhaustive)",
    region: opts.region ?? ["f2l1", "f2l4"],
    mode: "compete",
    strategies: insertOrderStrategies(cases, opts),
  };
}
