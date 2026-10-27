import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from '../server/index.mjs';
import { SimulationEngine } from '../shared/simulator.mjs';
let server, base;
before(async () => {
  server = createDemoServer({ autoTick: false, engine: new SimulationEngine({ now: Date.parse('2026-10-26T06:27:18Z') }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await server.stopDemo(); });
const post = (path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
test('health and snapshot API identify simulated mode', async () => {
  const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.mode, 'simulation');
  const snapshot = await (await fetch(base + '/api/snapshot')).json(); assert.equal(snapshot.machines.length, 3);
});
test('history supports both requested ranges and rejects invalid inputs', async () => {
  for (const range of ['1h', '24h']) {
    const res = await fetch(base + `/api/history?range=${range}&ids=MC-001,MC-002&metric=rpm`);
    assert.equal(res.status, 200); assert.equal((await res.json()).series.length, 2);
  }
  assert.equal((await fetch(base + '/api/history?range=1y')).status, 400);
});
test('config API validates bounded machine counts and interval', async () => {
  assert.equal((await post('/api/demo/config', { count: 12 })).status, 200);
  assert.equal((await post('/api/demo/config', { count: 9999999 })).status, 400);
  assert.equal((await post('/api/demo/config', { intervalMs: -1 })).status, 400);
  assert.equal((await post('/api/demo/config', { arbitrary: 'field' })).status, 400);
});
test('scenario API records and resolves real mock events', async () => {
  const hot = await (await post('/api/demo/scenario', { machineId: 'MC-001', action: 'hot' })).json();
  assert.equal(hot.machines[0].status, 'error');
  const cool = await (await post('/api/demo/scenario', { machineId: 'MC-001', action: 'recover' })).json();
  assert.equal(cool.machines[0].status, 'running');
});
test('cross-origin mutation is rejected', async () => {
  assert.equal((await post('/api/demo/config', { count: 3 }, { Origin: 'https://untrusted.invalid' })).status, 403);
});
test('SSE responds with an initial snapshot, not just a fake live badge', async () => {
  const controller = new AbortController();
  const res = await fetch(base + '/api/events', { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const { value } = await res.body.getReader().read();
  assert.match(new TextDecoder().decode(value), /event: snapshot/);
  controller.abort();
});
test('unknown routes and repository internals are not exposed', async () => {
  assert.equal((await fetch(base + '/api/nope')).status, 404);
  assert.equal((await fetch(base + '/missing-page')).status, 404);
  assert.equal((await fetch(base + '/.git/config')).status, 403);
  assert.equal((await fetch(base + '/server/index.mjs')).status, 404);
});
test('malformed JSON and oversized bodies are rejected', async () => {
  assert.equal((await fetch(base + '/api/demo/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{' })).status, 400);
  assert.equal((await post('/api/demo/config', { count:'x'.repeat(9000) })).status, 400);
});
