// F2L: the four first-two-layers slots, and the steps that fill them.
//
// The shape here answers a question the Step/Strategy/Phase model does not obviously
// express: F2L is four *interchangeable* instances of the same work, solved in an
// order that depends on the scramble, not a fixed sequence. It needs no new
// mechanism. The trick is that a step's identity is **"the Nth pair inserted"**, not
// "the FR pair":
//
//   * the goal of step N is "the cross is intact and at least N slots are solved" —
//     a count, so any slot may be the one that advances it;
//   * the lookup merges all four slots' candidates into a single case whose `algs`
//     are every slot's alternatives, and `runPhase` already tries every alg of a case
//     and keeps the cheapest that reaches the goal.
//
// So "look at all four pairs, solve the cheapest, look again" falls out of machinery
// that already exists, and three useful properties come free:
//
//   * A slot that is already solved costs nothing — `runPhase` treats a phase whose
//     goal is met as a zero-move skip. That is what lets an X-cross (which solves the
//     cross *and* a pair, replacing only the cross step) hand over a finished pair
//     with no F2L-side knowledge of it at all.
//   * An Advanced F2L alg frees a piece trapped in another slot, opening that slot.
//     If that does not net a slot, the count goal rejects it. No special case.
//   * The last slot is its own Step, so a last-slot alternative (ZBLS, OLS) is an
//     ordinary Replacement over `[f2l4, f2l4]`, and Winter/Summer Variation an
//     ordinary checkpoint Extra over `[f2l4, <first LL step>]`.
//
// Slots are tracked by *cubie*, so a mid-solve rotation never changes which pair a
// step is talking about; {@link slotAt} maps back to the physical position for
// display, which is what a solver holding the cube sees.
//
// What this shape does *not* give is the best pair order: each step commits to the
// cheapest single insert it can see, and a locally cheap one can leave the rest of F2L
// dearer than it saved (measured: about a tenth of F2L). Searching the order is
// ./f2l-order.ts's job, as a Replacement over the same span rather than a change here —
// the four Steps are load-bearing, since a last-slot Replacement needs an `f2l4` to
// replace.

import { type AlgSet, regionLookup } from "@moishy/algsets";
import {
  type AlgCase,
  type AlgVariant,
  applyMoves,
  aufOptions,
  axisCanonical,
  type CaseLookup,
  type CubeState,
  homingRotation,
  invert,
  type MethodDefinition,
  type Move,
  type MoveFamily,
  type PieceRegion,
  pieceSignature,
  regionSolved,
  type SearchPhase,
  solvedCube,
  type Strategy,
} from "@moishy/cubing-core";
import { CROSS } from "./blocks.ts";

/** The four F2L slots, named by their home position in the fixed frame. */
export type F2lSlot = "fr" | "fl" | "bl" | "br";

/** Every slot, in a fixed canonical order. */
export const F2L_SLOTS: readonly F2lSlot[] = ["fr", "fl", "bl", "br"];

/**
 * The order slots are *offered* in when several could be solved — back slots first.
 *
 * This is a real solving preference, not a formality. Where two slots are equally
 * cheap, filling a back one is better: it leaves the FRONT slots open, and those are
 * the ones you can see. Keeping a back slot open puts the next pair in your blind spot.
 *
 * It costs nothing to implement because `runPhase` replaces its best candidate only on
 * a strict improvement, so the first-offered wins a tie — and ties are common here
 * rather than hypothetical, since mirrored algs are exactly equal under the cost model
 * (`R U R'` and `L' U' L` are both 0.8 + 1.0 + 0.8).
 *
 * It also happens to line up with what a last-slot alg set wants: solving the back
 * slots early leaves a FRONT slot last, and the front slots are the ones that are at
 * most a single `y` from FR, where sets like `zbls` are authored. BL — the one that
 * would need a `y2` — is the first to be filled, not the last.
 */
export const F2L_OFFER_ORDER: readonly F2lSlot[] = ["bl", "br", "fr", "fl"];

/** The corner and edge each slot holds (Kociemba indices). */
export const F2L_SLOT: Readonly<Record<F2lSlot, PieceRegion>> = {
  fr: { corners: [4], edges: [8] }, // DFR + FR
  fl: { corners: [5], edges: [9] }, // DLF + FL
  bl: { corners: [6], edges: [10] }, // DBL + BL
  br: { corners: [7], edges: [11] }, // DRB + BR
};

/** The whole first two layers: the cross plus all four slots. */
export const F2L: PieceRegion = {
  corners: [4, 5, 6, 7],
  edges: [4, 5, 6, 7, 8, 9, 10, 11],
};

