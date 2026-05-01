/**
 * Babylon Proficiency Dashboard
 *
 * In-game dashboard showing multi-dimensional language learning progress:
 * radar of CEFR per dimension, vocabulary/grammar breakdowns, weak-area
 * highlights, recent activity feed, and a comparison against the arrival
 * assessment. Uses the same GUI conventions as `BabylonSkillTreePanel`
 * and `BabylonVocabularyPanel`.
 */

import * as GUI from '@babylonjs/gui';

import {
  buildDashboardData,
  PROFICIENCY_DIMENSIONS,
  type BuildDashboardInput,
  type ProficiencyDashboardData,
  type ProficiencyDimension,
} from '@shared/language/proficiency-dashboard-data';
import type { CEFRLevel } from '@shared/language/cefr';

const PANEL_WIDTH = 660;
const PANEL_HEIGHT = 600;
const SCROLL_WIDTH = 640;
const SCROLL_HEIGHT = 470;

const LEVEL_COLORS: Record<CEFRLevel, string> = {
  A1: '#e74c3c',
  A2: '#e67e22',
  B1: '#f1c40f',
  B2: '#2ecc71',
  C1: '#1abc9c',
  C2: '#3498db',
};

const DIMENSION_LABELS: Record<ProficiencyDimension, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  conjugation: 'Conjugation',
  pronunciation: 'Pronunciation',
  listening: 'Listening',
  syntax: 'Syntax',
  register: 'Register',
  discourse: 'Discourse',
};

export class BabylonProficiencyDashboard {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private isVisible = false;

  private data: ProficiencyDashboardData | null = null;
  private onClose: (() => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createPanel();
  }

  private createPanel(): void {
    this.container = new GUI.Rectangle('proficiencyDashboardContainer');
    this.container.width = `${PANEL_WIDTH}px`;
    this.container.height = `${PANEL_HEIGHT}px`;
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.94)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 50;
    this.advancedTexture.addControl(this.container);

