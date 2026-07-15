/**
 * Quest Notification Manager
 *
 * Provides:
 * 1. Styled in-game toast notifications for quest state changes
 * 2. A unified "Active Quest" HUD panel (top-left) showing:
 *    - Quest title
 *    - Vocabulary / Grammar progress bars (when applicable)
 *    - Overall quest progress bar
 * 3. A "Task Tracker" panel (below Active Quest) showing:
 *    - Numbered objectives ("Task N: description") with progress
 *    - Hints/clues for incomplete tasks
 *
 * All quest types use this same standardized UI — no quest-type-specific panels.
 */

import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
  TextWrapping,
} from "@babylonjs/gui";
import type { GameEventBus } from "../logic/GameEventBus";
import type { QuestLanguageFeedbackState } from "@shared/language/quest-language-feedback";
import { createTickerText, disposeTickers, type TickerHandle } from "./GUITickerText";
import { NotificationStore } from "../logic/NotificationStore";
import type { CEFRLevel } from "@shared/language/cefr";
import { getLocalizedQuestText, getLocalizedObjectives } from "@shared/language/quest-localization";
import type { NotificationTranslationLookupFn } from "@shared/language/notification-labels";
import { getNotificationTitle, getNotificationDescription } from "@shared/language/notification-labels";
import type { UIImmersionMode } from "@shared/language/ui-localization";

// ── Toast config per event type ─────────────────────────────────────────────

interface QuestToastConfig {
  icon: string;
  color: string;
  background: string;
  duration: number;
}