const slotSolvedFns = Object.fromEntries(
  F2L_SLOTS.map((s) => [s, regionSolved(F2L_SLOT[s])]),
) as Record<F2lSlot, (s: CubeState) => boolean>;

/** True iff `slot` holds its own corner and edge, correctly oriented. */
export function slotSolved(slot: F2lSlot): (s: CubeState) => boolean {
  return slotSolvedFns[slot];
}

/** How many of the four slots are solved. */
export function solvedSlotCount(s: CubeState): number {
  let n = 0;
  for (const slot of F2L_SLOTS) if (slotSolvedFns[slot](s)) n++;
  return n;
}

/** The slots still open, in fixed order. */
export function openSlots(s: CubeState): F2lSlot[] {
  return F2L_SLOTS.filter((slot) => !slotSolvedFns[slot](s));
}

/**
 * Where a slot's pair currently *is*, as a physical position — for display.
 *
 * A slot is identified internally by the cubies it holds, so a mid-solve rotation
 * never changes which pair a step means. But a solver holding a cube that an alg's
 * `y` has turned sees the "back-right" pair sitting at back-left, so anything shown
 * to a human should be named by position. This maps the one to the other: given the
 * live state, the physical slot that `slot`'s home currently occupies.
 */
export function slotAt(s: CubeState, slot: F2lSlot): F2lSlot {
  // The centers say how the cube is held. Reproduce that orientation on a solved
  // cube and read off where this slot's own corner sits: that is the physical
  // position a solver sees it in.
  const back = homingRotation(s);
  if (back.length === 0) return slot;
  const held = applyMoves(solvedCube(), invert(back));
  const position = held.cp.indexOf(F2L_SLOT[slot].corners[0]);
  return F2L_SLOTS.find((k) => F2L_SLOT[k].corners[0] === position) ?? slot;
}

/**
 * Recognition key for one slot: where the pair's two pieces are, and nothing else.
 *
 * Deliberately *not* keyed on what currently occupies the slot. Doing so looks
 * attractive — a few Advanced cases have their pair in an ordinary position and are
 * "advanced" only because a foreign piece blocks the slot, so they share a pair
 * signature with a plain case — but it is wrong twice over:
 *
 *   * It is unnecessary. That blocker always belongs to another, still-unsolved slot,
 *     so evicting it costs nothing, and the plain alg does exactly that while placing
 *     the pair. Measured: of the 42 advanced FR cases, 6 share a pair position with a
 *     plain case and the plain alg solves all 6.
 *   * It breaks every pair but the last. Both sets' recognition states have the other
 *     three slots solved, so the slot's occupant is always a U-layer cubie there —
 *     while in a live post-cross state it is usually another slot's piece, a value no
 *     stored case has. Keying on it stalled 7 of 10 real scrambles on the FIRST pair.
 *
 * So the two sets are *merged* per position rather than chained: both algs become
 * variants of the same case and the cost race picks between them.
 */
export function slotSignature(slot: F2lSlot): (s: CubeState) => string {
  return pieceSignature(F2L_SLOT[slot].corners, F2L_SLOT[slot].edges);
}

/**
 * Merges per-slot lookups into one, returning a synthetic case whose `algs` are every
 * slot's candidates for the live state.
 *
 * This is what makes "check all four pairs, take the cheapest" work with no new
 * mechanism: `runPhase` already tries every alg a case carries and keeps the cheapest
 * that reaches the goal, so handing it all four slots' options *is* the race. Each
 * variant is tagged `"<slot>:<caseId>"` in `source`, so the chosen one is still
 * traceable back to the slot and case it came from.
 */
export function anySlotLookup(bySlot: Partial<Record<F2lSlot, CaseLookup>>): CaseLookup {
  return {
    find(state) {
      const algs: AlgVariant[] = [];
      // Back slots first, so they win a tie — see F2L_OFFER_ORDER.
      for (const slot of F2L_OFFER_ORDER) {
        const lookup = bySlot[slot];
        if (!lookup) continue;
        const hit = lookup.find(state);
        if (!hit) continue;
        for (const v of hit.algs) algs.push({ ...v, source: `${slot}:${hit.id}` });
      }
      return algs.length === 0 ? null : { id: "f2l", algs } satisfies AlgCase;
    },
  };
}

/** The slot and case id a chosen variant came from (see {@link anySlotLookup}). */
export function variantSlot(v: AlgVariant): { slot: F2lSlot; caseId: string } | null {
  const [slot, ...rest] = (v.source ?? "").split(":");
  if (!F2L_SLOTS.includes(slot as F2lSlot) || rest.length === 0) return null;
  return { slot: slot as F2lSlot, caseId: rest.join(":") };
}

