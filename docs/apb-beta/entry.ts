// Browser entry for the /apb-beta demo. Re-exports the minimal API the page
// needs; bundled to apb.bundle.js via `deno bundle` (see BUILD comment in HTML).
export { apb } from "@moishy/apb";
export { applyAlg, formatAlg, isSolved, solvedCube } from "@moishy/cubing-core";
