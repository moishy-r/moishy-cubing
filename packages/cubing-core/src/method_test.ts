import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  applyAlg,
  applyMoves,
  isSolved,
  solvedCube,
  statesEqual,
  toFacelets,
} from "./cube-state.ts";
import { formatAlg, parseAlg } from "./notation.ts";
import type { AlgCase, CaseLookup, Step, Strategy } from "./step.ts";
import { allOrientations, Method, type Replacement, SettingsError } from "./method.ts";

type State = ReturnType<typeof solvedCube>;
const st = (alg: string) => applyAlg(solvedCube(), alg);
const eq = (target: State) => (s: State) => statesEqual(s, target);
const oneOf = (...targets: State[]) => (s: State) => targets.some((t) => statesEqual(s, t));

function lookup(entries: { state: State; case: AlgCase }[]): CaseLookup {
  const map = new Map(entries.map((e) => [toFacelets(e.state), e.case]));
  return { find: (s) => map.get(toFacelets(s)) ?? null };
}
function algPhase(id: string, goal: (s: State) => boolean, entries: Parameters<typeof lookup>[0]) {
  return { kind: "algorithmic" as const, id, goal, cases: lookup(entries) };
}

const FACES = ["U", "D", "L", "R", "F", "B"] as const;
const SEXY = "R U R' U'";
const scrambledLL = st(SEXY);

// Two ways to solve the LL: a free search vs. a padded known alg (same result,
// higher cost). Reused across the racing and pinning tests.
const searchStrategy: Strategy = {
  id: "search",
  phases: [{ kind: "search", id: "s", goal: isSolved, moves: [...FACES], maxDepth: 6 }],
};
const algStrategy: Strategy = {
  id: "alg",
  // Padded so it loses the race. The padding is `D U D' U'` — state-neutral (D and U are
  // on the same axis, so they commute and it is the identity) with no two adjacent moves
  // of the same family. That matters: `runPhase` merges same-family adjacencies where it
  // assembles a candidate, so padding built from `U U'` or `U2 U2` is silently removed and
  // the "expensive" route stops being expensive. These fixtures were written that way and
  // six of them started passing for the wrong reason.
  phases: [algPhase("a", isSolved, [{
    state: scrambledLL,
    case: { id: "sexy", algs: [{ moves: parseAlg("U R U' R' D U D' U'") }] },
  }])],
};

Deno.test("strategies race by MCC: the cheaper one wins", async () => {
  const method = new Method({
    id: "demo",
    steps: [{ id: "ll", strategies: [searchStrategy, algStrategy] }],
  });
  const r = await method.solve(SEXY);
  assertEquals(r.segments[0].strategyId, "search");
  assert(r.solved);
  assert(isSolved(applyMoves(scrambledLL, r.solution)));
});

Deno.test("pinning: stepOptions.forceStrategy pins a strategy (demo mode)", async () => {
  const method = new Method({
    id: "demo",
    steps: [{ id: "ll", strategies: [searchStrategy, algStrategy] }],
  });
  const r = await method.solve(SEXY, { stepOptions: { ll: { forceStrategy: "alg" } } });
  assertEquals(r.segments[0].strategyId, "alg");
  assert(r.solved);
});

Deno.test("enabledStrategies narrows the racing pool", async () => {
  const method = new Method({
    id: "demo",
    steps: [{ id: "ll", strategies: [searchStrategy, algStrategy] }],
  });
  const r = await method.solve(SEXY, { stepOptions: { ll: { enabledStrategies: ["alg"] } } });
  assertEquals(r.segments[0].strategyId, "alg");
});

// A two-step region solved either as two padded sub-steps or by one combined
// (cheaper) replacement alg. Deterministic — fixed algs, no search.
const caseState = st("U R U' R'");
const midState = applyMoves(caseState, parseAlg("R U"));
function regionMethod() {
  const steps: Step[] = [
    {
      id: "half1",
      strategies: [{
        id: "h1",
        phases: [
          algPhase("p", eq(midState), [{
            state: caseState,
            case: { id: "part1", algs: [{ moves: parseAlg("R U") }] },
          }]),
        ],
      }],
    },
    {
      id: "half2",
      strategies: [{
        id: "h2",
        phases: [
          algPhase("p", isSolved, [{
            state: midState,
            case: { id: "part2", algs: [{ moves: parseAlg("R' U' D U D' U'") }] },
          }]),
        ],
      }],
    },
  ];
  const combined: Replacement = {
    id: "combined",
    region: ["half1", "half2"],
    mode: "compete",
    strategies: [{
      id: "combined-alg",
      phases: [
        algPhase("p", isSolved, [{
          state: caseState,
          case: { id: "sexy", algs: [{ moves: parseAlg("R U R' U'") }] },
        }]),
      ],
    }],
  };
  return new Method({ id: "demo", steps, replacements: [combined] });
}

