/**
 * v1 operation table for the in-editor clients (US-GE1).
 *
 * The engine-agnostic mirror of `packages/core/openapi/operations.json` (itself
 * generated from `openapi/insimul-v1.yaml` by `npm run codegen`). Every native
 * engine's hand-written editor client — the Godot `v1_client.gd`, and the
 * Unity/Unreal equivalents — declares the same `{operationId -> method, path}`
 * table; this const is the single source of truth the conformance test pins them
 * all against (`__tests__/operations.test.ts`), so a spec change that regenerates
 * `operations.json` fails the guard until every client table is updated in lock
 * step. Same drift-guard convention as {@link BASE_RADIANT_TEMPLATES}.
 *
 * The resolver is deliberately transport-free: it only maps an operationId to its
 * HTTP method + path template. Building the request URL, headers, and body is the
 * client's job (see {@link EditorSession}), so this module carries no Babylon,
 * DOM, or fetch dependency and stays consumable by a native engine's C harness.
 */

/** One REST operation: the HTTP verb + path template keyed by its operationId. */
export interface V1Operation {
  readonly operationId: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly path: string;
}

/**
 * The v1 operation table, mirroring `openapi/operations.json` verbatim. Keyed by
 * operationId. Keep this in sync with the generated file — the conformance test
 * fails on any drift (missing op, extra op, method/path mismatch).
 */
export const V1_OPERATIONS: Readonly<Record<string, V1Operation>> = {
  streamConversation: {
    operationId: 'streamConversation',
    method: 'POST',
    path: '/api/conversation/stream',
  },
  streamConversationAudio: {
    operationId: 'streamConversationAudio',
    method: 'POST',
    path: '/api/conversation/stream-audio',
  },
  endConversation: {
    operationId: 'endConversation',
    method: 'POST',
    path: '/api/conversation/end',
  },
  healthCheck: {
    operationId: 'healthCheck',
    method: 'GET',
    path: '/api/conversation/health',
  },
  listWorlds: {
    operationId: 'listWorlds',
    method: 'GET',
    path: '/api/worlds',
  },
  getWorldDetail: {
    operationId: 'getWorldDetail',
    method: 'POST',
    path: '/api/worlds/detail',
  },
  importWorld: {
    operationId: 'importWorld',
    method: 'POST',
    path: '/api/generation/import',
  },
  startGenerationJob: {
    operationId: 'startGenerationJob',
    method: 'POST',
    path: '/api/generation/jobs',
  },
  getGenerationJob: {
    operationId: 'getGenerationJob',
    method: 'POST',
    path: '/api/generation/jobs/status',
  },
  streamGenerationJob: {
    operationId: 'streamGenerationJob',
    method: 'POST',
    path: '/api/generation/jobs/events',
  },
  syncGenerationJob: {
    operationId: 'syncGenerationJob',
    method: 'POST',
    path: '/api/generation/jobs/sync',
  },
} as const;

/**
 * The operations the editor session actively invokes today (US-GE1: it verifies a
 * token + probes liveness via `healthCheck`). The conformance test asserts every
 * id here resolves in the table — a used operation that isn't in the spec is a
 * client bug, caught before it 404s at runtime. Later editor stories (US-GE3's
 * conversation tester) extend this set as they wire in more operations.
 *
 * US-GE2 adds the World Browser + Generation Console operations: the browser
 * lists/fetches worlds (`listWorlds` / `getWorldDetail`) and imports them into the
 * pipeline (`importWorld`), and the console starts jobs (`startGenerationJob`),
 * tracks progress via SSE (`streamGenerationJob`) with a polling fallback
 * (`getGenerationJob`), then applies the diff (`syncGenerationJob`).
 *
 * US-GE3 adds the in-editor Conversation Tester operations: it streams a character
 * response (`streamConversation`) and closes the session (`endConversation`).
 */
export const USED_OPERATION_IDS: readonly string[] = [
  'healthCheck',
  'listWorlds',
  'getWorldDetail',
  'importWorld',
  'startGenerationJob',
  'getGenerationJob',
  'streamGenerationJob',
  'syncGenerationJob',
  'streamConversation',
  'endConversation',
];

/**
 * Resolve an operationId to its {@link V1Operation}, or `null` if it is not a
 * known v1 operation. Callers build the concrete request from the returned
 * method + path.
 */
export function resolveOperation(operationId: string): V1Operation | null {
  return Object.prototype.hasOwnProperty.call(V1_OPERATIONS, operationId)
    ? V1_OPERATIONS[operationId]
    : null;
}
