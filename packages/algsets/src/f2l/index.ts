/**
 * F2L — algorithm case data for `@moishy/algsets`.
 *
 * The 41 standard F2L cases: join a corner/edge pair and insert it, leaving the cross and the other three slots intact.
 *
 * Scraped from https://speedcubedb.com/a/3x3/F2L (August 2026), which publishes every case for all
 * four slots — the site's Front Right / Front Left / Back Left / Back Right tabs — with
 * slot-specific algorithms rather than mechanical mirrors. All four are kept, as four
 * `AlgSet`s: recognition is derived per case from its primary, and the same case in a
 * different slot is a different state, so it has to be a different set. 41 cases x 4 slots, 622 algs.
 *
 * **Alg order matters here**, though not because of rotations. Recognition comes from `algs[0]`
 * alone, so each slot's primary must be an alg that solves *this* slot's case: the D-layer cross
 * solved, and exactly the slot itself open. Rotations are a
 * non-issue — `defineAlgSet` derives a case's state as `solved . p . A^-1`, accounting for the
 * frame the alg lands in, so a primary containing a `y` derives exactly the same state as a
 * rotation-free one. Every alg here is the source's, verbatim; none has been rewritten or
 * de-rotated. CFOP uses rotations freely and so does this data.
 *
 * The source's case numbering is exactly 1:1 with cube states here — all 41 map to 41 distinct
 * states in every slot, with no case splitting and no two cases sharing a state — so the four
 * slots share one case list. (That is *not* true of `advanced-f2l`; see its module doc.) Each
 * case's pieces are in the U layer or in the target slot itself; for a piece trapped in a
 * different slot, use `@moishy/algsets/advanced-f2l`.
 *
 * ```ts
 * import { f2lFr } from "@moishy/algsets/f2l";
 * f2lFr.cases.length;
 * ```
 *
 * @module
 */

import { type AlgSet, defineAlgSet } from "../define.ts";

/** The four F2L slots, named by position. */
export type F2lSlot = "fr" | "fl" | "bl" | "br";

interface SlotCase {
  id: string;
  name: string;
  subset: string;
  algs: Record<F2lSlot, string[]>;
}

