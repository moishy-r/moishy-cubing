/* ============================================================================
 * CROP — settings popup test (dev only, not deployed).
 *
 *   npm i jsdom && node dev-popup-test.js
 *
 * Exists because of a shipped bug: createOverlay().show() called mount(), which
 * appended to document.body, so the popup's inline preview card was re-parented
 * out of its preview box and covered the whole settings UI — including the
 * footer, which is where the "Paused" warning lived. Two bugs, one hiding the
 * other. These assertions pin both down.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CORE = path.join(__dirname, '..', 'core');
const EXT  = path.join(__dirname, '..', 'extension');
const html = fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8');
const core = fs.readFileSync(path.join(CORE, 'crop-core.js'), 'utf8');
const pop  = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/not implemented|Could not load/i.test(e.message)) console.log('[jsdomError]', e.message); });
vc.on('error', (...a) => console.log('[page error]', ...a));

let failed = 0;
const ok = (pass, msg, detail) => {
  if (!pass) failed++;
  console.log((pass ? '  ok  ' : 'FAIL  ') + msg + (detail ? '   [' + detail + ']' : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- chrome.storage.local shim (in-memory, with change events) ----------- */
function makeChrome(initial) {
  const data = Object.assign({}, initial);
  const listeners = [];
  return {
    _data: data,
    storage: {
      local: {
        get(keys, cb) {
          let out;
          if (keys === null || keys === undefined) out = Object.assign({}, data);
          else if (typeof keys === 'string') { out = {}; if (keys in data) out[keys] = data[keys]; }
          else out = Object.assign({}, data);
          setTimeout(() => cb(out), 0);
        },
        set(obj, cb) {
          const changes = {};
          Object.keys(obj).forEach(k => {
            changes[k] = { oldValue: data[k], newValue: obj[k] };
            data[k] = obj[k];
          });
          setTimeout(() => { listeners.forEach(l => l(changes, 'local')); if (cb) cb(); }, 0);
        }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    }
  };
}

(async () => {
  const chromeShim = makeChrome({
    _status: { at: Date.now(), host: 'cstimer.net', el: '#lcd', scramble: '#scrambleTxt',
               solvesSeen: 3, lastSolveAt: Date.now() - 4000 }
  });

  const dom = new JSDOM(html, {
    url: 'https://popup.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  w.chrome = chromeShim;
  w.eval(core);
  w.eval(pop);

  await sleep(150);

  const $ = id => w.document.getElementById(id);
  const card = () => w.document.querySelector('.crop-card');
  const wrap = () => w.document.querySelector('.crop-overlay');

  /* -- THE regression: the preview must stay inside its box --------------- */
  ok(!!wrap(), 'a preview card was rendered');
  ok(wrap() && wrap().parentElement === $('previewBox'),
     'preview stays inside #previewBox (never re-parented to <body>)',
     wrap() ? wrap().parentElement.id || wrap().parentElement.tagName : 'none');
  ok(wrap() && wrap().classList.contains('crop-inline'),
     'preview wrapper carries .crop-inline so it renders in normal flow');
  ok(w.document.body.querySelector(':scope > .crop-overlay') === null,
     'no full-screen overlay was attached directly to <body>');

  /* rerolling must not move it either */
  $('previewBox').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(120);
  ok(wrap().parentElement === $('previewBox'), 'still inside #previewBox after a reroll');
  ok(w.document.querySelectorAll('.crop-overlay').length === 1, 'rerolling reuses one card, no pile-up',
     String(w.document.querySelectorAll('.crop-overlay').length));

  /* -- the footer stays reachable ----------------------------------------- */
  ok(/orientations? in pool/.test($('poolCount').textContent), 'footer pool count is rendered',
     $('poolCount').textContent);

  /* -- enable switch is unambiguous -------------------------------------- */
  ok($('enabled').checked === true, 'switch starts on (default enabled)');
  ok($('onoff').textContent === 'On', 'and is labelled "On" in words', $('onoff').textContent);

  $('enabled').checked = false;
  $('enabled').dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(120);
  ok($('onoff').textContent === 'Off', 'toggling relabels to "Off"', $('onoff').textContent);
  ok(chromeShim._data.enabled === false, 'the off state was persisted');
  ok(/Paused/.test($('statusTxt').textContent),
     'status line says Paused, in the visible header area', $('statusTxt').textContent);
  ok($('status').className.indexOf('warn') !== -1, 'and is styled as a warning');

  $('enabled').checked = true;
  $('enabled').dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(120);

  /* -- status reporting -------------------------------------------------- */
  ok(/3 solves detected/.test($('statusTxt').textContent),
     'status reports solves detected by the content script', $('statusTxt').textContent);
  ok($('status').className.indexOf('good') !== -1, 'and is styled as connected');

  /* -- Test button pokes the content script through storage -------------- */
  $('btnTest').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(60);
  ok(typeof chromeShim._data.demoAt === 'number', 'Test writes demoAt for the content script to pick up');

  /* -- mode switching ---------------------------------------------------- */
  const setMode = m => {
    const r = [...$('modes').querySelectorAll('label')].find(l => l.dataset.mode === m).querySelector('input');
    r.checked = true;
    r.dispatchEvent(new w.Event('change', { bubbles: true }));
  };

  setMode('x2y');
  await sleep(120);
  ok(/^8 orientations/.test($('poolCount').textContent), 'x2y reports 8', $('poolCount').textContent);
  ok(chromeShim._data.mode === 'x2y', 'mode persisted');
  ok($('fixedWrap').hidden, 'pair picker hidden outside fixed mode');

  setMode('fixed');
  await sleep(120);
  ok(!$('fixedWrap').hidden, 'fixed mode reveals the pair picker');
  ok($('picker').querySelectorAll('input[type=checkbox]').length === 24, 'all 24 pairs offered');
  ok($('picker').querySelectorAll('.crop-pp-on').length === 4, 'default 4 pre-selected');

  $('btnNone').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(120);
  ok($('picker').querySelectorAll('.crop-pp-on').length === 0, 'None clears every pair');
  ok(/using the default 4/.test($('warn').textContent), 'empty selection warns instead of dying silently',
     $('warn').textContent);
  ok(w.document.querySelectorAll('.crop-color').length === 2,
     'and the preview still shows a valid orientation');

  $('btnDefault').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(120);
  ok($('picker').querySelectorAll('.crop-pp-on').length === 4, 'Default 4 restores the defaults');

  setMode('full');
  await sleep(120);
  ok(/^24 orientations/.test($('poolCount').textContent), 'full reports 24', $('poolCount').textContent);

  /* -- position -------------------------------------------------------- */
  const posBtn = [...$('positions').querySelectorAll('label')].find(l => l.dataset.pos === 'bottom');
  const pr = posBtn.querySelector('input');
  pr.checked = true;
  pr.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(120);
  ok(chromeShim._data.position === 'bottom', 'position persisted');
  ok(wrap().classList.contains('crop-inline'), 'preview stays inline regardless of position setting');

  console.log(failed ? '\n' + failed + ' FAILURE(S)' : '\nall assertions passed');
  w.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('threw:', e && e.stack || e); process.exit(1); });
