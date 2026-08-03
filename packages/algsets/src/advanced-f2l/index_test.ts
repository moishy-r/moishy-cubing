import { assert, assertEquals } from "@std/assert";
import {
  applyMoves,
  centersSolved,
  type CubeState,
  pieceSignature,
  regionSolved,
  solvedCube,
} from "@moishy/cubing-core";
import { assertValidAlgSet } from "../validate.ts";
import {
  advancedF2lBl,
  advancedF2lBr,
  advancedF2lBySlot,
  advancedF2lFl,
  advancedF2lFr,
  type F2lSlot,
} from "./index.ts";
import { f2lFr } from "../f2l/index.ts";

const SLOT: Record<F2lSlot, { corners: number[]; edges: number[] }> = {
  fr: { corners: [4], edges: [8] },
  fl: { corners: [5], edges: [9] },
  bl: { corners: [6], edges: [10] },
  br: { corners: [7], edges: [11] },
};
const CROSS = { corners: [], edges: [4, 5, 6, 7] };
const SLOTS = ["fr", "fl", "bl", "br"] as const;

const openSlots = (s: CubeState): F2lSlot[] => SLOTS.filter((k) => !regionSolved(SLOT[k])(s));

Deno.test("each slot's set is structurally valid", () => {
  for (const slot of SLOTS) {
    // An advanced case frees a piece trapped in ANOTHER slot, so the goal is this
    // slot filled with the cross intact — it deliberately does not require the other
    // slots, since the one the trapped piece came from is left open by construction.
    const goal = (s: CubeState) => regionSolved(CROSS)(s) && regionSolved(SLOT[slot])(s);
    assertValidAlgSet(advancedF2lBySlot[slot], { goal });
  }
});

// Case counts differ per slot, and deliberately do not match the source's 54
// headings: a case here is one cube STATE, and the site groups by case shape (see the
// module doc). These are the measured state counts — a change means the scrape or the
// grouping moved, which is exactly what should fail a test.
Deno.test("advanced-f2l has the expected per-slot case and alg counts", () => {
  assertEquals(
    SLOTS.map((s) => [s, advancedF2lBySlot[s].cases.length]),
    [["fr", 42], ["fl", 35], ["bl", 28], ["br", 31]],
  );
  assertEquals(
    SLOTS.map((s) => [s, advancedF2lBySlot[s].cases.reduce((m, c) => m + c.algs.length, 0)]),
    [["fr", 203], ["fl", 169], ["bl", 144], ["br", 144]],
  );
});

// Same frame contract as the plain set (see ../f2l/index_test.ts), with one
// difference: an advanced case's derived state has exactly TWO slots open — its own,
// plus whichever slot is holding the trapped piece.
Deno.test("every primary derives a fixed-frame state opening its own slot plus one", () => {
  const bad: string[] = [];
  for (const slot of SLOTS) {
    for (const c of advancedF2lBySlot[slot].cases) {
      const r = advancedF2lBySlot[slot].recognitionState(c.id);
      if (!centersSolved(r)) bad.push(`${slot}/${c.id}: primary leaves centers drifted or rotated`);
      if (!regionSolved(CROSS)(r)) bad.push(`${slot}/${c.id}: primary's state has a broken cross`);
      const open = openSlots(r);
      if (open.length !== 2 || !open.includes(slot)) {
        bad.push(`${slot}/${c.id}: opens [${open.join(",")}], expected [${slot}] + one other`);
      }
    }
  }
  assertEquals(bad, []);
});

