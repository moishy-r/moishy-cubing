// The APB method, wired on @moishy/cubing-core mechanisms + @moishy/algsets data.
//
// See /packages/apb/SPEC.md for the method spec and /DESIGN.md for the
// mechanisms. This module is pure configuration: it declares the core Steps
// (block223 -> brPair -> eo -> lxs -> zbll), their Strategies/Phases, the
// registered Replacements/Extras, and APB's recommended default settings. All
// solving behavior comes from cubing-core's runner.
//
// Data status (see the DESIGN "Algset schema" caveat + SPEC). Every core step
// and every registered Replacement/Extra is now data-backed and its recognition
// signature verified (recognize + solve across all cases + AUFs, in the tests):
//   - core: block223 / brPair / eo / lxs / zbll (eo = the `dbr` EO subset of
//     `eo-pair`; zbll falls through to `pll`),
//   - replacements: ocllPll (OCLL = OLL 21-27), collEpll (coll + epll=pll
//     subset), eoPair (insert subsets), eodrLs (eodr + ls=lxs subset),
//     backSlotEoLxs (frPair + eoBackSlot=`dfr` subset + lxsBackSlot — an
//     every-scramble front-pair-first alternative, a compete replacement not an extra),
//   - extras: oll, zbls, winterSummerVariation (wv/sv).
// Full end-to-end solves work and stay in the fixed frame (centers home from
// start to finish) — see the "Center frame" and "Last layer" notes below and
// geometry.ts. ZBLL is complete: all 7775 EO-solved last-layer states solve
// (guarded by a full-coverage test). Block-building searches the full slice/wide
// move set, guided by a cost-based, center-aware pruning table (pruning.ts) with
// axis canonicalization + region-coordinate keying (geometry.ts). The default
// races the 8 dual-CN orientations. Known follow-ups, none blocking a correct
// solve: (1) only `fbDfdb` is enabled by default; the pure-search strategies
// (`cornerFirst*`, `cross1Front`/`cross1Back`, `direct`) are opt-in. cornerFirst
// and cross1 are fast (a whole-block `guardGoal` heuristic; cross1 inserts its
// pairs one at a time and races both orders), and `direct` — one search for the
// whole 7-piece block — is now practical too, guided by a maxed set of overlapping
// sub-region tables (`DIRECT_GROUPS`, pruning.ts `regionHeuristicMulti`): ~0.1-1.4s
// per orientation where the old corners-vs-edges split ran past 30s or exhausted
// the heap. It finds genuinely shorter blocks — over 25 scrambles, dual-CN, shipped
// defaults: mean 7.4 STM (range 6-8) against fbDfdb's 9.8 (8-11), and it wins the
// six-way race on all 25 — but costs ~1.4s per dual-CN solve against fbDfdb's ~0.02s
// warm, so it stays opt-in; (2) winterSummerVariation is wired and does fire — the
// runner auto-scans every prefix of the chosen LXS alg for an insertable WV/SV case
// (no hand-placed `preInsert` checkpoints needed, as an earlier note here claimed),
// and races the splice against the normal LXS->ZBLL finish. It applies only when the
// last pair and LL orientation allow it, so it lands on a minority of scrambles
// (measured ~1 in 30 with the extra enabled). Replacements/Extras are opt-in
// (disabled) per project convention.
//
// Orientation. Recognition and goals are evaluated *up to whole-cube rotation*
// (cubing-core `normalizeOrientation`): a state is matched/solved by its pieces
// relative to the centers, so a cube rotation never breaks a step (see
// geometry.ts `regionSolved` / cubing-core `isSolved`). Crucially this still
// rejects slice/wide *center drift* — where the pieces did NOT rotate with the
// centers — so the colors must genuinely match, not just the slots. Algs are
// used verbatim: an imported primary that ends tilted (a net `y`) simply leaves
// the cube solved-up-to-rotation, which the goal accepts; and where a case also
// has a rotation-free variant, the cost race naturally prefers it (no move
// rewriting, so no awkward introduced `B`s). Most APB block *searches* keep the
// strict fixed frame (geometry.ts `regionSolvedStrict`) because their home-frame
// heuristic requires it. The exception is `fbDfdb`'s Roux FB, which uses the
// drift-allowing `regionSolvedLRHome` (L/R centers home, U/F/D/B drifted about
// the L–R axis) with an L–R-folded heuristic — see the block223 step. (A pll data
// fix also stands: the F-perm's primary was an OLL alg.)
//
// Rotation-GENERAL (as of the homing work): a phase whose *input* is itself in a
// rotated frame — a mid-solve rotation, a center-shifting move, or a solve begun
// after a `z2` inspection, as rotation-heavy methods (CFOP/ZB) need — is handled
// by cubing-core `runPhase`/`runPhaseCandidates`, which reorient the input to the
// home frame (`homeStart`, using `homingRotation`) before recognizing/searching,
// and prepend that rotation to the phase's moves. No primary needed re-authoring:
// every last-layer primary's tilt is a *clean* whole-cube rotation (audited over
// zbll/coll/oll/pll), so a homed input plus the both-AUF, rotation-invariant
// recognition (`aufInvariantLookup`) plus the rotation-invariant goals below
// reconcile it — cases like coll `t-3`/`t-4`, whose only alg ends tilted, now
// solve (the tilted result feeds the next phase, which homes it). APB's downstream
// steps still never trigger homing: after DFDB the cube is genuinely centers-home,
// and color-neutrality is realized by conjugation (centers stay home), so
// `homeStart` is a no-op from brPair onward. The one place a rotated/drifted frame
// is consumed is DFDB itself, which opts *out* of homing (`frameRelative`) and
// restores the FB's L–R drift in place — see the block223 step. (`zbls`, an
// opt-in extra, is now complete: all 301 cases recognize and solve, after 32 of
// them were conjugated from the BR/FL slots they had been authored against onto
// APB's FR slot — see the note above zblsExtra.)

