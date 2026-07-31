import { assert, assertEquals } from "@std/assert";
import {
  applyMoves,
  type CubeState,
  invert,
  normalizeOrientation,
  solvedCube,
} from "@moishy/cubing-core";
import { assertValidAlgSet } from "../validate.ts";
import { oll } from "./index.ts";

// Structural validation only — see br-pair/index_test.ts for the rationale.
// Recognizing OLL by orientation-only (ignoring last-layer permutation) and
// verifying the alternative algs orient the case need the method's OLL
// recognition + AUF handling (step 8).

Deno.test("oll is structurally valid", () => {
  assertValidAlgSet(oll);
});

Deno.test("oll has the expected case count", () => {
  assertEquals(oll.cases.length, 57);
});

// --- Coverage: the primaries must be a bijection onto the 57 orientation classes.
//
// OLL is *defined* by last-layer orientation, so the 57 cases must land on the 57
// distinct orientation classes (corner + edge orientation of the U layer, up to
// AUF) — one each, none missing. Recognition is derived from `algs[0]`, so a
// primary that lands on another case's class silently orphans a class: any live
// state in it matches nothing and the step cannot solve it.
//
// This is exactly what had gone wrong. 50 of the 57 primaries solved a different
// class than their own (unanimous) variants, covering only 39 of the 57 classes —
// so ~31% of last-layer orientation states were unrecognizable, and the 7-case
// OCLL filter used by APB's `ocllPll` was missing a whole class. The variants were
// correct throughout (checked against published algs for OLL 21-27, 33, 45, 51 and
// 57), so the fix was to drop the 50 bogus primaries. `assertValidAlgSet` cannot
// catch this: each case still solves *its own* derived state, and the set's default
// full-facelet signature distinguishes cases that collide under the coarser
// orientation key. Same failure mode as the 27 zbls cases — see /CLAUDE.md.

/** Corner+edge orientation of the U-layer slots, canonical over the 4 AUFs. */
function orientationClass(s: CubeState): string {
  // A U turn permutes the four U-layer slots and preserves orientation values,
  // so folding AUF is a cyclic shift of the first four co/eo entries.
  const rotate = [3, 0, 1, 2];
  let co = s.co.slice(0, 4), eo = s.eo.slice(0, 4);
  let best = `${co.join("")}|${eo.join("")}`;
  for (let i = 0; i < 3; i++) {
    co = rotate.map((j) => co[j]);
    eo = rotate.map((j) => eo[j]);
    const key = `${co.join("")}|${eo.join("")}`;
    if (key < best) best = key;
  }
  return best;
}

/** Every legal, non-solved last-layer orientation class. */
function allOrientationClasses(): Set<string> {
  const out = new Set<string>();
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      for (let c = 0; c < 3; c++) {
        for (let d = 0; d < 3; d++) {
          if ((a + b + c + d) % 3 !== 0) continue; // corner twist sums to 0 mod 3
          for (let mask = 0; mask < 16; mask++) {
            const eo = [mask & 1, (mask >> 1) & 1, (mask >> 2) & 1, (mask >> 3) & 1];
            if (eo.reduce((x, y) => x + y, 0) % 2 !== 0) continue; // edge-flip parity
            const co = [a, b, c, d];
            if (co.every((x) => x === 0) && eo.every((x) => x === 0)) continue; // OLL skip
            out.add(orientationClass({
              ...solvedCube(),
              co: [...co, 0, 0, 0, 0],
              eo: [...eo, 0, 0, 0, 0, 0, 0, 0, 0],
            }));
          }
        }
      }
    }
  }
  return out;
}

Deno.test("oll: the 57 primaries cover all 57 orientation classes, one each", () => {
  const expected = allOrientationClasses();
  assertEquals(expected.size, 57, "there should be exactly 57 non-solved orientation classes");

  const byClass = new Map<string, string[]>();
  for (const c of oll.cases) {
    const key = orientationClass(normalizeOrientation(oll.recognitionState(c.id)));
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key)!.push(c.id);
  }

  const collisions = [...byClass.entries()].filter(([, ids]) => ids.length > 1);
  assertEquals(
    collisions.map(([k, ids]) => `${k}: ${ids.join(" + ")}`),
    [],
    "two cases share one orientation class — one of their primary algs is for the wrong case",
  );

  const orphaned = [...expected].filter((k) => !byClass.has(k));
  assertEquals(
    orphaned,
    [],
    "orientation classes no case recognizes — a live last layer in one of these cannot be solved",
  );
});

Deno.test("oll: every case's variants solve the same orientation class as its primary", () => {
  // A variant may be written at a different AUF (its class is folded above), but it
  // must be an alg for the *same case*. A variant on another class is a
  // mis-transcription, and if it ever became the primary it would move the case.
  const bad: string[] = [];
  for (const c of oll.cases) {
    const primary = orientationClass(
      normalizeOrientation(applyMoves(solvedCube(), invert(c.algs[0].moves))),
    );
    for (let v = 1; v < c.algs.length; v++) {
      const got = orientationClass(
        normalizeOrientation(applyMoves(solvedCube(), invert(c.algs[v].moves))),
      );
      if (got !== primary) bad.push(`${c.id} alg #${v + 1} is on class ${got}, not ${primary}`);
    }
  }
  assert(bad.length === 0, `variants on the wrong case:\n  ${bad.join("\n  ")}`);
});
