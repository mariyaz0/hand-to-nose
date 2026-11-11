// Data-collection app: screens, the plan of trials and the connection between
// sensors, the trial state machine, the beeps and the upload.

import { APP_VERSION, PROTOCOL, DETECT, UI } from './config.js';
import { t, setLang, getLang, onLangChange, initialLang } from './i18n.js';
import { Beeper } from './audio.js';
import { Sensors, requestSensorPermission } from './sensors.js';
import { SampleBuffer, windowStats } from './motion.js';
import { TrialRunner, STATE } from './trial.js';
import { Uploader } from './db.js';
import { createDemo } from './demo.js';
import { buildPlan as makePlan } from './plan.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

const EDINBURGH_ITEMS = ['writing', 'throwing', 'toothbrush', 'spoon'];
const EDINBURGH_SCORES = [-100, -50, 0, 50, 100];
const SCORE_KEY = { '-100': 'ed_m100', '-50': 'ed_m50', 0: 'ed_0', 50: 'ed_50', 100: 'ed_100' };

// ---------------------------------------------------------------- state

const app = {
  sessionId: uuid(),
  age: null,
  sex: null,
  edinburgh: {},
  firstHand: Math.random() < 0.5 ? 'right' : 'left',
  sensorPermission: null,
  plan: [],
  pos: 0,
  trialIndex: 0,          // number of saved (real) trials
  failedBefore: [],       // reasons of discarded attempts since the last saved trial
  sessionQueued: false,
  zone: null,
  wakeLock: null,
  current: null,
};

const buffer = new SampleBuffer(60000);
const sensors = new Sensors();
const beeper = new Beeper();
const uploader = new Uploader({ onChange: updateDoneStatus });
let demo = null;

sensors.subscribe((s) => {
  buffer.push(s);
  if (runner.active) runner.onSample(s);
});

const runner = new TrialRunner({
  buffer,
  params: DETECT,
  playHigh: () => beeper.play('high'),
  playLow: () => beeper.play('low'),
  onState: renderTrialState,
  onDone: trialDone,
  onFail: trialFailed,
});

setInterval(() => {
  if (runner.active) runner.tick(performance.now());
}, 10);

// ---------------------------------------------------------------- helpers

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function show(id) {
  document.querySelectorAll('main > .screen').forEach((s) => { s.hidden = s.id !== id; });
  const trial = id === 's-trial';
  $('s-trial').hidden = !trial;
  document.body.classList.toggle('in-trial', trial);
  if (!trial) window.scrollTo(0, 0);
  if (id === 's-explain') demo?.start(); else demo?.stop();
}

async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator && !app.wakeLock) {
      app.wakeLock = await navigator.wakeLock.request('screen');
      app.wakeLock.addEventListener('release', () => { app.wakeLock = null; });
    }
  } catch { /* not supported or refused */ }
}

async function goFullscreen() {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await screen.orientation?.lock?.('portrait');
  } catch { /* iPhone has no element fullscreen; that is fine */ }
}

// ---------------------------------------------------------------- language

function initLang() {
  document.querySelectorAll('#lang button').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  onLangChange((l) => {
    document.querySelectorAll('#lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    if (app.current) renderTrialLabels(app.current);
    if (!$('s-rest').hidden) renderRestText();
    updateDoneStatus();
  });
  setLang(initialLang());
}

// ---------------------------------------------------------------- 1. welcome

function initWelcome() {
  const phoneLike = navigator.maxTouchPoints > 0 && 'DeviceMotionEvent' in window;
  $('not-phone').hidden = phoneLike || DEBUG;
  $('btn-start').addEventListener('click', () => show('s-consent'));
}

// ---------------------------------------------------------------- 2. consent

function initConsent() {
  const box = $('consent-box');
  box.addEventListener('change', () => { $('btn-consent').disabled = !box.checked; });
  $('btn-consent').addEventListener('click', () => show('s-questions'));
}

// ---------------------------------------------------------------- 3. questionnaire

function initQuestions() {
  const ed = $('edinburgh');
  for (const item of EDINBURGH_ITEMS) {
    const wrap = document.createElement('div');
    wrap.className = 'ed-item';
    const name = document.createElement('div');
    name.className = 'ed-name';
    name.dataset.i18n = `ed_${item}`;
    name.textContent = t(`ed_${item}`);
    const opts = document.createElement('div');
    opts.className = 'ed-opts';
    for (const score of EDINBURGH_SCORES) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `ed-${item}`;
      input.value = String(score);
      input.addEventListener('change', () => { app.edinburgh[item] = score; checkQuestions(); });
      const span = document.createElement('span');
      span.dataset.i18n = SCORE_KEY[score];
      span.textContent = t(SCORE_KEY[score]);
      label.append(input, span);
      opts.append(label);
    }
    wrap.append(name, opts);
    ed.append(wrap);
  }
  $('age').addEventListener('input', checkQuestions);
  document.querySelectorAll('input[name="sex"]').forEach((r) => r.addEventListener('change', () => { app.sex = r.value; checkQuestions(); }));
  $('btn-questions').addEventListener('click', () => show('s-setup'));
}

