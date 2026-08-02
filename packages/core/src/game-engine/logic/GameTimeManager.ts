/**
 * GameTimeManager — Single source of truth for game time.
 *
 * Maps real time to game time with a configurable ratio.
 * Default: 1 real minute = 1 game hour (24 real minutes = 1 game day = 1 timestep).
 *
 * Fires events on the GameEventBus at time boundaries:
 *   hour_changed, day_changed, timestep_advanced, time_of_day_changed
 */

import type { GameEventBus } from './GameEventBus';

// ── Time-of-day periods ─────────────────────────────────────────────────────

export type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface GameTimeManagerOptions {
  /** Real milliseconds per game hour (default 60 000 = 1 real min per game hour). */
  msPerGameHour?: number;
  /** Starting game hour 0-23 (default 8). */
  startHour?: number;
  /** Starting game minute 0-59 (default 0). */
  startMinute?: number;
  /** Starting day number, 1-based (default 1). */
  startDay?: number;
}

// ── Serializable state for save/load ────────────────────────────────────────

export interface GameTimeState {
  hour: number;
  minute: number;
  day: number;
  msPerGameHour: number;
  paused: boolean;
  timeScale: number;
}

// ── GameTimeManager ─────────────────────────────────────────────────────────

export class GameTimeManager {
  private _hour: number;
  private _minute: number;
  private _day: number;
  private _accumulatedMs: number = 0;
  private _msPerGameHour: number;
  private _paused: boolean = false;
  /** Multiplier applied on top of base rate (1 = normal, 2 = 2x, etc.). */
  private _timeScale: number = 1;
  private _eventBus: GameEventBus | null = null;
  private _lastTimeOfDay: TimeOfDay;

  constructor(options: GameTimeManagerOptions = {}) {
    this._msPerGameHour = options.msPerGameHour ?? 60_000;
    this._hour = options.startHour ?? 8;
    this._minute = options.startMinute ?? 0;
    this._day = options.startDay ?? 1;
    this._lastTimeOfDay = getTimeOfDay(this._hour);
  }

  // ── Wiring ──────────────────────────────────────────────────────────────

  setEventBus(bus: GameEventBus): void {
    this._eventBus = bus;
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  get hour(): number { return this._hour; }
  get minute(): number { return Math.floor(this._minute); }
  get day(): number { return this._day; }
  /** Alias: 1 timestep = 1 day. */
  get timestep(): number { return this._day; }
  get timeOfDay(): TimeOfDay { return getTimeOfDay(this._hour); }
  get paused(): boolean { return this._paused; }
  get timeScale(): number { return this._timeScale; }
  get msPerGameHour(): number { return this._msPerGameHour; }
  get isDaytime(): boolean { return this._hour >= 6 && this._hour < 18; }

  /** Fractional hour (0–24), e.g. 8.5 = 8:30 AM. Used for smooth interpolation. */
  get fractionalHour(): number { return this._hour + this._minute / 60; }

  /** Formatted "HH:MM". */
  get timeString(): string {
    return `${String(this._hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}`;
  }

  /** Real seconds that elapse per game hour at current settings. */
  get realSecondsPerGameHour(): number {
    return this._msPerGameHour / (this._timeScale * 1000);
  }

  // ── Setters / controls ──────────────────────────────────────────────────

  pause(): void { this._paused = true; }
  resume(): void { this._paused = false; }

  setTimeScale(scale: number): void {
    this._timeScale = Math.max(0.25, Math.min(16, scale));
  }

  setMsPerGameHour(ms: number): void {
    this._msPerGameHour = Math.max(1_000, ms);
  }

  /** Advance time by a number of hours (e.g. resting). Fires hour/day/time-of-day events. */
  advanceHours(hours: number): void {
    if (hours <= 0) return;
    for (let i = 0; i < hours; i++) {
      this._minute = 0;
      this._hour += 1;
      if (this._hour >= 24) {
        this._hour = 0;
        this._day += 1;
        this._emitDayChanged();
      }
      this._emitHourChanged();
      const currentToD = getTimeOfDay(this._hour);
      if (currentToD !== this._lastTimeOfDay) {
        this._emitTimeOfDayChanged(this._lastTimeOfDay, currentToD);
        this._lastTimeOfDay = currentToD;
      }
    }
    this._accumulatedMs = 0;
  }

  /** Set time directly (e.g. from a save). Does NOT fire events. */
  setTime(hour: number, minute: number = 0, day?: number): void {
    this._hour = Math.max(0, Math.min(23, Math.floor(hour)));
    this._minute = Math.max(0, Math.min(59, minute));
    if (day !== undefined) this._day = Math.max(1, day);
    this._accumulatedMs = 0;
    this._lastTimeOfDay = getTimeOfDay(this._hour);
  }

  // ── Main update (call every frame) ──────────────────────────────────────

  update(deltaTimeMs: number): void {
    if (this._paused) return;

    const effectiveMs = deltaTimeMs * this._timeScale;
    this._accumulatedMs += effectiveMs;

    const msPerMinute = this._msPerGameHour / 60;
    const prevHour = this._hour;

    while (this._accumulatedMs >= msPerMinute) {
      this._accumulatedMs -= msPerMinute;
      this._minute += 1;

      if (this._minute >= 60) {
        this._minute -= 60;
        this._hour += 1;

        if (this._hour >= 24) {
          this._hour = 0;
          this._day += 1;
          this._emitDayChanged();
        }

        this._emitHourChanged();
      }
    }

    // Check for time-of-day transition (may span multiple hours in one frame at high speed)
    const currentToD = getTimeOfDay(this._hour);
    if (currentToD !== this._lastTimeOfDay) {
      this._emitTimeOfDayChanged(this._lastTimeOfDay, currentToD);
      this._lastTimeOfDay = currentToD;
    }
  }

  // ── Serialization ───────────────────────────────────────────────────────

  getState(): GameTimeState {
    return {
      hour: this._hour,
      minute: this.minute,
      day: this._day,
      msPerGameHour: this._msPerGameHour,
      paused: this._paused,
      timeScale: this._timeScale,
    };
  }

  restoreState(state: GameTimeState): void {
    this._hour = state.hour;
    this._minute = state.minute;
    this._day = state.day;
    this._msPerGameHour = state.msPerGameHour;
    this._paused = state.paused;
    this._timeScale = state.timeScale;
    this._accumulatedMs = 0;
    this._lastTimeOfDay = getTimeOfDay(this._hour);
  }

  // ── Event emission ──────────────────────────────────────────────────────

  private _emitHourChanged(): void {
    this._eventBus?.emit({ type: 'hour_changed', hour: this._hour, day: this._day });
  }

  private _emitDayChanged(): void {
    this._eventBus?.emit({ type: 'day_changed', day: this._day, timestep: this._day });
  }

  private _emitTimeOfDayChanged(from: TimeOfDay, to: TimeOfDay): void {
    this._eventBus?.emit({ type: 'time_of_day_changed', from, to, hour: this._hour });
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    this._eventBus = null;
  }
}
