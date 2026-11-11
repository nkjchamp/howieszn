import { resolve } from 'node:path';
import { createServer, preparePreview } from '../apps/server/src/server.ts';
import { PostgresLeagueStore } from '../apps/server/src/postgres-store.ts';

// This entry point always enables the shared preview gate. Development retains
// its separate loopback-only entry point; there is no unprotected hosted mode.
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the hosted PostgreSQL preview.');
try {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('invalid');
} catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
const origin = process.env.PREVIEW_ORIGIN || process.env.RENDER_EXTERNAL_URL || '';
if (!origin) throw new Error('Set PREVIEW_ORIGIN to the HTTPS preview origin, or use Render\'s RENDER_EXTERNAL_URL.');
const username = process.env.PREVIEW_USERNAME || 'preview';
const password = process.env.PREVIEW_PASSWORD;
if (!password || Buffer.byteLength(password, 'utf8') < 32) throw new Error('PREVIEW_PASSWORD must contain at least 32 bytes. Store it in the host secret settings.');
const root = resolve(import.meta.dirname, '..');
const preview = {
  username,
  password,
  allowedOrigins: [origin],
  staticDir: resolve(process.env.PREVIEW_WEB_DIR || resolve(root, 'apps/web/dist')),
};
// Reject an absent gate, unsafe origin, or missing build before connecting to
// PostgreSQL or performing any migration. Server validation repeats this gate.
preparePreview(preview);
let store;
let app;
try {
  store = await PostgresLeagueStore.open(databaseUrl, { schema: process.env.HOWIESZN_DB_SCHEMA || 'howieszn' });
  app = createServer({ store, port, host: process.env.HOST || '0.0.0.0', preview });
  const address = await app.listen();
  console.log(`Howieszn protected PostgreSQL fixture preview listening on port ${address.port}.`);
  console.log('Shared demo identity; HTTP, API, assets and WebSockets require preview credentials.');
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  try { if (app) await app.close(); else if (store) await store.close(); } catch { /* Preserve the startup failure. */ }
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? ` (${error.code})` : '';
  // Driver errors can carry connection details; never dump raw errors or URLs.
  console.error(`Protected preview initialization failed${code}. Check database readiness, configuration, and migration compatibility.`);
  process.exitCode = 1;
}
