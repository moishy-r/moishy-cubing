// Browser entry for the /apb-demo page. Re-exports the minimal API the page
// needs; bundled to apb.bundle.js via `deno bundle` (see BUILD comment in HTML).
// `apbDefinition` is exported so the options form can be generated from the
// method itself — guaranteeing every step / strategy / replacement / extra /
// recommended-setting is represented, and stays in sync with the library.
export { apb, apbDefinition } from "@moishy/apb";
export {
  applyAlg,
  createDefaultMoveCostModel,
  formatAlg,
  isSolved,
  parseAlg,
  solvedCube,
} from "@moishy/cubing-core";
