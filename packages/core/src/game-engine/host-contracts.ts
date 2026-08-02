/**
 * Insimul Core — Host Contracts
 *
 * The interfaces that run the OTHER way from `system-contracts.ts`.
 *
 *  - `system-contracts.ts` — what each engine implements when it **ports a
 *    system** from the Babylon.js reference (ICombatSystem, IQuestSystem, …).
 *  - `host-contracts.ts` (this file) — what an engine adapter must **hand to
 *    core** so the shared runtime in `game-engine/logic/` can do its job without
 *    knowing which engine it is running inside.
 *
 * Every entry here exists because a real module is coupled to the Babylon
 * runtime through it today. The couplings were enumerated mechanically in
 * `shared/LOGIC_BOUNDARY.json` (regenerate with `npm run logic:classify`) and
 * read in `docs/logic-boundary-classification.md`; the contract as a whole is
 * documented in `docs/runtime-contract.md`, which names the Babylon reference
 * implementation and the Unity/Unreal/Godot equivalent for each interface.
 *
 * **These interfaces are declared, not yet wired.** The seven modules that need
 * them still live in `packages/babylon` (class (c) of the classification); the
 * inversion that moves them is follow-up work, and doing it here would be a
 * behaviour change rather than the import-path-only move US-3 made. What this
 * file buys today is that an adapter author for Unity/Unreal/Godot can read the
 * shape they must supply instead of reverse-engineering it from Babylon.
 *
 * Rules for anything added here:
 *
 *  1. **Narrow to what core actually calls.** `IResourceStore` has two methods
 *     because `CraftingSystem` calls two, not because a resource system has two.
 *     A wide interface is a port burden for three engines.
 *  2. **No engine types, no DOM types.** This file must compile under
 *     `packages/core/tsconfig.json`, which omits the `dom` lib on purpose.
 *  3. **Structural, so the existing Babylon class already fits.** Where a
 *     Babylon type is the de-facto shape (`DebugEvent`, `NPCPersonality`), the
 *     stand-in here is structurally compatible with it, following the
 *     `visual-types.ts` precedent — the adapter is a wrapper, not a rewrite.
 */

import type { ResourceType } from './visual-types';

// ─── Debug / telemetry sink ──────────────────────────────────────────────────

/**
 * One debug/telemetry record.
 *
 * Structurally the Babylon `game-engine/debug-event-bus.ts` `DebugEvent`, with
 * `category` widened from that file's `DebugLogCategory` union to `string` so
 * core does not own the host's category vocabulary.
 */
export interface DebugSinkEvent {
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  /** Host-defined channel, e.g. `'prolog'`, `'quest'`, `'language'`. */
  category: string;
  level: 'info' | 'warn' | 'error';
  /** Short tag for display, e.g. `'Prolog'`, `'LLM'`, `'EVAL'`. */
  tag: string;
  /** One-line summary shown collapsed. */
  summary: string;
  /** Multi-line detail shown expanded. */
  detail: string;
  source: 'client' | 'server';
}

/**
 * IDebugSink
 *
 * Where the shared runtime sends developer-facing diagnostics. This is the
 * single highest-leverage interface on this list: a boolean flag getter plus an
 * event bus are the entire coupling holding `GamePrologEngine` (2,267 lines),
 * and through it `AssessmentEngine`, `RadiantQuestDirector` and
 * `GameQuestManager.d.ts`, on the Babylon side of the boundary.
 *
 * Babylon:  `isDebugLabelsEnabled()` (`rendering/DebugLabelUtils.ts`) +
 *           `getDebugEventBus()` (`game-engine/debug-event-bus.ts`)
 * Unreal:   `UE_LOG` / a `UInsimulDebugSubsystem`
 * Unity:    `Debug.Log` behind a build flag
 * Godot:    `print_debug` / an autoload sink
 *
 * A headless host implements nothing and passes {@link NULL_DEBUG_SINK}.
 */
export interface IDebugSink {
  /**
   * Whether diagnostics are wanted at all. Core checks this BEFORE building an
   * event, because assembling one costs a Prolog KB dump on some paths.
   */
  isEnabled(): boolean;
  /** Deliver one event. Must not throw. */
  emit(event: DebugSinkEvent): void;
}

/** The do-nothing sink — the default when a host supplies none. */
export const NULL_DEBUG_SINK: IDebugSink = {
  isEnabled: () => false,
  emit: () => {},
};

// ─── Host lifecycle ──────────────────────────────────────────────────────────

/**
 * IHostLifecycle
 *
 * "Tell me when the host is going away", so the runtime can flush unsaved
 * progress. `LanguageProgressTracker` reaches for
 * `window.addEventListener('beforeunload')` today; that is not a browser
 * requirement, it is this hook with one implementation.
 *
 * Babylon:  `window.addEventListener('beforeunload', …)`
 * Unreal:   `AActor::EndPlay` / `FCoreDelegates::OnPreExit`
 * Unity:    `MonoBehaviour.OnApplicationQuit` / `OnApplicationPause`
 * Godot:    `NOTIFICATION_WM_CLOSE_REQUEST`
 *
 * The handler must be synchronous — every host fires this teardown notification
 * without awaiting anything, so an async flush is not guaranteed to land.
 */
