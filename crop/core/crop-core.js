/* ============================================================================
 * CROP — csTimer Random Orientation Prompt
 * crop-core.js — shared logic, used by BOTH the Chrome extension and the
 * standalone static site. Keep the two copies of this file identical.
 *
 * Exposes globalThis.CROP. No build step, no modules, no dependencies.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. Cube colour model
   * ------------------------------------------------------------------------*/

  var COLORS = {
    white:  { key: 'white',  label: 'White',  hex: '#f4f4f4', ink: '#141414' },
    yellow: { key: 'yellow', label: 'Yellow', hex: '#ffd500', ink: '#141414' },
    green:  { key: 'green',  label: 'Green',  hex: '#00a651', ink: '#ffffff' },
    blue:   { key: 'blue',   label: 'Blue',   hex: '#0051ba', ink: '#ffffff' },
    red:    { key: 'red',    label: 'Red',    hex: '#c41e3a', ink: '#ffffff' },
    orange: { key: 'orange', label: 'Orange', hex: '#ff5800', ink: '#141414' }
  };

  var FACE_ORDER = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];

  var OPPOSITE = {
    white: 'yellow', yellow: 'white',
    green: 'blue',   blue: 'green',
    red: 'orange',   orange: 'red'
  };

  /* The four faces that can legally be FRONT for a given TOP, listed in
   * clockwise ring order (standard western/BOY colour scheme). Precomputed
   * rather than derived so the UI ordering is stable and reviewable. */
  var RINGS = {
    white:  ['green', 'red',    'blue',   'orange'],
    yellow: ['green', 'orange', 'blue',   'red'],
    green:  ['white', 'red',    'yellow', 'orange'],
    blue:   ['white', 'orange', 'yellow', 'red'],
    red:    ['white', 'blue',   'yellow', 'green'],
    orange: ['white', 'green',  'yellow', 'blue']
  };

  function isColor(c) {
    return typeof c === 'string' && Object.prototype.hasOwnProperty.call(COLORS, c);
  }

  /** A pair is valid iff both are real faces, differ, and are not opposites. */
  function isValidPair(top, front) {
    return isColor(top) && isColor(front) && top !== front && OPPOSITE[top] !== front;
  }

  function adjacentFaces(top) {
    return isColor(top) ? RINGS[top].slice() : [];
  }

  function pairKey(top, front) { return top + '/' + front; }

  /* --------------------------------------------------------------------------
   * 2. Modes and settings
   * ------------------------------------------------------------------------*/

  var MODES = {
    full:  { key: 'full',  label: 'Full',         blurb: 'All 24 orientations' },
    x2y:   { key: 'x2y',   label: 'x2y',          blurb: 'White or yellow on top — 8 orientations' },
    fixed: { key: 'fixed', label: 'Fixed blocks', blurb: 'Only the pairs you pick' }
  };

  var DEFAULT_FIXED_PAIRS = [
    ['white',  'orange'],
    ['white',  'green'],
    ['yellow', 'orange'],
    ['yellow', 'green']
  ];

  var DEFAULTS = {
    enabled: true,
    mode: 'full',
    fixedPairs: DEFAULT_FIXED_PAIRS,
    position: 'center',   // 'top' | 'center' | 'bottom'
    autoHideMs: 0,        // 0 = stay until the next key press
    debug: false
  };

  var POSITIONS = ['top', 'center', 'bottom'];

  /** Coerce anything (empty storage, old versions, hand-edited JSON) into a
   *  complete, internally consistent settings object. Never throws. */
  function normalizeSettings(raw) {
    var r = (raw && typeof raw === 'object') ? raw : {};
    var s = {
      enabled:  r.enabled === undefined ? DEFAULTS.enabled : !!r.enabled,
      mode:     Object.prototype.hasOwnProperty.call(MODES, r.mode) ? r.mode : DEFAULTS.mode,
      position: POSITIONS.indexOf(r.position) !== -1 ? r.position : DEFAULTS.position,
      autoHideMs: 0,
      debug:    !!r.debug,
      fixedPairs: null
    };

    var ms = Number(r.autoHideMs);
    s.autoHideMs = (isFinite(ms) && ms > 0) ? Math.min(ms, 60000) : 0;

    // fixedPairs may arrive as [[top,front],...] or ["top/front",...]
    var seen = {};
    var pairs = [];
    var incoming = Array.isArray(r.fixedPairs) ? r.fixedPairs : DEFAULT_FIXED_PAIRS;
    for (var i = 0; i < incoming.length; i++) {
      var item = incoming[i], top, front;
      if (Array.isArray(item)) { top = item[0]; front = item[1]; }
      else if (typeof item === 'string' && item.indexOf('/') !== -1) {
        var bits = item.split('/'); top = bits[0]; front = bits[1];
      } else continue;
      if (!isValidPair(top, front)) continue;
      var k = pairKey(top, front);
      if (seen[k]) continue;
      seen[k] = true;
      pairs.push([top, front]);
    }
    // An empty fixed pool would make the feature silently dead — fall back.
    s.fixedPairs = pairs.length ? pairs : DEFAULT_FIXED_PAIRS.slice();
    return s;
  }

  /* --------------------------------------------------------------------------
   * 3. Pools
   * ------------------------------------------------------------------------*/

  function buildPool(settings) {
    var s = normalizeSettings(settings);
    var pool = [];
    var tops;

    if (s.mode === 'fixed') {
      for (var i = 0; i < s.fixedPairs.length; i++) {
        pool.push({ top: s.fixedPairs[i][0], front: s.fixedPairs[i][1] });
      }
      return pool;
    }

    tops = (s.mode === 'x2y') ? ['white', 'yellow'] : FACE_ORDER;
    for (var t = 0; t < tops.length; t++) {
      var ring = RINGS[tops[t]];
      for (var f = 0; f < ring.length; f++) pool.push({ top: tops[t], front: ring[f] });
    }
    return pool;
  }

  /** Uniform random pick. Pure random — immediate repeats are possible. */
  function pick(settings) {
    var pool = buildPool(settings);
    if (!pool.length) return null;
    return pool[randomIndex(pool.length)];
  }

  /** Unbiased index via crypto when available, Math.random otherwise. */
  function randomIndex(n) {
    var c = root.crypto || root.msCrypto;
    if (c && c.getRandomValues && n > 0) {
      var limit = Math.floor(4294967296 / n) * n;   // reject to remove modulo bias
      var buf = new Uint32Array(1);
      for (var guard = 0; guard < 64; guard++) {
        c.getRandomValues(buf);
        if (buf[0] < limit) return buf[0] % n;
      }
    }
    return Math.floor(Math.random() * n);
  }

  function formatOrientation(o) {
    if (!o) return '';
    return COLORS[o.top].label + ' top, ' + COLORS[o.front].label + ' front';
  }

  /* --------------------------------------------------------------------------
   * 4. Overlay
   *
   * Focus-safety rules baked in here, do not "optimise" them away:
   *   - the wrapper is pointer-events:none, so every click lands on the page
   *     underneath and csTimer keeps window focus;
   *   - nothing in here is focusable: no tabindex, no <button>, no autofocus,
   *     and .focus() is never called;
   *   - the overlay owns no keyboard handling. The host page decides when to
   *     hide it, and must never preventDefault/stopPropagation to do so.
   * ------------------------------------------------------------------------*/

  function createOverlay(doc, opts) {
    doc = doc || root.document;
    opts = opts || {};

    /* opts.container renders the card inline inside that element instead of as
     * a fixed full-screen overlay on document.body. The settings popup uses it
     * for its live preview; without it, show() would re-parent the card onto
     * <body> and blanket the whole popup. */
    var inline = opts.container ? 'crop-inline ' : '';

    var wrap = doc.createElement('div');
    wrap.className = 'crop-overlay ' + inline + 'crop-pos-center';
    wrap.setAttribute('aria-hidden', 'true');

    var card = doc.createElement('div');
    card.className = 'crop-card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');

    var eyebrow = doc.createElement('div');
    eyebrow.className = 'crop-eyebrow';
    eyebrow.textContent = opts.eyebrow || 'Next solve — start from';

    var rows = doc.createElement('div');
    rows.className = 'crop-rows';

    function makeRow(slot) {
      var row = doc.createElement('div');
      row.className = 'crop-row';
      var sw = doc.createElement('span');
      sw.className = 'crop-swatch';
      var name = doc.createElement('span');
      name.className = 'crop-color';
      var lbl = doc.createElement('span');
      lbl.className = 'crop-slot';
      lbl.textContent = slot;
      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(lbl);
      rows.appendChild(row);
      return { row: row, sw: sw, name: name };
    }

    var topRow = makeRow('top');
    var frontRow = makeRow('front');

    var hint = doc.createElement('div');
    hint.className = 'crop-hint';
    hint.textContent = opts.hint || 'press space to continue';

    card.appendChild(eyebrow);
    card.appendChild(rows);
    card.appendChild(hint);
    wrap.appendChild(card);

    var visible = false;
    var hideTimer = null;
    var mounted = false;

    function mount() {
      if (mounted) return;
      // Already placed by the caller — never move it.
      if (wrap.parentNode) { mounted = true; return; }
      var host = opts.container || doc.body || doc.documentElement;
      if (!host) return;
      host.appendChild(wrap);
      mounted = true;
    }

    function paint(orientation) {
      var t = COLORS[orientation.top], f = COLORS[orientation.front];
      topRow.sw.style.background = t.hex;
      topRow.name.textContent = t.label;
      topRow.name.style.color = t.hex;
      frontRow.sw.style.background = f.hex;
      frontRow.name.textContent = f.label;
      frontRow.name.style.color = f.hex;
      card.setAttribute('aria-label', formatOrientation(orientation));
    }

    return {
      el: wrap,

      show: function (orientation, position, autoHideMs) {
        if (!orientation) return;
        mount();
        if (!mounted) return;
        paint(orientation);
        wrap.className = 'crop-overlay ' + inline + 'crop-pos-' +
          (POSITIONS.indexOf(position) !== -1 ? position : 'center') + ' crop-visible';
        wrap.setAttribute('aria-hidden', 'false');
        visible = true;
        if (hideTimer) { root.clearTimeout(hideTimer); hideTimer = null; }
        if (autoHideMs > 0) {
          hideTimer = root.setTimeout(function () { this.hide(); }.bind(this), autoHideMs);
        }
      },

      hide: function () {
        if (hideTimer) { root.clearTimeout(hideTimer); hideTimer = null; }
        if (!visible) return false;
        wrap.classList.remove('crop-visible');
        wrap.setAttribute('aria-hidden', 'true');
        visible = false;
        return true;
      },

      isVisible: function () { return visible; },

      destroy: function () {
        this.hide();
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        mounted = false;
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 5. Shared settings UI — the fixed-blocks pair picker.
   *    Used by the extension popup and by the static site's config panel.
   * ------------------------------------------------------------------------*/

  function renderPairPicker(container, selectedPairs, onToggle) {
    var doc = container.ownerDocument;
    var selected = {};
    (selectedPairs || []).forEach(function (p) { selected[pairKey(p[0], p[1])] = true; });

    container.textContent = '';
    FACE_ORDER.forEach(function (top) {
      var group = doc.createElement('div');
      group.className = 'crop-pp-group';

      var head = doc.createElement('div');
      head.className = 'crop-pp-head';
      var dot = doc.createElement('span');
      dot.className = 'crop-pp-dot';
      dot.style.background = COLORS[top].hex;
      var htxt = doc.createElement('span');
      htxt.textContent = COLORS[top].label + ' top';
      head.appendChild(dot);
      head.appendChild(htxt);
      group.appendChild(head);

      var chips = doc.createElement('div');
      chips.className = 'crop-pp-chips';

      RINGS[top].forEach(function (front) {
        var k = pairKey(top, front);
        var chip = doc.createElement('label');
        chip.className = 'crop-pp-chip';

        var cb = doc.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!selected[k];
        cb.dataset.top = top;
        cb.dataset.front = front;

        var cdot = doc.createElement('span');
        cdot.className = 'crop-pp-dot crop-pp-dot-sm';
        cdot.style.background = COLORS[front].hex;

        var txt = doc.createElement('span');
        txt.textContent = COLORS[front].label;

        chip.appendChild(cb);
        chip.appendChild(cdot);
        chip.appendChild(txt);
        chips.appendChild(chip);

        cb.addEventListener('change', function () {
          if (cb.checked) selected[k] = true; else delete selected[k];
          chip.classList.toggle('crop-pp-on', cb.checked);
          if (typeof onToggle === 'function') onToggle(collect());
        });
        chip.classList.toggle('crop-pp-on', cb.checked);
      });

      group.appendChild(chips);
      container.appendChild(group);
    });

    function collect() {
      var out = [];
      FACE_ORDER.forEach(function (top) {
        RINGS[top].forEach(function (front) {
          if (selected[pairKey(top, front)]) out.push([top, front]);
        });
      });
      return out;
    }

    return {
      value: collect,
      setAll: function (on) {
        var boxes = container.querySelectorAll('input[type=checkbox]');
        for (var i = 0; i < boxes.length; i++) {
          if (boxes[i].checked !== on) { boxes[i].checked = on; }
          var k = pairKey(boxes[i].dataset.top, boxes[i].dataset.front);
          if (on) selected[k] = true; else delete selected[k];
          boxes[i].parentNode.classList.toggle('crop-pp-on', on);
        }
        if (typeof onToggle === 'function') onToggle(collect());
      },
      setPairs: function (pairs) {
        selected = {};
        (pairs || []).forEach(function (p) { selected[pairKey(p[0], p[1])] = true; });
        var boxes = container.querySelectorAll('input[type=checkbox]');
        for (var i = 0; i < boxes.length; i++) {
          var on = !!selected[pairKey(boxes[i].dataset.top, boxes[i].dataset.front)];
          boxes[i].checked = on;
          boxes[i].parentNode.classList.toggle('crop-pp-on', on);
        }
        if (typeof onToggle === 'function') onToggle(collect());
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 6. Export
   * ------------------------------------------------------------------------*/

  root.CROP = {
    VERSION: '1.0.0',
    COLORS: COLORS,
    FACE_ORDER: FACE_ORDER,
    OPPOSITE: OPPOSITE,
    RINGS: RINGS,
    MODES: MODES,
    POSITIONS: POSITIONS,
    DEFAULTS: DEFAULTS,
    DEFAULT_FIXED_PAIRS: DEFAULT_FIXED_PAIRS,
    isColor: isColor,
    isValidPair: isValidPair,
    adjacentFaces: adjacentFaces,
    pairKey: pairKey,
    normalizeSettings: normalizeSettings,
    buildPool: buildPool,
    pick: pick,
    randomIndex: randomIndex,
    formatOrientation: formatOrientation,
    createOverlay: createOverlay,
    renderPairPicker: renderPairPicker
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
