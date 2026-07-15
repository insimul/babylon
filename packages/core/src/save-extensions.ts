/**
 * Save File Extensions Registry
 *
 * `currentState.extensions` is a catch-all bag where subsystems (intro cinematic,
 * gamification, skill trees, achievements earned in a playthrough, sessions,
 * evaluations, etc.) can persist state without needing a first-class field on
 * `CurrentGameState`.
 *
 * Without structure it drifts: keys collide across subsystems, reading a save
 * from an older Insimul version leaves keys in inconsistent shapes, and there is
 * no clear way to provide defaults for a newly-introduced key. This module
 * formalizes the contract:
 *
 *   Owners MUST register their extension key here before writing to it.
 *
 * Each registered key declares:
 *   - `owner`:        which subsystem/module is allowed to write it.
 *   - `describe`:     short human-readable description of the stored shape.
 *   - `defaultValue`: value populated on fresh saves or saves that predate the
 *                     key. Cloned per call so registry entries can share a
 *                     mutable default safely.
 *   - `migrate?`:     optional upgrade path invoked during
 *                     `migrateExtensions()`. Receives the legacy value and the
 *                     save's `fromVersion`, returns the new value.
 *
 * Migration behaviour (see `migrateExtensions`):
 *   1. Every registered key is either migrated (if a value is present and a
 *      migrator is declared) or populated with a fresh clone of `defaultValue`.
 *   2. Keys present on the save but missing from the registry are preserved
 *      verbatim and reported via `onOrphan` ("orphan extension" log). They are
 *      never silently dropped — a future extension may re-register them.
 *
 * Runtime writes should go through `writeExtension()` which emits a dev-mode
 * warning when writing to an unregistered key. This catches typos and
 * forgotten-registration bugs at first write.
 */

/** One entry in save.currentState.extensions.sessions — a single play session. */
export interface SessionEntry {
  /** Stable session identifier (uuid). */
  id: string;
  /** ISO-8601 timestamp when the session began. */
  startedAt: string;
  /** ISO-8601 timestamp when the session ended, or null if still in progress. */
  endedAt: string | null;
  /** Duration of the session in seconds. Updated on endPlayerSession. */
  duration: number;
  /** XP earned during the session. */
  experienceGained: number;
  /** Quest IDs completed during the session. */
  questsCompleted: string[];
  /** Achievement IDs earned during the session. */
  achievementsEarned: string[];
  /** Free-form metadata bag for opaque session context. */
  metadata: Record<string, unknown>;
}

/**
 * Per-playthrough research evaluation entry (US-018).
 * Stored under `save.currentState.extensions.evaluations` as an array.
 */
export interface EvaluationEntry {
  id: string;
  instrumentType: string;
  instrumentVersion: string;
  participantId: string;
  responses: Record<string, unknown> | unknown[];
  score: number | null;
  subscaleScores: Record<string, number> | null;
  completedAt: string;
  /** Links the evaluation to the assessment quest, preserving quest-overlay linkage. */
  questId: string | null;
  /** CEFR band derived from this evaluation's score — denormalized here so
   *  the assessments-sessions panel can show the level without re-computing. */
  cefrLevel?: string | null;
  /** Research framework metadata (kept on the entry so legacy reads still resolve). */
  studyId?: string | null;
  testWindow?: string | null;
  targetLanguage?: string | null;
  maxScore?: number | null;
}

export interface ExtensionContract<T = unknown> {
  /** Subsystem that owns this key (e.g. 'intro-system', 'gamification', 'session-tracker'). */
  owner: string;
  /** Short description of the stored shape for the registry. */
  describe: string;
  /** Default value used for fresh saves or when a key is absent during migration. */
  defaultValue: T;
  /**
   * Upgrade a legacy value to the current shape. Called during migration when
   * the save has a value for this key. Should be idempotent — migrating an
   * already-current value must return the same shape.
   */
  migrate?: (legacy: unknown, fromVersion: number) => T;
}

/**
 * Clone a default value. Uses `structuredClone` when available (Node 17+,
 * modern browsers) and falls back to JSON round-trip for primitives/plain
 * objects. Registry defaults should be JSON-serialisable by convention.
 */
