import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Command, LeagueState } from '@howieszn/domain';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export interface LeagueEnvelope {
  state: LeagueState;
  viewerId: string;
  serverTime: number;
  capabilities?: { fixture: boolean; liveProvider: boolean; storage: string };
  duplicate?: boolean;
  committedRevision?: number;
}
export class ClientError extends Error {
  code: string;
  details: Record<string, unknown>;
  envelope?: LeagueEnvelope;
  constructor(code: string, message: string, details: Record<string, unknown> = {}, envelope?: LeagueEnvelope) {
    super(message); this.name = 'ClientError'; this.code = code; this.details = details; this.envelope = envelope;
  }
}
export function createCommandId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function apiUrl(baseUrl: string, path: string): string { return baseUrl.replace(/\/$/, '') + path; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isEnvelope(value: unknown): value is LeagueEnvelope {
  if (!record(value) || !record(value.state) || typeof value.viewerId !== 'string') return false;
  const state = value.state;
  return typeof state.id === 'string' && typeof state.name === 'string' && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0
    && ['setup', 'draft', 'active', 'archived'].includes(String(state.phase)) && Number.isInteger(state.round)
    && ['managers', 'teams', 'players', 'games', 'stats', 'matchups', 'audit'].every(key => Array.isArray(state[key]))
    && record(state.draft) && Array.isArray(state.draft.picks) && Array.isArray(state.draft.order) && record(state.draft.queues)
    && record(state.rules) && record(state.rules.scoring) && record(state.rules.scoring.base) && record(state.rules.scoring.positions);
}
export function createLeagueClient(baseUrl: string, options: { requestTimeoutMs?: number } = {}) {
  async function request(path: string, options?: RequestInit): Promise<LeagueEnvelope> {
    let response: Response;
    let body: unknown;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      response = await fetch(apiUrl(baseUrl, path), { ...options, signal: controller.signal });
      try { body = await response.json(); }
      catch { throw new ClientError(options?.method === 'POST' ? 'UNCERTAIN_DELIVERY' : 'INVALID_RESPONSE', 'The server response could not be read. A submitted action may need confirmation.'); }
    }
    catch (cause) {
      if (cause instanceof ClientError) throw cause;
      throw new ClientError(options?.method === 'POST' ? 'UNCERTAIN_DELIVERY' : 'NETWORK_UNAVAILABLE', options?.method === 'POST' ? 'Connection lost before confirmation. The action may have reached the server. Review or retry the same action.' : 'Cannot reach the local league server.');
    }
    finally { clearTimeout(timeout); }
    if (options?.method === 'POST' && response.status >= 500) throw new ClientError('UNCERTAIN_DELIVERY', 'The server could not confirm the action. Review or retry the same action.', { status: response.status });
    if (!record(body)) throw new ClientError(options?.method === 'POST' ? 'UNCERTAIN_DELIVERY' : 'INVALID_RESPONSE', 'The league server returned an incomplete response.');
    if (!response.ok) {
      const error = body.error as { code?: string; message?: string; details?: Record<string, unknown> } | undefined;
      throw new ClientError(error?.code ?? 'REQUEST_FAILED', error?.message ?? 'The action was not accepted.', error?.details ?? {}, isEnvelope(body) ? body : undefined);
    }
    if (!isEnvelope(body)) throw new ClientError(options?.method === 'POST' ? 'UNCERTAIN_DELIVERY' : 'INVALID_RESPONSE', 'The league response is incomplete.');
    return body;
  }
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 10_000);
  return {
    load: () => request('/api/league'),
    send: (command: Command, expectedRevision: number, commandId = createCommandId()) => request('/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId, expectedRevision, command }) }),
    subscribe(onSnapshot: (envelope: LeagueEnvelope) => void, onStatus: (status: ConnectionStatus) => void, getRevision: () => number = () => -1) {
      let stopped = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, attempt = 0;
      function connect() {
        if (stopped) return;
        onStatus(attempt ? 'reconnecting' : 'connecting');
        const origin = baseUrl || (typeof location !== 'undefined' ? location.origin : '');
        if (!origin) { onStatus('offline'); return; }
        const url = new URL('/events', origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('since', String(getRevision()));
        try { socket = new WebSocket(url.toString()); }
        catch { retry(); return; }
        socket.onopen = () => { if (!stopped) { attempt = 0; onStatus('connected'); } };
        socket.onmessage = event => {
          if (stopped) return;
          let data: unknown;
          try { data = JSON.parse(String(event.data)); } catch { return; }
          if (!record(data) || typeof data.type !== 'string') return;
          if (data.type === 'snapshot' && isEnvelope(data)) onSnapshot(data);
          if (data.type === 'changed') void request('/api/league').then(value => { if (!stopped) onSnapshot(value); }).catch(() => { if (!stopped) onStatus('reconnecting'); });
        };
        socket.onerror = () => { if (!stopped) onStatus('reconnecting'); };
        socket.onclose = retry;
      }
      function retry() {
        if (stopped) return;
        attempt += 1; onStatus('reconnecting');
        timer = setTimeout(connect, Math.min(500 * 2 ** Math.min(attempt, 4), 8000));
      }
      connect();
      return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
    }
  };
}
export function useLeague(baseUrl: string) {
  const client = useMemo(() => createLeagueClient(baseUrl), [baseUrl]);
  const clientRef = useRef(client); clientRef.current = client;
  const [state, setState] = useState<LeagueState | null>(null);
  const [viewerId, setViewerId] = useState('alex');
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [uncertainCommand, setUncertainCommand] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const revision = useRef(-1);
  const pendingRef = useRef<{ owner: typeof client; id: string } | null>(null);
  const uncertain = useRef<{ payload: string; command: Command; revision: number; id: string } | null>(null);
  const receive = useCallback((value: LeagueEnvelope) => {
    if (value.state.revision < revision.current) return;
    revision.current = value.state.revision; setState(value.state); setViewerId(value.viewerId); setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    try { const value = await client.load(); if (clientRef.current === client) { receive(value); if (!uncertain.current) setError(null); } }
    catch (cause) { if (clientRef.current === client) { setError(cause as ClientError); setStatus('offline'); setLoading(false); } }
  }, [client, receive]);
  useEffect(() => {
    let active = true; revision.current = -1; uncertain.current = null; pendingRef.current = null; setPending(false); setUncertainCommand(false); setLoading(true); setState(null); setError(null);
    void client.load().then(value => { if (active) receive(value); }).catch(cause => { if (active) { setError(cause as ClientError); setStatus('offline'); setLoading(false); } });
    const unsubscribe = client.subscribe(value => { if (active) { receive(value); if (!uncertain.current) setError(null); } }, next => { if (active) setStatus(next); }, () => revision.current);
    return () => { active = false; unsubscribe(); };
  }, [client, receive]);
  const send = useCallback(async (command: Command, expectedRevision = revision.current, commandId?: string): Promise<void> => {
    if (pendingRef.current?.owner === client) throw new ClientError('COMMAND_PENDING', 'Wait for the current action to finish.');
    const payload = JSON.stringify(command);
    const previous = uncertain.current;
    if (previous && (previous.payload !== payload || (commandId && commandId !== previous.id))) {
      const failure = new ClientError('UNCONFIRMED_COMMAND', 'Confirm the previous action before making another change.');
      setError(failure); throw failure;
    }
    // A realtime snapshot can advance the revision after a committed action loses
    // its HTTP acknowledgement. Retrying must retain BOTH original identity and
    // original intent revision; otherwise an autopick could affect the next team.
    const requestRevision = previous?.revision ?? expectedRevision;
    const id = previous?.id ?? commandId ?? createCommandId();
    const marker = { owner: client, id };
    pendingRef.current = marker; setPending(true); setError(null);
    try {
      const value = await client.send(command, requestRevision, id);
      if (clientRef.current === client) { uncertain.current = null; setUncertainCommand(false); receive(value); }
    } catch (cause) {
      const failure = cause instanceof ClientError ? cause : new ClientError('REQUEST_FAILED', 'The action failed.');
      if (clientRef.current === client) {
        if (failure.envelope) receive(failure.envelope);
        uncertain.current = failure.code === 'UNCERTAIN_DELIVERY' ? { payload, command, revision: requestRevision, id } : null;
        setUncertainCommand(uncertain.current !== null);
        setError(failure);
      }
      throw failure;
    } finally { if (pendingRef.current === marker) { pendingRef.current = null; if (clientRef.current === client) setPending(false); } }
  }, [client, receive]);
  const retryLastCommand = useCallback(async (): Promise<void> => {
    const previous = uncertain.current;
    if (previous) await send(previous.command, previous.revision, previous.id);
  }, [send]);
  return { state, viewerId, status, loading, pending, uncertainCommand, error, send, retryLastCommand, refresh };
}
