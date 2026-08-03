import { brPair as brPairSet } from "@moishy/algsets/br-pair";
import { collEpll as collSet } from "@moishy/algsets/coll-epll";
import { dfdb as dfdbSet } from "@moishy/algsets/dfdb";
import { eodr as eodrSet } from "@moishy/algsets/eodr";
import { frPair as frPairSet } from "@moishy/algsets/fr-pair";
import { eoPair as eoPairSet } from "@moishy/algsets/eo-pair";
import { lxs as lxsSet } from "@moishy/algsets/lxs";
import { oll as ollSet } from "@moishy/algsets/oll";
import { lxsBackSlot as lxsBackSlotSet } from "@moishy/algsets/lxs-back-slot";
import { pll as pllSet } from "@moishy/algsets/pll";
import { zbll as zbllSet } from "@moishy/algsets/zbll";
import { zbls as zblsSet } from "@moishy/algsets/zbls";
import { sv as svSet } from "@moishy/algsets/sv";
import { wv as wvSet } from "@moishy/algsets/wv";
import {
  type AlgorithmicPhase,
  applyMoves,
  centersSolved,
  cornerSignature,
  type CubeState,
  eoSignature,
  fallThrough,
  invert,
  isSolved,
  type Move,
  normalizeOrientation,
  orientationSignature,
  parseAlg,
  pieceSignature,
  regionSolved,
  regionSolvedAndEO,
  runPhase,
  solvedCube,
  statesEqual,
  stripRotations,
} from "@moishy/cubing-core";
import { assert, assertEquals } from "@std/assert";
import { apb, apbDefinition } from "../mod.ts";
import { aufInvariantLookup, regionLookup } from "@moishy/algsets";
import {
  AFTER_BR,
  BLOCK223,
  EO_EDGE_SLOTS,
  eodrSignature,
  F2L,
  wvSvSignature,
  zblsSignature,
} from "./geometry.ts";

const U = (n: number): Move[] => n ? [{ family: "U", amount: n as 1 | 2 | 3 }] : [];

// Run an algorithmic phase against a state and return the solved end state (or
// null). Exercises recognition (custom signature) + AUF + the primary alg.
function solveAlg(phase: AlgorithmicPhase, s: CubeState) {
  return runPhase(phase, s);
}

// Every case's own recognition state is a valid input to that step (block below
// solved, region in the case config). Recognizing it and applying the matched
// alg should reach the step's goal — across all cases, and shifted by any AUF.
function assertSolvesAllCases(
  phase: AlgorithmicPhase,
  set: {
    cases: readonly { id: string }[];
    recognitionState: (id: string) => CubeState;
  },
  goal: (s: CubeState) => boolean,
  sample = Infinity,
) {
  let n = 0,
    ok = 0;
  for (const c of set.cases) {
    if (n >= sample) break;
    n++;
    for (let k = 0; k < 4; k++) {
      const start = applyMoves(set.recognitionState(c.id), U(k));
      const seg = solveAlg(phase, start);
      if (seg && goal(seg.endState)) ok++;
      else {
        throw new Error(`case ${c.id} (AUF U${k}) not solved by ${phase.id}`);
      }
    }
  }
  return { n, ok };
}

Deno.test("APB method definition has the five core steps in order", () => {
  assertEquals(
    apbDefinition.steps.map((s) => s.id),
    ["block223", "brPair", "eo", "lxs", "zbll"],
  );
  assertEquals(
    apbDefinition.replacements?.map((r) => r.id),
    ["ocllPll", "collEpll", "eoPair", "eodrLs", "backSlotEoLxs"],
  );
  assertEquals(
    apbDefinition.extras?.map((e) => e.id),
    ["oll", "zbls", "winterSummerVariation"],
  );
  // Recommended lookahead scope covers each adjacent core pair + ocll->pll.
  assert(
    apbDefinition.recommendedSettings?.lookahead?.scope?.some(
      (p) => p[0] === "lxs" && p[1] === "zbll",
    ),
  );
});

Deno.test(
  "brPair: every case is recognized and solved (region signature, all AUFs)",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "brPair",
      goal: regionSolved(AFTER_BR),
      cases: regionLookup(brPairSet, pieceSignature([7], [11])),
      auf: ["U"],
    };
    const { n } = assertSolvesAllCases(
      phase,
      brPairSet,
      regionSolved(AFTER_BR),
    );
    assertEquals(n, 89);
  },
);

Deno.test(
  "frPair: every case is recognized and inserts the front pair (region signature, all AUFs)",
  async () => {
    const { frPair } = await import("@moishy/algsets/fr-pair");
    // frPair lands block223 + the front-right pair (DFR 4, FR 8); EO comes later.
    const AFTER_FRONT = { corners: [4, 5, 6], edges: [5, 6, 7, 8, 9, 10] };
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "frPair",
      goal: regionSolved(AFTER_FRONT),
      cases: regionLookup(frPair, pieceSignature([4], [8])),
      auf: ["U"],
    };
    const { n } = assertSolvesAllCases(phase, frPair, regionSolved(AFTER_FRONT));
    assertEquals(n, 89);
  },
);

Deno.test(
  "eo: the dbr subset of eo-pair recognizes + solves as the core EO step",
  () => {
    const dbr = (c: { subset?: string }) => c.subset === "dbr-solved-eo-(1)";
    const cases = eoPairSet.cases.filter(dbr);
    assertEquals(cases.length, 11);
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "eo",
      goal: regionSolvedAndEO(AFTER_BR),
      cases: regionLookup(eoPairSet, eoSignature(EO_EDGE_SLOTS), dbr),
      auf: ["U"],
    };
    const set = {
      cases,
      recognitionState: (id: string) => eoPairSet.recognitionState(id),
    };
    const { n } = assertSolvesAllCases(phase, set, regionSolvedAndEO(AFTER_BR));
    assertEquals(n, 11);
  },
);

Deno.test("subset halves are non-empty and filter as expected", () => {
  // eoBackSlot = eo-pair `dfr`; ls = lxs cases with DR already solved; epll =
  // pll cases with corners already solved. These are the halves APB derives
  // rather than re-authoring (SPEC).
  assertEquals(eoPairSet.cases.filter((c) => c.subset === "dfr").length, 11);
  const drSolved = (id: string) => {
    const s = lxsSet.recognitionState(id);
    return s.ep[4] === 4 && s.eo[4] === 0;
  };
  assert(
    lxsSet.cases.some((c) => drSolved(c.id)),
    "expected some LS (DR-solved) lxs cases",
  );
  const cornersSolved = (id: string) => {
    const s = pllSet.recognitionState(id);
    return s.cp.every((c, i) => c === i && s.co[i] === 0);
  };
  assert(
    pllSet.cases.some((c) => cornersSolved(c.id)),
    "expected some EPLL (corners-solved) pll cases",
  );
});

// Regression: the eoPair split must leave the BR pair genuinely JOINED at
// formPair's end — never one U short, with the joining move stranded as the
// insert's "pre-AUF" (the reported bug). A U pre-AUF is legitimate alignment
// only when the whole pair lives on the U face; when the BR edge sits off the U
// layer (in FR), a U moves the corner relative to the fixed edge, so that U is
// pair-forming and must be part of formPair. Verified end to end on real solves.
Deno.test("eoPair splits so formPair actually forms the pair (not the insert)", async () => {
  // The real formPair goal object (its predicate is what must hold at the split).
  const formPairGoal = (apbDefinition.replacements!.find((r) => r.id === "eoPair")!
    .strategies[0].phases[0] as { goal: (s: CubeState) => boolean }).goal;
  const scrambles = [
    "U2 F' U' F2 R L2 R U B2 U B2 U L' R2 U' L B' L2 U F",
    "R F B2 U R2 D' F' D' L2 R2 D2 B R2 F2 R' U L' D2 F' U",
    "D' F2 L2 B2 F2 R' B2 R F2 L' F' L' B",
    "R U2 F' L2 D R2 B' U F2 L' D2 B2 U'",
  ];
  for (const scramble of scrambles) {
    const r = await apb.solve(scramble, {
      colorNeutrality: "fixed",
      lookahead: { depth: 1 },
      stepOptions: { block223: { forceStrategy: "fbDfdb" } },
      replacements: { eoPair: { enabled: true, mode: "force" } },
    }, {});
    assert(
      r.solved && isSolved(applyMoves(applyMoves(solvedCube(), parseAlg(scramble)), r.solution)),
      `eoPair (${scramble}): must solve`,
    );
    const seg = r.segments.find((s) => s.unitId === "eoPair");
    assert(seg?.phases, `eoPair (${scramble}): must fire with phase detail`);
    const formPairEnd = seg.phases[0].endState;
    // The pair is genuinely joined at the split — not deferred to the insert.
    assert(
      formPairGoal(formPairEnd),
      `eoPair (${scramble}): formPair must end with the pair joined`,
    );
    // When the BR edge is off the U layer, no joining move may be stranded as the
    // insert's pre-AUF (it would break the just-formed pair and re-make it).
    const edgeOffU = formPairEnd.ep.indexOf(11) >= 4;
    if (edgeOffU) {
      assert(
        (seg.phases[1].auf?.pre ?? []).length === 0,
        `eoPair (${scramble}): off-U pair must need no insert pre-AUF`,
      );
    }
  }
});