/**
 * Goal for the Nth F2L step: the cross intact, and at least `n` slots solved.
 *
 * Count-based rather than slot-specific, which is what lets the pairs be solved in
 * whatever order is cheapest for this scramble. It also makes a wrong answer
 * impossible to accept: an alg that fills one slot by emptying another nets zero and
 * simply fails the goal.
 */
export function f2lGoal(n: number): (s: CubeState) => boolean {
  const crossSolved = regionSolved(CROSS);
  return (s) => crossSolved(s) && solvedSlotCount(s) >= n;
}

/** A core Step, as a method definition lists them. */
type Step = MethodDefinition["steps"][number];

// Outer faces only. An F2L insertion is an outer-move manipulation; a slice or wide
// move would drag the cross out of place and have to be undone.
const F2L_MOVES: MoveFamily[] = ["U", "D", "L", "R", "F", "B"];

/**
 * "An insert from here will actually finish the step" — the goal a setup search aims
 * at, given the goal the insert itself has to reach.
 *
 * Merely *recognizable* is too weak: a case can match a state and still be unable to
 * net a slot, and a search aimed at recognition would happily stop at the cheapest
 * such dead end and hand the next phase something it cannot solve. So this asks the
 * real question — is there some case, some variant, some pre/post alignment that
 * reaches `goal` — by trying exactly what `runPhase` will try.
 *
 * The alignment set is built with cubing-core's {@link aufOptions} rather than a
 * hand-written list, so the two cannot drift apart in *form*. `auf` must be a subset of
 * the insert phase's own families — never a superset. A subset only under-promises: the
 * search stops where a narrower insert already works, and an insert with more alignments
 * available can still do at least that, so what it costs is coverage (and possibly a
 * dearer setup than necessary), not correctness. A superset is the unsafe direction — it
 * aims the search at a goal the insert cannot reach, so the search succeeds and the insert
 * then fails.
 */
export function insertReachable(
  goal: (s: CubeState) => boolean,
  cases: CaseLookup,
  auf: MoveFamily[] = ["U"],
): (s: CubeState) => boolean {
  const alignments: Move[][] = aufOptions(auf);
  return (s) => {
    for (const pre of alignments) {
      const aligned = pre.length === 0 ? s : applyMoves(s, pre);
      const hit = cases.find(aligned);
      if (!hit) continue;
      for (const v of hit.algs) {
        const after = applyMoves(aligned, v.moves);
        for (const post of alignments) {
          if (goal(post.length === 0 ? after : applyMoves(after, post))) return true;
        }
      }
    }
    return false;
  };
}

/**
 * The short-setup search phase shared by every insert that has a fallback: pull a
 * stuck pair out with a trigger, then let an ordinary case read off what it became.
 *
 * Three moves, outer faces only. Searching for the whole insertion instead is a
 * 6-face search to depth 12 that does not terminate — the first shape of this
 * fallback, and a dead end worth recording. `runPhase` reaches the goal check on the
 * start state before expanding anything, so this costs one goal evaluation and no
 * moves whenever an insert already works.
 *
 * `useAStar` with no heuristic — i.e. uniform-cost search — rather than the IDA* default,
 * and the reason is the *goal*, not the state space. This goal is expensive (it runs a
 * whole trial insert per state), and IDA* re-expands its entire tree once per cost
 * threshold; with real-valued MCC costs there are many thresholds between zero and three
 * moves, so the same states get their goal re-evaluated over and over. A* visits each
 * once. Both are cost-optimal, so this changes only the clock. Measured over the 240
 * setups a 60-scramble CFOP run actually reaches: **88x fewer nodes**, 4.8x less time in
 * the setups themselves, 2.2x faster whole solves (1732 -> 775 ms), and **zero** cost
 * disagreements — F2L cost and move count identical on all 60.
 */
export function insertSetupPhase(
  id: string,
  goal: (s: CubeState) => boolean,
  cases: CaseLookup,
  auf: MoveFamily[] = ["U"],
  maxDepth = 3,
): SearchPhase {
  return {
    kind: "search",
    id,
    goal: insertReachable(goal, cases, auf),
    moves: F2L_MOVES,
    canFollow: axisCanonical,
    maxDepth,
    useAStar: true,
  };
}

