/* ============================================================================
 * CROP — detector test across every csTimer display mode (dev only).
 *
 *   npm i jsdom && node dev-detector-test.js
 *
 * WHY THIS EXISTS
 * The first version of the detector measured how fast #lcd's text changed. That
 * works only for csTimer's timeU = u and c. Recorded from a live solve with
 * timeU = n:
 *
 *   137360  keyup            timer starts
 *   137367  #lcd -> "solve"  ...and never changes again
 *   140369  keydown          stop
 *   140384  #scrambleTxt and #avgstr update
 *   140387  #lcd -> "3.00"
 *   140415  stored solve count 11 -> 12
 *
 * Zero change rate for the whole solve, so `running` never armed, which also
 * disabled the scramble accelerator (gated on running). No prompt, ever.
 *
 * This suite replays that timeline for all five timeU values. It runs on a real
 * https origin so localStorage works, which the browser harness (file://,
 * opaque origin) cannot guarantee.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CORE = path.join(__dirname, '..', 'core');
const EXT  = path.join(__dirname, '..', 'extension');
const core = fs.readFileSync(path.join(CORE, 'crop-core.js'), 'utf8');
const content = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');

let failed = 0;
const ok = (pass, msg, detail) => {
  if (!pass) failed++;
  console.log((pass ? '  ok  ' : 'FAIL  ') + msg + (detail ? '   [' + detail + ']' : ''));
};
const note = m => console.log('· ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Replica of csTimer's DOM, verified live. */
const MOCK = `
<table id="timer"><tbody><tr><td id="container">
  <div id="lcd" class="activetimer insp">0.<span>00</span><div class="insplabel"></div><div class="difflabel"></div></div>
  <textarea id="inputTimer"></textarea>
  <div id="avgstr">ao12: 24.86 ao50: 24.30</div>
</td></tr></tbody></table>
<div id="scrambleDiv"><span id="scrambleTxt">R U R' U' F2 L D2 B</span></div>`;

/* csTimer's real localStorage shape: sessionData is a JSON *string*. */
function makeProps(session, count, timeU) {
  return JSON.stringify({
    session: session,
    timeU: timeU,
    sessionData: JSON.stringify({
      [session]: { name: session, rank: 1, stat: [count, 1, 33994], date: [1775835792, 1775837022] }
    })
  });
}

function makeChromeShim(store) {
  const listeners = [];
  return {
    storage: {
      local: {
        get(keys, cb) {
          let out = {};
          if (keys === null || keys === undefined) out = Object.assign({}, store);
          else if (typeof keys === 'string') { if (keys in store) out[keys] = store[keys]; }
          else out = Object.assign({}, store);
          setTimeout(() => cb(out), 0);
        },
        set(obj, cb) {
          const changes = {};
          Object.keys(obj).forEach(k => {
            changes[k] = { oldValue: store[k], newValue: obj[k] };
            store[k] = obj[k];
          });
          setTimeout(() => { listeners.forEach(l => l(changes, 'local')); if (cb) cb(); }, 0);
        }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    }
  };
}

/* One harness instance = one csTimer tab. */
function boot(timeU, startCount) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/not implemented/i.test(e.message)) console.log('[jsdomError]', e.message); });

  const dom = new JSDOM('<body>' + MOCK + '</body>', {
    url: 'https://cstimer.net/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  w.localStorage.setItem('properties', makeProps(26, startCount, timeU));

  const store = {};
  w.chrome = makeChromeShim(store);
  const realLog = w.console.log;
  w.console.log = () => {};          // silence the boot banner
  w.eval(core);
  w.eval(content);
  w.console.log = realLog;

  const lcd = w.document.getElementById('lcd');
  const span = lcd.querySelector('span');

  return {
    w, store, lcd,
    count: startCount,
    paint(text) {
      const m = /^(.*\.)(\d+)$/.exec(text);
      if (m) { lcd.firstChild.nodeValue = m[1]; span.textContent = m[2]; }
      else { lcd.firstChild.nodeValue = text; span.textContent = ''; }
    },
    scramble(s) { w.document.getElementById('scrambleTxt').textContent = s; },
    record() {   // csTimer persisting a recorded solve
      this.count++;
      w.localStorage.setItem('properties', makeProps(26, this.count, timeU));
    },
    visible() {
      const o = w.document.querySelector('.crop-overlay');
      return !!(o && o.classList.contains('crop-visible'));
    },
    shown() {
      return [...w.document.querySelectorAll('.crop-color')].map(n => n.textContent).join('/');
    },
    key() {
      w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',
        { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }));
    },
    close() { w.close(); }
  };
}

