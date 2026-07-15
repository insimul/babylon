/**
 * Babylon Rules Panel
 *
 * Displays active world rules, their conditions, effects, and enforcement status
 */

import { Scene } from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

export interface Rule {
  id: string;
  name: string;
  description?: string;
  ruleType: 'trigger' | 'volition' | 'trait' | 'default' | 'pattern';
  category?: string;
  priority?: number;
  likelihood?: number;
  conditions?: any[];
  effects?: any[];
  isActive?: boolean;
  isBase?: boolean;
  tags?: string[];
}

export class BabylonRulesPanel {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private rulesContainer: GUI.StackPanel | null = null;
  private isVisible: boolean = false;

  private worldRules: Rule[] = [];
  private baseRules: Rule[] = [];
  private onClose: (() => void) | null = null;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;

    this.createRulesPanel();
  }

  /**
   * Create the rules panel UI
   */
  private createRulesPanel(): void {
    // Main container
    this.container = new GUI.Rectangle('rulesPanelContainer');
    this.container.width = '500px';
    this.container.height = '600px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.9)';
    this.advancedTexture.addControl(this.container);

    // Center on screen
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    // Vertical layout: title bar -> scroll area
    const mainLayout = new GUI.StackPanel('rulesMainLayout');
    mainLayout.isVertical = true;
    mainLayout.width = '100%';
    mainLayout.height = '100%';
    this.container.addControl(mainLayout);

    // Title bar
    const titleBar = new GUI.Rectangle('rulesTitleBar');
    titleBar.width = '500px';
    titleBar.height = '60px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(60, 40, 80, 1)';
    titleBar.thickness = 0;
    mainLayout.addControl(titleBar);

    // Title text
    const titleText = new GUI.TextBlock('rulesTitle');
    titleText.text = '⚖️ World Rules';
    titleText.fontSize = 22;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleBar.addControl(titleText);

    // Close button
    const closeButton = GUI.Button.CreateSimpleButton('rulesClose', 'X');
    closeButton.width = '40px';
    closeButton.height = '40px';
    closeButton.color = 'white';
    closeButton.background = 'rgba(200, 50, 50, 0.8)';
    closeButton.cornerRadius = 5;
    closeButton.fontSize = 18;
    closeButton.fontWeight = 'bold';
    closeButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    closeButton.left = '-10px';
    closeButton.onPointerUpObservable.add(() => {
      this.hide();
      if (this.onClose) this.onClose();
    });
    titleBar.addControl(closeButton);

    // Subtitle
    const subtitle = new GUI.TextBlock('rulesSubtitle');
    subtitle.text = 'Active rules governing this world';
    subtitle.fontSize = 13;
    subtitle.color = 'rgba(200, 200, 200, 0.9)';
    subtitle.height = '20px';
    mainLayout.addControl(subtitle);

    // Rules scroll view — fills remaining space
    const scrollViewer = new GUI.ScrollViewer('rulesScroll');
    scrollViewer.width = '480px';
    scrollViewer.height = '510px';
    scrollViewer.thickness = 0;
    scrollViewer.barColor = 'rgba(150, 100, 200, 0.8)';
    scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    mainLayout.addControl(scrollViewer);

    // Rules container (stack panel inside scroll viewer)
    this.rulesContainer = new GUI.StackPanel('rulesItems');
    this.rulesContainer.width = '460px';
    this.rulesContainer.spacing = 8;
    scrollViewer.addControl(this.rulesContainer);

    // Initially hidden
    this.container.isVisible = false;
  }

  /**
   * Show the rules panel
   */
  public show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
      this.refreshRulesList();
    }
  }

  /**
   * Hide the rules panel
   */
  public hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
    }
  }

  /**
   * Toggle panel visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Update rules data
   */
  public updateRules(worldRules: Rule[], baseRules: Rule[]): void {
    this.worldRules = worldRules;
    this.baseRules = baseRules;

    if (this.isVisible) {
      this.refreshRulesList();
    }
  }

  /**
   * Refresh the rules list display
   */
  private refreshRulesList(): void {
    if (!this.rulesContainer) return;

    // Clear existing items
    this.rulesContainer.clearControls();

    // Combine and sort rules by priority (higher priority first)
    const allRules = [...this.worldRules, ...this.baseRules];
    const activeRules = allRules.filter(r => r.isActive !== false);
    activeRules.sort((a, b) => (b.priority || 5) - (a.priority || 5));

    if (activeRules.length === 0) {
      // Show empty message
      const emptyText = new GUI.TextBlock('emptyRules');
      emptyText.text = 'No active rules in this world';
      emptyText.height = '40px';
      emptyText.fontSize = 14;
      emptyText.color = '#888888';
      emptyText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
      this.rulesContainer.addControl(emptyText);
      return;
    }

    // Add each rule
    for (const rule of activeRules) {
      const ruleCard = this.createRuleCard(rule);
      this.rulesContainer.addControl(ruleCard);
    }
  }

  /**
   * Create a rule card
   */
  private createRuleCard(rule: Rule): GUI.Rectangle {
    const card = new GUI.Rectangle(`rule_${rule.id}`);
    card.width = '450px';
    card.height = '140px';
    card.cornerRadius = 5;
    card.color = this.getRuleTypeColor(rule.ruleType);
    card.thickness = 2;
    card.background = 'rgba(30, 30, 40, 0.9)';

    // Vertical stack for card content
    const cardStack = new GUI.StackPanel(`rule_stack_${rule.id}`);
    cardStack.isVertical = true;
    cardStack.width = '100%';
    cardStack.height = '100%';
    cardStack.paddingLeft = '15px';
    cardStack.paddingRight = '15px';
    cardStack.paddingTop = '8px';
    card.addControl(cardStack);

    // Row 1: Name + type badge + optional base indicator
    const headerRow = new GUI.StackPanel(`rule_header_${rule.id}`);
    headerRow.isVertical = false;
    headerRow.width = '100%';
    headerRow.height = '24px';
    cardStack.addControl(headerRow);

    const nameText = new GUI.TextBlock(`rule_name_${rule.id}`);
    nameText.text = rule.name;
    nameText.fontSize = 16;
    nameText.fontWeight = 'bold';
    nameText.color = this.getRuleTypeColor(rule.ruleType);
    nameText.width = '60%';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerRow.addControl(nameText);

    if (rule.isBase) {
      const baseIndicator = new GUI.TextBlock(`rule_base_${rule.id}`);
      baseIndicator.text = '🌐';
      baseIndicator.fontSize = 16;
      baseIndicator.width = '24px';
      headerRow.addControl(baseIndicator);
    }

    // Type badge
    const typeBadge = new GUI.Rectangle(`rule_type_${rule.id}`);
    typeBadge.width = '80px';
    typeBadge.height = '22px';
    typeBadge.cornerRadius = 11;
    typeBadge.background = this.getRuleTypeColor(rule.ruleType);
    typeBadge.color = 'transparent';
    typeBadge.thickness = 0;
    headerRow.addControl(typeBadge);

    const typeText = new GUI.TextBlock(`rule_type_text_${rule.id}`);
    typeText.text = rule.ruleType.toUpperCase();
    typeText.fontSize = 11;
    typeText.fontWeight = 'bold';
    typeText.color = 'rgba(0, 0, 0, 0.9)';
    typeBadge.addControl(typeText);

    // Priority indicator (inline after type badge)
    if (rule.priority !== undefined && rule.priority !== 5) {
      const priorityBadge = new GUI.Rectangle(`rule_priority_${rule.id}`);
      priorityBadge.width = '50px';
      priorityBadge.height = '20px';
      priorityBadge.cornerRadius = 10;
      priorityBadge.background = rule.priority > 5 ? 'rgba(255, 100, 100, 0.8)' : 'rgba(100, 150, 255, 0.8)';
      priorityBadge.color = 'white';
      priorityBadge.thickness = 1;
      headerRow.addControl(priorityBadge);

      const priorityText = new GUI.TextBlock(`rule_priority_text_${rule.id}`);
      priorityText.text = `P${rule.priority}`;
      priorityText.fontSize = 11;
      priorityText.fontWeight = 'bold';
      priorityText.color = 'white';
      priorityBadge.addControl(priorityText);
    }

    // Row 2: Description
    if (rule.description) {
      const descText = new GUI.TextBlock(`rule_desc_${rule.id}`);
      descText.text = rule.description;
      descText.fontSize = 12;
      descText.color = '#CCCCCC';
      descText.height = '55px';
      descText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      descText.textWrapping = true;
      cardStack.addControl(descText);
    }

    // Row 3: Tags + conditions/effects summary
    const footerRow = new GUI.StackPanel(`rule_footer_${rule.id}`);
    footerRow.isVertical = false;
    footerRow.width = '100%';
    footerRow.height = '20px';
    cardStack.addControl(footerRow);

    let tagString = '';
    if (rule.category) {
      tagString += `📂 ${rule.category}`;
    }
    if (rule.tags && rule.tags.length > 0) {
      const firstTags = rule.tags.slice(0, 3).join(', ');
      tagString += (tagString ? ' • ' : '') + `🏷️ ${firstTags}`;
    }

    const tagsText = new GUI.TextBlock(`rule_tags_${rule.id}`);
    tagsText.text = tagString;
    tagsText.fontSize = 10;
    tagsText.color = '#999999';
    tagsText.width = '60%';
    tagsText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    footerRow.addControl(tagsText);

    const condCount = rule.conditions?.length || 0;
    const effCount = rule.effects?.length || 0;
    const summaryText = new GUI.TextBlock(`rule_summary_${rule.id}`);
    summaryText.text = condCount > 0 || effCount > 0
      ? `${condCount} condition${condCount !== 1 ? 's' : ''} → ${effCount} effect${effCount !== 1 ? 's' : ''}`
      : '';
    summaryText.fontSize = 10;
    summaryText.color = '#AAAAAA';
    summaryText.width = '40%';
    summaryText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    footerRow.addControl(summaryText);

    return card;
  }

  /**
   * Get color for rule type
   */
  private getRuleTypeColor(ruleType: string): string {
    switch (ruleType) {
      case 'trigger':
        return '#FF6B6B'; // Red for triggers
      case 'volition':
        return '#4ECDC4'; // Teal for volitions
      case 'trait':
        return '#FFE66D'; // Yellow for traits
      case 'default':
        return '#95E1D3'; // Mint for defaults
      case 'pattern':
        return '#C7A4FF'; // Purple for patterns
      default:
        return 'white';
    }
  }

  /**
   * Set callback for close
   */
  public setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  /**
   * Get active rules by category
   */
  public getRulesByCategory(category: string): Rule[] {
    const allRules = [...this.worldRules, ...this.baseRules];
    return allRules.filter(r => r.isActive !== false && r.category === category);
  }

  /**
   * Get active rules by type
   */
  public getRulesByType(ruleType: string): Rule[] {
    const allRules = [...this.worldRules, ...this.baseRules];
    return allRules.filter(r => r.isActive !== false && r.ruleType === ruleType);
  }

  /**
   * Check if a specific rule is active
   */
  public isRuleActive(ruleId: string): boolean {
    const allRules = [...this.worldRules, ...this.baseRules];
    const rule = allRules.find(r => r.id === ruleId);
    return rule ? rule.isActive !== false : false;
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.rulesContainer = null;
    this.worldRules = [];
    this.baseRules = [];
  }
}