Deno.test(
  "replacement/extra sets recognize + solve with their wired signatures",
  async () => {
    // Guards the signatures APB uses for the newly-authored sets. Each set's own
    // cases are recognized (custom signature) and solved by the primary alg,
    // across all AUFs — the same contract as the core steps.
    const { collEpll } = await import("@moishy/algsets/coll-epll");
    const { eodr } = await import("@moishy/algsets/eodr");
    const { lxsBackSlot } = await import("@moishy/algsets/lxs-back-slot");
    // Corner goal up to whole-cube rotation (matches apb.ts): coll has cases
    // (t-3, t-4, and every tilted-primary case) whose solving alg ends the cube
    // rotated by a clean whole-cube turn. That is a valid corner solve; the next
    // phase homes the tilted input (cubing-core `homeStart`).
    const cornersSolved = (s: CubeState) => {
      const n = normalizeOrientation(s);
      return n.cp.every((c, i) => c === i && n.co[i] === 0);
    };
    const dr = (s: CubeState) => s.ep[4] === 4 && s.eo[4] === 0;

    // coll recognizes on the corners up to *both* AUFs (apb.ts `collLookup`),
    // never the algset's full-facelet default — many COLL primaries are tilted,
    // so a full-facelet, single-AUF lookup only matched the raw (tilted)
    // recognition state by the verbatim-primary coincidence, not a real solve.
    assertEquals(
      assertSolvesAllCases(
        {
          kind: "algorithmic",
          id: "coll",
          goal: cornersSolved,
          cases: aufInvariantLookup(collEpll, cornerSignature()),
          auf: ["U"],
        },
        collEpll,
        cornersSolved,
      ).n,
      40,
    );
    assertEquals(
      assertSolvesAllCases(
        {
          kind: "algorithmic",
          id: "eodr",
          goal: (s) => regionSolvedAndEO(AFTER_BR)(s) && dr(s),
          cases: regionLookup(eodr, pieceSignature([], [0, 1, 2, 3, 8, 4])),
          auf: ["U"],
        },
        eodr,
        (s) => regionSolvedAndEO(AFTER_BR)(s) && dr(s),
      ).n,
      55,
    );
    assertEquals(
      assertSolvesAllCases(
        {
          kind: "algorithmic",
          id: "lxsBackSlot",
          goal: regionSolvedAndEO(F2L),
          cases: regionLookup(lxsBackSlot, pieceSignature([7], [11, 4])),
          auf: ["U"],
        },
        lxsBackSlot,
        regionSolvedAndEO(F2L),
      ).n,
      116,
    );
  },
);

Deno.test(
  "lxs: every case is recognized and solved (last-slot signature, all AUFs)",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "lxs",
      goal: regionSolvedAndEO(F2L),
      cases: regionLookup(lxsSet, pieceSignature([4], [8, 4])),
      auf: ["U"],
    };
    const { n } = assertSolvesAllCases(phase, lxsSet, regionSolvedAndEO(F2L));
    assertEquals(n, 116);
  },
);

Deno.test(
  "zbll: a sample of cases is recognized and solved to a full solve",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "zbll",
      goal: isSolved,
      cases: regionLookup(zbllSet, zbllSet.signature),
      auf: ["U"],
    };
    const { n } = assertSolvesAllCases(phase, zbllSet, isSolved, 40);
    assertEquals(n, 40);
  },
);

Deno.test(
  "zbll falls through to PLL for the corners-already-solved case",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "zbll",
      goal: isSolved,
      cases: fallThrough(
        regionLookup(zbllSet, zbllSet.signature),
        regionLookup(pllSet, pllSet.signature),
      ),
      auf: ["U"],
    };
    // Drive a PLL case (corners solved) through the ZBLL phase — the ZBLL table
    // doesn't contain it, so it must fall through to PLL.
    const { n } = assertSolvesAllCases(phase, pllSet, isSolved);
    assertEquals(n, 21);
  },
);

Deno.test(
  "block223: corner-first solves the 2x2x3 on a shallow scramble",
  async () => {
    // A 1-move disturbance (F touches the block; U/R don't). The corner-first
    // search wiring is what's checked here. Phase-chaining + lookahead are turned
    // off and depth bounded: an *unpruned* block search blows up otherwise — deep
    // block-building needs the precomputed pruning table `direct`/`fbDfdb` call
    // for in production (SPEC), which is a build-time concern out of scope here.
    const r = await apb.solve(
      "F",
      {
        stepOptions: {
          block223: {
            forceStrategy: "cornerFirstFront",
            phaseChaining: { enabled: false },
          },
        },
        lookahead: { depth: 0 },
      },
      { maxDepth: 3 },
    );
    const block = r.segments[0];
    assertEquals(block.unitId, "block223");
    assert(
      regionSolved({ corners: [5, 6], edges: [5, 6, 7, 9, 10] })(
        block.phases.at(-1)!.endState,
      ),
    );
  },
);

// --- Center-frame correctness (the fixed-frame invariant) --------------------

Deno.test(
  "regionSolved requires the centers to be home, not just the pieces",
  () => {
    // A block that is slot-solved but whose centers have drifted (e.g. after an
    // M-slice alg) is NOT color-solved — regionSolved must reject it.
    const solved = solvedCube();
    assert(regionSolved(BLOCK223)(solved));
    const drifted = applyMoves(solved, parseAlg("M")); // rotates centers, block pieces stay put
    assert(!centersSolved(drifted));
    assert(
      !regionSolved(BLOCK223)(drifted),
      "slot-solved but center-drifted must not count as solved",
    );
  },
);

Deno.test(
  "stripRotations de-rotates an alg to a fixed-frame equivalent",
  () => {
    // A rotationless alg is returned unchanged.
    const plain = parseAlg("R U R' U'");
    assertEquals(stripRotations(plain), plain);
    // An alg ending tilted (net y) becomes rotationless with the same *piece*
    // effect: applying the stripped alg then the net rotation reproduces the
    // original, and the stripped alg leaves the centers home.
    const tilted = parseAlg("R U R' U' y");
    const stripped = stripRotations(tilted);
    assert(
      !stripped.some((m) => "xyz".includes(m.family)),
      "no rotations remain",
    );
    assert(
      centersSolved(applyMoves(solvedCube(), stripped)),
      "stripped alg is center-neutral",
    );
    assertEquals(
      applyMoves(solvedCube(), [...stripped, ...parseAlg("y")]),
      applyMoves(solvedCube(), tilted),
      "stripped alg + net rotation equals the original",
    );
  },
);

// --- Terminal-step recognition: up to BOTH pre- and post-AUF -----------------

Deno.test(
  "zbll recognizes + solves genuine post-AUF variants (two-sided coset)",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "zbll",
      goal: isSolved,
      cases: aufInvariantLookup(zbllSet, zbllSet.signature),
      auf: ["U"],
    };
    // A post-AUF variant: a state whose alg leaves it solved only up to a final U.
    // A plain pre-AUF-only lookup misses these; aufInvariantLookup must not.
    let n = 0;
    for (const c of zbllSet.cases.slice(0, 50)) {
      for (const post of ["U", "U2", "U'"]) {
        const target = applyMoves(solvedCube(), parseAlg(post));
        const start = applyMoves(target, invert(c.algs[0].moves));
        const seg = runPhase(phase, start);
        assert(
          seg && isSolved(seg.endState),
          `${c.id} post-AUF ${post} unsolved`,
        );
        n++;
      }
    }
    assertEquals(n, 150);
  },
);

