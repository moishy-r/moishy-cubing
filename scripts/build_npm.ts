// scripts/build_npm.ts
//
// Builds an npm-publishable dist for a single package using dnt.
// Run from inside a package directory, e.g.:
//   cd packages/cubing-core && deno run -A ../../scripts/build_npm.ts 0.1.0
//
// Reads name/exports/license from that package's local deno.json and just
// overlays the version passed on the command line (kept as the single
// source of truth on the JSR side, see /DESIGN.md).

import { build, emptyDir } from "jsr:@deno/dnt@^0.41";

const version = Deno.args[0];
if (!version) {
  console.error("Usage: build_npm.ts <version>");
  Deno.exit(1);
}

const manifest = JSON.parse(await Deno.readTextFile("./deno.json"));
const npmName = manifest.name.replace(/^@/, "").replace("/", "__"); // fallback, unused if manifest.name is npm-safe

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
      url: "git+https://github.com/moishy/moishy-cubing.git",
    },
  },
  postBuild() {
    try {
      Deno.copyFileSync("../../LICENSE", "npm/LICENSE");
    } catch {
      // LICENSE not present yet, fine for early dev builds
    }
    try {
      Deno.copyFileSync("./README.md", "npm/README.md");
    } catch {
      // per-package README not written yet
    }
  },
});
