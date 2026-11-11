// Animated side view of the movement for the explanation screen.
// A two-segment arm (upper arm + forearm) moves the phone from the extended
// position to the nose and back; the elbow position is found by inverse kinematics.

const NS = 'http://www.w3.org/2000/svg';
const S = { x: 88, y: 98 };          // shoulder
const L1 = 62;                        // upper arm
const L2 = 60;                        // forearm
const HAND_OFFSET = { x: 6, y: 6 };   // hand is behind/below the phone centre
const P_EXT = { x: 196, y: 57 };      // phone centre, arm extended
const P_NOSE = { x: 127, y: 57 };     // phone centre, screen touching the nose

// timeline (ms) of one loop and the step shown in the caption list (0-based)
const T = { beep: 1500, moveStart: 1900, touch: 3400, back: 3700, rest: 5200, loop: 8000 };

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function ease(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

function elbow(h) {
  const dx = h.x - S.x;
  const dy = h.y - S.y;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, L1 + L2 - 0.01);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / Math.hypot(dx, dy);
  const uy = dy / Math.hypot(dx, dy);
  const bx = S.x + a * ux;
  const by = S.y + a * uy;
  // two solutions; take the one below the shoulder-hand line (larger y)
  const e1 = { x: bx - hh * uy, y: by + hh * ux };
  const e2 = { x: bx + hh * uy, y: by - hh * ux };
  return e1.y > e2.y ? e1 : e2;
}

export function createDemo(container, { onStep, onBeep, label }) {
  const svg = el('svg', { viewBox: '0 0 260 190', class: 'demo-svg', role: 'img' }, null);
  container.replaceChildren(svg);

  // body
  el('circle', { cx: 90, cy: 55, r: 24, class: 'demo-head' }, svg);
  el('path', { d: 'M112 50 L123 57 L112 63 Z', class: 'demo-head' }, svg);       // nose
  el('circle', { cx: 101, cy: 50, r: 2.2, class: 'demo-ink' }, svg);              // eye
  el('path', { d: 'M86 79 L84 92 M84 92 Q78 130 80 172', class: 'demo-body' }, svg);
  el('path', { d: 'M60 172 L120 172', class: 'demo-ground' }, svg);
  el('line', { x1: 123, y1: 57, x2: 205, y2: 57, class: 'demo-sight' }, svg);    // line of sight

  const upper = el('line', { class: 'demo-arm' }, svg);
  const fore = el('line', { class: 'demo-arm' }, svg);
  const hand = el('circle', { r: 6, class: 'demo-hand' }, svg);
  const phone = el('rect', { width: 7, height: 34, rx: 2, class: 'demo-phone' }, svg);
  const screen = el('line', { class: 'demo-screen' }, svg);
  const beepText = el('text', { x: 200, y: 26, class: 'demo-beep', 'text-anchor': 'end' }, svg);
  const check = el('text', { x: 200, y: 110, class: 'demo-check', 'text-anchor': 'end' }, svg);

  let raf = null;
  let t0 = 0;
  let lastStep = -1;
  let beeped = { high: false, low: false };

  function draw(p) {
    const h = { x: p.x + HAND_OFFSET.x, y: p.y + HAND_OFFSET.y };
    const e = elbow(h);
    upper.setAttribute('x1', S.x); upper.setAttribute('y1', S.y);
    upper.setAttribute('x2', e.x); upper.setAttribute('y2', e.y);
    fore.setAttribute('x1', e.x); fore.setAttribute('y1', e.y);
    fore.setAttribute('x2', h.x); fore.setAttribute('y2', h.y);
    hand.setAttribute('cx', h.x); hand.setAttribute('cy', h.y);
    phone.setAttribute('x', p.x - 3.5); phone.setAttribute('y', p.y - 17);
    screen.setAttribute('x1', p.x - 3.5); screen.setAttribute('y1', p.y - 15);
    screen.setAttribute('x2', p.x - 3.5); screen.setAttribute('y2', p.y + 15);
  }

  function lerp(a, b, u) {
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }

  function frame(now) {
    const t = (now - t0) % T.loop;
    if (t < 50) beeped = { high: false, low: false };
    let p = P_EXT;
    let step = 0;
    if (t >= T.beep) step = 1;
    if (t >= T.moveStart && t < T.touch) { p = lerp(P_EXT, P_NOSE, ease((t - T.moveStart) / (T.touch - T.moveStart))); step = 2; }
    if (t >= T.touch && t < T.back) { p = P_NOSE; step = 3; }
    if (t >= T.back && t < T.rest) { p = lerp(P_NOSE, P_EXT, ease((t - T.back) / (T.rest - T.back))); step = 4; }
    if (t >= T.rest) { p = P_EXT; step = 4; }
    draw(p);

    beepText.textContent = t >= T.beep && t < T.beep + 700 ? `♪ ${label('demo_beep_high')}` : t >= T.touch && t < T.touch + 700 ? `♪ ${label('demo_beep_low')}` : '';
    beepText.setAttribute('class', t >= T.touch ? 'demo-beep low' : 'demo-beep');
    check.textContent = t >= T.rest + 300 && t < T.loop - 300 ? '✓' : '';

    if (!beeped.high && t >= T.beep) { beeped.high = true; onBeep?.('high'); }
    if (!beeped.low && t >= T.touch) { beeped.low = true; onBeep?.('low'); }
    if (step !== lastStep) { lastStep = step; onStep?.(step); }
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      this.stop();
      t0 = performance.now();
      lastStep = -1;
      beeped = { high: false, low: false };
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    },
    drawStatic() {
      draw(P_EXT);
    },
  };
}
