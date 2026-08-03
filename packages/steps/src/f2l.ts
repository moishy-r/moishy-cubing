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

import { type AlgSet, regionLookup } from "@moishy/algsets";
import {
  type AlgCase,
  type AlgVariant,
  applyMoves,
  axisCanonical,
  type CaseLookup,
  type CubeState,
  homingRotation,
  invert,
  type MethodDefinition,
  type MoveFamily,
  parseAlg,
  type PieceRegion,
  pieceSignature,
  regionSolved,
  solvedCube,
  type Strategy,
} from "@moishy/cubing-core";
import { CROSS } from "./blocks.ts";

// The four AUF alignments an insert will try, as states to test recognition against.
const AUF_STATES = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));

/** The four F2L slots, named by their home position in the fixed frame. */
export type F2lSlot = "fr" | "fl" | "bl" | "br";

/** Every slot, in a fixed order. */
export const F2L_SLOTS: readonly F2lSlot[] = ["fr", "fl", "bl", "br"];

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
      for (const slot of F2L_SLOTS) {
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
  // The setup's goal is not "a case matches" but "an insert from here actually
  // finishes the step": some case, some variant, some pre/post AUF reaching the
  // step goal. Merely recognizable is too weak — a case can match a state and still
  // be unable to net a slot, and the search would happily stop at the cheapest such
  // dead end and hand the next phase something it cannot solve.
  const insertSucceeds = (s: CubeState): boolean => {
    const goal = f2lGoal(n);
    for (const pre of AUF_STATES) {
      const aligned = applyMoves(s, pre);
      const hit = lookup.find(aligned);
      if (!hit) continue;
      for (const v of hit.algs) {
        const after = applyMoves(aligned, v.moves);
        for (const post of AUF_STATES) if (goal(applyMoves(after, post))) return true;
      }
    }
    return false;
  };
  return {
    id: `f2l${n}Setup`,
    label: `F2L ${n} (setup + case)`,
    phases: [
      {
        kind: "search",
        id: `f2l${n}Setup`,
        goal: insertSucceeds,
        moves: F2L_MOVES,
        canFollow: axisCanonical,
        // A trigger, not an insertion: three moves frees any stuck pair.
        maxDepth: 3,
      },
      {
        kind: "algorithmic",
        id: `f2l${n}Insert`,
        goal: f2lGoal(n),
        cases: lookup,
        auf: ["U"],
      },
    ],
  };
}

/**
 * The Nth F2L step (`n` is 1-based): insert one more pair, whichever is cheapest.
 *
 * `sets` supplies the per-slot case data; several sets per slot are chained in the
 * order given, so a method passes its plain F2L set and its advanced one and gets
 * both. Give four steps `n = 1..4` and the whole of F2L is covered.
 */
export function f2lStep(
  n: number,
  sets: readonly Readonly<Record<F2lSlot, AlgSet>>[],
  opts: { id?: string; label?: string } = {},
): Step {
  const bySlot: Partial<Record<F2lSlot, CaseLookup>> = {};
  for (const slot of F2L_SLOTS) {
    const sig = slotSignature(slot);
    const lookups = sets.map((bySet) => regionLookup(bySet[slot], sig));
    // Merge the sets rather than chaining them: several sets can offer an alg for the
    // same pair position (a plain one and a shorter Advanced one), both correct, and
    // the cost race should see both. Chaining would let the first-listed set shadow
    // the other. See `slotSignature`.
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
  const lookup = anySlotLookup(bySlot);
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