Deno.test(
  "zbll solves every EO-solved last-layer state (full coverage)",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "zbll",
      goal: isSolved,
      cases: fallThrough(
        aufInvariantLookup(zbllSet, zbllSet.signature),
        aufInvariantLookup(pllSet, pllSet.signature),
      ),
      auf: ["U"],
    };
    // Enumerate all valid EO-solved last-layer states (edges oriented; corner &
    // edge permutations of matching parity; corner orientation summing to 0) and
    // require every one to be solved. This is the definitive guard for the two data
    // issues fixed here: the tilted-alg cases (l-7/h-32, de-rotated) and the corrupt
    // F-perm (which left its whole orbit — 19 states — unsolvable).
    const perms = (a: number[]): number[][] =>
      a.length <= 1
        ? [a]
        : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
    const parity = (p: number[]) => {
      let c = 0;
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) c++;
      }
      return c % 2;
    };
    let total = 0,
      solved = 0;
    for (const cp of perms([0, 1, 2, 3])) {
      for (const ep of perms([0, 1, 2, 3])) {
        if (parity(cp) !== parity(ep)) continue;
        for (let o = 0; o < 27; o++) {
          const co = [o % 3, Math.floor(o / 3) % 3, Math.floor(o / 9) % 3, 0];
          co[3] = (3 - ((co[0] + co[1] + co[2]) % 3)) % 3;
          const s = solvedCube();
          for (let i = 0; i < 4; i++) {
            s.cp[i] = cp[i];
            s.co[i] = co[i];
            s.ep[i] = ep[i];
          }
          if (isSolved(s)) continue;
          total++;
          const seg = runPhase(phase, s);
          if (seg && isSolved(seg.endState)) solved++;
        }
      }
    }
    assertEquals(total, 7775);
    assertEquals(solved, 7775);
  },
);

// --- "Skip" handling: a step whose goal is already met ------------------------

Deno.test(
  "an algorithmic phase is skippable when its goal is already met (EO skip)",
  () => {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "eo",
      goal: regionSolvedAndEO(AFTER_BR),
      cases: regionLookup(
        eoPairSet,
        eoSignature(EO_EDGE_SLOTS),
        (c) => c.subset === "dbr-solved-eo-(1)",
      ),
      auf: ["U"],
    };
    // Solved cube: EO (and AFTER_BR) already done. The 11-case set has no identity
    // case, so this only solves via the runner's zero-alg "skip" path.
    const seg = runPhase(phase, solvedCube());
    assert(seg, "already-EO'd state must not fail recognition");
    assertEquals(seg!.moves.length, 0);
    assert(isSolved(seg!.endState));
  },
);

// --- End-to-end: the whole method, center-frame-correct ----------------------

Deno.test(
  "APB solves a scramble end-to-end, staying in the fixed frame",
  async () => {
    const scramble = "R U2 F' L2 D R2 B' U F2 L' D2 B2 U'";
    const res = await apb.solve(
      scramble,
      {
        stepOptions: {
          block223: {
            forceStrategy: "cornerFirstBack",
            phaseChaining: { enabled: false },
          },
        },
        lookahead: { depth: 0 },
      },
      { timeBudgetMs: 30000 },
    );

    assert(res.solved, "solve should complete");
    assertEquals(
      res.segments.map((s) => s.unitId),
      ["block223", "brPair", "eo", "lxs", "zbll"],
    );
    // Centers home after every committed step — the fixed frame is preserved.
    for (const seg of res.segments) {
      assert(
        centersSolved(seg.phases.at(-1)!.endState),
        `${seg.unitId} drifted the centers`,
      );
    }
    assert(isSolved(res.finalState));
    // Independent check: the solution really solves the (orientation-framed) scramble.
    const framed = applyMoves(solvedCube(), [
      ...invert(res.orientation),
      ...parseAlg(scramble),
      ...res.orientation,
    ]);
    assert(
      isSolved(applyMoves(framed, res.solution)),
      "solution must solve the scramble",
    );
  },
);

// The general rotation architecture end-to-end: solve a cube whose *frame is
// rotated* (a z2 "inspection" rotation up front, a y "mid-solve" rotation at the
// end) so the first phase's INPUT has drifted centers. APB's own solves never hit
// this — color-neutrality is realized by conjugation, which keeps centers home —
// so a rotation baked into the scramble is how we exercise the per-phase
// reorient-to-home (cubing-core `homeStart`). The solve must still verify, and it
// must reorient (emit whole-cube rotations) rather than fail.
Deno.test("APB solves from a rotated input frame (z2 inspection + mid-solve y)", async () => {
  const base = "D' F2 L2 B2 F2 R' B2 R F2 L B2 R' F' D2 R' B D' F' L' B";
  for (const scramble of [`z2 ${base} y`, `x ${base} z'`]) {
    const r = await apb.solve(scramble, {
      colorNeutrality: "fixed",
      lookahead: { depth: 1 },
      stepOptions: { block223: { forceStrategy: "fbDfdb" } },
    }, {});
    // Fixed CN + a net-rotated scramble ⇒ the block search's input is genuinely
    // in a rotated frame.
    const framed = applyMoves(solvedCube(), [
      ...invert(r.orientation),
      ...parseAlg(scramble),
      ...r.orientation,
    ]);
    assert(framed.cn.join("") !== "012345", `${scramble}: input frame really is rotated`);
    assert(r.solved, `${scramble}: solve should complete from the rotated frame`);
    assert(
      isSolved(applyMoves(framed, r.solution)),
      `${scramble}: solution must solve the rotated-frame scramble`,
    );
    assert(
      r.solution.some((m) => m.family === "x" || m.family === "y" || m.family === "z"),
      `${scramble}: solution must reorient the cube to the home frame`,
    );
  }
});

// A whole-cube rotation is a real reframe of the pieces (the user's LXS example:
// under a `y`, the edge in DF moves to the DL slot). Recognition/goals key on
// pieces *relative to the centers*, so this reframe is invariant — never a break.
Deno.test("a rotation reframes the pieces but is invariant up to the centers", () => {
  const afterY = applyMoves(solvedCube(), parseAlg("y"));
  // DL slot (edge index 6) now holds the DF cubie (5): DF -> DL under y.
  assertEquals(afterY.ep[6], 5);
  assert(!statesEqual(afterY, solvedCube()), "a bare y is not the home frame");
  // ...yet it is solved up to rotation, and normalizes back to the exact solved cube.
  assert(isSolved(afterY));
  assert(statesEqual(normalizeOrientation(afterY), solvedCube()));
});

// Req: with the dual-CN default (8 orientations), a solve that commits to a
// *rotated* orientation ends the cube solved but held in a frame rotated from the
// original — which must be detected as solved, not "not solved". Verified
// PHYSICALLY: execute the orientation rotation, then the solution, on the
// scrambled cube (rotations executed, never converted).
Deno.test("dual-CN solves verify as solved even in a rotated final frame", async () => {
  const scrambles = [
    // The reported scramble: dual-CN commits to a z2 y2 orientation, so the cube
    // ends solved but held rotated — must verify as solved, not "not solved".
    "D' F2 L2 B2 F2 R' B2 R F2 L' F' L' B",
    "R U2 F' L2 D R2 B' U F2 L' D2 B2 U'",
    "D' F2 L2 B2 F2 R' B2 R F2 L B2 R' F' D2 R' B D' F' L' B",
    "B2 U2 L2 F2 D' R2 D2 B2 R2 D' B2 L' D2 F' L U' F2 D R2 B",
    "D2 L2 U F2 U' B2 U2 R2 F2 D' L2 F' R' D2 B' U L2 F' U2 R",
  ];
  let sawRotatedFrame = false;
  for (const scramble of scrambles) {
    const r = await apb.solve(scramble, {}, {}); // {} => recommended defaults = dual-CN (8)
    assert(r.solved, `${scramble}: solve should complete`);
    const scrambled = applyMoves(solvedCube(), parseAlg(scramble));
    const asHeld = applyMoves(scrambled, [...r.orientation, ...r.solution]);
    assert(
      isSolved(asHeld),
      `${scramble}: executing orientation + solution must leave the cube solved ` +
        `(even if held rotated)`,
    );
    if (!statesEqual(asHeld, solvedCube())) {
      sawRotatedFrame = true;
      // Solved-but-rotated: NOT the exact home frame, but solved up to rotation.
      assert(
        statesEqual(normalizeOrientation(asHeld), solvedCube()),
        `${scramble}: rotated final frame must still be solved up to rotation`,
      );
    }
  }
  assert(
    sawRotatedFrame,
    "at least one dual-CN solve should commit to a rotated orientation (else this " +
      "test isn't exercising the rotated-frame path)",
  );
});

