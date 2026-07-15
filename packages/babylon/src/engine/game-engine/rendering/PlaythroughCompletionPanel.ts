/**
 * Playthrough Completion Panel
 *
 * Fullscreen summary shown when a player completes their playthrough.
 * Displays journey stats, learning report card, and action buttons.
 *
 * Triggers:
 * - Main quest chapter 6 completed (automatic)
 * - Player manually selects "End Playthrough" from pause menu
 *
 * After confirmation, triggers departure assessment if available.
 */

import * as GUI from '@babylonjs/gui';
import type { GameEventBus } from '../logic/GameEventBus';

export interface CompletionSummaryData {
  playthroughId: string;
  playtime: number;
  actionsCount: number;
  decisionsCount: number;
  questsCompleted: number;
  questsFailed: number;
  npcsInteracted: number;
  favoriteNpc: { id: string; name: string; interactionCount: number } | null;
  locationsVisited: number;
  mostVisitedLocation: { id: string; name: string; visitCount: number } | null;
  vocabularyLearned: number;
  achievementsEarned: number;
  mainQuestChaptersCompleted: number;
  startedAt: string;
  completedAt: string;
  startCefrLevel: string | null;
  endCefrLevel: string | null;
  improvementLevels: number;
  completionBonusXP: number;
}

export type CompletionAction = 'continue' | 'save_exit' | 'new_playthrough';