// The second open slot is never collateral damage — it is *entangled* with this one:
// either a piece of this pair sits in that slot, or one of its pieces sits in this
// slot and blocks the insertion. (Both directions occur, and the second is the more
// common: `af2l-1`'s pair is in a perfectly ordinary U-layer position, and what makes
// the case advanced is that the BR corner is stuck in the FR slot.) Either way that
// slot could not have been solved already, so freeing it costs a method nothing it
// had banked.
Deno.test("the second open slot is entangled with this one, not collateral damage", () => {
  const entangled: string[] = [];
  for (const slot of SLOTS) {
    const corner = SLOT[slot].corners[0], edge = SLOT[slot].edges[0];
    for (const c of advancedF2lBySlot[slot].cases) {
      const r = advancedF2lBySlot[slot].recognitionState(c.id);
      const other = openSlots(r).find((k) => k !== slot)!;
      // Ours in theirs...
      const oursThere = SLOT[other].corners.includes(r.cp.indexOf(corner)) ||
        SLOT[other].edges.includes(r.ep.indexOf(edge));
      // ...or theirs in ours.
      const theirsHere = SLOT[slot].corners.includes(r.cp.indexOf(SLOT[other].corners[0])) ||
        SLOT[slot].edges.includes(r.ep.indexOf(SLOT[other].edges[0]));
      if (!oursThere && !theirsHere) entangled.push(`${slot}/${c.id}: ${other} unrelated`);
    }
  }
  assertEquals(entangled, []);
});

Deno.test("cases are distinct under the pair signature a method recognizes on", () => {
  for (const slot of SLOTS) {
    const sig = pieceSignature(SLOT[slot].corners, SLOT[slot].edges);
    const seen = new Map<string, string>();
    for (const c of advancedF2lBySlot[slot].cases) {
      const key = sig(advancedF2lBySlot[slot].recognitionState(c.id));
      const prev = seen.get(key);
      assertEquals(prev, undefined, `${slot}: ${c.id} collides with ${prev} on ${key}`);
      seen.set(key, c.id);
    }
  }
});

// A few advanced cases share a pair position with a plain one — their pair sits in an
// ordinary place and what makes them advanced is a *foreign* piece blocking the slot.
// That is deliberate overlap, not a collision to design around: the blocker always
// belongs to another, still-unsolved slot, so evicting it is free, and the plain alg
// does exactly that. Verified here rather than assumed, because the tempting fix —
// adding the slot occupant to the recognition key — is actively wrong: it makes every
// pair but the last unrecognizable, since both sets' states have the other three slots
// solved while a live mid-F2L slot is usually holding another slot's piece.
//
// A consumer should therefore key on the pair alone and *merge* the two sets' algs for
// a shared position, letting cost choose. See `@moishy/steps`' `slotSignature`.
Deno.test("where the two sets share a pair position, the plain alg solves it too", () => {
  const sig = pieceSignature([4], [8]);
  const plain = new Map<string, typeof f2lFr.cases[number]>();
  for (const c of f2lFr.cases) plain.set(sig(f2lFr.recognitionState(c.id)), c);

  const AUF = [0, 1, 2, 3].map((n) =>
    n === 0 ? [] : [{ family: "U" as const, amount: n as 1 | 2 | 3 }]
  );
  const slotGoal = (s: CubeState) => regionSolved(CROSS)(s) && regionSolved(SLOT.fr)(s);

  let shared = 0;
  const unsolvable: string[] = [];
  for (const c of advancedF2lFr.cases) {
    const state = advancedF2lFr.recognitionState(c.id);
    const twin = plain.get(sig(state));
    if (!twin) continue;
    shared++;
    const ok = twin.algs.some((v) =>
      AUF.some((pre) =>
        AUF.some((post) => slotGoal(applyMoves(state, [...pre, ...v.moves, ...post])))
      )
    );
    if (!ok) unsolvable.push(`${c.id} (plain twin ${twin.id})`);
  }
  assertEquals(shared, 6, "advanced FR cases sharing a pair position with a plain one");
  assertEquals(unsolvable, [], "shared positions the plain alg cannot solve");
});

