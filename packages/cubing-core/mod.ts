/**
 * Cube engine and solver framework for speedsolving methods.
 *
 * Cubie-level cube state (corner/edge permutation + orientation + centre
 * orientation, so slices, wides and rotations are first-class), SiGN notation,
 * a pluggable ergonomic cost model (MCC), guided search (IDA*, A*, and a
 * near-optimal solution pool), and the Step -> Strategy -> Phase composition
 * model plus the pipeline runner that turns a method definition into a solve.
 *
 * Methods themselves are pure configuration built on top of this — see
 * `@moishy/apb` for a complete worked example.
 *
 * ```ts
 * import { applyAlg, createDefaultMoveCostModel, parseAlg, scoreAlg, solvedCube } from "@moishy/cubing-core";
 *
 * const state = applyAlg(solvedCube(), "R U R' U'");
 * scoreAlg(parseAlg("R U R' U'"), createDefaultMoveCostModel()); // 3.6
 * ```
 *
 * See /DESIGN.md in the repository for the architecture and its rationale.
 *
 * @module
 */

export const VERSION = "0.0.1";

export {
  formatAlg,
  formatMove,
  invert,
  isDouble,
  isPrime,
  type Move,
  type MoveFamily,
  NotationError,
  parseAlg,
  parseMove,
} from "./src/notation.ts";

export {
  applyAlg,
  applyMove,
  applyMoves,
  cloneState,
  compose,
  type CubeState,
  homingRotation,
  isSolved,
  normalizeOrientation,
  SOLVED,
  solvedCube,
  statesEqual,
  toFacelets,
} from "./src/cube-state.ts";

export {
  createBlockCostModel,
  createDefaultMoveCostModel,
  type DefaultMoveCostOptions,
  type MccMode,
  type MoveCostContext,
  type MoveCostModel,
  type OhHandedness,
  scoreAlg,
} from "./src/move-cost.ts";

export {
  movesFromFamilies,
  search,
  searchAStar,
  searchAStarMany,
  type SearchAStarManyParams,
  searchMany,
  type SearchManyParams,
  type SearchParams,
  type SearchResult,
} from "./src/search.ts";

export {
  type AlgCase,
  type AlgorithmicPhase,
  type AlgVariant,
  type CaseLookup,
  type Checkpoint,
  type Phase,
  type PhaseCandidateOptions,
  type PhaseKind,
  type PhaseSegment,
  runPhase,
  runPhaseCandidates,
  type SearchPhase,
  type SolveContext,
  type Step,
  type Strategy,
} from "./src/step.ts";

export {
  allOrientations,
  type BoundaryTrigger,
  type CheckpointTrigger,
  type ColorNeutrality,
  type Extra,
  type ExtraContext,
  type ExtraTrigger,
  type LookaheadOptions,
  Method,
  type MethodDefaults,
  type MethodDefinition,
  type PhaseChainingOptions,
  type Region,
  type Replacement,
  type ReplacementOptions,
  SettingsError,
  type SolveOptions,
  type SolveResult,
  type SolverSettings,
  type SolveSegment,
  type StepOptions,
} from "./src/method.ts";