    const titleBar = new GUI.Rectangle('proficiencyTitleBar');
    titleBar.width = `${PANEL_WIDTH}px`;
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(40, 60, 100, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('proficiencyTitle');
    titleText.text = 'Proficiency Dashboard';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '14px';
    this.container.addControl(titleText);

    const closeBtn = GUI.Button.CreateSimpleButton('proficiencyClose', 'X');
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

    this.scrollViewer = new GUI.ScrollViewer('proficiencyScroll');
    this.scrollViewer.width = `${SCROLL_WIDTH}px`;
    this.scrollViewer.height = `${SCROLL_HEIGHT}px`;
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(100, 150, 220, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollViewer.top = '70px';
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('proficiencyContent');
    this.contentStack.width = `${SCROLL_WIDTH - 20}px`;
    this.contentStack.spacing = 10;
    this.scrollViewer.addControl(this.contentStack);

    this.container.isVisible = false;
  }

  private clearStack(): void {
    if (!this.contentStack) return;
    const children = this.contentStack.children.slice();
    for (const child of children) {
      this.contentStack.removeControl(child);
      child.dispose();
    }
  }

  private refreshContent(): void {
    if (!this.contentStack || !this.data) return;
    this.clearStack();
    this.contentStack.addControl(this.buildOverallSection());
    this.contentStack.addControl(this.buildRadarSection());
    this.contentStack.addControl(this.buildVocabularyGrammarSection());
    this.contentStack.addControl(this.buildWeakAreasSection());
    this.contentStack.addControl(this.buildActivitySection());
    this.contentStack.addControl(this.buildComparisonSection());
  }

  private sectionCard(name: string, height: number): GUI.Rectangle {
    const card = new GUI.Rectangle(name);
    card.width = `${SCROLL_WIDTH - 30}px`;
    card.height = `${height}px`;
    card.cornerRadius = 8;
    card.background = 'rgba(30, 30, 40, 0.8)';
    card.thickness = 1;
    card.color = 'rgba(80, 80, 100, 0.6)';
    return card;
  }

  private sectionTitle(card: GUI.Rectangle, name: string, label: string): void {
    const t = new GUI.TextBlock(`${name}_title`);
    t.text = label;
    t.fontSize = 14;
    t.fontWeight = 'bold';
    t.color = 'white';
    t.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    t.left = '12px';
    t.top = '8px';
    t.height = '20px';
    card.addControl(t);
  }

  private buildOverallSection(): GUI.Rectangle {
    const card = this.sectionCard('overall', 60);
    if (!this.data) return card;
    const overall = this.data.current.overall;
    const text = new GUI.TextBlock('overallText');
    text.text = `Overall: ${overall.level}  •  ${overall.score.toFixed(1)} / 100`;
    text.fontSize = 16;
    text.fontWeight = 'bold';
    text.color = LEVEL_COLORS[overall.level];
    text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.left = '14px';
    card.addControl(text);

    const conf = new GUI.TextBlock('overallConf');
    conf.text = `Confidence: ${(overall.confidence * 100).toFixed(0)}%`;
    conf.fontSize = 12;
    conf.color = 'rgba(190, 200, 220, 0.9)';
    conf.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    conf.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    conf.left = '-14px';
    card.addControl(conf);
    return card;
  }

  private buildRadarSection(): GUI.Rectangle {
    const card = this.sectionCard('radar', 220);
    this.sectionTitle(card, 'radar', 'Proficiency by Dimension');
    if (!this.data) return card;

    let top = 30;
    for (const dim of PROFICIENCY_DIMENSIONS) {
      const est = this.data.current.dimensions[dim];

      const label = new GUI.TextBlock(`radar_${dim}_label`);
      label.text = DIMENSION_LABELS[dim];
      label.fontSize = 11;
      label.color = 'white';
      label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      label.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      label.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      label.left = '12px';
      label.top = `${top}px`;
      label.width = '110px';
      label.height = '18px';
      card.addControl(label);

      const trackWidth = 380;
      const track = new GUI.Rectangle(`radar_${dim}_track`);
      track.width = `${trackWidth}px`;
      track.height = '12px';
      track.cornerRadius = 6;
      track.background = 'rgba(60, 60, 70, 0.7)';
      track.thickness = 0;
      track.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      track.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      track.left = '130px';
      track.top = `${top + 3}px`;
      card.addControl(track);

      const fillWidth = Math.max(2, (est.score / 100) * trackWidth);
      const fill = new GUI.Rectangle(`radar_${dim}_fill`);
      fill.width = `${fillWidth}px`;
      fill.height = '12px';
      fill.cornerRadius = 6;
      fill.background = LEVEL_COLORS[est.level];
      fill.thickness = 0;
      fill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      track.addControl(fill);

      const pct = new GUI.TextBlock(`radar_${dim}_pct`);
      pct.text = `${est.level}  ${est.score.toFixed(0)}%`;
      pct.fontSize = 10;
      pct.color = 'white';
      pct.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      pct.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      pct.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      pct.left = '-12px';
      pct.top = `${top}px`;
      pct.height = '18px';
      card.addControl(pct);

      top += 22;
    }
    return card;
  }

  private buildVocabularyGrammarSection(): GUI.Rectangle {
    const card = this.sectionCard('vocabGrammar', 110);
    this.sectionTitle(card, 'vocabGrammar', 'Vocabulary & Grammar');
    if (!this.data) return card;

    const v = this.data.vocabulary;
    const vocabText = new GUI.TextBlock('vocabSummary');
    vocabText.text =
      `Vocab — total ${v.total} • mastered ${v.mastered} • familiar ${v.familiar} • ` +
      `learning ${v.learning} • new ${v.newWords} • due ${v.inReview} (overdue ${v.overdue})`;
    vocabText.fontSize = 11;
    vocabText.color = 'rgba(220, 220, 235, 0.95)';
    vocabText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    vocabText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    vocabText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    vocabText.left = '12px';
    vocabText.top = '34px';
    vocabText.width = `${SCROLL_WIDTH - 60}px`;
    vocabText.height = '18px';
    vocabText.textWrapping = true;
    card.addControl(vocabText);

    const g = this.data.grammar;
    const gramText = new GUI.TextBlock('grammarSummary');
    gramText.text =
      `Grammar — total ${g.total} • mastered ${g.mastered} • in progress ${g.inProgress} • struggling ${g.struggling}`;
    gramText.fontSize = 11;
    gramText.color = 'rgba(220, 220, 235, 0.95)';
    gramText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    gramText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    gramText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    gramText.left = '12px';
    gramText.top = '70px';
    gramText.width = `${SCROLL_WIDTH - 60}px`;
    gramText.height = '18px';
    gramText.textWrapping = true;
    card.addControl(gramText);

    return card;
  }

  private buildWeakAreasSection(): GUI.Rectangle {
    const weak = this.data?.weakAreas ?? [];
    const card = this.sectionCard('weak', 40 + Math.max(1, weak.length) * 22);
    this.sectionTitle(card, 'weak', 'Areas to Practice');

    if (weak.length === 0) {
      const empty = new GUI.TextBlock('weak_empty');
      empty.text = 'No weak areas identified yet — keep playing!';
      empty.fontSize = 11;
      empty.color = 'rgba(190, 200, 220, 0.9)';
      empty.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      empty.left = '12px';
      empty.top = '32px';
      card.addControl(empty);
      return card;
    }

    let top = 32;
    for (const w of weak) {
      const row = new GUI.TextBlock(`weak_${w.dimension}`);
      const examples = w.examples.length > 0 ? `  ex: ${w.examples.join(', ')}` : '';
      row.text = `• ${DIMENSION_LABELS[w.dimension]} — ${w.level} (${w.score.toFixed(0)})${examples}`;
      row.fontSize = 11;
      row.color = LEVEL_COLORS[w.level];
      row.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      row.left = '12px';
      row.top = `${top}px`;
      row.width = `${SCROLL_WIDTH - 60}px`;
      row.height = '18px';
      row.textWrapping = true;
      card.addControl(row);
      top += 22;
    }
    return card;
  }

  private buildActivitySection(): GUI.Rectangle {
    const activity = this.data?.activity ?? [];
    const card = this.sectionCard('activity', 40 + Math.max(1, activity.length) * 20);
    this.sectionTitle(card, 'activity', 'Recent Activity');

    if (activity.length === 0) {
      const empty = new GUI.TextBlock('activity_empty');
      empty.text = 'No conversations yet.';
      empty.fontSize = 11;
      empty.color = 'rgba(190, 200, 220, 0.9)';
      empty.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      empty.left = '12px';
      empty.top = '32px';
      card.addControl(empty);
      return card;
    }

    let top = 32;
    for (const a of activity) {
      const row = new GUI.TextBlock(`activity_${a.timestamp}`);
      const sign = a.impact >= 0 ? '+' : '';
      row.text = `[${sign}${a.impact}] ${a.characterName}: ${a.summary}`;
      row.fontSize = 10;
      row.color = a.impact >= 0 ? 'rgba(150, 230, 170, 0.95)' : 'rgba(230, 150, 150, 0.95)';
      row.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      row.left = '12px';
      row.top = `${top}px`;
      row.width = `${SCROLL_WIDTH - 60}px`;
      row.height = '16px';
      row.textWrapping = false;
      card.addControl(row);
      top += 20;
    }
    return card;
  }

  private buildComparisonSection(): GUI.Rectangle {
    const c = this.data?.comparison;
    const rowCount = c?.hasArrivalData ? PROFICIENCY_DIMENSIONS.length : 1;
    const card = this.sectionCard('comparison', 50 + rowCount * 18);
    this.sectionTitle(card, 'comparison', 'Since Arrival Assessment');

    if (!c || !c.hasArrivalData) {
      const empty = new GUI.TextBlock('comparison_empty');
      empty.text = 'Complete the arrival assessment to see your progress.';
      empty.fontSize = 11;
      empty.color = 'rgba(190, 200, 220, 0.9)';
      empty.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      empty.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      empty.left = '12px';
      empty.top = '32px';
      card.addControl(empty);
      return card;
    }

    let top = 32;
    for (const d of c.perDimension) {
      const row = new GUI.TextBlock(`comp_${d.dimension}`);
      const arrow = d.delta > 0.5 ? '↑' : d.delta < -0.5 ? '↓' : '→';
      const sign = d.delta >= 0 ? '+' : '';
      row.text = `${DIMENSION_LABELS[d.dimension]}:  ${d.arrivalLevel} → ${d.currentLevel}  ${arrow} ${sign}${d.delta.toFixed(1)}`;
      row.fontSize = 10;
      row.color = d.delta >= 0 ? 'rgba(150, 230, 170, 0.95)' : 'rgba(230, 150, 150, 0.95)';
      row.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      row.left = '12px';
      row.top = `${top}px`;
      row.width = `${SCROLL_WIDTH - 60}px`;
      row.height = '16px';
      card.addControl(row);
      top += 18;
    }
    return card;
  }

  // --- Public API ---

  public updateData(input: BuildDashboardInput): void {
    this.data = buildDashboardData(input);
    if (this.isVisible) this.refreshContent();
  }

  public setData(data: ProficiencyDashboardData): void {
    this.data = data;
    if (this.isVisible) this.refreshContent();
  }

  public getData(): ProficiencyDashboardData | null {
    return this.data;
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
    if (this.isVisible) this.hide();
    else this.show();
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
    this.contentStack = null;
    this.scrollViewer = null;
  }
}
