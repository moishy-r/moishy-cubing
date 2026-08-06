// Browser entry for the /cfop-demo page. Re-exports the minimal API the page
// needs; bundled to cfop.bundle.js via `deno bundle` (see BUILD comment in HTML).
// `cfopDefinition` is exported so the options form can be generated from the
// method itself — guaranteeing every step / strategy / replacement / extra /
// recommended-setting is represented, and stays in sync with the library.
export { cfop, cfopDefinition } from "@moishy/cfop";
export {
  applyAlg,
  createDefaultMoveCostModel,
  formatAlg,
  isSolved,
  parseAlg,
  solvedCube,
} from "@moishy/cubing-core";
