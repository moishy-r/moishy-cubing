// scripts/build_npm.ts
//
// Builds an npm-publishable dist for a single package using dnt.
// Run from inside a package directory, e.g.:
//   cd packages/cubing-core && deno run -A ../../scripts/build_npm.ts 0.1.0
//
// Reads name/exports/license from that package's local deno.json and just
// overlays the version passed on the command line (kept as the single
// source of truth on the JSR side, see /DESIGN.md).

import { build, emptyDir } from "@deno/dnt";

const version = Deno.args[0];
if (!version) {
  console.error("Usage: build_npm.ts <version>");
  Deno.exit(1);
}

const manifest = JSON.parse(await Deno.readTextFile("./deno.json"));

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: { deno: false },
  test: false,
  typeCheck: false, // workspace-linked JSR specifiers aren't resolvable standalone; CI runs `deno check` separately before this step
  package: {
    name: manifest.name,
    version,
    license: manifest.license ?? "MIT",
    description: manifest.description,
    repository: {
      type: "git",
      url: "git+https://github.com/moishy-r/moishy-cubing.git",
    },
  },
  postBuild() {
    try {
      Deno.copyFileSync("../../LICENSE", "npm/LICENSE");
    } catch {
      // Repo-root LICENSE — only absent if this is run outside the workspace.
    }
    try {
      Deno.copyFileSync("./README.md", "npm/README.md");
    } catch {
      // Per-package README — every published package has one; guard is belt-and-braces.
    }
  },
});
