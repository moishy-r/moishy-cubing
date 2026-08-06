// The CFOP method, wired on @moishy/cubing-core mechanisms, @moishy/steps steps and
// @moishy/algsets data.
//
// Cross -> F2L (four pair steps) -> OLL -> PLL. This module is configuration only:
// every step it lists is assembled in `@moishy/steps`, because none of them is CFOP's
// alone — a cross is a cross, the four F2L slots are the same four slots whoever fills
// them, and OLL/PLL are shared with APB's opt-in two-look last layer.
//
// Two things worth knowing before changing anything here.
//
// **Rotations are used, not avoided.** Unlike APB, CFOP's data is full of them — 315
// rotation tokens across the two F2L sets — and they are executed as written. The
// frame an alg leaves is the state the next step continues from: `runPhase` evaluates
// a step in both the as-held and the homed frame and keeps the cheaper, and for a
// `y`-type frame the pre/post AUF absorbs the difference entirely, so nothing is ever
// emitted to undo a rotation. Slots are tracked by cubie, so a rotation never changes
// which pair a step means; `slotAt` maps back to the physical position for display.
//
// **F2L is ONE step, whose strategies are the pair orders.** Not four. Four Steps model F2L
// as four decisions, each committed before the next is looked at — and once the orders are
// searched exhaustively that structure does not exist: there is one decision, the order,
// taken once. Worth ~3 moves of F2L over deciding a pair at a time. `@moishy/steps` still
// exports the four-Step shape (`f2lSteps`) for a method that wants per-pair granularity.
//
// The consequence to know: nothing can replace only the *last* slot, because no step names
// it. Nothing wants to — ZBLS already spans the whole of F2L, since which slot it leaves
// open is decided by the three inserts before the last one, not by the last one.

import { type MethodDefinition, type Move, parseAlg, type Replacement } from "@moishy/cubing-core";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { oll as ollSet } from "@moishy/algsets/oll";
import { pll as pllSet } from "@moishy/algsets/pll";
import {
  blockSearch,
  collEpllStrategy,
  CROSS,
  f2lLookup,
  f2lOrderedStep,
  f2lPseudoReplacement,
  f2lSlotLookups,
  ollStep,
  pllStep,
  wvSvExtra,
  zbllStrategy,
  zblsReplacement,
} from "@moishy/steps";
import { zbls as zblsSet } from "@moishy/algsets/zbls";
import { collEpll as collSet } from "@moishy/algsets/coll-epll";
import { zbll as zbllSet } from "@moishy/algsets/zbll";
import { sv as svSet } from "@moishy/algsets/sv";
import { wv as wvSet } from "@moishy/algsets/wv";

// --- Step: cross -------------------------------------------------------------
//
// The four D-layer edges by search, and nearly free: a cross is 8 moves or fewer for
// any scramble, and `blockSearch` already wires the pruning table, A*, axis
// canonicalization and the region key. Colour neutrality is handled upstream by the
// runner's commit-early rotation choice, so this stays in the fixed frame.
const cross: MethodDefinition["steps"][number] = {
  id: "cross",
  label: "Cross",
  strategies: [{ id: "cross", phases: [blockSearch("cross", CROSS, { maxDepth: 8 })] }],
};

// --- Steps: f2l1..f2l4 -------------------------------------------------------
//
// Both sets are passed so their algs merge per pair position and compete on cost:
// `advanced-f2l` covers pairs with a piece trapped in another slot, which the classic
// 41 do not. Each step also carries a setup fallback for the mid-F2L tangles neither
// set covers — see `@moishy/steps`' f2l module.
const F2L_SETS = [f2lBySlot, advancedF2lBySlot];
const F2L_CASES = f2lSlotLookups(F2L_SETS);
// 24 order strategies plus the greedy any-order one as a safety net; the race picks.
const f2l = f2lOrderedStep(F2L_CASES, f2lLookup(F2L_SETS));

// --- Steps: oll, pll ---------------------------------------------------------
const oll = ollStep(ollSet);
const pll = pllStep(pllSet);

// --- Replacements ------------------------------------------------------------

/**
 * ZBLS over the whole F2L span: insert three pairs, then finish the fourth with an alg
 * that orients the last-layer edges on the way, so OLL is guaranteed to be one of the
 * seven OCLL shapes.
 *
 * The span is all four F2L steps, not just `f2l4`, because the constraint is on the pair
 * *order*: the data is authored for the front-right slot, so the earlier steps are the
 * ones that have to leave a usable slot open. `@moishy/steps` registers two strategies
 * for that — reserve FR deliberately, or insert greedily and align whatever is left with
 * a single `y` — and the cost race picks. Never a `y2`.
 *
 * `compete`, so the runner solves the span both ways and keeps the cheaper whole solve.
 * ZBLS spends moves in F2L to save them in the last layer, so whether it wins is a real
 * cost question rather than something to decide in advance. Opt-in and off by default.
 *
 * **Measured: it does not pay for itself in CFOP, and `compete` correctly never fires
 * it.** Over 8 scrambles a ZBLS route exists on 4 and is cheaper on none — mean cost
 * 58.87 -> 68.31. The reason is structural rather than a wiring fault: ZBLS's payoff is
 * that OLL becomes one of the seven OCLL shapes, and full OLL was already about that
 * cheap, so the longer insert is not repaid. One scramble even got an OLL *skip* and was
 * still 12.33 worse. The payoff ZBLS is built for is ZBLL, which solves the whole last
 * layer in one alg — a different method. Force it with
 * `replacements: { zbls: { enabled: true, mode: "force" } }` to see it regardless; it is
 * correct, just not cheaper.
 */
