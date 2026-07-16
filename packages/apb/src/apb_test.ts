import { brPair as brPairSet } from "@moishy/algsets/br-pair";
import { eodr as eodrSet } from "@moishy/algsets/eodr";
import { eoPair as eoPairSet } from "@moishy/algsets/eo-pair";
import { lxs as lxsSet } from "@moishy/algsets/lxs";
import { pll as pllSet } from "@moishy/algsets/pll";
import { zbll as zbllSet } from "@moishy/algsets/zbll";
import {
  type AlgorithmicPhase,
  applyMoves,
  type CubeState,
  invert,
  isSolved,
  type Move,
  parseAlg,
  runPhase,
  solvedCube,
} from "@moishy/cubing-core";
import { assert, assertEquals } from "@std/assert";
import { apb, apbDefinition } from "../mod.ts";
import {
  AFTER_BR,
  aufInvariantLookup,
  BLOCK223,
  centersSolved,
  eoSignature,
  F2L,
  fallThrough,
  pieceSignature,
  regionLookup,
  regionSolved,
  regionSolvedAndEO,
  stripRotations,
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
    ["ocllPll", "collEpll", "eoPair", "eodrLs"],
  );
  assertEquals(
    apbDefinition.extras?.map((e) => e.id),
    ["oll", "zbls", "winterSummerVariation", "backSlotEoLxs"],
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
  "eo: the dbr subset of eo-pair recognizes + solves as the core EO step",
  () => {
    const dbr = (c: { subset?: string }) => c.subset === "dbr-solved-eo-(1)";
    const cases = eoPairSet.cases.filter(dbr);
    assertEquals(cases.length, 11);
    const phase: AlgorithmicPhase = {
      kind: "algorithmic",
      id: "eo",
      goal: regionSolvedAndEO(AFTER_BR),
      cases: regionLookup(eoPairSet, eoSignature(), dbr),
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

Deno.test(
  "replacement/extra sets recognize + solve with their wired signatures",
  async () => {
    // Guards the signatures APB uses for the newly-authored sets. Each set's own
    // cases are recognized (custom signature) and solved by the primary alg,
    // across all AUFs — the same contract as the core steps.
    const { collEpll } = await import("@moishy/algsets/coll-epll");
    const { eodr } = await import("@moishy/algsets/eodr");
    const { lxsBackSlot } = await import("@moishy/algsets/lxs-back-slot");
    const cornersSolved = (s: CubeState) => s.cp.every((c, i) => c === i && s.co[i] === 0);
    const dr = (s: CubeState) => s.ep[4] === 4 && s.eo[4] === 0;

    assertEquals(
      assertSolvesAllCases(
        {
          kind: "algorithmic",
          id: "coll",
          goal: cornersSolved,
          cases: regionLookup(collEpll, collEpll.signature),
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
        eoSignature(),
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
    assert(r.solved && isSolved(applyMoves(framed, r.solution)), `eodrLs (${scramble}): must solve`);
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
    "U L U2 F' L F2 U' L2 U' L U2 F L2 U2 F2 L' F' L U2 F'",
    "F L2 U F2 L F L' F' U F2 L U2 L2 U2 L F L2 U L' F'",
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