export class PlaythroughCompletionPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private eventBus: GameEventBus | null;
  private container: GUI.Rectangle | null = null;
  private confirmDialog: GUI.Rectangle | null = null;
  private isVisible = false;
  private data: CompletionSummaryData | null = null;
  private onAction: ((action: CompletionAction) => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture, eventBus?: GameEventBus) {
    this.advancedTexture = advancedTexture;
    this.eventBus = eventBus || null;
  }

  /**
   * Show the confirmation dialog before completing.
   */
  showConfirmation(
    trigger: 'main_quest' | 'manual',
    onConfirm: () => void,
    onCancel: () => void,
  ): void {
    this.hideConfirmation();

    this.confirmDialog = new GUI.Rectangle('completionConfirmDialog');
    this.confirmDialog.width = '420px';
    this.confirmDialog.height = '200px';
    this.confirmDialog.cornerRadius = 10;
    this.confirmDialog.color = 'white';
    this.confirmDialog.thickness = 2;
    this.confirmDialog.background = 'rgba(0, 0, 0, 0.95)';
    this.confirmDialog.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.confirmDialog.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.confirmDialog.zIndex = 60;
    this.advancedTexture.addControl(this.confirmDialog);

    const stack = new GUI.StackPanel('confirmStack');
    stack.isVertical = true;
    stack.width = '100%';
    stack.spacing = 16;
    this.confirmDialog.addControl(stack);

    const title = new GUI.TextBlock('confirmTitle');
    title.text = trigger === 'main_quest'
      ? 'Journey Complete!'
      : 'End Playthrough?';
    title.fontSize = 22;
    title.fontWeight = 'bold';
    title.color = '#f1c40f';
    title.height = '35px';
    stack.addControl(title);

    const message = new GUI.TextBlock('confirmMessage');
    message.text = "Are you sure you want to finish your journey?\nYou can still continue exploring.";
    message.fontSize = 14;
    message.color = 'rgba(220, 220, 220, 0.9)';
    message.textWrapping = GUI.TextWrapping.WordWrap;
    message.height = '50px';
    stack.addControl(message);

    const btnRow = new GUI.StackPanel('confirmBtnRow');
    btnRow.isVertical = false;
    btnRow.height = '45px';
    btnRow.spacing = 16;
    btnRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(btnRow);

    const confirmBtn = GUI.Button.CreateSimpleButton('confirmYes', 'Complete Journey');
    confirmBtn.width = '160px';
    confirmBtn.height = '40px';
    confirmBtn.color = 'white';
    confirmBtn.background = '#27ae60';
    confirmBtn.cornerRadius = 6;
    confirmBtn.fontSize = 14;
    confirmBtn.fontWeight = 'bold';
    confirmBtn.onPointerUpObservable.add(() => {
      this.hideConfirmation();
      onConfirm();
    });
    btnRow.addControl(confirmBtn);

    const cancelBtn = GUI.Button.CreateSimpleButton('confirmNo', 'Keep Exploring');
    cancelBtn.width = '160px';
    cancelBtn.height = '40px';
    cancelBtn.color = 'white';
    cancelBtn.background = 'rgba(100, 100, 100, 0.8)';
    cancelBtn.cornerRadius = 6;
    cancelBtn.fontSize = 14;
    cancelBtn.onPointerUpObservable.add(() => {
      this.hideConfirmation();
      onCancel();
    });
    btnRow.addControl(cancelBtn);
  }

  hideConfirmation(): void {
    if (this.confirmDialog) {
      this.advancedTexture.removeControl(this.confirmDialog);
      this.confirmDialog.dispose();
      this.confirmDialog = null;
    }
  }

  /**
   * Show the journey summary panel with completion data.
   */
  show(data: CompletionSummaryData, onAction: (action: CompletionAction) => void): void {
    this.data = data;
    this.onAction = onAction;
    this.hide();

    this.container = new GUI.Rectangle('completionContainer');
    this.container.width = '540px';
    this.container.height = '680px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.95)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 55;
    this.advancedTexture.addControl(this.container);
    this.isVisible = true;

    this.refreshContent();

    // Emit completion event
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'playthrough_completed',
        playthroughId: data.playthroughId,
        playtime: data.playtime,
        questsCompleted: data.questsCompleted,
        npcsInteracted: data.npcsInteracted,
        vocabularyLearned: data.vocabularyLearned,
        cefrStart: data.startCefrLevel,
        cefrEnd: data.endCefrLevel,
      });
    }
  }

  hide(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
    this.isVisible = false;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  dispose(): void {
    this.hide();
    this.hideConfirmation();
  }

  private refreshContent(): void {
    if (!this.container || !this.data) return;

    const children = this.container.children.slice();
    for (const child of children) {
      this.container.removeControl(child);
      child.dispose();
    }

    const mainLayout = new GUI.StackPanel('completionMainLayout');
    mainLayout.isVertical = true;
    mainLayout.width = '100%';
    mainLayout.height = '100%';
    this.container.addControl(mainLayout);

    // Title bar
    const titleBar = new GUI.Rectangle('completionTitleBar');
    titleBar.width = '540px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(40, 50, 80, 1)';
    titleBar.thickness = 0;
    mainLayout.addControl(titleBar);

    const titleText = new GUI.TextBlock('completionTitle');
    titleText.text = 'Journey Complete';
    titleText.fontSize = 22;
    titleText.fontWeight = 'bold';
    titleText.color = '#f1c40f';
    titleBar.addControl(titleText);

    // Scroll area
    const scrollViewer = new GUI.ScrollViewer('completionScroll');
    scrollViewer.width = '520px';
    scrollViewer.height = '570px';
    scrollViewer.thickness = 0;
    scrollViewer.barColor = 'rgba(100, 130, 200, 0.8)';
    scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    mainLayout.addControl(scrollViewer);

    const contentStack = new GUI.StackPanel('completionContent');
    contentStack.width = '500px';
    contentStack.spacing = 10;
    scrollViewer.addControl(contentStack);

    this.createPlaytimeSection(contentStack);
    this.createStatsSection(contentStack);
    this.createHighlightsSection(contentStack);
    this.createReportCard(contentStack);
    this.createBonusXP(contentStack);
    this.createActionButtons(contentStack);
  }

  private createPlaytimeSection(parent: GUI.StackPanel): void {
    if (!this.data) return;

    const section = new GUI.Rectangle('playtimeSection');
    section.width = '490px';
    section.height = '70px';
    section.cornerRadius = 8;
    section.thickness = 0;
    section.background = 'rgba(25, 25, 30, 0.7)';
    parent.addControl(section);

    const playtimeLabel = new GUI.TextBlock('playtimeLabel');
    playtimeLabel.text = 'Total Playtime';
    playtimeLabel.fontSize = 12;
    playtimeLabel.color = 'rgba(200, 200, 200, 0.8)';
    playtimeLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    playtimeLabel.top = '10px';
    playtimeLabel.height = '16px';
    section.addControl(playtimeLabel);

    const playtimeValue = new GUI.TextBlock('playtimeValue');
    playtimeValue.text = this.formatPlaytime(this.data.playtime);
    playtimeValue.fontSize = 28;
    playtimeValue.fontWeight = 'bold';
    playtimeValue.color = '#3498db';
    playtimeValue.top = '10px';
    section.addControl(playtimeValue);
  }

  private createStatsSection(parent: GUI.StackPanel): void {
    if (!this.data) return;

    const section = new GUI.Rectangle('statsSection');
    section.width = '490px';
    section.height = '120px';
    section.cornerRadius = 8;
    section.thickness = 0;
    section.background = 'rgba(25, 25, 30, 0.7)';
    parent.addControl(section);

    const grid = new GUI.Grid('statsGrid');
    grid.width = '470px';
    grid.height = '100px';
    grid.addColumnDefinition(0.5);
    grid.addColumnDefinition(0.5);
    grid.addRowDefinition(0.33);
    grid.addRowDefinition(0.33);
    grid.addRowDefinition(0.34);
    section.addControl(grid);

    const stats = [
      { label: 'Quests Completed', value: String(this.data.questsCompleted), color: '#2ecc71' },
      { label: 'Quests Failed', value: String(this.data.questsFailed), color: '#e74c3c' },
      { label: 'NPCs Met', value: String(this.data.npcsInteracted), color: '#9b59b6' },
      { label: 'Locations Visited', value: String(this.data.locationsVisited), color: '#e67e22' },
      { label: 'Words Learned', value: String(this.data.vocabularyLearned), color: '#1abc9c' },
      { label: 'Achievements', value: String(this.data.achievementsEarned), color: '#f1c40f' },
    ];

    stats.forEach((stat, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;

      const cell = new GUI.StackPanel(`statCell_${i}`);
      cell.isVertical = true;
      grid.addControl(cell, row, col);

      const val = new GUI.TextBlock(`statVal_${i}`);
      val.text = stat.value;
      val.fontSize = 18;
      val.fontWeight = 'bold';
      val.color = stat.color;
      val.height = '22px';
      cell.addControl(val);

      const lbl = new GUI.TextBlock(`statLbl_${i}`);
      lbl.text = stat.label;
      lbl.fontSize = 10;
      lbl.color = 'rgba(180, 180, 180, 0.9)';
      lbl.height = '14px';
      cell.addControl(lbl);
    });
  }

  private createHighlightsSection(parent: GUI.StackPanel): void {
    if (!this.data) return;

    const section = new GUI.Rectangle('highlightsSection');
    section.width = '490px';
    section.height = '80px';
    section.cornerRadius = 8;
    section.thickness = 0;
    section.background = 'rgba(25, 25, 30, 0.7)';
    parent.addControl(section);

    const stack = new GUI.StackPanel('highlightsStack');
    stack.isVertical = true;
    stack.width = '470px';
    stack.spacing = 4;
    section.addControl(stack);

    const sectionTitle = new GUI.TextBlock('highlightsTitle');
    sectionTitle.text = 'Highlights';
    sectionTitle.fontSize = 14;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#f1c40f';
    sectionTitle.height = '20px';
    sectionTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(sectionTitle);

    if (this.data.favoriteNpc) {
      const fav = new GUI.TextBlock('favNpc');
      fav.text = `Favorite NPC: ${this.data.favoriteNpc.name} (${this.data.favoriteNpc.interactionCount} interactions)`;
      fav.fontSize = 12;
      fav.color = 'rgba(200, 200, 200, 0.9)';
      fav.height = '18px';
      fav.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(fav);
    }

    if (this.data.mostVisitedLocation) {
      const loc = new GUI.TextBlock('mostVisited');
      loc.text = `Most Visited: ${this.data.mostVisitedLocation.name} (${this.data.mostVisitedLocation.visitCount} visits)`;
      loc.fontSize = 12;
      loc.color = 'rgba(200, 200, 200, 0.9)';
      loc.height = '18px';
      loc.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(loc);
    }

    const chapters = new GUI.TextBlock('chaptersCompleted');
    chapters.text = `Main Quest: ${this.data.mainQuestChaptersCompleted}/6 chapters completed`;
    chapters.fontSize = 12;
    chapters.color = 'rgba(200, 200, 200, 0.9)';
    chapters.height = '18px';
    chapters.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(chapters);
  }

  private createReportCard(parent: GUI.StackPanel): void {
    if (!this.data) return;

    const section = new GUI.Rectangle('reportCardSection');
    section.width = '490px';
    section.height = '90px';
    section.cornerRadius = 8;
    section.thickness = 1;
    section.color = '#3498db';
    section.background = 'rgba(52, 152, 219, 0.1)';
    parent.addControl(section);

    const stack = new GUI.StackPanel('reportStack');
    stack.isVertical = true;
    stack.width = '470px';
    stack.spacing = 6;
    section.addControl(stack);

    const title = new GUI.TextBlock('reportTitle');
    title.text = 'Learning Report Card';
    title.fontSize = 14;
    title.fontWeight = 'bold';
    title.color = '#3498db';
    title.height = '20px';
    stack.addControl(title);

    const startLevel = this.data.startCefrLevel || 'N/A';
    const endLevel = this.data.endCefrLevel || 'N/A';

    const levels = new GUI.TextBlock('cefrLevels');
    levels.text = `CEFR Level: ${startLevel} → ${endLevel}`;
    levels.fontSize = 16;
    levels.fontWeight = 'bold';
    levels.color = this.data.improvementLevels > 0 ? '#2ecc71' : 'white';
    levels.height = '22px';
    stack.addControl(levels);

    if (this.data.improvementLevels > 0) {
      const improvement = new GUI.TextBlock('improvement');
      improvement.text = `+${this.data.improvementLevels} level${this.data.improvementLevels > 1 ? 's' : ''} of improvement!`;
      improvement.fontSize = 12;
      improvement.color = '#2ecc71';
      improvement.height = '18px';
      stack.addControl(improvement);
    }
  }

  private createBonusXP(parent: GUI.StackPanel): void {
    if (!this.data) return;

    const section = new GUI.Rectangle('bonusXpSection');
    section.width = '490px';
    section.height = '40px';
    section.cornerRadius = 8;
    section.thickness = 0;
    section.background = 'rgba(241, 196, 15, 0.15)';
    parent.addControl(section);

    const xpText = new GUI.TextBlock('bonusXpText');
    xpText.text = `Completion Bonus: +${this.data.completionBonusXP} XP`;
    xpText.fontSize = 16;
    xpText.fontWeight = 'bold';
    xpText.color = '#f1c40f';
    section.addControl(xpText);
  }

  private createActionButtons(parent: GUI.StackPanel): void {
    const btnStack = new GUI.StackPanel('actionBtnStack');
    btnStack.isVertical = true;
    btnStack.height = '140px';
    btnStack.spacing = 8;
    parent.addControl(btnStack);

    const continueBtn = GUI.Button.CreateSimpleButton('continueBtn', 'Continue Exploring');
    continueBtn.width = '300px';
    continueBtn.height = '40px';
    continueBtn.color = 'white';
    continueBtn.background = '#27ae60';
    continueBtn.cornerRadius = 6;
    continueBtn.fontSize = 14;
    continueBtn.fontWeight = 'bold';
    continueBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onAction?.('continue');
    });
    btnStack.addControl(continueBtn);

    const saveExitBtn = GUI.Button.CreateSimpleButton('saveExitBtn', 'Save & Exit');
    saveExitBtn.width = '300px';
    saveExitBtn.height = '40px';
    saveExitBtn.color = 'white';
    saveExitBtn.background = '#3498db';
    saveExitBtn.cornerRadius = 6;
    saveExitBtn.fontSize = 14;
    saveExitBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onAction?.('save_exit');
    });
    btnStack.addControl(saveExitBtn);

    const newBtn = GUI.Button.CreateSimpleButton('newPlaythroughBtn', 'Start New Playthrough');
    newBtn.width = '300px';
    newBtn.height = '40px';
    newBtn.color = 'white';
    newBtn.background = 'rgba(100, 100, 100, 0.8)';
    newBtn.cornerRadius = 6;
    newBtn.fontSize = 14;
    newBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onAction?.('new_playthrough');
    });
    btnStack.addControl(newBtn);
  }

  private formatPlaytime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
