// defineAlgSet: the authoring helper for a case-set.
//
// See /DESIGN.md, roadmap step 7. The governing idea is that a case's
// *recognition data is derived from its alg*, never hand-stored: the state a
// case solves is exactly the solved cube run through the inverse of that case's
// alg (`applyMoves(solved, invert(alg))`). Authors write only the alg (plus
// metadata); recognition falls out of it, and the validation harness
// (./validate.ts) checks the derivation holds.
//
// The returned {@link AlgSet} implements `CaseLookup` from @moishy/cubing-core,
// so it can be handed directly to an `AlgorithmicPhase`'s `cases` field. The
// phase runner (`runPhase`) supplies AUF alignment on top, so recognition only
// needs to match a single orientation — an exact projection is enough.

import {
  type AlgCase,
  type AlgVariant,
  applyMoves,
  type CaseLookup,
  cloneState,
  type CubeState,
  invert,
  parseAlg,
  solvedCube,
  toFacelets,
} from "@moishy/cubing-core";

/** Thrown by {@link defineAlgSet} when a definition is structurally malformed. */
export class AlgSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlgSetError";
  }
}

/**
 * Authoring form of a single alg variant: a SiGN-notation alg string plus
 * optional provenance/cost metadata. The bare-string form (just the alg) is
 * sugar for `{ alg }`.
 */
/**
 * Authoring form of a checkpoint: a SiGN prefix of the alg (`afterMoves`) marking
 * where the split sits, plus its `label`. `defineAlgSet` converts `afterMoves`
 * into the core {@link Checkpoint}'s numeric `index` (its move count). See
 * /DESIGN.md ("Extras", "Algset schema").
 */
export interface CheckpointInput {
  /** The alg prefix executed before this checkpoint, in SiGN notation. */
  afterMoves: string;
  label: string;
}

export interface AlgVariantInput {
  /** The solving algorithm, in SiGN notation. Parsed eagerly (throws on bad notation). */
  alg: string;
  /** Attribution (e.g. `"SpeedCubeDB"`). */
  source?: string;
  /** Named split points within this alg, for mid-alg Extras. See DESIGN "Extras". */
  checkpoints?: CheckpointInput[];
}

/**
 * Authoring form of a single case: one or more interchangeable algs (each a
 * bare SiGN string or an {@link AlgVariantInput}) plus optional metadata. Only
 * `algs[0]` drives recognition — the state a case solves is derived from the
 * *primary* alg (see module header); the validation harness checks the rest
 * solve the same state.
 */
export interface AlgCaseInput {
  id: string;
  /** Interchangeable solving algs, primary first. Non-empty. */
  algs: (string | AlgVariantInput)[];
  /** Human-facing label (e.g. `"Sune"`). Optional; ids are the machine key. */
  name?: string;
  /** Subset/group this case belongs to within the set (e.g. OLL `"dot"`, ZBLL `"t"`). */
  subset?: string;
  tags?: string[];
}

/**
 * Projects a cube state to a recognition signature: two states with the same
 * signature are treated as the same case. Defaults to the full facelet string
 * ({@link toFacelets}) — whole-cube exact match, which is correct when the
 * phases before this one have already solved everything the alg doesn't touch.
 * Supply a narrower projection to recognize only a sub-region of the cube.
 */
export type StateSignature = (state: CubeState) => string;

/** Authoring form of a whole case-set. */
export interface AlgSetInput {
  id: string;
  name?: string;
  cases: AlgCaseInput[];
  /** Recognition projection. Defaults to full-facelet exact match. */
  signature?: StateSignature;
}

/** A parsed case: {@link AlgCase} from core, plus optional author-facing metadata. */
export interface DefinedAlgCase extends AlgCase {
  name?: string;
  subset?: string;
}

/**
 * A constructed case-set. Implements `CaseLookup`, so it drops straight into an
 * `AlgorithmicPhase`'s `cases`. Also exposes the parsed cases, id lookup, and
 * each case's derived recognition state for the validation harness.
 */
