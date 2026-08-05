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
  applyMoves,
  axisCanonical,
  type CaseLookup,
  type CubeState,
  type Extra,
  fallThrough,
  orientationSignature,
  parseAlg,
  pieceSignature,
  regionSolved,
  regionSolvedAndEO,
  type Replacement,
  type SearchPhase,
} from "@moishy/cubing-core";
import { CROSS } from "./blocks.ts";

// The AUF alignments an insert will try, as move lists.
const AUF_STATES = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));
import { llOriented } from "./last-layer.ts";
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

/** The goal of the Nth insert, with or without a reservation. */
function insertGoal(n: number, keep: F2lSlot | null): (s: CubeState) => boolean {
  if (keep) return f2lGoalLeavingOpen(n, keep);
  const crossSolved = regionSolved(CROSS);
  return (s) => crossSolved(s) && solvedSlotCount(s) >= n;
}

/** One insert phase, optionally reserving a slot. */
function insertPhase(n: number, cases: CaseLookup, keep: F2lSlot | null): AlgorithmicPhase {
  return { kind: "algorithmic", id: `insert${n}`, goal: insertGoal(n, keep), cases, auf: ["U"] };
}

/**
 * A short setup before an insert, for when no stored case applies to any slot the
 * reservation permits.
 *
 * The plain F2L steps each carry this as a fallback strategy; a reserved insert needs it
 * just as much, and needs it *more* — reserving a slot removes options, so a state that
 * some slot could have handled may have nothing left for the slots still allowed.
 * Omitting it is why reserving FR failed on 39 of 60 crosses while recognition, once
 * reached, was already 100%.
 *
 * The goal is "an insert from here will actually finish this step", not merely "a case
 * matches": a case can match and still be unable to net a slot, and the search would
 * happily stop at the cheapest such dead end. `runPhase` tries the zero-move option
 * first, so this costs nothing whenever an insert already works.
 */
function insertSetupPhase(n: number, cases: CaseLookup, keep: F2lSlot | null): SearchPhase {
  const goal = insertGoal(n, keep);
  const succeeds = (s: CubeState): boolean => {
    for (const pre of AUF_STATES) {
      const aligned = applyMoves(s, pre);
      const hit = cases.find(aligned);
      if (!hit) continue;
      for (const v of hit.algs) {
        const after = applyMoves(aligned, v.moves);
        for (const post of AUF_STATES) if (goal(applyMoves(after, post))) return true;
      }
    }
    return false;
  };
  return {
    kind: "search",
    id: `setup${n}`,
    goal: succeeds,
    moves: ["U", "D", "L", "R", "F", "B"],
    canFollow: axisCanonical,
    // A trigger, not an insertion — three moves frees any stuck pair.
    maxDepth: 3,
  };
}

/** setup + insert, repeated for the first three pairs. */
function threeInserts(cases: CaseLookup, keep: F2lSlot | null) {
  return [1, 2, 3].flatMap((n) => [insertSetupPhase(n, cases, keep), insertPhase(n, cases, keep)]);
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
          ...threeInserts(f2lCases, slot),
          alignSlotToFront(slot),
          zblsPhase(set, slot),
        ],
      },
      // Or insert greedily and align whatever is left, if it is within one `y`.
      {
        id: "zblsAligned",
        label: "ZBLS (align last slot)",
        phases: [
          ...threeInserts(f2lCases, null),
          alignOpenSlotToFront(),
          zblsPhase(set, slot),
        ],
      },
    ],
  };
}

/** Exported for a method that wants to assemble its own last-slot strategy. */
export { zblsPhase };

// --- Winter / Summer Variation ------------------------------------------------

/**
 * WV/SV recognition: last-layer orientation, plus the last pair's position.
 *
 * Read *mid-insert*, at the moment the pair is set up on top and about to go in. These
 * algs insert the pair while orienting the last-layer corners, landing on PLL — so
 * recognition keys on the orientation (like OLL) plus the pair setup that distinguishes
 * the pre-insert positions, and must NOT pin the last-layer permutation, which PLL
 * still fixes. The sets' own full-facelet signature does pin it, and so never matches.
 */
export function wvSvSignature(slot: F2lSlot = "fr"): (s: CubeState) => string {
  const pair = pieceSignature(F2L_SLOT[slot].corners, F2L_SLOT[slot].edges);
  return (s) => `${orientationSignature()(s)}/${pair(s)}`;
}

/**
 * Winter/Summer Variation as a checkpoint Extra: part-way through the last insert,
 * splice an alg that finishes the pair *and* orients the last-layer corners.
 *
 * The runner scans every prefix of the chosen last-slot alg for a point where the pair
 * is set up on top and a WV/SV case is recognized, then races that splice against
 * finishing normally — no hand-placed checkpoints needed.
 *
 * It fires rarely, and the arithmetic is worth stating rather than discovering. WV
 * requires the last-layer **edges already oriented** before the insert, which with F2L
 * otherwise complete happens on about 1 solve in 8 (the four LL edges must have an even
 * number misoriented, giving 8 states, one of which is all-oriented). On top of that the
 * data is authored for the front-right slot, so the last slot has to be there or within
 * a single `y` — hence the alignment phase, which costs nothing when it is already
 * right and drops the extra when a `y2` would be needed.
 *
 * Unlike ZBLS its payoff lands *inside* OLL rather than merely reshaping it: the last
 * layer comes out fully oriented, so the region covers the OLL step outright.
 */
export function wvSvExtra(
  wv: AlgSet,
  sv: AlgSet,
  opts: { id?: string; region?: [string, string]; slot?: F2lSlot } = {},
): Extra {
  const slot = opts.slot ?? "fr";
  const sig = wvSvSignature(slot);
  return {
    id: opts.id ?? "winterSummerVariation",
    label: "Winter/Summer Variation",
    region: opts.region ?? ["f2l4", "oll"],
    // `compete`, not `force`. This is an opportunistic shortcut, so "use it only if it
    // helps" is exactly right — and it is not always cheaper: splicing WV mid-insert
    // buys a solved OLL but spends a longer insert to get it, which does not always
    // repay. Forced, it fired and made a measured solve worse (55.75 -> 58.58).
    mode: "compete",
    trigger: { kind: "checkpoint" },
    strategies: [{
      id: "wvSv",
      phases: [
        alignOpenSlotToFront("wvSvAlign"),
        {
          kind: "algorithmic",
          id: "wvSv",
          // Covers both steps of the region: the pair goes in AND the last layer ends
          // fully oriented, so the next thing is PLL.
          goal: (s) => regionSolved(F2L)(s) && llOriented(s),
          cases: fallThrough(
            aufInvariantLookup(wv, sig),
            aufInvariantLookup(sv, sig),
          ),
          auf: ["U"],
        },
      ],
    }],
  };
}
