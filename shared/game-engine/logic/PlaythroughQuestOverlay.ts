/**
 * PlaythroughQuestOverlay — Stores quest state changes per-playthrough
 * instead of writing directly to the world's quest collection.
 *
 * On reads, merges base world quests with playthrough-local overrides.
 * On writes, captures changes in memory (never touches the world).
 * Serializes to/from GameSaveState.questProgress for save/load.
 */

export interface QuestOverride {
  /** Partial quest fields that override the base world quest. */
  [key: string]: any;
}

export interface QuestOverlayState {
  /** Map of questId → partial override fields */
  overrides: Record<string, QuestOverride>;
  /** Quest IDs created during this playthrough (not in base world) */
  created: Record<string, any>;
  /** Map of questId → array of objective progress snapshots (mutable fields only) */
  objectiveStates?: Record<string, Array<Record<string, any>>>;
}

export class PlaythroughQuestOverlay {
  private overrides: Map<string, QuestOverride> = new Map();
  private created: Map<string, any> = new Map();
  private objectiveStates: Record<string, Array<Record<string, any>>> = {};

  /**
   * Apply a partial update to a quest's playthrough-local state.
   * This replaces what would have been a world-level write.
   */
  updateQuest(questId: string, data: QuestOverride): void {
    const existing = this.overrides.get(questId) || {};
    this.overrides.set(questId, { ...existing, ...data });
  }

  /**
   * Get the playthrough-local override for a specific quest, or null.
   */
  getOverride(questId: string): QuestOverride | null {
    return this.overrides.get(questId) || null;
  }

  /**
   * Check if any overrides exist.
   */
  hasOverrides(): boolean {
    return this.overrides.size > 0 || this.created.size > 0;
  }

  /**
   * Set objective progress states for persistence (from QuestCompletionEngine).
   */
  setObjectiveStates(states: Record<string, Array<Record<string, any>>>): void {
    this.objectiveStates = states;
  }

  /**
   * Get saved objective progress states (for restoring into QuestCompletionEngine).
   */
  getObjectiveStates(): Record<string, Array<Record<string, any>>> {
    return this.objectiveStates;
  }

  /**
   * Register a quest created during this playthrough (e.g. dynamic quests).
   */
  createQuest(quest: any): void {
    this.created.set(quest.id, quest);
  }

  /**
   * Merge base world quests with playthrough-local overrides.
   * Returns a new array — does not mutate the input.
   */
  mergeQuests(baseQuests: any[]): any[] {
    const merged = baseQuests.map(quest => {
      const override = this.overrides.get(quest.id);
      const result = override ? { ...quest, ...override } : { ...quest };
      // Apply saved objective progress on top of base objectives
      this.applyObjectiveStates(result);
      return result;
    });

    // Append quests created during this playthrough
    this.created.forEach((quest, id) => {
      if (!merged.some(q => q.id === id)) {
        const override = this.overrides.get(id);
        const result = override ? { ...quest, ...override } : { ...quest };
        this.applyObjectiveStates(result);
        merged.push(result);
      }
    });

    return merged;
  }

  /** Merge saved objective progress into a quest's objectives array (deep-copies first). */
  private applyObjectiveStates(quest: any): void {
    const saved = this.objectiveStates[quest.id];
    if (!saved || !quest.objectives) return;
    // Deep-copy objectives to avoid mutating the base quest
    quest.objectives = quest.objectives.map((o: any) => ({ ...o }));
    for (const savedObj of saved) {
      const obj = quest.objectives.find((o: any) => o.id === savedObj.id);
      if (obj) {
        // Only merge runtime-mutable fields — don't overwrite Prolog-derived fields
        // like description, type, required, requiredCount with stale saved data
        if (savedObj.completed !== undefined) obj.completed = savedObj.completed;
        if (savedObj.currentCount !== undefined) obj.currentCount = savedObj.currentCount;
        if (savedObj.current !== undefined) obj.current = savedObj.current;
        if (savedObj.score !== undefined) obj.score = savedObj.score;
        if (savedObj.maxScore !== undefined) obj.maxScore = savedObj.maxScore;
      }
    }
  }

  /**
   * Get a single quest by ID, merged with overlay.
   */
  getQuest(questId: string, baseQuests: any[]): any | null {
    const created = this.created.get(questId);
    if (created) {
      const override = this.overrides.get(questId);
      return override ? { ...created, ...override } : created;
    }

    const base = baseQuests.find(q => q.id === questId);
    if (!base) return null;

    const override = this.overrides.get(questId);
    return override ? { ...base, ...override } : base;
  }

  /**
   * Serialize overlay state for inclusion in GameSaveState.questProgress.
   */
  serialize(): QuestOverlayState {
    const overrides: Record<string, QuestOverride> = {};
    this.overrides.forEach((data, id) => { overrides[id] = data; });
    const created: Record<string, any> = {};
    this.created.forEach((quest, id) => { created[id] = quest; });
    const result: QuestOverlayState = { overrides, created };
    if (Object.keys(this.objectiveStates).length > 0) {
      result.objectiveStates = this.objectiveStates;
    }
    return result;
  }

  /**
   * Restore overlay state from a saved GameSaveState.questProgress.
   */
  deserialize(state: QuestOverlayState | Record<string, any>): void {
    this.clear();

    // Handle the new format with { overrides, created, objectiveStates }
    if (state && typeof state === 'object' && 'overrides' in state) {
      const typed = state as QuestOverlayState;
      for (const [id, data] of Object.entries(typed.overrides || {})) {
        this.overrides.set(id, data);
      }
      for (const [id, quest] of Object.entries(typed.created || {})) {
        this.created.set(id, quest);
      }
      if (typed.objectiveStates) {
        this.objectiveStates = typed.objectiveStates;
      }
    }
    // Backward compat: old questProgress was a flat Record<questId, data>
    else if (state && typeof state === 'object') {
      for (const [id, data] of Object.entries(state)) {
        if (data && typeof data === 'object') {
          this.overrides.set(id, data as QuestOverride);
        }
      }
    }
  }

  /**
   * Clear all overlay state.
   */
  clear(): void {
    this.overrides.clear();
    this.created.clear();
    this.objectiveStates = {};
  }
}
