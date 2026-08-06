import { assertEquals, assertThrows } from "@std/assert";
import {
  formatAlg,
  formatMove,
  isDouble,
  isPrime,
  mergeAdjacent,
  mergeAdjacentWithPrefixes,
  type Move,
  NotationError,
  parseAlg,
  parseMove,
} from "./notation.ts";
import { applyMoves, solvedCube, toFacelets } from "./cube-state.ts";

Deno.test("parseMove: single quarter turn -> amount 1", () => {
  assertEquals(parseMove("R"), { family: "R", amount: 1 });
});

Deno.test("parseMove: double turn -> amount 2", () => {
  assertEquals(parseMove("U2"), { family: "U", amount: 2 });
});

Deno.test("parseMove: prime -> amount 3", () => {
  assertEquals(parseMove("F'"), { family: "F", amount: 3 });
});

Deno.test("parseMove: recognizes all 18 families", () => {
  const families = "R L U D F B M E S r l u d f b x y z".split(" ");
  for (const fam of families) {
    assertEquals(parseMove(fam), { family: fam, amount: 1 });
  }
});

Deno.test("parseMove: wide moves are single lowercase letters (SiGN), not WCA Rw", () => {
  assertEquals(parseMove("r"), { family: "r", amount: 1 });
  assertThrows(() => parseMove("Rw"), NotationError);
});

Deno.test("parseMove: R2' normalizes to a plain half turn (amount 2)", () => {
  // A 180 turn is its own inverse; the prime carries no extra meaning and the
  // canonical amount type has no double-prime value. Matches reference/mcc.ts.
  assertEquals(parseMove("R2'"), { family: "R", amount: 2 });
});

Deno.test("parseMove: throws NotationError on invalid tokens", () => {
  for (const bad of ["", "Q", "R3", "2R", "RR", "R'2", "r2w", "R ", "1", "'"]) {
    assertThrows(() => parseMove(bad), NotationError);
  }
});

Deno.test("parseAlg: parses a whitespace-separated sequence", () => {
  assertEquals(parseAlg("R U R' U'"), [
    { family: "R", amount: 1 },
    { family: "U", amount: 1 },
    { family: "R", amount: 3 },
    { family: "U", amount: 3 },
  ]);
});

Deno.test("parseAlg: tolerates irregular and surrounding whitespace", () => {
  assertEquals(parseAlg("  R2\tU'  \n D  "), [
    { family: "R", amount: 2 },
    { family: "U", amount: 3 },
    { family: "D", amount: 1 },
  ]);
});

Deno.test("parseAlg: empty / all-whitespace string -> empty sequence", () => {
  assertEquals(parseAlg(""), []);
  assertEquals(parseAlg("   \t\n "), []);
});

Deno.test("parseAlg: throws on the first invalid token in a sequence", () => {
  assertThrows(() => parseAlg("R U Q F"), NotationError);
});

Deno.test("formatMove: renders each amount correctly", () => {
  assertEquals(formatMove({ family: "R", amount: 1 }), "R");
  assertEquals(formatMove({ family: "U", amount: 2 }), "U2");
  assertEquals(formatMove({ family: "F", amount: 3 }), "F'");
});

Deno.test("formatAlg: joins moves with single spaces", () => {
  const moves: Move[] = [
    { family: "R", amount: 1 },
    { family: "U", amount: 2 },
    { family: "F", amount: 3 },
  ];
  assertEquals(formatAlg(moves), "R U2 F'");
});

Deno.test("formatAlg: empty sequence -> empty string", () => {
  assertEquals(formatAlg([]), "");
});

Deno.test("round-trip: parseAlg -> formatAlg is identity for canonical notation", () => {
  const canonical = "R U2 R' D F' L2 x y' z2 M E' S r l2 u' d f b'";
  assertEquals(formatAlg(parseAlg(canonical)), canonical);
});

Deno.test("round-trip: formatAlg -> parseAlg is identity for every family/amount", () => {
  const families = "R L U D F B M E S r l u d f b x y z".split(" ") as Move["family"][];
  const moves: Move[] = families.flatMap((family) =>
    ([1, 2, 3] as const).map((amount) => ({ family, amount }))
  );
  assertEquals(parseAlg(formatAlg(moves)), moves);
});

Deno.test("R2' folds to R2 on round-trip through format", () => {
  assertEquals(formatMove(parseMove("R2'")), "R2");
});