// Req: an alg that contains a whole-cube rotation is EXECUTED verbatim — never
// rewritten into other moves. coll `t-3`/`t-4` have no rotation-free variant, so
// a correct solution *must* contain a rotation; if rotations were being converted
// to face moves the solution would have zero and this assertion would catch it.
Deno.test("rotation-containing algs are executed verbatim, never converted", async () => {
  const { collEpll } = await import("@moishy/algsets/coll-epll");
  const cornersSolved = (s: CubeState) => {
    const n = normalizeOrientation(s);
    return n.cp.every((c, i) => c === i && n.co[i] === 0);
  };
  const phase: AlgorithmicPhase = {
    kind: "algorithmic",
    id: "coll",
    goal: cornersSolved,
    cases: aufInvariantLookup(collEpll, cornerSignature()),
    auf: ["U"],
  };
  const isRotation = (m: Move) => m.family === "x" || m.family === "y" || m.family === "z";
  for (const id of ["t-3", "t-4"]) {
    assert(
      collEpll.get(id)!.algs.every((a) => a.moves.some(isRotation)),
      `precondition: every ${id} variant contains a rotation`,
    );
    const seg = runPhase(phase, collEpll.recognitionState(id))!;
    assert(seg !== null, `${id}: recognized and solved`);
    assert(cornersSolved(seg.endState), `${id}: corners solved (up to rotation)`);
    assert(
      seg.moves.some(isRotation),
      `${id}: solution must contain a rotation (algs weren't converted to face moves)`,
    );
    // And the emitted moves genuinely solve the ORIGINAL (untouched) input.
    assert(cornersSolved(applyMoves(collEpll.recognitionState(id), seg.moves)));
  }
});

// Regression: force-mode replacements/extras must actually FIRE against real,
// live solve states — not just recognize their own canonical recognition states.
// This is the gap that let permutation-sensitive full-facelet signatures ship:
// OCLL/COLL/OLL recognize on a *projection* (orientation / corners), and their
// tilted primaries must be de-rotated, or a real last layer never matches.
Deno.test("force-mode LL replacements fire on a real solve and verify", async () => {
  const scramble = "D' F2 L2 B2 F2 R' B2 R F2 L B2 R' F' D2 R' B D' F' L' B";
  const base = {
    colorNeutrality: "fixed" as const,
    lookahead: { depth: 1 },
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
  };
  const verifies = (r: { orientation: Move[]; solution: Move[] }) =>
    isSolved(applyMoves(
      applyMoves(solvedCube(), [...invert(r.orientation), ...parseAlg(scramble), ...r.orientation]),
      r.solution,
    ));

  for (const id of ["ocllPll", "collEpll"]) {
    const r = await apb.solve(scramble, {
      ...base,
      replacements: { [id]: { enabled: true, mode: "force" } },
    }, {});
    assert(r.solved && verifies(r), `${id}: solution must solve the scramble`);
    assert(
      r.segments.some((s) => s.unitId === id && s.kind === "replacement"),
      `forced ${id} must appear in the solve (it silently dropped out)`,
    );
  }
});

// Regression: backSlotEoLxs is a `compete` *replacement* (front-pair-first F2L+EO
// — an every-scramble alternative), not a triggered extra. Forcing it must fire
// and verify; competing must not hang (its front-pair search is bounded, not the
// blind IDA* it shipped with). Guards both the reclassification and the phase
// wiring (eoBackSlot lands on the front region + EO, back slot left for lxsBackSlot).
Deno.test("backSlotEoLxs fires as a forced replacement and verifies", async () => {
  const scramble = "D' F2 L2 B2 F2 R' B2 R F2 L' F' L' B";
  const r = await apb.solve(scramble, {
    colorNeutrality: "fixed",
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
    replacements: { backSlotEoLxs: { enabled: true, mode: "force" } },
  }, {});
  assert(
    r.solved && isSolved(applyMoves(applyMoves(solvedCube(), parseAlg(scramble)), r.solution)),
    "backSlotEoLxs: solution must solve the scramble",
  );
  assert(
    r.segments.some((s) => s.unitId === "backSlotEoLxs" && s.kind === "replacement"),
    "forced backSlotEoLxs must appear in the solve",
  );
});

// Regression: enabling a `compete` replacement must NEVER produce a worse solve
// than leaving it off — the core path is always available, so compete = min(core,
// replacement). This broke because (a) the span DP solved the core cover WITHOUT
// lookahead and (b) lookahead was suppressed across the region's entry boundary,
// so merely enabling the replacement pessimized upstream steps (even block223) and
// handed the race to the replacement when the true core was cheaper. Both fixed:
// lookahead now estimates continuations with the plain core steps regardless of
// which replacements are enabled, and the span DP scores covers with that lookahead.
Deno.test("compete replacement never worsens a solve; wins only when cheaper", async () => {
  const base = {
    colorNeutrality: "fixed" as const,
    lookahead: { depth: 1 },
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
  };
  const withBS = (scr: string) =>
    apb.solve(scr, { ...base, replacements: { backSlotEoLxs: { enabled: true } } }, {});
  const pureCore = (scr: string) => apb.solve(scr, { ...base }, {});
  const picked = (r: { segments: { unitId: string }[] }, id: string) =>
    r.segments.some((s) => s.unitId === id);

  // (1) A scramble whose core path is genuinely best: enabling backSlotEoLxs must
  // NOT degrade it — compete equals pure-core (and keeps the core path). Before the
  // fix, compete forced a worse block223 and shipped a longer solution here.
  const coreScr = "D' F2 L2 B2 F2 R' B2 R F2 L' F' L' B";
  const [c1, k1] = [await withBS(coreScr), await pureCore(coreScr)];
  assert(c1.solved && k1.solved);
  assert(
    c1.cost <= k1.cost + 1e-9,
    `compete (${c1.cost.toFixed(2)}) must be no worse than pure-core (${k1.cost.toFixed(2)})`,
  );
  assert(!picked(c1, "backSlotEoLxs"), "must keep the cheaper core path here");

  // (2) A scramble where backSlotEoLxs genuinely wins: it must be chosen, and the
  // total must strictly beat pure-core (front-pair-first leaves a much cheaper LL).
  // NOTE: this fixture is coupled to what the rest of the solve produces — a change
  // to the block strategies, their cost model, or the algs available to a later step
  // shifts the comparison, and the scramble may stop being a win. Re-pick by scanning
  // seeded scrambles for one where enabling the replacement both fires it and lowers
  // total cost; the invariant in (1) is the part that must hold universally. Last
  // re-picked when the zbll/pll variant migration gave ZBLL its real alternatives
  // back, which lowered the pure-core finish on the previous fixture.
  const winScr = "D2 R' U' B' F2 L' D' F' R U L' D' U L F2 D R' B' U2 B";
  const [c2, k2] = [await withBS(winScr), await pureCore(winScr)];
  assert(c2.solved && k2.solved);
  assert(picked(c2, "backSlotEoLxs"), "compete must pick backSlotEoLxs when it wins overall");
  assert(
    c2.cost < k2.cost - 1e-9,
    `winning backSlotEoLxs (${c2.cost.toFixed(2)}) must beat pure-core (${k2.cost.toFixed(2)})`,
  );
  assert(isSolved(applyMoves(applyMoves(solvedCube(), parseAlg(winScr)), c2.solution)));
});