const zbls = zblsReplacement(zblsSet, F2L_CASES);

/**
 * Pseudo-slotting: the same order search, but each pair may go in against a D layer turned
 * away from the centers, with one D at the end to put it right.
 *
 * See the measurement note in `@moishy/steps`' f2l-order before enabling it — under this
 * cost model, starting from an *exact* cross, it is close to a wash.
 */
const f2lPseudo = f2lPseudoReplacement(F2L_CASES, { region: ["f2l", "f2l"] });

/**
 * ZBLL over `[oll, pll]`: the whole last layer in one alg.
 *
 * Only applicable once the last-layer edges are already oriented, which in CFOP means
 * something upstream did it — i.e. ZBLS. Enable both and the pair becomes what ZB
 * actually is: spend a few moves orienting edges during the last insert, collect the
 * entire last layer in a single alg. `compete`, so on the scrambles where the edges are
 * not oriented it simply produces no candidate and the normal OLL/PLL runs.
 */
const zbll: Replacement = {
  id: "zbll",
  label: "ZBLL",
  region: ["oll", "pll"],
  mode: "compete",
  strategies: [zbllStrategy(zbllSet, pllSet)],
};

/**
 * COLL + EPLL over `[oll, pll]`. Like ZBLL it needs the edges already oriented, so it is
 * a companion to ZBLS rather than something CFOP can use on its own.
 */
const collEpll: Replacement = {
  id: "collEpll",
  label: "COLL + EPLL",
  region: ["oll", "pll"],
  mode: "compete",
  strategies: [collEpllStrategy(collSet, pllSet)],
};

// --- Extras ------------------------------------------------------------------

/**
 * Winter/Summer Variation: part-way through the last insert, splice an alg that
 * finishes the pair *and* orients the last-layer corners, so OLL is done too.
 *
 * Unlike ZBLS its payoff lands inside OLL rather than reshaping it — the region covers
 * `[f2l4, oll]` outright and the next thing is PLL. It fires rarely by construction:
 * WV needs the last-layer edges already oriented, which happens on about 1 solve in 8,
 * and the data is FR-authored so the last slot must be there or a single `y` away.
 */
const winterSummerVariation = wvSvExtra(wvSet, svSet, { region: ["f2l", "oll"] });

// Not reusable, and worth recording why: APB's `ocllPll` and `collEpll` line up with
// CFOP's `[oll, pll]` region but both OCLL and COLL assume the last-layer **edges are
// already oriented**. In APB they are, because EO is a core step; in CFOP nothing has
// oriented them when OLL begins. Forcing either throws `SettingsError` at the `oll`
// boundary, correctly — the case table genuinely does not cover the state. A real
// two-look OLL for CFOP is edge orientation then OCLL, which needs the edge-orienting
// cases as their own filtered set: data work, not wiring.

// --- Colour neutrality --------------------------------------------------------
//
// Full neutrality is the CFOP norm and the cross search is cheap enough to race all 24
// orientations, but the shipped default is the same dual-CN set APB uses — either
// bottom colour times the four front faces. Override per solve with
// `settings.colorNeutrality`.
const DUAL_CN_BOTTOM: Move[][] = [
  [],
  parseAlg("y"),
  parseAlg("y2"),
  parseAlg("y'"),
  parseAlg("z2"),
  parseAlg("z2 y"),
  parseAlg("z2 y2"),
  parseAlg("z2 y'"),
];

// --- The Method definition ---------------------------------------------------

/**
 * The CFOP method: cross, four F2L pair steps, OLL, PLL.
 *
 * Lookahead defaults to depth 1 across every adjacent pair of core steps. The F2L
 * chain is where it earns most: which pair a step takes changes what the next one
 * faces, so choosing greedily on one insert alone is measurably worse.
 */
export const cfopDefinition: MethodDefinition = {
  id: "cfop",
  label: "CFOP",
  steps: [cross, f2l, oll, pll],
  replacements: [f2lPseudo, zbls, zbll, collEpll],
  extras: [winterSummerVariation],
  recommendedSettings: {
    colorNeutrality: DUAL_CN_BOTTOM,
    lookahead: {
      depth: 1,
      scope: [
        ["cross", "f2l"],
        ["f2l", "oll"],
        ["oll", "pll"],
      ],
    },
  },
};
