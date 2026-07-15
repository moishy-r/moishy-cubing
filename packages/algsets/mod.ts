// @moishy/algsets
//
// Algorithm case data, authored as typed TS modules via defineAlgSet().
// Each case-set (zbll, ocll, pll, apb-2x2x3-527, ...) will live under
// ./src/<set-id>/ and get its own subpath export once real data lands,
// e.g. "@moishy/algsets/zbll", so consumers can import only what they need.
//
// This module ships the authoring + validation machinery (roadmap step 7):
//   - defineAlgSet — build a case-set from algs; recognition is derived from
//     each alg, never hand-stored (see /DESIGN.md, roadmap step 7).
//   - validateAlgSet / assertValidAlgSet — the test-time validation harness.
//
// See /DESIGN.md at the repo root for the case/data schema.

export const VERSION = "0.0.1";

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
