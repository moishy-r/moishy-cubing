/* ============================================================================
 * CROP — content script for cstimer.net
 *
 * WHAT csTIMER'S DOM ACTUALLY LOOKS LIKE (verified live, not guessed):
 *
 *   <table id="timer">
 *     <td id="container">
 *       <div id="lcd" class="activetimer insp">      <- the visible display
 *         "0."                                       <- text node: seconds
 *         <span>00</span>                            <- centiseconds
 *         <div class="insplabel"></div>               <- inspection countdown
 *         <div class="difflabel">(-7.24)</div>        <- +/- vs previous
 *       </div>
 *       <textarea id="inputTimer">                   <- manual-entry mode
 *       <div id="avgstr">ao12: 24.86 ao50: 24.30</div>
 *
 * Two consequences that a naive implementation gets wrong:
 *
 *   1. Do NOT observe #timer's text. It is a <table> whose subtree text also
 *      contains #avgstr (the rolling averages), which mutates on every solve
 *      and would fire the prompt spuriously. Observe #lcd.
 *   2. Do NOT use #lcd.textContent. It includes .insplabel and .difflabel, so
 *      "12.34" reads as "12.34(-7.24)". readTimerText() skips those children.
 *
 * DETECTION — csTimer's solve counter is the primary trigger, because the
 * display cannot be trusted. Options > Timer > "timeU" controls what the
 * display shows *during* a solve, and csTimer's own source maps it like this:
 *
 *   u -> full precision      text changes every frame
 *   c -> centiseconds        text changes every frame   (this is the default)
 *   s -> whole seconds       text changes once a second
 *   i -> a constant string   text NEVER changes
 *   n -> a constant string   text NEVER changes
 *
 * So any change-rate scheme silently dies for three of the five settings.
 * Measured on a live solve with timeU=n:
 *
 *   137360  keyup            timer starts
 *   137367  #lcd -> "solve"  ...and that is the last change until it stops
 *   140369  keydown          stop
 *   140384  #scrambleTxt and #avgstr update
 *   140387  #lcd -> "3.00"
 *   140415  stored solve count 11 -> 12
 *
 * csTimer persists its session stats to localStorage["properties"] within
 * ~30-50ms of recording a solve, and a content script shares the page's origin,
 * so that counter is readable ground truth: one increment per recorded solve,
 * independent of theme, locale and every display setting. It is also faster
 * than waiting out a settle window.
 *
 * Three independent triggers now feed one debounced fire():
 *   1. solve counter increments          — all modes, ~40ms latency
 *   2. display placeholder -> real time  — covers i/n if storage is unreadable
 *   3. change-rate running -> settled    — covers u/c likewise
 *
 * SECONDARY STRATEGY (change rate) — deliberately not colour-based:
 *   csTimer's ready/running colours are user-themeable, and matching on
 *   rgb(0,255,0) breaks the moment someone loads custom CSS. Instead we measure
 *   how fast the display text is changing:
 *
 *     running  = >= 4 distinct text changes inside a 700ms window
 *                (a running timer repaints ~every 10-30ms; the inspection
 *                 countdown only ticks once a second, so it can never qualify)
 *     stopped  = we were running, and the text has been still for 380ms
 *                and now reads as a settled time
 *
 *   Plus one accelerator: csTimer generates a fresh scramble the instant a
 *   solve is recorded. If #scrambleTxt changes WHILE we believe the timer is
 *   running, that is an unambiguous stop, and we fire immediately instead of
 *   waiting out the settle window. Gated on running===true so that manually
 *   clicking for a new scramble never triggers a prompt.
 *
 * FOCUS SAFETY — the whole point of the extension is that it stays invisible
 * to csTimer's input handling:
 *   - overlay wrapper is pointer-events:none (see crop-overlay.css)
 *   - nothing focusable is ever inserted, and .focus() is never called
 *   - the keydown listener is passive:true, so preventDefault is impossible
 *     even by accident, and it never calls stopPropagation. The same space
 *     press that dismisses the prompt goes straight through to csTimer and
 *     starts the next inspection.
 * ==========================================================================*/
