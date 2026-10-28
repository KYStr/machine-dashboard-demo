import { watch } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
let child, timeout, stopping = false, building = false;
function startServer() { child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', env: process.env }); }
function rebuild() {
  if (stopping || building) return;
  building = true;
  try { execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' }); }
  catch { building = false; return; }
  if (child && child.exitCode === null) { child.once('exit', () => { if (!stopping) startServer(); building = false; }); child.kill('SIGTERM'); }
  else { startServer(); building = false; }
  console.log('Source rebuilt. Refresh the browser to load changes.');
}
rebuild();
const watchers = ['src', 'shared', 'server', 'public'].map(dir => watch(resolve(root, dir), { recursive: true }, () => { clearTimeout(timeout); timeout = setTimeout(rebuild, 250); }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearTimeout(timeout); watchers.forEach(w => w.close()); child?.kill('SIGTERM'); });