Deno.test("replacement is disabled by default: the region dissolves into its steps", async () => {
  const r = await regionMethod().solve("U R U' R'");
  assertEquals(r.segments.map((s) => s.unitId), ["half1", "half2"]);
  assert(r.solved);
});

Deno.test("replacement (compete, opted in): the cheaper replacement wins the region", async () => {
  const r = await regionMethod().solve("U R U' R'", {
    replacements: { combined: { enabled: true } },
  });
  assertEquals(r.segments[0].kind, "replacement");
  assertEquals(r.segments[0].strategyId, "combined-alg");
  assertEquals(r.solutionString, "R U R' U'");
  assert(r.solved);
});

Deno.test("replacement (force, opted in): the replacement is used without racing baseline", async () => {
  const r = await regionMethod().solve("U R U' R'", {
    replacements: { combined: { enabled: true, mode: "force" } },
  });
  assertEquals(r.segments[0].strategyId, "combined-alg");
  assertEquals(r.segments[0].alternatives?.some((a) => a.strategyId === "<original>"), false);
  assert(r.solved);
});

Deno.test("color neutrality: picks the cheapest orientation and commits early", async () => {
  const method = new Method({
    id: "demo",
    steps: [{
      id: "solve",
      strategies: [{
        id: "s",
        phases: [{ kind: "search", id: "p", goal: isSolved, moves: [...FACES], maxDepth: 3 }],
      }],
    }],
  });
  const r = await method.solve("F", { colorNeutrality: [[], parseAlg("y'")] });
  assertEquals(r.orientation, parseAlg("y'"));
  assertEquals(r.cost, 0.8);
  assert(r.solved && isSolved(r.finalState));
});

Deno.test("color neutrality: full mode has 24 orientations and still solves", async () => {
  assertEquals(allOrientations().length, 24);
  const method = new Method({
    id: "demo",
    steps: [{
      id: "solve",
      strategies: [{
        id: "s",
        phases: [{ kind: "search", id: "p", goal: isSolved, moves: [...FACES], maxDepth: 2 }],
      }],
    }],
  });
  const r = await method.solve("R", { colorNeutrality: "full" });
  assert(r.solved);
});

Deno.test("time budget: a tiny budget yields a partial (unsolved) result", async () => {
  const method = new Method({
    id: "demo",
    steps: [{
      id: "solve",
      strategies: [{
        id: "s",
        phases: [{ kind: "search", id: "p", goal: isSolved, moves: [...FACES], maxDepth: 10 }],
      }],
    }],
  });
  const r = await method.solve("R U2 D' B2 F'", {}, { timeBudgetMs: 1 });
  assertEquals(r.solved, false);
});

// --- Phase-chaining -----------------------------------------------------------
// One strategy [SearchPhase, AlgorithmicPhase]. The search can reach P (cheaply)
// or Q (a touch dearer); the alg from P is padded-expensive, from Q is cheap.
// Committing the cheapest search first (P) is a trap; phase-chaining should keep
// Q alive and win on the FB+insert total.
Deno.test("phase-chaining: keeping a dearer upstream branch wins on the joint total", async () => {
  // P and Q differ by an R turn (not a U turn) so the downstream phase's pre-AUF
  // can't cross-recognize one as the other — the branch choice is genuine.
  const P = st("R"); // reached by "R"
  const Q = st("R2"); // reached by "R2"
  const chained: Strategy = {
    id: "chain",
    phases: [
      { kind: "search", id: "reach", goal: oneOf(P, Q), moves: ["R"], maxDepth: 1 },
      algPhase("finish", isSolved, [
        { state: P, case: { id: "fromP", algs: [{ moves: parseAlg("R' D U D' U'") }] } }, // padded
        { state: Q, case: { id: "fromQ", algs: [{ moves: parseAlg("R2") }] } }, // cheap
      ]),
    ],
  };
  const method = new Method({ id: "demo", steps: [{ id: "s", strategies: [chained] }] });

  const off = await method.solve("", { stepOptions: { s: { phaseChaining: { enabled: false } } } });
  const on = await method.solve("", {
    stepOptions: { s: { phaseChaining: { enabled: true, slack: 1 } } },
  });
  assert(off.solved && on.solved, "both should solve");
  assert(on.cost < off.cost, `expected chaining cheaper: on=${on.cost} off=${off.cost}`);
  // Chaining lands on the Q branch (cheap finish); no-chaining takes the P trap.
  assertEquals(on.segments[0].phases[1].caseId, "fromQ");
  assertEquals(off.segments[0].phases[1].caseId, "fromP");
});

