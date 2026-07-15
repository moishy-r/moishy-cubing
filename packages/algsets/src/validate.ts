// validateAlgSet: the case-set validation harness.
//
// See /DESIGN.md, roadmap step 7. Recognition data is derived from each case's
// alg (see ./define.ts), so validation is about confirming that derivation is
// *sound* for solving, rather than diffing hand-stored data. It answers:
//
//   - Does each case recognize itself?  (no two cases collapse to one signature)
//   - Do the algs stay inside the move set the phase allows?  (opt-in)
//   - Is recognition still unambiguous once the phase adds AUF?  (opt-in)
//   - Does each alg actually reach the phase's goal from its own state?  (opt-in)
//
// The harness returns a structured report so a test can assert on every problem
// at once; {@link assertValidAlgSet} is the throw-on-first-failure wrapper for
// dropping straight into a `Deno.test`.

import { applyMoves, type CubeState, type Move, type MoveFamily } from "@moishy/cubing-core";
import type { AlgSet } from "./define.ts";

/** The kinds of problem the harness reports. */
export type IssueKind =
  | "empty-alg"
  | "signature-collision"
  | "disallowed-move"
  | "auf-ambiguity"
  | "goal-not-reached";

/** One problem found during validation. */
export interface ValidationIssue {
  severity: "error" | "warning";
  kind: IssueKind;
  message: string;
  /** The case the issue is attributed to, when applicable. */
  caseId?: string;
}

/** The outcome of {@link validateAlgSet}. */
export interface ValidationReport {
  /** True iff there are no `"error"`-severity issues (warnings are allowed). */
  ok: boolean;
  issues: ValidationIssue[];
}

/** Knobs for the opt-in checks. The always-on checks need no configuration. */
export interface ValidateOptions {
  /**
   * If set, every case's alg must use only these move families; any other family
   * is a `disallowed-move` error. Use to enforce e.g. a last-layer set staying
   * within `["U", "R", "F", ...]`.
   */
  allowedFamilies?: MoveFamily[];
  /**
   * The AUF families the consuming `AlgorithmicPhase` will use. If set, the
   * harness checks that no case, rotated by an AUF turn, looks like a *different*
   * case (an `auf-ambiguity` error — recognition + AUF would be non-deterministic).
   */
  auf?: MoveFamily[];
  /**
   * If set, *every* variant of each case, applied to that case's recognition
   * state, must satisfy this predicate (a `goal-not-reached` error otherwise).
   * For the primary alg under the default full-facelet signature this is
   * guaranteed by construction; its real value is confirming the *non-primary*
   * algs are genuine solutions to the same case. The data bakes any AUF into the
   * front of each alg, so a correct variant reaches the goal outright.
   */
  goal?: (state: CubeState) => boolean;
  /** Treat an empty (zero-move) alg as an error rather than a warning. */
  emptyAlgIsError?: boolean;
}

// Identity plus each family's three amounts — the AUF alignments a phase tries.
function aufMoves(families: MoveFamily[]): Move[] {
  const moves: Move[] = [];
  for (const family of families) {
    moves.push(
      { family, amount: 1 },
      { family, amount: 2 },
      { family, amount: 3 },
    );
  }
  return moves;
}

/**
 * Validates a constructed {@link AlgSet}, returning a structured report.
 *
 * Always-on checks:
 * - **empty-alg**: a case whose alg is empty (a "skip" case) — warning by default.
 * - **signature-collision**: two distinct cases share a recognition signature,
 *   so the set cannot tell them apart. Detected via self-recognition: a case
 *   that `find` does not return for its own recognition state lost a signature
 *   to an earlier case.
 *
 * Opt-in checks are enabled by the corresponding {@link ValidateOptions} field.
 */
export function validateAlgSet(algSet: AlgSet, opts: ValidateOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const allowed = opts.allowedFamilies ? new Set(opts.allowedFamilies) : null;
  const auf = opts.auf ? aufMoves(opts.auf) : null;

  for (const c of algSet.cases) {
    const state = algSet.recognitionState(c.id);
    // Label a variant in messages: bare index, or "(primary)" for algs[0].
    const variantLabel = (vi: number) => (vi === 0 ? "primary alg" : `alg #${vi + 1}`);

    c.algs.forEach((variant, vi) => {
      if (variant.moves.length === 0) {
        issues.push({
          severity: opts.emptyAlgIsError ? "error" : "warning",
          kind: "empty-alg",
          message: `case ${JSON.stringify(c.id)} has an empty ${variantLabel(vi)}`,
          caseId: c.id,
        });
      }

      if (allowed) {
        for (const move of variant.moves) {
          if (!allowed.has(move.family)) {
            issues.push({
              severity: "error",
              kind: "disallowed-move",
              message: `case ${JSON.stringify(c.id)} ${variantLabel(vi)} uses move family ${
                JSON.stringify(move.family)
              }, which is not in the allowed set`,
              caseId: c.id,
            });
            break;
          }
        }
      }

      // Every variant must reach the goal from the case's (primary-derived)
      // state. This is what verifies the non-primary algs are genuine solutions
      // to the *same* case (see /DESIGN.md, "Algset authoring"): the data bakes
      // any AUF into the front of each alg, so a variant ends fully at the goal.
      if (opts.goal && !opts.goal(applyMoves(state, variant.moves))) {
        issues.push({
          severity: "error",
          kind: "goal-not-reached",
          message: `case ${JSON.stringify(c.id)} ${variantLabel(vi)} does not reach the goal ` +
            `from its own state`,
          caseId: c.id,
        });
      }
    });

    // Self-recognition: the set must return *this* case for its own state.
    const found = algSet.find(state);
    if (found?.id !== c.id) {
      issues.push({
        severity: "error",
        kind: "signature-collision",
        message: found
          ? `case ${JSON.stringify(c.id)} shares a recognition signature with ` +
            `${JSON.stringify(found.id)} — the set cannot distinguish them`
          : `case ${JSON.stringify(c.id)} is not recognized by its own signature ` +
            `(the signature projection does not separate it)`,
        caseId: c.id,
      });
    }

    if (auf) {
      for (const move of auf) {
        const rotated = algSet.find(applyMoves(state, [move]));
        if (rotated && rotated.id !== c.id) {
          issues.push({
            severity: "error",
            kind: "auf-ambiguity",
            message: `case ${JSON.stringify(c.id)} rotated by an AUF turn is recognized as ` +
              `${JSON.stringify(rotated.id)} — recognition is ambiguous under AUF`,
            caseId: c.id,
          });
          break;
        }
      }
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/**
 * Runs {@link validateAlgSet} and throws if any `"error"`-severity issue is
 * found, with all such issues listed in the message. Drop into a `Deno.test`:
 * `assertValidAlgSet(myAlgSet, { auf: ["U"], allowedFamilies: [...] })`.
 */
export function assertValidAlgSet(algSet: AlgSet, opts: ValidateOptions = {}): void {
  const report = validateAlgSet(algSet, opts);
  if (report.ok) return;
  const errors = report.issues.filter((i) => i.severity === "error");
  const lines = errors.map((i) => `  - [${i.kind}] ${i.message}`).join("\n");
  throw new Error(
    `alg set ${
      JSON.stringify(algSet.id)
    } failed validation with ${errors.length} error(s):\n${lines}`,
  );
}
