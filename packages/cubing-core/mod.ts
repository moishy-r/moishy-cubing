// @moishy/cubing-core
//
// Core cube engine: cubie-level state representation, move application,
// the Step -> Strategy -> Phase composition model, the generic IDA*-style
// search engine, the pluggable MoveCostModel (MCC) scorer, and the solver
// pipeline runner.
//
// Implementation is in progress. See /DESIGN.md at the repo root for the
// architecture this package is built against.

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
  isSolved,
  SOLVED,
  solvedCube,
  statesEqual,
  toFacelets,
} from "./src/cube-state.ts";

export {
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