// Regression: winterSummerVariation is a checkpoint extra with NO hand-placed
// checkpoints — the runner auto-scans every prefix of the LXS alg for the point
// where the last pair is set up on top and a WV/SV case is recognized, then races
// each such splice against the normal LXS->ZBLL finish by MCC. Guards the whole
// path: the wvSvSignature projection recognizes a live mid-insert state, the splice
// produces a correct solve, the phase breakdown stays consistent, and enabling it
// never worsens a solve (it only fires when at least as cheap).
Deno.test("winterSummerVariation auto-scans, fires, and never worsens a solve", async () => {
  const base = {
    colorNeutrality: "fixed" as const,
    lookahead: { depth: 1 },
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
  };
  // Scrambles on which WV/SV is recognized mid-LXS and wins (or ties) the race.
  // Coupled to block223's output, like the backSlotEoLxs fixture above: re-pick by
  // scanning if a block change stops them firing. The never-worsen assertion below
  // is the universal part.
  const firing = [
    "U2 R' B2 L2 U2 L B F' B2 U F2 U D F2 D U L2 R L' B2",
    "U' D' L2 F2 L' B' L' U' D2 B F2 U' R2 U F2 U2 L2 R B' L2",
    "L' U R' L D2 U F' B R' B' D' B L U' B' L U2 D' L2 F",
  ];
  let everFired = false;
  for (const scramble of firing) {
    const on = await apb.solve(scramble, {
      ...base,
      extras: { winterSummerVariation: { enabled: true } },
    }, {});
    const off = await apb.solve(scramble, base, {});
    assert(
      on.solved && isSolved(applyMoves(applyMoves(solvedCube(), parseAlg(scramble)), on.solution)),
      `wvSv (${scramble}): must solve`,
    );
    // Enabling the extra never makes the solve worse (MCC race).
    assert(
      on.cost <= off.cost + 1e-9,
      `wvSv (${scramble}): enabling must not worsen (${on.cost.toFixed(2)} vs ${
        off.cost.toFixed(2)
      })`,
    );
    const seg = on.segments.find((s) => s.unitId === "winterSummerVariation");
    if (seg) {
      everFired = true;
      // Phase breakdown (LXS setup prefix + wvSv + pll) sums to the whole segment.
      const phaseMoves = (seg.phases ?? []).reduce((n, p) => n + p.moves.length, 0);
      assertEquals(phaseMoves, seg.moves.length, "wvSv phase moves must sum to the segment");
    }
  }
  assert(everFired, "winterSummerVariation must fire on at least one of the firing scrambles");
});

Deno.test("force-mode OLL extra fires when its F2L-solved trigger is met", async () => {
  // Pure last-layer scrambles keep the F2L solved, satisfying the oll extra's
  // boundary trigger at the eo step; OLL must then recognize and solve.
  for (const scramble of ["R U R' U R U2 R'", "F R U R' U' F'", "r U R' U' r' F R F'"]) {
    const r = await apb.solve(scramble, {
      colorNeutrality: "fixed",
      lookahead: { depth: 0 },
      extras: { oll: { enabled: true, mode: "force" } },
    }, {});
    assert(
      r.solved && isSolved(applyMoves(applyMoves(solvedCube(), parseAlg(scramble)), r.solution)),
      `oll extra (${scramble}): solution must solve`,
    );
    assert(
      r.segments.some((s) => s.unitId === "oll" && s.kind === "extra"),
      `oll extra (${scramble}) must fire`,
    );
  }
});

// Regression: every EODR alg must preserve block223 + brPair (corners 5,6,7 and
// edges 5,6,7,9,10,11). Would have caught the mis-transcribed case 3
// ("f U R U' R' f", which displaced DF/DL/FL) before it broke recognition.
Deno.test("every eodr alg preserves block223 + brPair", () => {
  const blockCorners = [5, 6, 7], blockEdges = [5, 6, 7, 9, 10, 11];
  for (const c of eodrSet.cases) {
    for (let vi = 0; vi < c.algs.length; vi++) {
      const s = applyMoves(solvedCube(), c.algs[vi].moves);
      const ok = blockCorners.every((i) => s.cp[i] === i && s.co[i] === 0) &&
        blockEdges.every((i) => s.ep[i] === i && s.eo[i] === 0);
      assert(ok, `eodr case ${c.id} alg[${vi}] disturbs block223/brPair`);
    }
  }
});

// Regression: forced eodrLs fires and verifies on real solves (guards the
// eodrSignature projection — the old piece signature over-constrained on U-edge
// / FR permutation and almost never matched).
Deno.test("force-mode eodrLs fires on real solves and verifies", async () => {
  const scrambles = [
    "D' F2 L2 B2 F2 R' B2 R F2 L B2 R' F' D2 R' B D' F' L' B",
    "R U2 F' L2 D R2 B' U F2 L' D2 B2 U'",
    "F2 D2 R2 B2 L2 F2 U' L2 U R2 U2 F' L' U B F D' L2 R'",
  ];
  for (const scramble of scrambles) {
    const r = await apb.solve(scramble, {
      colorNeutrality: "fixed",
      lookahead: { depth: 1 },
      stepOptions: { block223: { forceStrategy: "fbDfdb" } },
      replacements: { eodrLs: { enabled: true, mode: "force" } },
    }, {});
    const framed = applyMoves(solvedCube(), [
      ...invert(r.orientation),
      ...parseAlg(scramble),
      ...r.orientation,
    ]);
    assert(
      r.solved && isSolved(applyMoves(framed, r.solution)),
      `eodrLs (${scramble}): must solve`,
    );
    assert(
      r.segments.some((s) => s.unitId === "eodrLs"),
      `eodrLs (${scramble}) must fire`,
    );
  }
});

// Regression: forced zbls extra fires + verifies. These scrambles leave DR
// solved right after brPair, satisfying zbls's boundary trigger. Guards the
// zblsSignature projection + de-rotation (the old full-facelet signature never
// matched a live state).
Deno.test("force-mode zbls extra fires on triggering solves and verifies", async () => {
  const scrambles = [
    "D F2 L U' B' F2 R D L2 R L D2 L2 U2 B' U L' R2 L' F2",
    "B L U' D' F2 B' F' D2 L' D L' U' F U2 B R D2 L2 U F'",
  ];
  for (const scramble of scrambles) {
    const r = await apb.solve(scramble, {
      colorNeutrality: "fixed",
      lookahead: { depth: 1 },
      stepOptions: { block223: { forceStrategy: "fbDfdb" } },
      extras: { zbls: { enabled: true, mode: "force" } },
    }, {});
    const framed = applyMoves(solvedCube(), [
      ...invert(r.orientation),
      ...parseAlg(scramble),
      ...r.orientation,
    ]);
    assert(r.solved && isSolved(applyMoves(framed, r.solution)), `zbls (${scramble}): must solve`);
    assert(r.segments.some((s) => s.unitId === "zbls"), `zbls (${scramble}) must fire`);
  }
});

// Regression: every zbls case must target the FR slot and be reachable.
//
// 32 of the 302 cases were authored against the wrong F2L slot — 22 solved BR and
// 10 solved FL, carrying a leading `y`/`y'` from whatever the source's working
// slot was. APB's ZBLS recognition keys on the FR slot (DFR corner 4 + FR edge 8),
// so those cases' recognition states had the wrong slot open. Worse, being defined
// early they won the signature for AUF-coset entries belonging to *legitimate* FR
// cases, hijacking 27 of them: the lookup returned a wrong-slot case whose alg
// could not solve the state. (This had been recorded as ~32 untranscribable algs;
// it was not — every stored alg solved its own case correctly, they were simply
// expressed for another slot. They are now rotated onto FR, 24 of them ending up
// rotation-free.)
//
// Both halves are asserted, because either alone would let the bug back in.
Deno.test("zbls: every case targets the FR slot, and is recognized and solved", () => {
  const lookup = aufInvariantLookup(zblsSet, zblsSignature());
  const goal = regionSolvedAndEO(F2L);
  const AUF = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));
  const home = (s: CubeState, corner: number, edge: number) =>
    s.cp[corner] === corner && s.co[corner] === 0 && s.ep[edge] === edge && s.eo[edge] === 0;

  const wrongSlot: string[] = [], unreachable: string[] = [];
  for (const c of zblsSet.cases) {
    const state = zblsSet.recognitionState(c.id);
    const n = normalizeOrientation(state);
    // FR open, every other F2L slot already solved — the shape of a real ZBLS input.
    const frIsTheOpenSlot = !home(n, 4, 8) && home(n, 5, 9) && home(n, 6, 10) && home(n, 7, 11);
    if (!frIsTheOpenSlot) wrongSlot.push(c.id);

    const hit = lookup.find(state);
    const solved = hit?.algs.some((v) =>
      AUF.some((pre) => AUF.some((post) => goal(applyMoves(state, [...pre, ...v.moves, ...post]))))
    );
    if (!solved) unreachable.push(`${c.id}${hit && hit.id !== c.id ? ` (matched ${hit.id})` : ""}`);
  }
  // Eight cases here are authored against the FL slot and one against BR, not FR.
  // They are not forced onto FR by rewriting their moves — each simply carries the
  // rotation that brings the FR pair to the slot its alg solves (`y`, or `y'` for
  // the BR one), which is what a human does: turn the cube, then execute the alg you
  // know. That works only because a case's derived state now accounts for the alg's
  // own rotation; under the old derivation a leading `y` moved the case to a
  // different slot instead. The same prefix works for every variant of each case, so
  // they stay interchangeable.
  assertEquals(wrongSlot, [], "zbls cases not targeting the FR slot");
  assertEquals(unreachable, wrongSlot, "zbls cases the solver cannot recognize + solve");
});

