/**
 * AmbientSoundSystem — Environmental audio tied to location and time of day.
 *
 * Manages layered ambient soundscapes that change based on where the player is
 * (wilderness, settlement, indoors) and the current time of day. Delegates
 * actual audio playback to callbacks so the system remains testable without
 * Babylon.js or Web Audio dependencies.
 */

import type { GameEventBus } from './GameEventBus';
import type { TimeOfDay } from './GameTimeManager';

// ── Environment types ────────────────────────────────────────────────────────

export type EnvironmentType =
  | 'wilderness'
  | 'settlement'
  | 'indoor';

// ── Sound layer definition ───────────────────────────────────────────────────

export interface AmbientSoundLayer {
  /** Unique id for this layer (e.g. "birds", "wind", "crickets") */
  id: string;
  /** Relative volume 0-1 within the profile */
  volume: number;
  /** Whether this layer loops continuously */
  loop: boolean;
}

// ── Ambient profile ──────────────────────────────────────────────────────────

export interface AmbientProfile {
  environment: EnvironmentType;
  timeOfDay: TimeOfDay;
  /** Sound layers active in this profile */
  layers: AmbientSoundLayer[];
}

// ── Playback callbacks ───────────────────────────────────────────────────────

export interface AmbientSoundCallbacks {
  /** Start playing a sound layer. Called when a profile activates a new layer. */
  onLayerStart: (layer: AmbientSoundLayer) => void;
  /** Stop a sound layer. Called when a profile no longer includes a layer. */
  onLayerStop: (layerId: string) => void;
  /** Update volume of an existing layer (e.g. crossfade or time-based shift). */
  onLayerVolumeChange: (layerId: string, volume: number) => void;
}

// ── Default profiles ─────────────────────────────────────────────────────────

const DEFAULT_PROFILES: AmbientProfile[] = [
  // Wilderness
  { environment: 'wilderness', timeOfDay: 'dawn', layers: [
    { id: 'birds_dawn', volume: 0.7, loop: true },
    { id: 'wind_light', volume: 0.3, loop: true },
  ]},
  { environment: 'wilderness', timeOfDay: 'morning', layers: [
    { id: 'birds', volume: 0.5, loop: true },
    { id: 'wind_light', volume: 0.3, loop: true },
    { id: 'insects_day', volume: 0.2, loop: true },
  ]},
  { environment: 'wilderness', timeOfDay: 'midday', layers: [
    { id: 'birds', volume: 0.3, loop: true },
    { id: 'wind_light', volume: 0.4, loop: true },
    { id: 'insects_day', volume: 0.3, loop: true },
  ]},
  { environment: 'wilderness', timeOfDay: 'afternoon', layers: [
    { id: 'birds', volume: 0.4, loop: true },
    { id: 'wind_light', volume: 0.3, loop: true },
    { id: 'insects_day', volume: 0.2, loop: true },
  ]},
  { environment: 'wilderness', timeOfDay: 'evening', layers: [
    { id: 'crickets', volume: 0.5, loop: true },
    { id: 'wind_light', volume: 0.3, loop: true },
  ]},
  { environment: 'wilderness', timeOfDay: 'night', layers: [
    { id: 'crickets', volume: 0.6, loop: true },
    { id: 'owls', volume: 0.3, loop: true },
    { id: 'wind_night', volume: 0.4, loop: true },
  ]},

  // Settlement
  { environment: 'settlement', timeOfDay: 'dawn', layers: [
    { id: 'birds_dawn', volume: 0.4, loop: true },
    { id: 'town_waking', volume: 0.3, loop: true },
  ]},
  { environment: 'settlement', timeOfDay: 'morning', layers: [
    { id: 'town_bustle', volume: 0.5, loop: true },
    { id: 'birds', volume: 0.2, loop: true },
  ]},
  { environment: 'settlement', timeOfDay: 'midday', layers: [
    { id: 'town_bustle', volume: 0.7, loop: true },
    { id: 'market_chatter', volume: 0.4, loop: true },
  ]},
  { environment: 'settlement', timeOfDay: 'afternoon', layers: [
    { id: 'town_bustle', volume: 0.5, loop: true },
    { id: 'market_chatter', volume: 0.3, loop: true },
  ]},
  { environment: 'settlement', timeOfDay: 'evening', layers: [
    { id: 'town_evening', volume: 0.4, loop: true },
    { id: 'crickets', volume: 0.3, loop: true },
  ]},
  { environment: 'settlement', timeOfDay: 'night', layers: [
    { id: 'town_quiet', volume: 0.3, loop: true },
    { id: 'crickets', volume: 0.4, loop: true },
    { id: 'wind_night', volume: 0.2, loop: true },
  ]},

  // Indoor
  { environment: 'indoor', timeOfDay: 'dawn', layers: [
    { id: 'indoor_ambience', volume: 0.4, loop: true },
    { id: 'muffled_birds', volume: 0.15, loop: true },
  ]},
  { environment: 'indoor', timeOfDay: 'morning', layers: [
    { id: 'indoor_ambience', volume: 0.4, loop: true },
    { id: 'muffled_exterior', volume: 0.2, loop: true },
  ]},
  { environment: 'indoor', timeOfDay: 'midday', layers: [
    { id: 'indoor_ambience', volume: 0.5, loop: true },
    { id: 'muffled_exterior', volume: 0.25, loop: true },
  ]},
  { environment: 'indoor', timeOfDay: 'afternoon', layers: [
    { id: 'indoor_ambience', volume: 0.4, loop: true },
    { id: 'muffled_exterior', volume: 0.2, loop: true },
  ]},
  { environment: 'indoor', timeOfDay: 'evening', layers: [
    { id: 'indoor_ambience', volume: 0.5, loop: true },
    { id: 'fireplace', volume: 0.3, loop: true },
  ]},
  { environment: 'indoor', timeOfDay: 'night', layers: [
    { id: 'indoor_ambience', volume: 0.3, loop: true },
    { id: 'fireplace', volume: 0.4, loop: true },
  ]},
];

