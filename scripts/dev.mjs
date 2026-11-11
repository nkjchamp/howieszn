import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const grouped = process.platform !== 'win32';
const options = { stdio: 'inherit', detached: grouped };
const children = [
  spawn(process.execPath, ['--watch', resolve(root, 'apps/server/src/index.ts')], { ...options, cwd: root }),
  spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    ...options, cwd: resolve(root, 'apps/web'),
    env: { ...process.env, HOWIESZN_API_TARGET: process.env.HOWIESZN_API_TARGET ?? `http://127.0.0.1:${process.env.PORT ?? 4000}` }
  })
];
let ending = false;
function stop(code = 0) {
  if (ending) return; ending = true;
  for (const child of children) {
    try { if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); }
    catch { /* A child may have already exited. */ }
  }
  setTimeout(() => process.exit(code), 200);
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!ending) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