// Cross-set audit: every algset, against the lookup and goal APB really uses.
//
// A set's own tests check that its algs solve its own cases. That is not the
// property that matters at solve time, and it is not what broke: zbls passed its
// own tests for months while 27 of its cases were being handed a *different*
// case's alg by the phase lookup, which uses a coarser signature over the AUF
// coset with rotation normalized. Nothing tested that end of the pipe.
//
// So this walks each set's cases through the real lookup and asserts three
// things: the case's own algs reach the goal, the lookup finds something, and
// what it finds actually solves the state. Any future set — or any change to a
// signature — is checked the same way.
//
// It does NOT prove coverage (that a set handles every state a live solve can
// produce); only running solves can, which the end-to-end tests above do.
Deno.test("every algset resolves and solves through its production lookup", () => {
  const AUF = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));
  const norm = (s: CubeState) => normalizeOrientation(s);
  const allCornersSolved = (s: CubeState) => {
    const n = norm(s);
    return n.cp.every((c, i) => c === i && n.co[i] === 0);
  };
  const cornersOriented = (s: CubeState) => norm(s).co.every((o) => o === 0);
  const drSolved = (s: CubeState) => s.ep[4] === 4 && s.eo[4] === 0;
  const AFTER_FRONT = { corners: [4, 5, 6], edges: [5, 6, 7, 8, 9, 10] };

  const targets: {
    name: string;
    set: typeof pllSet;
    lookup: { find(s: CubeState): { id: string; algs: { moves: Move[] }[] } | null };
    goal: (s: CubeState) => boolean;
    only?: (id: string) => boolean;
  }[] = [
    {
      name: "brPair",
      set: brPairSet,
      goal: regionSolved(AFTER_BR),
      lookup: regionLookup(brPairSet, pieceSignature([7], [11])),
    },
    {
      name: "frPair",
      set: frPairSet,
      goal: regionSolved(AFTER_FRONT),
      lookup: regionLookup(frPairSet, pieceSignature([4], [8])),
    },
    {
      name: "eo",
      set: eoPairSet,
      goal: regionSolvedAndEO(AFTER_BR),
      lookup: regionLookup(
        eoPairSet,
        eoSignature(EO_EDGE_SLOTS),
        (c) => c.subset === "dbr-solved-eo-(1)",
      ),
      only: (id) => eoPairSet.get(id)?.subset === "dbr-solved-eo-(1)",
    },
    {
      name: "eoBackSlot",
      set: eoPairSet,
      goal: regionSolvedAndEO(AFTER_FRONT),
      lookup: regionLookup(eoPairSet, eoSignature(EO_EDGE_SLOTS), (c) => c.subset === "dfr"),
      only: (id) => eoPairSet.get(id)?.subset === "dfr",
    },
    {
      name: "lxs",
      set: lxsSet,
      goal: regionSolvedAndEO(F2L),
      lookup: regionLookup(lxsSet, pieceSignature([4], [8, 4])),
    },
    {
      name: "lxsBackSlot",
      set: lxsBackSlotSet,
      goal: regionSolvedAndEO(F2L),
      lookup: regionLookup(lxsBackSlotSet, pieceSignature([7], [11, 4])),
    },
    {
      name: "ls",
      set: lxsSet,
      goal: regionSolvedAndEO(F2L),
      lookup: regionLookup(
        lxsSet,
        pieceSignature([4], [8]),
        (c) => drSolved(lxsSet.recognitionState(c.id)),
      ),
      only: (id) => drSolved(lxsSet.recognitionState(id)),
    },
    {
      name: "zbll",
      set: zbllSet,
      goal: isSolved,
      lookup: aufInvariantLookup(zbllSet, zbllSet.signature),
    },
    {
      name: "pll",
      set: pllSet,
      goal: isSolved,
      lookup: aufInvariantLookup(pllSet, pllSet.signature),
    },
    {
      name: "oll",
      set: ollSet,
      goal: (s) => cornersOriented(s) && norm(s).eo.every((o) => o === 0),
      lookup: aufInvariantLookup(ollSet, orientationSignature()),
    },
    {
      name: "coll",
      set: collSet,
      goal: allCornersSolved,
      lookup: aufInvariantLookup(collSet, cornerSignature()),
    },
    {
      name: "epll",
      set: pllSet,
      goal: isSolved,
      lookup: aufInvariantLookup(
        pllSet,
        pllSet.signature,
        (c) => allCornersSolved(pllSet.recognitionState(c.id)),
      ),
      only: (id) => allCornersSolved(pllSet.recognitionState(id)),
    },
    {
      name: "eodr",
      set: eodrSet,
      goal: (s) => norm(s).eo.every((o) => o === 0) && drSolved(norm(s)),
      lookup: regionLookup(eodrSet, eodrSignature()),
    },
    {
      name: "zbls",
      set: zblsSet,
      goal: regionSolvedAndEO(F2L),
      lookup: aufInvariantLookup(zblsSet, zblsSignature()),
    },
    {
      name: "wv",
      set: wvSet,
      goal: cornersOriented,
      lookup: aufInvariantLookup(wvSet, wvSvSignature()),
    },
    {
      name: "sv",
      set: svSet,
      goal: cornersOriented,
      lookup: aufInvariantLookup(svSet, wvSvSignature()),
    },
  ];

  const broken: string[] = [];
  let checked = 0;
  for (const t of targets) {
    for (const c of t.set.cases) {
      if (t.only && !t.only(c.id)) continue;
      checked++;
      const state = t.set.recognitionState(c.id);
      const solves = (algs: { moves: Move[] }[]) =>
        algs.some((v) =>
          AUF.some((pre) =>
            AUF.some((post) => t.goal(applyMoves(state, [...pre, ...v.moves, ...post])))
          )
        );
      if (!solves(c.algs)) {
        broken.push(`${t.name}/${c.id}: own algs do not reach the goal`);
        continue;
      }
      const hit = t.lookup.find(state);
      if (!hit) broken.push(`${t.name}/${c.id}: not recognized`);
      else if (!solves(hit.algs)) {
        broken.push(`${t.name}/${c.id}: matched ${hit.id}, whose alg does not solve it`);
      }
    }
  }
  assertEquals(broken, [], `algset/lookup mismatches (checked ${checked} cases)`);
  assert(checked > 1400, `expected the whole corpus to be audited, only saw ${checked}`);
});

