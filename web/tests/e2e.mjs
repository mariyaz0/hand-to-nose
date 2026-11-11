// Run: npm run serve (in another terminal), then npm run test:e2e
// End-to-end check of the data-collection app in headless Chrome with a simulated
// participant: synthetic devicemotion events + touch (pointer) events, Supabase
// requests intercepted and recorded.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8000/';
const OUT = process.env.OUT ?? 'e2e-output';
fs.mkdirSync(OUT, { recursive: true });

const sim = () => {
  // ---- runs inside the page before the app loads ----
  const S = { moves: [], pauses: 0, gos: 0, log: [] };
  window.__sim = S;
  const noise = (a) => (Math.random() - 0.5) * 2 * a;
  setInterval(() => {
    const now = performance.now();
    let ax = noise(0.04), ay = 9.81 + noise(0.04), az = 0.5 + noise(0.04);
    let gx = noise(1.5), gy = noise(1.5), gz = noise(1.5);
    for (const m of S.moves) {
      const u = (now - m.t0) / m.dur;
      if (u >= 0 && u <= 1) {
        az += m.sign * 4 * Math.sin(2 * Math.PI * u);
        ay += 1.5 * Math.sin(Math.PI * u);
        gx += m.sign * 90 * Math.sin(Math.PI * u);
        gz += m.sign * 25 * Math.sin(Math.PI * u) * (S.hand === 'left' ? -1 : 1);
      }
    }
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      accelerationIncludingGravity: { x: ax, y: ay, z: az },
      acceleration: { x: ax, y: ay - 9.81, z: az - 0.5 },
      rotationRate: { alpha: gz, beta: gx, gamma: gy },
      interval: 16,
    }));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta: 80, gamma: 1 }));
  }, 1000 / 60);

  const pointer = (type, x, y) => {
    const el = document.getElementById('s-trial');
    el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
  };

  const durFor = (speed) => ({ fast: 600, normal: 1300, slow: 3200 }[speed] ?? 1200);

  window.addEventListener('DOMContentLoaded', () => {
    const tr = document.getElementById('s-trial');
    let last = '';
    new MutationObserver(() => {
      const cls = tr.className;
      if (cls === last) return;
      last = cls;
      const now = performance.now();
      const speedText = document.getElementById('tr-speed').textContent.toLowerCase();
      const speed = speedText.startsWith('fast') ? 'fast' : speedText.startsWith('slow') ? 'slow' : 'normal';
      S.hand = document.getElementById('tr-hand').textContent.toLowerCase().includes('left') ? 'left' : 'right';
      if (cls.includes('st-pause')) {
        S.pauses++;
        S.log.push(`pause ${S.pauses}`);
        if (S.pauses === 4) {            // second real trial: move too early
          S.moves.push({ t0: now + 800, dur: 1000, sign: 1 });
          S.log.push('-> false start injected');
        }
      }
      if (cls.includes('st-go')) {
        S.gos++;
        const d = durFor(speed);
        const t0 = now + 350;
        S.moves.push({ t0, dur: d, sign: 1 });
        const r = document.getElementById('tr-dot').getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        // a finger on the edge of the screen first (must be ignored)
        if (S.gos === 3) setTimeout(() => { pointer('pointerdown', 4, cy + 100); pointer('pointerup', 4, cy + 100); }, 200);
        setTimeout(() => pointer('pointerdown', cx + 9, cy - 6), 350 + d);
        setTimeout(() => pointer('pointerup', cx + 9, cy - 6), 350 + d + 250);
        S.moves.push({ t0: t0 + d + 250, dur: d, sign: -1 });
        S.log.push(`go ${S.gos} ${S.hand} ${speed}`);
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
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
});
const posted = [];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('supabase.co')) {
    if (req.method() === 'POST') posted.push({ url: req.url(), headers: req.headers(), body: JSON.parse(req.postData()) });
    req.respond({ status: req.method() === 'OPTIONS' ? 204 : 201, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }, body: '' });
  } else req.continue();
});
await page.evaluateOnNewDocument(sim);

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lang = process.env.LANG_UI ?? 'en';

