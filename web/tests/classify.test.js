// The test-mode prediction in the browser (web/js/classify.js) must give the same
// numbers as the Python analysis (analysis/features.py + the exported model).
// Fixture: synthetic trials, written by web/tests/make_classify_fixture.py.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { predictHand, reachFeature, movingAverage, interp, probabilityLeft } from '../js/classify.js';
import { MODEL } from '../js/hand_model.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/classify.json', import.meta.url), 'utf8'));
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('fixture was made with the current model', () => {
  assert.equal(fixture.model_version, MODEL.model_version);
});

for (const c of fixture.cases) {
  test(`same result as Python: ${c.name}`, () => {
    const f = reachFeature(c.trial, c.zone_r_px);
    const e = c.expected;
    assert.equal(f.excluded != null, e.excluded != null, `excluded: ${f.excluded} vs ${e.excluded}`);
    assert.ok(close(f.turned_deg, e.turned_deg), `turned ${f.turned_deg} vs ${e.turned_deg}`);
    if (e.rot_y_angle == null) {
      assert.equal(f.rot_y_angle, null);
    } else {
      assert.ok(close(f.rot_y_angle, e.rot_y_angle), `angle ${f.rot_y_angle} vs ${e.rot_y_angle}`);
      const r = predictHand(c.trial, c.zone_r_px);
      assert.ok(close(r.pLeft, e.p_left), `p ${r.pLeft} vs ${e.p_left}`);
      assert.equal(r.hand, e.p_left >= 0.5 ? 'left' : 'right');
    }
  });
}

test('moving average shortens the window at the edges', () => {
  assert.deepEqual(movingAverage([0, 0, 10, 0, 0], 5), [10 / 3, 2.5, 2, 2.5, 10 / 3]);
});

test('linear interpolation', () => {
  assert.deepEqual(interp([0, 5, 10, 15], [0, 10], [0, 20]), [0, 10, 20, 20]);
});

test('a negative turn means left, a positive turn means right', () => {
  assert.ok(probabilityLeft({ rot_y_angle: -10 }) > 0.95);
  assert.ok(probabilityLeft({ rot_y_angle: 10 }) < 0.05);
});

test('no answer when the phone did not move', () => {
  const still = fixture.cases.find((c) => c.expected.excluded != null);
  const r = predictHand(still.trial, still.zone_r_px);
  assert.equal(r.hand, null);
  assert.equal(r.confidence, null);
  assert.ok(r.excluded);
});