import {
  type AlgorithmicPhase,
  applyMoves,
  axisCanonical,
  type CaseLookup,
  cornerSignature,
  type CubeState,
  eoSignature,
  fallThrough,
  isSolved,
  type MethodDefinition,
  type Move,
  type MoveCostModel,
  type MoveFamily,
  normalizeOrientation,
  orientationSignature,
  parseAlg,
  pieceSignature,
  regionCoordinate,
  regionHeuristic,
  regionSolved,
  regionSolvedAndEO,
  type Replacement,
  type SearchPhase,
} from "@moishy/cubing-core";
import { brPair as brPairSet } from "@moishy/algsets/br-pair";
import { frPair as frPairSet } from "@moishy/algsets/fr-pair";
import { dfdb as dfdbSet } from "@moishy/algsets/dfdb";
import { lxs as lxsSet } from "@moishy/algsets/lxs";
import { zbll as zbllSet } from "@moishy/algsets/zbll";
import { pll as pllSet } from "@moishy/algsets/pll";
import { oll as ollSet } from "@moishy/algsets/oll";
import { eoPair as eoPairSet } from "@moishy/algsets/eo-pair";
import { collEpll as collSet } from "@moishy/algsets/coll-epll";
import { eodr as eodrSet } from "@moishy/algsets/eodr";
import { zbls as zblsSet } from "@moishy/algsets/zbls";
import { wv as wvSet } from "@moishy/algsets/wv";
import { sv as svSet } from "@moishy/algsets/sv";
import { lxsBackSlot as lxsBackSlotSet } from "@moishy/algsets/lxs-back-slot";
import { aufInvariantLookup, regionLookup } from "@moishy/algsets";
import { block223Step, BLOCK_MOVES } from "@moishy/steps";
import {
  AFTER_BR,
  BLOCK223,
  EO_EDGE_SLOTS,
  eodrSignature,
  F2L,
  wvSvSignature,
  zblsSignature,
} from "./geometry.ts";

// Last-layer / U-relative alg phases align by U pre/post-AUF (the default).
const LL_AUF: MoveFamily[] = ["U"];

// Dual-CN default orientation set (SPEC "Recommended lookahead defaults" / DESIGN
// "Color neutrality"): the 8 orientations that keep the U/D-axis color pair on
// the D axis — either of the two opposite bottom colors (`z2` flips them), times
// the 4 front-face rotations (`y`). The runner races each through block223 and
// commits to the cheapest first block (block search is fast enough to make racing
// all 8 cheap). Fully overridable per solve via `settings.colorNeutrality`.
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