// --- Last-layer orientation COVERAGE (regression) -----------------------------
//
// The audit above walks every *stored case* and checks it is recognized. That
// cannot find a coverage hole: if no case owns an orientation class, no iteration
// over cases visits it. So walk the last-layer orientation STATE SPACE instead and
// require the lookups APB actually uses to recognize and solve every state.
//
// This is the regression guard for the OLL primary defect: 50 of the 57 primaries
// solved a different orientation class than their own variants, so the primaries
// covered only 39 of the 57 classes. 66 of the 215 non-solved orientation states
// (~31%) were unrecognizable by the `oll` extra, and the 7-case OCLL filter behind
// `ocllPll` was missing a whole class — which `ocllPll` in *force* mode then hid by
// silently falling through to the core `zbll` step. See packages/algsets/src/oll.
Deno.test("OCLL + OLL lookups recognize and solve every last-layer orientation state", () => {
  const llState = (co: number[], eo: number[]): CubeState => ({
    ...solvedCube(),
    co: [...co, 0, 0, 0, 0],
    eo: [...eo, 0, 0, 0, 0, 0, 0, 0, 0],
  });
  const cornersOri = (s: CubeState) => normalizeOrientation(s).co.every((o) => o === 0);
  const edgesOri = (s: CubeState) => normalizeOrientation(s).eo.every((o) => o === 0);

  const OCLL_IDS = ["oll-21", "oll-22", "oll-23", "oll-24", "oll-25", "oll-26", "oll-27"];
  const targets = [
    {
      name: "OCLL (ocllPll)",
      lookup: aufInvariantLookup(ollSet, orientationSignature(), (c) => OCLL_IDS.includes(c.id)),
      goal: cornersOri,
      // OCLL runs after EO, so only the all-edges-oriented states reach it.
      edgesOrientedOnly: true,
      expected: 26,
    },
    {
      name: "OLL (oll extra)",
      lookup: aufInvariantLookup(ollSet, orientationSignature()),
      goal: (s: CubeState) => cornersOri(s) && edgesOri(s),
      edgesOrientedOnly: false,
      expected: 215,
    },
  ];

  for (const t of targets) {
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: t.name,
      goal: t.goal,
      cases: t.lookup,
      auf: ["U"],
    };
    const unrecognized: string[] = [];
    const unsolved: string[] = [];
    let seen = 0;
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        for (let c = 0; c < 3; c++) {
          for (let d = 0; d < 3; d++) {
            if ((a + b + c + d) % 3 !== 0) continue; // corner twist sums to 0 mod 3
            for (let mask = 0; mask < 16; mask++) {
              const eo = [mask & 1, (mask >> 1) & 1, (mask >> 2) & 1, (mask >> 3) & 1];
              if (eo.reduce((x, y) => x + y, 0) % 2 !== 0) continue; // edge-flip parity
              if (t.edgesOrientedOnly && eo.some((x) => x !== 0)) continue;
              const co = [a, b, c, d];
              if (co.every((x) => x === 0) && eo.every((x) => x === 0)) continue; // skip case
              seen++;
              const label = `co=${co.join("")} eo=${eo.join("")}`;
              const state = llState(co, eo);
              if (!t.lookup.find(state)) {
                unrecognized.push(label);
                continue;
              }
              const seg = runPhase(phase, state);
              if (!seg || !t.goal(seg.endState)) unsolved.push(label);
            }
          }
        }
      }
    }
    assertEquals(seen, t.expected, `${t.name}: unexpected state count`);
    assertEquals(unrecognized, [], `${t.name}: orientation states no case recognizes`);
    assertEquals(unsolved, [], `${t.name}: states recognized but not solved by the matched alg`);
  }
});

// --- EPLL must include the Z perm (regression) --------------------------------
//
// EPLL is the `pll` cases whose corners are already solved, filtered from the set.
// Every one of the Z perm's five algs is M-slice-based and its U turns leave the
// last-layer corners rotated by U2, so the recognition state derived from `algs[0]`
// has `cp = [2,3,0,1,...]` — corners solved only *up to AUF*. A strict
// corners-solved filter therefore dropped `z`, leaving EPLL with 3 of its 4 cases
// and making a Z-perm last layer unsolvable by `collEpll` (which, in force mode,
// silently fell through to the core `zbll` step). Recognition is a two-sided U
// coset, so folding AUF into the filter is the correct test.
Deno.test("EPLL is the four corners-solved-up-to-AUF PLL cases, including z", () => {
  const cornersSolved = (s: CubeState) => {
    const n = normalizeOrientation(s);
    return n.cp.every((c, i) => c === i && n.co[i] === 0);
  };
  const upToAuf = (s: CubeState) => [0, 1, 2, 3].some((k) => cornersSolved(applyMoves(s, U(k))));

  const strict = pllSet.cases.filter((c) => cornersSolved(pllSet.recognitionState(c.id)));
  const folded = pllSet.cases.filter((c) => upToAuf(pllSet.recognitionState(c.id)));

  assertEquals(
    folded.map((c) => c.id).sort(),
    ["h", "ua", "ub", "z"],
    "EPLL must be exactly Ua, Ub, Z and H",
  );
  // Documents *why* the fold is needed: the strict test loses z.
  assert(
    !strict.some((c) => c.id === "z"),
    "z's recognition state is corners-solved only up to AUF — if this ever becomes " +
      "strictly corners-solved the fold is no longer load-bearing, but it stays correct",
  );
});

// Both force-mode last-layer replacements must actually fire on every solve: their
// region is the whole `zbll` step, so nothing else is meant to cover it. These are
// the exact scrambles on which each previously fell through to the core `zbll`
// step because of the two recognition gaps fixed above.
Deno.test("force-mode ocllPll and collEpll always fire and verify", async () => {
  const cases: [string, string[]][] = [
    ["ocllPll", [
      "B' D' U B2 U' F U2 F B L2 U B2 F' L2 U' L2 F2 L2 F' B",
      "B2 R' L2 D2 R2 L F2 D F' B' U D' B U B' F2 L' R' D R",
      "L' B F2 R F2 L D' R2 U2 R2 L' U F' D2 U2 R' F' U R2 U'",
    ]],
    ["collEpll", [
      "L' F2 R' B2 R U2 B' R' L' D' L U' R2 F' R F' B' R2 L2 R2",
      "B F B U2 R B2 L' U' D' B' D2 F' L F L' D' U B D' U",
      "R B' L2 R D R' F2 B2 F2 D L R' L' U2 R2 B' D2 U F2 R2",
    ]],
  ];
  for (const [id, scrambles] of cases) {
    for (const scramble of scrambles) {
      const r = await apb.solve(scramble, {
        replacements: { [id]: { enabled: true, mode: "force" } },
      }, {});
      const framed = applyMoves(solvedCube(), [
        ...invert(r.orientation),
        ...parseAlg(scramble),
        ...r.orientation,
      ]);
      assert(
        r.solved && isSolved(applyMoves(framed, r.solution)),
        `${id} (${scramble}): must solve`,
      );
      assert(
        r.segments.some((s) => s.unitId === id),
        `${id} (${scramble}): force mode must use the replacement, not fall through to zbll`,
      );
    }
  }
});

