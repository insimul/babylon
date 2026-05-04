/**
 * BabylonWorld - Minimal React wrapper for the BabylonGame class
 *
 * On mount, starts a new game by fetching a world snapshot from the server,
 * creating a save file, and initializing BabylonGame with a SaveFileDataSource.
 * All game reads come from the embedded snapshot. Writes go to the save file's
 * currentState, which is periodically persisted back to the server.
 *
 * Startup is coordinated by StartupOrchestrator (US-010) so independent
 * fetches (save list, save file, UI translations) can run concurrently and
 * the player sees meaningful per-phase progress via <LoadingScreen />.
 *
 * This component lives in @insimul/babylon-game (runtime SDK). Auth (token,
 * assetMounts) and i18n hooks (loadWorldTranslations/setTargetLanguage) are
 * passed via props so the package has no dependency on the editor's auth
 * context or i18n module.
 */

import { useEffect, useRef, useState } from "react";
import {
  BabylonGame,
  GAME_LOADING_PHASES,
  type LoadingHost,
} from "@shared/game-engine/rendering/BabylonGame";
import type { AssetMount } from "@shared/game-engine/asset-mount";
import { SaveFileDataSource } from "./SaveFileDataSource";
import { unsafeAssertMigrated, type SaveFile } from "@shared/save-file";
import {
  StartupProfiler,
  createLocalStoragePhaseHistoryStore,
  type StartupProfilerState,
} from "./optimization/StartupProfiler";
import { StartupOrchestrator } from "./optimization/StartupOrchestrator";
import { QuickResumeCache } from "./optimization/QuickResumeCache";
import { LoadingScreen } from "./optimization/LoadingScreen";
import { fetchGameDataBundle } from "./optimization/GameDataCache";
import {
  SaveMigrationPromptModal,
  type MigrationPromptAction,
} from "./ui/SaveMigrationPromptModal";
import { isMigrationOutcomeSignificant, type MigrationOutcome } from "@shared/save-file";

