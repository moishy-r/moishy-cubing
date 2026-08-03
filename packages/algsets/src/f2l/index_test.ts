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
import { f2lBl, f2lBr, f2lBySlot, f2lFl, f2lFr, type F2lSlot } from "./index.ts";

// The four slots, and the region each one fills.
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
    // Every variant of every case must solve its own case: the cross intact and
    // this slot filled. (For the primary that is true by construction; the point
    // is the non-primary algs, several of which contain whole-cube rotations —
    // hence the rotation-invariant `regionSolved` rather than an absolute check.)
    const goal = (s: CubeState) => regionSolved(CROSS)(s) && regionSolved(SLOT[slot])(s);
    assertValidAlgSet(f2lBySlot[slot], { goal });
  }
});

Deno.test("f2l has the expected case count in every slot", () => {
  for (const slot of SLOTS) assertEquals(f2lBySlot[slot].cases.length, 41, slot);
  assertEquals(
    SLOTS.reduce((n, s) => n + f2lBySlot[s].cases.reduce((m, c) => m + c.algs.length, 0), 0),
    622,
  );
});

// The defect this set is most exposed to, and the one that broke 32 zbls cases:
// recognition is derived from `algs[0]` alone, so a primary containing a net
// whole-cube rotation derives a state for a DIFFERENT slot. The case then sits in
// the wrong place in the lookup and its alg cannot solve the state it is matched
// against. Assert the frame contract on every primary directly.
Deno.test("every primary derives a fixed-frame state that opens exactly its own slot", () => {
  const bad: string[] = [];
  for (const slot of SLOTS) {
    for (const c of f2lBySlot[slot].cases) {
      const r = f2lBySlot[slot].recognitionState(c.id);
      if (!centersSolved(r)) bad.push(`${slot}/${c.id}: primary leaves centers drifted or rotated`);
      if (!regionSolved(CROSS)(r)) bad.push(`${slot}/${c.id}: primary's state has a broken cross`);
      const open = openSlots(r);
      if (open.length !== 1 || open[0] !== slot) {
        bad.push(`${slot}/${c.id}: opens [${open.join(",")}], expected [${slot}]`);
      }
    }
  }
  assertEquals(bad, []);
});

// A method recognizes these on the pair's two cubies, not the whole cube, so that
// is the signature whose collisions matter — the algset's own default full-facelet
// check cannot see them.
Deno.test("cases are distinct under the pair signature a method recognizes on", () => {
  for (const slot of SLOTS) {
    const sig = pieceSignature(SLOT[slot].corners, SLOT[slot].edges);
    const seen = new Map<string, string>();
    for (const c of f2lBySlot[slot].cases) {
      const key = sig(f2lBySlot[slot].recognitionState(c.id));
      const prev = seen.get(key);
      assertEquals(prev, undefined, `${slot}: ${c.id} collides with ${prev} on ${key}`);
      seen.set(key, c.id);
    }
  }
});

// The whole point of keeping all four slots: they are genuinely different data, not
// mirrors, so a slot set must not be usable in another slot.
Deno.test("the four slot sets are distinct data, each targeting its own slot", () => {
  const seen = new Set<string>();
  for (const slot of SLOTS) {
    const key = f2lBySlot[slot].cases.map((c) => c.algs[0].moves.map((m) => m.family).join(""))
      .join("|");
    assert(!seen.has(key), `${slot} duplicates another slot's primaries verbatim`);
    seen.add(key);
  }
  // Sanity: the same case id exists in all four, with its own algs.
  for (const c of f2lFr.cases) {
    for (const slot of SLOTS) assert(f2lBySlot[slot].get(c.id), `${slot} missing ${c.id}`);
  }
});

