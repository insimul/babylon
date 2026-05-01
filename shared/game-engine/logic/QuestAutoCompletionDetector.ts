/**
 * Quest Auto-Completion Detector
 *
 * Periodically checks active quests to detect when all objectives are complete,
 * then triggers the celebration ceremony and server sync automatically.
 * Runs on a 2-second interval to catch completions from any source.
 */

export interface ActiveQuest {
  id: string;
  worldId: string;
  title: string;
  status: string;
  objectives: Array<{ id: string; completed: boolean }>;
}

export interface AutoCompletionHandler {
  (quest: ActiveQuest): void;
}

export class QuestAutoCompletionDetector {
  private completedQuestIds = new Set<string>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private getActiveQuests: () => ActiveQuest[];
  private onQuestAutoCompleted: AutoCompletionHandler;
  private checkIntervalMs: number;

  constructor(
    getActiveQuests: () => ActiveQuest[],
    onQuestAutoCompleted: AutoCompletionHandler,
    checkIntervalMs = 2000,
  ) {
    this.getActiveQuests = getActiveQuests;
    this.onQuestAutoCompleted = onQuestAutoCompleted;
    this.checkIntervalMs = checkIntervalMs;
  }

  public start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.check(), this.checkIntervalMs);
  }

  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public check(): void {
    const quests = this.getActiveQuests();
    for (const quest of quests) {
      if (this.completedQuestIds.has(quest.id)) continue;
      if (quest.status === 'completed') continue;
      if (!quest.objectives || quest.objectives.length === 0) continue;

      const allComplete = quest.objectives.every(o => o.completed);
      if (allComplete) {
        this.completedQuestIds.add(quest.id);
        this.onQuestAutoCompleted(quest);
      }
    }
  }

  public markCompleted(questId: string): void {
    this.completedQuestIds.add(questId);
  }

  public isRunning(): boolean {
    return this.intervalId !== null;
  }

  public getCompletedIds(): ReadonlySet<string> {
    return this.completedQuestIds;
  }

  public dispose(): void {
    this.stop();
    this.completedQuestIds.clear();
  }
}
