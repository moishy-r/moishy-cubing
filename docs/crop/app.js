/* ============================================================================
 * CROP — standalone timer (GitHub Pages build)
 *
 * Same orientation prompt as the extension, driven by a local timer instead of
 * by observing csTimer.
 *
 * State machine
 *   idle    --space down-->  hold  (red)
 *   hold    --after holdMs-> ready (green)
 *   hold    --space up---->  idle            (released too early, no start)
 *   ready   --space up---->  inspect | run
 *   inspect --space down-->  ihold (red) --after holdMs--> iready (green)
 *   iready  --space up---->  run
 *   run     --any key down-> idle  (record, then show the orientation prompt)
 *   any     --escape------->  idle  (abort, nothing recorded)
 *
 * The keydown that stops the timer is the one that shows the prompt; the NEXT
 * keydown dismisses it and simultaneously begins the next hold, so the loop
 * never needs an extra key press.
 *
 * NOTE ON preventDefault: this page owns its keyboard, so it suppresses the
 * space bar's default scroll. The extension does the exact opposite — it must
 * never preventDefault, because csTimer needs to receive that key.
 * ==========================================================================*/
(function () {
  'use strict';

  var CROP = globalThis.CROP;

  var HOLD_MS = 300;          // hold before the timer arms (turns green)
  var STORE_SETTINGS = 'crop.settings.v1';
  var STORE_TIMES = 'crop.times.v1';

  /* ---- elements ---------------------------------------------------------- */

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    lcd: $('lcd'), cue: $('cue'), scramble: $('scramble'),
    stCount: $('stCount'), stBest: $('stBest'), stAo5: $('stAo5'), stAo12: $('stAo12'),
    panel: $('panel'), btnPanel: $('btnPanel'), btnClose: $('btnClose'),
    modes: $('modes'), fixedWrap: $('fixedWrap'), picker: $('picker'),
    positions: $('positions'), inspection: $('inspection'),
    optEnabled: $('optEnabled'), optScramble: $('optScramble'),
    poolCount: $('poolCount'),
    btnDefault: $('btnDefault'), btnNone: $('btnNone'), btnReset: $('btnReset')
  };

  /* ---- storage ----------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var stored = readJSON(STORE_SETTINGS, null) || {};
  var settings = CROP.normalizeSettings(stored);
  settings.inspection = (stored.inspection === 15) ? 15 : 0;
  settings.showScramble = stored.showScramble === undefined ? true : !!stored.showScramble;
  if (Array.isArray(stored.fixedPairs) && stored.fixedPairs.length === 0) settings.fixedPairs = [];

  var times = readJSON(STORE_TIMES, []);
  if (!Array.isArray(times)) times = [];

  function saveSettings() {
    writeJSON(STORE_SETTINGS, settings);
    render();
  }

  /* ---- scramble ---------------------------------------------------------- */

  var FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  var AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  var SUFFIX = ['', "'", '2'];

  function newScramble(len) {
    len = len || 20;
    var out = [], prev = null, prev2 = null;
    while (out.length < len) {
      var f = FACES[CROP.randomIndex(6)];
      if (f === prev) continue;                                  // no R R
      if (prev2 && AXIS[f] === AXIS[prev] && AXIS[f] === AXIS[prev2]) continue;  // no R L R
      out.push(f + SUFFIX[CROP.randomIndex(3)]);
      prev2 = prev; prev = f;
    }
    return out.join(' ');
  }

  function refreshScramble() {
    el.scramble.textContent = settings.showScramble ? newScramble(20) : '';
    el.scramble.hidden = !settings.showScramble;
  }

  /* ---- formatting -------------------------------------------------------- */

  function fmt(ms) {
    if (ms == null) return '—';
    var total = Math.floor(ms / 10) / 100;          // truncate, cubing convention
    var mins = Math.floor(total / 60);
    var secs = total - mins * 60;
    if (mins > 0) return mins + ':' + (secs < 10 ? '0' : '') + secs.toFixed(2);
    return secs.toFixed(2);
  }

  /* ---- stats ------------------------------------------------------------- */

  function averageOf(n) {
    if (times.length < n) return null;
    var slice = times.slice(-n).slice();
    slice.sort(function (a, b) { return a - b; });
    var trimmed = slice.slice(1, slice.length - 1);   // drop best and worst
    var sum = trimmed.reduce(function (a, b) { return a + b; }, 0);
    return sum / trimmed.length;
  }

  function renderStats() {
    el.stCount.textContent = String(times.length);
    el.stBest.textContent = times.length ? fmt(Math.min.apply(null, times)) : '—';
    el.stAo5.textContent = fmt(averageOf(5));
    el.stAo12.textContent = fmt(averageOf(12));
  }

  /* ---- overlay ----------------------------------------------------------- */

  var overlay = CROP.createOverlay(document);

  function showPrompt() {
    if (!settings.enabled) return;
    var o = CROP.pick(settings);
    if (o) overlay.show(o, settings.position, settings.autoHideMs);
  }

  /* ---- timer state machine ---------------------------------------------- */

  var state = 'idle';
  var holdTimer = null;
  var rafId = null;
  var startAt = 0;
  var inspectAt = 0;
  var lastResult = null;

  var CUES = {
    idle:    'Hold <kbd>space</kbd> to start',
    hold:    'keep holding…',
    ready:   'release to go',
    inspect: 'inspecting — hold <kbd>space</kbd> when ready',
    ihold:   'keep holding…',
    iready:  'release to go',
    run:     'press any key to stop'
  };

  function setState(s) {
    state = s;
    el.lcd.dataset.state = s;
    el.cue.innerHTML = CUES[s] || '';
  }

  function paintLcd(text) { el.lcd.textContent = text; }

  function clearHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  }

  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function beginHold(next) {
    clearHold();
    setState(next === 'run' ? 'hold' : 'ihold');
    paintLcd(next === 'run' ? fmt(0) : el.lcd.textContent);
    if (next === 'run') paintLcd('0.00');
    holdTimer = setTimeout(function () {
      holdTimer = null;
      setState(next === 'run' ? 'ready' : 'iready');
    }, HOLD_MS);
  }

  function startInspection() {
    inspectAt = performance.now();
    setState('inspect');
    (function loop() {
      if (state !== 'inspect' && state !== 'ihold' && state !== 'iready') return;
      var elapsed = (performance.now() - inspectAt) / 1000;
      var left = Math.ceil(15 - elapsed);
      if (elapsed > 17) paintLcd('DNF');
      else if (elapsed > 15) paintLcd('+2');
      else paintLcd(String(Math.max(left, 1)));
      rafId = requestAnimationFrame(loop);
    })();
  }

  function startRun() {
    stopRaf();
    startAt = performance.now();
    setState('run');
    (function loop() {
      if (state !== 'run') return;
      paintLcd(fmt(performance.now() - startAt));
      rafId = requestAnimationFrame(loop);
    })();
  }

  function stopRun() {
    stopRaf();
    var ms = performance.now() - startAt;
    lastResult = ms;
    paintLcd(fmt(ms));
    times.push(ms);
    writeJSON(STORE_TIMES, times);
    renderStats();
    setState('idle');
    refreshScramble();
    showPrompt();          // the prompt appears on this keydown…
  }

  function abort() {
    clearHold();
    stopRaf();
    setState('idle');
    paintLcd(lastResult == null ? '0.00' : fmt(lastResult));
  }

  /* ---- keyboard ---------------------------------------------------------- */

  function isSpace(e) { return e.code === 'Space' || e.key === ' ' || e.keyCode === 32; }
  function inField(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                 t.tagName === 'BUTTON' || t.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { overlay.hide(); abort(); return; }
    if (inField(e) && state === 'idle') return;   // let the settings panel work
    if (e.repeat) { if (isSpace(e)) e.preventDefault(); return; }

    if (state === 'run') {
      e.preventDefault();
      stopRun();
      return;
    }

    if (!isSpace(e)) return;
    e.preventDefault();

    // …and this keydown clears it, while also starting the next hold.
    overlay.hide();

    if (state === 'idle') beginHold('run');
    else if (state === 'inspect') beginHold('inspect');
  });

  document.addEventListener('keyup', function (e) {
    if (!isSpace(e)) return;
    if (inField(e) && state === 'idle') return;
    e.preventDefault();

    if (state === 'ready') {
      clearHold();
      if (settings.inspection === 15) startInspection(); else startRun();
    } else if (state === 'iready') {
      clearHold();
      startRun();
    } else if (state === 'hold') {          // released before it armed
      clearHold();
      setState('idle');
      paintLcd(lastResult == null ? '0.00' : fmt(lastResult));
    } else if (state === 'ihold') {
      clearHold();
      setState('inspect');
    }
  });

  /* Touch: tapping the timer area behaves like the space bar. */
  el.lcd.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (state === 'run') { stopRun(); return; }
    overlay.hide();
    if (state === 'idle') beginHold('run');
    else if (state === 'inspect') beginHold('inspect');
  });
  el.lcd.addEventListener('pointerup', function () {
    if (state === 'ready') { clearHold(); if (settings.inspection === 15) startInspection(); else startRun(); }
    else if (state === 'iready') { clearHold(); startRun(); }
    else if (state === 'hold') { clearHold(); setState('idle'); paintLcd(lastResult == null ? '0.00' : fmt(lastResult)); }
    else if (state === 'ihold') { clearHold(); setState('inspect'); }
  });

  /* ---- settings UI ------------------------------------------------------- */

  ['full', 'x2y', 'fixed'].forEach(function (key) {
    var m = CROP.MODES[key];
    var row = document.createElement('label');
    row.className = 'mode';
    row.dataset.mode = key;
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'mode'; input.value = key;
    var txt = document.createElement('div');
    var name = document.createElement('div'); name.className = 'name'; name.textContent = m.label;
    var blurb = document.createElement('div'); blurb.className = 'blurb'; blurb.textContent = m.blurb;
    txt.appendChild(name); txt.appendChild(blurb);
    row.appendChild(input); row.appendChild(txt);
    el.modes.appendChild(row);
    input.addEventListener('change', function () {
      if (input.checked) { settings.mode = key; saveSettings(); }
    });
  });

  function seg(container, items, get, set) {
    items.forEach(function (it) {
      var lab = document.createElement('label');
      lab.dataset.val = String(it.value);
      var input = document.createElement('input');
      input.type = 'radio'; input.name = container.id;
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(it.label));
      container.appendChild(lab);
      input.addEventListener('change', function () {
        if (input.checked) { set(it.value); saveSettings(); }
      });
    });
    container.__get = get;
  }

  seg(el.positions,
      CROP.POSITIONS.map(function (p) { return { value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }; }),
      function () { return settings.position; },
      function (v) { settings.position = v; });

  seg(el.inspection,
      [{ value: 0, label: 'None' }, { value: 15, label: '15 s' }],
      function () { return settings.inspection; },
      function (v) { settings.inspection = v; });

  var picker = CROP.renderPairPicker(el.picker, settings.fixedPairs, function (pairs) {
    settings.fixedPairs = pairs;
    saveSettings();
  });

  el.btnDefault.addEventListener('click', function () { picker.setPairs(CROP.DEFAULT_FIXED_PAIRS); });
  el.btnNone.addEventListener('click', function () { picker.setAll(false); });

  el.optEnabled.addEventListener('change', function () {
    settings.enabled = el.optEnabled.checked; saveSettings();
  });
  el.optScramble.addEventListener('change', function () {
    settings.showScramble = el.optScramble.checked; saveSettings(); refreshScramble();
  });

  el.btnReset.addEventListener('click', function () {
    times = [];
    writeJSON(STORE_TIMES, times);
    lastResult = null;
    paintLcd('0.00');
    renderStats();
  });

  function togglePanel(open) {
    el.panel.hidden = !open;
    el.btnPanel.setAttribute('aria-expanded', String(open));
  }
  el.btnPanel.addEventListener('click', function () { togglePanel(el.panel.hidden); });
  el.btnClose.addEventListener('click', function () {
    togglePanel(false);
    el.btnClose.blur();      // hand the keyboard back to the timer
  });

  /* ---- render ------------------------------------------------------------ */

  function render() {
    Array.prototype.forEach.call(el.modes.children, function (row) {
      var on = row.dataset.mode === settings.mode;
      row.classList.toggle('on', on);
      row.querySelector('input').checked = on;
    });
    [el.positions, el.inspection].forEach(function (c) {
      var cur = String(c.__get());
      Array.prototype.forEach.call(c.children, function (lab) {
        var on = lab.dataset.val === cur;
        lab.classList.toggle('on', on);
        lab.querySelector('input').checked = on;
      });
    });
    el.fixedWrap.hidden = settings.mode !== 'fixed';
    el.optEnabled.checked = settings.enabled;
    el.optScramble.checked = settings.showScramble;

    var pool = CROP.buildPool(settings);
    var empty = settings.mode === 'fixed' && (settings.fixedPairs || []).length === 0;
    el.poolCount.textContent = pool.length + ' orientation' + (pool.length === 1 ? '' : 's') +
      ' in pool' + (empty ? ' (no pairs picked — using the default 4)' : '');
  }

  /* ---- boot ------------------------------------------------------------- */

  setState('idle');
  paintLcd('0.00');
  refreshScramble();
  renderStats();
  render();

})();
