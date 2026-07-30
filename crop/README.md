# CROP — csTimer Random Orientation Prompt

Trains solving from any starting orientation. After every solve it shows a
random **top face / front face** pair to hold the cube in for the next one.

Two front ends, one brain:

| | |
|---|---|
| `crop/extension/` | Chrome extension (MV3) that hooks the real cstimer.net |
| `docs/crop/` | standalone timer at [cubing.moishy.dev/crop/](https://cubing.moishy.dev/crop/) |

## Layout

```
crop/core/          canonical shared source — the only copy in git
crop/extension/     MV3 package        (+ generated copies of core/)
crop/tests/         four suites
docs/crop/          the public page    (+ generated copies of core/)
```

Everything in `core/` is copied into both targets by `deno task bundle:crop`,
and **every copy is gitignored**. So on a fresh clone:

```bash
deno task bundle:crop     # required before loading the extension or opening the page
```

`deno task bundle` runs it too, which is what the Pages deploy calls — the
deployed page therefore cannot run a stale core.

`crop/` is excluded from `deno fmt` and `deno lint` (see `deno.json`): it's
deliberately vanilla ES5-era JS with `chrome.*` globals, not workspace
TypeScript.

## Modes

- **Full** — all 24 orientations
- **x2y** — white or yellow on top, 4 side rotations each (8)
- **Fixed blocks** — any subset of the 24 you tick; defaults to white/orange,
  white/green, yellow/orange, yellow/green

Uniform random, repeats included, via `crypto.getRandomValues` with
modulo-bias rejection.

## Install the extension

`chrome://extensions` → Developer mode → Load unpacked → `crop/extension/`.
Run `deno task bundle:crop` first or the load will fail on a missing
`crop-core.js`.

The popup's top row reports status from the content script's heartbeat:

| It says | Meaning |
|---|---|
| `Connected to cstimer.net (#lcd) — no solves seen yet` | injected and watching |
| `3 solves detected, last 4s ago via solve counter` | working, and which trigger fired |
| `Paused — flip the switch above to resume` | master switch is off |
| `Open cstimer.net in a tab to activate` | no csTimer tab has reported in |

**Test** fires a prompt immediately without a solve. The tab also logs one line
on load: `[CROP] active — watching #lcd and #scrambleTxt, solve counter + display (timeU=n)`.

The counter increments even while paused, which separates "detection is broken"
from "you left it switched off".

---

## How solve detection works

### csTimer's DOM, verified live

```html
<table id="timer">
  <td id="container">
    <div id="lcd" class="activetimer insp">      <!-- the visible display -->
      "19."                                      <!-- text node: seconds -->
      <span>47</span>                            <!-- centiseconds -->
      <div class="insplabel"></div>               <!-- inspection countdown -->
      <div class="difflabel">(-7.24)</div>        <!-- +/- vs previous solve -->
    </div>
    <textarea id="inputTimer">                   <!-- manual-entry mode -->
    <div id="avgstr">ao12: 24.86 ao50: 24.30</div>
```

Two traps: `#timer` is a `<table>` whose subtree text includes `#avgstr`, which
mutates on every solve, so watching it gives spurious prompts — watch `#lcd`.
And `#lcd.textContent` includes `.insplabel`/`.difflabel`, so a 19.47 solve reads
as `19.4712(-7.24)` — `readTimerText()` skips those children.

### The display cannot be trusted

Options → Timer → `timeU` decides what shows *during* a solve. From csTimer's
own source:

```
P("timer","timeU",1,PROPERTY_TIMEU, ["c",["u","c","s","i","n"],...])
u(M, { u: ma,  c: ma.replace(...),  s: ma.split(".")[0],
       n: TIMER_SOLVE,  i: TIMER_SOLVE }[t("timeU")])
```

| `timeU` | during a solve | changes |
|---|---|---|
| `u` | full precision | every frame |
| `c` | centiseconds (**default**) | every frame |
| `s` | whole seconds | once a second |
| `i` | a constant string | **never** |
| `n` | a constant string | **never** |

So any change-rate detector is dead for three of five settings. Measured from a
real solve with `timeU=n`:

```
137360  keyup            timer starts
137367  #lcd -> "solve"  ...and never changes again
140369  keydown          stop
140384  #scrambleTxt and #avgstr update
140387  #lcd -> "3.00"
140415  stored solve count 11 -> 12
```

### Three triggers, one debounce

**1. The solve counter (primary).** `localStorage["properties"]` holds `session`
plus `sessionData`, a JSON *string* of `{ sessionId: { stat: [count, ...] } }`.
A content script shares the page's origin, so `stat[0]` is ground truth: one
increment per recorded solve, within ~40 ms, independent of theme, locale and
every display setting. The blob is a few KB (the times live elsewhere) and is
only reparsed when the raw string changes. Session switches rebase; deletions
(count going down) resync quietly.

**2. Placeholder → real time.** With `timeU` `i`/`n` the display holds one
digit-free string for the whole solve, then flips to `3.00`. Requiring the
*previous* text to contain no digits is what stops this firing mid-solve under
`u`/`c`, where the display is always numeric.

**3. Change rate**, for `u`/`c`: ≥4 changes in 700 ms means running; still for
380 ms and parsing as a settled time means stopped. Not colour-based — csTimer's
ready/running colours are themeable, so `rgb(0,255,0)` checks break. Plus an
accelerator: `#scrambleTxt` changing *while running* is an unambiguous stop, so
it fires without waiting out the settle window. That gate on `running` is also
why the accelerator was useless under `timeU=n` — `running` never armed.

All three feed one `fire()` behind a single 900 ms debounce, so whichever notices
first wins. In practice `u`/`c` fire via the accelerator, `s` via the counter,
`i`/`n` via the placeholder. The popup names the trigger that fired last.

### Focus safety

The whole point is that csTimer never notices the overlay:

- the wrapper is `pointer-events: none`, so clicks pass through and csTimer keeps
  window focus;
- nothing focusable is inserted — no `tabindex`, no `<button>`, no `autofocus` —
  and `.focus()` is never called;
- the dismiss listener is `passive: true`, making `preventDefault()` a structural
  no-op, and it never calls `stopPropagation()`. The same space press that clears
  the prompt reaches csTimer and starts the next inspection.

The standalone page deliberately does the opposite and *does* `preventDefault()`
space, because it owns its keyboard and must suppress scroll.

### Layout safety

`position: fixed`, `z-index: 999999 !important`, appended to `document.body`,
`contain: layout style`. Layout-critical properties carry `!important` because
csTimer ships global resets and users load custom CSS.

---

## Tests

```bash
npm i jsdom
node crop/tests/check-detector.js   # 21 — detection in all 5 timeU modes
node crop/tests/check-site.js       # 39 — the standalone timer state machine
node crop/tests/check-popup.js      # 29 — the settings popup
```

Plus `crop/tests/harness.html` (28 checks) — open it in a browser; it runs the
**shipped** `content.js` against a replica of the DOM above.

These run under node, not Deno, so `deno task ok` does not cover them. They read
`crop/core/crop-core.js` directly, so they pass before `bundle:crop` has run.

`check-detector.js` replays the `timeU=n` timeline above for every display mode,
and covers what must *not* fire: manual scramble changes, unrelated `properties`
writes, starting a solve, deleting a time, switching sessions. It runs on a real
`https` origin because `file://` can't guarantee `localStorage`.

`harness.html`'s `chrome.storage` shim is a real in-memory store that dispatches
`onChanged` — the content script's own `_status` write echoes through that
listener, and a stubbed shim would hide the resulting bug class.

### Bugs these caught

1. **Detection didn't work for most csTimer configs.** Change-rate only covers
   `u`/`c`. Found by instrumenting a live page and recording a real solve, not by
   reasoning. Fixed by making the solve counter primary.
2. `lastFireAt = 0` put every prompt in the first 900 ms of page life inside the
   duplicate-suppression window, silently swallowing it. Now `-Infinity`.
3. Trailing repaints after a stop re-armed `running` and hid the prompt that had
   just fired; the retry then hit the duplicate guard, so *no* prompt appeared.
   Fixed with a 400 ms re-arm grace period.
4. `createOverlay().show()` called `mount()`, which appended to `document.body` —
   so the popup's inline preview was re-parented out of its box and blanketed the
   whole popup, including the footer where the "Paused" warning lived. One bug
   hiding another. `mount()` now respects an existing parent.
5. The `_status` heartbeat echoed through `storage.onChanged` and was treated as
   a settings change, which hides the prompt. The listener now filters on real
   setting keys.

## Tuning

Constants at the top of `crop/extension/content.js`:

| Constant | Default | Effect |
|---|---|---|
| `CHANGE_WINDOW_MS` | 700 | window for measuring change rate |
| `RUN_THRESHOLD` | 4 | changes in that window ⇒ running |
| `SETTLE_MS` | 380 | stillness after running ⇒ stopped |
| `REFIRE_GUARD_MS` | 900 | minimum gap between prompts |
| `REARM_BLOCK_MS` | 400 | grace period before re-arming after a prompt |

`chrome.storage.local.set({debug: true})` for console tracing;
`CROP_DEBUG.demo()` / `CROP_DEBUG.state()` from the extension's context.

## Known limits

- Manual time entry increments the solve counter, so it fires a prompt too.
- Stackmat / Bluetooth input is untested, though both should record a solve
  through the normal path and trip the counter.
- Detection assumes csTimer keeps persisting session stats to
  `localStorage["properties"]`. If that moves to IndexedDB only, the two
  display-based fallbacks take over — degraded for `timeU=s`, which would then
  have no trigger. The popup would show solves firing `via display` or
  `via scramble` instead of `via solve counter`.
- The icons are generated placeholder tiles. Swap in real artwork before
  submitting to the Web Store.
