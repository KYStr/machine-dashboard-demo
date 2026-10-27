import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine, downsample, taipeiDay } from '../shared/simulator.mjs';
const NOW = Date.parse('2026-10-26T06:27:18Z');
test('initial 3 machines have running / error / idle statuses', () => {
  const engine = new SimulationEngine({ now: NOW });
  const s = engine.snapshot();
  assert.deepEqual(s.counts, { all: 3, running: 1, idle: 1, error: 1 });
  assert.equal(s.machines[0].temperature, 62.4);
  assert.equal(s.machines[1].temperature, 96.8);
  assert.equal(s.mode, 'simulation');
});
test('seeded datasets are deterministic', () => {
  const a = new SimulationEngine({ now: NOW, seed: 42 });
  const b = new SimulationEngine({ now: NOW, seed: 42 });
  assert.deepEqual(a.history(), b.history());
  assert.deepEqual(a.tick(NOW + 5000), b.tick(NOW + 5000));
});
test('realtime updates numbers without moving idle machines', () => {
  const e = new SimulationEngine({ now: NOW });
  const before = e.snapshot(); const after = e.tick(NOW + 5000);
  assert.ok(after.revision > before.revision);
  assert.notEqual(after.machines[0].rpm, before.machines[0].rpm);
  assert.equal(after.machines[2].rpm, 0); assert.equal(after.machines[2].output, 0);
});
test('1 hour and 24 hours use the SAME stored data, not new random charts', () => {
  const e = new SimulationEngine({ now: NOW });
  const h = e.history(); const d = e.history({ range: '24h' });
  assert.equal(h.start, NOW - 3_600_000); assert.equal(d.start, NOW - 86_400_000);
  assert.equal(h.series[0].points.at(-1).value, 62.4);
  assert.equal(d.series[0].points.at(-1).value, 62.4);
  assert.deepEqual(e.history(), h);
});
test('history and realtime collections stay bounded', () => {
  const e = new SimulationEngine({ now: NOW });
  for (let i = 1; i <= 1600; i++) e.tick(NOW + i * 60_000);
  assert.ok(e.histories.get('MC-001').length <= 1442);
  assert.ok(e.realtime.get('MC-001').length <= 601);
  assert.ok(e.history({ range: '24h' }).series[0].points.length <= 289);
});
test('scaling to 60 and back to 3 preserves existing machines and clears removed history', () => {
  const e = new SimulationEngine({ now: NOW }); const first = e.machines[0];
  e.configure({ count: 60 }); assert.equal(e.snapshot().counts.all, 60); assert.equal(e.machines[0], first);
  e.configure({ count: 3 }); assert.equal(e.histories.size, 3); assert.equal(e.realtime.size, 3);
});
test('invalid configurations and history inputs are rejected', () => {
  const e = new SimulationEngine({ now: NOW });
  assert.throws(() => e.configure({ count: 100000 }), RangeError);
  assert.throws(() => e.configure({ intervalMs: 0 }), RangeError);
  assert.throws(() => e.configure({ paused: 'true' }), TypeError);
  assert.throws(() => e.history({ range: 'year' }), RangeError);
  assert.throws(() => e.history({ metric: 'password' }), RangeError);
  assert.throws(() => e.history({ ids: ['MC-999'] }), RangeError);
  assert.throws(() => e.history({ ids: ['MC-001', 'MC-001'] }), RangeError);
});
test('pausing stops telemetry updates', () => {
  const e = new SimulationEngine({ now: NOW }); e.configure({ paused: true });
  assert.deepEqual(e.tick(NOW + 5000), e.snapshot()); assert.equal(e.now, NOW);
});
test('production total is integral and resets at Taipei midnight', () => {
  const e = new SimulationEngine({ now: Date.parse('2026-10-26T15:59:59Z') });
  e.tick(Date.parse('2026-10-26T16:00:04Z'));
  assert.ok(e.machines[0].total < 10); assert.ok(Number.isInteger(e.machines[0].total));
  assert.equal(taipeiDay(Date.parse('2026-10-26T16:00:04Z')), '2026-10-27');
});
test('downsampling retains the first and last points', () => {
  const points = Array.from({ length: 1000 }, (_, t) => ({ t, value: t }));
  const sampled = downsample(points, 20);
  assert.equal(sampled.length, 20); assert.equal(sampled[0].t, 0); assert.equal(sampled.at(-1).t, 999);
});