function cloneDefault<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The authoritative registry of known `currentState.extensions` keys. Subsystems
 * add their key here as the first step of storing anything in the save file.
 *
 * Keep entries sorted by key and include an `owner` that matches the subsystem
 * directory where the writer lives. If a key becomes unused, leave the entry
 * until all production saves have been migrated off of it — removing a key
 * demotes every existing save's value to "orphan extension" status.
 */
export const extensionRegistry: Record<string, ExtensionContract> = {
  introShown: {
    owner: 'intro-system',
    describe: 'Whether the player has seen the opening intro cinematic for this save.',
    defaultValue: false,
  },
  evaluations: {
    owner: 'assessment-framework',
    describe:
      'Per-playthrough research evaluation responses (US-018). Replaces the legacy assessments collection.',
    defaultValue: [] as EvaluationEntry[],
  },
  sessions: {
    owner: 'session-tracker',
    describe:
      'Array of SessionEntry records — one per play session for this save. ' +
      'Appended on createPlayerSession, finalized on endPlayerSession.',
    defaultValue: [] as SessionEntry[],
  },
  gamification: {
    owner: 'language-gamification',
    describe:
      'GamificationState: XP/level, achievements unlocked, daily challenge, streaks, and ' +
      'lifetime counters (quests, NPCs talked, articles read, etc.). Written by ' +
      'LanguageGamificationTracker. Some saves still carry this at ' +
      'currentState.gamification (legacy position) — endpoints read both.',
    defaultValue: null as unknown,
  },
  playthroughTelemetry: {
    owner: 'telemetry',
    describe:
      'Rolling-window buffer of per-playthrough telemetry events (US-019). Capped at ' +
      'PLAYTHROUGH_TELEMETRY_MAX_EVENTS; oldest events drop on overflow.',
    defaultValue: [] as unknown[],
  },
  droppedFacts: {
    owner: 'prolog-migration',
    describe:
      'Prolog facts dropped during save migration because their predicate signature no ' +
      'longer matches the current schema. Each entry: {predicate, reason}.',
    defaultValue: [] as Array<{ predicate: string; reason: string }>,
  },
  skillTree: {
    owner: 'skill-system',
    describe:
      'Skill-tree progression: unlocked node IDs and unspent skill points. ' +
      'Shape: {unlockedNodes: string[], availablePoints: number}. ' +
      'Registered preemptively; no production writer yet.',
    defaultValue: null as unknown,
  },
  achievements: {
    owner: 'gamification',
    describe:
      'Per-playthrough achievement-earned records. Shape: {earned: Array<{id, earnedAt}>}. ' +
      'Registered for fixtures that persist achievement state outside the gamification ' +
      'bag; the canonical achievement list lives in `gamification.achievements`.',
    defaultValue: null as unknown,
  },
};

/** Options accepted by `migrateExtensions`. */
export interface MigrateExtensionsOptions {
  /** Called with each key present on the save but missing from the registry. */
  onOrphan?: (key: string, value: unknown) => void;
}

/** Default orphan logger — writes a single warning per migration call. */
function defaultOrphanLogger(key: string, _value: unknown): void {
  try {
    console.warn(
      `[save-extensions] orphan extension "${key}" — no registered contract. Value preserved as-is.`,
    );
  } catch {
    // console might be unavailable in some runtimes; swallow.
  }
}

/**
 * Apply the extension registry to a save's `currentState.extensions` bag.
 *
 * Returns a NEW object (does not mutate `legacy`) so callers can diff or
 * round-trip safely.
 */
