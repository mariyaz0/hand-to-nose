// One trial as a state machine. No browser APIs here: the app feeds samples,
// touches and clock ticks; tests do the same with simulated data.
//
//   waitStill --still & upright--> pause --2 s--> go (high beep)
//   go --nose touch in zone (low beep)--> touching --nose leaves--> returning
//   returning --still & upright--> finishing --postMs--> done
//
// Failures: moved during the pause (false_start), no touch within 10 s (no_touch),
// app sent to the background (interrupted).

import { windowStats, isStill, MoveDetector, toColumns } from './motion.js?v=2488eb3';

export const STATE = {
  IDLE: 'idle',
  WAIT_STILL: 'waitStill',
  PAUSE: 'pause',
  GO: 'go',
  TOUCHING: 'touching',
  RETURNING: 'returning',
  FINISHING: 'finishing',
  DONE: 'done',
  FAILED: 'failed',
};

const ACTIVE = new Set([STATE.WAIT_STILL, STATE.PAUSE, STATE.GO, STATE.TOUCHING, STATE.RETURNING, STATE.FINISHING]);

export class TrialRunner {
  /**
   * @param {object} o
   * @param {SampleBuffer} o.buffer   shared buffer of motion samples
   * @param {object} o.params         DETECT settings (config.js)
   * @param {() => number} o.playHigh plays the high beep, returns its time (ms)
   * @param {() => number} o.playLow  plays the low beep, returns its time (ms)
   * @param {(state: string) => void} [o.onState]
   * @param {(result: object) => void} o.onDone
   * @param {(reason: string) => void} o.onFail
   * @param {number} [o.expectedRateHz]
   */
  constructor(o) {
    this.buffer = o.buffer;
    this.p = o.params;
    this.playHigh = o.playHigh;
    this.playLow = o.playLow;
    this.onState = o.onState ?? (() => {});
    this.onDone = o.onDone;
    this.onFail = o.onFail;
    this.expectedRateHz = o.expectedRateHz ?? 60;
    this.state = STATE.IDLE;
    this.lastStats = null;
  }

  get active() {
    return ACTIVE.has(this.state);
  }

  start(now) {
    this.tStart = now;
    this.tStill = null;
    this.tPauseEnd = null;
    this.tBeepHigh = null;
    this.tTouchStart = null;
    this.tTouchEnd = null;
    this.tReturnFrom = null;
    this.tRest = null;
    this.tEnd = null;
    this.touchId = null;
    this.touchX = null;
    this.touchY = null;
    this.touches = [];
    this.move = null;
    this.setState(STATE.WAIT_STILL);
  }

  setState(s) {
    this.state = s;
    this.onState(s);
  }

  /** Called for every motion sample (after it was pushed into the buffer). */
  onSample(s) {
    if (this.state === STATE.PAUSE && this.move && this.move.push(s)) {
      this.fail('false_start');
    }
  }

  /** Called often (every ~10 ms) with the current time. */
  tick(now) {
    const p = this.p;
    switch (this.state) {
      case STATE.WAIT_STILL: {
        const st = windowStats(this.buffer, now, p.stillWindowMs, this.expectedRateHz);
        this.lastStats = st;
        if (isStill(st, p)) {
          this.tStill = now - p.stillWindowMs;
          this.move = new MoveDetector(p, st.accMean);
          this.tPauseEnd = now + p.pauseMs;
          this.setState(STATE.PAUSE);
        }
        break;
      }
      case STATE.PAUSE:
        if (now >= this.tPauseEnd) {
          this.tBeepHigh = this.playHigh() ?? now;
          this.setState(STATE.GO);
        }
        break;
      case STATE.GO:
        if (now - this.tBeepHigh > p.noTouchTimeoutMs) this.fail('no_touch');
        break;
      case STATE.TOUCHING:
        if (now - this.tTouchStart > p.touchHoldTimeoutMs) {
          this.tReturnFrom = now;
          this.setState(STATE.RETURNING);
        }
        break;
      case STATE.RETURNING: {
        // only a window that starts after the nose left the screen counts
        if (now - p.stillWindowMs >= this.tReturnFrom) {
          const st = windowStats(this.buffer, now, p.stillWindowMs, this.expectedRateHz);
          this.lastStats = st;
          if (isStill(st, p)) {
            this.tRest = now - p.stillWindowMs;
            this.tEnd = now + p.postMs;
            this.setState(STATE.FINISHING);
            break;
          }
        }
        if (now - this.tReturnFrom > p.returnTimeoutMs) {
          this.tRest = null;
          this.tEnd = now;
          this.setState(STATE.FINISHING);
        }
        break;
      }
      case STATE.FINISHING:
        if (now >= this.tEnd) this.finish();
        break;
      default:
        break;
    }
  }

  /**
   * A touch on the screen.
   * @param {{type: 'down'|'up'|'cancel', id: number, t: number, x: number, y: number, inZone: boolean}} e
   *        x, y: position relative to the dot centre (CSS px)
   */
  onTouch(e) {
    if (!this.active) return;
    this.touches.push({ type: e.type, id: e.id, t: e.t, x: round(e.x, 1), y: round(e.y, 1), in_zone: e.inZone, state: this.state });

    if (e.type === 'down' && e.inZone) {
      if (this.state === STATE.PAUSE) {
        this.fail('false_start');
      } else if (this.state === STATE.GO && this.touchId == null) {
        this.touchId = e.id;
        this.tTouchStart = e.t;
        this.touchX = e.x;
        this.touchY = e.y;
        this.playLow();
        this.setState(STATE.TOUCHING);
      }
    } else if ((e.type === 'up' || e.type === 'cancel') && this.state === STATE.TOUCHING && e.id === this.touchId) {
      this.tTouchEnd = e.t;
      this.tReturnFrom = e.t;
      this.setState(STATE.RETURNING);
    }
  }

  /** Stop the trial from outside (e.g. the app went to the background). */
  abort(reason) {
    if (this.active) this.fail(reason);
  }

  fail(reason) {
    this.setState(STATE.FAILED);
    this.onFail(reason);
  }

  finish() {
    const p = this.p;
    const samples = this.buffer.slice(this.tStill - p.preMs, this.tEnd);
    const t0 = samples.length ? samples[0].t : this.tStill - p.preMs;
    const rel = (x) => (x == null ? null : round(x - t0, 1));
    const rate = samples.length > 1 ? (1000 * (samples.length - 1)) / (samples[samples.length - 1].t - t0) : null;

    const result = {
      t_beep_high_ms: rel(this.tBeepHigh),
      t_touch_start_ms: rel(this.tTouchStart),
      t_touch_end_ms: rel(this.tTouchEnd),
      t_rest_ms: rel(this.tRest),
      touch_x_px: round(this.touchX, 1),
      touch_y_px: round(this.touchY, 1),
      touch_events: this.touches.map((e) => ({ ...e, t: rel(e.t) })),
      sample_rate_hz: rate == null ? null : round(rate, 2),
      n_samples: samples.length,
      samples: toColumns(samples, t0),
    };
    this.setState(STATE.DONE);
    this.onDone(result);
  }
}

function round(x, d) {
  if (x == null || Number.isNaN(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