/* Replay of the measured timeline, parameterised by what the display does. */
async function solve(h, timeU, finalText) {
  const DURING = { u: null, c: null, s: 'secs', i: 'solve', n: 'solve' }[timeU];

  h.paint('0.00');
  await sleep(120);

  if (DURING === null) {
    // u / c: repaint every frame for ~600ms
    const t0 = Date.now();
    while (Date.now() - t0 < 600) { h.paint(((Date.now() - t0) / 1000).toFixed(2)); await sleep(16); }
  } else if (DURING === 'secs') {
    // s: one change per second
    for (const t of ['1', '2', '3']) { h.paint(t); await sleep(340); }
  } else {
    // i / n: a single constant, digit-free string for the whole solve
    h.paint('solve');
    await sleep(700);
  }

  // The stop, in csTimer's observed order.
  h.scramble("D2 F R2 U' L B2 R");
  h.paint(finalText);
  h.record();
}

(async () => {
  /* ---- the regression: every display mode must fire ---------------------- */
  for (const timeU of ['u', 'c', 's', 'i', 'n']) {
    const h = boot(timeU, 11);
    await sleep(250);
    await solve(h, timeU, '3.00');
    await sleep(300);
    const src = h.store._status && h.store._status.lastSource;
    ok(h.visible(), 'timeU=' + timeU + ': a solve fires the prompt',
       'via ' + src + ', showed ' + h.shown());
    ok(h.store._status && h.store._status.solvesSeen === 1,
       'timeU=' + timeU + ': counted exactly one solve',
       'solvesSeen=' + (h.store._status && h.store._status.solvesSeen));
    h.close();
  }

  /* ---- the counter must not fire on things that are not solves ----------- */
  const h = boot('n', 11);
  await sleep(250);
  ok(!h.visible(), 'no prompt at rest');

  h.scramble('U R2 F2 D B L2');                 // clicking for a new scramble
  await sleep(250);
  ok(!h.visible(), 'a manual scramble change does not fire');

  h.w.localStorage.setItem('properties', makeProps(26, 11, 'n').replace('"rank":1', '"rank":2'));
  await sleep(250);
  ok(!h.visible(), 'an unrelated properties write does not fire');

  h.paint('solve');                              // a solve starts
  await sleep(250);
  ok(!h.visible(), 'starting a solve does not fire');

  /* deleting a time decrements the counter — must resync, not fire */
  h.paint('3.00'); h.record();
  await sleep(300);
  ok(h.visible(), 'solve fired');
  h.key();
  h.count -= 1;
  h.w.localStorage.setItem('properties', makeProps(26, h.count, 'n'));
  await sleep(300);
  ok(!h.visible(), 'deleting a time does not fire a prompt');

  /* and the next real solve after a deletion still works */
  await sleep(700);
  h.paint('solve'); await sleep(150); h.paint('5.55'); h.record();
  await sleep(300);
  ok(h.visible(), 'the solve after a deletion still fires');
  h.key();

  /* switching session rebases instead of firing a burst */
  await sleep(700);
  h.w.localStorage.setItem('properties', makeProps(31, 250, 'n'));
  await sleep(300);
  ok(!h.visible(), 'switching to a session with 250 solves does not fire');
  await sleep(700);
  h.paint('solve'); await sleep(150); h.paint('6.66');
  h.w.localStorage.setItem('properties', makeProps(31, 251, 'n'));
  await sleep(300);
  ok(h.visible(), 'and the first solve in the new session fires normally');

  ok(h.store._status.timeU === 'n', 'status reports timeU for diagnostics',
     'timeU=' + h.store._status.timeU);
  h.close();

  /* ---- graceful degradation when storage is unreadable ------------------ */
  const h2 = boot('n', 11);
  await sleep(250);
  Object.defineProperty(h2.w, 'localStorage', {
    get() { throw new Error('SecurityError: storage is not available'); }
  });
  await sleep(200);
  h2.paint('solve');
  await sleep(300);
  h2.paint('4.21');                              // no record() — storage is gone
  await sleep(300);
  ok(h2.visible(), 'with localStorage unreadable, the display trigger still fires',
     'via ' + (h2.store._status && h2.store._status.lastSource));
  h2.close();

  note('triggers exercised: counter (u,c,s,i,n), display (i,n and no-storage), timer (u,c)');
  console.log(failed ? '\n' + failed + ' FAILURE(S)' : '\nall assertions passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('threw:', e && e.stack || e); process.exit(1); });
