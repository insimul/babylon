/**
 * Reference in-editor session + token lifecycle (US-GE1).
 *
 * The engine-agnostic contract every native engine's editor session mirrors — the
 * Godot `insimul_editor_session.gd`, and the Unity/Unreal equivalents. It owns the
 * settings (base URL + auth token), the token lifecycle (verify on login, clear on
 * 401), and the health probe, all over an INJECTED transport so it is testable
 * headless against canned responses with no real HTTP.
 *
 * Two deliberate seams keep the security-sensitive parts pluggable and mirror the
 * native split the PRD requires (plan §4.4):
 *   - {@link EditorTransport} — the request seam. Real editors back it with the
 *     engine's HTTP client (Godot `HTTPRequest`); tests back it with a queue.
 *   - {@link SecretStore} — the token seam. Real editors back it with the engine's
 *     PER-MACHINE secret store (Godot `EditorSettings`), NEVER the shared, VCS-
 *     committed project file (`ProjectSettings` / `project.godot`). The base URL is
 *     non-secret and lives in the project store; only the token is a secret. This
 *     class never persists the token itself — it hands it to the {@link SecretStore}
 *     — so the "secrets never touch project files" rule is enforced at the seam.
 *
 * The seam is callback-based, not promise-based, to mirror the GDScript client
 * exactly (Godot's `HTTPRequest.request_completed` is a signal); the in-memory
 * mock invokes the callback synchronously so tests read straight-line.
 */

import { resolveOperation } from './operations';

/** A resolved request the transport must perform. */
export interface EditorRequest {
  readonly operationId: string;
  readonly method: string;
  /** Full URL: base URL + the operation's path template. */
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** A transport response: the HTTP status and (optionally) the raw body text. */
export interface EditorResponse {
  readonly status: number;
  readonly body?: string;
}

/** The request seam. Performs `req` and invokes `onDone` with the response. */
export type EditorTransport = (
  req: EditorRequest,
  onDone: (res: EditorResponse) => void,
) => void;

/**
 * The secret seam: where the auth token is persisted. Backed per-engine by the
 * editor's PER-MACHINE store (Godot `EditorSettings`), so the token never lands in
 * a committed project file. An in-memory default ships for tests + the contract.
 */
export interface SecretStore {
  getToken(): string;
  setToken(token: string): void;
  clearToken(): void;
}

/** Default {@link SecretStore}: an in-process token holder (tests + fallback). */
export class InMemorySecretStore implements SecretStore {
  private token = '';
  getToken(): string {
    return this.token;
  }
  setToken(token: string): void {
    this.token = token;
  }
  clearToken(): void {
    this.token = '';
  }
}

/** Outcome of a session operation (login / verify / health). */
export interface SessionResult {
  /** True when the server accepted the request (2xx). */
  readonly ok: boolean;
  readonly status: number;
  /** For health/verify: the server's self-reported liveness, when parseable. */
  readonly healthy?: boolean;
  /** A human-readable failure reason when `ok` is false. */
  readonly error?: string;
}

export interface EditorSessionOptions {
  /** Base URL of the Insimul server, e.g. `http://localhost:8080` (non-secret). */
  baseUrl: string;
  /** The request seam. */
  transport: EditorTransport;
  /** The token seam. Defaults to an in-memory store. */
  secrets?: SecretStore;
}

/**
 * The editor session. Holds the base URL + token seam and drives the token
 * lifecycle over the injected transport.
 */
export class EditorSession {
  readonly baseUrl: string;
  private readonly transport: EditorTransport;
  private readonly secrets: SecretStore;

  constructor(opts: EditorSessionOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.transport = opts.transport;
    this.secrets = opts.secrets ?? new InMemorySecretStore();
  }

  /** The current auth token (empty string when unauthenticated). */
  get token(): string {
    return this.secrets.getToken();
  }

  /** True once a token has been stored (does not imply the server accepts it). */
  isAuthenticated(): boolean {
    return this.token !== '';
  }

  /**
   * Store `token` and verify it against the server. On a 2xx the token is kept and
   * the session is authenticated; on a 401/403 the token is CLEARED (an invalid
   * credential is never left persisted) and the failure is reported.
   */
  login(token: string, onDone: (res: SessionResult) => void): void {
    this.secrets.setToken(token);
    this.verify((res) => {
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        this.secrets.clearToken();
      }
      onDone(res);
    });
  }

  /** Clear the stored token. */
  logout(): void {
    this.secrets.clearToken();
  }

  /** Verify the current token by probing the health endpoint. */
  verify(onDone: (res: SessionResult) => void): void {
    this.health(onDone);
  }

  /** Probe server liveness via the `healthCheck` operation. */
  health(onDone: (res: SessionResult) => void): void {
    const req = this.buildRequest('healthCheck');
    if (req === null) {
      onDone({ ok: false, status: 0, error: 'unknown operation: healthCheck' });
      return;
    }
    this.transport(req, (res) => onDone(interpretHealth(res)));
  }

  /**
   * Build the request for `operationId` from the operation table: full URL, verb,
   * JSON content type, and a bearer Authorization header when a token is present.
   * Returns `null` if the operation is not in the v1 table.
   */
  buildRequest(operationId: string, body?: string): EditorRequest | null {
    const op = resolveOperation(operationId);
    if (op === null) {
      return null;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.token;
    if (token !== '') {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return {
      operationId,
      method: op.method,
      url: this.baseUrl + op.path,
      headers,
      body,
    };
  }
}

/** Map a transport response to a {@link SessionResult}, parsing `{healthy}`. */
function interpretHealth(res: EditorResponse): SessionResult {
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) {
    return { ok: false, status: res.status, error: `server returned ${res.status}` };
  }
  let healthy: boolean | undefined;
  if (typeof res.body === 'string' && res.body.length > 0) {
    try {
      const parsed = JSON.parse(res.body) as { healthy?: unknown };
      if (typeof parsed.healthy === 'boolean') {
        healthy = parsed.healthy;
      }
    } catch {
      // Non-JSON body from a 2xx health endpoint: treat as live but unparsed.
    }
  }
  return { ok: true, status: res.status, healthy };
}