// Every case carries one of the source's three trapped-piece groupings. The counts
// are not 18/18/18 as the site's headings are: state-grouping splits and merges
// headings, so a state inherits the grouping of the heading it came from.
Deno.test("every case carries one of the source's trapped-piece groupings", () => {
  const known = ["Both Pieces Trapped", "Trapped Corner", "Trapped Edge"];
  for (const slot of SLOTS) {
    for (const c of advancedF2lBySlot[slot].cases) {
      assert(
        known.includes(c.subset ?? ""),
        `${slot}/${c.id}: unexpected subset ${JSON.stringify(c.subset)}`,
      );
    }
  }
  assertEquals(
    SLOTS.map((s) => [s, new Set(advancedF2lBySlot[s].cases.map((c) => c.subset)).size]),
    [["fr", 3], ["fl", 3], ["bl", 3], ["br", 3]],
  );
});

// Coverage over the STATE SPACE, not the stored cases (iterating cases cannot find a
// hole — the lesson of the oll and zbls defects). The space here is every state with
// the cross solved and at least one of the pair's pieces trapped outside the U layer
// and outside its own slot. This set does not claim to cover all of it; the test
// records what IS covered so a regression is visible, and so a method knows how much
// it must fall back on search.
Deno.test("trapped-piece coverage is recorded, and every covered state is genuinely trapped", () => {
  const sig = pieceSignature([4], [8]);
  const bySig = new Set<string>();
  for (const c of advancedF2lFr.cases) bySig.add(sig(advancedF2lFr.recognitionState(c.id)));
  for (const c of f2lFr.cases) bySig.add(sig(f2lFr.recognitionState(c.id)));

  const AUF = [0, 1, 2, 3].map((n) =>
    n === 0 ? [] : [{ family: "U" as const, amount: n as 1 | 2 | 3 }]
  );
  // Reachable trapped states: corner 4 anywhere but the D-cross-adjacent... in
  // practice every corner slot (8 x 3) and every edge slot outside the cross
  // (8 x 2), since the cross edges are solved.
  const cornerSlots = [0, 1, 2, 3, 4, 5, 6, 7];
  const edgeSlots = [0, 1, 2, 3, 8, 9, 10, 11];
  let walked = 0, covered = 0;
  for (const cs of cornerSlots) {
    for (let co4 = 0; co4 < 3; co4++) {
      for (const es of edgeSlots) {
        for (let eo8 = 0; eo8 < 2; eo8++) {
          // Only the states beyond the plain set's reach: a piece outside U and
          // outside the FR slot.
          const cornerTrapped = cs > 4;
          const edgeTrapped = es > 8;
          if (!cornerTrapped && !edgeTrapped) continue;
          walked++;
          const s: CubeState = {
            ...solvedCube(),
            cp: [...solvedCube().cp],
            ep: [...solvedCube().ep],
          };
          // A cheap projection stand-in: only the signature matters here, so place
          // the two cubies and read the key off directly.
          s.cp[cs] = 4;
          s.ep[es] = 8;
          const co = Array(8).fill(0), eo = Array(12).fill(0);
          co[cs] = co4;
          eo[es] = eo8;
          const probe: CubeState = { ...s, co, eo };
          if (AUF.some((pre) => bySig.has(sig(applyMoves(probe, pre))))) covered++;
        }
      }
    }
  }
  assert(walked > 0);
  // Recorded, not aspirational: this is the measured reach of f2l + advanced-f2l
  // over the trapped-piece space. Raise it when more data lands; a DROP is a
  // regression.
  assert(
    covered >= 150,
    `trapped-piece coverage fell to ${covered}/${walked} of the projected states`,
  );
});

Deno.test("advancedF2lBySlot exposes the same sets as the named exports", () => {
  assertEquals(advancedF2lBySlot.fr, advancedF2lFr);
  assertEquals(advancedF2lBySlot.fl, advancedF2lFl);
  assertEquals(advancedF2lBySlot.bl, advancedF2lBl);
  assertEquals(advancedF2lBySlot.br, advancedF2lBr);
});
