/* ============================================================================
 * CROP — extension settings popup.
 * Writes to chrome.storage.local; content.js picks changes up live via
 * chrome.storage.onChanged, so there is no Save button and no messaging.
 * ==========================================================================*/
(function () {
  'use strict';

  var CROP = globalThis.CROP;

  var el = {
    enabled:    document.getElementById('enabled'),
    modes:      document.getElementById('modes'),
    fixedWrap:  document.getElementById('fixedWrap'),
    picker:     document.getElementById('picker'),
    positions:  document.getElementById('positions'),
    previewBox: document.getElementById('previewBox'),
    poolCount:  document.getElementById('poolCount'),
    warn:       document.getElementById('warn'),
    btnDefault: document.getElementById('btnDefault'),
    btnNone:    document.getElementById('btnNone'),
    onoff:      document.getElementById('onoff'),
    status:     document.getElementById('status'),
    statusTxt:  document.getElementById('statusTxt'),
    btnTest:    document.getElementById('btnTest')
  };

  var settings = CROP.normalizeSettings(null);
  var picker = null;
  var preview = null;
  var previewTimer = null;

  /* ---- persistence ------------------------------------------------------- */

  function save(patch) {
    Object.keys(patch).forEach(function (k) { settings[k] = patch[k]; });
    chrome.storage.local.set(patch);
    refresh();
  }

  /* ---- build the mode radios -------------------------------------------- */

  ['full', 'x2y', 'fixed'].forEach(function (key) {
    var m = CROP.MODES[key];
    var row = document.createElement('label');
    row.className = 'mode';
    row.dataset.mode = key;

    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mode';
    input.value = key;

    var txt = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'name';
    name.textContent = m.label;
    var blurb = document.createElement('div');
    blurb.className = 'blurb';
    blurb.textContent = m.blurb;
    txt.appendChild(name);
    txt.appendChild(blurb);

    row.appendChild(input);
    row.appendChild(txt);
    el.modes.appendChild(row);

    input.addEventListener('change', function () {
      if (input.checked) save({ mode: key });
    });
  });

  /* ---- position segmented control --------------------------------------- */

  CROP.POSITIONS.forEach(function (pos) {
    var lab = document.createElement('label');
    lab.dataset.pos = pos;
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'position';
    input.value = pos;
    lab.appendChild(input);
    lab.appendChild(document.createTextNode(pos.charAt(0).toUpperCase() + pos.slice(1)));
    el.positions.appendChild(lab);
    input.addEventListener('change', function () {
      if (input.checked) save({ position: pos });
    });
  });

  /* ---- enable toggle ---------------------------------------------------- */

  el.enabled.addEventListener('change', function () {
    save({ enabled: el.enabled.checked });
  });

  /* ---- fixed-pair picker ------------------------------------------------ */

  function buildPicker() {
    picker = CROP.renderPairPicker(el.picker, settings.fixedPairs, function (pairs) {
      // Store the raw selection, including an empty one, so the UI can warn.
      // normalizeSettings() falls back to the default 4 if it is ever empty,
      // which keeps the content script from silently doing nothing.
      settings.fixedPairs = pairs;
      chrome.storage.local.set({ fixedPairs: pairs });
      refresh();
    });
  }

  el.btnDefault.addEventListener('click', function () {
    if (picker) picker.setPairs(CROP.DEFAULT_FIXED_PAIRS);
  });
  el.btnNone.addEventListener('click', function () {
    if (picker) picker.setAll(false);
  });

  /* ---- preview ---------------------------------------------------------- */

  function rollPreview() {
    if (!preview) {
      // container: keeps the card inline in the preview box. Without it, show()
      // mounts to document.body and the card covers the entire popup.
      preview = CROP.createOverlay(document, {
        hint: 'click to reroll',
        container: el.previewBox
      });
    }
    var o = CROP.pick(settings);
    if (o) preview.show(o, 'center', 0);
  }

  /* ---- status ------------------------------------------------------------ */

  function ago(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
  }

  function renderStatus(st) {
    var cls = '', txt;

    if (!settings.enabled) {
      cls = 'warn';
      txt = 'Paused — flip the switch above to resume';
    } else if (!st || !st.at) {
      txt = 'Open cstimer.net in a tab to activate';
    } else if (Date.now() - st.at > 6 * 60 * 60 * 1000) {
      txt = 'No recent csTimer tab — reload cstimer.net';
    } else if (!st.solvesSeen) {
      cls = 'good';
      txt = 'Connected to ' + st.host + ' (' + st.el + ') — no solves seen yet';
    } else {
      var SRC = {
        counter: 'solve counter',
        display: 'display',
        timer: 'timer',
        scramble: 'scramble'
      };
      cls = 'good';
      txt = st.solvesSeen + (st.solvesSeen === 1 ? ' solve' : ' solves') + ' detected' +
            (st.lastSolveAt ? ', last ' + ago(st.lastSolveAt) : '') +
            (st.lastSource && SRC[st.lastSource] ? ' via ' + SRC[st.lastSource] : '');
    }

    el.status.className = 'status' + (cls ? ' ' + cls : '');
    el.statusTxt.textContent = txt;
  }

  function loadStatus() {
    chrome.storage.local.get('_status', function (r) { renderStatus(r && r._status); });
  }

  el.btnTest.addEventListener('click', function () {
    // The content script watches for this key and fires a prompt immediately.
    chrome.storage.local.set({ demoAt: Date.now() });
    el.btnTest.textContent = 'Sent';
    setTimeout(function () { el.btnTest.textContent = 'Test'; }, 1200);
  });

  /* ---- render ----------------------------------------------------------- */

  function refresh() {
    el.enabled.checked = settings.enabled;
    el.onoff.textContent = settings.enabled ? 'On' : 'Off';

    Array.prototype.forEach.call(el.modes.children, function (row) {
      var on = row.dataset.mode === settings.mode;
      row.classList.toggle('on', on);
      row.querySelector('input').checked = on;
    });

    Array.prototype.forEach.call(el.positions.children, function (lab) {
      var on = lab.dataset.pos === settings.position;
      lab.classList.toggle('on', on);
      lab.querySelector('input').checked = on;
    });

    el.fixedWrap.hidden = settings.mode !== 'fixed';

    var raw = settings.fixedPairs || [];
    var pool = CROP.buildPool(settings);
    el.poolCount.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = String(pool.length);
    el.poolCount.appendChild(b);
    el.poolCount.appendChild(document.createTextNode(
      pool.length === 1 ? ' orientation in pool' : ' orientations in pool'));

    el.warn.textContent = (settings.mode === 'fixed' && raw.length === 0)
      ? 'No pairs picked — using the default 4'
      : '';

    loadStatus();

    // Re-roll the preview, debounced so rapid clicking does not strobe.
    clearTimeout(previewTimer);
    previewTimer = setTimeout(rollPreview, 60);
  }

  /* ---- boot ------------------------------------------------------------- */

  chrome.storage.local.get(null, function (raw) {
    settings = CROP.normalizeSettings(raw);
    // Preserve a deliberately-empty selection for the picker UI.
    if (raw && Array.isArray(raw.fixedPairs) && raw.fixedPairs.length === 0) {
      settings.fixedPairs = [];
    }
    buildPicker();
    refresh();
  });

  // Clicking the preview area rolls another sample.
  el.previewBox.addEventListener('click', rollPreview);

  // Keep the status line live while the popup is open.
  setInterval(loadStatus, 1500);

})();
