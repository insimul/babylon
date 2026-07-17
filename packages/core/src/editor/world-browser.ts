/**
 * World Browser dock view-model (US-GE2).
 *
 * The engine-agnostic, UI-free heart of the editor's World Browser: it turns the
 * `listWorlds` / `getWorldDetail` API responses into the data the dock renders (a
 * worlds list, a selected-world detail with stats, a compatibility badge), builds
 * the "open in web" URL, and summarizes an Import/Sync dry-run report. Every native
 * engine's browser dock (the Godot `world_browser_model.gd`, and the Unity/Unreal
 * equivalents) mirrors this contract; the reducer is a pure `(state, action) ->
 * state` function so the dock's logic is testable headless over a mocked API
 * (`__tests__/world-browser.test.ts`) while the Control layer is structurally
 * checked only — the "logic layer tested; UI structurally checked" split the
 * story calls for.
 *
 * The compatibility badge reuses the runtime's real {@link SAVE_FILE_VERSION} as
 * the editor-supported world format version, so the badge tracks the actual save
 * migration surface rather than an invented constant.
 */

import { SAVE_FILE_VERSION } from '../save-file';

/** A world as it appears in the browser list + detail. */
export interface WorldSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** World structure version (bumps as entities change). */
  readonly worldVersion: number;
  /** Save-file format version the world was authored against. */
  readonly saveFormatVersion: number;
  readonly engineRevision?: string;
  readonly npcCount?: number;
  readonly settlementCount?: number;
  readonly questCount?: number;
}

/** A compatibility badge for the World Browser detail pane. */
export interface CompatBadge {
  readonly level: 'compatible' | 'warning' | 'incompatible';
  readonly message: string;
}

/** An Import/Sync report (mirrors the `ImportReport` API schema). */
export interface ImportReport {
  readonly worldId: string;
  readonly dryRun: boolean;
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly messages: readonly string[];
}

/**
 * Compatibility of `world` with the editor's supported save format. Reuses the
 * runtime {@link SAVE_FILE_VERSION}:
 *   - equal versions      -> `compatible`;
 *   - world OLDER          -> `warning` (migrated on import);
 *   - world NEWER          -> `incompatible` (editor must be updated).
 */
export function worldCompatibility(
  world: Pick<WorldSummary, 'saveFormatVersion'>,
  supportedFormatVersion: number = SAVE_FILE_VERSION,
): CompatBadge {
  const world_v = world.saveFormatVersion;
  const editor_v = supportedFormatVersion;
  if (world_v === editor_v) {
    return { level: 'compatible', message: `Save format v${world_v} matches the editor.` };
  }
  if (world_v < editor_v) {
    return {
      level: 'warning',
      message: `Save format v${world_v} is older than the editor (v${editor_v}); it will be migrated on import.`,
    };
  }
  return {
    level: 'incompatible',
    message: `Save format v${world_v} is newer than the editor (v${editor_v}); update the editor to open this world.`,
  };
}

/** The URL that opens a world in the web app, relative to the editor base URL. */
export function openInWebUrl(baseUrl: string, worldId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/worlds/${encodeURIComponent(worldId)}`;
}

// ---------------------------------------------------------------------------
// Response parsing (mocked-API responses -> view-model types)
// ---------------------------------------------------------------------------

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Parse one world object (from `listWorlds` / `getWorldDetail`) defensively. */
export function parseWorld(raw: unknown): WorldSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  const name = typeof o.name === 'string' ? o.name : '';
  if (id === '') return null;
  return {
    id,
    name: name || id,
    description: typeof o.description === 'string' ? o.description : undefined,
    worldVersion: num(o.worldVersion) ?? 0,
    saveFormatVersion: num(o.saveFormatVersion) ?? 0,
    engineRevision: typeof o.engineRevision === 'string' ? o.engineRevision : undefined,
    npcCount: num(o.npcCount),
    settlementCount: num(o.settlementCount),
    questCount: num(o.questCount),
  };
}

/** Parse a `listWorlds` response body (`{ worlds: [...] }`) into summaries. */
export function parseWorldList(body: string): WorldSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const worlds =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).worlds
      : undefined;
  if (!Array.isArray(worlds)) return [];
  const out: WorldSummary[] = [];
  for (const w of worlds) {
    const parsedWorld = parseWorld(w);
    if (parsedWorld !== null) out.push(parsedWorld);
  }
  return out;
}

/** Parse an `importWorld` / `ImportReport` response body defensively. */
export function parseImportReport(body: string): ImportReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.worldId !== 'string') return null;
  const messages = Array.isArray(o.messages)
    ? o.messages.filter((m): m is string => typeof m === 'string')
    : [];
  return {
    worldId: o.worldId,
    dryRun: Boolean(o.dryRun),
    added: num(o.added) ?? 0,
    updated: num(o.updated) ?? 0,
    removed: num(o.removed) ?? 0,
    unchanged: num(o.unchanged) ?? 0,
    messages,
  };
}

/** True when an import report shows no net changes. */
export function importReportIsClean(report: ImportReport): boolean {
  return report.added === 0 && report.updated === 0 && report.removed === 0;
}

/** A one-line human summary of an import/sync report. */
export function summarizeImportReport(report: ImportReport): string {
  const prefix = report.dryRun ? 'Dry run: ' : '';
  if (importReportIsClean(report)) {
    return `${prefix}no changes (${report.unchanged} unchanged).`;
  }
  return `${prefix}+${report.added} / ~${report.updated} / -${report.removed} (${report.unchanged} unchanged).`;
}

// ---------------------------------------------------------------------------
// Browser reducer (list load + selection lifecycle)
// ---------------------------------------------------------------------------

/** The World Browser dock state. */
export interface WorldBrowserState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  readonly worlds: readonly WorldSummary[];
  readonly selectedId: string | null;
  readonly error: string | null;
}

/** Reducer actions driving the browser list + selection. */
export type WorldBrowserAction =
  | { readonly type: 'loadStart' }
  | { readonly type: 'loadSuccess'; readonly worlds: readonly WorldSummary[] }
  | { readonly type: 'loadError'; readonly error: string }
  | { readonly type: 'select'; readonly worldId: string | null };

/** The initial (unloaded) browser state. */
export function initialWorldBrowserState(): WorldBrowserState {
  return { status: 'idle', worlds: [], selectedId: null, error: null };
}

/**
 * Pure reducer for the World Browser. `loadSuccess` keeps the current selection
 * only if it still exists in the new list (so a re-fetch that drops a world clears
 * a now-dangling selection).
 */
export function worldBrowserReduce(
  state: WorldBrowserState,
  action: WorldBrowserAction,
): WorldBrowserState {
  switch (action.type) {
    case 'loadStart':
      return { ...state, status: 'loading', error: null };
    case 'loadSuccess': {
      const stillPresent =
        state.selectedId !== null &&
        action.worlds.some((w) => w.id === state.selectedId);
      return {
        status: 'loaded',
        worlds: action.worlds,
        selectedId: stillPresent ? state.selectedId : null,
        error: null,
      };
    }
    case 'loadError':
      return { ...state, status: 'error', error: action.error };
    case 'select': {
      if (
        action.worldId !== null &&
        !state.worlds.some((w) => w.id === action.worldId)
      ) {
        return state; // ignore selection of a world not in the list
      }
      return { ...state, selectedId: action.worldId };
    }
    default:
      return state;
  }
}

/** The currently-selected world, or null. */
export function selectedWorld(state: WorldBrowserState): WorldSummary | null {
  if (state.selectedId === null) return null;
  return state.worlds.find((w) => w.id === state.selectedId) ?? null;
}