await page.goto(BASE, { waitUntil: 'networkidle0' });
if (lang === 'ru') await page.click('#lang button[data-lang="ru"]');
await shot(`${lang}-01-welcome`);
await page.click('#btn-start');
await shot(`${lang}-02-consent`);
await page.click('#consent-box');
await page.click('#btn-consent');
await page.type('#age', '27');
await page.click('input[name="sex"][value="female"] + span');
for (const item of ['writing', 'throwing', 'toothbrush', 'spoon']) {
  await page.click(`input[name="ed-${item}"][value="${item === 'throwing' ? 50 : 100}"] + span`);
}
await shot(`${lang}-03-questions`);
await page.click('#btn-questions');
await page.click('#btn-sensors');
await sleep(1800);
await shot(`${lang}-04-setup`);
await page.click('#btn-setup');
await sleep(2600);
await shot(`${lang}-05-explain`);
if (process.env.ONLY_SCREENS) {
  await page.click('#btn-practice');
  await sleep(1500);
  await shot(`${lang}-06-trial-wait`);
  await sleep(1500);
  await shot(`${lang}-07-trial-pause`);
  await browser.close();
  console.log(JSON.stringify({ errors }, null, 1));
  process.exit(0);
}
await page.click('#btn-practice');

// let the simulated participant go through the session
const t0 = Date.now();
let shotsTaken = new Set();
while (Date.now() - t0 < 300000) {
  await sleep(500);
  const st = await page.evaluate(() => ({
    done: !document.getElementById('s-done').hidden,
    rest: !document.getElementById('s-rest').hidden,
    cls: document.getElementById('s-trial').className,
    status: document.getElementById('tr-status').textContent,
  }));
  if (st.rest && !shotsTaken.has('rest')) { shotsTaken.add('rest'); await shot(`${lang}-09-rest`); }
  if (st.cls.includes('st-fail') && !shotsTaken.has('fail')) { shotsTaken.add('fail'); await shot(`${lang}-08-trial-fail`); }
  if (st.cls.includes('st-ok') && !shotsTaken.has('ok')) { shotsTaken.add('ok'); await shot(`${lang}-07-trial-recorded`); }
  if (st.cls.includes('st-pause') && !shotsTaken.has('pause')) { shotsTaken.add('pause'); await shot(`${lang}-06-trial-pause`); }
  if (st.done) break;
}
await sleep(1500);
await shot(`${lang}-10-done`);
const simLog = await page.evaluate(() => window.__sim.log);
await browser.close();

fs.writeFileSync(`${OUT}/posted-${lang}.json`, JSON.stringify(posted, null, 1));
const sessions = posted.filter((p) => p.url.endsWith('/sessions'));
const trials = posted.filter((p) => p.url.endsWith('/trials'));
console.log(JSON.stringify({
  seconds: Math.round((Date.now() - t0) / 1000),
  errors,
  simLog,
  headers: posted[0]?.headers ? { apikey: posted[0].headers.apikey?.slice(0, 16), authorization: posted[0].headers.authorization ?? null, prefer: posted[0].headers.prefer } : null,
  sessions: sessions.map((s) => ({ ...s.body, device: Object.keys(s.body.device) })),
  trials: trials.map((p) => {
    const b = p.body;
    return {
      i: b.trial_index, block: b.block_index, hand: b.hand, speed: b.speed, failed_before: b.failed_before,
      beep: b.t_beep_high_ms, touch: b.t_touch_start_ms, touch_end: b.t_touch_end_ms, rest: b.t_rest_ms,
      move_ms: Math.round(b.t_touch_start_ms - b.t_beep_high_ms), n: b.n_samples, hz: b.sample_rate_hz,
      tx: b.touch_x_px, ty: b.touch_y_px, touches: b.touch_events.length, ignored: b.touch_events.filter((e) => !e.in_zone).length,
      kb: Math.round(JSON.stringify(b).length / 1024),
    };
  }),
}, null, 1));
