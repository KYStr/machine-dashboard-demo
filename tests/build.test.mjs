import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import vm from 'node:vm';
const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');
before(() => { execFileSync(process.execPath, ['scripts/build.mjs', '--site-url', 'https://example.invalid/machine-dashboard-demo/'], { cwd: root }); });
test('public build has unique canonical URLs, indexable metadata and static readable content', async () => {
  const index = await read('dist/index.html'), about = await read('dist/about.html');
  assert.match(index, /rel="canonical" href="https:\/\/example.invalid\/machine-dashboard-demo\/"/);
  assert.match(about, /rel="canonical" href="https:\/\/example.invalid\/machine-dashboard-demo\/about.html"/);
  assert.match(index, /name="robots" content="index,follow/);
  assert.match(index, /<h1[^>]*>產線即時總覽<\/h1>/);
  assert.match(about, /資料目前保存在記憶體/);
  assert.match(index, /lang="zh-Hant"/);
});
test('JSON-LD contains real descriptive fields without fabricated reviews', async () => {
  const html = await read('dist/index.html');
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.inLanguage, 'zh-Hant');
  assert.equal(data.isAccessibleForFree, true);
  assert.equal(data.aggregateRating, undefined);
});
test('sitemap and robots use the configured deployment base path', async () => {
  const sitemap = await read('dist/sitemap.xml'), robots = await read('dist/robots.txt');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
  assert.match(sitemap, /https:\/\/example.invalid\/machine-dashboard-demo\/about.html/);
  assert.match(robots, /Disallow: \/machine-dashboard-demo\/api\//);
  assert.match(robots, /Sitemap: https:\/\/example.invalid\/machine-dashboard-demo\/sitemap.xml/);
});
test('standalone preview contains parseable JS with no remaining module imports', async () => {
  const html = await read('artifacts/preview.html');
  const script = html.match(/<script>(.*?)<\/script>/s)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(script, /^import\s/m);
  assert.match(html, /__PORTABLE_DEMO__ = true/);
  assert.doesNotMatch(html, /rel="manifest"/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
});
test('manifest is subpath-safe and every advertised PNG exists at the promised size', async () => {
  const manifest = JSON.parse(await read('dist/manifest.webmanifest'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
  for (const entry of manifest.icons) {
    const png = await readFile(resolve(root, 'dist', entry.src));
    const [w, h] = entry.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h);
  }
});
test('service worker build is valid and precaches existing resources only', async () => {
  const sw = await read('dist/sw.js');
  assert.doesNotThrow(() => new vm.Script(sw));
  assert.doesNotMatch(sw, /__BUILD_HASH__|__PRECACHE_ASSETS__/);
  const assets = JSON.parse(sw.match(/const ASSETS = (.*?);/)[1]);
  for (const asset of assets.filter(s => s !== './')) assert.ok((await stat(resolve(root, 'dist', asset))).isFile());
  assert.ok(assets.includes('./shared/alerts.mjs')); assert.ok(assets.includes('./src/app.js'));
});
test('service worker never intercepts API, SSE, cross-origin or write requests', async () => {
  const handlers = new Map();
  vm.runInNewContext(await read('dist/sw.js'), { self: { addEventListener: (name, fn) => handlers.set(name, fn), location: { origin: 'https://example.invalid' } }, URL });
  const handler = handlers.get('fetch');
  for (const request of [
    { url: 'https://example.invalid/api/events', method: 'GET' },
    { url: 'https://example.invalid/machine-dashboard-demo/api/snapshot', method: 'GET' },
    { url: 'https://other.invalid/src/app.js', method: 'GET' },
    { url: 'https://example.invalid/something', method: 'POST' },
  ]) {
    let intercepted = false;
    handler({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
test('offline navigation falls back to a cached app shell', async () => {
  const handlers = new Map();
  const shell = new Response('<h1>Cached demo</h1>', { headers: { 'Content-Type': 'text/html' } });
  vm.runInNewContext(await read('dist/sw.js'), {
    self: { addEventListener: (name, fn) => handlers.set(name, fn), location: { origin: 'https://example.invalid' } }, URL, Response,
    fetch: () => Promise.reject(new Error('Offline')),
    caches: { match: async request => request === './index.html' ? shell : undefined },
  });
  let result;
  handlers.get('fetch')({ request: { url: 'https://example.invalid/', method: 'GET', mode: 'navigate' }, respondWith(promise) { result = promise; } });
  assert.equal(await (await result).text(), '<h1>Cached demo</h1>');
});
test('native configuration uses local bundled assets, not an unapproved remote URL', async () => {
  const config = JSON.parse(await read('capacitor.config.json'));
  assert.equal(config.webDir, 'dist'); assert.equal(config.server.url, undefined);
});
