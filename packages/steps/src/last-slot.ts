// Last-slot variants: solve the final F2L pair while doing something extra.
//
// ZBLS inserts the last pair *and* orients the last-layer edges, so the OLL that
// follows is guaranteed to be one of the seven OCLL shapes. OLS goes further and
// orients the corners too. They share a shape and a problem.
//
// **The problem is the slot.** These sets are authored for the front-right slot,
// because that is the one solvers learn — a few know FL as well, and otherwise they
// rotate so the pair is at FR. But a method's last slot is whichever one its earlier
// steps did not take, so the data only applies once the open slot is *physically* at
// FR. Two routes get there, and they are registered as separate strategies so the cost
// race picks between them rather than a rule deciding in advance:
//
//   * keep the FR pair back deliberately — the three inserts carry a goal that refuses
//     to solve it ({@link f2lGoalLeavingOpen}) — then align if the frame has drifted;
//   * insert greedily and align whatever is left ({@link alignOpenSlotToFront}).
//
// Alignment is at most a single `y`. A slot two quarter turns away (the one diagonally
// opposite) is deliberately unreachable: `y2` to set up a last slot is not something a
// solver does, so the phase offers only `y` and `y'` and the strategy simply drops out
// of the race when neither suffices. That is also why the back-slot tie-break in
// ./f2l.ts matters here — it leaves a FRONT slot last, and both front slots are within
// one `y` of FR.

import { type AlgSet, aufInvariantLookup } from "@moishy/algsets";
import {
  type AlgorithmicPhase,
  type CaseLookup,
  type CubeState,
  parseAlg,
  pieceSignature,
  regionSolved,
  regionSolvedAndEO,
  type Replacement,
} from "@moishy/cubing-core";
import { CROSS } from "./blocks.ts";
import {
  F2L,
  F2L_SLOT,
  type F2lSlot,
  openSlots,
  slotAt,
  slotSolved,
  solvedSlotCount,
} from "./f2l.ts";

/**
 * Like `f2lGoal`, but refusing to fill one particular slot.
 *
 * This is what reserves a slot for a last-slot alg set, and it is a *goal* rather than
 * a scoring preference on purpose: reserving the slot has to hold, and a preference
 * expressed through lookahead would only hold when lookahead happened to be deep
 * enough. (It is not: raising F2L lookahead depth was measured at ~13x cost per level
 * for a slightly worse result — see the changelog.)
 */
export function f2lGoalLeavingOpen(n: number, keep: F2lSlot): (s: CubeState) => boolean {
  const crossSolved = regionSolved(CROSS);
  const keepSolved = slotSolved(keep);
  return (s) => crossSolved(s) && !keepSolved(s) && solvedSlotCount(s) >= n;
}

/**
 * Recognition for a last-slot set: the pair, plus the edge-orientation pattern.
 *
 * The pair alone is not enough — ZBLS both inserts the pair and orients the edges, so
 * the same pair position with a different edge-orientation state is a different case.
 * And the set's own full-facelet signature is too much: it pins the last-layer
 * permutation that OLL and PLL still have to fix, so it never matches a live state.
 */
export function lastSlotSignature(slot: F2lSlot = "fr"): (s: CubeState) => string {
  const pair = pieceSignature(F2L_SLOT[slot].corners, F2L_SLOT[slot].edges);
  return (s) => `${pair(s)}/${s.eo.join("")}`;
}

// A rotation offered as a case, so the phase can emit `y` or `y'` and nothing else. A
// search over the `y` family would also reach `y2` (one move, three amounts), which is
// exactly what must not happen.
const Y_TURNS: CaseLookup = {
  find: () => ({
    id: "align",
    algs: [{ moves: parseAlg("y") }, { moves: parseAlg("y'") }],
  }),
};