function checkQuestions() {
  const age = Number($('age').value);
  app.age = Number.isInteger(age) && age >= 10 && age <= 110 ? age : null;
  const ok = app.age != null && app.sex != null && EDINBURGH_ITEMS.every((i) => app.edinburgh[i] != null);
  $('btn-questions').disabled = !ok;
}

function edinburghLQ() {
  const v = EDINBURGH_ITEMS.map((i) => app.edinburgh[i]);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ---------------------------------------------------------------- 4. sensors and sound

function initSetup() {
  const status = $('sensor-status');
  $('btn-sensors').addEventListener('click', async () => {
    beeper.unlock();
    keepScreenOn();
    status.textContent = t('sensors_wait');
    app.sensorPermission = await requestSensorPermission();
    if (app.sensorPermission === 'denied') {
      status.textContent = t('sensors_denied');
      return;
    }
    sensors.start();
    setTimeout(() => {
      const rate = buffer.rate(1000);
      if (rate && rate > 10) {
        status.textContent = t('sensors_ok', { rate: Math.round(rate) });
        status.classList.remove('warn');
        $('btn-setup').disabled = false;
      } else {
        status.textContent = t('sensors_fail');
        status.classList.add('warn');
        if (DEBUG) $('btn-setup').disabled = false;
      }
    }, 1500);
  });
  $('btn-beep-high').addEventListener('click', () => { beeper.unlock(); beeper.play('high'); });
  $('btn-beep-low').addEventListener('click', () => { beeper.unlock(); beeper.play('low'); });
  $('btn-setup').addEventListener('click', () => show('s-explain'));
}

// ---------------------------------------------------------------- 5. explanation

function initExplain() {
  const steps = [...document.querySelectorAll('#steps li')];
  demo = createDemo($('demo'), {
    label: t,
    onStep: (i) => steps.forEach((li, k) => li.classList.toggle('active', k === i)),
    onBeep: (kind) => beeper.play(kind),
  });
  demo.drawStatic();
  $('btn-replay').addEventListener('click', () => demo.start());
  $('btn-practice').addEventListener('click', () => {
    beeper.unlock();
    keepScreenOn();
    goFullscreen();
    buildPlan();
    app.pos = 0;
    show('s-trial');
    // let the layout settle (fullscreen changes the size) before measuring the zone
    setTimeout(runNext, 400);
  });
}

// ---------------------------------------------------------------- plan of the session

function buildPlan() {
  const { plan, speedOrder } = makePlan(PROTOCOL, app.firstHand);
  app.plan = plan;
  app.speedOrder = speedOrder;
}

function runNext() {
  const item = app.plan[app.pos];
  if (!item) { finish(); return; }

  if (item.kind === 'notice') {
    setTrialLook('st-ok');
    $('tr-status').textContent = '';
    showOverlay('notice', { title: '', main: t('ov_practice_done'), sub: t('ov_real_start') }, UI.noticeShowMs, () => {
      app.pos++;
      runNext();
    });
    return;
  }
  if (item.kind === 'rest') { startRest(item); return; }

  app.current = item;
  show('s-trial');
  placeZone();
  if (item.kind === 'real' && !app.sessionQueued) queueSession();
  renderTrialLabels(item);

  // Announce a new hand or a new speed in the centre before the trial starts
  // (once per trial: not again after a failed attempt).
  const prev = app.lastAnnounced;
  const handChanged = !prev || prev.hand !== item.hand;
  const speedChanged = !prev || prev.speed !== item.speed;
  if (!item.announced && (handChanged || speedChanged)) {
    item.announced = true;
    app.lastAnnounced = item;
    setTrialLook('st-wait');
    $('tr-status').textContent = '';
    const speedLine = `${t(`speed_${item.speed}`)} · ${t(`speed_${item.speed}_hint`)}`;
    if (handChanged) {
      showOverlay('hand', {
        title: prev ? t('ov_switch_hand') : t('ov_get_ready'),
        main: t(`hand_${item.hand}`),
        sub: speedLine,
      }, UI.handChangeShowMs, () => startTrial());
    } else {
      showOverlay('info', {
        title: t('ov_new_speed'),
        main: t(`speed_${item.speed}`).toUpperCase(),
        sub: t(`speed_${item.speed}_hint`),
        extra: t(`hand_plain_${item.hand}`),
      }, UI.speedChangeShowMs, () => startTrial());
    }
    return;
  }
  item.announced = true;
  app.lastAnnounced = item;
  startTrial();
}

function startTrial() {
  runner.start(performance.now());
}

/** Dimmed screen with a card in the centre for `ms`, then `then()`. */
function showOverlay(kind, { title = '', main = '', sub = '', extra = '' }, ms, then) {
  const ov = $('tr-overlay');
  ov.className = `overlay ov-${kind}`;
  $('ov-title').textContent = title;
  $('ov-main').textContent = main;
  $('ov-sub').textContent = sub;
  $('ov-extra').textContent = extra;
  ov.hidden = false;
  setTimeout(() => {
    ov.hidden = true;
    then?.();
  }, ms);
}

function vibrate() {
  try { navigator.vibrate?.(UI.vibrateMs); } catch { /* not supported (iPhone) */ }
}

function placeZone() {
  const dot = $('tr-dot').getBoundingClientRect();
  const cx = dot.left + dot.width / 2;
  const cy = dot.top + dot.height / 2;
  const r = Math.max(60, Math.min(DETECT.zoneRadiusCm * DETECT.cssPxPerCm, window.innerWidth / 2 - DETECT.zoneEdgeMarginPx));
  app.zone = { cx, cy, r };
  const z = $('tr-zone');
  z.style.width = `${2 * r}px`;
  z.style.height = `${2 * r}px`;
}

// ---------------------------------------------------------------- trial screen

function renderTrialLabels(item) {
  $('tr-progress').textContent = item.kind === 'practice'
    ? t('progress_practice', { n: item.n, total: item.total })
    : t('progress', { n: item.n, total: item.total });
  $('tr-hand').textContent = t(`hand_${item.hand}`);
  $('tr-speed').textContent = `${t(`speed_${item.speed}`)} · ${t(`speed_${item.speed}_hint`)}`;
}

function setTrialLook(cls) {
  const el = $('s-trial');
  el.className = `trial ${cls}`;
}

function renderTrialState(state) {
  const status = $('tr-status');
  switch (state) {
    case STATE.WAIT_STILL: setTrialLook('st-wait'); status.textContent = t('st_extend'); break;
    case STATE.PAUSE: setTrialLook('st-pause'); status.textContent = t('st_pause'); break;
    case STATE.GO: setTrialLook('st-go'); status.textContent = t('st_go'); break;
    case STATE.TOUCHING:
    case STATE.RETURNING: setTrialLook(`st-${state}`); status.textContent = t('st_back'); break;
    default: break;
  }
}

function trialDone(result) {
  const item = app.current;
  if (item.kind === 'real') {
    uploader.add('trials', {
      id: uuid(),
      session_id: app.sessionId,
      block_index: item.block,
      trial_index: app.trialIndex++,
      hand: item.hand,
      speed: item.speed,
      failed_before: app.failedBefore,
      ...result,
    });
    app.failedBefore = [];
  }
  setTrialLook('st-ok');
  $('tr-status').textContent = t(item.kind === 'practice' ? 'st_practice_ok' : 'st_recorded');
  app.pos++;
  const next = app.plan[app.pos];
  if (next && (next.kind === 'real' || next.kind === 'practice')) renderTrialLabels(next);
  setTimeout(runNext, UI.resultShowMs);
}

function trialFailed(reason) {
  if (app.current?.kind === 'real') app.failedBefore.push(reason);
  setTrialLook('st-fail');
  $('tr-status').textContent = '';
  vibrate();
  showOverlay('error', {
    title: t('ov_error'),
    main: t(`err_${reason}_title`),
    sub: t(`err_${reason}_text`),
    extra: t('ov_repeat'),
  }, UI.failShowMs, () => {
    if (document.hidden) {
      // wait until the page is visible again
      document.addEventListener('visibilitychange', function again() {
        if (!document.hidden) { document.removeEventListener('visibilitychange', again); runNext(); }
      });
    } else {
      runNext();
    }
  });
}

function initTouches() {
  const el = $('s-trial');
  const handle = (type) => (e) => {
    if (e.pointerType === 'mouse' && !DEBUG) return;
    e.preventDefault();
    if (!app.zone) return;
    const x = e.clientX - app.zone.cx;
    const y = e.clientY - app.zone.cy;
    runner.onTouch({ type, id: e.pointerId, t: e.timeStamp, x, y, inZone: Math.hypot(x, y) <= app.zone.r });
  };
  el.addEventListener('pointerdown', handle('down'));
  el.addEventListener('pointerup', handle('up'));
  el.addEventListener('pointercancel', handle('cancel'));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) runner.abort('interrupted');
    else keepScreenOn();
  });
}

