/**
 * Babylon Vocabulary Panel
 *
 * In-game panel (V key) showing vocabulary bank with mastery colors,
 * category filters, sort options, and a grammar progress tab.
 */

import * as GUI from '@babylonjs/gui';
import type { VocabularyEntry, GrammarPattern } from '@shared/language/language-progress';

type TabMode = 'vocabulary' | 'grammar';
type SortMode = 'mastery' | 'alpha' | 'recent' | 'used' | 'review';
type CategoryFilter = 'all' | string;

const MASTERY_COLORS: Record<string, string> = {
  new: '#e74c3c',       // red
  learning: '#f39c12',  // yellow/orange
  familiar: '#2ecc71',  // green
  mastered: '#f1c40f',  // gold
};

const MASTERY_LABELS: Record<string, string> = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  mastered: 'Mastered',
};

const CATEGORIES = [
  'all', 'greetings', 'numbers', 'food', 'family', 'nature',
  'body', 'emotions', 'actions', 'colors', 'time', 'general',
];

export class BabylonVocabularyPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private statsText: GUI.TextBlock | null = null;
  private isVisible: boolean = false;

  private activeTab: TabMode = 'vocabulary';
  private sortMode: SortMode = 'mastery';
  private categoryFilter: CategoryFilter = 'all';

  // Data
  private vocabulary: VocabularyEntry[] = [];
  private grammarPatterns: GrammarPattern[] = [];
  private overallFluency: number = 0;
  private totalCorrectUsages: number = 0;
  private dueForReviewWords: Set<string> = new Set();

  // Tab buttons for styling
  private vocabTabBtn: GUI.Button | null = null;
  private grammarTabBtn: GUI.Button | null = null;

  // Category buttons for styling
  private categoryButtons: Map<string, GUI.Button> = new Map();

  // Sort buttons for styling
  private sortButtons: Map<string, GUI.Button> = new Map();

  private onClose: (() => void) | null = null;
  private onWordSpeak: ((word: string) => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createPanel();
  }

  private createPanel(): void {
    // Main container
    this.container = new GUI.Rectangle('vocabPanelContainer');
    this.container.width = '620px';
    this.container.height = '560px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.93)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 50;
    this.advancedTexture.addControl(this.container);

    // Title bar
    const titleBar = new GUI.Rectangle('vocabTitleBar');
    titleBar.width = '620px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(40, 60, 100, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('vocabTitle');
    titleText.text = 'Language Progress';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '14px';
    this.container.addControl(titleText);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('vocabClose', 'X');
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

    // Stats bar
    this.statsText = new GUI.TextBlock('vocabStats');
    this.statsText.text = '';
    this.statsText.fontSize = 12;
    this.statsText.color = 'rgba(200, 200, 200, 0.9)';
    this.statsText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.statsText.top = '54px';
    this.statsText.height = '20px';
    this.container.addControl(this.statsText);

    // Tab buttons
    this.createTabButtons();

    // Category filter row (for vocabulary tab)
    this.createCategoryFilters();

    // Sort row
    this.createSortButtons();

    // Content scroll area
    this.scrollViewer = new GUI.ScrollViewer('vocabScroll');
    this.scrollViewer.width = '600px';
    this.scrollViewer.height = '370px';
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollViewer.top = '185px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(100, 150, 220, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('vocabContent');
    this.contentStack.width = '580px';
    this.contentStack.spacing = 4;
    this.scrollViewer.addControl(this.contentStack);

    this.container.isVisible = false;
  }

  private createTabButtons(): void {
    const tabRow = new GUI.Rectangle('vocabTabRow');
    tabRow.width = '600px';
    tabRow.height = '32px';
    tabRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    tabRow.top = '78px';
    tabRow.thickness = 0;
    this.container!.addControl(tabRow);

    this.vocabTabBtn = GUI.Button.CreateSimpleButton('vocabTabBtn', 'Vocabulary');
    this.vocabTabBtn.width = '140px';
    this.vocabTabBtn.height = '28px';
    this.vocabTabBtn.fontSize = 13;
    this.vocabTabBtn.fontWeight = 'bold';
    this.vocabTabBtn.color = 'white';
    this.vocabTabBtn.cornerRadius = 4;
    this.vocabTabBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.vocabTabBtn.left = '10px';
    this.vocabTabBtn.onPointerUpObservable.add(() => {
      this.activeTab = 'vocabulary';
      this.refreshContent();
    });
    tabRow.addControl(this.vocabTabBtn);

    this.grammarTabBtn = GUI.Button.CreateSimpleButton('grammarTabBtn', 'Grammar');
    this.grammarTabBtn.width = '140px';
    this.grammarTabBtn.height = '28px';
    this.grammarTabBtn.fontSize = 13;
    this.grammarTabBtn.fontWeight = 'bold';
    this.grammarTabBtn.color = 'white';
    this.grammarTabBtn.cornerRadius = 4;
    this.grammarTabBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.grammarTabBtn.left = '160px';
    this.grammarTabBtn.onPointerUpObservable.add(() => {
      this.activeTab = 'grammar';
      this.refreshContent();
    });
    tabRow.addControl(this.grammarTabBtn);
  }

  private createCategoryFilters(): void {
    const filterRow = new GUI.Rectangle('vocabFilterRow');
    filterRow.width = '600px';
    filterRow.height = '28px';
    filterRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    filterRow.top = '114px';
    filterRow.thickness = 0;
    this.container!.addControl(filterRow);

    let xOffset = 8;
    for (const cat of CATEGORIES) {
      const label = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
      const btn = GUI.Button.CreateSimpleButton(`catBtn_${cat}`, label);
      btn.width = `${Math.max(40, label.length * 8 + 12)}px`;
      btn.height = '24px';
      btn.fontSize = 11;
      btn.color = 'white';
      btn.cornerRadius = 3;
      btn.thickness = 1;
      btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.left = `${xOffset}px`;
      btn.onPointerUpObservable.add(() => {
        this.categoryFilter = cat;
        this.refreshContent();
      });
      filterRow.addControl(btn);
      this.categoryButtons.set(cat, btn);
      xOffset += Math.max(40, label.length * 8 + 12) + 4;
    }
  }

  private createSortButtons(): void {
    const sortRow = new GUI.Rectangle('vocabSortRow');
    sortRow.width = '600px';
    sortRow.height = '28px';
    sortRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    sortRow.top = '148px';
    sortRow.thickness = 0;
    this.container!.addControl(sortRow);

    const sortLabel = new GUI.TextBlock('sortLabel');
    sortLabel.text = 'Sort:';
    sortLabel.fontSize = 11;
    sortLabel.color = 'rgba(180, 180, 180, 0.9)';
    sortLabel.width = '30px';
    sortLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sortLabel.left = '10px';
    sortRow.addControl(sortLabel);

    const sortOptions: { key: SortMode; label: string }[] = [
      { key: 'mastery', label: 'Mastery' },
      { key: 'alpha', label: 'A-Z' },
      { key: 'recent', label: 'Recent' },
      { key: 'used', label: 'Most Used' },
      { key: 'review', label: 'Due' },
    ];

    let xOffset = 45;
    for (const opt of sortOptions) {
      const btn = GUI.Button.CreateSimpleButton(`sortBtn_${opt.key}`, opt.label);
      btn.width = `${opt.label.length * 8 + 16}px`;
      btn.height = '22px';
      btn.fontSize = 11;
      btn.color = 'white';
      btn.cornerRadius = 3;
      btn.thickness = 1;
      btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.left = `${xOffset}px`;
      btn.onPointerUpObservable.add(() => {
        this.sortMode = opt.key;
        this.refreshContent();
      });
      sortRow.addControl(btn);
      this.sortButtons.set(opt.key, btn);
      xOffset += opt.label.length * 8 + 20;
    }
  }

  private updateTabStyles(): void {
    if (this.vocabTabBtn) {
      this.vocabTabBtn.background = this.activeTab === 'vocabulary'
        ? 'rgba(60, 100, 180, 0.9)' : 'rgba(60, 60, 60, 0.6)';
    }
    if (this.grammarTabBtn) {
      this.grammarTabBtn.background = this.activeTab === 'grammar'
        ? 'rgba(60, 100, 180, 0.9)' : 'rgba(60, 60, 60, 0.6)';
    }

    // Show/hide category and sort rows based on active tab
    this.categoryButtons.forEach((btn, cat) => {
      const parent = btn.parent;
      if (parent) parent.isVisible = this.activeTab === 'vocabulary';
      btn.background = this.categoryFilter === cat
        ? 'rgba(80, 120, 180, 0.8)' : 'rgba(50, 50, 50, 0.5)';
    });
    this.sortButtons.forEach((btn, key) => {
      const parent = btn.parent;
      if (parent) parent.isVisible = this.activeTab === 'vocabulary';
      btn.background = this.sortMode === key
        ? 'rgba(80, 120, 180, 0.8)' : 'rgba(50, 50, 50, 0.5)';
    });

    // Adjust scroll area position based on tab
    if (this.scrollViewer) {
      this.scrollViewer.top = this.activeTab === 'vocabulary' ? '185px' : '115px';
      this.scrollViewer.height = this.activeTab === 'vocabulary' ? '370px' : '440px';
    }
  }

  private updateStats(): void {
    if (!this.statsText) return;
    const total = this.vocabulary.length;
    const mastered = this.vocabulary.filter(v => v.masteryLevel === 'mastered').length;
    const totalAttempts = this.totalCorrectUsages +
      this.vocabulary.reduce((sum, v) => sum + v.timesUsedIncorrectly, 0);
    const accuracy = totalAttempts > 0
      ? Math.round((this.totalCorrectUsages / totalAttempts) * 100)
      : 0;
    const reviewDueCount = this.dueForReviewWords.size;
    const reviewPart = reviewDueCount > 0 ? `  |  ${reviewDueCount} review due` : '';
    this.statsText.text = `${total} words learned  |  ${mastered} mastered  |  ${accuracy}% accuracy  |  Fluency: ${Math.round(this.overallFluency)}%${reviewPart}`;
  }

  private refreshContent(): void {
    this.updateTabStyles();
    this.updateStats();

    if (!this.contentStack) return;

    // Clear existing content
    const children = this.contentStack.children.slice();
    for (const child of children) {
      this.contentStack.removeControl(child);
      child.dispose();
    }

    if (this.activeTab === 'vocabulary') {
      this.renderVocabularyList();
    } else {
      this.renderGrammarList();
    }
  }

  private renderVocabularyList(): void {
    if (!this.contentStack) return;

    let filtered = [...this.vocabulary];

    // Apply category filter
    if (this.categoryFilter !== 'all') {
      filtered = filtered.filter(v => (v.category || 'general') === this.categoryFilter);
    }

    // Apply sort
    switch (this.sortMode) {
      case 'mastery': {
        const order = { mastered: 0, familiar: 1, learning: 2, new: 3 };
        filtered.sort((a, b) => order[a.masteryLevel] - order[b.masteryLevel]);
        break;
      }
      case 'alpha':
        filtered.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case 'recent':
        filtered.sort((a, b) => b.lastEncountered - a.lastEncountered);
        break;
      case 'used':
        filtered.sort((a, b) => (b.timesUsedCorrectly + b.timesEncountered) - (a.timesUsedCorrectly + a.timesEncountered));
        break;
      case 'review':
        // Due-for-review words first, then by last encountered (oldest first)
        filtered.sort((a, b) => {
          const aDue = this.dueForReviewWords.has(a.word) ? 0 : 1;
          const bDue = this.dueForReviewWords.has(b.word) ? 0 : 1;
          if (aDue !== bDue) return aDue - bDue;
          return a.lastEncountered - b.lastEncountered;
        });
        break;
    }

    if (filtered.length === 0) {
      const emptyText = new GUI.TextBlock('vocabEmpty');
      emptyText.text = this.vocabulary.length === 0
        ? 'No vocabulary learned yet.\nTalk to NPCs to learn new words!'
        : 'No words in this category.';
      emptyText.fontSize = 14;
      emptyText.color = 'rgba(180, 180, 180, 0.8)';
      emptyText.height = '60px';
      emptyText.textWrapping = true;
      this.contentStack.addControl(emptyText);
      return;
    }

    // Header row
    const header = this.createWordRow('WORD', 'MEANING', 'MASTERY', 'USED', true);
    this.contentStack.addControl(header);

    // Word rows
    for (const entry of filtered) {
      const isDue = this.dueForReviewWords.has(entry.word);
      const row = this.createWordRow(
        entry.word,
        entry.meaning,
        isDue ? 'Review!' : (MASTERY_LABELS[entry.masteryLevel] || entry.masteryLevel),
        `${entry.timesUsedCorrectly}/${entry.timesEncountered}`,
        false,
        isDue ? '#e67e22' : (MASTERY_COLORS[entry.masteryLevel] || '#ccc')
      );
      this.contentStack.addControl(row);
    }
  }

  private createWordRow(
    word: string,
    meaning: string,
    mastery: string,
    used: string,
    isHeader: boolean,
    masteryColor?: string
  ): GUI.Rectangle {
    const row = new GUI.Rectangle(`wordRow_${word}_${Date.now()}`);
    row.width = '570px';
    row.height = '30px';
    row.thickness = isHeader ? 0 : 1;
    row.color = isHeader ? 'transparent' : 'rgba(80, 80, 80, 0.3)';
    row.background = isHeader ? 'rgba(50, 70, 100, 0.5)' : 'rgba(30, 30, 40, 0.4)';
    row.cornerRadius = 3;

    const wordText = new GUI.TextBlock(`rowWord_${word}`);
    wordText.text = word;
    wordText.fontSize = isHeader ? 11 : 13;
    wordText.fontWeight = isHeader ? 'bold' : 'normal';
    wordText.color = isHeader ? 'rgba(180, 200, 230, 1)' : 'white';
    wordText.width = '160px';
    wordText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    wordText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    wordText.left = '10px';
    row.addControl(wordText);

    const meaningText = new GUI.TextBlock(`rowMeaning_${word}`);
    meaningText.text = meaning;
    meaningText.fontSize = isHeader ? 11 : 12;
    meaningText.fontWeight = isHeader ? 'bold' : 'normal';
    meaningText.color = isHeader ? 'rgba(180, 200, 230, 1)' : 'rgba(200, 200, 200, 0.9)';
    meaningText.width = '200px';
    meaningText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    meaningText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    meaningText.left = '175px';
    row.addControl(meaningText);

    const masteryText = new GUI.TextBlock(`rowMastery_${word}`);
    masteryText.text = mastery;
    masteryText.fontSize = isHeader ? 11 : 12;
    masteryText.fontWeight = isHeader ? 'bold' : 'bold';
    masteryText.color = isHeader ? 'rgba(180, 200, 230, 1)' : (masteryColor || '#ccc');
    masteryText.width = '90px';
    masteryText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    masteryText.left = '380px';
    row.addControl(masteryText);

    const usedText = new GUI.TextBlock(`rowUsed_${word}`);
    usedText.text = used;
    usedText.fontSize = isHeader ? 11 : 12;
    usedText.fontWeight = isHeader ? 'bold' : 'normal';
    usedText.color = isHeader ? 'rgba(180, 200, 230, 1)' : 'rgba(180, 180, 180, 0.9)';
    usedText.width = '50px';
    usedText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    usedText.left = '-30px';
    row.addControl(usedText);

    // Speaker button for TTS pronunciation (non-header rows only)
    if (!isHeader) {
      const speakBtn = GUI.Button.CreateSimpleButton(`speakBtn_${word}`, '🔊');
      speakBtn.width = '24px';
      speakBtn.height = '24px';
      speakBtn.fontSize = 12;
      speakBtn.color = 'rgba(150, 200, 255, 0.8)';
      speakBtn.background = 'transparent';
      speakBtn.thickness = 0;
      speakBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      speakBtn.left = '-4px';
      speakBtn.onPointerClickObservable.add(() => {
        if (this.onWordSpeak) {
          this.onWordSpeak(word);
        }
      });
      row.addControl(speakBtn);
    }

    return row;
  }

  private renderGrammarList(): void {
    if (!this.contentStack) return;

    if (this.grammarPatterns.length === 0) {
      const emptyText = new GUI.TextBlock('grammarEmpty');
      emptyText.text = 'No grammar patterns tracked yet.\nConverse with NPCs to practice grammar!';
      emptyText.fontSize = 14;
      emptyText.color = 'rgba(180, 180, 180, 0.8)';
      emptyText.height = '60px';
      emptyText.textWrapping = true;
      this.contentStack.addControl(emptyText);
      return;
    }

    // Sort: weak patterns first, then by total usage
    const sorted = [...this.grammarPatterns].sort((a, b) => {
      // Weak (unmastered with errors) first
      const aWeak = !a.mastered && a.timesUsedIncorrectly > 0;
      const bWeak = !b.mastered && b.timesUsedIncorrectly > 0;
      if (aWeak && !bWeak) return -1;
      if (!aWeak && bWeak) return 1;
      // Then by total usage descending
      return (b.timesUsedCorrectly + b.timesUsedIncorrectly) - (a.timesUsedCorrectly + a.timesUsedIncorrectly);
    });

    for (const pattern of sorted) {
      const card = this.createGrammarCard(pattern);
      this.contentStack.addControl(card);
    }
  }

  private createGrammarCard(pattern: GrammarPattern): GUI.Rectangle {
    const total = pattern.timesUsedCorrectly + pattern.timesUsedIncorrectly;
    const accuracy = total > 0 ? Math.round((pattern.timesUsedCorrectly / total) * 100) : 0;
    const isWeak = !pattern.mastered && pattern.timesUsedIncorrectly > 0;
    const hasExplanation = pattern.explanations && pattern.explanations.length > 0;

    const card = new GUI.Rectangle(`gramCard_${pattern.id}`);
    card.width = '570px';
    card.height = `${70 + (pattern.examples.length > 0 ? 22 : 0) + (hasExplanation ? 22 : 0)}px`;
    card.cornerRadius = 5;
    card.thickness = 2;
    card.color = pattern.mastered ? '#f1c40f' : (isWeak ? '#e74c3c' : 'rgba(100, 100, 100, 0.6)');
    card.background = 'rgba(30, 30, 40, 0.7)';

    // Pattern name
    const nameText = new GUI.TextBlock(`gramName_${pattern.id}`);
    nameText.text = pattern.pattern;
    nameText.fontSize = 14;
    nameText.fontWeight = 'bold';
    nameText.color = 'white';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    nameText.left = '12px';
    nameText.top = '8px';
    nameText.height = '20px';
    card.addControl(nameText);

    // Status badge
    const badge = new GUI.Rectangle(`gramBadge_${pattern.id}`);
    badge.width = pattern.mastered ? '80px' : (isWeak ? '100px' : '70px');
    badge.height = '20px';
    badge.cornerRadius = 10;
    badge.background = pattern.mastered ? 'rgba(241, 196, 15, 0.3)' : (isWeak ? 'rgba(231, 76, 60, 0.3)' : 'rgba(100, 100, 100, 0.3)');
    badge.thickness = 0;
    badge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    badge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    badge.top = '8px';
    badge.left = '-12px';
    card.addControl(badge);

    const badgeText = new GUI.TextBlock(`gramBadgeText_${pattern.id}`);
    badgeText.text = pattern.mastered ? 'Mastered' : (isWeak ? 'Practice this!' : 'Learning');
    badgeText.fontSize = 10;
    badgeText.fontWeight = 'bold';
    badgeText.color = pattern.mastered ? '#f1c40f' : (isWeak ? '#e74c3c' : '#aaa');
    badge.addControl(badgeText);

    // Accuracy bar
    const barBg = new GUI.Rectangle(`gramBarBg_${pattern.id}`);
    barBg.width = '200px';
    barBg.height = '12px';
    barBg.cornerRadius = 6;
    barBg.background = 'rgba(60, 60, 60, 0.8)';
    barBg.thickness = 0;
    barBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    barBg.left = '12px';
    barBg.top = '34px';
    card.addControl(barBg);

    const barFill = new GUI.Rectangle(`gramBarFill_${pattern.id}`);
    barFill.width = `${Math.max(2, accuracy * 2)}px`;
    barFill.height = '12px';
    barFill.cornerRadius = 6;
    barFill.background = accuracy >= 80 ? '#2ecc71' : (accuracy >= 50 ? '#f39c12' : '#e74c3c');
    barFill.thickness = 0;
    barFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(barFill);

    // Accuracy text
    const accText = new GUI.TextBlock(`gramAcc_${pattern.id}`);
    accText.text = `${accuracy}% accuracy (${pattern.timesUsedCorrectly}/${total})`;
    accText.fontSize = 11;
    accText.color = 'rgba(180, 180, 180, 0.9)';
    accText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    accText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    accText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    accText.left = '220px';
    accText.top = '33px';
    accText.height = '16px';
    card.addControl(accText);

    // Example correction (most recent)
    let nextTop = 52;
    if (pattern.examples.length > 0) {
      const exampleText = new GUI.TextBlock(`gramEx_${pattern.id}`);
      const lastExample = pattern.examples[pattern.examples.length - 1];
      exampleText.text = `Example: "${lastExample}"`;
      exampleText.fontSize = 11;
      exampleText.color = 'rgba(160, 160, 180, 0.8)';
      exampleText.fontStyle = 'italic';
      exampleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      exampleText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      exampleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      exampleText.left = '12px';
      exampleText.top = `${nextTop}px`;
      exampleText.height = '18px';
      exampleText.textWrapping = true;
      card.addControl(exampleText);
      nextTop += 22;
    }

    // Pattern explanation (most recent)
    if (hasExplanation) {
      const explainText = new GUI.TextBlock(`gramExpl_${pattern.id}`);
      const lastExplanation = pattern.explanations[pattern.explanations.length - 1];
      explainText.text = `Rule: ${lastExplanation}`;
      explainText.fontSize = 11;
      explainText.color = 'rgba(180, 200, 220, 0.9)';
      explainText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      explainText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      explainText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      explainText.left = '12px';
      explainText.top = `${nextTop}px`;
      explainText.height = '18px';
      explainText.textWrapping = true;
      card.addControl(explainText);
    }

    return card;
  }

  // --- Public API ---

  public updateData(
    vocabulary: VocabularyEntry[],
    grammarPatterns: GrammarPattern[],
    overallFluency: number,
    totalCorrectUsages: number,
    dueForReview?: VocabularyEntry[]
  ): void {
    this.vocabulary = vocabulary;
    this.grammarPatterns = grammarPatterns;
    this.overallFluency = overallFluency;
    this.totalCorrectUsages = totalCorrectUsages;
    this.dueForReviewWords = new Set((dueForReview || []).map(v => v.word));
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
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  /**
   * Set callback for when a word's speaker button is clicked (TTS pronunciation).
   */
  public setOnWordSpeak(cb: (word: string) => void): void {
    this.onWordSpeak = cb;
  }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
    this.categoryButtons.clear();
    this.sortButtons.clear();
  }
}
