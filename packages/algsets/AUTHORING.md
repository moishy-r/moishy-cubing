# Authoring / scraping algsets — format brief

Hand this file to Cowork (or any agent). Its job: turn tables of algorithms into typed
`@moishy/algsets` case-set modules. **It only writes algs** — everything else (recognition, AUF,
cost) is derived by the engine, so there is nothing else to get right.

**Do all six pending sets in one pass** (see the Sources table below). Each is independent — same
output shape, one `index.ts` + `index_test.ts` per set — so fill them all, then run the whole
`packages/algsets/` test suite once at the end.

## The one output shape

Each set is a single file `packages/algsets/src/<set>/index.ts` that calls `defineAlgSet`:

```ts
import { type AlgSet, defineAlgSet } from "../define.ts";

export const <constName>: AlgSet = defineAlgSet({
  id: "<setId>",
  name: "<Display Name>",
  cases: [
    // A case is: { id, algs, name?, subset?, tags? }
    // `algs` is one or more interchangeable solutions. A bare string is
    // shorthand for { alg: "<string>" }; use the object form only to add
    // `source` or `checkpoints`.
    { id: "case-1", name: "Sune", subset: "someGroup", algs: [
      "R U R' U R U2 R'",
      { alg: "L' U2 L U L' U L", source: "SpeedCubeDB" },
    ] },
    { id: "case-2", algs: ["F R U R' U' F'"] },
    // ...
  ],
});
```

Rules the data must follow (the whole contract):

- **`id`** — a stable, unique, identifier-ish string per case. Reuse the source's own case names if
  it has them (e.g. `"pi-1"`, `"t-3"`); otherwise number them. Uniqueness within the set is
  enforced.
- **`algs`** — **at least one**, primary first. List every alt the source gives; more variants is
  strictly better (the solver picks the best per solve). Order doesn't matter except that `algs[0]`
  is the primary the case is _recognized_ from, so it must be a genuine, correct solution to the
  case. Duplicates are fine to drop.
- **`name`** — optional human label (`"Sune"`, `"T perm"`). Skip if the source has none.
- **`subset`** — optional grouping key **exactly as the source groups them** — this matters: some
  sets are consumed by subset (see per-set notes). Keep the source's subset labels verbatim.
- **`tags`** — optional; usually skip.
- **No `mcc`, no `auf`, no recognition/state data.** Those were dropped on purpose — cost is
  computed, AUF and recognition are derived. Do not add them.

## SiGN move notation (what an alg string may contain)

Space-separated tokens. Each token is one family letter, an optional `2` (half turn) and/or an
optional `'` (prime / counter-clockwise):

- Faces: `R L U D F B`
- Slices: `M E S`
- Wide (single lowercase letter — **not** WCA `Rw`): `r l u d f b`
- Rotations: `x y z`

So `R`, `R2`, `R'`, `r`, `M2`, `U'`, `x2` are valid; `Rw`, `2R`, `R3`, `Uw2` are not. `R2'` is
accepted and means the same as `R2`. `defineAlgSet` throws at author time on any invalid token, so a
bad scrape fails loudly rather than silently — good. Convert any non-SiGN source notation (WCA wide
`Rw` → `r`, `Uw` → `u`, etc.) during scraping.

## Every set gets a test

Alongside `index.ts`, create `packages/algsets/src/<set>/index_test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { assertValidAlgSet } from "../validate.ts";
import { <constName> } from "./index.ts";

Deno.test("<setId> is structurally valid", () => {
  assertValidAlgSet(<constName>); // valid notation, unique ids, self-recognition
});
Deno.test("<setId> has the expected case count", () => {
  assertEquals(<constName>.cases.length, <N>);
});
```

Run `deno test packages/algsets/` — it must pass. `assertValidAlgSet` with no options checks
notation, unique ids, and that no two cases collapse to the same recognition signature. (Deeper goal
checks are the method's job, not the set's.)

## The six pending sets + their sources

Fill the `cases: []` in each existing file (all already stubbed empty). Keep the `id` / `name` /
`export const` as-is. `count` is the number of cases you should end up with — set the test's count
assertion to whatever the source actually has (the numbers below are expectations, not gospel; if
your count differs, trust the source and note it).

| file (`export const`)                        | id            | source                                    | what it is                                                          | ~count |
| -------------------------------------------- | ------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------ |
| `src/coll-epll/index.ts` (`collEpll`)        | `coll`        | scrape https://speedcubedb.com/a/3x3/COLL | COLL: orient + permute LL corners in one alg (edges already EO'd)   | ~42    |
| `src/wv/index.ts` (`wv`)                     | `wv`          | scrape https://speedcubedb.com/a/3x3/WV   | Winter Variation finishing algs                                     | ~27    |
| `src/sv/index.ts` (`sv`)                     | `sv`          | scrape https://speedcubedb.com/a/3x3/SV   | Summer Variation finishing algs                                     | ~27    |
| `src/lxs-back-slot/index.ts` (`lxsBackSlot`) | `lxsBackSlot` | Google Sheet (link/xlsx) — lxsBackSlot    | LXS solved from the BR/back side (its own set, not a mirror of lxs) | ~116   |
| `src/zbls/index.ts` (`zbls`)                 | `zbls`        | Google Sheet (link/xlsx) — zbls           | ZBLS: solve last slot while orienting LL edges                      | ~300   |
| `src/eodr/index.ts` (`eodr`)                 | `eodr`        | Google Sheet (link/xlsx) — eodr           | EODR: orient all 6 remaining edges **and** place the DR edge        | TBD    |

Sheet/page handling:

- **SpeedCubeDB pages** (`coll`, `wv`, `sv`): scrape the page; each case is a named row with one or
  more algs. Keep every listed alg for a case in `algs`. Use the site's case names as `id`s
  (slugified: lowercase, spaces→`-`), and its group headings as `subset` when present.
- **Google Sheets** (`lxsBackSlot`, `zbls`, `eodr`): parse the provided file (`.xlsx`/`.csv`) or the
  shared link. Figure out which column is the case id/name and which hold algs; if a case has
  several alg columns/rows, put them all in `algs`. Preserve any grouping column as `subset`.

Not pending — already derived from existing sets, **do not author these**: `eo` and back-slot EO are
subsets of `eo-pair` (`dbr-solved-eo-(1)` and `dfr`); `ls` is the `lxs` subset where DR is already
solved; `epll` is the `pll` subset where corners are already solved; OCLL is `oll` cases 21–27.

## (Follow-up, not part of this batch) Winter/Summer Variation checkpoints on `lxs`

Filling the `wv`/`sv` sets above is all this batch needs. Separately, for the WV/SV _extra_ to
actually fire, the relevant `lxs` variants need a `checkpoint` — WV/SV splice in mid-LXS, right
before the final insert. That's an edit to the existing `lxs` set, not one of the six sets here;
leave it unless asked. For reference, the shape is a `checkpoint` marking the alg prefix up to just
before the final insert:

```ts
{ id: "lxs-42", algs: [
  { alg: "R U R' U' R U R'", checkpoints: [{ afterMoves: "R U R' U'", label: "preInsert" }] },
] }
```

`afterMoves` is the SiGN prefix executed before the checkpoint; `label` must be `"preInsert"` (what
the WV/SV extra triggers on). Only add this to `lxs` variants that have a WV/SV-recognizable state
at that point.
