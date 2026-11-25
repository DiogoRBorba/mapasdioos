import test from 'node:test';
import assert from 'node:assert/strict';
import { COVER_MS, TRANSITION_MS, transitionCoverage, sameMoment, fogInterior } from '../shared/atmosphere.js';
import { readFile } from 'node:fs/promises';

test('cloud coverage fully hides the map before and after the period switch', () => {
  assert.equal(transitionCoverage(0), 0);
  assert.ok(transitionCoverage(400) > 0 && transitionCoverage(400) < 1);
  assert.equal(transitionCoverage(COVER_MS - 50), 1);
  assert.equal(transitionCoverage(COVER_MS), 1);
  assert.equal(transitionCoverage(COVER_MS + 200), 1);
  assert.ok(transitionCoverage(1700) > 0 && transitionCoverage(1700) < 1);
  assert.equal(transitionCoverage(TRANSITION_MS), 0);
  assert.equal(transitionCoverage(TRANSITION_MS + 1000), 0);
});

test('day-only and period-only changes trigger a transition, revision-only does not', () => {
  const moment = { day: 1, period: 'morning', revision: 1 };
  assert.equal(sameMoment(moment, { ...moment, day: 2 }), false);
  assert.equal(sameMoment(moment, { ...moment, period: 'night' }), false);
  assert.equal(sameMoment(moment, { ...moment, revision: 2 }), true);
});

test('ambient fog excludes the central city and restored asset stays below function response limit', async () => {
  assert.ok(fogInterior.left < .2 && fogInterior.left + fogInterior.width > .8);
  assert.ok(fogInterior.top < .2 && fogInterior.top + fogInterior.height > .8);
  const image = await readFile('private/maps/imortais-restored.png');
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.ok(image.readUInt32BE(16) > 1200);
  assert.ok(image.readUInt32BE(20) > 808);
  assert.ok(image.length < 4_500_000);
});
