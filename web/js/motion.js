// Pure helpers for motion samples. No browser APIs here, so they can be tested in Node.
//
// A sample is {t, ax, ay, az, lx, ly, lz, gx, gy, gz, oa, ob, og}:
//   t           ms (event timestamp, same clock as performance.now())
//   ax, ay, az  acceleration including gravity, m/s^2
//   lx, ly, lz  acceleration without gravity, m/s^2 (may be null)
//   gx, gy, gz  rotation rate about the x, y, z axes, deg/s (may be null)
//   oa, ob, og  device orientation alpha, beta, gamma, deg (may be null)

export const CHANNELS = ['t', 'ax', 'ay', 'az', 'lx', 'ly', 'lz', 'gx', 'gy', 'gz', 'oa', 'ob', 'og'];

export function accMag(s) {
  return Math.hypot(s.ax ?? 0, s.ay ?? 0, s.az ?? 0);
}

export function gyroMag(s) {
  if (s.gx == null && s.gy == null && s.gz == null) return null;
  return Math.hypot(s.gx ?? 0, s.gy ?? 0, s.gz ?? 0);
}

/** Keeps the last `keepMs` of samples, ordered by time. */
export class SampleBuffer {
  constructor(keepMs = 60000) {
    this.keepMs = keepMs;
    this.samples = [];
  }

  push(s) {
    this.samples.push(s);
    const cutoff = s.t - this.keepMs;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++;
    if (drop > 0) this.samples.splice(0, drop);
  }

  /** Samples with t0 <= t <= t1. */
  slice(t0, t1) {
    return this.samples.filter((s) => s.t >= t0 && s.t <= t1);
  }

  last() {
    return this.samples[this.samples.length - 1] ?? null;
  }

  clear() {
    this.samples = [];
  }

  /** Mean sampling rate over the last `ms` milliseconds (Hz), or null. */
  rate(ms = 2000) {
    const last = this.last();
    if (!last) return null;
    const w = this.slice(last.t - ms, last.t);
    if (w.length < 2) return null;
    return (1000 * (w.length - 1)) / (w[w.length - 1].t - w[0].t);
  }
}

/**
 * Statistics of the window that ends at `now`.
 * Returns {n, gyroRms, accStd, accMean, upright, coverage, spanFraction}.
 */
export function windowStats(buffer, now, windowMs, expectedRateHz = 60) {
  const w = buffer.slice(now - windowMs, now);
  const n = w.length;
  if (n === 0) return { n: 0, gyroRms: null, accStd: null, accMean: null, upright: null, coverage: 0, spanFraction: 0 };

  const mags = w.map(accMag);
  const accMean = mags.reduce((a, b) => a + b, 0) / n;
  const accStd = Math.sqrt(mags.reduce((a, m) => a + (m - accMean) ** 2, 0) / n);

  const g = w.map(gyroMag).filter((x) => x != null);
  const gyroRms = g.length ? Math.sqrt(g.reduce((a, x) => a + x * x, 0) / g.length) : null;

  const ayAbs = w.reduce((a, s) => a + Math.abs(s.ay ?? 0), 0) / n;
  const upright = accMean > 0 ? ayAbs / accMean : 0;

  const expected = (windowMs / 1000) * expectedRateHz;
  const spanFraction = (now - w[0].t) / windowMs; // does the data really cover the window?
  return { n, gyroRms, accStd, accMean, upright, coverage: n / expected, spanFraction };
}

/** Is the phone held still and upright during the window ending at `now`? */
export function isStill(stats, p) {
  if (stats.n === 0 || stats.coverage < p.minSamplesFraction || stats.spanFraction < 0.9) return false;
  if (stats.accStd > p.stillAccStd) return false;
  if (stats.gyroRms != null && stats.gyroRms > p.stillGyroRms) return false;
  return stats.upright >= p.uprightMin;
}

/** Detects the start of a movement compared with a resting baseline. */
export class MoveDetector {
  constructor(p, baselineAcc) {
    this.p = p;
    this.baseline = baselineAcc;
    this.gyroRun = 0;
    this.accRun = 0;
  }

  /** Returns true once the movement threshold has been exceeded long enough. */
  push(s) {
    const g = gyroMag(s);
    this.gyroRun = g != null && g > this.p.moveGyro ? this.gyroRun + 1 : 0;
    const dev = Math.abs(accMag(s) - this.baseline);
    this.accRun = dev > this.p.moveAccDev ? this.accRun + 1 : 0;
    return this.gyroRun >= this.p.moveSamples || this.accRun >= this.p.moveSamples;
  }
}

/** Columnar, rounded representation of samples, with time relative to t0. */
export function toColumns(samples, t0) {
  const digits = { t: 1, ax: 3, ay: 3, az: 3, lx: 3, ly: 3, lz: 3, gx: 2, gy: 2, gz: 2, oa: 2, ob: 2, og: 2 };
  const out = {};
  for (const c of CHANNELS) {
    const f = 10 ** digits[c];
    out[c] = samples.map((s) => {
      const v = c === 't' ? s.t - t0 : s[c];
      return v == null || Number.isNaN(v) ? null : Math.round(v * f) / f;
    });
  }
  return out;
}