// --- Lookahead ----------------------------------------------------------------
// stepA's case has two variants: vX ("R", cheap) leaving X, vY ("R2", dearer)
// leaving Y. stepB from X needs a padded-expensive alg; from Y a cheap one.
// Local-greedy picks vX and pays downstream; lookahead should flip to vY.
function lookaheadMethod() {
  const X = st("R");
  const Y = st("R2");
  const stepA: Step = {
    id: "a",
    strategies: [{
      id: "sa",
      phases: [
        algPhase("pa", oneOf(X, Y), [{
          state: solvedCube(),
          case: { id: "ca", algs: [{ moves: parseAlg("R") }, { moves: parseAlg("R2") }] },
        }]),
      ],
    }],
  };
  const stepB: Step = {
    id: "b",
    strategies: [{
      id: "sb",
      phases: [algPhase("pb", isSolved, [
        { state: X, case: { id: "fromX", algs: [{ moves: parseAlg("R' D U D' U'") }] } }, // padded
        { state: Y, case: { id: "fromY", algs: [{ moves: parseAlg("R2") }] } }, // cheap
      ])],
    }],
  };
  return new Method({ id: "demo", steps: [stepA, stepB] });
}

Deno.test("lookahead: picks the upstream variant with the cheaper continuation", async () => {
  const m = lookaheadMethod();
  const off = await m.solve("", { lookahead: { depth: 0 } });
  const on = await m.solve("", { lookahead: { depth: 1, scope: [["a", "b"]] } });
  assert(off.solved && on.solved);
  assert(on.cost < off.cost, `expected lookahead cheaper: on=${on.cost} off=${off.cost}`);
  // Without lookahead: local-cheapest variant vX -> caseX downstream.
  assertEquals(off.segments[0].phases[0].variantIndex, 0);
  assertEquals(off.segments[1].phases[0].caseId, "fromX");
  // With lookahead: flips to vY -> caseY downstream.
  assertEquals(on.segments[0].phases[0].variantIndex, 1);
  assertEquals(on.segments[1].phases[0].caseId, "fromY");
});

// --- Region-covering DP (overlapping compete replacements) --------------------
// Steps a,b,c. R1 covers [a,b] cheaply; R2 covers [b,c] cheaply; they overlap at
// b so at most one applies. The DP should cover the span with the best mix.
Deno.test("overlapping compete replacements: the region DP picks the cheapest cover", async () => {
  const s0 = st("R");
  const s1 = applyMoves(s0, parseAlg("U"));
  const s2 = applyMoves(s1, parseAlg("F"));
  const step = (id: string, from: State, to: State, alg: string): Step => ({
    id,
    strategies: [{
      id: `${id}s`,
      phases: [
        algPhase("p", eq(to), [{ state: from, case: { id, algs: [{ moves: parseAlg(alg) }] } }]),
      ],
    }],
  });
  const steps: Step[] = [
    step("a", s0, s1, "U"),
    step("b", s1, s2, "F"),
    // c solves back to the cube state we scrambled from (s0) then to solved:
    {
      id: "c",
      strategies: [{
        id: "cs",
        phases: [
          algPhase("p", isSolved, [{
            state: s2,
            case: { id: "c", algs: [{ moves: parseAlg("F' U' R'") }] },
          }]),
        ],
      }],
    },
  ];
  // R1 [a,b]: one alg s0 -> s2 (cheap). R2 [b,c]: one alg s1 -> solved (cheap).
  const r1: Replacement = {
    id: "r1",
    region: ["a", "b"],
    mode: "compete",
    strategies: [{
      id: "r1s",
      phases: [
        algPhase("p", eq(s2), [{
          state: s0,
          case: { id: "r1", algs: [{ moves: parseAlg("U F") }] },
        }]),
      ],
    }],
  };
  const r2: Replacement = {
    id: "r2",
    region: ["b", "c"],
    mode: "compete",
    strategies: [{
      id: "r2s",
      phases: [
        algPhase("p", isSolved, [{
          state: s1,
          case: { id: "r2", algs: [{ moves: parseAlg("U' R' D U D' U'") }] },
        }]),
      ],
    }],
  };
  const method = new Method({ id: "demo", steps, replacements: [r1, r2] });

  const r = await method.solve("R", {
    replacements: { r1: { enabled: true }, r2: { enabled: true } },
  });
  assert(r.solved, "span cover should solve");
  // Every unit is either a plain step or one of the two replacements, covering a,b,c once.
  const ids = r.segments.map((s) => s.unitId);
  assert(ids.length >= 2 && ids.length <= 3, `unexpected cover: ${ids}`);
});

