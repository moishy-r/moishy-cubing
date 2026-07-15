# moishy-cubing

A TypeScript toolkit for building Rubik's cube speedsolving-method solvers (CFOP, Roux, ZZ, APB,
...), runnable on Deno or Node, published to JSR and npm.

## Packages

| Package                                         | Description                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| [`@moishy/cubing-core`](./packages/cubing-core) | Cube engine, base classes, generic search, MCC scoring, solver pipeline |
| [`@moishy/algsets`](./packages/algsets)         | Algorithm case data                                                     |
| [`@moishy/apb`](./packages/apb)                 | APB method plugin (reference implementation for adding new methods)     |

See [`DESIGN.md`](./DESIGN.md) for the full architecture spec.

## Development

```sh
deno task check   # type-check every package
deno task test     # run tests across the workspace
deno task fmt      # format
deno task lint     # lint
```

## Releasing

Each package publishes independently. Bump the `version` field in the package's `deno.json`, merge,
then push a tag `<package-dir>-v<version>` (e.g. `cubing-core-v0.1.0`) to trigger
`.github/workflows/release.yml`, which publishes to both JSR and npm.
