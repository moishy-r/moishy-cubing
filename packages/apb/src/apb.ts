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
// solve: (1) only `fbDfdb` is enabled by default — its search→alg phase chain
// races fast; the pure-search strategies (`cornerFirst*`, `cross1`, `direct`) are
// opt-in, as racing their search→search chains is much slower for rarely-cheaper
// blocks; (2) winterSummerVariation's checkpoint trigger only fires once the
// relevant `lxs` variants carry a `preInsert` checkpoint. Replacements/Extras are
// opt-in (disabled) per project convention.
//
// Orientation. Recognition and goals are evaluated *up to whole-cube rotation*
// (cubing-core `normalizeOrientation`): a state is matched/solved by its pieces
// relative to the centers, so a cube rotation never breaks a step (see
// geometry.ts `regionSolved` / cubing-core `isSolved`). Crucially this still
// rejects slice/wide *center drift* — where the pieces did NOT rotate with the
// centers — so the colours must genuinely match, not just the slots. Algs are
// used verbatim: an imported primary that ends tilted (a net `y`) simply leaves
// the cube solved-up-to-rotation, which the goal accepts; and where a case also
// has a rotation-free variant, the cost race naturally prefers it (no move
// rewriting, so no awkward introduced `B`s). APB's block *search* keeps the
// strict fixed frame (geometry.ts `regionSolvedStrict`) because its home-frame
// heuristic requires it. (A pll data fix also stands: the F-perm's primary was
// an OLL alg.)
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
// solve (the tilted result feeds the next phase, which homes it). APB itself
// still never triggers homing: its block search holds centers home through to the
// terminal ZBLL, and colour-neutrality is realized by conjugation (centers stay
// home), so `homeStart` is a no-op on every APB phase and the solves above are
// byte-identical. (`zbls`, an opt-in/incomplete extra, has 32 of its 302 cases
// still unsolvable up to rotation+AUF — genuine transcription gaps, unrelated to
// the frame work; see its KNOWN note.)

