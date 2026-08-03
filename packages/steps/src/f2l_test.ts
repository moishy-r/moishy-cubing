import { assert, assertEquals } from "@std/assert";
import {
  applyMoves,
  type CubeState,
  parseAlg,
  type PhaseSegment,
  regionSolved,
  runPhase,
  solvedCube,
} from "@moishy/cubing-core";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { blockSearch, CROSS } from "./blocks.ts";
import {
  anySlotLookup,
  F2L,
  F2L_SLOT,
  F2L_SLOTS,
  f2lGoal,
  f2lStep,
  f2lSteps,
  openSlots,
  slotAt,
  slotSignature,
  solvedSlotCount,
  variantSlot,
} from "./f2l.ts";

const SETS = [f2lBySlot, advancedF2lBySlot];
const STEPS = f2lSteps(SETS);
const cross = blockSearch("cross", CROSS, { maxDepth: 8 });

/** Race a step's strategies, running each one's phases in order. Cheapest wins. */
function runStep(
  n: number,
  start: CubeState,
): { end: CubeState; cost: number; via: string } | null {
  let best: { end: CubeState; cost: number; via: string } | null = null;
  for (const strategy of STEPS[n - 1].strategies) {
    let cur = start, cost = 0, ok = true;
    for (const phase of strategy.phases) {
      const seg: PhaseSegment | null = runPhase(phase, cur);
      if (!seg) {
        ok = false;
        break;
      }
      cur = seg.endState;
      cost += seg.cost;
    }
    if (ok && (!best || cost < best.cost)) best = { end: cur, cost, via: strategy.id };
  }
  return best;
}

Deno.test("the four slot regions are the pairs, and F2L is their union plus the cross", () => {
  assertEquals(F2L_SLOTS.length, 4);
  assertEquals(F2L_SLOTS.flatMap((s) => F2L_SLOT[s].corners).sort(), [4, 5, 6, 7]);
  assertEquals(
    F2L_SLOTS.flatMap((s) => F2L_SLOT[s].edges).sort((a, b) => a - b),
    [8, 9, 10, 11],
  );
  assertEquals([...F2L.corners].sort(), [4, 5, 6, 7]);
  assertEquals([...F2L.edges].sort((a, b) => a - b), [4, 5, 6, 7, 8, 9, 10, 11]);
});

// The count goal is what lets any slot be the one that advances a step, and what makes
// an alg that fills one slot by emptying another simply fail.
Deno.test("f2lGoal counts slots, and rejects a swap that nets nothing", () => {
  assertEquals(solvedSlotCount(solvedCube()), 4);
  for (let n = 1; n <= 4; n++) assert(f2lGoal(n)(solvedCube()));

  const oneOpen = applyMoves(solvedCube(), parseAlg("R U R'"));
  assertEquals(solvedSlotCount(oneOpen), 3);
  assert(f2lGoal(3)(oneOpen));
  assert(!f2lGoal(4)(oneOpen));

  const twoOpen = applyMoves(oneOpen, parseAlg("L' U' L"));
  assertEquals(solvedSlotCount(twoOpen), 2);
  assert(!f2lGoal(3)(twoOpen));
});

Deno.test("anySlotLookup offers candidates from every slot that has one, tagged", () => {
  const phase = STEPS[0].strategies[0].phases[0];
  assertEquals(phase.kind, "algorithmic");
  // Two slots disturbed by triggers that leave each pair in the U layer.
  const s = applyMoves(solvedCube(), parseAlg("R U R' U' L' U' L"));
  const hit = phase.kind === "algorithmic" ? phase.cases.find(s) : null;
  assert(hit, "no slot recognized a two-pairs-in-U state");
  const slots = new Set(hit.algs.map((v) => variantSlot(v)?.slot).filter(Boolean));
  assert(slots.size >= 2, `expected several slots to offer a case, saw ${[...slots]}`);
  for (const v of hit.algs) assert(variantSlot(v), `variant has no origin: ${v.source}`);
});

Deno.test("anySlotLookup returns null when no slot has a case", () => {
  assertEquals(anySlotLookup({}).find(solvedCube()), null);
});

// The real test: from a real cross on real scrambles, four steps finish F2L — with
// nothing anywhere naming a particular slot, and the order chosen by cost.
//
// This is also the test that sized the fallback. Case data alone finishes 8 of these
// 10 and stalls on the third pair of the other two, because neither set covers every
// way three unsolved slots can hold each other's pieces. With the setup strategy it
// is 10 of 10.
Deno.test("four F2L steps finish F2L from a real cross, on real scrambles", () => {
  const scrambles = [
    "D2 F2 U2 R2 B2 D B2 U' L2 D' L2 F' R' U2 B U2 F' L' B2 R2",
    "B2 L2 D' B2 D2 R2 U B2 U2 R2 F2 L' U' F' L2 B U2 R' D' F2",
    "F' L2 U2 F2 D2 F R2 F' U2 B' R2 U' L' B2 D2 R' F2 D2 L U'",
    "U2 R2 B2 U' F2 D' F2 U2 R2 U' B' L' D2 B2 R U' L2 F' R2 D",
    "R2 F2 U R2 D' B2 D F2 U' R2 B2 L' B' D2 F U' L2 B' R U2 L",
    "L2 D2 B2 R2 D' L2 U B2 U2 F2 D' R' F' U B2 L D' B' R2 U2 F",
    "B2 D2 L2 F2 U' B2 U2 F2 U' R2 U L D B' L2 F' R' U2 B D' L'",
    "F2 U2 R2 D B2 D' F2 R2 U' L2 F2 R' D' B U2 L F' U B2 R' D2",
    "U' R2 D2 F2 L2 U' B2 U2 L2 D R2 F' L D' R B2 U' F2 L' B' U2",
    "D B2 U2 F2 R2 U' L2 D' B2 U2 R2 F' D L' B D2 R U2 F' L2 D'",
  ];
  let viaSetup = 0;
  for (const scramble of scrambles) {
    const crossed = runPhase(cross, applyMoves(solvedCube(), parseAlg(scramble)));
    assert(crossed, `no cross for "${scramble}"`);
    let state = crossed.endState;
    for (let n = 1; n <= 4; n++) {
      const r = runStep(n, state);
      assert(r, `f2l${n} found nothing for "${scramble}"`);
      assert(solvedSlotCount(r.end) >= n, `f2l${n} did not net a slot for "${scramble}"`);
      assert(regionSolved(CROSS)(r.end), `f2l${n} broke the cross for "${scramble}"`);
      if (r.via.endsWith("Setup")) viaSetup++;
      state = r.end;
    }
    assert(regionSolved(F2L)(state), `F2L not solved for "${scramble}"`);
  }
  // Recorded, not aspirational: the fallback is load-bearing but rare.
  assert(viaSetup > 0, "the setup fallback never fired — has coverage changed?");
  assert(viaSetup < 10, `the setup fallback fired ${viaSetup} times, expected a minority`);
});