export interface AlgSet extends CaseLookup {
  readonly id: string;
  readonly name?: string;
  /** Parsed cases, in authoring order. */
  readonly cases: readonly DefinedAlgCase[];
  /** The recognition projection actually in use (the default, or the author's). */
  readonly signature: StateSignature;
  /** A case by id, or `undefined`. */
  get(caseId: string): DefinedAlgCase | undefined;
  /**
   * The state a case's alg solves — derived as `solved · invert(alg)`. Returns a
   * fresh copy. Throws {@link AlgSetError} for an unknown id.
   */
  recognitionState(caseId: string): CubeState;
  /** `CaseLookup`: recognize a state (exact, up to the consuming phase's AUF). */
  find(state: CubeState): DefinedAlgCase | null;
}

/**
 * Builds an {@link AlgSet} from an authoring definition.
 *
 * Eager and strict about *structural* validity — it parses every alg (throwing
 * {@link import("@moishy/cubing-core").NotationError} on bad notation) and
 * rejects duplicate case ids. It does **not** check *semantic* validity
 * (recognition ambiguity, move constraints, AUF collisions); that is the job of
 * {@link import("./validate.ts").validateAlgSet}, run from the set's tests. On
 * a signature collision the first-defined case wins recognition and the harness
 * flags the rest.
 */
export function defineAlgSet(input: AlgSetInput): AlgSet {
  const signature = input.signature ?? toFacelets;
  const cases: DefinedAlgCase[] = [];
  const byId = new Map<string, DefinedAlgCase>();
  const recognition = new Map<string, CubeState>();
  const bySignature = new Map<string, DefinedAlgCase>();

  for (const c of input.cases) {
    if (byId.has(c.id)) {
      throw new AlgSetError(
        `duplicate case id ${JSON.stringify(c.id)} in alg set ${JSON.stringify(input.id)}`,
      );
    }
    if (c.algs.length === 0) {
      throw new AlgSetError(
        `case ${JSON.stringify(c.id)} in alg set ${JSON.stringify(input.id)} has no algs`,
      );
    }
    // Parse every variant eagerly — NotationError on bad notation fails authoring.
    const algs: AlgVariant[] = c.algs.map((v) => {
      const raw = typeof v === "string" ? { alg: v } : v;
      const variant: AlgVariant = { moves: parseAlg(raw.alg) };
      if (raw.source !== undefined) variant.source = raw.source;
      if (raw.checkpoints) {
        // afterMoves (a SiGN prefix) → the core Checkpoint's numeric index.
        variant.checkpoints = raw.checkpoints.map((c) => ({
          label: c.label,
          index: parseAlg(c.afterMoves).length,
        }));
      }
      return variant;
    });
    const parsed: DefinedAlgCase = { id: c.id, algs };
    if (c.name !== undefined) parsed.name = c.name;
    if (c.subset !== undefined) parsed.subset = c.subset;
    if (c.tags) parsed.tags = c.tags;

    // Recognition derives from the primary alg only (algs[0]); the harness
    // verifies the other variants solve the same state.
    const state = applyMoves(solvedCube(), invert(algs[0].moves));
    cases.push(parsed);
    byId.set(c.id, parsed);
    recognition.set(c.id, state);
    // First-defined case wins a signature; collisions are reported by validateAlgSet.
    const sig = signature(state);
    if (!bySignature.has(sig)) bySignature.set(sig, parsed);
  }

  return {
    id: input.id,
    name: input.name,
    cases,
    signature,
    get: (id) => byId.get(id),
    recognitionState(id) {
      const s = recognition.get(id);
      if (!s) {
        throw new AlgSetError(
          `no case with id ${JSON.stringify(id)} in alg set ${JSON.stringify(input.id)}`,
        );
      }
      return cloneState(s);
    },
    find: (state) => bySignature.get(signature(state)) ?? null,
  };
}
