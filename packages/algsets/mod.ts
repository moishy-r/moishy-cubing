/**
 * Algorithm case data, authored as typed TypeScript modules.
 *
 * A case stores **only its algorithms**: recognition is derived by applying the
 * primary alg to a solved cube and inverting, never hand-written, so it cannot
 * drift out of sync with the algs. Cost and AUF are computed too — authoring a
 * set means transcribing algs and nothing else.
 *
 * This entrypoint ships the authoring and validation machinery. The data lives
 * behind subpath exports so consumers import only what they need:
 * `@moishy/algsets/zbll`, `/pll`, `/oll`, `/dfdb`, and a dozen more (see the
 * package README for the full list).
 *
 * ```ts
 * import { pll } from "@moishy/algsets/pll";
 * pll.byId("t-perm")?.algs[0].moves;
 * ```
 *
 * Each `AlgSet` implements `CaseLookup`, so it drops straight into an
 * `AlgorithmicPhase`. Authoring guide: AUTHORING.md; schema rationale: /DESIGN.md.
 *
 * @module
 */

export const VERSION = "0.2.0";

export {
  type AlgCaseInput,
  type AlgSet,
  AlgSetError,
  type AlgSetInput,
  type AlgVariantInput,
  type CheckpointInput,
  defineAlgSet,
  type DefinedAlgCase,
  type StateSignature,
} from "./src/define.ts";

export {
  assertValidAlgSet,
  type IssueKind,
  validateAlgSet,
  type ValidateOptions,
  type ValidationIssue,
  type ValidationReport,
} from "./src/validate.ts";