// ── AmbientSoundSystem ──────────────────────────────────────────────────────

export class AmbientSoundSystem {
  private profiles: AmbientProfile[];
  private callbacks: AmbientSoundCallbacks;
  private unsubscribers: (() => void)[] = [];

  private _environment: EnvironmentType = 'wilderness';
  private _timeOfDay: TimeOfDay = 'morning';
  private _activeLayers: Map<string, AmbientSoundLayer> = new Map();
  private _isRunning = false;

  constructor(callbacks: AmbientSoundCallbacks, profiles?: AmbientProfile[]) {
    this.callbacks = callbacks;
    this.profiles = profiles ?? DEFAULT_PROFILES;
  }

  // ── Getters ────────────────────────────────────────────────────────────

  get environment(): EnvironmentType { return this._environment; }
  get timeOfDay(): TimeOfDay { return this._timeOfDay; }
  get isRunning(): boolean { return this._isRunning; }
  get activeLayerIds(): string[] { return Array.from(this._activeLayers.keys()); }

  // ── Event bus wiring ───────────────────────────────────────────────────

  connectEventBus(eventBus: GameEventBus): void {
    this.unsubscribers.push(
      eventBus.on('time_of_day_changed', (e) => {
        this.setTimeOfDay(e.to as TimeOfDay);
      }),
      eventBus.on('settlement_entered', () => {
        this.setEnvironment('settlement');
      }),
    );
  }

  // ── Environment & time setters ─────────────────────────────────────────

  setEnvironment(env: EnvironmentType): void {
    if (env === this._environment) return;
    this._environment = env;
    if (this._isRunning) this.applyProfile();
  }

  setTimeOfDay(tod: TimeOfDay): void {
    if (tod === this._timeOfDay) return;
    this._timeOfDay = tod;
    if (this._isRunning) this.applyProfile();
  }

  // ── Start / stop ──────────────────────────────────────────────────────

  start(initialEnvironment?: EnvironmentType, initialTimeOfDay?: TimeOfDay): void {
    if (initialEnvironment) this._environment = initialEnvironment;
    if (initialTimeOfDay) this._timeOfDay = initialTimeOfDay;
    this._isRunning = true;
    this.applyProfile();
  }

  stop(): void {
    this._isRunning = false;
    for (const layerId of this._activeLayers.keys()) {
      this.callbacks.onLayerStop(layerId);
    }
    this._activeLayers.clear();
  }

  // ── Profile resolution ────────────────────────────────────────────────

  getProfile(env: EnvironmentType, tod: TimeOfDay): AmbientProfile | null {
    return this.profiles.find(
      p => p.environment === env && p.timeOfDay === tod
    ) ?? null;
  }

  // ── Core: apply the correct profile, diffing against active layers ────

  private applyProfile(): void {
    const profile = this.getProfile(this._environment, this._timeOfDay);
    const targetLayers = profile?.layers ?? [];

    const targetMap = new Map(targetLayers.map(l => [l.id, l]));

    // Stop layers that are no longer in the target profile
    for (const [id] of this._activeLayers) {
      if (!targetMap.has(id)) {
        this.callbacks.onLayerStop(id);
        this._activeLayers.delete(id);
      }
    }

    // Start new layers or update volume on existing ones
    for (const layer of targetLayers) {
      const existing = this._activeLayers.get(layer.id);
      if (!existing) {
        this.callbacks.onLayerStart(layer);
        this._activeLayers.set(layer.id, layer);
      } else if (existing.volume !== layer.volume) {
        this.callbacks.onLayerVolumeChange(layer.id, layer.volume);
        this._activeLayers.set(layer.id, layer);
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}