/**
 * Fallback for the Nth pair: a short **setup**, then an ordinary case.
 *
 * The case data covers a pair whose pieces are in the U layer or its own slot, and
 * (via `advanced-f2l`) many trapped configurations — but not every way three unsolved
 * slots can hold each other's pieces mid-F2L. Measured over real scrambles, algs alone
 * finish F2L on 8 of 10 and stall on the third pair of the rest.
 *
 * What a solver does there is not to compute a bespoke insertion: it is to pull the
 * stuck pair out with a trigger and then read off the case it has become. So this
 * strategy searches only for a short prefix that makes *some* slot recognizable, and
 * hands the rest to the same lookup the algorithmic strategy uses. That is a search
 * over a few hundred states, where searching for the whole insertion is a 6-face
 * search to depth 12 that does not terminate — the first shape of this fallback, and
 * a dead end worth recording.
 *
 * It is registered alongside the algorithmic strategy and loses the cost race
 * whenever a case applies outright, so it only ever does the work no case can.
 */
export function f2lSetupStrategy(n: number, lookup: CaseLookup): Strategy {
  const goal = f2lGoal(n);
  return {
    id: `f2l${n}Setup`,
    label: `F2L ${n} (setup + case)`,
    phases: [
      insertSetupPhase(`f2l${n}Setup`, goal, lookup),
      {
        kind: "algorithmic",
        id: `f2l${n}Insert`,
        goal,
        cases: lookup,
        auf: ["U"],
      },
    ],
  };
}

/**
 * One lookup per slot, each offering every set's algs for that pair's position.
 *
 * The sets are *merged* rather than chained: several can offer an alg for the same pair
 * position (a plain one and a shorter Advanced one), both correct, and the cost race
 * should see both. Chaining would let the first-listed set shadow the other. See
 * {@link slotSignature}.
 *
 * A step that does not care which pair it takes wants {@link f2lLookup}, the merge of
 * all four. A step that has *named* its slot — the exhaustive pair-order search — wants
 * the one lookup, which is both more meaningful and about four times less work per
 * recognition.
 */
export function f2lSlotLookups(
  sets: readonly Readonly<Record<F2lSlot, AlgSet>>[],
): Record<F2lSlot, CaseLookup> {
  const bySlot: Partial<Record<F2lSlot, CaseLookup>> = {};
  for (const slot of F2L_SLOTS) {
    const sig = slotSignature(slot);
    const lookups = sets.map((bySet) => regionLookup(bySet[slot], sig));
    bySlot[slot] = lookups.length === 1 ? lookups[0] : {
      find(s) {
        const algs: AlgVariant[] = [];
        let id = "";
        for (const l of lookups) {
          const hit = l.find(s);
          if (!hit) continue;
          if (!id) id = hit.id;
          algs.push(...hit.algs);
        }
        return algs.length === 0 ? null : { id, algs } satisfies AlgCase;
      },
    };
  }
  return bySlot as Record<F2lSlot, CaseLookup>;
}

/**
 * The lookup an F2L step uses when it does not care which pair it takes: all four slots'
 * candidates, merged into one case (see {@link anySlotLookup}).
 *
 * `sets` supplies the per-slot case data, so a method passes its plain F2L set and its
 * advanced one and gets both competing.
 */
export function f2lLookup(sets: readonly Readonly<Record<F2lSlot, AlgSet>>[]): CaseLookup {
  return anySlotLookup(f2lSlotLookups(sets));
}

/**
 * The Nth F2L step (`n` is 1-based): insert one more pair, whichever is cheapest.
 *
 * `sets` supplies the per-slot case data; several sets per slot are merged, so a method
 * passes its plain F2L set and its advanced one and gets both competing.
 */
export function f2lStep(
  n: number,
  sets: readonly Readonly<Record<F2lSlot, AlgSet>>[],
  opts: { id?: string; label?: string } = {},
): Step {
  const lookup = f2lLookup(sets);
  return {
    id: opts.id ?? `f2l${n}`,
    label: opts.label ?? `F2L ${n}`,
    strategies: [
      {
        id: `f2l${n}`,
        phases: [{
          kind: "algorithmic",
          id: `f2l${n}`,
          goal: f2lGoal(n),
          cases: lookup,
          auf: ["U"],
        }],
      },
      // Only wins where no stored case applies — see `f2lSetupStrategy`.
      f2lSetupStrategy(n, lookup),
    ],
  };
}

/** All four F2L steps, in order. */
export function f2lSteps(sets: readonly Readonly<Record<F2lSlot, AlgSet>>[]): Step[] {
  return [1, 2, 3, 4].map((n) => f2lStep(n, sets));
}
