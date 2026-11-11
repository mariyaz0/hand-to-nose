import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../js/plan.js';
import { PROTOCOL } from '../js/config.js';

for (const firstHand of ['right', 'left']) {
  test(`plan (${firstHand} first): speeds in pairs, same order for both hands`, () => {
    for (let k = 0; k < 50; k++) {
      const { plan, speedOrder } = buildPlan(PROTOCOL, firstHand);
      const real = plan.filter((p) => p.kind === 'real');
      assert.equal(plan.filter((p) => p.kind === 'practice').length, PROTOCOL.practiceTrials);
      assert.equal(real.length, 12);
      assert.deepEqual([...speedOrder].sort(), ['fast', 'normal', 'slow']);
      const b0 = real.filter((p) => p.block === 0);
      const b1 = real.filter((p) => p.block === 1);
      assert.ok(b0.every((p) => p.hand === firstHand));
      assert.ok(b1.every((p) => p.hand !== firstHand));
      const expected = speedOrder.flatMap((s) => [s, s]);
      assert.deepEqual(b0.map((p) => p.speed), expected);
      assert.deepEqual(b1.map((p) => p.speed), expected);
      assert.deepEqual(real.map((p) => p.n), [...Array(12).keys()].map((i) => i + 1));
      // order of items: practice, notice, block 0, rest, block 1
      assert.deepEqual(plan.map((p) => p.kind).filter((k2, i, a) => k2 !== a[i - 1]), ['practice', 'notice', 'real', 'rest', 'real']);
    }
  });
}

test('all 6 speed orders occur', () => {
  const seen = new Set();
  for (let k = 0; k < 500; k++) seen.add(buildPlan(PROTOCOL, 'right').speedOrder.join(','));
  assert.equal(seen.size, 6);
});
