// scripts/build_npm.ts
//
// Builds an npm-publishable dist for a single workspace package using dnt.
// Run from inside a package directory, e.g.:
//   cd packages/cubing-core && deno run -A ../../scripts/build_npm.ts 0.1.0
//
// Everything except the version is read from that package's own deno.json, so
// the manifest stays the single source of truth (see /DESIGN.md). The version is
// passed in because the release workflow already knows it, and passing it keeps
// this script usable for one-off local builds at an arbitrary version.

import { build, emptyDir } from "@deno/dnt";

const version = Deno.args[0];
if (!version) {
  console.error("Usage: build_npm.ts <version>");
  Deno.exit(1);
}

interface Manifest {
  name: string;
  license?: string;
  description?: string;
  exports: string | Record<string, string>;
  imports?: Record<string, string>;
}

const manifest: Manifest = JSON.parse(await Deno.readTextFile("./deno.json"));

// Every subpath export must become a dnt entry point, or the npm package silently
// exposes only its root while the JSR one exposes fifteen. dnt names the root
// entry "." and mirrors the rest into package.json `exports`.
const entryPoints = typeof manifest.exports === "string"
  ? [{ name: ".", path: manifest.exports }]
  : Object.entries(manifest.exports).map(([name, path]) => ({ name, path }));

// Workspace dependencies are declared as `jsr:@moishy/x@^1.2.3`, which dnt emits
// as a bare `@moishy/x` import — correct, but only if package.json actually
// depends on it. Without this the published package installs and then throws
// "Cannot find module" on first require.
const dependencies: Record<string, string> = {};
for (const [bare, specifier] of Object.entries(manifest.imports ?? {})) {
  const jsr = specifier.match(/^jsr:(@[^/]+\/[^@]+)@(.+)$/);
  if (!jsr) continue; // npm: specifiers are dnt's job; anything else is a local path
  const [, pkg, range] = jsr;
  if (pkg !== bare) {
    throw new Error(`build_npm: import alias ${bare} != package ${pkg}; unsupported`);
  }
  if (!pkg.startsWith("@moishy/")) {
    throw new Error(
      `build_npm: ${bare} resolves to ${specifier}; a non-@moishy jsr: dependency has no ` +
        `npm equivalent. Add an explicit dnt mapping before publishing.`,
    );
  }
  // Our own packages publish to npm under the same name, so the range carries over.
  dependencies[pkg] = range;
}

await emptyDir("./npm");

await build({
  entryPoints,
  outDir: "./npm",
  shims: { deno: false },
  test: false,
  // Workspace-linked JSR specifiers aren't resolvable standalone; the release
  // workflow runs `deno task ok` (which type-checks) before reaching this step.
  typeCheck: false,
  // dnt's `npm install` exists to support its own type-check/test run, both off
  // above. Leaving it on breaks the bootstrap case: building @moishy/algsets
  // fetches @moishy/cubing-core from npm, which 404s until that package's very
  // first npm release. `npm publish` needs no node_modules.
  skipNpmInstall: true,
  package: {
    name: manifest.name,
    version,
    license: manifest.license ?? "MIT",
    description: manifest.description,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    repository: {
      type: "git",
      url: "git+https://github.com/moishy-r/moishy-cubing.git",
    },
    bugs: { url: "https://github.com/moishy-r/moishy-cubing/issues" },
    homepage: "https://github.com/moishy-r/moishy-cubing",
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

console.log(
  `built ${manifest.name}@${version} · ${entryPoints.length} entry point(s) · ` +
    `${Object.keys(dependencies).length} workspace dep(s)`,
);
