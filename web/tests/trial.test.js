// Tests of the trial state machine on simulated phone movements.
// Run: npm test   (Node 20+)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SampleBuffer, windowStats, isStill } from '../js/motion.js';
import { TrialRunner, STATE } from '../js/trial.js';
import { DETECT } from '../js/config.js';

// ---- a small simulated participant -------------------------------------------------

function rng(seed) {
  // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulates one trial at 60 Hz.
 * behaviour:
 *   rtMs        reaction time after the high beep
 *   moveMs      duration of the movement to the nose (and back)
 *   holdMs      nose stays on the screen
 *   touch       'zone' | 'outside' | 'none'
 *   earlyMoveAt time (ms from start) of a movement before the beep, or null
 *   flat        phone lies flat (gravity along z)
 *   gyro        rotation rate available
 *   untilMs     simulation length
 */
function simulate(behaviour = {}) {
  const b = { rtMs: 350, moveMs: 1200, holdMs: 250, touch: 'zone', earlyMoveAt: null, flat: false, gyro: true, untilMs: 20000,
    gyroAmp: 90, accAmp: 4, noiseGyro: 2, noiseAcc: 0.05, ...behaviour };
  const rand = rng(42);
  const noise = (a) => (rand() - 0.5) * 2 * a;
  const buffer = new SampleBuffer();
  const moves = [];          // {t0, dur, sign}
  const touchesPlanned = []; // {t, type, inZone}
  let tBeep = null;
  let lowBeeps = 0;
  let result = null;
  let failReason = null;
  const states = [];

  if (b.earlyMoveAt != null) moves.push({ t0: b.earlyMoveAt, dur: b.moveMs, sign: 1 });

  const runner = new TrialRunner({
    buffer,
    params: DETECT,
    playHigh: () => {
      tBeep = now;
      const tStart = now + b.rtMs;
      moves.push({ t0: tStart, dur: b.moveMs, sign: 1 });
      const tArrive = tStart + b.moveMs;
      if (b.touch !== 'none') {
        const inZone = b.touch === 'zone';
        touchesPlanned.push({ t: tArrive, type: 'down', inZone });
        touchesPlanned.push({ t: tArrive + b.holdMs, type: 'up', inZone });
      }
      moves.push({ t0: tArrive + b.holdMs, dur: b.moveMs, sign: -1 });
      return now;
    },
    playLow: () => { lowBeeps++; return now; },
    onState: (s) => states.push(s),
    onDone: (r) => { result = r; },
    onFail: (r) => { failReason = r; },
  });

  // the app records continuously, so the buffer already holds 2 s of data when a trial starts
  const warmupMs = 2000;
  let now = 0;
  let started = false;
  const dt = 1000 / 60;
  for (now = 0; now <= b.untilMs && (!started || runner.active); now += dt) {
    if (!started && now >= warmupMs) { runner.start(now); started = true; }
    // sample
    const na = b.noiseAcc, ng = b.noiseGyro;
    let ax = noise(na), ay = 9.81 + noise(na), az = 0.4 + noise(na);
    if (b.flat) { ay = 0.3 + noise(na); az = 9.81 + noise(na); }
    let gx = noise(ng), gy = noise(ng), gz = noise(ng);
    for (const m of moves) {
      const u = (now - m.t0) / m.dur;
      if (u >= 0 && u <= 1) {
        az += m.sign * b.accAmp * Math.sin(2 * Math.PI * u);          // push towards the face, then brake
        ay += (b.accAmp * 3 / 8) * Math.sin(Math.PI * u);
        gx += m.sign * b.gyroAmp * Math.sin(Math.PI * u);             // forearm rotation while the elbow bends
      }
    }
    const s = { t: now, ax, ay, az, lx: null, ly: null, lz: null, gx: b.gyro ? gx : null, gy: b.gyro ? gy : null, gz: b.gyro ? gz : null, oa: null, ob: null, og: null };
    buffer.push(s);
    if (started) runner.onSample(s);

    // touches due by now
    while (touchesPlanned.length && touchesPlanned[0].t <= now) {
      const e = touchesPlanned.shift();
      const x = e.inZone ? 12 : 190;
      runner.onTouch({ type: e.type, id: 1, t: e.t, x, y: -8, inZone: e.inZone });
    }
    if (started) runner.tick(now);
  }
  return { result, failReason, tBeep, lowBeeps, states, runner };
}

// ---- tests ---------------------------------------------------------------------------

test('a normal trial is recorded with events in the right order', () => {
  const { result, failReason, lowBeeps } = simulate();
  assert.equal(failReason, null);
  assert.ok(result, 'trial finished');
  const r = result;
  assert.equal(lowBeeps, 1);
  // pre-period (1 s) + still window (1 s) + pause (2 s) => high beep ~4 s after the first sample
  assert.ok(Math.abs(r.t_beep_high_ms - 4000) < 40, `beep at ${r.t_beep_high_ms}`);
  assert.ok(r.t_beep_high_ms < r.t_touch_start_ms);
  assert.ok(r.t_touch_start_ms < r.t_touch_end_ms);
  assert.ok(r.t_touch_end_ms < r.t_rest_ms);
  assert.ok(Math.abs(r.t_touch_start_ms - r.t_beep_high_ms - 1550) < 40);
  assert.equal(r.touch_x_px, 12);
  assert.ok(r.sample_rate_hz > 55 && r.sample_rate_hz < 65);
  const lens = Object.values(r.samples).map((a) => a.length);
  assert.ok(lens.every((n) => n === r.n_samples));
  assert.equal(r.samples.t[0], 0);
  // the recording ends ~0.5 s after the phone is still again
  const tLast = r.samples.t[r.samples.t.length - 1];
  assert.ok(tLast - r.t_rest_ms >= 1000 && tLast - r.t_rest_ms <= 1600, `last sample ${tLast - r.t_rest_ms} ms after rest start`);
});

test('a slow movement (5 s each way) is still recorded', () => {
  const { result, failReason } = simulate({ moveMs: 5000, untilMs: 30000 });
  assert.equal(failReason, null);
  assert.ok(result);
  assert.ok(result.t_touch_start_ms - result.t_beep_high_ms > 5000);
});

test('moving before the beep fails as false_start', () => {
  // trial starts at 2 s with a full still window, pause until 4 s; move at 3 s
  const { result, failReason, tBeep } = simulate({ earlyMoveAt: 3000 });
  assert.equal(result, null);
  assert.equal(failReason, 'false_start');
  assert.equal(tBeep, null, 'no beep was played');
});

test('no nose touch within 10 s fails as no_touch', () => {
  const { failReason, tBeep, runner } = simulate({ touch: 'none' });
  assert.equal(failReason, 'no_touch');
  assert.ok(tBeep != null);
  assert.equal(runner.state, STATE.FAILED);
});

test('a touch outside the zone is logged but does not count', () => {
  const { failReason, lowBeeps, runner } = simulate({ touch: 'outside' });
  assert.equal(failReason, 'no_touch');
  assert.equal(lowBeeps, 0);
  assert.ok(runner.touches.some((e) => e.in_zone === false));
});

test('a phone lying flat on a table never starts a trial', () => {
  const { tBeep, runner } = simulate({ flat: true, untilMs: 8000 });
  assert.equal(tBeep, null);
  assert.equal(runner.state, STATE.WAIT_STILL);
});

test('works without a gyroscope (acceleration only)', () => {
  const { result, failReason } = simulate({ gyro: false });
  assert.equal(failReason, null);
  assert.ok(result);
});

test('abort() during a trial fails with the given reason', () => {
  const buffer = new SampleBuffer();
  let reason = null;
  const r = new TrialRunner({ buffer, params: DETECT, playHigh: () => 0, playLow: () => 0, onDone: () => {}, onFail: (x) => { reason = x; } });
  r.start(0);
  r.abort('interrupted');
  assert.equal(reason, 'interrupted');
  r.abort('again'); // no effect once failed
  assert.equal(reason, 'interrupted');
});

test('stillness needs enough samples in the window', () => {
  const buffer = new SampleBuffer();
  for (let t = 0; t <= 1000; t += 200) buffer.push({ t, ax: 0, ay: 9.81, az: 0, gx: 0, gy: 0, gz: 0 });
  const st = windowStats(buffer, 1000, 1000, 60);
  assert.equal(isStill(st, DETECT), false, '6 samples in 1 s is too few');
});

// Values below come from the first real recording (S24 Ultra, 11 Nov 2026):
// real movements rotated the phone at 31-99 deg/s, slow ones changed |a| by < 1 m/s^2;
// holding still: rotation up to ~13 deg/s, | |a| - g | up to ~0.4 m/s^2.

test('a slow early movement like the real ones (35 deg/s, small |a| change) is caught', () => {
  const { failReason, tBeep } = simulate({ earlyMoveAt: 3000, moveMs: 3000, gyroAmp: 35, accAmp: 0.5 });
  assert.equal(failReason, 'false_start');
  assert.equal(tBeep, null);
});

test('hand tremor at the level of the real recording is not an error', () => {
  const { result, failReason } = simulate({ noiseGyro: 8, noiseAcc: 0.15, gyroAmp: 40, accAmp: 0.6 });
  assert.equal(failReason, null);
  assert.ok(result);
});