function downloadSaveJson(saveFile: any): void {
  try {
    const { _migrationOutcome: _omit, _showSelectionMenu: _omit2, ...exportable } = saveFile ?? {};
    const json = JSON.stringify(exportable, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `insimul-save-${saveFile?.id ?? 'unknown'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[BabylonWorld] Failed to download save backup:', err);
  }
}

/**
 * Subset of i18n hooks BabylonWorld needs. Editor builds wire these to the
 * platform's i18next instance; standalone exports can pass no-op stubs.
 */
export interface BabylonWorldI18n {
  setTargetLanguage(langCode: string): void;
  loadWorldTranslations(langCode: string, translations: unknown): void;
}

export interface BabylonWorldProps {
  worldId: string;
  worldName: string;
  worldType?: string;
  userId?: string;
  playthroughId?: string;
  saveId?: string;
  /** Auth token used for server requests. Required for editor builds. */
  token: string | null;
  /** Asset-mount manifest selecting which asset bundles the game loads. */
  assetMounts: AssetMount[];
  /**
   * i18n hooks. Optional: standalone exports without translation infrastructure
   * can omit this prop and the i18n task is skipped.
   */
  i18n?: BabylonWorldI18n;
  onBack: () => void;
}

export function BabylonWorld({
  worldId,
  worldName,
  worldType,
  playthroughId,
  saveId,
  token,
  assetMounts,
  i18n,
  onBack,
}: BabylonWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<BabylonGame | null>(null);
  const dataSourceRef = useRef<SaveFileDataSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startupState, setStartupState] = useState<StartupProfilerState | null>(null);
  const [overlayHidden, setOverlayHidden] = useState(false);
  const [auxStatus, setAuxStatus] = useState<string>("");
  const [migrationPrompt, setMigrationPrompt] = useState<MigrationOutcome | null>(null);
  const migrationResolveRef = useRef<((action: MigrationPromptAction) => void) | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !token) return;

    let disposed = false;
    const abortController = new AbortController();
    const quickResume = new QuickResumeCache();

    const profiler = new StartupProfiler([], {
      historyStore: createLocalStoragePhaseHistoryStore(),
    });
    const unsubscribe = profiler.subscribe((s) => {
      if (!disposed) setStartupState(s);
    });

    // BabylonGame drives these phases during its init(). We register them
    // up-front so the overall progress bar reflects the full load from the
    // start, not just the orchestrator's pre-init tasks.
    for (const ph of GAME_LOADING_PHASES) profiler.addPhase(ph);

    const loadingHost: LoadingHost = {
      startPhase: (id) => profiler.startPhase(id),
      setPhaseProgress: (id, p) => profiler.setPhaseProgress(id, p),
      completePhase: (id) => profiler.completePhase(id),
      setOverlayVisible: (visible) => {
        if (!disposed) setOverlayHidden(!visible);
      },
      setAuxStatus: (text) => {
        if (!disposed) setAuxStatus(text);
      },
    };

    async function startGame() {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };

        const orchestrator = new StartupOrchestrator(profiler);

        // Resolve save file either by explicit saveId or by listing existing
        // saves. When neither is available a new save is created.
        orchestrator.addTask<{ saveFile: any; fastPath: boolean }>({
          id: 'save-file',
          label: 'Loading save file',
          weight: 3,
          critical: true,
          async run({ reportProgress }) {
            reportProgress(0.1);
            let saveFile: any;
            let fastPath = false;
            if (saveId) {
              const res = await fetch(`/api/saves/${saveId}`, { headers });
              if (!res.ok) throw new Error('Failed to load save file');
              saveFile = await res.json();
            } else {
              const listRes = await fetch(`/api/worlds/${worldId}/saves`, { headers });
              const existingSaves = listRes.ok ? await listRes.json() : [];
              reportProgress(0.4);
              if (existingSaves.length > 0) {
                const res = await fetch(`/api/saves/${existingSaves[0].id}`, { headers });
                if (!res.ok) throw new Error('Failed to load save for data source');
                saveFile = await res.json();
                saveFile._showSelectionMenu = true;
              } else {
                const res = await fetch(`/api/worlds/${worldId}/saves/new-game`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ name: worldName }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || 'Failed to start new game');
                }
                const { id } = await res.json();
                const loadRes = await fetch(`/api/saves/${id}`, { headers });
                if (!loadRes.ok) throw new Error('Failed to load new save file');
                saveFile = await loadRes.json();
              }
            }
            reportProgress(0.9);
            const version = String(saveFile.updatedAt ?? saveFile.id);
            fastPath = quickResume.canQuickResume(saveFile.id, version);
            quickResume.record(saveFile.id, version);
            reportProgress(1);
            return { saveFile, fastPath };
          },
        });

        // UI translations for language-learning worlds — runs in parallel
        // with scene setup. Failure here should not block gameplay. Skipped
        // when no i18n hooks are provided (e.g. standalone exports).
        orchestrator.addTask({
          id: 'ui-translations',
          label: 'Loading translations',
          weight: 1,
          dependencies: ['save-file'],
          async run({ getResult, reportProgress }) {
            const i18nHooks = i18nRef.current;
            if (!i18nHooks) {
              reportProgress(1);
              return null;
            }
            const { saveFile } = getResult<{ saveFile: any }>('save-file') ?? {};
            const worldData = saveFile?.worldSnapshot?.world || saveFile?.worldSnapshot;
            const targetLang = worldData?.targetLanguage;
            if (!targetLang || worldData?.gameType !== 'language-learning') {
              reportProgress(1);
              return null;
            }
            const langCode = targetLang.toLowerCase().slice(0, 2);
            i18nHooks.setTargetLanguage(langCode);
            reportProgress(0.3);
            // US-008: fetch UI translations via the shared game-data batch
            // endpoint so they benefit from IndexedDB caching + ETag 304s.
            const bundle = await fetchGameDataBundle(worldId, {
              authToken: token!,
              langCode,
              parts: ['uiTranslations'],
            });
            reportProgress(0.8);
            const translations = (bundle.uiTranslations as any)?.translations;
            if (translations) {
              i18nHooks.loadWorldTranslations(langCode, translations);
            }
            reportProgress(1);
            return null;
          },
        });

        // Create the data source + BabylonGame instance.
        orchestrator.addTask({
          id: 'scene-setup',
          label: 'Preparing scene',
          weight: 1,
          dependencies: ['save-file'],
          critical: true,
          async run({ getResult, reportProgress }) {
            const { saveFile } = getResult<{ saveFile: any }>('save-file')!;
            if (disposed) return null;
            reportProgress(0.2);
            // The save was loaded via /api/saves/:id which migrates server-side,
            // so it is current-format by construction. JSON serialization strips
            // the `MigratedSaveFile` brand, so we re-apply it here.
            const ds = new SaveFileDataSource(unsafeAssertMigrated(saveFile as SaveFile), token!);
            dataSourceRef.current = ds;
            reportProgress(0.6);
            const game = new BabylonGame(canvas!, {
              worldId,
              worldName,
              worldType,
              authToken: token!,
              playthroughId: saveFile._showSelectionMenu ? undefined : saveFile.id,
              dataSource: ds,
              assetMounts,
              loadingHost,
              onBack: () => {
                ds.persistToServer().catch(console.error);
                onBackRef.current();
              },
            });
            gameRef.current = game;
            reportProgress(1);
            return null;
          },
        });

        const startupResult = await orchestrator.run(abortController.signal);

        if (disposed) return;
        const game = gameRef.current;
        if (!game) throw new Error('Scene setup did not produce a game instance');

        const saveResult = startupResult.results['save-file'] as { saveFile: any } | undefined;
        const loadedSaveFile = saveResult?.saveFile;
        const outcome: MigrationOutcome | undefined = loadedSaveFile?._migrationOutcome;
        if (outcome && isMigrationOutcomeSignificant(outcome)) {
          const action = await new Promise<MigrationPromptAction>((resolve) => {
            migrationResolveRef.current = resolve;
            setMigrationPrompt(outcome);
          });
          if (disposed) return;
          if (action === 'fresh') {
            onBackRef.current();
            return;
          }
          if (action === 'backup') {
            downloadSaveJson(loadedSaveFile);
          }
        }

        // The React loading overlay stays mounted through game.init(). The
        // game toggles it off via loadingHost.setOverlayVisible(false) when
        // the playthrough selection menu appears, and back on while loading
        // resumes — giving us one unified overlay instead of two.
        profiler.logReport('BabylonWorld startup');
        await game.init();
        if (!disposed) setLoading(false);
      } catch (err) {
        if (!disposed) {
          console.error('[BabylonWorld] Failed to start game:', err);
          setError((err as Error).message);
          setLoading(false);
        }
      }
    }

    startGame();

    return () => {
      disposed = true;
      unsubscribe();
      abortController.abort();
      if (dataSourceRef.current) {
        dataSourceRef.current.dispose();
        dataSourceRef.current = null;
      }
      if (gameRef.current) {
        gameRef.current.dispose();
        gameRef.current = null;
      }
    };
  }, [worldId, worldName, worldType, token, playthroughId, saveId, assetMounts]);

  const handleMigrationAction = (action: MigrationPromptAction) => {
    const resolve = migrationResolveRef.current;
    migrationResolveRef.current = null;
    setMigrationPrompt(null);
    resolve?.(action);
  };

  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      <SaveMigrationPromptModal
        open={migrationPrompt !== null}
        outcome={migrationPrompt}
        onAction={handleMigrationAction}
      />
      {loading && !error && !overlayHidden && startupState && (
        <LoadingScreen
          state={startupState}
          subtitle={auxStatus || "Setting up your world"}
          onCancel={() => onBackRef.current()}
        />
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f0e8', color: '#a84232', zIndex: 10, gap: 12 }}>
          <div style={{ fontSize: 18 }}>Failed to start game</div>
          <div style={{ fontSize: 14, color: '#6b5d4d' }}>{error}</div>
          <button onClick={() => onBackRef.current()} style={{ marginTop: 12, padding: '8px 16px', background: '#7a5c3a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Back to Editor
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          outline: 'none',
          touchAction: 'none',
          backgroundColor: '#f5f0e8'
        }}
      />
    </div>
  );
}