Deno.test("isDouble / isPrime are derived from amount", () => {
  assertEquals(isDouble({ family: "R", amount: 2 }), true);
  assertEquals(isDouble({ family: "R", amount: 1 }), false);
  assertEquals(isPrime({ family: "R", amount: 3 }), true);
  assertEquals(isPrime({ family: "R", amount: 2 }), false);
});

Deno.test("formatMove: throws on structurally invalid Move values", () => {
  assertThrows(() => formatMove({ family: "Q" as Move["family"], amount: 1 }), NotationError);
  assertThrows(() => formatMove({ family: "R", amount: 4 as Move["amount"] }), NotationError);
});

// --- mergeAdjacent -----------------------------------------------------------
//
// Two same-family moves are the same layer about the same axis, so their amounts add
// mod 4. This is what stops a solver emitting `U' U` — two turns nobody executes,
// charged for twice and drawing an overwork penalty on top.

Deno.test("mergeAdjacent adds the amounts of a same-family run", () => {
  const cases: [string, string][] = [
    ["U U", "U2"],
    ["U U'", ""],
    ["U2 U2", ""],
    ["U2 U", "U'"],
    ["U U2", "U'"],
    ["U' U'", "U2"],
    ["U U U", "U'"],
    ["U U U U", ""],
    ["R U R'", "R U R'"], // different families are never touched
    ["R L", "R L"], // ...even when they commute
    ["R r", "R r"], // ...and a wide turn is a different family from its outer turn
  ];
  for (const [input, want] of cases) {
    assertEquals(formatAlg(mergeAdjacent(parseAlg(input))), want, input);
  }
});

// A cancellation can expose a new adjacency, so one pass has to reach a fixed point.
Deno.test("mergeAdjacent re-merges what a cancellation exposes", () => {
  assertEquals(formatAlg(mergeAdjacent(parseAlg("U R R' U"))), "U2");
  assertEquals(formatAlg(mergeAdjacent(parseAlg("U R R' U'"))), "");
  assertEquals(formatAlg(mergeAdjacent(parseAlg("F U R R' U' F'"))), "");
  assertEquals(formatAlg(mergeAdjacent(parseAlg("D F U R R' U' F' D"))), "D2");
});

Deno.test("mergeAdjacent leaves the net effect unchanged", () => {
  // The whole point: fewer moves, same cube. Checked on the sequences above plus a
  // few longer ones, by comparing the states they reach.
  const algs = [
    "U U",
    "U2 U2",
    "U R R' U",
    "R U R' U'",
    "y y' R U R'",
    "M2 M2 U",
    "F U R R' U' F' D D",
    "L' U L U' L' U L",
    "x x' R2 R2 U",
  ];
  for (const alg of algs) {
    const moves = parseAlg(alg);
    const merged = mergeAdjacent(moves);
    assertEquals(
      toFacelets(applyMoves(solvedCube(), merged)),
      toFacelets(applyMoves(solvedCube(), moves)),
      `${alg} changed the cube when merged`,
    );
    assertEquals(merged.length <= moves.length, true, `${alg} got longer`);
  }
});

// A split point a merge straddled no longer exists, and must be reported as gone
// rather than guessed at — a checkpoint Extra would otherwise splice at the wrong move.
Deno.test("mergeAdjacentWithPrefixes marks destroyed split points", () => {
  const { moves, prefix } = mergeAdjacentWithPrefixes(parseAlg("R U2 U2 F"));
  assertEquals(formatAlg(moves), "R F");
  assertEquals(prefix[0], 0, "before R");
  assertEquals(prefix[1], 1, "before the first U2 — survives");
  assertEquals(prefix[2], -1, "between the two U2s — destroyed");
  assertEquals(prefix[3], 1, "before F");
  assertEquals(prefix[4], 2, "end of the sequence");
});

Deno.test("mergeAdjacentWithPrefixes agrees with mergeAdjacent, and indexes untouched runs", () => {
  const moves = parseAlg("R U R' U'");
  const { moves: merged, prefix } = mergeAdjacentWithPrefixes(moves);
  assertEquals(formatAlg(merged), formatAlg(mergeAdjacent(moves)));
  // Nothing merged, so every split point survives and maps to itself.
  assertEquals(prefix, [0, 1, 2, 3, 4]);
});