const TOAST_CONFIGS: Record<string, QuestToastConfig> = {
  quest_accepted: { icon: "\u{1F4DC}", color: "#4CAF50", background: "rgba(20, 60, 20, 0.95)", duration: 4000 },
  quest_completed: { icon: "\u{1F3C6}", color: "#FFD700", background: "rgba(60, 50, 10, 0.95)", duration: 5000 },
  quest_failed: { icon: "\u{1F480}", color: "#F44336", background: "rgba(60, 15, 15, 0.95)", duration: 4000 },
  quest_abandoned: { icon: "\u{1F6AB}", color: "#888", background: "rgba(40, 40, 40, 0.95)", duration: 3000 },
  utterance_quest_progress: { icon: "\u{1F4CA}", color: "#2196F3", background: "rgba(15, 30, 60, 0.95)", duration: 2500 },
  utterance_quest_completed: { icon: "\u2705", color: "#4CAF50", background: "rgba(20, 60, 20, 0.95)", duration: 4000 },
  quest_reminder: { icon: "\u{1F4A1}", color: "#FFA726", background: "rgba(60, 40, 10, 0.95)", duration: 4000 },
  quest_expired: { icon: "\u23F0", color: "#F44336", background: "rgba(60, 15, 15, 0.95)", duration: 5000 },
  quest_milestone: { icon: "\u{1F31F}", color: "#E040FB", background: "rgba(50, 15, 60, 0.95)", duration: 6000 },
  daily_quests_reset: { icon: "\u{1F504}", color: "#29B6F6", background: "rgba(10, 30, 60, 0.95)", duration: 4000 },
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface ActiveQuestObjective {
  type: string;
  description: string;
  descriptionTranslation?: string;
  completed: boolean;
  current?: number;
  required?: number;
  hint?: string;
}

export interface ActiveQuestData {
  id: string;
  title: string;
  titleTranslation?: string;
  questType: string;
  objectives: ActiveQuestObjective[];
  progress?: number; // 0-1 overall
  cefrLevel?: CEFRLevel;
}

// ── Meta-objective hints ────────────────────────────────────────────────────
// Maps objective types to human-readable hints explaining what actions count.

const META_OBJECTIVE_HINTS: Record<string, string> = {
  vocabulary: 'Any word learned or used in conversation counts',
  use_vocabulary: 'Use target-language words in conversation',
  collect_vocabulary: 'Find and learn new words from the world',
  conversation: 'Any NPC conversation opened counts',
  complete_conversation: 'Complete conversations with NPCs',
  grammar: 'Positive grammar feedback in conversation counts',
  collect_text: 'Find books, letters, or journals in the world',
  find_text: 'Discover texts, signs, or notices around town',
  read_text: 'Read and comprehend collected texts',
  read_sign: 'Read signs and notices around town',
  visit_location: 'Travel to the marked locations',
  collect_item: 'Find and collect the required items',
  translation_challenge: 'Complete translation exercises',
  write_response: 'Write responses in the target language',
};

/**
 * Get a hint for a meta-objective type, or undefined if no hint is available.
 */
export function getMetaObjectiveHint(objectiveType: string): string | undefined {
  return META_OBJECTIVE_HINTS[objectiveType];
}

// ── Sizing constants ────────────────────────────────────────────────────────

const PANEL_WIDTH = 240;
const PANEL_LEFT = 8;
const PANEL_TOP = 8;
const ACCENT_VOCAB = "#42A5F5";
const ACCENT_GRAMMAR = "#66BB6A";

// ── Manager ─────────────────────────────────────────────────────────────────

export class QuestNotificationManager {
  private advancedTexture: AdvancedDynamicTexture;
  private eventBus: GameEventBus;

  // Active ticker animations (cleaned up on rebuild)
  private tickerHandles: TickerHandle[] = [];

  // Active Quest panel
  private activeQuestPanel: Rectangle | null = null;
  private questTitleText: TextBlock | null = null;
  private questProgressBar: Rectangle | null = null;
  private questProgressFill: Rectangle | null = null;

  // Language progress bars (shown when quest has language data)
  private langSection: StackPanel | null = null;
  private vocabBarFill: Rectangle | null = null;
  private vocabBarText: TextBlock | null = null;
  private grammarBarFill: Rectangle | null = null;
  private grammarBarText: TextBlock | null = null;

  // Task tracker panel
  private taskPanel: Rectangle | null = null;
  private taskStack: StackPanel | null = null;

  // State
  private activeQuest: ActiveQuestData | null = null;

  // CEFR-aware notification translation state
  private _cefrLevel: CEFRLevel = 'A1';
  private _immersionMode: UIImmersionMode = 'auto';
  private _translationLookup: NotificationTranslationLookupFn | undefined;

  // Event unsubscribe functions
  private unsubscribers: Array<() => void> = [];

  // Callbacks
  private onHudClicked: (() => void) | null = null;

  constructor(advancedTexture: AdvancedDynamicTexture, eventBus: GameEventBus) {
    this.advancedTexture = advancedTexture;
    this.eventBus = eventBus;

    this.createActiveQuestPanel();
    this.createTaskTrackerPanel();
    this.subscribeToEvents();
  }

  // ── Active Quest Panel (top-left) ─────────────────────────────────────

  private createActiveQuestPanel(): void {
    this.activeQuestPanel = new Rectangle("activeQuestPanel");
    this.activeQuestPanel.width = `${PANEL_WIDTH}px`;
    this.activeQuestPanel.adaptHeightToChildren = true;
    this.activeQuestPanel.background = "rgba(0, 0, 0, 0.82)";
    this.activeQuestPanel.color = "#FFD700";
    this.activeQuestPanel.thickness = 1;
    this.activeQuestPanel.cornerRadius = 6;
    this.activeQuestPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.activeQuestPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.activeQuestPanel.top = `${PANEL_TOP}px`;
    this.activeQuestPanel.left = `${PANEL_LEFT}px`;
    this.activeQuestPanel.isPointerBlocker = true;
    this.activeQuestPanel.onPointerClickObservable.add(() => {
      this.onHudClicked?.();
    });
    this.activeQuestPanel.isVisible = false;

    const mainStack = new StackPanel("aqMainStack");
    mainStack.width = "100%";
    mainStack.paddingTop = "6px";
    mainStack.paddingBottom = "6px";
    mainStack.paddingLeft = "8px";
    mainStack.paddingRight = "8px";
    this.activeQuestPanel.addControl(mainStack);

    // Header: "Active Quest"
    const header = new TextBlock("aqHeader");
    header.text = "Active Quest";
    header.color = "#FFD700";
    header.fontSize = 10;
    header.fontWeight = "bold";
    header.height = "14px";
    header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mainStack.addControl(header);

    // Quest title
    this.questTitleText = new TextBlock("aqTitle");
    this.questTitleText.text = "";
    this.questTitleText.color = "#E8EAED";
    this.questTitleText.fontSize = 12;
    this.questTitleText.fontWeight = "bold";
    this.questTitleText.height = "18px";
    this.questTitleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.questTitleText.textWrapping = TextWrapping.Clip;
    mainStack.addControl(this.questTitleText);

    // Overall progress bar
    this.questProgressBar = new Rectangle("aqProgressBg");
    this.questProgressBar.width = "100%";
    this.questProgressBar.height = "5px";
    this.questProgressBar.background = "rgba(255, 255, 255, 0.12)";
    this.questProgressBar.cornerRadius = 2;
    this.questProgressBar.thickness = 0;
    mainStack.addControl(this.questProgressBar);

    this.questProgressFill = new Rectangle("aqProgressFill");
    this.questProgressFill.width = "0%";
    this.questProgressFill.height = "5px";
    this.questProgressFill.background = "#4CAF50";
    this.questProgressFill.cornerRadius = 2;
    this.questProgressFill.thickness = 0;
    this.questProgressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.questProgressBar.addControl(this.questProgressFill);

    // Language progress section (hidden until language data arrives)
    this.langSection = new StackPanel("aqLangSection");
    this.langSection.width = "100%";
    this.langSection.isVisible = false;
    mainStack.addControl(this.langSection);

    // Spacer
    const spacer = new Rectangle("aqLangSpacer");
    spacer.width = "100%";
    spacer.height = "4px";
    spacer.thickness = 0;
    spacer.background = "transparent";
    this.langSection.addControl(spacer);

    // Vocabulary bar
    this.buildLangBar(this.langSection, "Vocabulary", ACCENT_VOCAB, (fill, text) => {
      this.vocabBarFill = fill;
      this.vocabBarText = text;
    });

    // Grammar bar
    this.buildLangBar(this.langSection, "Grammar", ACCENT_GRAMMAR, (fill, text) => {
      this.grammarBarFill = fill;
      this.grammarBarText = text;
    });

    this.advancedTexture.addControl(this.activeQuestPanel);
  }

  private buildLangBar(
    parent: StackPanel,
    label: string,
    color: string,
    onCreated: (fill: Rectangle, text: TextBlock) => void,
  ): void {
    const row = new StackPanel(`aqLang_${label}_row`);
    row.isVertical = false;
    row.width = "100%";
    row.height = "14px";
    parent.addControl(row);

    const labelText = new TextBlock(`aqLang_${label}_label`);
    labelText.text = label;
    labelText.color = "#AAA";
    labelText.fontSize = 9;
    labelText.width = "60px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const valueText = new TextBlock(`aqLang_${label}_value`);
    valueText.text = "0%";
    valueText.color = color;
    valueText.fontSize = 9;
    valueText.fontWeight = "bold";
    valueText.width = `${PANEL_WIDTH - 80}px`;
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    row.addControl(valueText);

    const barBg = new Rectangle(`aqLang_${label}_barBg`);
    barBg.width = "100%";
    barBg.height = "4px";
    barBg.background = "rgba(255,255,255,0.1)";
    barBg.thickness = 0;
    barBg.cornerRadius = 2;
    parent.addControl(barBg);

    const barFill = new Rectangle(`aqLang_${label}_barFill`);
    barFill.width = "0%";
    barFill.height = "4px";
    barFill.background = color;
    barFill.thickness = 0;
    barFill.cornerRadius = 2;
    barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(barFill);

    onCreated(barFill, valueText);
  }

  // ── Task Tracker Panel (below Active Quest) ────────────────────────────

  private createTaskTrackerPanel(): void {
    this.taskPanel = new Rectangle("taskTrackerPanel");
    this.taskPanel.width = `${PANEL_WIDTH}px`;
    this.taskPanel.adaptHeightToChildren = true;
    this.taskPanel.background = "rgba(0, 0, 0, 0.78)";
    this.taskPanel.color = "rgba(255, 255, 255, 0.15)";
    this.taskPanel.thickness = 1;
    this.taskPanel.cornerRadius = 6;
    this.taskPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.taskPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    // Position below the active quest panel — will be updated dynamically
    this.taskPanel.top = `${PANEL_TOP + 70}px`;
    this.taskPanel.left = `${PANEL_LEFT}px`;
    this.taskPanel.isVisible = false;

    this.taskStack = new StackPanel("taskTrackerStack");
    this.taskStack.width = "100%";
    this.taskStack.paddingTop = "6px";
    this.taskStack.paddingBottom = "6px";
    this.taskStack.paddingLeft = "8px";
    this.taskStack.paddingRight = "8px";
    this.taskPanel.addControl(this.taskStack);

    this.advancedTexture.addControl(this.taskPanel);
  }

  // ── Event Subscriptions ───────────────────────────────────────────────

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on("quest_accepted", (e) => {
        this.showQuestToast("quest_accepted", "New Quest!", e.questTitle);
      }),

      this.eventBus.on("quest_completed", (e) => {
        this.showQuestToast("quest_completed", "Quest Complete!", `Quest ${e.questId} completed`);
        if (this.activeQuest?.id === e.questId) {
          this.clearActiveQuest();
        }
      }),

      this.eventBus.on("quest_failed", (e) => {
        this.showQuestToast("quest_failed", "Quest Failed", `Quest ${e.questId} failed`);
        if (this.activeQuest?.id === e.questId) {
          this.clearActiveQuest();
        }
      }),

      this.eventBus.on("quest_abandoned", (e) => {
        this.showQuestToast("quest_abandoned", "Quest Abandoned", `Quest ${e.questId} abandoned`);
        if (this.activeQuest?.id === e.questId) {
          this.clearActiveQuest();
        }
      }),

      this.eventBus.on("utterance_quest_progress", (e) => {
        const pct = Math.round(e.percentage);
        this.showQuestToast("utterance_quest_progress", "Quest Progress", `${pct}% complete (${e.current}/${e.required})`);
        if (this.activeQuest?.id === e.questId) {
          this.activeQuest.progress = e.percentage / 100;
          this.refreshPanels();
        }
      }),

      this.eventBus.on("utterance_quest_completed", (e) => {
        this.showQuestToast("utterance_quest_completed", "Objective Complete!", `+${e.xpAwarded} XP (Score: ${e.finalScore})`);
      }),

      this.eventBus.on("quest_reminder", (e) => {
        this.showQuestToast("quest_reminder", "Quest Reminder", e.message);
      }),

      this.eventBus.on("quest_expired", (e) => {
        this.showQuestToast("quest_expired", "Quest Expired", `"${e.questTitle}" has expired`);
        if (this.activeQuest?.id === e.questId) {
          this.clearActiveQuest();
        }
      }),

      this.eventBus.on("quest_milestone", (e) => {
        this.showQuestToast("quest_milestone", "Milestone!", e.label);
      }),

      this.eventBus.on("daily_quests_reset", () => {
        this.showQuestToast("daily_quests_reset", "Daily Quests", "New daily quests are available!");
      }),
    );
  }

  // ── Panel Refresh ─────────────────────────────────────────────────────

  private refreshPanels(): void {
    if (!this.activeQuest) {
      if (this.activeQuestPanel) this.activeQuestPanel.isVisible = false;
      if (this.taskPanel) this.taskPanel.isVisible = false;
      return;
    }

    // --- Active Quest panel ---
    if (this.activeQuestPanel) this.activeQuestPanel.isVisible = true;
    if (this.questTitleText) {
      if (this.activeQuest.cefrLevel && this.activeQuest.titleTranslation) {
        const titleDisplay = getLocalizedQuestText(
          { targetText: this.activeQuest.title, englishText: this.activeQuest.titleTranslation },
          this.activeQuest.cefrLevel,
          'title',
        );
        this.questTitleText.text = titleDisplay.primary;
      } else {
        this.questTitleText.text = this.activeQuest.title;
      }
    }

    // Overall progress from objectives
    const objectives = this.activeQuest.objectives;
    let overallProgress = this.activeQuest.progress ?? 0;
    if (objectives.length > 0) {
      const completed = objectives.filter(o => o.completed).length;
      overallProgress = completed / objectives.length;
    }
    if (this.questProgressFill) {
      this.questProgressFill.width = `${Math.max(Math.round(overallProgress * 100), 1)}%`;
    }

    // --- Task tracker panel ---
    this.rebuildTaskList();
  }

  private rebuildTaskList(): void {
    if (!this.taskStack || !this.activeQuest) return;

    // Stop and clean up any running ticker animations
    disposeTickers(this.tickerHandles);

    // Clear existing tasks
    const children = this.taskStack.children.slice();
    for (const child of children) {
      this.taskStack.removeControl(child);
      child.dispose();
    }

    const objectives = this.activeQuest.objectives;
    console.debug('[QuestHUD] rebuildTaskList:', this.activeQuest.id, 'objectives:', objectives.length, objectives.map(o => `${o.type}:${o.completed}`).join(', '));
    if (objectives.length === 0) {
      if (this.taskPanel) this.taskPanel.isVisible = false;
      return;
    }

    if (this.taskPanel) this.taskPanel.isVisible = true;

    // Compute CEFR-localized objective text when translation data is available
    const cefrLevel = this.activeQuest.cefrLevel;
    const localizedObjectives = cefrLevel
      ? getLocalizedObjectives(
          objectives.map(o => o.description || o.type.replace(/_/g, ' ')),
          objectives.map(o => o.descriptionTranslation ?? null) as string[],
          cefrLevel,
        )
      : null;

    // Available width for description text (panel - padding - checkbox - optional progress)
    const descAvailableWidth = PANEL_WIDTH - 50;
    const hintAvailableWidth = PANEL_WIDTH - 24;

    objectives.forEach((obj, idx) => {
      // Task row container
      const taskRow = new StackPanel(`task_row_${idx}`);
      taskRow.width = "100%";
      taskRow.spacing = 1;
      if (idx > 0) {
        const divider = new Rectangle(`task_div_${idx}`);
        divider.width = "100%";
        divider.height = "1px";
        divider.background = "rgba(255, 255, 255, 0.08)";
        divider.thickness = 0;
        this.taskStack!.addControl(divider);
      }

      // Status + task label
      const labelRow = new StackPanel(`task_label_row_${idx}`);
      labelRow.isVertical = false;
      labelRow.width = "100%";
      labelRow.height = "16px";
      taskRow.addControl(labelRow);

      const check = new TextBlock(`task_check_${idx}`);
      check.text = obj.completed ? "\u2713" : `${idx + 1}.`;
      check.color = obj.completed ? "#4CAF50" : "#FFD700";
      check.fontSize = 9;
      check.fontWeight = "bold";
      check.width = "16px";
      check.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      labelRow.addControl(check);

      // Clip container for the description text (enables ticker scroll)
      // Use CEFR-localized text when available
      const rawDescText = obj.description || obj.type.replace(/_/g, ' ');
      const descText = localizedObjectives?.[idx]?.primary ?? rawDescText;
      const hasProgress = !obj.completed && obj.required && obj.required > 1;
      const effectiveWidth = hasProgress ? descAvailableWidth - 28 : descAvailableWidth;
      const descClip = createTickerText({
        id: `task_desc_${idx}`,
        text: descText,
        color: obj.completed ? "#4CAF50" : "#E0E0E0",
        fontSize: 9,
        containerWidth: effectiveWidth,
        height: 16,
      }, this.tickerHandles);
      labelRow.addControl(descClip);

      // Progress text (e.g. "2/5")
      if (hasProgress) {
        const progText = new TextBlock(`task_prog_${idx}`);
        progText.text = `${obj.current ?? 0}/${obj.required}`;
        progText.color = "#AAA";
        progText.fontSize = 9;
        progText.width = "28px";
        progText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        labelRow.addControl(progText);

        // Mini progress bar
        const barBg = new Rectangle(`task_bar_bg_${idx}`);
        barBg.width = "100%";
        barBg.height = "3px";
        barBg.background = "rgba(255, 255, 255, 0.1)";
        barBg.cornerRadius = 1;
        barBg.thickness = 0;
        taskRow.addControl(barBg);

        const pct = Math.min((obj.current ?? 0) / obj.required!, 1);
        const barFill = new Rectangle(`task_bar_fill_${idx}`);
        barFill.width = `${Math.max(pct * 100, 2)}%`;
        barFill.height = "3px";
        barFill.background = "#4CAF50";
        barFill.cornerRadius = 1;
        barFill.thickness = 0;
        barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        barBg.addControl(barFill);
      }

      // Hint/clue line for incomplete tasks (also ticker-enabled)
      if (!obj.completed && obj.hint) {
        const hintClip = createTickerText({
          id: `task_hint_${idx}`,
          text: obj.hint,
          color: "rgba(255, 200, 100, 0.7)",
          fontSize: 8,
          containerWidth: hintAvailableWidth,
          height: 12,
          italic: true,
        }, this.tickerHandles);
        taskRow.addControl(hintClip);
      }

      this.taskStack!.addControl(taskRow);
    });

    // Position task panel below the active quest panel
    this.updateTaskPanelPosition();
  }

  private updateTaskPanelPosition(): void {
    // Estimate active quest panel height based on content
    // Header (14) + title (18) + progress (5) + padding (12) = 49 base
    // Language section adds ~40 if visible
    let aqHeight = 49;
    if (this.langSection?.isVisible) {
      aqHeight += 44;
    }
    if (this.taskPanel) {
      this.taskPanel.top = `${PANEL_TOP + aqHeight + 4}px`;
    }
  }

  // ── Notification routing ──────────────────────────────────────────────

  private showQuestToast(eventType: string, title: string, description: string): void {
    const config = TOAST_CONFIGS[eventType] || TOAST_CONFIGS.quest_accepted;
    // At C1+, translate notification titles progressively
    const displayTitle = getNotificationTitle(
      eventType, this._cefrLevel, this._translationLookup, this._immersionMode,
    );
    const displayDescription = getNotificationDescription(
      eventType, description, this._cefrLevel, this._translationLookup, this._immersionMode,
    );
    NotificationStore.push({
      title: displayTitle,
      description: displayDescription,
      icon: config.icon,
      color: config.color,
      category: "quest",
    });
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Set the active quest data. This drives both the Active Quest panel
   * and the Task Tracker. Pass null to clear.
   */
  public setActiveQuest(quest: ActiveQuestData | null): void {
    this.activeQuest = quest;
    this.refreshPanels();
  }

  /**
   * Update objectives for the current active quest (e.g. after progress changes).
   */
  public updateObjectives(objectives: ActiveQuestObjective[]): void {
    if (!this.activeQuest) return;
    this.activeQuest.objectives = objectives;
    this.refreshPanels();
  }

  /**
   * Update language learning progress bars from QuestLanguageFeedbackState.
   * Shows/hides the language section automatically.
   */
  public updateLanguageProgress(state: QuestLanguageFeedbackState): void {
    if (!this.langSection) return;

    const hasLangData = state.vocabularyRequiredCount > 0 ||
      (state.grammarCorrectCount + state.grammarErrorCount) > 0;

    this.langSection.isVisible = hasLangData;

    // Vocabulary
    if (this.vocabBarFill && this.vocabBarText) {
      const pct = state.vocabularyProgress;
      this.vocabBarFill.width = `${Math.max(1, pct)}%`;
      if (state.vocabularyRequiredCount > 0) {
        this.vocabBarText.text = `${state.vocabularyUsedCount}/${state.vocabularyRequiredCount} (${pct}%)`;
      } else {
        this.vocabBarText.text = `${pct}%`;
      }
    }

    // Grammar
    if (this.grammarBarFill && this.grammarBarText) {
      const pct = state.grammarAccuracy;
      this.grammarBarFill.width = `${Math.max(1, pct)}%`;
      const total = state.grammarCorrectCount + state.grammarErrorCount;
      if (total > 0) {
        this.grammarBarText.text = `${state.grammarCorrectCount}/${total} (${pct}%)`;
        this.grammarBarFill.background = pct >= 80 ? ACCENT_GRAMMAR : pct >= 50 ? "#FFC107" : "#F44336";
      } else {
        this.grammarBarText.text = "No data yet";
      }
    }

    this.updateTaskPanelPosition();
  }

  /** Hide language progress bars. */
  public hideLanguageProgress(): void {
    if (this.langSection) {
      this.langSection.isVisible = false;
      this.updateTaskPanelPosition();
    }
  }

  /** Register callback when Active Quest panel is clicked. */
  public setOnHudClicked(callback: () => void): void {
    this.onHudClicked = callback;
  }

  /** Set the player's CEFR level for notification translation gating. */
  public setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  /** Set the player's UI immersion mode preference. */
  public setImmersionMode(mode: UIImmersionMode): void {
    this._immersionMode = mode;
  }

  /** Set the translation lookup function for notification strings. */
  public setTranslationLookup(lookup: NotificationTranslationLookupFn): void {
    this._translationLookup = lookup;
  }

  /** Show/hide both panels. */
  public setHudVisible(visible: boolean): void {
    if (this.activeQuestPanel) this.activeQuestPanel.isVisible = visible && !!this.activeQuest;
    if (this.taskPanel) this.taskPanel.isVisible = visible && !!this.activeQuest && (this.activeQuest?.objectives?.length ?? 0) > 0;
  }

  // ── Backward-compat shims (called by existing code) ───────────────────

  /** @deprecated Use setActiveQuest instead. Kept for backward compatibility. */
  public setActiveQuestCount(_count: number): void {
    // No-op: the panel now shows one active quest, not a count
  }

  /** @deprecated Use setActiveQuest instead. Kept for backward compatibility. */
  public setTrackedQuest(quest: { id: string; title: string; progress?: number } | null): void {
    if (!quest) {
      this.clearActiveQuest();
      return;
    }
    // If we already have a full active quest with matching ID, just update progress
    if (this.activeQuest?.id === quest.id) {
      if (quest.progress !== undefined) {
        this.activeQuest.progress = quest.progress;
        this.refreshPanels();
      }
      return;
    }
    // Otherwise create a minimal quest entry
    this.setActiveQuest({
      id: quest.id,
      title: quest.title,
      questType: '',
      objectives: [],
      progress: quest.progress,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private clearActiveQuest(): void {
    this.activeQuest = null;
    if (this.langSection) this.langSection.isVisible = false;
    this.refreshPanels();
  }

  /** Clean up all subscriptions and UI elements. */
  public dispose(): void {
    disposeTickers(this.tickerHandles);
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    if (this.activeQuestPanel) {
      this.advancedTexture.removeControl(this.activeQuestPanel);
      this.activeQuestPanel.dispose();
      this.activeQuestPanel = null;
    }
    if (this.taskPanel) {
      this.advancedTexture.removeControl(this.taskPanel);
      this.taskPanel.dispose();
      this.taskPanel = null;
    }
  }
}