Deno.test("two enabled force replacements with overlapping regions is a settings error", async () => {
  const mk = (id: string, region: [string, string]): Replacement => ({
    id,
    region,
    mode: "force",
    strategies: [{
      id: `${id}s`,
      phases: [
        algPhase("p", isSolved, [{
          state: st("R"),
          case: { id, algs: [{ moves: parseAlg("R'") }] },
        }]),
      ],
    }],
  });
  const steps: Step[] = [
    {
      id: "a",
      strategies: [{
        id: "as",
        phases: [
          algPhase("p", isSolved, [{
            state: st("R"),
            case: { id: "a", algs: [{ moves: parseAlg("R'") }] },
          }]),
        ],
      }],
    },
    {
      id: "b",
      strategies: [{
        id: "bs",
        phases: [
          algPhase("p", isSolved, [{
            state: st("R"),
            case: { id: "b", algs: [{ moves: parseAlg("R'") }] },
          }]),
        ],
      }],
    },
  ];
  const method = new Method({
    id: "demo",
    steps,
    replacements: [mk("x", ["a", "b"]), mk("y", ["b", "b"])],
  });
  await assertRejects(
    () => method.solve("R", { replacements: { x: { enabled: true }, y: { enabled: true } } }),
    SettingsError,
    "overlapping regions",
  );
});

// --- Extras -------------------------------------------------------------------
Deno.test("boundary extra (opt-in, force): a triggered extra replaces its region", async () => {
  // Step "s" normally solved by a padded alg; the extra solves it cheaper when
  // its boundary trigger passes.
  const method = new Method({
    id: "demo",
    steps: [{
      id: "s",
      strategies: [{
        id: "base",
        phases: [
          algPhase("p", isSolved, [{
            state: st("R"),
            case: { id: "base", algs: [{ moves: parseAlg("R' D U D' U'") }] },
          }]),
        ],
      }],
    }],
    extras: [{
      id: "shortcut",
      region: ["s", "s"],
      mode: "force",
      trigger: { kind: "boundary", test: (s) => !isSolved(s) },
      strategies: [{
        id: "short",
        phases: [
          algPhase("p", isSolved, [{
            state: st("R"),
            case: { id: "short", algs: [{ moves: parseAlg("R'") }] },
          }]),
        ],
      }],
    }],
  });
  const off = await method.solve("R"); // extra disabled by default
  assertEquals(off.segments[0].kind, "step");
  const on = await method.solve("R", { extras: { shortcut: { enabled: true } } });
  assertEquals(on.segments[0].kind, "extra");
  assertEquals(on.segments[0].unitId, "shortcut");
  assert(on.solved && on.cost < off.cost);
});

Deno.test("checkpoint extra (opt-in): splices its continuation mid-alg", async () => {
  const sexyCase: AlgCase = {
    id: "sexy",
    algs: [{ moves: parseAlg("R U R' U'"), checkpoints: [{ label: "insert", index: 2 }] }],
  };
  const method = new Method({
    id: "demo",
    steps: [{
      id: "ll",
      strategies: [{
        id: "s",
        phases: [algPhase("p", isSolved, [{ state: caseState, case: sexyCase }])],
      }],
    }],
    extras: [{
      id: "mid",
      region: ["ll", "ll"],
      mode: "force",
      trigger: { kind: "checkpoint", label: "insert" },
      strategies: [{
        id: "cont",
        phases: [{ kind: "search", id: "p", goal: isSolved, moves: [...FACES], maxDepth: 5 }],
      }],
    }],
  });
  const off = await method.solve("U R U' R'");
  assertEquals(off.segments[0].kind, "step");
  const on = await method.solve("U R U' R'", { extras: { mid: { enabled: true } } });
  assertEquals(on.segments[0].kind, "extra");
  assertEquals(on.segments[0].unitId, "mid");
  assert(on.solved && isSolved(on.finalState));
  // The spliced solution keeps the alg's prefix (first 2 moves) then the extra's continuation.
  assertEquals(formatAlg(on.segments[0].moves.slice(0, 2)), "R U");
});

