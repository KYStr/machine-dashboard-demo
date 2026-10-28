import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from '../server/index.mjs';

async function fixture(run) {
  const server = createDemoServer({ autoTick: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = data => fetch(`${base}/api/demo/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  try { await run({ base, post }); } finally { await server.stopDemo(); }
}

test('count-only changes apply 12/30/60/3 immediately and preserve update settings', async () => {
  await fixture(async ({ base, post }) => {
    await post({ intervalMs: 1000, paused: true });
    let revision = 0;
    for (const count of [12, 30, 60, 3]) {
      const response = await post({ count });
      assert.equal(response.status, 200);
      const updated = await response.json();
      assert.equal(updated.machines.length, count);
      assert.equal(updated.counts.all, count);
      assert.equal(updated.intervalMs, 1000);
      assert.equal(updated.paused, true);
      assert.equal(new Set(updated.machines.map(m => m.id)).size, count);
      assert.ok(updated.revision > revision);
      revision = updated.revision;
      const fresh = await (await fetch(`${base}/api/snapshot`)).json();
      assert.equal(fresh.machines.length, count);
      assert.equal(fresh.revision, revision);
    }
  });
});

test('invalid count changes leave the applied snapshot intact and permit a retry', async () => {
  await fixture(async ({ base, post }) => {
    const previous = await (await post({ count: 30 })).json();
    assert.equal((await post({ count: 99 })).status, 400);
    const actual = await (await fetch(`${base}/api/snapshot`)).json();
    assert.equal(actual.machines.length, 30);
    assert.equal(actual.revision, previous.revision);
    assert.equal((await (await post({ count: 12 })).json()).machines.length, 12);
  });
});

test('SSE publishes new machine counts even while the simulator is paused', async () => {
  await fixture(async ({ base, post }) => {
    await post({ paused: true });
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const stream = await fetch(`${base}/api/events`, { signal: controller.signal });
      const reader = stream.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      async function nextSnapshot() {
        for (;;) {
          const boundary = pending.indexOf('\n\n');
          if (boundary >= 0) {
            const packet = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const data = packet.split('\n').find(line => line.startsWith('data: '));
            if (data) return JSON.parse(data.slice(6));
          } else {
            const { value, done } = await reader.read();
            assert.equal(done, false, 'SSE must stay open while configuration changes');
            pending += decoder.decode(value, { stream: true });
          }
        }
      }
      assert.equal((await nextSnapshot()).machines.length, 3);
      for (const count of [12, 30, 60, 3]) {
        const response = await post({ count });
        await response.json();
        const snapshot = await nextSnapshot();
        assert.equal(snapshot.machines.length, count);
        assert.equal(snapshot.paused, true);
      }
    } finally { clearTimeout(deadline); controller.abort(); }
  });
});