// An already-solved slot must cost nothing — this is what lets an X-cross hand a
// finished pair to a step list that knows nothing about X-crosses.
Deno.test("a pre-solved slot is a free skip", () => {
  const state = applyMoves(solvedCube(), parseAlg("R U R' U' L' U L U F U' F'"));
  const before = solvedSlotCount(state);
  assert(before >= 1, "expected at least one slot to survive the setup");
  let s = state, free = 0;
  for (let n = 1; n <= 4; n++) {
    const r = runStep(n, s);
    assert(r, `f2l${n} found nothing`);
    if (r.cost === 0) free++;
    s = r.end;
  }
  assertEquals(solvedSlotCount(s), 4);
  assertEquals(free, before, "every already-solved slot should have cost nothing");
});

// Keyed on the pair alone. The plain and advanced sets DO share a few positions —
// that is deliberate, and they are merged rather than chained so both algs compete.
Deno.test("slotSignature keys on the pair, and the two sets overlap by design", () => {
  let shared = 0;
  for (const slot of F2L_SLOTS) {
    const sig = slotSignature(slot);
    const plain = new Set(
      f2lBySlot[slot].cases.map((c) => sig(f2lBySlot[slot].recognitionState(c.id))),
    );
    for (const c of advancedF2lBySlot[slot].cases) {
      if (plain.has(sig(advancedF2lBySlot[slot].recognitionState(c.id)))) shared++;
    }
    // Within one set, positions must still be distinct.
    const seen = new Set<string>();
    for (const c of f2lBySlot[slot].cases) {
      const key = sig(f2lBySlot[slot].recognitionState(c.id));
      assert(!seen.has(key), `${slot}: ${c.id} duplicates another plain case's position`);
      seen.add(key);
    }
  }
  assertEquals(shared, 22, "advanced cases sharing a pair position with a plain one");
});

// Slots are cubie-identified so a rotation never changes which pair a step means;
// slotAt is the display mapping back to where a solver actually sees it.
Deno.test("slotAt reports the physical position a rotation has moved a slot to", () => {
  for (const slot of F2L_SLOTS) assertEquals(slotAt(solvedCube(), slot), slot);
  const turned = applyMoves(solvedCube(), parseAlg("y"));
  const moved = F2L_SLOTS.map((s) => slotAt(turned, s));
  assertEquals(new Set(moved).size, 4, "a rotation must permute the four positions");
  assert(F2L_SLOTS.every((s, i) => moved[i] !== s), `a y should move every slot: ${moved}`);
  // The pair itself is untouched: still solved, whatever it is now called.
  assertEquals(solvedSlotCount(turned), 4);
  assertEquals(openSlots(turned), []);
});

Deno.test("f2lSteps yields four distinctly-identified steps, each with a fallback", () => {
  assertEquals(STEPS.map((s) => s.id), ["f2l1", "f2l2", "f2l3", "f2l4"]);
  assertEquals(STEPS.map((s) => s.label), ["F2L 1", "F2L 2", "F2L 3", "F2L 4"]);
  for (const step of STEPS) {
    assertEquals(step.strategies.length, 2);
    assertEquals(step.strategies[1].phases.length, 2, "setup + insert");
  }
  assertEquals(f2lStep(2, SETS, { id: "x", label: "Y" }).id, "x");
});

// The back-slot preference, and the mechanism that makes it free: `runPhase` replaces
// its best candidate only on a strict improvement, so whichever slot is offered first
// wins a tie. Mirrored algs tie exactly under the cost model, so this is a real
// preference rather than a formality.
Deno.test("a tie between slots is resolved in favour of a back slot", () => {
  // Offer every slot a case, so the only thing under test is the order they come out in.
  const always = (id: string) => ({
    find: () => ({ id, algs: [{ moves: parseAlg("R U R'") }] }),
  });
  const offered = anySlotLookup({
    fr: always("fr"),
    fl: always("fl"),
    bl: always("bl"),
    br: always("br"),
  }).find(solvedCube())!.algs.map((v) => variantSlot(v)?.slot);

  assertEquals(offered.length, 4);
  const firstBack = offered.findIndex((k) => k === "bl" || k === "br");
  const firstFront = offered.findIndex((k) => k === "fr" || k === "fl");
  assert(
    firstBack < firstFront,
    `a back slot must be offered before a front one to win the tie, got ${offered.join(",")}`,
  );
  // And the front slots are still offered — the preference is a tie-break, not a filter.
  assertEquals(new Set(offered).size, 4);
});