// The four AUF states. Used both by `pairJoined` (eoPair) and by the EPLL case
// filter, which must be AUF-invariant — see `cornersSolvedUpToAUF`.
const AUF4: Move[][] = [[], parseAlg("U"), parseAlg("U2"), parseAlg("U'")];

const alg = (
  id: string,
  goal: (s: CubeState) => boolean,
  cases: AlgorithmicPhase["cases"],
  auf: MoveFamily[] = LL_AUF,
  opts: { frameRelative?: boolean; costModel?: MoveCostModel } = {},
): AlgorithmicPhase => ({ kind: "algorithmic", id, goal, cases, auf, ...opts });

// A plain search phase (no pruning table) — for the short pair-forming searches
// in eoPair/backSlotEoLxs, which aren't block-building.
const searchPhase = (
  id: string,
  goal: (s: CubeState) => boolean,
  extra: Partial<SearchPhase> = {},
): SearchPhase => ({ kind: "search", id, goal, moves: BLOCK_MOVES, ...extra });

// --- Step: brPair (BR Pair) --------------------------------------------------
// Recognized on the location+orientation of the DRB corner (7) and BR edge (11):
// 0 signature collisions across all 89 cases (verified), every recognized state
// solved by its primary alg.
const brPair: MethodDefinition["steps"][number] = {
  id: "brPair",
  label: "BR Pair",
  strategies: [{
    id: "brPair",
    phases: [
      alg("brPair", regionSolved(AFTER_BR), regionLookup(brPairSet, pieceSignature([7], [11]))),
    ],
  }],
};

// --- Step: eo (EO) -----------------------------------------------------------
// EO is not its own algset: it is the `dbr-solved-eo` subset of `eo-pair` (the
// 11 cases where the BR pair is already solved-in-place, so eoPair degenerates
// to plain EO). Recognized on the EO-edge slot pattern (up to AUF).
const DBR_EO = "dbr-solved-eo-(1)";
const eoLookup = regionLookup(eoPairSet, eoSignature(EO_EDGE_SLOTS), (c) => c.subset === DBR_EO);
const eo: MethodDefinition["steps"][number] = {
  id: "eo",
  label: "EO",
  strategies: [{ id: "eo", phases: [alg("eo", regionSolvedAndEO(AFTER_BR), eoLookup)] }],
};

// --- Step: lxs (LXS) ---------------------------------------------------------
// Last slot: places DFR corner (4), FR edge (8), DR edge (4). Recognized on
// those three pieces' location+orientation (edges already oriented from eo).
const lxs: MethodDefinition["steps"][number] = {
  id: "lxs",
  label: "LXS",
  strategies: [{
    id: "lxs",
    phases: [alg("lxs", regionSolvedAndEO(F2L), regionLookup(lxsSet, pieceSignature([4], [8, 4])))],
  }],
};

// --- Step: zbll (ZBLL) -------------------------------------------------------
// Whole last layer in one alg. Recognized on the full facelet string (everything
// below is solved). Falls through to the 21-case PLL set for the
// corners-already-solved case the 472-case ZBLL set deliberately omits.
// Terminal step: recognize up to both pre- and post-AUF (see geometry.ts
// `aufInvariantLookup` — a plain pre-AUF-only lookup would recognize only the
// quarter of last-layer states that happen to need no post-AUF).
const zbllLookup = fallThrough(
  aufInvariantLookup(zbllSet, zbllSet.signature),
  aufInvariantLookup(pllSet, pllSet.signature),
);
const zbll: MethodDefinition["steps"][number] = {
  id: "zbll",
  label: "ZBLL",
  strategies: [{ id: "zbll", phases: [alg("zbll", isSolved, zbllLookup)] }],
};

// --- Replacements ------------------------------------------------------------

