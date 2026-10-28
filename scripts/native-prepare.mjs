/** Run after the user explicitly installs Capacitor and the platform SDK. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const platform = process.argv[2] || 'android';
if (!['android', 'ios'].includes(platform)) throw new Error('Usage: npm run native:prepare -- android|ios');
const cli = resolve(root, 'node_modules/@capacitor/cli/bin/capacitor');
if (!existsSync(cli)) {
  console.error('Install optional native tooling first:\n  npm install @capacitor/core@8 @capacitor/android@8 @capacitor/ios@8\n  npm install -D @capacitor/cli@8\nThen rerun this command. Native IDEs and signing are still required.');
  process.exit(1);
}
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
if (!existsSync(resolve(root, platform))) execFileSync(process.execPath, [cli, 'add', platform], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [cli, 'sync', platform], { cwd: root, stdio: 'inherit' });
console.log(`Native project prepared. Run: npx cap open ${platform}\nThis does not build or sign a release binary.`);
