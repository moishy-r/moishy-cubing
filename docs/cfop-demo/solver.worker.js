// Solver worker for the /cfop-demo page.
//
// The solve is a long synchronous search — on the main thread it froze the tab
// for as long as it ran (seconds, and much longer with ZBLS forced). Here
// it runs off-thread, so the UI stays responsive and a run can be cancelled by
// terminating the worker.
//
// Pruning tables are built on first use and cached in module scope, so they
// survive across solves *in this worker* — which is why the page reuses one
// worker and only terminates it to cancel.
//
// CFOP's F2L is a single Step racing 24 pair-order strategies plus a greedy one,
// so a solve is a couple of seconds rather than milliseconds even on default
// settings. That is the cost of searching the order rather than guessing it.
//
// The settings object cannot be sent verbatim: `moveCostModel` is an object with
// a `cost` method, and structured clone drops functions. The page sends the model's
// *description* (`mcc`) instead and it is constructed here.

import {
  applyAlg,
  cfop,
  createDefaultMoveCostModel,
  formatAlg,
  isSolved,
  solvedCube,
} from "./cfop.bundle.js";

self.addEventListener("message", async (ev) => {
  const { id, scramble, settings, mcc, opts } = ev.data ?? {};
  try {
    const full = {
      ...settings,
      moveCostModel: createDefaultMoveCostModel(
        mcc?.mode === "OH" ? { mode: "OH", handedness: mcc.handedness } : { mode: "2H" },
      ),
    };
    const started = performance.now();
    const result = await cfop.solve(scramble, full, opts ?? {});
    const elapsedMs = performance.now() - started;

    // Verify in here too: it needs the cube engine, and doing it on the main
    // thread would mean importing and re-running the engine there for no reason.
    // The executable sequence is orientation + solution — the solution is expressed
    // in the colour-neutral oriented frame, so the pre-rotation applies first.
    // isSolved is rotation-invariant, so a cube left solved but held rotated passes.
    let verified = false;
    try {
      verified = isSolved(
        applyAlg(
          applyAlg(applyAlg(solvedCube(), scramble), formatAlg(result.orientation)),
          result.solutionString,
        ),
      );
    } catch {
      // Leave unverified; the page reports that distinctly from "not solved".
    }

    // `result` is plain data (arrays, numbers, {family, amount} moves), so it
    // structured-clones as-is. Pre-format the move lists the page renders, to keep
    // formatAlg (and the bundle import it needs) off the main thread entirely.
    self.postMessage({
      id,
      ok: true,
      elapsedMs,
      verified,
      solved: result.solved,
      cost: result.cost,
      moveCount: result.solution.length,
      orientation: formatAlg(result.orientation),
      solutionString: result.solutionString,
      segments: result.segments.map((seg) => ({
        unitId: seg.unitId,
        kind: seg.kind,
        strategyId: seg.strategyId,
        cost: seg.cost,
        moves: seg.moves.length ? formatAlg(seg.moves) : "—",
        alternatives: (seg.alternatives ?? []).map((a) => ({
          strategyId: a.strategyId,
          cost: a.cost,
        })),
        phases: seg.phases.map((p) => ({
          phaseId: p.phaseId,
          tag: p.kind === "algorithmic" ? (p.caseId ?? "") : "search",
          moves: p.moves.length ? formatAlg(p.moves) : "—",
        })),
      })),
    });
  } catch (e) {
    self.postMessage({ id, ok: false, message: (e && e.message) || String(e) });
  }
});

// Tell the page the module graph is parsed and the worker can accept work.
self.postMessage({ ready: true });