// ---------------------------------------------------------------- rest between blocks

function startRest(item) {
  app.restItem = item;
  app.current = null;
  show('s-rest');
  renderRestText();
  let left = PROTOCOL.restBetweenBlocksS;
  $('rest-count').textContent = left;
  const timer = setInterval(() => {
    left--;
    $('rest-count').textContent = Math.max(0, left);
    if (left <= 0) {
      clearInterval(timer);
      app.pos++;
      runNext();
    }
  }, 1000);
}

function renderRestText() {
  if (!app.restItem) return;
  $('rest-text').textContent = t('rest_text', { hand: t(`hand_acc_${app.restItem.nextHand}`) });
}

// ---------------------------------------------------------------- upload

function deviceInfo() {
  return {
    user_agent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform ?? null,
    mobile: navigator.userAgentData?.mobile ?? null,
    browser_language: navigator.language,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: screen.width, h: screen.height },
    dpr: window.devicePixelRatio,
    zone: app.zone ? { r_px: Math.round(app.zone.r), cx: Math.round(app.zone.cx), cy: Math.round(app.zone.cy) } : null,
    css_px_per_cm_assumed: DETECT.cssPxPerCm,
    sensor_permission: app.sensorPermission,
    sensors: { ...sensors.info, measured_rate_hz: Math.round((buffer.rate(2000) ?? 0) * 10) / 10 },
    audio: beeper.info(),
    fullscreen: !!document.fullscreenElement,
    detect: DETECT,
  };
}

