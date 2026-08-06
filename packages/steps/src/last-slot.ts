// Last-slot variants: solve the final F2L pair while doing something extra.
//
// ZBLS inserts the last pair *and* orients the last-layer edges, so the OLL that
// follows is guaranteed to be one of the seven OCLL shapes. OLS goes further and
// orients the corners too. They share a shape and a problem.
//
// **The problem is the slot.** These sets are authored for the front-right slot,
// because that is the one solvers learn — a few know FL as well, and otherwise they
// rotate so the pair is at FR. But a method's last slot is whichever one its earlier
// steps did not take, so the data only applies once the open slot is *physically* at FR.
//
// So the three inserts before it are run as a pair-*order* search (see ./f2l-order.ts):
// one strategy per choice of which three pairs go in and in what order, each ending with
// {@link alignOpenSlotToFront}. Which slot is left open is then something the strategy
// named rather than something the walk happened to leave, and there is nothing left for a
// separate "reserve a slot" mechanism to do — reserving one is leaving it out of the
// order. The cost race picks among all 24.
//
// Alignment is at most a single `y`. A slot two quarter turns away (the one diagonally
// opposite) is deliberately unreachable: `y2` to set up a last slot is not something a
// solver does, so the phase offers only `y` and `y'` and the strategy simply drops out
// of the race when neither suffices. That is also why the back-slot tie-break in
// ./f2l.ts matters here — it makes an equal-cost order leave a FRONT slot last, and both
// front slots are within one `y` of FR.

import { type AlgSet, aufInvariantLookup } from "@moishy/algsets";
import {
  type AlgorithmicPhase,
  applyMoves,
  type CaseLookup,
  type CubeState,
  type Extra,
  fallThrough,
  normalizeOrientation,
  orientationSignature,
  parseAlg,
  pieceSignature,
  regionSolved,
  regionSolvedAndEO,
  type Replacement,
  solvedCube,
  type Strategy,
} from "@moishy/cubing-core";
import { llOriented } from "./last-layer.ts";
import { insertOrderStrategies } from "./f2l-order.ts";
import {
  F2L,
  F2L_OFFER_ORDER,
  F2L_SLOT,
  F2L_SLOTS,
  type F2lSlot,
  openSlots,
  slotAt,
} from "./f2l.ts";

// The four y-powers as states. On a solved cube cubie index == slot index, so each state's
// `cp`/`ep` arrays *are* that rotation's position-relabelling map. A y-power never twists a
// corner or flips an edge (both are measured against the U-D axis), so permutation is the
// whole story and no orientation term is needed.
const Y_POWERS: CubeState[] = ["", "y", "y2", "y'"].map((m) =>
  m ? applyMoves(solvedCube(), parseAlg(m)) : solvedCube()
);

/** The y-power that carries `slot` round to the front-right position. */
function rotationToFront(slot: F2lSlot): CubeState {
  const target = F2L_SLOT[slot].corners[0];
  const fr = F2L_SLOT.fr.corners[0];
  // `r.cp[fr] === target` reads as: after r, the front-right position holds slot's cubie.
  return Y_POWERS.find((r) => r.cp[fr] === target) ?? Y_POWERS[0];
}

const RELABEL = Object.fromEntries(
  F2L_SLOTS.map((slot) => {
    const r = rotationToFront(slot);
    const corner = new Int8Array(8), edge = new Int8Array(12);
    for (let i = 0; i < 8; i++) corner[r.cp[i]] = i;
    for (let i = 0; i < 12; i++) edge[r.ep[i]] = i;
    return [slot, { r, corner, edge }];
  }),
) as Record<F2lSlot, { r: CubeState; corner: Int8Array; edge: Int8Array }>;

/**
 * Recognition for a last-slot set: the open pair and the edge-orientation pattern, both
 * read **in the frame where that pair's slot is at the front-right**.
 *
 * The pair alone is not enough — ZBLS both inserts the pair and orients the edges, so the
 * same pair position with a different edge-orientation state is a different case. And the
 * set's own full-facelet signature is too much: it pins the last-layer permutation that OLL
 * and PLL still have to fix, so it never matches a live state.
 *
 * **The frame is the part that is easy to get wrong, and was.** These sets are authored for
 * the front-right slot, and the obvious reading of that — "the FR *cubies*, corner 4 and
 * edge 8" — is wrong: an FR-authored alg solves whichever slot the cuber physically holds at
 * front-right, so a state with the FL or BR pair left open is an ordinary FR case after one
 * `y'`/`y`. Keying on the cubies rejects every one of those. Measured over 88 real
 * post-three-insert states: 45 are solvable within a single `y`, and the cubie-keyed
 * signature recognized 22 of them.
 *
 * Reading the pair's position *relative to its own slot* is not enough either, because
 * `pieceSignature` reports absolute slot indices and rotating the case relabels them. So
 * every index is mapped through {@link rotationToFront}, the rotation that brings the open
 * slot to the front.
 *
 * **This is a partial fix and the numbers are the honest ones.** End to end — recognized AND
 * the chosen case's alg actually reaching the goal — it takes the routes that complete from
 * 22 to 32 out of 85 states that reach the alignment, and it unlocks slots that were
 * previously impossible outright (a BL pair drifted to BR or FL: 4 of 4). But a BR pair at BR
 * completes on 2 of 17 and an FL pair at FL on 3 of 20, where brute force says every one of
 * those 37 is solvable by *some* alg in the set. So the projection lands on a key without
 * always landing on the right case: recognition matches, the alg then fails the goal, and the
 * candidate is dropped. It is safe — `runPhase` goal-checks, so a mis-recognition costs a
 * missed route, never a wrong solve — but the remaining ~35 states are unclaimed headroom, not
 * a solved problem. Do not quote a recognition-match count as if it were a solve count; that
 * error has already been made twice in this file's history.
 *
 * Rotation-invariant by construction, since it normalizes the frame before relabelling — so
 * it reads the same whether it runs before or after the alignment rotation. The alignment's
 * job is to *emit* that rotation for execution, not to make recognition work.
 */
