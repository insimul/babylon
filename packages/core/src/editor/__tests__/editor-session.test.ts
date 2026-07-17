/**
 * US-GE1 — reference editor session lifecycle over a mocked transport.
 *
 * The executable contract the GDScript `insimul_editor_session.gd` mirrors: verify
 * on login, clear the token on 401/403, health probe parses `{healthy}`, and the
 * request carries the base-URL-joined path + bearer auth. All over an in-memory
 * transport, so no real HTTP — the same seam the native editor session uses.
 */

import { describe, expect, it } from 'vitest';

import {
  EditorSession,
  InMemorySecretStore,
  type EditorRequest,
  type EditorResponse,
  type EditorTransport,
} from '../editor-session';

/** A queue-backed transport that records requests and replies synchronously. */
function mockTransport(responses: EditorResponse[]): {
  transport: EditorTransport;
  sent: EditorRequest[];
} {
  const sent: EditorRequest[] = [];
  const queue = [...responses];
  const transport: EditorTransport = (req, onDone) => {
    sent.push(req);
    onDone(queue.shift() ?? { status: 0 });
  };
  return { transport, sent };
}

describe('EditorSession lifecycle (US-GE1)', () => {
  it('starts unauthenticated', () => {
    const { transport } = mockTransport([]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    expect(session.isAuthenticated()).toBe(false);
    expect(session.token).toBe('');
  });

  it('health 200 -> ok + parsed healthy flag', () => {
    const { transport } = mockTransport([{ status: 200, body: '{"healthy": true}' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    let result: unknown;
    session.health((res) => (result = res));
    expect(result).toEqual({ ok: true, status: 200, healthy: true });
  });

  it('login 200 keeps the token and authenticates', () => {
    const secrets = new InMemorySecretStore();
    const { transport } = mockTransport([{ status: 200, body: '{"healthy": true}' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport, secrets });
    let result: { ok: boolean } | undefined;
    session.login('good-token', (res) => (result = res));
    expect(result?.ok).toBe(true);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.token).toBe('good-token');
    expect(secrets.getToken()).toBe('good-token');
  });

  it('login 401 clears the token (invalid credential is not left persisted)', () => {
    const secrets = new InMemorySecretStore();
    const { transport } = mockTransport([{ status: 401, body: 'unauthorized' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport, secrets });
    let result: { ok: boolean; status: number } | undefined;
    session.login('bad-token', (res) => (result = res));
    expect(result?.ok).toBe(false);
    expect(result?.status).toBe(401);
    expect(session.isAuthenticated()).toBe(false);
    expect(session.token).toBe('');
    expect(secrets.getToken()).toBe('');
  });

  it('login 403 also clears the token', () => {
    const { transport } = mockTransport([{ status: 403 }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    session.login('bad-token', () => {});
    expect(session.isAuthenticated()).toBe(false);
  });

  it('logout clears the token', () => {
    const { transport } = mockTransport([{ status: 200, body: '{"healthy": true}' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    session.login('good-token', () => {});
    expect(session.isAuthenticated()).toBe(true);
    session.logout();
    expect(session.isAuthenticated()).toBe(false);
  });

  it('builds the request URL from base + operation path with bearer auth', () => {
    const { transport, sent } = mockTransport([{ status: 200, body: '{}' }]);
    // Trailing slash on the base URL must not double up.
    const session = new EditorSession({ baseUrl: 'http://localhost:8080/', transport });
    session.login('tok', () => {});
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('GET');
    expect(sent[0].url).toBe('http://localhost:8080/api/conversation/health');
    expect(sent[0].headers['Authorization']).toBe('Bearer tok');
    expect(sent[0].headers['Content-Type']).toBe('application/json');
  });

  it('omits the Authorization header when there is no token', () => {
    const { transport, sent } = mockTransport([{ status: 200, body: '{}' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    session.health(() => {});
    expect(sent[0].headers['Authorization']).toBeUndefined();
  });

  it('reports a non-2xx health probe as not ok with an error', () => {
    const { transport } = mockTransport([{ status: 503, body: 'down' }]);
    const session = new EditorSession({ baseUrl: 'http://localhost:8080', transport });
    let result: { ok: boolean; error?: string } | undefined;
    session.health((res) => (result = res));
    expect(result?.ok).toBe(false);
    expect(result?.error).toContain('503');
  });
});
