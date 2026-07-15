/**
 * Babylon Skill Tree Panel
 *
 * In-game panel (K key) showing an interactive 5-tier skill tree
 * representing language learning progression from "First Words" to "Near Native".
 *
 * Interactive features:
 * - Segmented tier progress bar at the top
 * - Hover highlighting on skill nodes
 * - Click-to-expand skill details with requirement breakdown
 * - Tier connector indicators between sections
 * - Visual emphasis on newly-unlocked nodes
 */

import * as GUI from '@babylonjs/gui';
import {
  SKILL_TIERS,
  createDefaultSkillTreeState,
  updateSkillProgress,
  type SkillTreeState,
  type SkillNode,
  type SkillTier,
} from '@shared/language/language-skill-tree';

export interface SkillTreeStats {
  wordsLearned: number;
  wordsMastered: number;
  conversations: number;
  grammarPatterns: number;
  avgTargetLanguagePct: number;
  fluency: number;
  maxSustainedTurns: number;
  questsCompleted: number;
}

/** Friendly labels for condition types shown in expanded node details. */
const CONDITION_LABELS: Record<string, string> = {
  words_learned: 'Words Learned',
  words_mastered: 'Words Mastered',
  conversations: 'Conversations',
  grammar_patterns: 'Grammar Patterns',
  target_language_pct: 'Target Language %',
  fluency: 'Fluency %',
  sustained_turns: 'Sustained Turns',
  quest_count: 'Quests Completed',
};

