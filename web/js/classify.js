// Which hand made the movement: the test-mode prediction, computed in the browser.
// It repeats analysis/features.py step by step for the one feature of the final model
// (docs/decisions.md D-53): the net turn of the phone about its long axis (y) during the
// reach, from the high beep to the first nose touch. web/tests/classify.test.js checks
// that the result equals the Python code. No browser APIs here, so it runs in Node too.

import { MODEL } from './hand_model.js';

const P = MODEL.preprocessing;
const SIX = ['ax', 'ay', 'az', 'gz', 'gx', 'gy']; // acceleration + rotation (rot_x, rot_y, rot_z)

function num(v) {
  return v == null || Number.isNaN(v) ? NaN : v;
}

/** Centred moving average over n points; at the edges the window is shortened. */
export function movingAverage(x, n = P.smooth_points) {
  const h = Math.floor(n / 2);
  const out = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(x.length - 1, i + h); j++) { s += x[j]; c++; }
    out[i] = s / c;
  }
  return out;
}

/** Linear interpolation of (t, v) at the times `grid` (t increasing). */
export function interp(grid, t, v) {
  const out = new Array(grid.length);
  let k = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    if (g <= t[0]) { out[i] = v[0]; continue; }
    if (g >= t[t.length - 1]) { out[i] = v[v.length - 1]; continue; }
    while (t[k + 1] < g) k++;
    const f = (g - t[k]) / (t[k + 1] - t[k]);
    out[i] = v[k] + f * (v[k + 1] - v[k]);
  }
  return out;
}

/**
 * Samples of a trial on an even grid, smoothed: { t, rot_x, rot_y, rot_z } or null.
 * Like features.preprocess_trial: rows with a missing value are dropped, then readings that
 * repeat the previous one in all six values, and samples whose time does not increase.
 */
export function preprocess(samples) {
  const t0 = (samples?.t ?? []).map(num);
  if (t0.length < 10) return null;
  const cols = SIX.map((c) => (samples[c] ?? []).map(num));
  if (cols.some((c) => c.length !== t0.length)) return null;
  if (cols.slice(3).every((c) => c.every(Number.isNaN))) return null; // no rotation rate

  const ok = [];
  for (let i = 0; i < t0.length; i++) {
    if (!Number.isNaN(t0[i]) && cols.every((c) => !Number.isNaN(c[i]))) ok.push(i);
  }
  const keep = [];
  for (let k = 0; k < ok.length; k++) {
    if (k === 0) { keep.push(ok[k]); continue; }
    const i = ok[k];
    const j = ok[k - 1];
    const repeated = cols.every((c) => c[i] === c[j]);
    if (!repeated && t0[i] > t0[j]) keep.push(i);
  }
  if (keep.length < 10) return null;

  const t = keep.map((i) => t0[i]);
  const step = P.grid_ms;
  const n = Math.ceil((t[t.length - 1] + 1e-9 - t[0]) / step);
  const grid = Array.from({ length: n }, (_, i) => t[0] + i * step);
  const out = { t: grid };
  ['rot_x', 'rot_y', 'rot_z'].forEach((name, a) => {
    const v = keep.map((i) => cols[3 + a][i]);
    out[name] = movingAverage(interp(grid, t, v));
  });
  return out;
}

/** End of the reach: the first nose touch after the high beep (features.reach_end_ms). */
export function reachEnd(trial, zoneRadiusPx) {
  const beep = trial.t_beep_high_ms;
  const touch = trial.t_touch_start_ms;
  let best = null;
  for (const e of trial.touch_events ?? []) {
    if (e.type !== 'down' || beep == null || e.t == null || e.t <= beep) continue;
    let near = Boolean(e.in_zone);
    if (!near && zoneRadiusPx && e.x != null && e.y != null) {
      near = Math.hypot(e.x, e.y) <= P.touch_near_radii * zoneRadiusPx;
    }
    if (near && (best == null || e.t < best)) best = e.t;
  }
  if (touch != null && (best == null || touch < best)) best = touch;
  return best;
}

/**
 * The feature of one recorded trial.
 * @param {object} trial  the trial as saved: t_beep_high_ms, t_touch_start_ms, touch_events, samples
 * @param {number} zoneRadiusPx
 * @returns {{rot_y_angle: number|null, turned_deg: number|null, excluded: string|null}}
 */
export function reachFeature(trial, zoneRadiusPx) {
  const out = { rot_y_angle: null, turned_deg: null, excluded: null };
  const beep = trial.t_beep_high_ms;
  if (beep == null) { out.excluded = 'no high beep'; return out; }
  const d = preprocess(trial.samples);
  if (!d) { out.excluded = 'no rotation rate or too few samples'; return out; }
  const end = reachEnd(trial, zoneRadiusPx);
  if (end == null) { out.excluded = 'no nose touch'; return out; }
  if (end - beep < 200) { out.excluded = 'reach shorter than 0.2 s'; return out; }

  let nBase = 0;
  let nReach = 0;
  let angle = 0;
  let turned = 0;
  for (let i = 0; i < d.t.length; i++) {
    const ti = d.t[i];
    if (ti >= beep - P.baseline_ms && ti <= beep) nBase++;
    if (ti >= beep && ti <= end) {
      nReach++;
      angle += d.rot_y[i];
      turned += Math.hypot(d.rot_x[i], d.rot_y[i], d.rot_z[i]);
    }
  }
  if (nBase < 3 || nReach < 5) { out.excluded = 'recording does not cover the reach'; return out; }
  const dt = P.grid_ms / 1000;
  out.rot_y_angle = angle * dt;
  out.turned_deg = turned * dt;
  if (!(out.turned_deg >= P.min_total_rotation_deg)) {
    out.excluded = 'phone did not move';
    out.rot_y_angle = null;
  }
  return out;
}

/** P(left hand) from the feature values (logistic regression, MODEL). */
export function probabilityLeft(values) {
  let z = MODEL.intercept;
  MODEL.features.forEach((f, i) => {
    z += MODEL.weights[i] * (values[f] - MODEL.mean[i]) / MODEL.scale[i];
  });
  return 1 / (1 + Math.exp(-z));
}

/**
 * The test-mode answer for one recorded trial.
 * @returns {{hand: 'left'|'right'|null, confidence: number|null, pLeft: number|null,
 *            rot_y_angle: number|null, turned_deg: number|null, excluded: string|null,
 *            model_version: string}}
 */
export function predictHand(trial, zoneRadiusPx) {
  const f = reachFeature(trial, zoneRadiusPx);
  const res = { ...f, hand: null, confidence: null, pLeft: null, model_version: MODEL.model_version };
  if (f.excluded) return res;
  const p = probabilityLeft(f);
  res.pLeft = p;
  res.hand = p >= 0.5 ? 'left' : 'right';
  res.confidence = Math.max(p, 1 - p);
  return res;
}
