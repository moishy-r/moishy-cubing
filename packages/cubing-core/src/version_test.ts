// Each package exports a `VERSION` constant that duplicates the `version` field
// in its deno.json — the one the registry actually publishes. Nothing keeps the
// two in step, and a release bump touches the manifest, so the constant is the
// half that silently rots. This asserts they agree for every workspace member,
// and doubles as a guard that inter-package dependency ranges still admit the
// versions being published: `^0.0.1` means `>=0.0.1 <0.0.2`, so a 0.x bump that
// updates only the `version` fields would leave dependents pinned to a version
// that no longer exists.

import { assertEquals } from "@std/assert";
import { VERSION as CORE } from "../mod.ts";
import { VERSION as ALGSETS } from "../../algsets/mod.ts";
import { VERSION as STEPS } from "../../steps/mod.ts";
import { VERSION as APB } from "../../apb/mod.ts";
import { VERSION as CFOP } from "../../cfop/mod.ts";

const read = async (pkg: string) =>
  JSON.parse(await Deno.readTextFile(new URL(`../../${pkg}/deno.json`, import.meta.url)));

const PACKAGES: [name: string, exported: string][] = [
  ["cubing-core", CORE],
  ["algsets", ALGSETS],
  ["steps", STEPS],
  ["apb", APB],
  ["cfop", CFOP],
];

Deno.test("each package's exported VERSION matches its deno.json", async () => {
  for (const [pkg, exported] of PACKAGES) {
    const manifest = await read(pkg);
    assertEquals(
      exported,
      manifest.version,
      `${pkg}: exported VERSION "${exported}" != deno.json "${manifest.version}" — bump both`,
    );
  }
});

Deno.test("workspace dependency ranges admit the versions being published", async () => {
  const versions = new Map<string, string>();
  for (const [pkg] of PACKAGES) versions.set(`@moishy/${pkg}`, (await read(pkg)).version);

  for (const [pkg] of PACKAGES) {
    const imports: Record<string, string> = (await read(pkg)).imports ?? {};
    for (const [dep, specifier] of Object.entries(imports)) {
      const published = versions.get(dep);
      if (published === undefined) continue; // an external dep, not ours
      const range = specifier.replace(/^jsr:.*@\^?/, "");
      // Caret semantics on 0.x: ^0.a.b admits only 0.a.* — so the minor must match.
      const [rMajor, rMinor] = range.split(".");
      const [pMajor, pMinor] = published.split(".");
      assertEquals(
        `${rMajor}.${rMinor}`,
        `${pMajor}.${pMinor}`,
        `${pkg} depends on ${dep}@${specifier}, which cannot resolve to the ` +
          `${published} being published — update the range alongside the version`,
      );
    }
  }
});