import {
  type AlgorithmicPhase,
  applyMoves,
  type CubeState,
  isSolved,
  type MethodDefinition,
  type Move,
  type MoveFamily,
  normalizeOrientation,
  parseAlg,
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
import {
  AFTER_BR,
  aufInvariantLookup,
  axisCanonical,
  BLOCK223,
  cornerSignature,
  eodrSignature,
  eoSignature,
  F2L,
  fallThrough,
  orientationSignature,
  pieceSignature,
  regionCoordinate,
  regionLookup,
  regionSolved,
  regionSolvedAndEO,
  regionSolvedStrict,
  zblsSignature,
} from "./geometry.ts";
import { regionHeuristic } from "./pruning.ts";

// Block-building move set: outer faces + slices + wides (no rotations — those
// require a re-grip, and are handled once, upstream, by color-neutral orientation
// selection). Slice/wide moves permute the centers, but the block goal requires
// `cn` identity (geometry.ts `regionSolved`), so the search only accepts blocks
// that net-preserve the fixed frame. Three things keep this fast despite the
// larger generator: the center-aware cost pruning table (pruning.ts) guides the
// search to restore centers, `axisCanonical` (geometry.ts) collapses redundant
// same-axis orderings, and the region-coordinate A* key merges off-region-only
// differences. See SPEC "block223" and DESIGN "Color neutrality".
const BLOCK_MOVES: MoveFamily[] = [
  "U",
  "D",
  "L",
  "R",
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
];
// Last-layer / U-relative alg phases align by U pre/post-AUF (the default).
const LL_AUF: MoveFamily[] = ["U"];

// Dual-CN default orientation set (SPEC "Recommended lookahead defaults" / DESIGN
// "Color neutrality"): the 8 orientations that keep the U/D-axis colour pair on
// the D axis — either of the two opposite bottom colours (`z2` flips them), times
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

const alg = (
  id: string,
  goal: (s: CubeState) => boolean,
  cases: AlgorithmicPhase["cases"],
  auf: MoveFamily[] = LL_AUF,
): AlgorithmicPhase => ({ kind: "algorithmic", id, goal, cases, auf });

// A plain search phase (no pruning table) — for the short pair-forming searches
// in eoPair/backSlotEoLxs, which aren't block-building.
const searchPhase = (
  id: string,
  goal: (s: CubeState) => boolean,
  extra: Partial<SearchPhase> = {},
): SearchPhase => ({ kind: "search", id, goal, moves: BLOCK_MOVES, ...extra });

// --- Step: block223 (2x2x3) --------------------------------------------------
// Roux first block = corners DLF,DBL + edges DF,DL,FL. The sub-blocks each
// strategy's search phases target (each also becomes that phase's pruning-table
// region, so the search is heuristically guided rather than blind):
const FRONT_222 = { corners: [5], edges: [5, 6, 9] }; // DFL, DF/DL/FL
const BACK_222 = { corners: [6], edges: [6, 7, 10] }; // DBL, DL/DB/BL
const ROUX_FB = { corners: [5, 6], edges: [6, 9, 10] }; // the 1x2x3 (no DF/DB)
const CROSS = { corners: [], edges: [5, 6, 7] }; // DF, DL, DB

type Region = { corners: readonly number[]; edges: readonly number[] };

/**
 * A block-building search phase. The `goal` is always the full sub-block the
 * phase must reach; `heuristicRegion` (defaulting to `goal`) is what the pruning
 * table tracks. For a *second* phase (completing the block from a partial one
 * an earlier phase built), pass just the pieces this phase adds: that keeps the
 * heuristic small enough to build a *combined* corner+edge table (tight and fast),
 * whereas tracking the whole 5-edge block would force the loose, slow-to-build
 * full-block table. It stays admissible — tracking a subset of the goal's pieces
 * is always a valid lower bound.
 */
const blockSearch = (
  id: string,
  goal: Region,
  heuristicRegion: Region = goal,
  moves: MoveFamily[] = BLOCK_MOVES,
): SearchPhase => ({
  kind: "search",
  // Strict fixed-frame goal: the block search uses slice/wide moves under a
  // home-frame heuristic, so its goal must be the home frame (see
  // geometry.ts `regionSolvedStrict`). Algorithmic phases use the
  // rotation-invariant `regionSolved`.
  goal: regionSolvedStrict(goal),
  moves,
  id,
  heuristic: regionHeuristic([...heuristicRegion.corners], [...heuristicRegion.edges], moves),
  // A* + the pruning table: cost-optimal without IDA*'s real-cost thrashing.
  useAStar: true,
  // Axis canonicalization collapses the redundant orderings the slice/wide
  // generator would otherwise explore; the region coordinate keys the A* visited
  // map by just the goal's tracked pieces + centers, merging off-region-only
  // differences (a sufficient statistic for reaching the goal).
  canFollow: axisCanonical,
  stateKey: regionCoordinate(goal),
});

// dfdb places DF (edge 5) + DB (edge 7) onto a solved Roux FB.
const dfdbLookup = regionLookup(dfdbSet, pieceSignature([], [5, 7]));

const block223: MethodDefinition["steps"][number] = {
  id: "block223",
  label: "2x2x3",
  strategies: [
    // fbDfdb: Roux FB by search, then DF/DB by alg (phase-chaining feeds the FB
    // candidate pool into the DFDB scorer — the reference case for chaining).
    {
      id: "fbDfdb",
      label: "RouxFB + DFDB",
      phases: [
        {
          // rouxFB uses the full slice/wide move set (cheaper first blocks). The
          // `dfdb` algset that follows only recognizes DF/DB in the slots an
          // outer-move FB reaches, so a slice/wide FB can leave DF/DB where dfdb
          // can't complete. This is fine *because* of the phase-chaining pool:
          // `poolStateKey` keeps FB candidates that differ in the DF/DB pair
          // (edges 5,7) distinct, and the runner keeps whichever FB `dfdb` can
          // actually finish, cheapest — the pool naturally selects the cheap
          // slice FBs dfdb *does* cover and skips the rest. (A dfdb recognition
          // rework — see DESIGN "Slice/wide in the FB search" — could let the
          // single cheapest slice FB be used directly, faster; deferred.)
          ...blockSearch("rouxFB", ROUX_FB),
          poolStateKey: regionCoordinate({ corners: [5, 6], edges: [6, 9, 10, 5, 7] }),
        },
        alg("dfdb", regionSolved(BLOCK223), dfdbLookup),
      ],
    },
    // Pure-search strategies (no algs). `direct` searches the whole 2x2x3 at
    // once; the corner-first/cross strategies solve smaller sub-blocks first.
    // `direct` is registered but disabled by default: a single deep search for the
    // whole 7-piece block only has the (necessarily looser, un-combined) full-block
    // heuristic to guide it, so it is far slower than the phase-chained strategies
    // that build the block from small, tightly-pruned sub-blocks. Opt in via
    // `enabledStrategies`/`forceStrategy` when a pure-search block is wanted.
    {
      id: "direct",
      label: "Direct blockbuilding",
      enabledByDefault: false,
      phases: [blockSearch("full", BLOCK223)],
    },
    // Corner-first and cross strategies are registered but disabled by default.
    // Their second phase completes the block with another *search* (not a fast alg
    // lookup like fbDfdb's dfdb), so with phase-chaining on they re-run that search
    // for every pooled first-phase candidate — much slower to race than fbDfdb,
    // for a block that is rarely cheaper. Opt in via `enabledStrategies`.
    {
      id: "cornerFirstFront",
      label: "Corner-first (front)",
      enabledByDefault: false,
      phases: [blockSearch("front222", FRONT_222), blockSearch("rest", BLOCK223)],
    },
    {
      id: "cornerFirstBack",
      label: "Corner-first (back)",
      enabledByDefault: false,
      phases: [blockSearch("back222", BACK_222), blockSearch("rest", BLOCK223)],
    },
    // `cross1` is registered but disabled by default (opt-in). Its second phase
    // completes the whole block from a bare 3-edge cross — many more pieces than
    // corner-first's, and its heuristic can only tightly track the pieces it adds
    // (a combined table over the full block is infeasible), so it under-guides the
    // slice-heavy search that must keep the cross intact and is markedly slower.
    // Per SPEC it is "rarely the winner," so it is not worth racing by default.
    {
      id: "cross1",
      label: "Cross-first",
      enabledByDefault: false,
      phases: [blockSearch("cross", CROSS), blockSearch("pairs", BLOCK223)],
    },
  ],
};

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
const eoLookup = regionLookup(eoPairSet, eoSignature(), (c) => c.subset === DBR_EO);
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
// EPLL is terminal (reaches solved) -> both-AUF lookup like PLL.
const epllLookup = aufInvariantLookup(
  pllSet,
  pllSet.signature,
  (c) => cornersSolved(pllSet.recognitionState(c.id)),
);
// COLL keys on the *corners* only (`cornerSignature`) — the coll-epll set's
// default full-facelet signature pins the edge permutation EPLL is meant to fix,
// so it never matched. Built with `aufInvariantLookup` (both-AUF, rotation-
// invariant). Many COLL primaries end tilted; the cost race prefers a case's
// rotation-free variant where one exists, and the few cases that have none
// (`t-3`, `t-4`) now solve too — their tilted result satisfies the rotation-
// invariant `cornersSolved` goal, and the following `epll` phase homes that
// rotated input (see the "Rotation-GENERAL" note up top).
const collLookup = aufInvariantLookup(collSet, cornerSignature());
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
  `${pieceSignature([7], [11])(s)}/${eoSignature()(s)}`;
const eoPairInsertLookup = regionLookup(
  eoPairSet,
  eoPairInsertSignature,
  (c) => INSERT_SUBSETS.has(c.subset ?? ""),
);
const eoPair: Replacement = {
  id: "eoPair",
  label: "BR Pair + EO",
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
        stateKey: regionCoordinate(AFTER_BR),
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
// enforces. Recognizability is checked up to pre-AUF, matching what `runPhase`
// tries for the insert phase — so any formed state the insert can consume counts.
const AUF4: Move[][] = [[], parseAlg("U"), parseAlg("U2"), parseAlg("U'")];
function eoPairFormed(s: CubeState): boolean {
  return regionSolved(BLOCK223)(s) &&
    AUF4.some((u) => eoPairInsertLookup.find(applyMoves(s, u)) !== null);
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
// KNOWN (data, 32 of 302 cases): an audit of every case's own recognition state
// (both AUFs, up to whole-cube rotation) found 32 cases whose stored algs do not
// actually reach the ZBLS goal — genuine transcription gaps, NOT a frame/rotation
// issue (their primaries' tilts are clean whole-cube rotations, like every other
// last-layer set). Some are the mutually-unsolvable collision pairs first spotted
// here (f2l-8-4/f2l-35-2, f2l-24-3/f2l-28-2 — one of each is likely mis-
// transcribed, cf. the eodr case-3 fix); the full list is f2l-{2-1,3-1,3-5,5-3,
// 6-1,6-2,6-5,6-7,8-1,8-4,8-5,9-1,9-3,11-1,12-5,13-1,18-7,20-3,22-4,24-3,24-6,
// 24-7,26-4,28-2,28-5,28-7,29-1,32-5,33-7,34-5,35-1,35-2}. Until re-authored,
// states needing one of these drop out (~10% of triggers); recognition (the
// zblsSignature projection) is otherwise complete. zbls is opt-in and its set is
// still being authored, so this does not affect any shipped solve.
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
// TODO(data): (a) author wv/sv sets; (b) add a `checkpoints` entry to the
// relevant `lxs` variants (label "preInsert") so this can fire.
const wvSvLookup = fallThrough(
  regionLookup(wvSet, wvSet.signature),
  regionLookup(svSet, svSet.signature),
);
const winterSummerVariation = {
  id: "winterSummerVariation",
  label: "Winter/Summer Variation",
  region: ["lxs", "zbll"] as [string, string],
  mode: "force" as const,
  trigger: { kind: "checkpoint" as const, label: "preInsert" },
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
const eoBackSlotLookup = regionLookup(eoPairSet, eoSignature(), (c) => c.subset === "dfr");
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
  steps: [block223, brPair, eo, lxs, zbll],
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