/**
 * Bring the one remaining open slot round to the physical front-right, in at most a
 * single `y`.
 *
 * `runPhase` tries the zero-move option first, so this costs nothing when the slot is
 * already there. It yields no candidate at all when the slot is diagonally opposite,
 * dropping its strategy from the race rather than spending a `y2`.
 */
export function alignOpenSlotToFront(id = "align"): AlgorithmicPhase {
  return {
    kind: "algorithmic",
    id,
    goal: (s) => {
      const open = openSlots(s);
      return open.length === 1 && slotAt(s, open[0]) === "fr";
    },
    cases: Y_TURNS,
    // No AUF: a U turn cannot move a slot, and offering one would only add noise.
    auf: [],
  };
}

/** Bring a *named* slot round to the physical front-right, in at most a single `y`. */
export function alignSlotToFront(
  slot: F2lSlot,
  id = "align",
): AlgorithmicPhase {
  return {
    kind: "algorithmic",
    id,
    goal: (s) => slotAt(s, slot) === "fr",
    cases: Y_TURNS,
    auf: [],
  };
}

/** The ZBLS phase itself: last slot in, every edge oriented. */
function zblsPhase(
  set: AlgSet,
  slot: F2lSlot,
  id = "zbls",
): AlgorithmicPhase {
  return {
    kind: "algorithmic",
    id,
    goal: regionSolvedAndEO(F2L),
    cases: aufInvariantLookup(set, lastSlotSignature(slot)),
    auf: ["U"],
  };
}

/** One plain insert phase, optionally reserving a slot. */
function insertPhase(
  n: number,
  cases: CaseLookup,
  keep: F2lSlot | null,
): AlgorithmicPhase {
  const crossSolved = regionSolved(CROSS);
  return {
    kind: "algorithmic",
    id: `insert${n}`,
    goal: keep
      ? f2lGoalLeavingOpen(n, keep)
      : (s: CubeState) => crossSolved(s) && solvedSlotCount(s) >= n,
    cases,
    auf: ["U"],
  };
}

/**
 * ZBLS as a `compete` Replacement over a method's F2L steps: insert three pairs
 * normally, then finish the fourth with an alg that orients the last-layer edges on the
 * way.
 *
 * `compete` is right here rather than `force`: ZBLS costs more moves than a plain
 * insert and pays for itself only in the last layer, so whether it is worth it is a
 * genuine cost question — and the runner judges a compete unit on the *whole* solve,
 * which is exactly the comparison. It is opt-in and off by default like every
 * replacement.
 *
 * `region` is the full F2L span because the constraint is on the pair *order*, not just
 * the final insert: reserving a slot is something the earlier steps have to do.
 */
export function zblsReplacement(
  set: AlgSet,
  f2lCases: CaseLookup,
  opts: { id?: string; region?: [string, string]; slot?: F2lSlot } = {},
): Replacement {
  const slot = opts.slot ?? "fr";
  return {
    id: opts.id ?? "zbls",
    label: "ZBLS",
    region: opts.region ?? ["f2l1", "f2l4"],
    mode: "compete",
    strategies: [
      // Reserve the slot the data is authored for, and keep it reserved.
      {
        id: "zblsReserved",
        label: "ZBLS (slot reserved)",
        phases: [
          insertPhase(1, f2lCases, slot),
          insertPhase(2, f2lCases, slot),
          insertPhase(3, f2lCases, slot),
          alignSlotToFront(slot),
          zblsPhase(set, slot),
        ],
      },
      // Or insert greedily and align whatever is left, if it is within one `y`.
      {
        id: "zblsAligned",
        label: "ZBLS (align last slot)",
        phases: [
          insertPhase(1, f2lCases, null),
          insertPhase(2, f2lCases, null),
          insertPhase(3, f2lCases, null),
          alignOpenSlotToFront(),
          zblsPhase(set, slot),
        ],
      },
    ],
  };
}

/** Exported for a method that wants to assemble its own last-slot strategy. */
export { zblsPhase };
