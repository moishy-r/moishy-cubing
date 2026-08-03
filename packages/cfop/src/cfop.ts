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
// **F2L is four steps, not one.** They are interchangeable: the goal of step N is "the
// cross is intact and at least N slots are solved", so which pair each solves is
// decided by cost, per scramble. A slot that is already solved costs nothing, which is
// what will let an X-cross replace only the cross step later. And the last slot being
// an ordinary Step is what will let ZBLS/OLS replace it — see KNOWN below.
//
// KNOWN, deliberately not wired yet: the last-slot variants (ZBLS, OLS) and the
// Winter/Summer Variation extra. Their data is authored for the **FR slot**, while
// CFOP's last slot is whichever one the first three steps did not take. Making them
// apply generally needs either per-slot data or an alignment that can combine a
// rotation with a U turn (`aufOptions` offers one family at a time), and half-working
// is worse than absent. The step shape is ready for them: `[f2l4, f2l4]` for a
// replacement, `[f2l4, oll]` for the extra.

import { type MethodDefinition, type Move, parseAlg } from "@moishy/cubing-core";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { oll as ollSet } from "@moishy/algsets/oll";
import { pll as pllSet } from "@moishy/algsets/pll";
import { blockSearch, CROSS, f2lSteps, ollStep, pllStep } from "@moishy/steps";

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
const f2l = f2lSteps([f2lBySlot, advancedF2lBySlot]);

// --- Steps: oll, pll ---------------------------------------------------------
const oll = ollStep(ollSet);
const pll = pllStep(pllSet);

// --- Replacements ------------------------------------------------------------
//
// None yet, and the two obvious candidates are the reason to be careful here.
//
// APB's `ocllPll` and `collEpll` are NOT reusable as CFOP's two-look last layer, even
// though the step ids line up. Both OCLL and COLL assume the last-layer **edges are
// already oriented** — in APB they are, because EO is a core step before the last
// layer; in CFOP nothing has oriented them when OLL begins. Forcing either here throws
// `SettingsError` at the `oll` boundary, correctly: the case table genuinely does not
// cover the state.
//
// A real two-look OLL for CFOP is *edge orientation* then OCLL, which needs the
// edge-orienting cases as their own filtered set — data work, not wiring. Until then
// full OLL is the only last-layer route, which is what CFOP is anyway.

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
  steps: [cross, ...f2l, oll, pll],
  replacements: [],
  extras: [],
  recommendedSettings: {
    colorNeutrality: DUAL_CN_BOTTOM,
    lookahead: {
      depth: 1,
      scope: [
        ["cross", "f2l1"],
        ["f2l1", "f2l2"],
        ["f2l2", "f2l3"],
        ["f2l3", "f2l4"],
        ["f2l4", "oll"],
        ["oll", "pll"],
      ],
    },
  },
};
