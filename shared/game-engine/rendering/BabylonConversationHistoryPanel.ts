/**
 * Babylon Conversation History Panel
 *
 * In-game panel (H key) showing recent NPC conversations with
 * fluency gained, words learned, grammar stats, and target language usage.
 */

import * as GUI from '@babylonjs/gui';
import type { ConversationRecord } from '@shared/language/language-progress';

export class BabylonConversationHistoryPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private summaryText: GUI.TextBlock | null = null;
  private isVisible: boolean = false;

  private conversations: ConversationRecord[] = [];
  private onClose: (() => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createPanel();
  }

  private createPanel(): void {
    this.container = new GUI.Rectangle('convHistoryContainer');
    this.container.width = '560px';
    this.container.height = '520px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.93)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 50;
    this.advancedTexture.addControl(this.container);

    // Title bar
    const titleBar = new GUI.Rectangle('convHistTitleBar');
    titleBar.width = '560px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(80, 50, 100, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('convHistTitle');
    titleText.text = 'Conversation History';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '14px';
    this.container.addControl(titleText);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('convHistClose', 'X');
    closeBtn.width = '36px';
    closeBtn.height = '36px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 16;
    closeBtn.fontWeight = 'bold';
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.top = '7px';
    closeBtn.left = '-8px';
    closeBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onClose?.();
    });
    this.container.addControl(closeBtn);

    // Summary stats bar
    this.summaryText = new GUI.TextBlock('convHistSummary');
    this.summaryText.text = '';
    this.summaryText.fontSize = 12;
    this.summaryText.color = 'rgba(200, 200, 200, 0.9)';
    this.summaryText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.summaryText.top = '54px';
    this.summaryText.height = '20px';
    this.container.addControl(this.summaryText);

    // Scroll area
    this.scrollViewer = new GUI.ScrollViewer('convHistScroll');
    this.scrollViewer.width = '540px';
    this.scrollViewer.height = '430px';
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollViewer.top = '80px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(140, 100, 180, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('convHistContent');
    this.contentStack.width = '520px';
    this.contentStack.spacing = 6;
    this.scrollViewer.addControl(this.contentStack);

    this.container.isVisible = false;
  }

  private updateSummary(): void {
    if (!this.summaryText) return;
    const count = this.conversations.length;
    const totalFluency = this.conversations.reduce((s, c) => s + c.fluencyGained, 0);
    const totalWords = new Set(this.conversations.flatMap(c => c.wordsUsed)).size;
    this.summaryText.text = `${count} conversations  |  +${totalFluency.toFixed(1)} fluency gained  |  ${totalWords} unique words used`;
  }

  private refreshContent(): void {
    this.updateSummary();
    if (!this.contentStack) return;

    // Clear existing
    const children = this.contentStack.children.slice();
    for (const child of children) {
      this.contentStack.removeControl(child);
      child.dispose();
    }

    if (this.conversations.length === 0) {
      const emptyText = new GUI.TextBlock('convHistEmpty');
      emptyText.text = 'No conversations yet.\nTalk to NPCs to start learning!';
      emptyText.fontSize = 14;
      emptyText.color = 'rgba(180, 180, 180, 0.8)';
      emptyText.height = '60px';
      emptyText.textWrapping = true;
      this.contentStack.addControl(emptyText);
      return;
    }

    // Show most recent first
    const sorted = [...this.conversations].sort((a, b) => b.timestamp - a.timestamp);

    for (const conv of sorted) {
      const card = this.createConversationCard(conv);
      this.contentStack.addControl(card);
    }
  }

  private createConversationCard(conv: ConversationRecord): GUI.Rectangle {
    const grammarTotal = conv.grammarCorrectCount + conv.grammarErrorCount;
    const grammarAccuracy = grammarTotal > 0
      ? Math.round((conv.grammarCorrectCount / grammarTotal) * 100)
      : 0;

    const cardHeight = 100 + (conv.wordsUsed.length > 0 ? 22 : 0);
    const card = new GUI.Rectangle(`convCard_${conv.id}`);
    card.width = '510px';
    card.height = `${cardHeight}px`;
    card.cornerRadius = 6;
    card.thickness = 1;
    card.color = 'rgba(120, 80, 160, 0.6)';
    card.background = 'rgba(30, 25, 40, 0.8)';

    // NPC name
    const nameText = new GUI.TextBlock(`convName_${conv.id}`);
    nameText.text = conv.characterName;
    nameText.fontSize = 15;
    nameText.fontWeight = 'bold';
    nameText.color = '#d0b0f0';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    nameText.left = '12px';
    nameText.top = '8px';
    nameText.height = '20px';
    card.addControl(nameText);

    // Date/time
    const date = new Date(conv.timestamp);
    const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dateText = new GUI.TextBlock(`convDate_${conv.id}`);
    dateText.text = dateStr;
    dateText.fontSize = 11;
    dateText.color = 'rgba(160, 160, 180, 0.8)';
    dateText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    dateText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    dateText.left = '-12px';
    dateText.top = '10px';
    dateText.height = '16px';
    card.addControl(dateText);

    // Stats row: turns, fluency, target language %, grammar
    const statsRow = new GUI.Rectangle(`convStats_${conv.id}`);
    statsRow.width = '490px';
    statsRow.height = '20px';
    statsRow.thickness = 0;
    statsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    statsRow.left = '12px';
    statsRow.top = '32px';
    card.addControl(statsRow);

    const turnsText = this.createStatBadge(`convTurns_${conv.id}`, `${conv.turns} turns`, 'rgba(60, 80, 120, 0.6)', '#8090c0', 0);
    statsRow.addControl(turnsText);

    const fluencyColor = conv.fluencyGained >= 1.5 ? '#2ecc71' : (conv.fluencyGained >= 0.5 ? '#f39c12' : '#e0e0e0');
    const fluencyBadge = this.createStatBadge(`convFluency_${conv.id}`, `+${conv.fluencyGained.toFixed(1)} fluency`, 'rgba(40, 80, 40, 0.6)', fluencyColor, 80);
    statsRow.addControl(fluencyBadge);

    const tlColor = conv.targetLanguagePercentage >= 80 ? '#2ecc71' : (conv.targetLanguagePercentage >= 50 ? '#f39c12' : '#e74c3c');
    const tlBadge = this.createStatBadge(`convTL_${conv.id}`, `${Math.round(conv.targetLanguagePercentage)}% target lang`, 'rgba(40, 60, 80, 0.6)', tlColor, 190);
    statsRow.addControl(tlBadge);

    if (grammarTotal > 0) {
      const gramColor = grammarAccuracy >= 80 ? '#2ecc71' : (grammarAccuracy >= 50 ? '#f39c12' : '#e74c3c');
      const gramBadge = this.createStatBadge(`convGram_${conv.id}`, `${grammarAccuracy}% grammar`, 'rgba(60, 40, 60, 0.6)', gramColor, 330);
      statsRow.addControl(gramBadge);
    }

    // Fluency bar
    const barBg = new GUI.Rectangle(`convBarBg_${conv.id}`);
    barBg.width = '490px';
    barBg.height = '8px';
    barBg.cornerRadius = 4;
    barBg.background = 'rgba(60, 60, 60, 0.8)';
    barBg.thickness = 0;
    barBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    barBg.left = '12px';
    barBg.top = '58px';
    card.addControl(barBg);

    const barWidth = Math.max(4, Math.min(490, conv.targetLanguagePercentage * 4.9));
    const barFill = new GUI.Rectangle(`convBarFill_${conv.id}`);
    barFill.width = `${barWidth}px`;
    barFill.height = '8px';
    barFill.cornerRadius = 4;
    barFill.background = tlColor;
    barFill.thickness = 0;
    barFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(barFill);

    // Bar label
    const barLabel = new GUI.TextBlock(`convBarLabel_${conv.id}`);
    barLabel.text = 'Target language usage';
    barLabel.fontSize = 9;
    barLabel.color = 'rgba(150, 150, 170, 0.7)';
    barLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    barLabel.left = '12px';
    barLabel.top = '68px';
    barLabel.height = '14px';
    card.addControl(barLabel);

    // Words used (if any)
    if (conv.wordsUsed.length > 0) {
      const wordsStr = conv.wordsUsed.slice(0, 8).join(', ') + (conv.wordsUsed.length > 8 ? ` +${conv.wordsUsed.length - 8} more` : '');
      const wordsText = new GUI.TextBlock(`convWords_${conv.id}`);
      wordsText.text = `Words: ${wordsStr}`;
      wordsText.fontSize = 11;
      wordsText.color = 'rgba(180, 170, 200, 0.8)';
      wordsText.fontStyle = 'italic';
      wordsText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      wordsText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      wordsText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      wordsText.left = '12px';
      wordsText.top = '82px';
      wordsText.height = '16px';
      wordsText.textWrapping = true;
      card.addControl(wordsText);
    }

    return card;
  }

  private createStatBadge(
    name: string,
    text: string,
    bg: string,
    color: string,
    leftOffset: number
  ): GUI.Rectangle {
    const badge = new GUI.Rectangle(name);
    badge.width = `${Math.max(60, text.length * 7 + 16)}px`;
    badge.height = '18px';
    badge.cornerRadius = 9;
    badge.background = bg;
    badge.thickness = 0;
    badge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    badge.left = `${leftOffset}px`;

    const label = new GUI.TextBlock(`${name}_text`);
    label.text = text;
    label.fontSize = 10;
    label.fontWeight = 'bold';
    label.color = color;
    badge.addControl(label);

    return badge;
  }

  // --- Public API ---

  public updateData(conversations: ConversationRecord[]): void {
    this.conversations = conversations;
    if (this.isVisible) {
      this.refreshContent();
    }
  }

  public show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
      this.refreshContent();
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
    }
  }

  public toggle(): void {
    if (this.isVisible) this.hide(); else this.show();
  }

  public getIsVisible(): boolean { return this.isVisible; }

  public setOnClose(cb: () => void): void { this.onClose = cb; }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
  }
}