// --- Every variant must solve its own case (regression + ratchet) -------------
//
// The cross-set audit above asks whether *some* alg of a case solves it, which is
// true by construction for the primary — so it cannot see a case whose stored
// alternatives belong to a different case. That is exactly the defect that hid the
// broken `oll` primaries, and an audit of all 14 sets found the same shape in two
// more: the transform paired alg lists with the wrong case.
//
//   - `oll` had it in algs[0] (fixed — recognition derives from the primary, so it
//     silently moved 50 cases and orphaned 18 orientation classes).
//   - `zbll` and `pll` had it in algs[1..n] — 1572 of 1745 ZBLL and 47 of 89 PLL
//     variants were filed under the wrong case, so `runPhase` silently skipped
//     them and those steps had far fewer real options than the data suggested.
//     Primaries were correct throughout and coverage was already proven complete
//     (the 7775-state ZBLL test above), so it cost no correctness — only the cost
//     race. Now migrated: every variant sits under the case it actually solves.
//     The misfiling was near-perfectly structured, which is what made the move
//     safe — in `zbll`, all 428 affected cases formed 214 mutual swap-pairs
//     (t-1 <-> l-26, t-2 <-> l-28, ...), every misfiled variant of a case going to
//     the same target. 14 algs across the two sets were dropped rather than moved:
//     they solve no case in their set because they disturb the F2L, i.e. they are
//     corrupt, not merely misfiled.
//
// Every set is now pinned at zero: a newly broken or misfiled variant fails
// immediately.
Deno.test("every algset variant solves its own case", () => {
  const AUF = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));
  const norm = (s: CubeState) => normalizeOrientation(s);
  const cornersOriented = (s: CubeState) => norm(s).co.every((o) => o === 0);
  const allCornersSolved = (s: CubeState) => {
    const n = norm(s);
    return n.cp.every((c, i) => c === i && n.co[i] === 0);
  };
  const drSolved = (s: CubeState) => s.ep[4] === 4 && s.eo[4] === 0;
  const AFTER_FRONT = { corners: [4, 5, 6], edges: [5, 6, 7, 8, 9, 10] };
  const BLOCK223_ONLY = { corners: [5, 6], edges: [5, 6, 7, 9, 10] };

  // `budget` is the number of known-dead variants: 0 for a clean set, and the
  // current count for the two with known debt. The assertion is `<=`, so the
  // number can only fall.
  const targets: {
    name: string;
    set: { cases: readonly { id: string; algs: readonly { moves: Move[] }[] }[] };
    goal: (s: CubeState) => boolean;
    budget: number;
  }[] = [
    { name: "br-pair", set: brPairSet, goal: regionSolved(AFTER_BR), budget: 0 },
    { name: "fr-pair", set: frPairSet, goal: regionSolved(AFTER_FRONT), budget: 0 },
    { name: "dfdb", set: dfdbSet, goal: regionSolved(BLOCK223_ONLY), budget: 0 },
    { name: "eo-pair", set: eoPairSet, goal: regionSolvedAndEO(AFTER_BR), budget: 0 },
    { name: "lxs", set: lxsSet, goal: regionSolvedAndEO(F2L), budget: 0 },
    { name: "lxs-back-slot", set: lxsBackSlotSet, goal: regionSolvedAndEO(F2L), budget: 0 },
    {
      name: "oll",
      set: ollSet,
      goal: (s) => cornersOriented(s) && norm(s).eo.every((o) => o === 0),
      budget: 0,
    },
    { name: "coll-epll", set: collSet, goal: allCornersSolved, budget: 0 },
    {
      name: "eodr",
      set: eodrSet,
      goal: (s) => norm(s).eo.every((o) => o === 0) && drSolved(norm(s)),
      budget: 0,
    },
    { name: "zbls", set: zblsSet, goal: regionSolvedAndEO(F2L), budget: 0 },
    { name: "wv", set: wvSet, goal: cornersOriented, budget: 0 },
    { name: "sv", set: svSet, goal: cornersOriented, budget: 0 },
    { name: "pll", set: pllSet, goal: isSolved, budget: 0 },
    { name: "zbll", set: zbllSet, goal: isSolved, budget: 0 },
  ];

  const regressions: string[] = [];
  for (const t of targets) {
    let dead = 0;
    const first: string[] = [];
    for (const c of t.set.cases) {
      const state = applyMoves(solvedCube(), invert(c.algs[0].moves));
      for (let v = 1; v < c.algs.length; v++) {
        const ok = AUF.some((pre) =>
          AUF.some((post) => t.goal(applyMoves(state, [...pre, ...c.algs[v].moves, ...post])))
        );
        if (!ok) {
          dead++;
          if (first.length < 3) first.push(`${c.id} alg #${v + 1}`);
        }
      }
    }
    if (dead > t.budget) {
      regressions.push(
        `${t.name}: ${dead} variants do not solve their own case (budget ${t.budget})` +
          `${first.length ? ` — e.g. ${first.join(", ")}` : ""}`,
      );
    }
  }
  assertEquals(regressions, [], "algsets gained variants that do not solve their own case");
});

// --- Last-layer CORNER coverage for COLL (regression) -------------------------
//
// Same shape as the orientation-coverage test above, for the other axis. APB's
// `coll` phase goal is `cornersSolved`, so it must handle every last-layer corner
// state — but the `coll-epll` set is faithful to its source (SpeedCubeDB's COLL),
// whose 40 cases are grouped by the seven OCLL *orientation* shapes. It therefore
// has no case for corners that are already oriented but permuted: those are corner
// PLLs. All 23 such classes were unsolvable, plus the 4-state "corners solved up to
// AUF" skip. `collLookup` now falls through to the corner-permuting PLLs and then
// to an empty-alg skip, so the phase covers the space. This walks the corner state
// space rather than the stored cases, which is the only way to see such a hole.
Deno.test("the COLL lookup recognizes and solves every last-layer corner state", () => {
  const collPhase = apbDefinition.replacements!
    .find((r) => r.id === "collEpll")!.strategies[0].phases[0] as AlgorithmicPhase;
  const cornersSolvedNow = (s: CubeState) => {
    const n = normalizeOrientation(s);
    return n.cp.every((c, i) => c === i && n.co[i] === 0);
  };

  const permutations = (xs: number[]): number[][] => {
    if (xs.length <= 1) return [xs];
    const out: number[][] = [];
    for (let i = 0; i < xs.length; i++) {
      for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) {
        out.push([xs[i], ...rest]);
      }
    }
    return out;
  };

  const unrecognized: string[] = [];
  const unsolved: string[] = [];
  let seen = 0;
  for (const cp of permutations([0, 1, 2, 3])) {
    for (let m = 0; m < 81; m++) {
      const co = [m % 3, Math.floor(m / 3) % 3, Math.floor(m / 9) % 3, Math.floor(m / 27) % 3];
      if ((co[0] + co[1] + co[2] + co[3]) % 3 !== 0) continue; // twist sums to 0 mod 3
      const state: CubeState = {
        ...solvedCube(),
        cp: [...cp, 4, 5, 6, 7],
        co: [...co, 0, 0, 0, 0],
      };
      if (cornersSolvedNow(state)) continue; // nothing for COLL to do
      seen++;
      const label = `cp=${cp.join("")} co=${co.join("")}`;
      if (!collPhase.cases.find(state)) {
        unrecognized.push(label);
        continue;
      }
      const seg = runPhase(collPhase, state);
      if (!seg || !cornersSolvedNow(seg.endState)) unsolved.push(label);
    }
  }
  assertEquals(seen, 647, "unexpected last-layer corner state count");
  assertEquals(unrecognized, [], "corner states no COLL case recognizes");
  assertEquals(unsolved, [], "corner states recognized but not solved by the matched alg");
});

// --- Rotations are used, never undone (regression) ----------------------------
//
// A rotation an alg contains is part of the solution and the frame it leaves is the
// new state. `runPhase` used to insist on the home frame at every phase boundary,
// prepending a homing rotation — so a `y2` in a COLL alg was immediately followed by
// a homing `y' y'` before EPLL, three rotation moves whose net effect is nothing.
//
// The reason it can simply be dropped for a `y`-type frame: below the last layer
// everything is solved, and a `y` leaves that solved block solved, so the last layer
// is presented exactly as a `U` would present it — which the pre/post AUF the phase
// already tries absorbs completely. Measured here across every case of pll, oll and
// zbll: a phase run in a y-rotated frame needs no rotation at all. (`x`/`z` take the
// last layer off the top, where no U turn can reach it, so there a reorientation is
// genuine and is emitted as one costed move — see homingRotation's tests.)
Deno.test("a y-rotated frame is absorbed by AUF, with no rotation emitted", () => {
  const AUF = ["", "U", "U2", "U'"].map((a) => (a ? parseAlg(a) : []));
  const targets = [
    {
      name: "pll",
      set: pllSet,
      lookup: aufInvariantLookup(pllSet, pllSet.signature),
      goal: isSolved,
    },
    {
      name: "oll",
      set: ollSet,
      lookup: aufInvariantLookup(ollSet, orientationSignature()),
      goal: (s: CubeState) => {
        const n = normalizeOrientation(s);
        return n.co.every((o) => o === 0) && n.eo.every((o) => o === 0);
      },
    },
  ];
  const needsRotation: string[] = [];
  for (const t of targets) {
    for (const c of t.set.cases) {
      for (const rot of ["y", "y2", "y'"]) {
        // The same position, held rotated.
        const held = applyMoves(t.set.recognitionState(c.id), parseAlg(rot));
        const hit = t.lookup.find(held);
        const solvedInPlace = hit?.algs.some((v) =>
          AUF.some((pre) =>
            AUF.some((post) => t.goal(applyMoves(held, [...pre, ...v.moves, ...post])))
          )
        );
        if (!solvedInPlace) needsRotation.push(`${t.name}/${c.id} after ${rot}`);
      }
    }
  }
  assertEquals(needsRotation, [], "cases a y-rotated frame forced a reorientation for");
});
