import { assertEquals, assertThrows } from "@std/assert";
import {
  formatAlg,
  formatMove,
  isDouble,
  isPrime,
  type Move,
  NotationError,
  parseAlg,
  parseMove,
} from "./notation.ts";

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
