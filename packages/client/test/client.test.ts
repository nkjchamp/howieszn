import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFixtureLeague } from '@howieszn/domain';
import { ClientError, createLeagueClient } from '../src/index.ts';

const originalFetch = globalThis.fetch;
const websocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
afterEach(() => { globalThis.fetch = originalFetch; if (websocketDescriptor) Object.defineProperty(globalThis, 'WebSocket', websocketDescriptor); });
const envelope = () => ({ state: createFixtureLeague({ now: 0 }), viewerId: 'alex', serverTime: 0 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('reads complete snapshots and rejects malformed success bodies without leaking TypeErrors', async () => {
  globalThis.fetch = async () => json(envelope());
  assert.equal((await createLeagueClient('http://local').load()).state.teams.length, 16);
  for (const body of [null, [], {}, { state: {}, viewerId: 'alex' }]) {
    globalThis.fetch = async () => json(body);
    await assert.rejects(createLeagueClient('http://local').load(), (error: unknown) => error instanceof ClientError && error.code === 'INVALID_RESPONSE');
  }
});
test('a missing or unreadable write acknowledgement is uncertain, not a claimed rejection', async () => {
  const client = createLeagueClient('http://local');
  for (const response of [json(null), new Response('unreadable'), json({ error: { code: 'INTERNAL_ERROR' } }, 500)]) {
    globalThis.fetch = async () => response;
    await assert.rejects(client.send({ type: 'draft.start' }, 0, 'same-command'), (error: unknown) => error instanceof ClientError && error.code === 'UNCERTAIN_DELIVERY');
  }
  globalThis.fetch = async () => { throw new Error('network lost'); };
  await assert.rejects(client.send({ type: 'draft.start' }, 0), (error: unknown) => error instanceof ClientError && error.code === 'UNCERTAIN_DELIVERY');
});
test('revision conflicts retain the authoritative snapshot and exact command identity is sent', async () => {
  let sent = '';
  globalThis.fetch = async (_input, init) => { sent = String(init?.body); return json({ ...envelope(), error: { code: 'REVISION_CONFLICT', message: 'Review current state.' } }, 409); };
  await assert.rejects(createLeagueClient('http://local').send({ type: 'draft.start' }, 3, 'command-123'), (error: unknown) => error instanceof ClientError && error.code === 'REVISION_CONFLICT' && error.envelope?.state.revision === 0);
  assert.deepEqual(JSON.parse(sent), { commandId: 'command-123', expectedRevision: 3, command: { type: 'draft.start' } });
});
test('malformed realtime frames are ignored; a valid reconnect snapshot is delivered', () => {
  class Socket {
    static last: Socket;
    onopen?: () => void; onclose?: () => void; onerror?: () => void; onmessage?: (event: { data: string }) => void;
    constructor(_url: string) { Socket.last = this; }
    close() { this.onclose?.(); }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: Socket });
  const snapshots: unknown[] = [], statuses: string[] = [];
  const stop = createLeagueClient('http://127.0.0.1:4000').subscribe(value => snapshots.push(value), status => statuses.push(status));
  Socket.last.onopen?.();
  for (const body of ['not json', 'null', '[]', '{}', JSON.stringify({ type: 'snapshot', state: {} })]) assert.doesNotThrow(() => Socket.last.onmessage?.({ data: body }));
  Socket.last.onmessage?.({ data: JSON.stringify({ type: 'snapshot', ...envelope() }) });
  assert.equal(snapshots.length, 1); assert.ok(statuses.includes('connected')); stop();
});
test('a response that sends headers but never finishes its body also times out safely', async () => {
  const server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    await assert.rejects(createLeagueClient(`http://127.0.0.1:${address.port}`, { requestTimeoutMs: 50 }).send({ type: 'draft.start' }, 0), (error: unknown) => error instanceof ClientError && error.code === 'UNCERTAIN_DELIVERY');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
