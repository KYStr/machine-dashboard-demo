import test from 'node:test';
import assert from 'node:assert/strict';
import { temperatureState } from '../shared/alerts.mjs';
import { SimulationEngine } from '../shared/simulator.mjs';
const NOW = Date.parse('2026-10-26T06:27:18Z');
test('threshold boundary is inclusive and warning starts five degrees earlier', () => {
  assert.equal(temperatureState(74.9, 80), 'normal');
  assert.equal(temperatureState(75, 80), 'warning');
  assert.equal(temperatureState(79.9, 80), 'warning');
  assert.equal(temperatureState(80, 80), 'critical');
});
test('hysteresis prevents alarm flicker', () => {
  assert.equal(temperatureState(78, 80, 'critical'), 'critical');
  assert.equal(temperatureState(76, 80, 'critical'), 'warning');
  assert.equal(temperatureState(73, 80, 'warning'), 'warning');
  assert.equal(temperatureState(71, 80, 'warning'), 'normal');
});
test('invalid temperatures and states are rejected', () => {
  assert.throws(() => temperatureState(NaN), TypeError);
  assert.throws(() => temperatureState(Infinity), TypeError);
  assert.throws(() => temperatureState(60, 80, 'bad'), RangeError);
});
test('hot scenario creates an active event and changes status', () => {
  const e = new SimulationEngine({ now: NOW });
  const count = e.alerts.length;
  e.scenario('MC-001', 'hot', NOW + 1000);
  assert.equal(e.machines[0].status, 'error');
  assert.equal(e.alerts.length, count + 1);
  assert.equal(e.alerts[0].active, true);
  assert.equal(e.alerts[0].machineId, 'MC-001');
});
test('repeated hot scenario and ticks do not flood alerts', () => {
  const e = new SimulationEngine({ now: NOW });
  e.scenario('MC-001', 'hot', NOW + 1000);
  const count = e.alerts.length;
  e.scenario('MC-001', 'hot', NOW + 2000);
  for (let i = 1; i <= 12; i++) e.tick(NOW + 2000 + i * 5000);
  assert.equal(e.alerts.length, count);
});
test('recovery resolves the existing event and preserves its record', () => {
  const e = new SimulationEngine({ now: NOW });
  e.scenario('MC-001', 'hot', NOW + 1000);
  const eventId = e.alerts[0].id;
  e.scenario('MC-001', 'recover', NOW + 2000);
  const prior = e.alerts.find(a => a.id === eventId);
  assert.equal(prior.active, false); assert.equal(prior.resolvedAt, NOW + 2000);
  assert.equal(e.alerts[0].level, 'info'); assert.equal(e.machines[0].status, 'running');
  assert.equal(e.machines[0].alarmState, 'normal');
});
test('idle machine returns to idle after recovery', () => {
  const e = new SimulationEngine({ now: NOW });
  e.scenario('MC-003', 'hot', NOW + 1000); assert.equal(e.machines[2].status, 'error');
  e.scenario('MC-003', 'recover', NOW + 2000); assert.equal(e.machines[2].status, 'idle');
  assert.equal(e.machines[2].rpm, 0);
});
test('history latest point matches scenario value', () => {
  const e = new SimulationEngine({ now: NOW });
  e.scenario('MC-001', 'hot', NOW + 1000);
  assert.equal(e.history().series[0].points.at(-1).value, 96.8);
});
test('event store is bounded and active alarms survive eviction', () => {
  const e = new SimulationEngine({ now: NOW });
  for (let i = 0; i < 270; i++) {
    e.scenario('MC-001', 'hot', NOW + i * 2000);
    e.scenario('MC-001', 'recover', NOW + i * 2000 + 1000);
  }
  assert.ok(e.alerts.length <= 500);
  assert.ok(e.alerts.some(a => a.machineId === 'MC-002' && a.active));
});
test('new machine-count configurations have coherent initial alarms', () => {
  const e = new SimulationEngine({ now: NOW }); e.configure({ count: 30 });
  const activeCritical = new Set(e.alerts.filter(a => a.active && a.level === 'critical').map(a => a.machineId));
  const errorMachines = e.machines.filter(m => m.status === 'error').map(m => m.id);
  assert.deepEqual([...activeCritical].sort(), errorMachines.sort());
});
