import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  applyMoves,
  type CubeState,
  parseAlg,
  type PhaseSegment,
  regionSolved,
  runPhase,
  solvedCube,
  type Strategy,
} from "@moishy/cubing-core";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { blockSearch, CROSS } from "./blocks.ts";
import { F2L, F2L_OFFER_ORDER, type F2lSlot, f2lSlotLookups, slotSolved } from "./f2l.ts";
import {
  crossPlus,
  dCorrectionPhase,
  exactProgress,
  f2lOrderReplacement,
  insertSequencePhases,
  insertSequenceStrategy,
  pseudoProgress,
  slotOrders,
} from "./f2l-order.ts";

const CASES = f2lSlotLookups([f2lBySlot, advancedF2lBySlot]);
const cross = blockSearch("cross", CROSS, { maxDepth: 8 });
const f2lSolved = regionSolved(F2L);

// Six scrambles is enough to exercise the sequence end to end and stays fast; the wide
// aggregate comparison against the greedy Steps lives in the cfop package.
const SCRAMBLES = [
  "D2 F2 U2 R2 B2 D B2 U' L2 D' L2 F' R' U2 B U2 F' L' B2 R2",
  "B2 L2 D' B2 D2 R2 U B2 U2 R2 F2 L' U' F' L2 B U2 R' D' F2",
  "F' L2 U2 F2 D2 F R2 F' U2 B' R2 U' L' B2 D2 R' F2 D2 L U'",
  "U2 R2 B2 U' F2 D' F2 U2 R2 U' B' L' D2 B2 R U' L2 F' R2 D",
  "R2 F2 U R2 D' B2 D F2 U' R2 B2 L' B' D2 F U' L2 B' R U2 L",
  "L2 D2 B2 R2 D' L2 U B2 U2 F2 D' R' F' U B2 L D' B' R2 U2 F",
];

/** The state each scramble leaves after the cross — where an insert sequence starts. */
function afterCross(scramble: string): CubeState {
  const seg = runPhase(cross, applyMoves(solvedCube(), parseAlg(scramble)));
  assert(seg, `no cross for "${scramble}"`);
  return seg.endState;
}

/** Runs a strategy's phases in order, cheapest per phase. `null` if any phase fails. */
function runStrategy(
  strategy: Strategy,
  start: CubeState,
): { end: CubeState; cost: number; phases: PhaseSegment[] } | null {
  let cur = start, cost = 0;
  const phases: PhaseSegment[] = [];
  for (const phase of strategy.phases) {
    const seg: PhaseSegment | null = runPhase(phase, cur);
    if (!seg) return null;
    cur = seg.endState;
    cost += seg.cost;
    phases.push(seg);
  }
  return { end: cur, cost, phases };
}

Deno.test("slotOrders enumerates every ordering, offer order first", () => {
  const all = slotOrders();
  assertEquals(all.length, 24, "4! orderings of the four slots");
  assertEquals(new Set(all.map((o) => o.join(""))).size, 24, "all distinct");
  for (const order of all) assertEquals(new Set(order).size, 4, "no slot twice");
  // The listing order is a tie-break, not cosmetics: a stable sort keeps the first-listed
  // winner, so the head must be the back-slots-first preference the greedy path expresses.
  assertEquals(all[0], [...F2L_OFFER_ORDER]);

  // Three at a time — what a last-slot route needs, since it leaves one slot open.
  const three = slotOrders(F2L_OFFER_ORDER, 3);
  assertEquals(three.length, 24, "4 * 3 * 2 ways to pick and order three of four");
  for (const order of three) assertEquals(order.length, 3);
  // Excluding a slot is how a slot gets reserved; there is no other mechanism.
  const withoutFr = slotOrders(F2L_OFFER_ORDER.filter((s) => s !== "fr"), 3);
  assertEquals(withoutFr.length, 6, "3! orderings of the other three");
  for (const order of withoutFr) assertFalse(order.includes("fr"), "FR must stay reserved");
});

Deno.test("crossPlus is the cross, plus exactly the named slots", () => {
  assertEquals(crossPlus([]), { corners: [], edges: CROSS.edges });
  assertEquals(crossPlus(["fr"]), { corners: [4], edges: [...CROSS.edges, 8] });
  // All four slots is the whole F2L, which is what makes the last insert's goal complete.
  const all = crossPlus(F2L_OFFER_ORDER);
  assertEquals([...all.corners].sort(), [...F2L.corners].sort());
  assertEquals([...all.edges].sort((a, b) => a - b), [...F2L.edges].sort((a, b) => a - b));
});