// Subsets are consumed by filter (a method may want only the easy cases), so the
// source's groupings must survive scraping intact.
Deno.test("subsets are the source's own groupings and partition the cases", () => {
  const counts = new Map<string, number>();
  for (const c of f2lFr.cases) counts.set(c.subset ?? "", (counts.get(c.subset ?? "") ?? 0) + 1);
  assertEquals(
    [...counts.entries()].sort(),
    [
      ["Connected Pairs", 10],
      ["Corner In Slot", 6],
      ["Disconnected Pairs", 10],
      ["Edge In Slot", 6],
      ["Free Pairs", 4],
      ["Pieces In Slot", 5],
    ],
  );
});

// Coverage, walked over the STATE SPACE rather than the stored cases — iterating
// cases cannot find a hole, which is exactly how the oll and zbls gaps survived.
// With the cross and the other three slots solved, the pair's corner can only be in
// the U layer or its own slot (5 slots x 3 orientations) and the edge likewise
// (5 x 2): 150 states, one already solved. Every one must be recognized, up to the
// pre-AUF a phase applies.
Deno.test("the 41 cases cover every last-slot state, up to AUF", () => {
  const freeC = [0, 1, 2, 3, 4], freeE = [0, 1, 2, 3, 8];
  const parity = (p: number[]) => {
    let x = 0;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1;
    }
    return x;
  };
  // Build a real cube state with corner cubie 4 at slot cs and edge cubie 8 at es.
  const make = (cs: number, co4: number, es: number, eo8: number): CubeState => {
    const base = solvedCube();
    const cp = [...base.cp], ep = [...base.ep];
    const co = Array(8).fill(0), eo = Array(12).fill(0);
    const restC = freeC.filter((c) => c !== 4), slotsC = freeC.filter((s) => s !== cs);
    cp[cs] = 4;
    slotsC.forEach((s, i) => cp[s] = restC[i]);
    const restE = freeE.filter((e) => e !== 8), slotsE = freeE.filter((s) => s !== es);
    ep[es] = 8;
    slotsE.forEach((s, i) => ep[s] = restE[i]);
    if (parity(cp) !== parity(ep)) {
      const [a, b] = slotsC.slice(0, 2);
      [cp[a], cp[b]] = [cp[b], cp[a]];
    }
    co[cs] = co4;
    if (co4 !== 0) co[slotsC[0]] = (3 - co4) % 3;
    eo[es] = eo8;
    if (eo8 !== 0) eo[slotsE[0]] = 1;
    return { cp, co, ep, eo, cn: [...base.cn] };
  };

  const sig = pieceSignature([4], [8]);
  const bySig = new Set<string>();
  for (const c of f2lFr.cases) bySig.add(sig(f2lFr.recognitionState(c.id)));
  const AUF = [0, 1, 2, 3].map((n) =>
    n === 0 ? [] : [{ family: "U" as const, amount: n as 1 | 2 | 3 }]
  );

  let walked = 0;
  const missing: string[] = [];
  for (const cs of freeC) {
    for (let co4 = 0; co4 < 3; co4++) {
      for (const es of freeE) {
        for (let eo8 = 0; eo8 < 2; eo8++) {
          const s = make(cs, co4, es, eo8);
          assert(
            regionSolved(CROSS)(s),
            `construction broke the cross at c${cs}.${co4} e${es}.${eo8}`,
          );
          if (regionSolved(SLOT.fr)(s)) continue; // already solved — no case needed
          walked++;
          if (!AUF.some((pre) => bySig.has(sig(applyMoves(s, pre))))) {
            missing.push(`c${cs}.${co4} e${es}.${eo8}`);
          }
        }
      }
    }
  }
  assertEquals(walked, 149);
  assertEquals(missing, [], "last-slot states no F2L case recognizes, even up to AUF");
});

Deno.test("f2lBySlot exposes the same sets as the named exports", () => {
  assertEquals(f2lBySlot.fr, f2lFr);
  assertEquals(f2lBySlot.fl, f2lFl);
  assertEquals(f2lBySlot.bl, f2lBl);
  assertEquals(f2lBySlot.br, f2lBr);
});