Deno.test("checkpoint extra with no label auto-scans alg prefixes for the splice", async () => {
  // The step alg declares NO checkpoints and the trigger has NO label: the runner
  // must scan every prefix and find the point where the extra's first phase
  // recognizes. The continuation recognizes ONLY at the "R U" prefix (midState),
  // so a splice can only be found by scanning — not from any pre-declared index.
  const bareSexy: AlgCase = { id: "sexy", algs: [{ moves: parseAlg("R U R' U'") }] };
  const contCase: AlgCase = { id: "cont", algs: [{ moves: parseAlg("R' U'") }] };
  const method = new Method({
    id: "demo",
    steps: [{
      id: "ll",
      strategies: [{
        id: "s",
        phases: [algPhase("p", isSolved, [{ state: caseState, case: bareSexy }])],
      }],
    }],
    extras: [{
      id: "mid",
      region: ["ll", "ll"],
      mode: "force",
      trigger: { kind: "checkpoint" }, // no label -> auto-scan
      strategies: [{
        id: "cont",
        phases: [algPhase("c", isSolved, [{ state: midState, case: contCase }])],
      }],
    }],
  });
  const off = await method.solve("U R U' R'");
  assertEquals(off.segments[0].kind, "step");
  const on = await method.solve("U R U' R'", { extras: { mid: { enabled: true } } });
  assertEquals(on.segments[0].kind, "extra");
  assertEquals(on.segments[0].unitId, "mid");
  assert(on.solved && isSolved(on.finalState));
  // Found the mid-alg splice by scanning: kept the "R U" prefix, then continued.
  assertEquals(formatAlg(on.segments[0].moves.slice(0, 2)), "R U");
});

Deno.test("recommendedSettings apply by default and are overridable by the caller", async () => {
  const method = new Method({
    id: "demo",
    steps: [{ id: "ll", strategies: [searchStrategy, algStrategy] }],
    recommendedSettings: { stepOptions: { ll: { forceStrategy: "alg" } } },
  });
  // Default: the method's recommended forceStrategy applies.
  const def = await method.solve(SEXY);
  assertEquals(def.segments[0].strategyId, "alg");
  // Caller override wins.
  const overridden = await method.solve(SEXY, { stepOptions: { ll: { forceStrategy: "search" } } });
  assertEquals(overridden.segments[0].strategyId, "search");
});

// A force-mode unit whose case table cannot match must fail loudly. The runner
// used to fall through to the region's normal solving, which defeats the point of
// `force`: the mode exists for the curriculum case (ZBLL -> OCLL+PLL for someone
// who does not know full ZBLL), so quietly solving the region with the very Step
// the caller excluded hands back a solution they cannot execute and reports
// success. It also hid three real data gaps in @moishy/algsets — every solve
// still verified, so nothing surfaced until the case tables were audited.
Deno.test("a force replacement that cannot solve its region throws, never falls back", async () => {
  const steps: Step[] = [{
    id: "s",
    strategies: [{
      id: "core",
      phases: [algPhase("p", isSolved, [{
        state: scrambledLL,
        case: { id: "core", algs: [{ moves: parseAlg("U R U' R'") }] },
      }])],
    }],
  }];
  // The replacement's lookup only knows a state this solve never reaches.
  const blind: Replacement = {
    id: "blind",
    region: ["s", "s"],
    mode: "force",
    strategies: [{
      id: "blindS",
      phases: [algPhase("p", isSolved, [{
        state: st("F"),
        case: { id: "nope", algs: [{ moves: parseAlg("F'") }] },
      }])],
    }],
  };
  const method = new Method({ id: "demo", steps, replacements: [blind] });

  // Sanity: the core step alone solves this scramble, so a fallback would look
  // like success — which is exactly the failure mode being guarded.
  const baseline = await method.solve(SEXY);
  assert(baseline.solved, "core step should solve the scramble on its own");

  await assertRejects(
    () => method.solve(SEXY, { replacements: { blind: { enabled: true, mode: "force" } } }),
    SettingsError,
    "produced no solution",
  );

  // In `compete` mode the same replacement is a no-op, not an error: it simply
  // loses the race and the core steps solve the region.
  const competed = await method.solve(SEXY, {
    replacements: { blind: { enabled: true, mode: "compete" } },
  });
  assert(competed.solved, "compete mode must fall back to the core steps, not throw");
  assertEquals(competed.segments.map((s) => s.unitId), ["s"]);
});