(function () {
  'use strict';

  var CROP = globalThis.CROP;
  if (!CROP) { console.error('[CROP] crop-core.js failed to load'); return; }

  /* ---- tunables ---------------------------------------------------------- */
  var CHANGE_WINDOW_MS = 700;   // window over which change-rate is measured
  var RUN_THRESHOLD    = 4;     // changes inside that window => running
  var SETTLE_MS        = 380;   // stillness after running => stopped
  var POLL_MS          = 80;    // safety poll, in case a mutation is missed
  var REFIRE_GUARD_MS  = 900;   // min gap between two prompts
  var REARM_BLOCK_MS   = 400;   // grace period after a prompt before we will
                                // believe the timer is running again
  var ATTACH_RETRY_MS  = 500;   // how often to look for #lcd before it exists

  /* ---- state ------------------------------------------------------------- */
  var settings = CROP.normalizeSettings(null);
  var overlay = null;
  var timerEl = null;
  var scrambleEl = null;
  var timerObserver = null;
  var scrambleObserver = null;
  var lastText = null;
  var lastScramble = null;
  var changeStamps = [];
  var running = false;
  // -Infinity, not 0: performance.now() starts at 0 on page load, so a 0 here
  // would put every prompt in the first REFIRE_GUARD_MS of page life inside the
  // duplicate-suppression window and silently swallow it.
  var lastFireAt = -Infinity;

  function log() {
    if (!settings.debug) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[CROP]');
    console.log.apply(console, a);
  }

  /* ---- settings ---------------------------------------------------------- */

  function loadSettings(cb) {
    try {
      chrome.storage.local.get(null, function (raw) {
        settings = CROP.normalizeSettings(raw);
        log('settings', settings);
        if (cb) cb();
      });
    } catch (e) {
      // Extension context invalidated (e.g. reloaded from chrome://extensions).
      settings = CROP.normalizeSettings(null);
      if (cb) cb();
    }
  }

  loadSettings();

  /* Only these keys are real settings. _status and demoAt are the popup's
     diagnostics channel; reacting to them as if they were settings would hide
     the very prompt we just showed, because writing _status on each fire would
     re-enter this listener. */
  var SETTING_KEYS = ['enabled', 'mode', 'fixedPairs', 'position', 'autoHideMs', 'debug'];

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;

      // "Test" button in the popup: show a prompt right now.
      if (changes.demoAt && changes.demoAt.newValue) {
        loadSettings(function () { lastFireAt = -Infinity; fire('test button'); });
        return;
      }

      var touched = false;
      for (var i = 0; i < SETTING_KEYS.length; i++) {
        if (Object.prototype.hasOwnProperty.call(changes, SETTING_KEYS[i])) { touched = true; break; }
      }
      if (!touched) return;

      loadSettings(function () {
        // A live settings change should not leave a stale prompt on screen.
        if (overlay && overlay.isVisible()) overlay.hide();
      });
    });
  } catch (e) { /* no-op */ }

  /* ---- status channel ---------------------------------------------------- */

  var solvesSeen = 0;

  /* The popup has no way to talk to a content script without extra
     permissions, so the content script publishes a heartbeat to storage and the
     popup reads it. This is what makes "is it even running?" answerable. */
  function publishStatus() {
    try {
      chrome.storage.local.set({
        _status: {
          at: Date.now(),
          host: location.host,
          el: timerEl ? ('#' + timerEl.id) : null,
          scramble: scrambleEl ? ('#' + scrambleEl.id) : null,
          solvesSeen: solvesSeen,
          lastSolveAt: lastSolveAt || null,
          lastSource: lastSource || null,
          timeU: readTimeU(),
          counter: storeCount
        }
      });
    } catch (e) { /* context invalidated */ }
  }

  var lastSolveAt = 0;
  var lastSource = null;

  /* Reported purely for diagnostics — detection no longer depends on it. */
  function readTimeU() {
    try {
      var p = JSON.parse(localStorage.getItem('properties'));
      return p && p.timeU ? p.timeU : null;
    } catch (e) { return null; }
  }

  /* ---- reading the display ---------------------------------------------- */

  var SKIP = /(^|\s)(insplabel|difflabel)(\s|$)/;

  function classOf(node) {
    var c = node.className;
    return (typeof c === 'string') ? c : '';   // SVGAnimatedString guard
  }

  function readTimerText(el) {
    if (!el) return '';
    var out = '';
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1 && !SKIP.test(classOf(n))) out += n.textContent;
    }
    return out.replace(/\s+/g, '');
  }

  /* "12.34", "1:02.34", "DNF" are settled results. "0.00" is a reset display
     and "12" alone is an inspection count, so both are rejected. */
  function looksSettled(text) {
    if (!text) return false;
    if (/DNF/i.test(text)) return true;
    if (/^0?\.?0+$|^0\.000?$/.test(text)) return false;
    return /^\+?-?\d{1,3}(:\d{2})?\.\d{1,3}\+?\d*$/.test(text) ||
           (/\d/.test(text) && text.indexOf('.') > 0 && text.length >= 3);
  }

  /* ---- state machine ---------------------------------------------------- */

  function noteText(text) {
    if (text === lastText) return;
    var prev = lastText;
    lastText = text;

    var now = performance.now();

    /* Trigger 2 — placeholder to real time.
       With timeU = i or n the display holds a constant, digit-free string
       ("solve") for the whole solve and then flips straight to "3.00". There is
       no change rate to measure, just this one transition. Requiring the
       previous text to contain no digits at all is what keeps this from firing
       mid-solve under timeU = u/c, where the display is always numeric. */
    if (prev && !/\d/.test(prev) && looksSettled(text)) {
      running = false;
      log('-> stopped (placeholder "' + prev + '" -> ' + text + ')');
      fire('display');
      return;
    }
    changeStamps.push(now);
    if (changeStamps.length > 32) changeStamps.shift();

    var recent = 0;
    for (var i = changeStamps.length - 1; i >= 0; i--) {
      if (now - changeStamps[i] > CHANGE_WINDOW_MS) break;
      recent++;
    }

    // Do not re-arm immediately after a prompt. csTimer can emit a few trailing
    // repaints once a solve is recorded (final time, then a +2/DNF penalty
    // redraw). Without this grace period those repaints look like a new solve
    // starting, which would hide the prompt we just showed — and the retry
    // would then be eaten by REFIRE_GUARD_MS, leaving no prompt at all.
    if (now - lastFireAt < REARM_BLOCK_MS) return;

    if (recent >= RUN_THRESHOLD && !running) {
      running = true;
      log('-> running');
      // Belt and braces: the dismiss-on-keydown handler should already have
      // cleared the prompt, but never let one survive into a live solve.
      if (overlay && overlay.isVisible()) overlay.hide();
    }
  }

  /* ---- trigger 1: csTimer's persisted solve counter ---------------------- */

  /* localStorage["properties"] holds, among other things:
   *   session      the active session id
   *   sessionData  a JSON *string* of { sessionId: { stat: [count, ...] } }
   * stat[0] is the number of solves in that session. The individual times live
   * elsewhere, so this blob stays a few KB and is cheap to reparse.
   *
   * A content script shares the page's origin, so this is simply readable. */
  var storeRaw = null;      // last raw string, to skip parsing on no-op polls
  var storeSession = null;
  var storeCount = null;

  function readSessionCount() {
    var raw;
    try { raw = localStorage.getItem('properties'); } catch (e) { return null; }
    if (raw == null) return null;
    if (raw === storeRaw) return false;          // unchanged since last poll
    storeRaw = raw;
    try {
      var p = JSON.parse(raw);
      var sd = (typeof p.sessionData === 'string') ? JSON.parse(p.sessionData) : p.sessionData;
      if (!sd) return null;
      var s = sd[p.session];
      if (!s || !s.stat || typeof s.stat[0] !== 'number') return null;
      return { session: String(p.session), count: s.stat[0] };
    } catch (e) { return null; }
  }

  function checkSolveCount() {
    var r = readSessionCount();
    if (r === false || r == null) return;

    // First read, or the user switched session: rebase, never fire.
    if (storeSession !== r.session) {
      storeSession = r.session;
      storeCount = r.count;
      log('session ' + r.session + ' baseline ' + r.count);
      return;
    }

    if (r.count > storeCount) {
      storeCount = r.count;
      running = false;
      log('-> solve recorded (count ' + r.count + ')');
      fire('counter');
    } else if (r.count < storeCount) {
      storeCount = r.count;                      // a deletion; resync quietly
    }
  }

  function tick() {
    checkSolveCount();

    if (timerEl && !timerEl.isConnected) {   // csTimer replaced the node
      log('timer node detached, re-attaching');
      detach();
    }
    if (!timerEl) { attach(); return; }

    noteText(readTimerText(timerEl));
    if (!running) return;

    var last = changeStamps.length ? changeStamps[changeStamps.length - 1] : 0;
    if (performance.now() - last >= SETTLE_MS && looksSettled(lastText)) {
      running = false;
      log('-> stopped', lastText);
      fire('timer');
    }
  }

  function fire(source) {
    var now = performance.now();
    if (now - lastFireAt < REFIRE_GUARD_MS) { log('suppressed duplicate from', source); return; }
    lastFireAt = now;

    // Counted even when paused, so the popup can distinguish "detection is
    // broken" from "you left it switched off".
    if (source !== 'test button') { solvesSeen++; lastSolveAt = Date.now(); lastSource = source; }
    publishStatus();

    if (!settings.enabled) { log('disabled, not prompting'); return; }

    var orientation = CROP.pick(settings);
    if (!orientation) { log('empty pool'); return; }

    if (!overlay) overlay = CROP.createOverlay(document);
    overlay.show(orientation, settings.position, settings.autoHideMs);
    log('prompt via', source, CROP.formatOrientation(orientation));
  }

  /* ---- dismissal --------------------------------------------------------- */

  /* passive:true makes preventDefault a no-op, which is exactly what we want:
     it is structurally impossible for this listener to swallow the space bar.
     capture:true only means we run early; propagation is never stopped. */
  function onKeyDown() {
    if (overlay && overlay.isVisible()) overlay.hide();
  }

  window.addEventListener('keydown', onKeyDown, { capture: true, passive: true });
  window.addEventListener('pointerdown', onKeyDown, { capture: true, passive: true });
  window.addEventListener('touchstart', onKeyDown, { capture: true, passive: true });

  /* ---- attach / detach --------------------------------------------------- */

  function attach() {
    // #lcd is the display. #timer is only a fallback for a future DOM change,
    // and is knowingly noisier (it contains #avgstr).
    var t = document.querySelector('#lcd') || document.querySelector('#timer');
    if (!t) return false;

    timerEl = t;
    lastText = readTimerText(timerEl);
    changeStamps = [];
    running = false;

    timerObserver = new MutationObserver(function () {
      noteText(readTimerText(timerEl));
    });
    timerObserver.observe(timerEl, {
      childList: true, characterData: true, subtree: true
    });

    var s = document.querySelector('#scrambleTxt') || document.querySelector('#scrambleDiv');
    if (s) {
      scrambleEl = s;
      lastScramble = s.textContent;
      scrambleObserver = new MutationObserver(function () {
        var txt = scrambleEl.textContent;
        if (txt === lastScramble) return;
        lastScramble = txt;
        // Only meaningful mid-solve: a new scramble while the timer is running
        // means the solve was just recorded.
        if (running) {
          running = false;
          log('-> stopped (scramble regenerated)');
          fire('scramble');
        }
      });
      scrambleObserver.observe(scrambleEl, {
        childList: true, characterData: true, subtree: true
      });
    }

    // Unconditional, not gated on debug: one line in the console is the
    // fastest way to confirm the content script actually injected.
    console.log('[CROP] active — watching #' + timerEl.id +
                (scrambleEl ? ' and #' + scrambleEl.id : '') +
                ', solve counter + display (timeU=' + readTimeU() + ')' +
                ' (open the extension popup for status)');
    publishStatus();
    return true;
  }

  function detach() {
    if (timerObserver) { timerObserver.disconnect(); timerObserver = null; }
    if (scrambleObserver) { scrambleObserver.disconnect(); scrambleObserver = null; }
    timerEl = null;
    scrambleEl = null;
    lastText = null;
    changeStamps = [];
    running = false;
  }

  /* ---- boot -------------------------------------------------------------- */

  if (!attach()) {
    var tries = 0;
    var retry = setInterval(function () {
      if (attach() || ++tries > 60) clearInterval(retry);   // give up after ~30s
    }, ATTACH_RETRY_MS);
  }

  setInterval(tick, POLL_MS);

  /* Manual test hook: CROP_DEBUG.demo() in the page console (isolated world,
     so this is only reachable from the extension's own context). */
  globalThis.CROP_DEBUG = {
    demo: function () { lastFireAt = 0; fire('manual'); },
    state: function () {
      return { running: running, lastText: lastText, settings: settings,
               poolSize: CROP.buildPool(settings).length };
    }
  };

})();