// ocllPll: OCLL (orient LL corners; edges already EO'd) then PLL. OCLL is the
// 7 all-edges-oriented cases of the OLL set (OLL 21-27), reused rather than
// re-authored. Lookahead ocll->pll picks the OCLL variant setting up cheaper PLL.
// Recognition (see geometry.ts): OCLL keys on last-layer *orientation* only
// (`orientationSignature`) — the OLL set's default full-facelet signature also
// pins the permutation, so it never matched a real solve's last layer. Built with
// `aufInvariantLookup` for both-AUF, rotation-invariant recognition. PLL is
// terminal here (reaches solved), so it too needs the both-AUF lookup — a plain
// pre-AUF-only `regionLookup` would only recognize the quarter of PLL states
// needing no post-AUF.
const OCLL_IDS = new Set(["oll-21", "oll-22", "oll-23", "oll-24", "oll-25", "oll-26", "oll-27"]);
const ocllLookup = aufInvariantLookup(ollSet, orientationSignature(), (c) => OCLL_IDS.has(c.id));
const pllLookup = aufInvariantLookup(pllSet, pllSet.signature);
const ocllPll: Replacement = {
  id: "ocllPll",
  label: "OCLL + PLL",
  region: ["zbll", "zbll"],
  mode: "force",
  strategies: [{
    id: "ocllPll",
    phases: [
      alg("ocll", (s) => normalizeOrientation(s).co.every((o) => o === 0), ocllLookup),
      alg("pll", isSolved, pllLookup),
    ],
  }],
};

// collEpll: COLL (orient + permute LL corners) then EPLL. EPLL is not its own
// set — it's the `pll` cases where corners are already solved (Ua/Ub/Z/H),
// filtered out. No lookahead past COLL (EPLL is fully determined by COLL's end).
// Corner goals are evaluated *up to whole-cube rotation* (like `regionSolved`):
// a case whose only (or cheapest) variant ends tilted by a clean rotation — e.g.
// coll `t-3`/`t-4`, which have no rotation-free alg — still counts as solved, and
// the next phase homes that tilted input (see cubing-core `homeStart`). Without
// this the absolute check rejected those legitimately-tilted results outright.
const cornersSolved = (s: CubeState) => {
  const n = normalizeOrientation(s);
  return n.cp.every((c, i) => c === i && n.co[i] === 0);
};
/**
 * Corners solved **up to AUF** — the correct test for "is this an EPLL case?".
 *
 * A case's recognition state is derived from `invert(algs[0])`, so it carries
 * whatever net U-rotation the alg leaves on the corners. Every one of the `z`
 * perm's five algs is M-slice-based, and their U turns permute the last-layer
 * corners: each leaves `cp = [2,3,0,1,...]` — the corners solved *up to a U2*.
 * The strict `cornersSolved` therefore rejected `z`, leaving the EPLL filter with
 * only 3 of its 4 cases (`h`, `ua`, `ub`) and making a Z-perm last layer
 * unsolvable by `collEpll`. This is not a data defect — all five variants agree,
 * and it is inherent to writing a Z perm with M slices.
 *
 * Folding AUF here is exactly right: recognition is built with
 * `aufInvariantLookup` (a two-sided U-coset), so a case whose corners are solved
 * up to a U turn *is* an EPLL case. The predicate still rejects the genuine
 * corner-permuting PLLs, whose corner permutation is not a U rotation.
 */
