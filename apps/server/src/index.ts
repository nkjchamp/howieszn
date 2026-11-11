import { resolve } from 'node:path';
import { createServer } from './server.ts';

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const app = createServer({
  dbPath: process.env.HOWIESZN_DB_PATH ?? resolve(import.meta.dirname, '../../../.local/howieszn.sqlite'),
  port,
  host: process.env.HOST ?? '127.0.0.1',
});
const address = await app.listen();
process.stdout.write(`Howieszn local fixture API listening on ${address.address}:${address.port}\n`);
process.stdout.write('SQLite persistence and WebSocket snapshots enabled. Fixed local Alex identity; no live sports provider.\n');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await app.close(); process.exit(0); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
