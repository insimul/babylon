/**
 * Quest Debug Overlay
 *
 * Pure-logic debug state manager for quest debugging during gameplay.
 * Tracks recent events, quest states, and provides tools for debugging
 * quest completability issues.
 *
 * Rendering is handled by the engine-specific layer (Babylon, Godot, etc.)
 * which reads from this state manager.
 *
 * Toggle with Ctrl+Shift+D in the game. Disabled in production builds
 * unless the --debug flag is set.
 */

import type { GameEvent } from '../logic/GameEventBus';
import type { CompletionQuest, CompletionObjective } from './QuestCompletionEngine';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DebugEventEntry {
  timestamp: number;
  event: GameEvent;
  /** Which objective IDs this event matched (if any) */
  matchedObjectives: string[];
}

export interface DebugQuestState {
  questId: string;
  questTitle: string;
  objectives: DebugObjectiveState[];
  isComplete: boolean;
}

export interface DebugObjectiveState {
  id: string;
  type: string;
  description: string;
  completed: boolean;
  locked: boolean;
  progress?: string;
}

export interface DebugValidationIssue {
  questId: string;
  questTitle: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface DebugOverlayState {
  enabled: boolean;
  recentEvents: DebugEventEntry[];
  questStates: DebugQuestState[];
  validationIssues: DebugValidationIssue[];
  cefrLevel: string | null;
  proficiencyMetrics: Record<string, number>;
  activeChapter: string | null;
  chapterProgress: Record<string, number>;
}

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_RECENT_EVENTS = 20;

// ── Manager ─────────────────────────────────────────────────────────────────

export class QuestDebugOverlay {
  private _enabled = false;
  private _recentEvents: DebugEventEntry[] = [];
  private _questStates = new Map<string, DebugQuestState>();
  private _validationIssues: DebugValidationIssue[] = [];
  private _cefrLevel: string | null = null;
  private _proficiencyMetrics: Record<string, number> = {};
  private _activeChapter: string | null = null;
  private _chapterProgress: Record<string, number> = {};
  private _onStateChange: (() => void) | null = null;
  private _isProductionBuild: boolean;

  constructor(options?: { isProduction?: boolean; debugFlag?: boolean }) {
    this._isProductionBuild = (options?.isProduction ?? false) && !(options?.debugFlag ?? false);
  }

  /** Whether the overlay should be shown */
  get enabled(): boolean {
    return this._enabled && !this._isProductionBuild;
  }

  /** Toggle overlay visibility */
  toggle(): void {
    if (this._isProductionBuild) return;
    this._enabled = !this._enabled;
    this._notifyChange();
  }

  setEnabled(enabled: boolean): void {
    if (this._isProductionBuild) return;
    this._enabled = enabled;
    this._notifyChange();
  }

  /** Register a callback for state changes */
  onStateChange(callback: () => void): void {
    this._onStateChange = callback;
  }

  // ── Event logging ──

  /**
   * Log a game event. Call this from the GameEventBus listener.
   */
  logEvent(event: GameEvent, matchedObjectives: string[] = []): void {
    if (!this._enabled) return;

    this._recentEvents.unshift({
      timestamp: Date.now(),
      event,
      matchedObjectives,
    });

    // Trim to max
    if (this._recentEvents.length > MAX_RECENT_EVENTS) {
      this._recentEvents.length = MAX_RECENT_EVENTS;
    }

    this._notifyChange();
  }

  /** Get recent events (newest first) */
  getRecentEvents(): DebugEventEntry[] {
    return this._recentEvents;
  }

  // ── Quest state tracking ──

  /**
   * Update the debug state for a quest. Call after quest changes.
   */
  updateQuestState(
    quest: CompletionQuest,
    isComplete: boolean,
    isObjectiveLocked: (quest: CompletionQuest, obj: CompletionObjective) => boolean,
  ): void {
    if (!this._enabled) return;

    const objectives = (quest.objectives ?? []).map(obj => ({
      id: obj.id,
      type: obj.type,
      description: obj.description,
      completed: obj.completed,
      locked: isObjectiveLocked(quest, obj),
      progress: this._formatProgress(obj),
    }));

    this._questStates.set(quest.id, {
      questId: quest.id,
      questTitle: (quest as any).title || quest.id,
      objectives,
      isComplete,
    });

    this._notifyChange();
  }

  /** Remove quest from debug tracking */
  removeQuestState(questId: string): void {
    this._questStates.delete(questId);
    this._notifyChange();
  }

  /** Get all tracked quest states */
  getQuestStates(): DebugQuestState[] {
    return Array.from(this._questStates.values());
  }

  // ── Validation issues ──

  setValidationIssues(issues: DebugValidationIssue[]): void {
    this._validationIssues = issues;
    this._notifyChange();
  }

  getValidationIssues(): DebugValidationIssue[] {
    return this._validationIssues;
  }

  // ── CEFR / Chapter tracking ──

  setCefrLevel(level: string): void {
    this._cefrLevel = level;
    this._notifyChange();
  }

  setProficiencyMetrics(metrics: Record<string, number>): void {
    this._proficiencyMetrics = metrics;
    this._notifyChange();
  }

  setActiveChapter(chapterId: string | null): void {
    this._activeChapter = chapterId;
    this._notifyChange();
  }

  setChapterProgress(progress: Record<string, number>): void {
    this._chapterProgress = progress;
    this._notifyChange();
  }

  // ── Debug actions ──

  /**
   * Simulate completing an objective (for debugging).
   * Returns the event to emit, or null if not supported.
   */
  getCompleteObjectiveEvent(
    questId: string,
    objectiveId: string,
  ): { type: 'objective_direct_complete'; questId: string; objectiveId: string } {
    return { type: 'objective_direct_complete', questId, objectiveId };
  }

  /**
   * Get the location position for a quest objective (for warp-to-quest).
   * Returns null if no position data is available.
   */
  getObjectiveLocation(
    questId: string,
    objectiveId: string,
    questLocationMap: Map<string, { x: number; y: number; z: number }>,
  ): { x: number; y: number; z: number } | null {
    return questLocationMap.get(questId) ?? null;
  }

  // ── Full state snapshot ──

  getState(): DebugOverlayState {
    return {
      enabled: this.enabled,
      recentEvents: this._recentEvents,
      questStates: this.getQuestStates(),
      validationIssues: this._validationIssues,
      cefrLevel: this._cefrLevel,
      proficiencyMetrics: this._proficiencyMetrics,
      activeChapter: this._activeChapter,
      chapterProgress: this._chapterProgress,
    };
  }

  /** Reset all debug state */
  clear(): void {
    this._recentEvents = [];
    this._questStates.clear();
    this._validationIssues = [];
    this._notifyChange();
  }

  // ── Internal ──

  private _notifyChange(): void {
    this._onStateChange?.();
  }

  private _formatProgress(obj: CompletionObjective): string {
    if (obj.completed) return 'Done';

    if (obj.itemCount != null) {
      return `${obj.collectedCount ?? 0}/${obj.itemCount}`;
    }
    if (obj.requiredCount != null) {
      return `${obj.currentCount ?? 0}/${obj.requiredCount}`;
    }
    if (obj.enemiesRequired != null) {
      return `${obj.enemiesDefeated ?? 0}/${obj.enemiesRequired}`;
    }
    if (obj.stepsRequired != null) {
      return `${obj.stepsCompleted ?? 0}/${obj.stepsRequired}`;
    }

    return obj.completed ? 'Done' : 'In Progress';
  }
}
