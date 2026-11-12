// Two short beeps made with the Web Audio API (same sounds as the v0.1 Android app:
// 1000 Hz and 600 Hz, 120 ms, 5 ms fade in/out to avoid clicks).

import { PROTOCOL } from './config.js?v=2488eb3';

export class Beeper {
  constructor() {
    this.ctx = null;
    this.buffers = {};
  }

  /** Must be called from a tap (browsers allow sound only after a user gesture). */
  unlock() {
    if (!this.ctx) {
      // iPhone: play through the media channel, so silent mode does not mute the beeps
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.buffers.high = this.tone(PROTOCOL.beepHighHz);
      this.buffers.low = this.tone(PROTOCOL.beepLowHz);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq) {
    const sr = this.ctx.sampleRate;
    const n = Math.round((sr * PROTOCOL.beepMs) / 1000);
    const ramp = Math.round(sr * 0.005);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / ramp, (n - 1 - i) / ramp);
      d[i] = 0.8 * env * Math.sin((2 * Math.PI * freq * i) / sr);
    }
    return buf;
  }

  /** Plays 'high' or 'low' now and returns the time of the call (performance.now()). */
  play(kind) {
    const t = performance.now();
    if (!this.ctx) return t;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[kind];
    src.connect(this.ctx.destination);
    src.start();
    return t;
  }

  info() {
    if (!this.ctx) return null;
    return {
      sample_rate: this.ctx.sampleRate,
      base_latency_s: this.ctx.baseLatency ?? null,
      output_latency_s: this.ctx.outputLatency ?? null,
    };
  }
}
