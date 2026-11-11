// Motion sensors through DeviceMotionEvent / DeviceOrientationEvent.
// Samples use event.timeStamp, which is on the same clock as performance.now()
// and as touch event timestamps.

export async function requestSensorPermission() {
  // iPhone/iPad (iOS 13+) ask the user; must be called from a tap
  const DM = window.DeviceMotionEvent;
  const DO = window.DeviceOrientationEvent;
  if (!DM) return 'unsupported';
  if (typeof DM.requestPermission === 'function') {
    try {
      const a = await DM.requestPermission();
      if (DO && typeof DO.requestPermission === 'function') {
        try { await DO.requestPermission(); } catch { /* orientation is optional */ }
      }
      return a === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'not_needed';
}

export class Sensors {
  constructor() {
    this.listeners = [];
    this.orientation = { oa: null, ob: null, og: null };
    this.info = { has_linear_acc: false, has_rotation: false, has_orientation: false, reported_interval_ms: null };
    this.running = false;
    this.onMotion = this.onMotion.bind(this);
    this.onOrientation = this.onOrientation.bind(this);
  }

  start() {
    if (this.running) return;
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('deviceorientation', this.onOrientation);
    this.running = true;
  }

  stop() {
    window.removeEventListener('devicemotion', this.onMotion);
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.running = false;
  }

  subscribe(f) {
    this.listeners.push(f);
  }

  onOrientation(e) {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    this.info.has_orientation = true;
    this.orientation = { oa: e.alpha, ob: e.beta, og: e.gamma };
  }

  onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const a = e.acceleration;
    const r = e.rotationRate;
    if (a && a.x != null) this.info.has_linear_acc = true;
    if (r && r.alpha != null) this.info.has_rotation = true;
    if (e.interval) this.info.reported_interval_ms = e.interval;
    const s = {
      t: e.timeStamp,
      ax: g.x, ay: g.y, az: g.z,
      lx: a?.x ?? null, ly: a?.y ?? null, lz: a?.z ?? null,
      // rotationRate: alpha = about z, beta = about x, gamma = about y (deg/s)
      gx: r?.beta ?? null, gy: r?.gamma ?? null, gz: r?.alpha ?? null,
      oa: this.orientation.oa, ob: this.orientation.ob, og: this.orientation.og,
    };
    for (const f of this.listeners) f(s);
  }
}
