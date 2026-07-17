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
  normalizeOrientation,
  parseAlg,
  runPhase,
  solvedCube,
  statesEqual,
} from "@moishy/cubing-core";
import { assert, assertEquals } from "@std/assert";
import { apb, apbDefinition } from "../mod.ts";
import {
  AFTER_BR,
  aufInvariantLookup,
  BLOCK223,
  centersSolved,
  cornerSignature,
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

// The general rotation architecture end-to-end: solve a cube whose *frame is
// rotated* (a z2 "inspection" rotation up front, a y "mid-solve" rotation at the
// end) so the first phase's INPUT has drifted centers. APB's own solves never hit
// this — colour-neutrality is realized by conjugation, which keeps centers home —
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
  // Competing (enabled, default compete mode) must complete without hanging.
  const rc = await apb.solve(scramble, {
    colorNeutrality: "fixed",
    stepOptions: { block223: { forceStrategy: "fbDfdb" } },
    replacements: { backSlotEoLxs: { enabled: true } },
  }, {});
  assert(rc.solved, "competing backSlotEoLxs must still produce a solved cube");
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