// The goals must be monotone and must finish: level k names every slot targeted so far, so
// the last level's goal is the whole F2L. Without that the sequence could "complete" with a
// slot it targeted early and later broke.
Deno.test("an insert sequence's goals are monotone and end at the whole F2L", () => {
  const order: F2lSlot[] = ["bl", "fr", "br", "fl"];
  const phases = insertSequencePhases(order, CASES);
  assertEquals(phases.length, 8, "a setup and an insert per pair");
  const inserts = phases.filter((p) => p.kind === "algorithmic");
  assertEquals(inserts.map((p) => p.id), ["insert1", "insert2", "insert3", "insert4"]);

  // A state with the first two of this order's slots filled and the rest scrambled meets
  // goal 2 but not goal 3 — and meeting goal 4 implies the whole F2L is solved.
  const solved = solvedCube();
  assert(inserts[3].goal(solved) && f2lSolved(solved));
  for (let k = 0; k < 4; k++) {
    const region = crossPlus(order.slice(0, k + 1));
    assertEquals(
      inserts[k].goal(solved),
      regionSolved(region)(solved),
      `goal ${k + 1} should be the cross plus this order's first ${k + 1} slots`,
    );
  }
  // Monotone: each goal implies every earlier one, so a state that fails goal k fails every
  // later goal too. Checked as the property over a spread of states rather than on one
  // hand-picked alg, which is how a guard like this ends up passing vacuously.
  const families = ["U", "D", "L", "R", "F", "B"];
  let checked = 0, mixed = 0;
  for (const a of families) {
    for (const b of families) {
      for (const c of families) {
        const s = applyMoves(solved, parseAlg(`${a} ${b}2 ${c}'`));
        const met = inserts.map((p) => p.goal(s));
        for (let k = 1; k < met.length; k++) {
          if (met[k]) assert(met[k - 1], `goal ${k + 1} met without goal ${k}`);
        }
        if (met[0] && !met[3]) mixed++;
        checked++;
      }
    }
  }
  assert(checked > 200, `only ${checked} states checked`);
  // Guard against vacuity the other way: the population must contain states that satisfy an
  // early goal but not the last, or "monotone" would be trivially true on all-false rows.
  assert(mixed > 0, "no state met an early goal but not the last — population too narrow");
});

Deno.test("exactProgress and pseudoProgress differ exactly by a D offset", () => {
  const slots: F2lSlot[] = ["fr", "bl"];
  const exact = exactProgress(slots);
  const pseudo = pseudoProgress(slots);
  const solved = solvedCube();
  assert(exact(solved) && pseudo(solved));
  // Offset the whole bottom: still "in place" relative to itself, no longer exact.
  const offset = applyMoves(solved, parseAlg("D"));
  assertFalse(exact(offset), "an offset cross is not exactly solved");
  assert(pseudo(offset), "but it is solved up to a D offset");
  // Neither accepts a state that no D turn puts right.
  const broken = applyMoves(solved, parseAlg("R"));
  assertFalse(exact(broken));
  assertFalse(pseudo(broken));
});

Deno.test("dCorrectionPhase spends nothing when there is no offset, one D when there is", () => {
  const phase = dCorrectionPhase();
  const none = runPhase(phase, solvedCube());
  assert(none, "an exact F2L must still satisfy the correction phase");
  assertEquals(none.moves.length, 0, "and cost no moves");
  for (const d of ["D", "D2", "D'"]) {
    const seg = runPhase(phase, applyMoves(solvedCube(), parseAlg(d)));
    assert(seg, `no correction found for a ${d} offset`);
    assertEquals(seg.moves.length, 1, `correcting ${d} should take one move`);
    assertEquals(seg.moves[0].family, "D");
    assert(f2lSolved(seg.endState), `${d} offset not actually corrected`);
  }
});

// The substance: a named order really does insert those pairs, in that order, and lands the
// whole F2L. Run one order per scramble rather than all 24, to keep this quick — the
// aggregate quality comparison is in the cfop package.
Deno.test("an insert-order strategy solves F2L in the order it names", () => {
  const order: F2lSlot[] = [...F2L_OFFER_ORDER];
  const strategy = insertSequenceStrategy(order, CASES);
  let ran = 0;
  for (const scramble of SCRAMBLES) {
    const result = runStrategy(strategy, afterCross(scramble));
    if (!result) continue; // this particular order may not be completable; another will be
    ran++;
    assert(f2lSolved(result.end), `F2L incomplete for "${scramble}"`);
    // Each insert must leave its own target filled, and every earlier target still filled.
    const inserts = result.phases.filter((p) => p.kind === "algorithmic");
    assertEquals(inserts.length, 4);
    for (let k = 0; k < 4; k++) {
      for (const slot of order.slice(0, k + 1)) {
        assert(
          slotSolved(slot)(inserts[k].endState),
          `after insert ${k + 1} of "${scramble}", ${slot} should be filled`,
        );
      }
    }
  }
  assert(ran > 0, "no scramble completed under a fixed order — is the setup fallback gone?");
});

Deno.test("the replacement covers the F2L span and offers one strategy per order", () => {
  const replacement = f2lOrderReplacement(CASES);
  assertEquals(replacement.region, ["f2l1", "f2l4"]);
  // `compete`, so the runner judges it on the whole solve and enabling it cannot make a
  // solve worse. `force` would give up that guarantee for no reason.
  assertEquals(replacement.mode, "compete");
  assertEquals(replacement.strategies.length, 24);
  assertEquals(new Set(replacement.strategies.map((s) => s.id)).size, 24, "ids distinct");
  for (const strategy of replacement.strategies) {
    // Phase-chaining off: every setup is a non-final search phase, so pooling each within
    // its slack would multiply level over level for no gain.
    assertEquals(strategy.phaseChaining, false, `${strategy.id} must opt out of chaining`);
    // No id may name a slot in a way that suggests the *Steps* are slot-specific; the
    // strategies name orders, the four Steps stay interchangeable.
    assertEquals(strategy.phases.length, 8);
  }
});

// At least one order must complete for every scramble, or the replacement would silently
// produce no candidate and the greedy Steps would quietly do all the work.
Deno.test("some order completes F2L on every scramble", () => {
  const strategies = f2lOrderReplacement(CASES).strategies;
  for (const scramble of SCRAMBLES) {
    const start = afterCross(scramble);
    let completed = 0;
    for (const strategy of strategies) {
      const result = runStrategy(strategy, start);
      if (result && f2lSolved(result.end)) completed++;
    }
    assert(completed > 0, `no order completed F2L for "${scramble}"`);
  }
});