export class BabylonSkillTreePanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private headerText: GUI.TextBlock | null = null;
  private progressBarContainer: GUI.Rectangle | null = null;
  private isVisible: boolean = false;

  private state: SkillTreeState;
  private currentStats: SkillTreeStats = {
    wordsLearned: 0, wordsMastered: 0, conversations: 0, grammarPatterns: 0,
    avgTargetLanguagePct: 0, fluency: 0, maxSustainedTurns: 0, questsCompleted: 0,
  };
  private expandedNodeId: string | null = null;
  private recentlyUnlockedIds: Set<string> = new Set();
  private onClose: (() => void) | null = null;
  private onSkillUnlocked: ((node: SkillNode) => void) | null = null;
  private onNodeSelected: ((node: SkillNode) => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.state = createDefaultSkillTreeState();
    this.createPanel();
  }

  private createPanel(): void {
    this.container = new GUI.Rectangle('skillTreeContainer');
    this.container.width = '500px';
    this.container.height = '580px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.95)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 50;
    this.advancedTexture.addControl(this.container);

    const mainLayout = new GUI.StackPanel('skillTreeMainLayout');
    mainLayout.isVertical = true;
    mainLayout.width = '100%';
    mainLayout.height = '100%';
    this.container.addControl(mainLayout);

    // Title bar
    const titleBar = new GUI.Rectangle('skillTreeTitleBar');
    titleBar.width = '500px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(40, 70, 50, 1)';
    titleBar.thickness = 0;
    mainLayout.addControl(titleBar);

    const titleText = new GUI.TextBlock('skillTreeTitle');
    titleText.text = 'Skill Tree';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleBar.addControl(titleText);

    const closeBtn = GUI.Button.CreateSimpleButton('skillTreeClose', 'X');
    closeBtn.width = '36px';
    closeBtn.height = '36px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 16;
    closeBtn.fontWeight = 'bold';
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    closeBtn.left = '-8px';
    closeBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onClose?.();
    });
    titleBar.addControl(closeBtn);

    // Segmented tier progress bar
    this.progressBarContainer = new GUI.Rectangle('skillTreeProgressBar');
    this.progressBarContainer.width = '470px';
    this.progressBarContainer.height = '28px';
    this.progressBarContainer.thickness = 0;
    mainLayout.addControl(this.progressBarContainer);

    // Header summary
    this.headerText = new GUI.TextBlock('skillTreeHeader');
    this.headerText.text = '';
    this.headerText.fontSize = 12;
    this.headerText.color = 'rgba(200, 200, 200, 0.9)';
    this.headerText.height = '18px';
    mainLayout.addControl(this.headerText);

    // Scroll area
    this.scrollViewer = new GUI.ScrollViewer('skillTreeScroll');
    this.scrollViewer.width = '480px';
    this.scrollViewer.height = '474px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(100, 160, 100, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    mainLayout.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('skillTreeContent');
    this.contentStack.width = '460px';
    this.contentStack.spacing = 4;
    this.scrollViewer.addControl(this.contentStack);

    this.container.isVisible = false;
  }

  private updateProgressBar(): void {
    if (!this.progressBarContainer) return;

    // Clear existing
    const children = this.progressBarContainer.children.slice();
    for (const child of children) {
      this.progressBarContainer.removeControl(child);
      child.dispose();
    }

    // Background
    const bg = new GUI.Rectangle('progressBg');
    bg.width = '460px';
    bg.height = '14px';
    bg.cornerRadius = 7;
    bg.background = 'rgba(40, 40, 45, 0.9)';
    bg.thickness = 1;
    bg.color = 'rgba(80, 80, 80, 0.5)';
    bg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.progressBarContainer.addControl(bg);

    // Each tier gets a proportional segment
    const segmentWidth = 460 / SKILL_TIERS.length;
    for (let i = 0; i < SKILL_TIERS.length; i++) {
      const tierDef = SKILL_TIERS[i];
      const tierNodes = this.state.nodes.filter(n => n.tier === tierDef.tier);
      const unlockedCount = tierNodes.filter(n => n.unlocked).length;
      const tierProgress = tierNodes.length > 0 ? unlockedCount / tierNodes.length : 0;

      if (tierProgress > 0) {
        const fillW = Math.max(2, tierProgress * segmentWidth);
        const fill = new GUI.Rectangle(`progressFill_${i}`);
        fill.width = `${fillW}px`;
        fill.height = '14px';
        fill.cornerRadius = i === 0 ? 7 : (i === SKILL_TIERS.length - 1 && tierProgress === 1 ? 7 : 2);
        fill.background = tierDef.color;
        fill.thickness = 0;
        fill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        fill.left = `${i * segmentWidth}px`;
        fill.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        bg.addControl(fill);
      }

      // Tier divider line (except after last)
      if (i < SKILL_TIERS.length - 1) {
        const divider = new GUI.Rectangle(`progressDiv_${i}`);
        divider.width = '1px';
        divider.height = '14px';
        divider.background = 'rgba(100, 100, 100, 0.6)';
        divider.thickness = 0;
        divider.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        divider.left = `${(i + 1) * segmentWidth}px`;
        divider.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        bg.addControl(divider);
      }
    }

    // Overall percentage label
    const unlocked = this.state.nodes.filter(n => n.unlocked).length;
    const total = this.state.nodes.length;
    const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    const label = new GUI.TextBlock('progressLabel');
    label.text = `${pct}%`;
    label.fontSize = 10;
    label.fontWeight = 'bold';
    label.color = 'white';
    label.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.progressBarContainer.addControl(label);
  }

  private updateHeader(): void {
    if (!this.headerText) return;
    const unlocked = this.state.nodes.filter(n => n.unlocked).length;
    const total = this.state.nodes.length;
    this.headerText.text = `${unlocked}/${total} skills unlocked`;
  }

  private refreshContent(): void {
    this.updateHeader();
    this.updateProgressBar();
    if (!this.contentStack) return;

    // Clear existing
    const children = this.contentStack.children.slice();
    for (const child of children) {
      this.contentStack.removeControl(child);
      child.dispose();
    }

    // Render tiers with connectors
    for (let i = 0; i < SKILL_TIERS.length; i++) {
      const tierDef = SKILL_TIERS[i];
      const tierNodes = this.state.nodes.filter(n => n.tier === tierDef.tier);
      const tierCard = this.createTierSection(tierDef, tierNodes);
      this.contentStack.addControl(tierCard);

      // Tier connector between sections
      if (i < SKILL_TIERS.length - 1) {
        const connector = this.createTierConnector(tierDef, SKILL_TIERS[i + 1], tierNodes);
        this.contentStack.addControl(connector);
      }
    }
  }

  private createTierConnector(from: SkillTier, to: SkillTier, fromNodes: SkillNode[]): GUI.Rectangle {
    const allUnlocked = fromNodes.every(n => n.unlocked);
    const container = new GUI.Rectangle(`connector_${from.tier}_${to.tier}`);
    container.width = '460px';
    container.height = '24px';
    container.thickness = 0;
    container.background = 'transparent';

    // Vertical line
    const line = new GUI.Rectangle(`connLine_${from.tier}`);
    line.width = '2px';
    line.height = '16px';
    line.background = allUnlocked ? from.color : 'rgba(80, 80, 80, 0.4)';
    line.thickness = 0;
    line.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    container.addControl(line);

    // Arrow indicator
    const arrow = new GUI.TextBlock(`connArrow_${from.tier}`);
    arrow.text = allUnlocked ? '▼' : '▽';
    arrow.fontSize = 10;
    arrow.color = allUnlocked ? from.color : 'rgba(80, 80, 80, 0.5)';
    arrow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    arrow.height = '14px';
    container.addControl(arrow);

    return container;
  }

  private createTierSection(tierDef: SkillTier, nodes: SkillNode[]): GUI.Rectangle {
    const unlockedCount = nodes.filter(n => n.unlocked).length;
    const allUnlocked = unlockedCount === nodes.length;
    const baseNodeHeight = 50;
    const expandedExtraHeight = 40;

    // Calculate total height accounting for expanded node
    let totalHeight = 40;
    for (const node of nodes) {
      const isExpanded = this.expandedNodeId === node.id;
      totalHeight += (isExpanded ? baseNodeHeight + expandedExtraHeight : baseNodeHeight) + 4;
    }
    totalHeight += 8;

    const section = new GUI.Rectangle(`tier_${tierDef.tier}`);
    section.width = '450px';
    section.height = `${totalHeight}px`;
    section.cornerRadius = 8;
    section.thickness = 2;
    section.color = allUnlocked ? tierDef.color : 'rgba(80, 80, 80, 0.6)';
    section.background = allUnlocked
      ? `rgba(${this.hexToRgb(tierDef.color)}, 0.1)`
      : 'rgba(25, 25, 30, 0.7)';

    // Tier header
    const tierHeader = new GUI.TextBlock(`tierHeader_${tierDef.tier}`);
    tierHeader.text = `Tier ${tierDef.tier}: ${tierDef.name}  (${tierDef.range[0]}-${tierDef.range[1]}% fluency)`;
    tierHeader.fontSize = 13;
    tierHeader.fontWeight = 'bold';
    tierHeader.color = allUnlocked ? tierDef.color : 'rgba(180, 180, 180, 0.9)';
    tierHeader.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    tierHeader.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    tierHeader.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    tierHeader.left = '12px';
    tierHeader.top = '8px';
    tierHeader.height = '20px';
    section.addControl(tierHeader);

    // Completion badge
    const badge = new GUI.TextBlock(`tierBadge_${tierDef.tier}`);
    badge.text = allUnlocked ? `✓ ${unlockedCount}/${nodes.length}` : `${unlockedCount}/${nodes.length}`;
    badge.fontSize = 11;
    badge.fontWeight = 'bold';
    badge.color = allUnlocked ? '#2ecc71' : 'rgba(150, 150, 150, 0.8)';
    badge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    badge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    badge.left = '-12px';
    badge.top = '8px';
    badge.height = '18px';
    badge.width = '60px';
    section.addControl(badge);

    // Skill nodes
    let yOffset = 34;
    for (const node of nodes) {
      const isExpanded = this.expandedNodeId === node.id;
      const nodeHeight = isExpanded ? baseNodeHeight + expandedExtraHeight : baseNodeHeight;
      const nodeCard = this.createSkillNode(node, tierDef.color, yOffset, isExpanded);
      section.addControl(nodeCard);
      yOffset += nodeHeight + 4;
    }

    return section;
  }

  private createSkillNode(node: SkillNode, tierColor: string, yOffset: number, isExpanded: boolean): GUI.Rectangle {
    const isRecentlyUnlocked = this.recentlyUnlockedIds.has(node.id);
    const cardHeight = isExpanded ? 90 : 50;

    const card = new GUI.Rectangle(`skill_${node.id}`);
    card.width = '430px';
    card.height = `${cardHeight}px`;
    card.cornerRadius = 5;
    card.thickness = isRecentlyUnlocked ? 2 : 1;
    card.color = isRecentlyUnlocked
      ? '#2ecc71'
      : node.unlocked ? tierColor : 'rgba(60, 60, 60, 0.5)';
    card.background = isRecentlyUnlocked
      ? `rgba(46, 204, 113, 0.2)`
      : node.unlocked
        ? `rgba(${this.hexToRgb(tierColor)}, 0.15)`
        : 'rgba(20, 20, 25, 0.6)';
    card.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    card.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.top = `${yOffset}px`;

    // Hover effects
    card.onPointerEnterObservable.add(() => {
      if (!node.unlocked) {
        card.background = 'rgba(40, 40, 50, 0.8)';
        card.thickness = 2;
        card.color = `rgba(${this.hexToRgb(tierColor)}, 0.6)`;
      } else {
        card.background = `rgba(${this.hexToRgb(tierColor)}, 0.25)`;
      }
    });
    card.onPointerOutObservable.add(() => {
      card.thickness = isRecentlyUnlocked ? 2 : 1;
      card.color = isRecentlyUnlocked
        ? '#2ecc71'
        : node.unlocked ? tierColor : 'rgba(60, 60, 60, 0.5)';
      card.background = isRecentlyUnlocked
        ? 'rgba(46, 204, 113, 0.2)'
        : node.unlocked
          ? `rgba(${this.hexToRgb(tierColor)}, 0.15)`
          : 'rgba(20, 20, 25, 0.6)';
    });

    // Click to expand/collapse
    card.onPointerUpObservable.add(() => {
      this.expandedNodeId = this.expandedNodeId === node.id ? null : node.id;
      this.onNodeSelected?.(node);
      this.refreshContent();
    });
    card.isPointerBlocker = true;

    // Icon
    const icon = new GUI.TextBlock(`skillIcon_${node.id}`);
    icon.text = node.icon;
    icon.fontSize = 20;
    icon.width = '30px';
    icon.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    icon.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    icon.top = '12px';
    icon.left = '8px';
    card.addControl(icon);

    // "NEW" badge for recently unlocked
    if (isRecentlyUnlocked) {
      const newBadge = new GUI.TextBlock(`skillNew_${node.id}`);
      newBadge.text = 'NEW';
      newBadge.fontSize = 8;
      newBadge.fontWeight = 'bold';
      newBadge.color = '#2ecc71';
      newBadge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      newBadge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      newBadge.left = '10px';
      newBadge.top = '2px';
      newBadge.height = '10px';
      newBadge.width = '24px';
      card.addControl(newBadge);
    }

    // Name
    const nameText = new GUI.TextBlock(`skillName_${node.id}`);
    nameText.text = node.name;
    nameText.fontSize = 13;
    nameText.fontWeight = 'bold';
    nameText.color = node.unlocked ? 'white' : 'rgba(150, 150, 150, 0.8)';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    nameText.left = '42px';
    nameText.top = '6px';
    nameText.height = '18px';
    card.addControl(nameText);

    // Description
    const descText = new GUI.TextBlock(`skillDesc_${node.id}`);
    descText.text = node.description;
    descText.fontSize = 10;
    descText.color = node.unlocked ? 'rgba(200, 200, 200, 0.8)' : 'rgba(120, 120, 120, 0.7)';
    descText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    descText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    descText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    descText.left = '42px';
    descText.top = '24px';
    descText.height = '14px';
    card.addControl(descText);

    // Progress bar (only for non-unlocked)
    if (!node.unlocked) {
      const barBg = new GUI.Rectangle(`skillBarBg_${node.id}`);
      barBg.width = '100px';
      barBg.height = '8px';
      barBg.cornerRadius = 4;
      barBg.background = 'rgba(50, 50, 50, 0.8)';
      barBg.thickness = 0;
      barBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      barBg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      barBg.left = '-40px';
      barBg.top = '12px';
      card.addControl(barBg);

      const fillWidth = Math.max(2, node.progress * 100);
      const barFill = new GUI.Rectangle(`skillBarFill_${node.id}`);
      barFill.width = `${fillWidth}px`;
      barFill.height = '8px';
      barFill.cornerRadius = 4;
      barFill.background = tierColor;
      barFill.thickness = 0;
      barFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      barBg.addControl(barFill);

      const pctText = new GUI.TextBlock(`skillPct_${node.id}`);
      pctText.text = `${Math.round(node.progress * 100)}%`;
      pctText.fontSize = 9;
      pctText.color = 'rgba(160, 160, 160, 0.8)';
      pctText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      pctText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      pctText.left = '-8px';
      pctText.top = '10px';
      pctText.height = '14px';
      pctText.width = '30px';
      card.addControl(pctText);
    } else {
      const check = new GUI.TextBlock(`skillCheck_${node.id}`);
      check.text = '✓';
      check.fontSize = 18;
      check.fontWeight = 'bold';
      check.color = '#2ecc71';
      check.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      check.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      check.top = '12px';
      check.left = '-12px';
      check.width = '30px';
      card.addControl(check);
    }

    // Expanded detail section
    if (isExpanded) {
      const detailBg = new GUI.Rectangle(`skillDetail_${node.id}`);
      detailBg.width = '410px';
      detailBg.height = '32px';
      detailBg.cornerRadius = 4;
      detailBg.background = 'rgba(0, 0, 0, 0.3)';
      detailBg.thickness = 0;
      detailBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      detailBg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
      detailBg.top = '-6px';
      card.addControl(detailBg);

      const condLabel = CONDITION_LABELS[node.condition.type] || node.condition.type;
      const currentValue = this.getStatForCondition(node.condition.type);
      const detailText = new GUI.TextBlock(`skillDetailText_${node.id}`);

      if (node.unlocked) {
        detailText.text = `${condLabel}: ${currentValue}/${node.condition.threshold} (Complete!)`;
        detailText.color = '#2ecc71';
      } else {
        detailText.text = `${condLabel}: ${currentValue}/${node.condition.threshold} needed`;
        detailText.color = 'rgba(180, 180, 180, 0.9)';
      }
      detailText.fontSize = 11;
      detailText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.left = '10px';
      detailBg.addControl(detailText);
    }

    return card;
  }

  private getStatForCondition(conditionType: string): number {
    const map: Record<string, number> = {
      words_learned: this.currentStats.wordsLearned,
      words_mastered: this.currentStats.wordsMastered,
      conversations: this.currentStats.conversations,
      grammar_patterns: this.currentStats.grammarPatterns,
      target_language_pct: this.currentStats.avgTargetLanguagePct,
      fluency: this.currentStats.fluency,
      sustained_turns: this.currentStats.maxSustainedTurns,
      quest_count: this.currentStats.questsCompleted,
    };
    return map[conditionType] ?? 0;
  }

  private hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  // --- Public API ---

  public updateStats(stats: SkillTreeStats): void {
    this.currentStats = { ...stats };
    const newlyUnlocked = updateSkillProgress(this.state, stats);
    for (const node of newlyUnlocked) {
      this.recentlyUnlockedIds.add(node.id);
      this.onSkillUnlocked?.(node);
    }
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

  public getState(): SkillTreeState { return { nodes: this.state.nodes.map(n => ({ ...n })) }; }

  public getExpandedNodeId(): string | null { return this.expandedNodeId; }

  public clearRecentlyUnlocked(): void {
    this.recentlyUnlockedIds.clear();
    if (this.isVisible) this.refreshContent();
  }

  public setOnClose(cb: () => void): void { this.onClose = cb; }
  public setOnSkillUnlocked(cb: (node: SkillNode) => void): void { this.onSkillUnlocked = cb; }
  public setOnNodeSelected(cb: (node: SkillNode) => void): void { this.onNodeSelected = cb; }

  public exportState(): string { return JSON.stringify(this.state); }

  public importState(json: string): void {
    try {
      this.state = JSON.parse(json);
    } catch (e) {
      console.error('[BabylonSkillTreePanel] Failed to import state:', e);
    }
  }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
  }
}
