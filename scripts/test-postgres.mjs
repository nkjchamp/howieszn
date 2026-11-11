import { spawn } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a disposable PostgreSQL 18 test database. This check does not skip database coverage.');
  process.exit(1);
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check with npm run test:postgres.');
const child = spawn(process.execPath, [npm, 'test'], { stdio: 'inherit', env: process.env });
child.once('error', () => { console.error('Could not start the PostgreSQL test suite.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
