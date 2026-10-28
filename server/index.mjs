/** Built-in Node HTTP server: bounded, in-memory mock REST + SSE API. */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SimulationEngine } from '../shared/simulator.mjs';
const ROOT = resolve(import.meta.dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
function sendJson(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new RangeError('Request body is too large'); chunks.push(chunk); }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new TypeError('Expected application/json');
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new TypeError('Expected a JSON object');
  return parsed;
}
export function createDemoServer({ engine = new SimulationEngine(), staticRoot = ROOT, autoTick = true } = {}) {
  const clients = new Set();
  let timer; let heartbeat;
  const broadcast = () => {
    const data = `event: snapshot\ndata: ${JSON.stringify(engine.snapshot())}\n\n`;
    clients.forEach(client => {
      if (client.destroyed || client.writableLength > 1_048_576) { client.destroy(); clients.delete(client); }
      else client.write(data);
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!autoTick) return;
    timer = setTimeout(() => { engine.tick(); broadcast(); schedule(); }, engine.intervalMs);
    timer.unref();
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Only local scripts are permitted. Inline styles are used for chart series.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'machine-dashboard-demo', mode: 'simulation', transport: 'sse', version: '1.0.0' });
        if (req.method === 'GET' && url.pathname === '/api/snapshot') return sendJson(res, 200, engine.snapshot());
        if (req.method === 'GET' && url.pathname === '/api/history') {
          return sendJson(res, 200, engine.history({ ids: url.searchParams.get('ids')?.split(',') || undefined, metric: url.searchParams.get('metric') || 'temperature', range: url.searchParams.get('range') || '1h' }));
        }
        if (req.method === 'GET' && url.pathname === '/api/events') {
          if (clients.size >= 100) return sendJson(res, 503, { error: 'Demo connection limit reached' });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(`retry: 3000\nevent: snapshot\ndata: ${JSON.stringify(engine.snapshot())}\n\n`);
          clients.add(res); req.on('close', () => clients.delete(res)); return;
        }
        if (req.method === 'POST' && ['/api/demo/config', '/api/demo/scenario'].includes(url.pathname)) {
          // Demo-only mutation. Block browser cross-origin requests; no permissive CORS.
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Cross-origin writes are not permitted' });
          const body = await readJson(req);
          if (url.pathname.endsWith('config')) {
            const allowed = ['count', 'intervalMs', 'paused'];
            if (Object.keys(body).some(k => !allowed.includes(k))) throw new RangeError('Unknown configuration field');
            engine.configure(body); schedule();
          } else engine.scenario(body.machineId, body.action);
          broadcast(); return sendJson(res, 200, engine.snapshot());
        }
        return sendJson(res, 404, { error: 'Unknown API endpoint or method' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed' });
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      // No source files, dotfiles, symlinks outside dist, or directory listings.
      if (pathname.split('/').some(part => part.startsWith('.'))) return sendJson(res, 403, { error: 'Forbidden' });
      const filePath = resolve(staticRoot, `.${pathname}`);
      if (!filePath.startsWith(resolve(staticRoot) + sep)) return sendJson(res, 403, { error: 'Forbidden' });
      const info = await stat(filePath).catch(() => null);
      if (!info?.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>找不到頁面</title><h1>404 · 找不到頁面</h1><a href="/">回到機台看板</a></html>');
      }
      const canonicalFile = await realpath(filePath);
      const canonicalRoot = await realpath(staticRoot);
      if (!canonicalFile.startsWith(canonicalRoot + sep)) return sendJson(res, 403, { error: 'Forbidden' });
      res.setHeader('Content-Type', TYPES[extname(filePath)] || 'application/octet-stream');
      res.setHeader('Cache-Control', pathname.endsWith('sw.js') || pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
      if (req.method === 'HEAD') return res.end();
      const content = await readFile(filePath);
      if (extname(filePath) === '.html') {
        const hashes = [...content.toString('utf8').matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
          .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
        if (hashes.length) res.setHeader('Content-Security-Policy', String(res.getHeader('Content-Security-Policy')).replace("script-src 'self'", `script-src 'self' ${hashes.join(' ')}`));
      }
      res.end(content);
    } catch (error) {
      if (!res.headersSent) sendJson(res, error instanceof RangeError || error instanceof TypeError || error instanceof SyntaxError || error instanceof URIError ? 400 : 500, { error: error.message || 'Server error' });
      else res.end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 15_000;
  server.on('listening', () => {
    schedule(); heartbeat = setInterval(() => clients.forEach(c => c.write(': heartbeat\n\n')), 15_000); heartbeat.unref();
  });
  server.on('close', () => { clearTimeout(timer); clearInterval(heartbeat); });
  server.stopDemo = () => { clearTimeout(timer); clearInterval(heartbeat); clients.forEach(c => c.end()); clients.clear(); return new Promise(resolveStop => server.close(resolveStop)); };
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('Invalid PORT');
  const server = createDemoServer();
  server.listen(port, host, () => console.log(`\n  Machine Signal / DEMO\n  http://${host}:${port}\n  Mock REST + SSE · all data is simulated\n`));
  ['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, () => { server.stopDemo().then(() => process.exit(0)); }));
}
