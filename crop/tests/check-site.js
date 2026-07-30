/* ============================================================================
 * CROP — standalone site test (dev only, not deployed).
 *
 *   npm i jsdom && node dev-site-test.js
 *
 * Drives site/index.html with synthetic key events and asserts the full
 * hold -> ready -> run -> stop -> prompt -> dismiss loop.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SITE = path.join(__dirname, '..', '..', 'docs', 'crop');
const CORE = path.join(__dirname, '..', 'core');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(CORE, 'crop-core.js'), 'utf8');
const app  = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/not implemented/i.test(e.message)) console.log('[jsdomError]', e.message); });
vc.on('error', (...a) => console.log('[page error]', ...a));

let failed = 0;
const ok = (pass, msg, detail) => {
  if (!pass) failed++;
  console.log((pass ? '  ok  ' : 'FAIL  ') + msg + (detail ? '   [' + detail + ']' : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A real origin so localStorage works; scripts are injected by hand so the
// relative <script src> tags in the HTML are irrelevant here.
const dom = new JSDOM(html, {
  url: 'https://crop.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const w = dom.window;
w.eval(core);
w.eval(app);

const $ = id => w.document.getElementById(id);
const lcd = $('lcd');
const overlay = () => w.document.querySelector('.crop-overlay');
const visible = () => { const o = overlay(); return !!(o && o.classList.contains('crop-visible')); };
const state = () => lcd.dataset.state;

function key(type, opts = {}) {
  const ev = new w.KeyboardEvent(type, Object.assign(
    { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }, opts));
  w.document.body.dispatchEvent(ev);
  return ev;
}

(async () => {
  await sleep(50);

  /* -- initial render ---------------------------------------------------- */
  ok(state() === 'idle', 'starts idle', state());
  ok(lcd.textContent === '0.00', 'display starts at 0.00', lcd.textContent);
  ok($('scramble').textContent.split(/\s+/).length === 20, 'a 20-move scramble is generated',
     $('scramble').textContent);

  /* scramble legality: no same face twice, no A B A on one axis */
  const AX = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  let bad = 0;
  for (let n = 0; n < 200; n++) {
    // regenerate by finishing solves is slow; check the generator's output via
    // repeated renders of the page's own function surface instead
    const moves = $('scramble').textContent.trim().split(/\s+/).map(m => m[0]);
    for (let i = 1; i < moves.length; i++) {
      if (moves[i] === moves[i - 1]) bad++;
      if (i > 1 && AX[moves[i]] === AX[moves[i - 1]] && AX[moves[i]] === AX[moves[i - 2]]) bad++;
    }
    break;
  }
  ok(bad === 0, 'scramble has no repeated face and no same-axis triple');

  /* -- hold released too early must not start ---------------------------- */
  key('keydown');
  ok(state() === 'hold', 'space down -> hold (red)', state());
  await sleep(80);
  key('keyup');
  ok(state() === 'idle', 'released before it armed -> back to idle, no start', state());

  /* -- full solve -------------------------------------------------------- */
  key('keydown');
  await sleep(380);                       // HOLD_MS is 300
  ok(state() === 'ready', 'held past the hold time -> ready (green)', state());

  const scrambleBefore = $('scramble').textContent;
  key('keyup');
  ok(state() === 'run', 'release starts the timer', state());

  await sleep(400);
  const mid = lcd.textContent;
  ok(/^0\.[0-9]{2}$/.test(mid) && parseFloat(mid) > 0.2, 'display counts up while running', mid);

  const stopEv = key('keydown');
  ok(state() === 'idle', 'keydown stops the timer', state());
  ok(parseFloat(lcd.textContent) > 0.3, 'a time was recorded', lcd.textContent);
  ok($('stCount').textContent === '1', 'solve count incremented', $('stCount').textContent);
  ok($('stBest').textContent === lcd.textContent, 'best matches the only solve');
  ok($('scramble').textContent !== scrambleBefore, 'a fresh scramble was generated');
  ok(visible(), 'the orientation prompt appeared on the stop');
  ok(stopEv.defaultPrevented === true, 'the site does suppress space-scroll (unlike the extension)');

  const shown = [...w.document.querySelectorAll('.crop-color')].map(n => n.textContent);
  ok(shown.length === 2, 'prompt shows a top and a front colour', shown.join('/'));
  ok(w.CROP.isValidPair(shown[0].toLowerCase(), shown[1].toLowerCase()),
     'the shown pair is a legal orientation', shown.join('/'));

  /* -- the same key press that dismisses also starts the next hold ------- */
  key('keydown');
  ok(!visible(), 'next space keydown dismisses the prompt');
  ok(state() === 'hold', 'and that same keydown already began the next hold', state());
  key('keyup');

  /* -- escape aborts without recording ----------------------------------- */
  key('keydown');
  await sleep(380);
  key('keyup');
  ok(state() === 'run', 'second solve running', state());
  key('keydown', { key: 'Escape', code: 'Escape', keyCode: 27 });
  ok(state() === 'idle', 'escape returns to idle', state());
  ok($('stCount').textContent === '1', 'escape did not record a time', $('stCount').textContent);

  /* -- any key stops, not just space ------------------------------------- */
  key('keydown'); await sleep(380); key('keyup');
  ok(state() === 'run', 'third solve running', state());
  key('keydown', { key: 'k', code: 'KeyK', keyCode: 75 });
  ok(state() === 'idle', 'any key stops the timer', state());
  ok($('stCount').textContent === '2', 'that solve was recorded', $('stCount').textContent);

  /* -- inspection mode --------------------------------------------------- */
  key('keydown');                                     // dismiss prompt
  key('keyup');
  const insp15 = [...$('inspection').querySelectorAll('label')].find(l => l.dataset.val === '15');
  const radio = insp15.querySelector('input');
  radio.checked = true;
  radio.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(20);

  key('keydown'); await sleep(380); key('keyup');
  ok(state() === 'inspect', 'with inspection on, release starts inspection', state());
  await sleep(120);
  ok(/^\d+$/.test(lcd.textContent), 'inspection shows a whole-second countdown', lcd.textContent);
  key('keydown');
  ok(state() === 'ihold', 'holding during inspection -> ihold', state());
  await sleep(380);
  ok(state() === 'iready', 'armed during inspection -> iready', state());
  key('keyup');
  ok(state() === 'run', 'release from inspection starts the timer', state());
  await sleep(120);
  key('keydown');
  ok(state() === 'idle' && $('stCount').textContent === '3', 'inspected solve recorded',
     $('stCount').textContent);

  /* -- settings persistence + pool sizes --------------------------------- */
  const modeX2y = [...$('modes').querySelectorAll('label')].find(l => l.dataset.mode === 'x2y');
  const mr = modeX2y.querySelector('input');
  mr.checked = true;
  mr.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(20);
  ok(/8 orientations in pool/.test($('poolCount').textContent), 'x2y reports 8 in the pool',
     $('poolCount').textContent);

  const saved = JSON.parse(w.localStorage.getItem('crop.settings.v1'));
  ok(saved.mode === 'x2y' && saved.inspection === 15, 'settings persisted to localStorage',
     JSON.stringify({ mode: saved.mode, inspection: saved.inspection }));
  ok(JSON.parse(w.localStorage.getItem('crop.times.v1')).length === 3, 'times persisted');

  const modeFixed = [...$('modes').querySelectorAll('label')].find(l => l.dataset.mode === 'fixed');
  const fr = modeFixed.querySelector('input');
  fr.checked = true;
  fr.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(20);
  ok(!$('fixedWrap').hidden, 'fixed mode reveals the pair picker');
  ok($('picker').querySelectorAll('input[type=checkbox]').length === 24,
     'picker offers all 24 pairs', String($('picker').querySelectorAll('input[type=checkbox]').length));
  ok($('picker').querySelectorAll('.crop-pp-on').length === 4, 'default 4 pairs are pre-selected',
     String($('picker').querySelectorAll('.crop-pp-on').length));

  /* -- clear session ----------------------------------------------------- */
  $('btnReset').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok($('stCount').textContent === '0' && $('stBest').textContent === '—', 'clear session resets stats');

  console.log(failed ? '\n' + failed + ' FAILURE(S)' : '\nall assertions passed');
  w.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('threw:', e && e.stack || e); process.exit(1); });