// `compete` means "use this only if it helps", so it must be judged on the whole
// solve, not just its own region. The span DP picks the cheapest cover of the
// region and the runner then continues greedily, so a cheaper region can leave a
// dearer remainder — measured on APB before this was fixed: enabling `eoPair`
// alone made the total worse on 14 of 60 scrambles (worst +7.9).
//
// Setup: the replacement covers step "a" in 1 move where the core step needs 4,
// but it lands in a state that costs step "b" 6 moves instead of 1. Region cover
// 1 < 4, whole solve 7 > 5.
Deno.test("a compete unit that wins its region but loses the solve is not used", async () => {
  const SCRAMBLE = "U R F R' F'";
  const viaCore = st("U"); // core "a" lands here; "b" finishes in one move
  const viaRepl = st("U R F R' F' R"); // replacement lands here; "b" needs six

  const method = new Method({
    id: "demo",
    steps: [
      {
        id: "a",
        strategies: [{
          id: "aCore",
          phases: [algPhase("p", eq(viaCore), [{
            state: st(SCRAMBLE),
            case: { id: "aCore", algs: [{ moves: parseAlg("F R F' R'") }] },
          }])],
        }],
      },
      {
        id: "b",
        strategies: [{
          id: "bStep",
          phases: [algPhase("p", isSolved, [
            { state: viaCore, case: { id: "cheap", algs: [{ moves: parseAlg("U'") }] } },
            {
              state: viaRepl,
              case: { id: "dear", algs: [{ moves: parseAlg("R' F R F' R' U'") }] },
            },
          ])],
        }],
      },
    ],
    replacements: [{
      id: "shortcut",
      region: ["a", "a"],
      mode: "compete",
      strategies: [{
        id: "shortcutS",
        phases: [algPhase("p", eq(viaRepl), [{
          state: st(SCRAMBLE),
          case: { id: "shortcut", algs: [{ moves: parseAlg("R") }] },
        }])],
      }],
    }],
  });

  const off = await method.solve(SCRAMBLE);
  const forced = await method.solve(SCRAMBLE, {
    replacements: { shortcut: { enabled: true, mode: "force" } },
  });
  const competed = await method.solve(SCRAMBLE, {
    replacements: { shortcut: { enabled: true, mode: "compete" } },
  });
  assert(off.solved && forced.solved && competed.solved);

  // The premise: the replacement really is cheaper over its own region ...
  const regionCost = (r: typeof off) =>
    r.segments.filter((s) => s.unitId === "a" || s.unitId === "shortcut")
      .reduce((a, s) => a + s.cost, 0);
  assert(
    regionCost(forced) < regionCost(off) - 1e-9,
    `premise: replacement should win its region (${regionCost(forced)} vs ${regionCost(off)})`,
  );
  // ... and really does make the whole solve dearer.
  assert(
    forced.cost > off.cost + 1e-9,
    `premise: replacement should lose the solve (${forced.cost} vs ${off.cost})`,
  );

  // So compete must decline it, and match the leave-it-off solve exactly.
  assertEquals(competed.cost, off.cost);
  assert(
    !competed.segments.some((s) => s.unitId === "shortcut"),
    "compete used a unit that made the whole solve dearer",
  );
});

Deno.test("a compete unit that improves the solve is still used", async () => {
  // The mirror of the above: when the shortcut genuinely wins, compete takes it.
  const SCRAMBLE = "R U R' U'";
  const method = new Method({
    id: "demo",
    steps: [{
      id: "s",
      strategies: [{
        id: "padded",
        phases: [algPhase("p", isSolved, [{
          state: st(SCRAMBLE),
          case: { id: "padded", algs: [{ moves: parseAlg("U R U' R' D U D' U'") }] },
        }])],
      }],
    }],
    replacements: [{
      id: "short",
      region: ["s", "s"],
      mode: "compete",
      strategies: [{
        id: "shortS",
        phases: [algPhase("p", isSolved, [{
          state: st(SCRAMBLE),
          case: { id: "short", algs: [{ moves: parseAlg("U R U' R'") }] },
        }])],
      }],
    }],
  });
  const competed = await method.solve(SCRAMBLE, {
    replacements: { short: { enabled: true, mode: "compete" } },
  });
  assert(competed.solved);
  assert(
    competed.segments.some((s) => s.unitId === "short"),
    "compete declined a unit that improves the solve",
  );
});