export function migrateExtensions(
  legacy: Record<string, unknown> | null | undefined,
  fromVersion: number,
  options: MigrateExtensionsOptions = {},
): Record<string, unknown> {
  const source = legacy ?? {};
  const out: Record<string, unknown> = {};
  const onOrphan = options.onOrphan ?? defaultOrphanLogger;

  for (const [key, contract] of Object.entries(extensionRegistry)) {
    const hasValue = Object.prototype.hasOwnProperty.call(source, key);
    if (hasValue) {
      out[key] = contract.migrate
        ? contract.migrate(source[key], fromVersion)
        : source[key];
    } else {
      out[key] = cloneDefault(contract.defaultValue);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (Object.prototype.hasOwnProperty.call(extensionRegistry, key)) continue;
    out[key] = value;
    onOrphan(key, value);
  }

  return out;
}

/** Is this key declared in the registry? */
export function isRegisteredExtension(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(extensionRegistry, key);
}

/** Environment flag that enables dev-mode warnings for `writeExtension`. */
function isDevWarningEnabled(): boolean {
  const env =
    typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined;
  if (env === 'production') return false;
  return true;
}

/**
 * Safe write helper for `currentState.extensions`. Always sets the value;
 * additionally emits a `console.warn` when the key is not registered AND the
 * runtime is not production. Use this instead of raw
 * `state.extensions[key] = value` in new code.
 */
export function writeExtension(
  extensions: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (!isRegisteredExtension(key) && isDevWarningEnabled()) {
    try {
      console.warn(
        `[save-extensions] writing unregistered extension "${key}". Register it in shared/save-extensions.ts::extensionRegistry before writing.`,
      );
    } catch {
      // ignore
    }
  }
  extensions[key] = value;
}

const orphanWarned = new Set<string>();

/** Dev-mode: warn (once per key) when code writes an unregistered extension key. */
export function warnUnregisteredExtensionWrite(key: string): void {
  if (!isDevWarningEnabled()) return;
  if (isRegisteredExtension(key) || orphanWarned.has(key)) return;
  orphanWarned.add(key);
  console.warn(
    `[save-extensions] Writing unregistered extension key "${key}". ` +
      `Register an ExtensionContract in shared/save-extensions.ts before writing.`,
  );
}

let legacyAssessmentWriteWarned = false;

/**
 * Dev-mode: warn when code writes to the legacy assessments MongoDB collection.
 * After US-018, evaluation responses must live in save.currentState.extensions.evaluations.
 */
export function warnLegacyAssessmentWrite(context = ''): void {
  if (!isDevWarningEnabled()) return;
  if (legacyAssessmentWriteWarned) return;
  legacyAssessmentWriteWarned = true;
  const where = context ? ` (${context})` : '';
  console.warn(
    `[assessments-legacy] Write attempted to legacy assessments collection${where}. ` +
      `As of US-018, evaluation responses live in save.currentState.extensions.evaluations.`,
  );
}

/** Test helper — resets the one-shot warning flags. */
export function _resetExtensionWarnings(): void {
  orphanWarned.clear();
  legacyAssessmentWriteWarned = false;
}

// ─── Session helpers (owner: session-tracker) ────────────────────────────────

/**
 * Read the sessions array from a save. Always returns a defensive copy so
 * callers can mutate freely without touching the save. Handles legacy saves
 * where the key is missing or malformed.
 */
export function getSessions(
  extensions: Record<string, unknown> | null | undefined,
): SessionEntry[] {
  if (!extensions) return [];
  const raw = extensions.sessions;
  if (!Array.isArray(raw)) return [];
  return raw.slice() as SessionEntry[];
}

/** Append a fresh session (with endedAt=null) to the save's sessions array. */
export function appendSession(
  extensions: Record<string, unknown>,
  entry: SessionEntry,
): SessionEntry[] {
  const next = getSessions(extensions);
  next.push(entry);
  writeExtension(extensions, 'sessions', next);
  return next;
}

/**
 * Update the session with the given id. Returns the updated entry, or
 * undefined if no session with that id exists.
 */
export function updateSession(
  extensions: Record<string, unknown>,
  sessionId: string,
  patch: Partial<Omit<SessionEntry, 'id'>>,
): SessionEntry | undefined {
  const sessions = getSessions(extensions);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return undefined;
  const merged: SessionEntry = { ...sessions[idx], ...patch };
  sessions[idx] = merged;
  writeExtension(extensions, 'sessions', sessions);
  return merged;
}

/** Factory for a fresh session entry with sensible defaults. */
export function createSessionEntry(
  id: string,
  startedAt: string = new Date().toISOString(),
  metadata: Record<string, unknown> = {},
): SessionEntry {
  return {
    id,
    startedAt,
    endedAt: null,
    duration: 0,
    experienceGained: 0,
    questsCompleted: [],
    achievementsEarned: [],
    metadata,
  };
}