export function lastSlotSignature(): (s: CubeState) => string {
  return (s) => {
    const n = normalizeOrientation(s);
    const open = openSlots(n);
    if (open.length !== 1) return "?"; // not a last-slot state; matches no case
    const { corner, edge } = RELABEL[open[0]];
    const cornerCubie = F2L_SLOT[open[0]].corners[0];
    const edgeCubie = F2L_SLOT[open[0]].edges[0];
    const cs = n.cp.indexOf(cornerCubie), es = n.ep.indexOf(edgeCubie);
    let eo = "";
    for (let i = 0; i < 12; i++) eo += n.eo[RELABEL[open[0]].r.ep[i]];
    return `${corner[cs]}.${n.co[cs]}/${edge[es]}.${n.eo[es]}/${eo}`;
  };
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
function zblsPhase(set: AlgSet, id = "zbls"): AlgorithmicPhase {
  return {
    kind: "algorithmic",
    id,
    goal: regionSolvedAndEO(F2L),
    cases: aufInvariantLookup(set, lastSlotSignature()),
    auf: ["U"],
  };
}

/**
 * ZBLS as a `compete` Replacement over a method's F2L steps: insert three pairs, then
 * finish the fourth with an alg that orients the last-layer edges on the way.
 *
 * One strategy per choice of which three pairs go in and in what order — 24 of them — each
 * followed by the alignment and the ZBLS alg. That is the pair-order search of ./f2l-order.ts,
 * and it needs no reservation at all: the predecessor had a dedicated goal that refused to
 * fill one particular slot, plus a second strategy that inserted greedily and aligned
 * whatever was left, and both are gone.
 *
 * **Twenty-four and not six, which an earlier pass here got wrong.** A last-slot set
 * constrains the slot's *physical* position, not which cubie pair sits in it, so an FL- or
 * BR-open state is an ordinary FR case after one `y'`/`y` — see {@link lastSlotSignature},
 * which reads the pair in the frame where its slot is at the front. Only BL, needing a `y2`,
 * is out of reach, and its orders simply fail the alignment and drop out of the race.
 *
 * That is worth stating because the opposite was concluded here first, from a recognition
 * failure: the old cubie-keyed signature matched none of those states, which was read as "no
 * alg applies". Brute-forced over the whole set on 88 real post-three-insert states, 45 are
 * solvable within a single `y` against the 22 the cubie-keyed signature could see. A
 * recognition miss is not evidence that no alg applies.
 *
 * What the alignment is for is emitting that rotation for execution — including the case
 * where an insert's own alg contained a net `y`, leaving the open slot correct but no longer
 * physically at front-right (measured: 32 of 166 completed orders hand over a drifted frame).
 * Nothing strips or rewrites a rotation.
 *
 * Each order carries the same short setup fallback the plain F2L steps do, and it is not
 * optional here: fixing which three pairs go in means a state some slot could have handled
 * may have nothing left for the slots this order allows. Without it the three-insert route
 * failed on 39 of 60 crosses, while recognition, once reached, was already 100%.
 *
 * `compete` rather than `force`: ZBLS costs more moves than a plain insert and pays for
 * itself only in the last layer, so whether it is worth it is a genuine cost question —
 * and the runner judges a compete unit on the *whole* solve, which is exactly that
 * comparison. Opt-in and off by default like every replacement.
 *
 * `region` is the whole F2L step, because the constraint is on the pair *order*: which slot
 * is left open is decided by the three inserts, not by the last one.
 */
export function zblsReplacement(
  set: AlgSet,
  f2lCases: Readonly<Record<F2lSlot, CaseLookup>>,
  opts: { id?: string; region?: [string, string] } = {},
): Replacement {
  return {
    id: opts.id ?? "zbls",
    label: "ZBLS",
    // The single F2L step (`f2lOrderedStep`). A method still using the four-step shape
    // passes `region: ["f2l1", "f2l4"]`.
    region: opts.region ?? ["f2l", "f2l"],
    mode: "compete",
    // Any three pairs, in any order. Whichever slot is left over is fine as long as it is
    // within one `y` of the front — no reservation, see above.
    strategies: insertOrderStrategies(f2lCases, {
      slots: F2L_OFFER_ORDER,
      take: 3,
      strategyPrefix: "zbls",
    }).map((s): Strategy => ({
      ...s,
      label: `ZBLS (${s.label})`,
      phases: [...s.phases, alignOpenSlotToFront(), zblsPhase(set)],
    })),
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
    region: opts.region ?? ["f2l", "oll"],
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