export interface IHostLifecycle {
  /**
   * Register a handler to run just before the host suspends or shuts down.
   * Returns an unsubscribe function; calling it twice must be safe.
   */
  onBeforeSuspend(handler: () => void): () => void;
}

// ─── Audio: speech synthesis ─────────────────────────────────────────────────

/** A synthesized utterance, in whatever form the host can play back. */
export interface SynthesizedSpeech {
  /** Host-resolvable handle (a URI, an object URL, an asset path). */
  uri?: string;
  /** Raw encoded audio, when the host returns bytes rather than a handle. */
  audio?: ArrayBuffer;
  /** e.g. `'audio/wav'`. */
  mimeType: string;
}

/**
 * ISpeechSynthesizer
 *
 * Text-to-speech for pronunciation practice and assessment playback. Core
 * decides WHAT should be spoken and in which language; the host owns the voice
 * and the audio device.
 *
 * Babylon:  `AssessmentEngine`'s local-AI path — a web speech SDK, falling back
 *           to Electron Piper TTS via `window.electronAPI.aiTTS`
 * Unreal:   a `USoundWave` produced by the platform TTS
 * Unity:    a `AudioClip` from the platform TTS
 * Godot:    `DisplayServer.tts_speak` / an `AudioStream`
 *
 * Returning `null` means "no voice available" — core degrades to text-only and
 * must never treat it as an error.
 */
export interface ISpeechSynthesizer {
  synthesize(request: {
    text: string;
    /** BCP-47-ish language tag the passage is written in. */
    language: string;
    /** 1.0 = natural pace. Core asks for ~0.9 on assessment passages. */
    rate?: number;
    /** Host-defined voice id, when the world pins one. */
    voiceId?: string;
  }): Promise<SynthesizedSpeech | null>;
}

// ─── World state the host owns ───────────────────────────────────────────────

/**
 * IResourceStore
 *
 * The harvestable-resource query `RecipeCraftingSystem`'s Babylon sibling
 * `CraftingSystem` reaches into `rendering/ResourceSystem` for. Deliberately
 * two methods: core only ever asks "can I afford this recipe" and "take the
 * ingredients". The full engine-side system is `IResourceSystem` in
 * `system-contracts.ts`; this is the slice core consumes.
 */
export interface IResourceStore {
  /** Whether every requirement is currently satisfiable. */
  hasResources(requirements: Partial<Record<ResourceType, number>>): boolean;
  /**
   * Deduct every requirement atomically. Returns `false` and changes nothing if
   * any requirement is unmet.
   */
  consumeResources(requirements: Partial<Record<ResourceType, number>>): boolean;
}

/** The combat stats equipment modifies. */
export interface CombatStats {
  attackPower: number;
  defense: number;
  dodgeChance: number;
}

/**
 * ICombatStatSink
 *
 * `EquipmentManager` reads an entity's base stats once, then writes recomputed
 * totals back whenever equipment changes. That is the whole of its coupling to
 * `rendering/CombatSystem`, and it is type-only today — so this interface makes
 * it disappear rather than replacing a runtime dependency.
 *
 * Babylon:  `CombatSystem.getEntity(id)` and direct field assignment
 * Unreal:   an `UAttributeSet` / GAS attribute write
 * Unity:    the ported `CombatSystem.cs` entity record
 * Godot:    `combat_system.gd`'s entity dictionary
 */
export interface ICombatStatSink {
  /** Unmodified stats for an entity, or `undefined` if it is not in combat. */
  getBaseStats(entityId: string): CombatStats | undefined;
  /** Apply equipment-adjusted totals. A no-op for an unknown entity. */
  applyStats(entityId: string, stats: CombatStats): void;
}

/**
 * Big-Five personality weights, all optional.
 *
 * Structurally identical to Babylon's `rendering/NPCScheduleSystem.NPCPersonality`
 * and a `Partial` of `CharacterSnapshot['personality']` in `save-file.ts`.
 * `AmbientLifeBehaviorSystem` weights behaviour choices by these; the host owns
 * the NPC schedule that carries them.
 */
export interface NpcPersonalityTraits {
  openness?: number;
  conscientiousness?: number;
  extroversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}

// ─── The whole adapter ───────────────────────────────────────────────────────

/**
 * Everything an engine adapter may supply to the shared runtime.
 *
 * Every field is optional on purpose: each one degrades to a documented
 * fallback (no diagnostics, no flush-on-exit, text-only pronunciation, crafting
 * and equipment disabled), so a new adapter can come up in stages rather than
 * implementing eight interfaces before it renders a frame.
 *
 * Persistence is NOT here: it is `IDataSource` in `game-engine/data-source.ts`,
 * which predates this file and is already the interface core loads and saves
 * through.
 */
export interface EngineHostAdapter {
  debug?: IDebugSink;
  lifecycle?: IHostLifecycle;
  speech?: ISpeechSynthesizer;
  resources?: IResourceStore;
  combatStats?: ICombatStatSink;
}
