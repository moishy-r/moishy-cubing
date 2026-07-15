// Move notation: the canonical `Move` type plus the parse/format boundary.
//
// This is the single canonical move representation shared by move
// application (permutation composition) and cost scoring (MCC), so the two
// can never drift. See /DESIGN.md, "Move representation".
//
// The notation grammar is SiGN-style, matching the project's existing
// `reference/mcc.ts`: one letter per family, wide turns are a single
// lowercase letter (`r`, not WCA `Rw`), an optional `2` marks a half turn,
// and an optional trailing `'` marks a prime (counter-clockwise) turn.
//
// `parseAlg` is the validation boundary: it throws on any invalid token, so
// by the time a `Move[]` exists downstream (search, cost scoring, move
// application) it is already known-good and nothing needs to defensively
// re-check it.

/**
 * The 18 recognized move families:
 * - `R L U D F B` — outer face turns
 * - `M E S` — slice turns
 * - `r l u d f b` — wide turns (SiGN-style single lowercase letter, not WCA `Rw`)
 * - `x y z` — whole-cube rotations
 */
export type MoveFamily =
  | "R"
  | "L"
  | "U"
  | "D"
  | "F"
  | "B"
  | "M"
  | "E"
  | "S"
  | "r"
  | "l"
  | "u"
  | "d"
  | "f"
  | "b"
  | "x"
  | "y"
  | "z";

/**
 * A single move. `amount` is the only turn modifier stored; `isDouble` /
 * `isPrime` are derived (`amount === 2` / `amount === 3`), never stored
 * separately, so they cannot fall out of sync with `amount`.
 */
export interface Move {
  family: MoveFamily;
  /** 1 = single CW quarter turn, 2 = double/180, 3 = single CCW quarter turn (prime). */
  amount: 1 | 2 | 3;
}

/** Thrown by {@link parseAlg} when a token is not valid move notation. */
export class NotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotationError";
  }
}

const MOVE_FAMILIES = new Set<string>([
  "R",
  "L",
  "U",
  "D",
  "F",
  "B",
  "M",
  "E",
  "S",
  "r",
  "l",
  "u",
  "d",
  "f",
  "b",
  "x",
  "y",
  "z",
]);

/** Grammar per family letter: optional `2` (half turn) then optional `'` (prime). */
const MOVE_RE = /^([RLUDFBMESrludfbxyz])(2)?('?)$/;

/** `amount === 2` — a half/180 turn. Derived, never stored. */
export function isDouble(move: Move): boolean {
  return move.amount === 2;
}

/** `amount === 3` — a prime (counter-clockwise) quarter turn. Derived, never stored. */
export function isPrime(move: Move): boolean {
  return move.amount === 3;
}

/**
 * Parses a single move token into a {@link Move}, or throws {@link NotationError}.
 *
 * A half turn suffixed with a prime (`R2'`) is normalized to a plain half
 * turn (`amount: 2`) — a 180 turn is its own inverse, so the prime carries
 * no additional meaning and the canonical `amount` type has no double-prime
 * value. This matches `reference/mcc.ts`, which scores `R2'` identically to
 * `R2`.
 */
export function parseMove(token: string): Move {
  const m = MOVE_RE.exec(token);
  if (!m) {
    throw new NotationError(`invalid move token: ${JSON.stringify(token)}`);
  }
  const [, family, two, prime] = m;
  let amount: 1 | 2 | 3;
  if (two === "2") {
    amount = 2;
  } else if (prime === "'") {
    amount = 3;
  } else {
    amount = 1;
  }
  return { family: family as MoveFamily, amount };
}

/**
 * Tokenizes and parses a whitespace-separated move string into a `Move[]`.
 * Throws {@link NotationError} on the first invalid token. An empty (or
 * all-whitespace) string parses to an empty sequence.
 */
export function parseAlg(input: string): Move[] {
  const tokens = input.split(/\s+/).filter((t) => t.length > 0);
  return tokens.map(parseMove);
}

/** Renders a single {@link Move} back to SiGN-style notation. Inverse of {@link parseMove}. */
export function formatMove(move: Move): string {
  if (!MOVE_FAMILIES.has(move.family)) {
    throw new NotationError(`invalid move family: ${JSON.stringify(move.family)}`);
  }
  switch (move.amount) {
    case 1:
      return move.family;
    case 2:
      return `${move.family}2`;
    case 3:
      return `${move.family}'`;
    default:
      throw new NotationError(`invalid move amount: ${JSON.stringify(move.amount)}`);
  }
}

/** Renders a `Move[]` as a space-separated notation string. Inverse of {@link parseAlg}. */
export function formatAlg(moves: Move[]): string {
  return moves.map(formatMove).join(" ");
}

/**
 * Inverts a move sequence: reverses the order and inverts each move (a quarter
 * turn flips CW<->CCW; a half turn is its own inverse). `applyMoves(s, moves)`
 * followed by `applyMoves(_, invert(moves))` returns to `s`.
 */
export function invert(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const { family, amount } = moves[i];
    out.push({ family, amount: amount === 2 ? 2 : amount === 1 ? 3 : 1 });
  }
  return out;
}
