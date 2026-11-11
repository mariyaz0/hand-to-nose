// Plan of one session: practice, then one block per hand.
// Speeds come in pairs (e.g. slow, slow, fast, fast, normal, normal); the order of the
// three speeds is random for each person and the same for both hands (docs/decisions.md D-30, D-31).
// No browser APIs here, so the plan can be tested in Node.

export function shuffle(a, rand = Math.random) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * @param {object} protocol  PROTOCOL from config.js
 * @param {'right'|'left'} firstHand
 * @param {() => number} [rand]
 * @returns {{plan: object[], speedOrder: string[]}}
 */
export function buildPlan(protocol, firstHand, rand = Math.random) {
  const other = firstHand === 'right' ? 'left' : 'right';
  const speedOrder = shuffle(protocol.speeds, rand);
  const speeds = speedOrder.flatMap((s) => Array(protocol.trialsPerSpeed).fill(s));
  const total = speeds.length * 2;

  const plan = [];
  for (let i = 0; i < protocol.practiceTrials; i++) {
    plan.push({ kind: 'practice', n: i + 1, total: protocol.practiceTrials, hand: firstHand, speed: protocol.practiceSpeed, block: null });
  }
  plan.push({ kind: 'notice' });
  let n = 0;
  speeds.forEach((speed) => plan.push({ kind: 'real', n: ++n, total, hand: firstHand, speed, block: 0 }));
  plan.push({ kind: 'rest', nextHand: other });
  speeds.forEach((speed) => plan.push({ kind: 'real', n: ++n, total, hand: other, speed, block: 1 }));
  return { plan, speedOrder };
}