const cornersSolvedUpToAUF = (s: CubeState) => AUF4.some((u) => cornersSolved(applyMoves(s, u)));
// EPLL is terminal (reaches solved) -> both-AUF lookup like PLL.
const epllLookup = aufInvariantLookup(
  pllSet,
  pllSet.signature,
  (c) => cornersSolvedUpToAUF(pllSet.recognitionState(c.id)),
);
// COLL keys on the *corners* only (`cornerSignature`) — the coll-epll set's
// default full-facelet signature pins the edge permutation EPLL is meant to fix,
// so it never matched. Built with `aufInvariantLookup` (both-AUF, rotation-
// invariant). Many COLL primaries end tilted; the cost race prefers a case's
// rotation-free variant where one exists, and the few cases that have none
// (`t-3`, `t-4`) now solve too — their tilted result satisfies the rotation-
// invariant `cornersSolved` goal, and the following `epll` phase homes that
// rotated input (see the "Rotation-GENERAL" note up top).
//
// Falls through to the corner-permuting PLLs for the corner states the COLL set
// deliberately omits. `coll-epll` is faithful to its source (SpeedCubeDB's COLL):
// its 40 cases are grouped by the seven OCLL *orientation* shapes, so it has no
// case for a last layer whose corners are already **oriented but permuted** —
// those are corner PLLs (A/E and friends), not COLL. APB's `coll` phase goal is
// `cornersSolved`, so it must handle them anyway: all 23 such corner classes had
// no case, and `collEpll` simply could not solve that last layer (~3.6% of corner
// states; it surfaced as a force-mode failure once force stopped falling through
// to `zbll`).
//
// This is the same "derive the half we don't author" move as `epll` above — no
// new algorithm data. The filter is the exact complement of the EPLL one: PLLs
// whose corner permutation is *not* just an AUF are precisely the cases that
// permute corners, and each solves its own corner class. Keying on
// `cornerSignature` ignores the edges they also move; that is fine, because a
// corner-solving alg necessarily leaves an even edge permutation, which is an
// EPLL case (the following phase). Several PLLs share a corner class — harmless,
// first-defined wins and all of them solve it.
//
// The last resort is the COLL *skip*: if the corners are already solved up to a U
// turn, no alg is needed and the phase contributes only the AUF that aligns them
// (`runPhase` supplies it around the empty alg). Rare — 4 of the 648 corner states
// — but reachable, and without it a forced `collEpll` would now hard-error rather
// than emit nothing. Directly analogous to an OLL/PLL skip.
const cornersAlreadySolved: CaseLookup = {
  find: (s) => cornersSolvedUpToAUF(s) ? { id: "coll-skip", algs: [{ moves: [] }] } : null,
};
const collLookup = fallThrough(
  aufInvariantLookup(collSet, cornerSignature()),
  aufInvariantLookup(
    pllSet,
    cornerSignature(),
    (c) => !cornersSolvedUpToAUF(pllSet.recognitionState(c.id)),
  ),
  cornersAlreadySolved,
);
const collEpll: Replacement = {
  id: "collEpll",
  label: "COLL + EPLL",
  region: ["zbll", "zbll"],
  mode: "force",
  strategies: [{
    id: "collEpll",
    phases: [
      alg("coll", cornersSolved, collLookup),
      alg("epll", isSolved, epllLookup),
    ],
  }],
};

// eoPair (region [brPair, eo]): form the BR pair by search, then the insert that
// also does EO — the 126 mr/mu/or/ou cases of `eo-pair` (excluding the `dbr` EO
// and `dfr` back-slot subsets used elsewhere).
//
// Recognition keys on the BR pair (DRB 7 + BR 11) location+orientation AND the EO
// pattern: each case both inserts the pair and orients edges, so the same pair
// position with a different EO state needs a different alg — the pair alone
// collides badly (only ~12% of cases distinguishable), the pair+EO pair is
// collision-free.
const INSERT_SUBSETS = new Set(["mr", "mu", "or", "ou"]);
const eoPairInsertSignature = (s: CubeState) =>
  `${pieceSignature([7], [11])(s)}/${eoSignature(EO_EDGE_SLOTS)(s)}`;
const eoPairInsertLookup = regionLookup(
  eoPairSet,
  eoPairInsertSignature,
  (c) => INSERT_SUBSETS.has(c.subset ?? ""),
);
const eoPair: Replacement = {
  id: "eoPair",
  label: "EOPair",
  region: ["brPair", "eo"],
  mode: "compete",
  strategies: [{
    id: "eoPair",
    phases: [
      // Outer faces only: forming the BR pair while keeping the block intact is an
      // R/U-area manipulation (a slice used to form it would just have to be
      // undone). A* keyed by the block + pair coordinate (the goal's sufficient
      // statistic), guided by a pruning table over the BR pair pieces. That
      // heuristic targets the pair *inserted*, which is slightly past the "formed"
      // goal, so it can overestimate — formPair is not guaranteed minimal — but it
      // guides strongly toward the pair region (keeping this fast) and aligns with
      // the combined form+insert objective the next phase completes. eoPair is an
      // opt-in `compete` replacement, so a slightly long formPair only costs it
      // the race, never correctness.
      searchPhase("formPair", eoPairFormed, {
        moves: ["U", "D", "L", "R", "F", "B"],
        useAStar: true,
        canFollow: axisCanonical,
        heuristic: regionHeuristic([7], [11], ["U", "D", "L", "R", "F", "B"]),
        // The A* identity key must be a sufficient statistic for the goal. The
        // goal (`eoPairFormed` -> `pairJoined`) turns on the EO pattern (via the
        // insert lookup's `eoSignature`), so the key MUST include EO — otherwise
        // A* merges a goal state with an EO-differing non-goal state under one key
        // and can return the non-goal one (the pair left one U short). The block +
        // pair coordinate alone was not enough.
        stateKey: (s, last) =>
          `${regionCoordinate(AFTER_BR)(s, last)}/${eoSignature(EO_EDGE_SLOTS)(s)}`,
        maxDepth: 9,
      }),
      alg("eoPairInsert", regionSolvedAndEO(AFTER_BR), eoPairInsertLookup),
    ],
  }],
};