// One row per case, the four slots' algs side by side. `algs[0]` of each slot is a
// rotation-free alg for THAT slot (see the module doc); later variants may rotate.
const CASES: SlotCase[] = [
  {
    id: "f2l-1",
    name: "F2L 1",
    subset: "Free Pairs",
    algs: {
      fr: ["U R U' R'", "R' F R F'", "y' r' U' R U M'", "y U F' L F L2 U L"],
      fl: ["F' r U r'", "F' L F L'", "y' U R U' R'", "d R U' R'"],
      bl: ["U L U' L'", "U2 L U2 L'", "L' f U f'", "U' r U B' U' B r'"],
      br: ["U f R' f'", "r' U' R U M'", "U2 R2 F R F' R", "d L U' L'"],
    },
  },
  {
    id: "f2l-2",
    name: "F2L 2",
    subset: "Free Pairs",
    algs: {
      fr: ["F R' F' R", "y' U' R' U R", "U' F' U F", "y U' L' U L"],
      fl: ["U' L' U L", "L F' L' F", "r U' r' F", "U r' U' F U F' r"],
      bl: ["l U L' U' M'", "U' f' L f", "y' U' L' U L", "d' R' U R"],
      br: ["U' R' U R", "R f' U' f", "U2 R' U2 R", "U R' F' U F U' R"],
    },
  },
  {
    id: "f2l-3",
    name: "F2L 3",
    subset: "Free Pairs",
    algs: {
      fr: ["F' U' F", "y' R' U' R", "y L' U' L", "S U R U' R' S'"],
      fl: ["L' U' L", "U2 R' F R U R' F' R", "y' S U R U' R' S'", "U S' F U' F' U S"],
      bl: ["y R' U' R", "f' L' f", "U' R U B' U' B R'", "f' r' U z"],
      br: ["R' U' R", "U2 r' R' F R F' r", "U S f R' f' U S'", "U f2 F' R' f' U S'"],
    },
  },
  {
    id: "f2l-4",
    name: "F2L 4",
    subset: "Free Pairs",
    algs: {
      fr: ["R U R'", "y' f R f'", "y F U F'", "y2 L U L'"],
      fl: ["F U F'", "y L U L'", "S' L F' L' f", "U' M L' U L U' M'"],
      bl: ["L U L'", "r B r'", "y2 R U R'", "U f R U R' U2 f' r x'"],
      br: ["f R f'", "y R U R'", "y' L U L'", "U' r R2 U R U' M"],
    },
  },
  {
    id: "f2l-5",
    name: "F2L 5",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U' R U R' U2 R U' R'",
        "F2 L' U' L U F2",
        "U' R U R' U' R U2 R'",
        "U' R U R' U R' F R F'",
      ],
      fl: [
        "U R' F r U' r' F' R",
        "U2 F R U R' U2 F'",
        "U l' U L U' L' U' l",
        "y' U' R U R' U2 R U' R'",
      ],
      bl: [
        "U' L U L' U2 L U' L'",
        "U' L U L' U' L U2 L'",
        "y2 U' R U R' U2 R U' R'",
        "U y' l' U L U' L' U' l",
      ],
      br: [
        "U' R' F R U R' U' F' R",
        "R2 F' U' F U R2",
        "U r' U R U' R' U' r",
        "d' R U R' U2 R U' R'",
      ],
    },
  },
  {
    id: "f2l-6",
    name: "F2L 6",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U' r U' R' U R U r'",
        "y' U R' U' R U2 R' U R",
        "U F' U' F U2 F' U F",
        "d R' U' R U2 R' U R",
      ],
      fl: [
        "U L' U' L U2 L' U L",
        "F2 R U R' U' F2",
        "R' F2 R U R' U' F2 U R",
        "U L' U' L U L' U2 L",
      ],
      bl: [
        "U r U' r' U' L U F L'",
        "y U R' U' R U R' U2 R",
        "U' l U' L' U L U l'",
        "U L F' L' U' L U F L'",
      ],
      br: [
        "U R' U' R U2 R' U R",
        "U2 R' F' U' F U2 R",
        "y2 U L' U' L U2 L' U L",
        "U' y r U' R' U R U r'",
      ],
    },
  },
  {
    id: "f2l-7",
    name: "F2L 7",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U' R U2 R' U' R U2 R'",
        "M' U' M U2 r U' r'",
        "U' R U2 R' U2 R U' R'",
        "U' R U2 R' U R' F R F'",
      ],
      fl: [
        "F U R U2 R' U F'",
        "U' F U2 R U' R' U F'",
        "l U2 L2 U' L2 U' l'",
        "d' L U2 L' U2 L U' L'",
      ],
      bl: ["U' L U2 L' U2 L U' L'", "U' L U2 L' U' L U2 L'", "M U' M' U2 l U' l'"],
      br: [
        "r U2 R2 U' R2 U' r'",
        "F R U R2 U' R F'",
        "y' U' L U2 L' U2 L U' L'",
        "y U' R U2 R' U2 R U' R'",
      ],
    },
  },
  {
    id: "f2l-8",
    name: "F2L 8",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "r' U2 R2 U R2 U r",
        "y' U R' U2 R U2 R' U R",
        "y U L' U2 L U2 L' U L",
        "d R' U2 R U R' U2 R",
      ],
      fl: [
        "U L' U2 L U L' U2 L",
        "U r' F2 r U2 r' F r",
        "U' R' U2 R U R' U R U2 L' U L",
        "U L' U2 L U' L F' L' F",
      ],
      bl: [
        "l' U2 L2 U L2 U l",
        "y U R' U2 R U R' U2 R",
        "f' L' U' L2 U L' f",
        "d L' U2 L U2 L' U L",
      ],
      br: ["U R' U2 R U R' U2 R", "U R' U2 R U2 R' U R"],
    },
  },
  {
    id: "f2l-9",
    name: "F2L 9",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U' R U' R' U F' U' F",
        "F R U R' U' F' R U' R'",
        "U' R U' R' d R' U' R",
        "d R' U' R U' R' U' R",
      ],
      fl: [
        "U L' U' L U' L' U' L",
        "F2 U R U' R' F2",
        "U2 L' U L U L' U' L",
        "U' F U' F' U L' U' L",
      ],
      bl: [
        "y U R' U' R U' R' U' R",
        "U' L U' L' U f' L' f",
        "y U2 R' U R U R' U' R",
        "d L' U' L U' L' U' L",
      ],
      br: [
        "U R' U' R U' R' U' R",
        "R' U R U' R' U' R U2 R' U R",
        "U2 R' U R U R' U' R",
        "U2 r U R' U R' U' R2 U' r'",
      ],
    },
  },
  {
    id: "f2l-10",
    name: "F2L 10",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U' R U R' U R U R'",
        "U2 R U' R' U' R U R'",
        "d R' U R d' R U R'",
        "y' U R' U R U' f R f'",
      ],
      fl: [
        "U L' U L U' F U F'",
        "F U' R U R' U2 F'",
        "y' U' R U R' U R U R'",
        "d' L U L' U L U L'",
      ],
      bl: [
        "U' L U L' U L U L'",
        "U2 L U' L' U' L U L'",
        "L U' L' U L U L' U2 L U' L'",
        "y2 U' R U R' U R U R'",
      ],
      br: ["U R' U R U' f R f'", "R2 U' F' U F R2", "y U' R U R' U R U R'", "d' R U R' U R U R'"],
    },
  },
  {
    id: "f2l-11",
    name: "F2L 11",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "U' R U2 R' U F' U' F",
        "y' R U2 R2 U' R2 U' R'",
        "F' U L' U2 L U2 F",
        "U' R U2 R' d R' U' R",
      ],
      fl: [
        "L' U L U' L' U L U2 L' U L",
        "L U2 L2 U' L2 U' L'",
        "F U R U' R' U R U' R' U F'",
        "U' F U2 F' U r' F' r",
      ],
      bl: [
        "U' L U2 L' U f' L' f",
        "L U2 L' U' l U' l' U2 l U l'",
        "y R U2 R2 U' R2 U' R'",
        "U' L U2 L' d L' U' L",
      ],
      br: [
        "R' U R U' R' U R U2 R' U R",
        "R U2 R2 U' R2 U' R'",
        "R' U R U' R' U R U R' U2 R",
        "d' R U2 R' U F' U' F",
      ],
    },
  },
  {
    id: "f2l-12",
    name: "F2L 12",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "R U' R' U R U' R' U2 R U' R'",
        "R' U2 R2 U R2 U R",
        "U F' U2 F U' R U R'",
        "U R U' R' U' R U R' U' R U R'",
      ],
      fl: [
        "U L' U2 L U' F U F'",
        "L' U2 L U l' U l U2 l' U' l",
        "y' R' U2 R2 U R2 U R",
        "U L' U2 L d' L U L'",
      ],
      bl: [
        "L' U2 L2 U L2 U L",
        "U2 R' U2 R U2 L U L' U2 R' U R",
        "L U' L' U L U' L' U2 L U' L'",
        "d L' U2 L U' F U F'",
      ],
      br: [
        "U R' U2 R U' f R f'",
        "f R' U R2 U' R2 f'",
        "U R' U2 R M U2 R' U R U M'",
        "U R' U2 R d' R U R'",
      ],
    },
  },
  {
    id: "f2l-13",
    name: "F2L 13",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "y' U R' U R U' R' U' R",
        "M' U' R U R' U2 R U' r'",
        "R U' R' U R' F R F' R U' R'",
        "d R' U R U' R' U' R",
      ],
      fl: [
        "U L' U L U' L' U' L",
        "y' R U' R' U2 R U' R' U F' U F",
        "U L' U L U' L' U L U L' U L",
        "U L F' L2 U' L U L F L'",
      ],
      bl: [
        "y U R' U R U' R' U' R",
        "U f' L f U' f' L' f",
        "U L U' L F' L2 U' L U F U L'",
        "d L' U L U' L' U' L",
      ],
      br: ["U R' U R U' R' U' R", "U R' U R U' R' U R U R' U R"],
    },
  },
  {
    id: "f2l-14",
    name: "F2L 14",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "U' R U' R' U R U R'",
        "R U2 R' U2 R U R' U2 R U' R'",
        "U' R2 D R' U R D' R2",
        "U2 R2 U R' U R U2 R2",
      ],
      fl: [
        "y U' L U' L' U L U L'",
        "y' U' R U' R' U R U R'",
        "M' U L' U' L U2 L' U l",
        "d' L U' L' U L U L'",
      ],
      bl: ["U' L U' L' U L U L'", "U' L U' L' U L U' L' U' L U' L'"],
      br: [
        "y U' R U' R' U R U R'",
        "U' f R' f' U f R f'",
        "y' U' L U' L' U L U L'",
        "d' R U' R' U R U R'",
      ],
    },
  },
  {
    id: "f2l-15",
    name: "F2L 15",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "M U r U' r' U' M'",
        "R' D' R U' R' D R U R U' R'",
        "R U R' U2 R U' R' U R U' R'",
        "F' U F U2 R U R'",
      ],
      fl: [
        "F U2 R U R' U F'",
        "L' U L U2 F U F'",
        "L' U L U2 y L U L'",
        "U L' l U' l' U l U l' U L",
      ],
      bl: [
        "L U L' U2 L U' L' U L U' L'",
        "f' L f U2 L U L'",
        "M' U l U' l' U' M",
        "L U2 L' U L U L' U L U' L'",
      ],
      br: [
        "R' U R U2 f R f'",
        "R2 F R F' R U R' U2 R",
        "R2 F R F' R U2 R' U R",
        "R' U R U' d' R U R'",
      ],
    },
  },
  {
    id: "f2l-16",
    name: "F2L 16",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "R U' R' U2 F' U' F",
        "R U' R' U2 y' R' U' R",
        "U M' U R U' r' U' R U R'",
        "U F U R U' R' F' R U R'",
      ],
      fl: [
        "F U' R U' R' U2 F'",
        "L' U' L U2 L' U L U' L' U L",
        "L' U2 L U' L' U' L U' L' U L",
        "M U' l' U l U M'",
      ],
      bl: [
        "L U' L' U2 f' L' f",
        "L2 F' L' F L' U2 L U' L'",
        "L U' L' y U2 R' U' R",
        "L U' L' U' d' R' U' R",
      ],
      br: [
        "R' U' R U2 R' U R U' R' U R",
        "M' U' r' U r U M",
        "U2 R' U' R U R D R' U' R D' R'",
        "F R' F' R U2 R' U' R2 U' R'",
      ],
    },
  },
  {
    id: "f2l-17",
    name: "F2L 17",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "R U2 R' U' R U R'",
        "y2 L U2 L' U' L U L'",
        "R U R' U' R U2 R' U2 R U R'",
        "y L F' L' F L' U L U' L' U L",
      ],
      fl: [
        "y L U2 L' U' L U L'",
        "L F' L' F L' U L U' L' U L",
        "L' U2 L U2 l' U L U' L' U' l",
        "y' R U2 R' U' R U R'",
      ],
      bl: ["L U2 L' U' L U L'", "L U L' U' L U2 L' U2 L U L'"],
      br: [
        "y' L U2 L' U' L U L'",
        "R' U2 F R U R' U' F' R",
        "y R U2 R' U' R U R'",
        "l U' R' U l' U R U' R' U R",
      ],
    },
  },
  {
    id: "f2l-18",
    name: "F2L 18",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "y' R' U2 R U R' U' R",
        "y L' U2 L U L' U' L",
        "F' U2 F U F' U' F",
        "R' F R F' R U' R' U R U' R'",
      ],
      fl: ["L' U2 L U L' U' L"],
      bl: [
        "y R' U2 R U R' U' R",
        "U F U R U' R' F' L U L'",
        "L U2 F' L' U' L U F L'",
        "L U2 L' U2 l U' L' U L U l'",
      ],
      br: ["R' U2 R U R' U' R"],
    },
  },
  {
    id: "f2l-19",
    name: "F2L 19",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "U R U2 R' U R U' R'",
        "U R U2 R2 F R F'",
        "R U' R' U R U' R' U R U R'",
        "d f R2 f' U f R' f'",
      ],
      fl: [
        "U L' U L2 F' L' F L' U L",
        "y' U R U2 R' U R U' R'",
        "y U L U2 L' U L U' L'",
        "d R U2 R' U R U' R'",
      ],
      bl: ["U L U2 L' U L U' L'", "L U' L' U L U' L' U L U L'"],
      br: [
        "y U R U2 R' U R U' R'",
        "U R' F' U2 F R U R' U' R",
        "U2 f R2 U R2 U' R f'",
        "d L U2 L' U L U' L'",
      ],
    },
  },
  {
    id: "f2l-20",
    name: "F2L 20",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "y' U' R' U2 R U' R' U R",
        "U' R U' R2 F R F' R U' R'",
        "y U' L' U2 L U' L' U L",
        "U' F' U2 F U' F' U F",
      ],
      fl: ["U' L' U2 L U' L' U L", "L' U L U' L' U L U' L' U' L", "U' L' U2 L2 F' L' F"],
      bl: [
        "y U' R' U2 R U' R' U R",
        "U' L F U2 F' L' U' L U L'",
        "U' L U L' U l U' l' U2 l U l'",
        "d' R' U2 R U' R' U R",
      ],
      br: ["U' R' U2 R U' R' U R", "R' U R U' R' U R U' R' U' R"],
    },
  },
  {
    id: "f2l-21",
    name: "F2L 21",
    subset: "Disconnected Pairs",
    algs: {
      fr: ["U2 R U R' U R U' R'", "R U' R' U2 R U R'", "R B U2 B' R'", "y' f R' f' U2 f R f'"],
      fl: ["l' U l U2 l' U' l", "F R U2 R' F'", "y U2 L U L' U L U' L'", "y L U' L' U2 L U L'"],
      bl: ["L U' L' U2 L U L'", "U2 L U L' U L U' L'", "l U' L' U2 L U l'", "L F U2 F' L'"],
      br: [
        "r' U r U2 r' U' r",
        "y' U2 L U L' U L U' L'",
        "U2 R' U' R S R f' U' F",
        "U f U R U' R f'",
      ],
    },
  },
  {
    id: "f2l-22",
    name: "F2L 22",
    subset: "Disconnected Pairs",
    algs: {
      fr: [
        "r U' r' U2 r U r'",
        "F' L' U2 L F",
        "y' U2 R' U' R U' R' U R",
        "y U2 L' U' L U' L' U L",
      ],
      fl: [
        "L' U L U2 L' U' L",
        "U2 L' U' L U' L' U L",
        "r' U' F2 U r",
        "U' L' U L U2 L' U L U' L' U L",
      ],
      bl: ["l U' l' U2 l U l'", "f' U' L2 U f", "y R' U R U2 R' U' R", "y U2 R' U' R U' R' U R"],
      br: [
        "R' U R U2 R' U' R",
        "U2 R' U' R U' R' U R",
        "R' F' U2 F R",
        "U' R' U R U2 R' U R U' R' U R",
      ],
    },
  },
  {
    id: "f2l-23",
    name: "F2L 23",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "U R U' R' U' R U' R' U R U' R'",
        "R U R' U2 R U R' U' R U R'",
        "U2 R2 U2 R' U' R U' R2",
        "R U' R2 D' R U2 R' D R",
      ],
      fl: [
        "F' U' L' U L F L' U L",
        "U L' U' L2 F' L' F L' U L",
        "F U' R U R' U R U2 R' F'",
        "U' F R U' R' F' L' U' L",
      ],
      bl: [
        "U L U' L' U' L U' L' U L U' L'",
        "L U L' U2 L U L' U' L U L'",
        "L' U' L U' L' U2 L2 U2 L'",
        "U2 L2 U2 L' U' L U' L2",
      ],
      br: [
        "U R' F R' F' R2 U' R' U R",
        "U2 l' U' L U' L' U2 B' l",
        "R' F' U' F U2 R U' R' U' R",
        "U R' U' F' U F R U' R' U R",
      ],
    },
  },
  {
    id: "f2l-24",
    name: "F2L 24",
    subset: "Connected Pairs",
    algs: {
      fr: [
        "F U R U' R' F' R U' R'",
        "U' R U R2 F R F' R U' R'",
        "y' R' U' R U2 R' U' R U R' U' R",
        "y U' L' U L U L' U L U' L' U L",
      ],
      fl: [
        "U' L' U L U L' U L U' L' U L",
        "U' F' r U r' U' L' U' L",
        "L' U L U L' U' L U2 L' U' L",
        "F U' R U2 R' U R U2 R' F'",
      ],
      bl: [
        "U2 r U R' U R U2 B r'",
        "U' L F' L F L2 U L U' L'",
        "U2 F U R U' R' F' U2 L U' L'",
        "y U' R' U R U R' U R U' R' U R",
      ],
      br: [
        "R' U' R U2 R' U' R U R' U' R",
        "U2 R2 U2 R U R' U R2",
        "R U R' U R U2 R2 U2 R",
        "U' R' U R U R' U R U' R' U R",
      ],
    },
  },
  {
    id: "f2l-25",
    name: "F2L 25",
    subset: "Corner In Slot",
    algs: {
      fr: [
        "U' R' F R F' R U R'",
        "R' F' R U R U' R' F",
        "U' F' R U R' U' R' F R",
        "U' F' U F U R U' R'",
      ],
      fl: [
        "U' L' U L F' r U r'",
        "U' L' U L F' L F L'",
        "U' L' U L y U L U' L'",
        "U' L' U L d R U' R'",
      ],
      bl: [
        "R D' R' U' R D R' L U L'",
        "L U' L' U' L U' L' U L U L'",
        "U' f' L' f U L U L'",
        "L' U' L' U' L' U L U L",
      ],
      br: [
        "U' R' U M U' R U M'",
        "R' S' R U' R' S R",
        "U' R' U R r' U' R U M'",
        "d' R' F R F' R U R'",
      ],
    },
  },
  {
    id: "f2l-26",
    name: "F2L 26",
    subset: "Corner In Slot",
    algs: {
      fr: [
        "U R U' R' F R' F' R",
        "R S' R' U R S R'",
        "U R U R' U' y L' U' L",
        "U R U' R' U' F' U F",
      ],
      fl: [
        "r U r' U' r' F r F'",
        "U L F' L' F L' U' L",
        "U F L' U' L U L F' L'",
        "U F r' F' r U r U' r'",
      ],
      bl: [
        "L S L' U L S' L'",
        "F R2 u R u' R2 F'",
        "U' R u R' U R U' u' R'",
        "U L U' M U L' U' M'",
      ],
      br: [
        "U f R f' U' R' U' R",
        "R' U R U R' U R U' R' U' R",
        "R U R U R U' R' U' R'",
        "U' R S2 R' U' R S2 R'",
      ],
    },
  },
  {
    id: "f2l-27",
    name: "F2L 27",
    subset: "Corner In Slot",
    algs: {
      fr: [
        "R U' R' U R U' R'",
        "F' U' F U2 R U' R'",
        "y' f R' f' U f R' f'",
        "y' f R' f' r' U' R U M'",
      ],
      fl: [
        "L' U' L U F' r U r'",
        "L' U' L U F' L F L'",
        "y' R U' R' U R U' R'",
        "U' F R U2 R' U F'",
      ],
      bl: ["L U' L' U L U' L'"],
      br: [
        "R' U2 R' F R F' R",
        "R' U' R U r' U' R U M'",
        "y R U' R' U R U' R'",
        "R' U' R U f' U f R'",
      ],
    },
  },
  {
    id: "f2l-28",
    name: "F2L 28",
    subset: "Corner In Slot",
    algs: {
      fr: ["R U R' U' F R' F' R", "y L' U L U' L' U L", "F' U F U' F' U F", "y' R' U R U' R' U R"],
      fl: ["L' U L U' L' U L", "L' U L2 F' L' F"],
      bl: ["L U2 L F' L' F L'", "y R' U R U' R' U R", "L U L' U' l U L' U' M'", "L U2 L' U f' L f"],
      br: ["R' U R U' R' U R"],
    },
  },
  {
    id: "f2l-29",
    name: "F2L 29",
    subset: "Corner In Slot",
    algs: {
      fr: [
        "R' F R F' U R U' R'",
        "y L' U' L U L' U' L",
        "y' R' U' R U R' U' R",
        "R' F R F' R' F R F'",
      ],
      fl: ["L' U' L U L' U' L", "U L' U2 L U2 L' U' L", "U F' L F L2 U' L", "F' L F L' F' L F L'"],
      bl: [
        "y R' U' R U R' U' R",
        "U2 L U' L' f' L' f",
        "f' L' f U f' L' f",
        "x' U' F' U F U' F' U x",
      ],
      br: ["R' U' R U R' U' R", "U R' U2 R U2 R' U' R", "U f' U f R2 U' R"],
    },
  },
  {
    id: "f2l-30",
    name: "F2L 30",
    subset: "Corner In Slot",
    algs: {
      fr: ["R U R' U' R U R'", "U' R U2 R' U2 R U R'", "U' F R' F' R2 U R'", "U2 F' U F R U R'"],
      fl: [
        "L F' L' F U' L' U L",
        "y' R U R' U' R U R'",
        "U' F U' R U2 R' F'",
        "y L U L' U' L U L'",
      ],
      bl: ["L U L' U' L U L'", "U' L U2 L' U2 L U L'"],
      br: ["y' L U L' U' L U L'", "f R f' U' f R f'", "U2 R' U R f R f'", "y R U R' U' R U R'"],
    },
  },
  {
    id: "f2l-31",
    name: "F2L 31",
    subset: "Edge In Slot",
    algs: {
      fr: ["U' R' F R F' R U' R'", "R U' R' U y' R' U R", "F' U F R U2 R'", "R U' R' U y L' U L"],
      fl: ["U L F' L' F L' U L", "L' U L U' y L U' L'", "L' U L F U2 F'", "U' F' L F L' F U' F'"],
      bl: ["L U' L F' L' F L'", "f' L f U' L U' L'", "B' U B L U2 L'", "L U2 L' U' l U L' U' M'"],
      br: ["R' U R' F R F' R", "R' U R f R2 f'", "R' U R y R U2 R'", "f R' f' U R' U R"],
    },
  },
  {
    id: "f2l-32",
    name: "F2L 32",
    subset: "Edge In Slot",
    algs: {
      fr: [
        "U R U' R' U R U' R' U R U' R'",
        "R U R' U' R U R' U' R U R'",
        "R2 U R2 U R2 U2 R2",
        "U' F R' F' R U' R U R'",
      ],
      fl: [
        "U' L' U L U' L' U L U' L' U L",
        "U L' U L U' L' U2 L U L' U' L",
        "U2 F U' R U R' U F'",
        "L' U' L U L' U' L U L' U' L",
      ],
      bl: [
        "L U L' U' L U L' U' L U L'",
        "U L U' L' U L U' L' U L U' L'",
        "L2 U L2 U L2 U2 L2",
        "U' L U' L' U L U2 L' U' L U L'",
      ],
      br: [
        "U' R' U R U' R' U R U' R' U R",
        "R' U' R U R' U' R U R' U' R",
        "U2 f R' U R U' R f'",
        "R2 U' R2 U' R2 U2 R2",
      ],
    },
  },
  {
    id: "f2l-33",
    name: "F2L 33",
    subset: "Edge In Slot",
    algs: {
      fr: [
        "U' R U' R' U2 R U' R'",
        "y R' D R U' R' D' R",
        "R U R' U' R U' R' U R U' R'",
        "U' R U' R' U' R U2 R'",
      ],
      fl: [
        "R' D R U' R' D' R",
        "U L' U2 L U' L' U' L",
        "U' L D L' U L D' L'",
        "U' L' U' L U2 L' U' L",
      ],
      bl: ["U' L U' L' U2 L U' L'", "U' L U' L' U' L U2 L'", "D' R D R' U R D' R' D"],
      br: [
        "U' R D R' U R D' R'",
        "U R' U2 R U' R' U' R",
        "U' R' U' R U2 R' U' R",
        "U R D R' U' R D' R'",
      ],
    },
  },
  {
    id: "f2l-34",
    name: "F2L 34",
    subset: "Edge In Slot",
    algs: {
      fr: [
        "U R U R' U2 R U R'",
        "U' R U2 R' U R U R'",
        "U R' D' R U' R' D R",
        "y U L' U L U2 L' U L",
      ],
      fl: ["U L' U L U2 L' U L", "U L' U L U L' U2 L", "L' U' L U L' U L U' L' U L"],
      bl: [
        "U L U L' U2 L U L'",
        "U L' D' L U' L' D L",
        "U' L U2 L' U L U L'",
        "U2 R D' R' U' R D R'",
      ],
      br: [
        "U R' U R U R' U2 R",
        "U f R2 U R2 U' f'",
        "U R2 F R F' R U' R' U R",
        "U R' U R U2 R' U R",
      ],
    },
  },
  {
    id: "f2l-35",
    name: "F2L 35",
    subset: "Edge In Slot",
    algs: {
      fr: [
        "U' R U R' U F' U' F",
        "U2 R U R' F R' F' R",
        "U' R U R' U y' R' U' R",
        "U' R U R' d R' U' R",
      ],
      fl: [
        "U2 F U F' U' L' U L",
        "U2 L F' L' F U2 L' U' L",
        "U' F R' F R F' U F'",
        "U' F U F' U L' U' L",
      ],
      bl: [
        "U' L U L' U f' L' f",
        "U2 L U L' U' L F U F' L'",
        "L U L' y R' U' R U R' U' R",
        "U2 L U M U L' U' M'",
      ],
      br: [
        "U' f R f' U R' U' R",
        "R' F R' F' R U R U' R' U' R",
        "U2 f R f' U' R' U R",
        "U' R' F' U F U' R U R' U' R",
      ],
    },
  },
  {
    id: "f2l-36",
    name: "F2L 36",
    subset: "Edge In Slot",
    algs: {
      fr: [
        "U F' U' F U' R U R'",
        "U2 R' F R F' U2 R U R'",
        "R2 u R U R' U' u' R' U R'",
        "R2 D r' U r D' R' U R'",
      ],
      fl: [
        "U L' U' L U' F U F'",
        "U2 L' U L U F U F'",
        "U2 L' U' L F' r U r'",
        "U L' U' L d' L U L'",
      ],
      bl: [
        "U f' L' f U' L U L'",
        "U2 f' L' f U L U' L'",
        "L F' L F L' U' L' U L U L'",
        "y U R' U' R U' f R f'",
      ],
      br: [
        "U R' U' R U' f R f'",
        "U2 R' U' R U R' F' U' F R",
        "U R' U' R y U' R U R'",
        "U R' U' R U' y R U R'",
      ],
    },
  },
  {
    id: "f2l-37",
    name: "F2L 37",
    subset: "Pieces In Slot",
    algs: {
      fr: [
        "R2 U2 F R2 F' U2 R' U R'",
        "R' F R F' R U' R' U R U' R' U2 R U' R'",
        "R U2 R' U R U2 R' U F' U' F",
        "R U R' U2 R U2 R' U y' R' U' R",
      ],
      fl: [
        "L2 U2 F' L2 F U2 L U' L",
        "L' U2 L U' L' U2 L U' F U F'",
        "L' U' L U2 L' U2 L U' y' R U R'",
        "R' F R L' U' L U' R' F R L' U' L",
      ],
      bl: [
        "L U' L' l' U2 L2 U L2 U l",
        "f' L f U' L U2 L' U2 L U' L'",
        "L U2 L' U L U2 L' U f' L' f",
        "L' f U f' L' U2 L2 U L2 U L",
      ],
      br: [
        "R' U R r U2 R2 U' R2 U' r'",
        "R' U2 R U' R' U2 R U' f R f'",
        "R' U R f R U R2 U' R f'",
        "R' U' R U2 R' U2 R U' f R f'",
      ],
    },
  },
  {
    id: "f2l-38",
    name: "F2L 38",
    subset: "Pieces In Slot",
    algs: {
      fr: [
        "R U' R' U' R U R' U2 R U' R'",
        "R U R' U' R U2 R' U' R U R'",
        "R2 U2 R' U' R U' R' U2 R'",
        "R U' R' U' R U R' U' R U2 R'",
      ],
      fl: [
        "L' U L U' L' U2 L U' L' U L",
        "F R U2 R' U' R U R' U2 F'",
        "L' U2 L' U' L U' L' U2 L2",
        "F U' R U2 R' U' R U2 R' F'",
      ],
      bl: [
        "L U L' U' L U2 L' U' L U L'",
        "L2 U2 L' U' L U' L' U2 L'",
        "L U' L' U' L U L' U' L U2 L'",
        "L U' L' U' L U L' U2 L U' L'",
      ],
      br: [
        "R' U' R U2 R' U R U' R' U' R",
        "R' U R U' R' U2 R U' R' U R",
        "R' U2 R' U' R U' R' U2 R2",
      ],
    },
  },
  {
    id: "f2l-39",
    name: "F2L 39",
    subset: "Pieces In Slot",
    algs: {
      fr: [
        "R U' R' U R U2 R' U R U' R'",
        "R U2 R U R' U R U2 R2",
        "R U R' U2 R U' R' U R U R'",
        "R U2 R' U R U' R' U R U R'",
      ],
      fl: [
        "L' U' L U L' U2 L U L' U' L",
        "F' L F L2 U2 L U L' U' L",
        "L' U L U L' U' L U2 L' U L",
        "F U2 R U' R' U R U2 R' F'",
      ],
      bl: [
        "L U L' U2 L U' L' U L U L'",
        "L U' L' U L U2 L' U L U' L'",
        "L U2 L' U L U' L' U L U L'",
        "L U2 L U L' U L U2 L2",
      ],
      br: [
        "R' U' R U R' U2 R U R' U' R",
        "R' U R U R' U' R U2 R' U R",
        "f R2 U R' U' F R' f' U F'",
        "R2 U2 R U R' U R U2 R",
      ],
    },
  },
  {
    id: "f2l-40",
    name: "F2L 40",
    subset: "Pieces In Slot",
    algs: {
      fr: [
        "r U' r' U2 r U r' R U R'",
        "F' L' U2 L F R U R'",
        "R U' R' F R U R' U' F' R U' R'",
        "R U' R' U' R U' R' U y' R' U' R",
      ],
      fl: [
        "L' U L F R U2 R' F'",
        "L' U L l' U l U2 l' U' l",
        "L' U L R' F R U2 R' F' R",
        "L' U L U2 y L U L' U L U' L'",
      ],
      bl: [
        "l U' l' U2 l U l' L U L'",
        "f' L f L F U2 F' L'",
        "f' L f U2 L U L' U L U' L'",
        "f' L f U2 L U L' U2 L U2 L'",
      ],
      br: [
        "R' U R r' U r U2 r' U' r",
        "R' F' U2 F R f R f'",
        "R' U R f U R2 U' f'",
        "R2 F' U' F U R U' R",
      ],
    },
  },
  {
    id: "f2l-41",
    name: "F2L 41",
    subset: "Pieces In Slot",
    algs: {
      fr: [
        "R U' R' r U' r' U2 r U r'",
        "R U' R' F' L' U2 L F",
        "R U R' U' y M U' R' F R U M'",
        "R U R' U' R U' R' U2 y' R' U' R",
      ],
      fl: [
        "l' U l U2 l' U' l L' U' L",
        "L' U L U L' U L U' y' R U R'",
        "F R U2 R' F' L' U' L",
        "R' F R U2 R' F' R L' U' L",
      ],
      bl: [
        "f' L f U' L U L' U L U L'",
        "L2 F U F' U' L' U L'",
        "L F U2 F' L' f' L' f",
        "L U' L' d' U' R' U' R U' R' U R",
      ],
      br: [
        "r' U r U2 r' U' r R' U' R",
        "R' U R' U' F' U F R2",
        "f R' f' U2 R' U' R U' R' U R",
        "f R' f' U2 R' U' R U2 R' U2 R",
      ],
    },
  },
];

const forSlot = (slot: F2lSlot, id: string, name: string): AlgSet =>
  defineAlgSet({
    id,
    name,
    cases: CASES.map((c) => ({ id: c.id, name: c.name, subset: c.subset, algs: c.algs[slot] })),
  });

/** F2L, front-right slot (DFR corner 4 + FR edge 8). */
export const f2lFr: AlgSet = forSlot("fr", "f2lFr", "F2L (front-right)");
/** F2L, front-left slot (DLF corner 5 + FL edge 9). */
export const f2lFl: AlgSet = forSlot("fl", "f2lFl", "F2L (front-left)");
/** F2L, back-left slot (DBL corner 6 + BL edge 10). */
export const f2lBl: AlgSet = forSlot("bl", "f2lBl", "F2L (back-left)");
/** F2L, back-right slot (DRB corner 7 + BR edge 11). */
export const f2lBr: AlgSet = forSlot("br", "f2lBr", "F2L (back-right)");

/** All four slots, keyed by slot — for a method that wires the slots generically. */
export const f2lBySlot: Readonly<Record<F2lSlot, AlgSet>> = {
  fr: f2lFr,
  fl: f2lFl,
  bl: f2lBl,
  br: f2lBr,
};