function queueSession() {
  app.sessionQueued = true;
  uploader.add('sessions', {
    id: app.sessionId,
    app_version: APP_VERSION,
    mode: 'collect',
    language: getLang(),
    consent_given: true,
    age: app.age,
    sex: app.sex,
    edinburgh: app.edinburgh,
    edinburgh_lq: edinburghLQ(),
    first_hand: app.firstHand,
    device: { ...deviceInfo(), speed_order: app.speedOrder },
  });
}

// ---------------------------------------------------------------- done

function finish() {
  app.current = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
  show('s-done');
  $('done-code').textContent = t('done_code', { code: app.sessionId.slice(0, 8).toUpperCase() });
  updateDoneStatus();
}

function updateDoneStatus() {
  const el = $('done-status');
  if (!el || $('s-done').hidden) return;
  if (uploader.pending > 0) {
    el.textContent = t('done_sending') + (uploader.lastError ? `\n${t('upload_error')}` : '');
  } else {
    el.textContent = t('done_sent');
  }
}

window.addEventListener('beforeunload', (e) => {
  if (uploader.pending > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------- debug overlay (?debug=1)

function initDebug() {
  if (!DEBUG) return;
  const box = $('tr-debug');
  box.hidden = false;
  setInterval(() => {
    const now = performance.now();
    const st = windowStats(buffer, now, DETECT.stillWindowMs, 60);
    const f = (x, d = 1) => (x == null ? '–' : x.toFixed(d));
    box.textContent = [
      `state   ${runner.state}`,
      `rate    ${f(buffer.rate(1000))} Hz`,
      `gyroRms ${f(st.gyroRms)} (<${DETECT.stillGyroRms})`,
      `accStd  ${f(st.accStd, 2)} (<${DETECT.stillAccStd})`,
      `upright ${f(st.upright, 2)} (>${DETECT.uprightMin})`,
      `queue   ${uploader.pending} sent ${uploader.sent}`,
      uploader.lastError ? `err ${String(uploader.lastError.message).slice(0, 60)}` : '',
    ].join('\n');
  }, 200);
}

// ---------------------------------------------------------------- start

initLang();
initWelcome();
initConsent();
initQuestions();
initSetup();
initExplain();
initTouches();
initDebug();
show('s-welcome');