// formPair's target: get the BR pair (DRB corner 7 + BR edge 11) into a position
// the `eoPairInsert` algset recognizes, WITHOUT disturbing the 2x2x3 (block223
// must stay solved — centers included). The search must not just form the pair as
// fast as possible; a slice used to join the pair has to be undone (or its effect
// on the block otherwise restored), which the `regionSolved(BLOCK223)` clause
// enforces.
//
// The pair must be genuinely JOINED at formPair's end — not merely one U turn
// away. `runPhase` will still try a pre-AUF for the insert, and that pre-AUF is a
// legitimate *alignment* ONLY when the joined pair lives entirely on the U face:
// then a U spins corner+edge together and the pair stays made. If a pair piece is
// off the U layer (the BR edge sitting in FR — the "R" cases), a U instead moves
// the corner *relative to* the fixed edge, so that U is what *joins* the pair and
// belongs in formPair, not as the insert's pre-AUF. Hence:
//   - both pair pieces in the U layer -> recognizable up to AUF is enough (the
//     residual U is true alignment, left to `eoPairInsert`);
//   - otherwise -> require *direct* recognition (the joining U is folded into
//     formPair, where it belongs).
// This keeps the common U-face case as fast as before and only tightens the goal
// for the off-U-layer pairs, so the split lands on the real pair-forming move.
function pairJoined(s: CubeState): boolean {
  if (eoPairInsertLookup.find(s) !== null) return true; // joined at the canonical alignment
  const cornerInU = s.cp.indexOf(7) < 4;
  const edgeInU = s.ep.indexOf(11) < 4;
  return cornerInU && edgeInU &&
    AUF4.some((u) => eoPairInsertLookup.find(applyMoves(s, u)) !== null);
}
function eoPairFormed(s: CubeState): boolean {
  return regionSolved(BLOCK223)(s) && pairJoined(s);
}

// eodrLs (region [eo, lxs]): EODR (orient all edges + place DR) then LS. LS is
// not its own set — it's the `lxs` cases where DR is already solved, filtered.
const drSolved = (s: CubeState) => s.ep[4] === 4 && s.eo[4] === 0;
const lsLookup = regionLookup(
  lxsSet,
  pieceSignature([4], [8]),
  (c) => drSolved(lxsSet.recognitionState(c.id)),
);
const eodrLs: Replacement = {
  id: "eodrLs",
  label: "EODR + LS",
  region: ["eo", "lxs"],
  mode: "compete",
  strategies: [{
    id: "eodrLs",
    // eodr recognizes on the orientation of the 6 EODR edges (by slot) + the DR
    // location it must route (geometry.ts `eodrSignature`). It does NOT fix the
    // U-edge / FR *permutation* (LXS/ZBLL do), so keying on their positions — as
    // the old `pieceSignature` over the 6 cubies did — over-constrained and almost
    // never matched a live state. The 55 cases cover the space under this key.
    phases: [
      alg(
        "eodr",
        (s) => regionSolvedAndEO(AFTER_BR)(s) && drSolved(s),
        regionLookup(eodrSet, eodrSignature()),
      ),
      alg("ls", regionSolvedAndEO(F2L), lsLookup),
    ],
  }],
};

// --- Extras ------------------------------------------------------------------

// Orientation goals (OLL/OCLL/WV) likewise up to whole-cube rotation.
const cornersOriented = (s: CubeState) => normalizeOrientation(s).co.every((o) => o === 0);
const edgesOriented = (s: CubeState) => normalizeOrientation(s).eo.every((o) => o === 0);

