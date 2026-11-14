// Data-collection app: screens, the plan of trials and the connection between
// sensors, the trial state machine, the beeps and the upload.
// Test mode (open with ?mode=test, D-54): one movement at a time, then the answer of the
// model (which hand, with confidence); test runs are saved with mode = 'test'.

import { APP_VERSION, PROTOCOL, DETECT, UI } from './config.js';
import { t, setLang, getLang, onLangChange, initialLang } from './i18n.js';
import { Beeper } from './audio.js';
import { Sensors, requestSensorPermission } from './sensors.js';
import { SampleBuffer, windowStats } from './motion.js';
import { TrialRunner, STATE } from './trial.js';
import { Uploader } from './db.js';
import { createDemo } from './demo.js';
import { buildPlan as makePlan } from './plan.js';
import { predictHand } from './classify.js';
import { MODEL } from './hand_model.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const MODE = new URLSearchParams(location.search).get('mode') === 'test' ? 'test' : 'collect';

const EDINBURGH_ITEMS = ['writing', 'throwing', 'toothbrush', 'spoon'];
const EDINBURGH_SCORES = [-100, -50, 0, 50, 100];
const SCORE_KEY = { '-100': 'ed_m100', '-50': 'ed_m50', 0: 'ed_0', 50: 'ed_50', 100: 'ed_100' };

// ---------------------------------------------------------------- state

const app = {
  sessionId: uuid(),
  age: null,
  gender: null,
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
  sessionStartedAt: null,
  testCount: 0,
};

// a trial is accepted only for a session younger than 3 hours with fewer than 40 trials
// (supabase/migrations); the test mode starts a new session well before that
const TEST_SESSION_MAX_TRIALS = 38;
const TEST_SESSION_MAX_MS = 2.5 * 3600 * 1000;

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
    if (!$('s-test-result').hidden) showTestResult();
    $('test-model').textContent = t('test_model', { v: MODEL.model_version });
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
  document.querySelectorAll('input[name="gender"]').forEach((r) => r.addEventListener('change', () => { app.gender = r.value; checkQuestions(); }));
  $('btn-questions').addEventListener('click', () => show('s-setup'));
}

function checkQuestions() {
  const age = Number($('age').value);
  app.age = Number.isInteger(age) && age >= 10 && age <= 110 ? age : null;
  const ok = app.age != null && app.gender != null && EDINBURGH_ITEMS.every((i) => app.edinburgh[i] != null);
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
  if (MODE === 'test') { startTestTrial(); return; }
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
  if (item.kind === 'test') {
    $('tr-progress').textContent = t('test_progress', { n: item.n });
    $('tr-hand').textContent = t('test_any_hand');
    $('tr-speed').textContent = t('test_own_pace');
    return;
  }
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
  if (item.kind === 'test') { testDone(result); return; }
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
  if (app.current?.kind === 'real' || app.current?.kind === 'test') app.failedBefore.push(reason);
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
  app.sessionStartedAt = Date.now();
  if (MODE === 'test') {
    uploader.add('sessions', {
      id: app.sessionId,
      app_version: APP_VERSION,
      mode: 'test',
      language: getLang(),
      consent_given: false, // a test run (final exam) does not ask for consent (schema)
      device: { ...deviceInfo(), model_version: MODEL.model_version },
    });
    return;
  }
  uploader.add('sessions', {
    id: app.sessionId,
    app_version: APP_VERSION,
    mode: 'collect',
    language: getLang(),
    consent_given: true,
    age: app.age,
    sex: app.gender, // database column `sex` holds the answer to the Gender question (D-37)
    edinburgh: app.edinburgh,
    edinburgh_lq: edinburghLQ(),
    first_hand: app.firstHand,
    device: { ...deviceInfo(), speed_order: app.speedOrder },
  });
}

// ---------------------------------------------------------------- test mode (?mode=test)

function initTest() {
  $('test-model').textContent = t('test_model', { v: MODEL.model_version });
  const status = $('test-sensor-status');
  $('btn-test-sensors').addEventListener('click', async () => {
    beeper.unlock();
    keepScreenOn();
    status.textContent = t('sensors_wait');
    app.sensorPermission = await requestSensorPermission();
    if (app.sensorPermission === 'denied') { status.textContent = t('sensors_denied'); return; }
    sensors.start();
    setTimeout(() => {
      const rate = buffer.rate(1000);
      const ok = rate && rate > 10;
      status.textContent = ok ? t('sensors_ok', { rate: Math.round(rate) }) : t('sensors_fail');
      status.classList.toggle('warn', !ok);
      $('btn-test-start').disabled = !(ok || DEBUG);
    }, 1500);
  });
  const begin = () => {
    beeper.unlock();
    keepScreenOn();
    goFullscreen();
    show('s-trial');
    setTimeout(startTestTrial, 400); // let the layout settle before measuring the zone
  };
  $('btn-test-start').addEventListener('click', begin);
  $('btn-test-again').addEventListener('click', begin);
}

function startTestTrial() {
  const tooOld = app.sessionStartedAt && Date.now() - app.sessionStartedAt > TEST_SESSION_MAX_MS;
  if (app.sessionQueued && (app.trialIndex >= TEST_SESSION_MAX_TRIALS || tooOld)) {
    app.sessionId = uuid();
    app.sessionQueued = false;
    app.trialIndex = 0;
  }
  const item = app.current?.kind === 'test' && !app.current.done ? app.current : { kind: 'test', n: app.testCount + 1 };
  app.current = item;
  show('s-trial');
  placeZone();
  renderTrialLabels(item);
  setTrialLook('st-wait');
  startTrial();
}

function testDone(result) {
  const item = app.current;
  item.done = true;
  app.testCount++;
  const r = predictHand(result, app.zone?.r);
  if (!app.sessionQueued) queueSession();
  uploader.add('trials', {
    id: uuid(),
    session_id: app.sessionId,
    block_index: 0,
    trial_index: app.trialIndex++,
    hand: null,
    speed: null,
    failed_before: app.failedBefore,
    ...result,
    predicted_hand: r.hand,
    predicted_prob: r.hand ? Math.round(r.confidence * 10000) / 10000 : null,
    model_version: MODEL.model_version,
  });
  app.failedBefore = [];
  app.lastResult = r;
  setTrialLook('st-ok');
  $('tr-status').textContent = '';
  showTestResult();
}

function showTestResult() {
  const r = app.lastResult;
  if (!r) return;
  const hand = $('res-hand');
  if (r.hand) {
    const pct = Math.min(99, Math.round(100 * r.confidence)); // a model is never 100 % sure
    $('res-title').textContent = t('test_result_title');
    hand.textContent = t(`test_${r.hand}`);
    hand.className = `res-hand ${r.hand}`;
    $('res-conf').textContent = t('test_confidence', { p: pct });
    $('res-bar-fill').style.width = `${pct}%`;
    $('res-detail').textContent = t('test_detail', {
      deg: (r.rot_y_angle > 0 ? '+' : r.rot_y_angle < 0 ? '\u2212' : '') + Math.abs(r.rot_y_angle).toFixed(1),
      dir: t(r.rot_y_angle < 0 ? 'test_dir_left' : 'test_dir_right'),
    });
  } else {
    $('res-title').textContent = '';
    hand.textContent = t('test_no_move_title');
    hand.className = 'res-hand';
    $('res-conf').textContent = '';
    $('res-bar-fill').style.width = '0';
    $('res-detail').textContent = t('test_no_move');
  }
  $('res-model').textContent = t('test_model', { v: r.model_version });
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
  show('s-test-result');
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
initTest();
show(MODE === 'test' ? 's-test' : 's-welcome');
