import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'start';
if (!['start', 'export'].includes(mode)) throw new Error('Use start or export.');
const settings = resolve(root, '.local/expo-settings');
mkdirSync(settings, { recursive: true, mode: 0o700 });
// Expo's documented shell-only settings-directory override avoids changing HOME.
// No Expo account or token is required for local Metro exports.
const env = {
  ...process.env,
  __UNSAFE_EXPO_HOME_DIRECTORY: process.env.__UNSAFE_EXPO_HOME_DIRECTORY ?? settings,
  EXPO_NO_TELEMETRY: '1',
  ...(mode === 'export' ? { CI: '1', EXPO_OFFLINE: '1' } : {})
};
const args = mode === 'export'
  ? ['export', '--platform', 'android', '--platform', 'ios', '--max-workers', '2', ...process.argv.slice(3)]
  : ['start', ...process.argv.slice(3)];
const child = spawn(process.execPath, [resolve(root, 'node_modules/expo/bin/cli'), ...args], {
  cwd: resolve(root, 'apps/native'), env, stdio: 'inherit'
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