// oll (region [eo..zbll], boundary trigger = whole F2L already solved): full OLL
// then PLL, straight from an un-EO'd finished F2L. `pll` reused. OLL keys on
// last-layer *orientation* only (`orientationSignature`); built via
// `aufInvariantLookup` for both-AUF, rotation-invariant recognition (same as OCLL).
const ollLookup = aufInvariantLookup(ollSet, orientationSignature());
const ollExtra = {
  id: "oll",
  label: "OLL + PLL",
  region: ["eo", "zbll"] as [string, string],
  mode: "force" as const,
  trigger: { kind: "boundary" as const, test: regionSolved(F2L) },
  strategies: [{
    id: "ollPll",
    phases: [
      alg("oll", (s) => cornersOriented(s) && edgesOriented(s), ollLookup),
      alg("pll", isSolved, pllLookup),
    ],
  }],
};

// zbls (region [eo, lxs], boundary trigger = DR already solved after brPair):
// solve EO + last slot in one alg, landing ZBLL-ready. Recognizes on the
// last-slot pair + edge orientation (geometry.ts `zblsSignature`) — the algset's
// default full-facelet signature pinned the last-layer permutation ZBLS leaves
// for ZBLL, so it never matched. Built with `aufInvariantLookup` (both-AUF,
// rotation-invariant); tilted primaries lose the cost race to rotation-free
// variants where present. See KNOWN below.
//
// FIXED (was: 32 of 302 cases unsolvable). The cause was never bad algs — every
// stored alg solved its own case correctly. 32 cases were authored against the
// *wrong F2L slot*: 22 solved BR and 10 solved FL, each carrying a leading `y`/`y'`
// from the source's working slot. APB recognizes ZBLS on the FR slot (DFR corner 4
// + FR edge 8), so those cases' recognition states had the wrong slot open — and,
// being defined early, they won AUF-coset signature entries belonging to genuine FR
// cases, hijacking 27 of them into a lookup hit whose alg could not solve the state.
// Conjugating the 32 onto FR (24 came out rotation-free, e.g. `y U' L' U L` ->
// `U' F' U F`) fixes both halves at once: all cases now recognize and solve. (The set
// is 301, not 302: f2l-34-2 was the same ZBLS case as f2l-33-2 — the two differ only in
// last-layer corner state, which ZBLS does not touch, so each one's alg solved the
// other's state and only the first-defined was ever reachable. Merged, keeping both
// algs as variants of f2l-33-2 so the cost race can still pick either.)
// Guarded by "zbls: every case targets the FR slot, and is recognized and solved"
// in apb_test.ts, which asserts the slot invariant *and* end-to-end reachability.
const zblsExtra = {
  id: "zbls",
  label: "ZBLS",
  region: ["eo", "lxs"] as [string, string],
  mode: "force" as const,
  trigger: {
    kind: "boundary" as const,
    test: (s: CubeState) => regionSolved(AFTER_BR)(s) && drSolved(s),
  },
  strategies: [{
    id: "zbls",
    phases: [alg("zbls", regionSolvedAndEO(F2L), aufInvariantLookup(zblsSet, zblsSignature()))],
  }],
};

// winterSummerVariation (region [lxs, zbll], checkpoint trigger): mid-LXS, right
// before the final insert, splice WV/SV then PLL instead of finishing normally.
// The checkpoint trigger auto-scans every prefix of the chosen LXS alg for the
// point where the last pair is set up on top and a WV/SV case is recognized (no
// hand-placed `checkpoints` needed — not every LXS case has a WV/SV form, and
// annotating each alg would be error-prone); the runner races each such splice
// against the normal LXS->ZBLL finish by MCC. This works across methods (e.g. the
// last F2L pair in CFOP). WV/SV recognize on last-layer orientation + the last-
// pair setup (geometry.ts `wvSvSignature`) — the sets' default full-facelet
// signature pinned the LL permutation PLL leaves, so it never matched a live
// mid-insert state. Built with `aufInvariantLookup` (both-AUF, rotation-invariant).
const wvSvLookup = fallThrough(
  aufInvariantLookup(wvSet, wvSvSignature()),
  aufInvariantLookup(svSet, wvSvSignature()),
);
const winterSummerVariation = {
  id: "winterSummerVariation",
  label: "Winter/Summer Variation",
  region: ["lxs", "zbll"] as [string, string],
  mode: "force" as const,
  trigger: { kind: "checkpoint" as const },
  strategies: [{
    id: "wvSv",
    phases: [alg("wvSv", cornersOriented, wvSvLookup), alg("pll", isSolved, pllLookup)],
  }],
};

