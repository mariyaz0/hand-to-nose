// Run: npm run serve (in another terminal), then npm run test:e2e-test
// End-to-end check of the test mode (?mode=test) in headless Chrome: a simulated person
// makes a left-hand movement, a right-hand movement, a false start and a "movement" in
// which the phone does not move. Supabase requests are intercepted and recorded.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8000/';
const OUT = process.env.OUT ?? 'e2e-output';
fs.mkdirSync(OUT, { recursive: true });

// what the simulated person does in each test, in order
const SCRIPT = ['left', 'false_start', 'right', 'no_move'];

const sim = (script) => {
  // ---- runs inside the page before the app loads ----
  const S = { moves: [], log: [], step: 0, script };
  window.__sim = S;
  const noise = (a) => (Math.random() - 0.5) * 2 * a;
  setInterval(() => {
    const now = performance.now();
    let ax = noise(0.04), ay = 9.81 + noise(0.04), az = 0.5 + noise(0.04);
    let gx = noise(1.5), gy = noise(1.5), gz = noise(1.5);
    for (const m of S.moves) {
      const u = (now - m.t0) / m.dur;
      if (u >= 0 && u <= 1) {
        const b = Math.sin(Math.PI * u);
        az += m.dir * 3 * Math.sin(2 * Math.PI * u);
        ay += 1.2 * b;
        gz += m.dir * -60 * b;            // rotation about x: tilt towards the face
        gx += m.dir * m.turn * 30 * b;    // rotation about y: + right hand, - left hand
      }
    }
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      accelerationIncludingGravity: { x: ax, y: ay, z: az },
      acceleration: { x: ax, y: ay - 9.81, z: az - 0.5 },
      rotationRate: { alpha: gz, beta: gx, gamma: gy },
      interval: 16,
    }));
  }, 1000 / 60);

  const pointer = (type, x, y) => {
    document.getElementById('s-trial').dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  };

  window.addEventListener('DOMContentLoaded', () => {
    const tr = document.getElementById('s-trial');
    let last = '';
    new MutationObserver(() => {
      const cls = tr.className;
      if (cls === last) return;
      last = cls;
      const now = performance.now();
      const what = S.script[S.step];
      if (cls.includes('st-pause') && what === 'false_start') {
        S.moves.push({ t0: now + 700, dur: 900, dir: 1, turn: 1 });
        S.log.push('false start');
        S.step++;
      }
      if (cls.includes('st-go')) {
        const r = document.getElementById('tr-dot').getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = 1100;
        if (what === 'no_move') {
          setTimeout(() => pointer('pointerdown', cx + 5, cy), 400);
          setTimeout(() => pointer('pointerup', cx + 5, cy), 650);
        } else {
          const turn = what === 'left' ? -1 : 1;
          S.moves.push({ t0: now + 300, dur: d, dir: 1, turn });
          setTimeout(() => pointer('pointerdown', cx + 9, cy - 6), 300 + d);
          setTimeout(() => pointer('pointerup', cx + 9, cy - 6), 300 + d + 250);
          S.moves.push({ t0: now + 300 + d + 250, dur: d, dir: -1, turn });
        }
        S.log.push(`go: ${what}`);
        S.step++;
      }
    }).observe(tr, { attributes: true, attributeFilter: ['class'] });
  });
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0 Mobile Safari/537.36',
});
const posted = [];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('supabase.co')) {
    if (req.method() === 'POST') posted.push({ url: req.url(), body: JSON.parse(req.postData()) });
    req.respond({ status: req.method() === 'OPTIONS' ? 204 : 201, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }, body: '' });
  } else req.continue();
});
await page.evaluateOnNewDocument(sim, SCRIPT);

const lang = process.env.LANG_UI ?? 'en';
const shot = (name) => page.screenshot({ path: `${OUT}/test-${lang}-${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (id) => page.evaluate((i) => !document.getElementById(i).hidden, id);
const waitFor = async (id, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await visible(id)) return true; await sleep(200); }
  return false;
};

await page.goto(`${BASE}?mode=test`, { waitUntil: 'networkidle0' });
if (lang === 'ru') await page.click('#lang button[data-lang="ru"]');
await shot('01-intro');
await page.click('#btn-test-sensors');
await sleep(1800);
await shot('02-sensors');
await page.click('#btn-test-start');

const results = [];
const shown = new Set();
for (let i = 0; i < 3; i++) {
  // wait for the trial, take a few screenshots, then the result
  const t0 = Date.now();
  while (!(await visible('s-test-result')) && Date.now() - t0 < 40000) {
    const st = await page.evaluate(() => ({
      cls: document.getElementById('s-trial').className,
      ov: document.getElementById('tr-overlay').hidden ? '' : document.getElementById('tr-overlay').className,
    }));
    if (st.cls.includes('st-pause') && !shown.has('pause')) { shown.add('pause'); await shot('03-trial-pause'); }
    if (st.ov.includes('ov-error') && !shown.has('error')) { shown.add('error'); await shot('04-false-start'); }
    await sleep(150);
  }
  await sleep(300);
  const res = await page.evaluate(() => ({
    title: document.getElementById('res-title').textContent,
    hand: document.getElementById('res-hand').textContent,
    conf: document.getElementById('res-conf').textContent,
    detail: document.getElementById('res-detail').textContent,
  }));
  results.push(res);
  await shot(`05-result-${i + 1}`);
  if (i < 2) await page.click('#btn-test-again');
  await sleep(500);
}
await sleep(1500);
const simLog = await page.evaluate(() => window.__sim.log);
await browser.close();

fs.writeFileSync(`${OUT}/posted-test-${lang}.json`, JSON.stringify(posted, null, 1));
const sessions = posted.filter((p) => p.url.endsWith('/sessions')).map((p) => p.body);
const trials = posted.filter((p) => p.url.endsWith('/trials')).map((p) => p.body);
const summary = {
  errors,
  simLog,
  results,
  sessions: sessions.map((s) => ({ mode: s.mode, app_version: s.app_version, consent_given: s.consent_given, age: s.age ?? null, model: s.device?.model_version })),
  trials: trials.map((b) => ({
    i: b.trial_index, hand: b.hand, speed: b.speed, failed_before: b.failed_before,
    predicted_hand: b.predicted_hand, predicted_prob: b.predicted_prob, model_version: b.model_version, n: b.n_samples,
  })),
};
console.log(JSON.stringify(summary, null, 1));

// checks
const fail = [];
if (errors.length) fail.push('page errors');
if (sessions.length !== 1 || sessions[0].mode !== 'test') fail.push('one test session expected');
if (trials.length !== 3) fail.push('3 trials expected');
if (trials[0]?.predicted_hand !== 'left') fail.push('first movement should be left');
if (trials[1]?.predicted_hand !== 'right') fail.push('second movement should be right');
if (!(trials[1]?.failed_before ?? []).includes('false_start')) fail.push('false start not recorded');
if (trials[2]?.predicted_hand !== null) fail.push('no answer expected for the no-move trial');
if (trials.some((t) => t.hand !== null || t.speed !== null)) fail.push('hand and speed must be null in test mode');
if (fail.length) { console.error('FAILED:', fail.join('; ')); process.exit(1); }
console.log('OK');