// backSlotEoLxs (replacement, region [brPair..lxs]): the front-pair-first F2L+EO
// order — insert the front-right pair (frPair), then EO from the back (backSlotEo),
// then solve the back slot (backSlotLxs). A genuine every-scramble alternative to
// brPair -> eo -> lxs (you can always insert the front pair and finish from the
// back), so it is a `compete` *Replacement*, not an Extra. (It was mistakenly a
// boundary-triggered Extra that fired only when the front pair happened to be
// pre-formed; `compete` is exactly the "use it when it's cheaper" knob.) frPair is
// the mirror of the brPair set; backSlotEo is the `dfr` subset of eo-pair;
// backSlotLxs solves the back-right slot. Opt-in like the rest.
const eoBackSlotLookup = regionLookup(
  eoPairSet,
  eoSignature(EO_EDGE_SLOTS),
  (c) => c.subset === "dfr",
);
// What backSlotEo lands on: block223 + the front-right pair (DFR corner 4, FR edge
// 8), all edges oriented. The BACK slot (DBR 7 + BR 11) and DR (edge 4) are still
// open — backSlotLxs fills them. (`dfr` is the front-pair-solved EO subset, exactly
// mirroring the EO step's `dbr` back-pair-solved subset — so its goal is this front
// region + EO, NOT AFTER_BR, which would wrongly demand the back slot.)
const AFTER_FRONT = { corners: [4, 5, 6], edges: [5, 6, 7, 8, 9, 10] } as const;
const backSlotEoLxs: Replacement = {
  id: "backSlotEoLxs",
  label: "Back-slot EO + LXS",
  region: ["brPair", "lxs"],
  mode: "compete",
  strategies: [{
    id: "backSlotEoLxs",
    phases: [
      // Insert the front-right pair (DFR 4 + FR 8) by alg — the mirror of brPair,
      // recognized on those two pieces. Every frPair alg keeps block223 intact
      // (fixed-frame, verified), so this leaves the block solved + front pair in.
      alg("frPair", regionSolved(AFTER_FRONT), regionLookup(frPairSet, pieceSignature([4], [8]))),
      alg("eoBackSlot", regionSolvedAndEO(AFTER_FRONT), eoBackSlotLookup),
      // Back slot = DBR corner (7) + BR edge (11) + DR edge (4): backSlotLxs
      // solves the back-right slot, so it recognizes on those pieces (not the
      // front DFR/FR slot that frPair handles).
      alg(
        "lxsBackSlot",
        regionSolvedAndEO(F2L),
        regionLookup(lxsBackSlotSet, pieceSignature([7], [11, 4])),
      ),
    ],
  }],
};

// --- The Method definition ---------------------------------------------------

/**
 * The APB method definition: 5 core steps plus every registered
 * Replacement/Extra. Units whose algsets are still being authored (`coll`,
 * `eodr`, `zbls`, `wv/sv`, `lxsBackSlot`) are wired against their (currently
 * empty) sets, so they light up the moment those algs land; they are opt-in
 * (disabled) and produce no candidate until then. Recommended defaults ship
 * Lookahead on (depth 1) across every adjacent core-Step pair plus the
 * intra-strategy `ocll->pll` / `eodr->ls` / `frPair->eoBackSlot->lxsBackSlot` pairs.
 */
export const apbDefinition: MethodDefinition = {
  id: "apb",
  label: "APB",
  steps: [block223Step(dfdbSet), brPair, eo, lxs, zbll],
  replacements: [ocllPll, collEpll, eoPair, eodrLs, backSlotEoLxs],
  extras: [ollExtra, zblsExtra, winterSummerVariation],
  recommendedSettings: {
    colorNeutrality: DUAL_CN_BOTTOM,
    lookahead: {
      depth: 1,
      scope: [
        ["block223", "brPair"],
        ["brPair", "eo"],
        ["eo", "lxs"],
        ["lxs", "zbll"],
        ["ocll", "pll"],
        ["eodr", "ls"],
        ["frPair", "eoBackSlot"],
        ["eoBackSlot", "lxsBackSlot"],
      ],
    },
  },
};
