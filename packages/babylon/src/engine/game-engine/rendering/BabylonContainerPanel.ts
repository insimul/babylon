/**
 * BabylonContainerPanel
 *
 * A Babylon.js GUI panel for browsing and interacting with container contents
 * (chests, cupboards, barrels, crates, shelves, cabinets).
 *
 * Features:
 * - Scrollable item list with icon, rarity color coding, and quantity
 * - Icon buttons: Take (arrow), Examine (eye), Place (box)
 * - Two-column layout: container contents (left) + player inventory (right)
 * - Capacity indicator (used/total slots)
 * - Language-learning translation display on examine
 */

import * as GUI from '@babylonjs/gui';
import type { InventoryItem, GameContainer, ContainerType } from '@shared/game-engine/types';
import { getItemTranslation } from '@shared/game-engine/rendering/OnboardingLauncher';
import type { ItemThumbnailRenderer } from '@shared/game-engine/rendering/ItemThumbnailRenderer';

const RARITY_COLORS: Record<string, string> = {
  common: '#CCCCCC',
  uncommon: '#1EFF00',
  rare: '#0070FF',
  epic: '#A335EE',
  legendary: '#FF8000',
};

const CONTAINER_ICONS: Record<string, string> = {
  chest: '\u{1F4E6}',
  cupboard: '\u{1F6AA}',
  barrel: '\u{1F6E2}',
  crate: '\u{1F4E6}',
  shelf: '\u{1F4DA}',
  cabinet: '\u{1F6AA}',
  wardrobe: '\u{1F6AA}',
  safe: '\u{1F512}',
  sack: '\u{1F45C}',
};

// Icon-only button symbols
const ICON_TAKE = '\u2B07';     // ⬇ down arrow
const ICON_EXAMINE = '\u{1F441}'; // 👁 eye
const ICON_PLACE = '\u2B06';    // ⬆ up arrow
const ICON_TAKE_ALL = '\u2B07\u2B07'; // ⬇⬇

// Default item icons by category
const CATEGORY_ICONS: Record<string, string> = {
  melee_weapon: '\u2694\uFE0F',
  ranged_weapon: '\u{1F3F9}',
  ammunition: '\u27A1\uFE0F',
  shield: '\u{1F6E1}\uFE0F',
  armor: '\u{1FA96}',
  food: '\u{1F356}',
  drink: '\u{1F37A}',
  potion: '\u{1F9EA}',
  medical: '\u{1F48A}',
  tool: '\u{1F527}',
  furniture: '\u{1FA91}',
  container: '\u{1F4E6}',
  light_source: '\u{1F526}',
  jewelry: '\u{1F48D}',
  collectible: '\u{1F48E}',
  key: '\u{1F511}',
  document: '\u{1F4DC}',
  raw_material: '\u{1FAB5}',
  equipment: '\u2699\uFE0F',
  decoration: '\u{1F3FA}',
  environmental: '\u{1F33F}',
};

export interface ContainerPanelConfig {
  container: GameContainer;
  playerItems: InventoryItem[];
}

export interface ContainerTransaction {
  type: 'take' | 'place' | 'examine';
  item: InventoryItem;
  quantity: number;
  containerId: string;
}

export class BabylonContainerPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private panel: GUI.Rectangle | null = null;
  private containerItemsPanel: GUI.StackPanel | null = null;
  private playerItemsPanel: GUI.StackPanel | null = null;
  private capacityText: GUI.TextBlock | null = null;
  private statusText: GUI.TextBlock | null = null;
  private titleText: GUI.TextBlock | null = null;
  private isVisible: boolean = false;

  private containerConfig: GameContainer | null = null;
  private playerItems: InventoryItem[] = [];

  private onTake: ((transaction: ContainerTransaction) => void) | null = null;
  private onPlace: ((transaction: ContainerTransaction) => void) | null = null;
  private onExamine: ((transaction: ContainerTransaction) => void) | null = null;
  private onClose: (() => void) | null = null;
  private targetLanguage: string = 'Spanish';
  private thumbnailRenderer: ItemThumbnailRenderer | null = null;
  /** Maps item category/objectRole to objectRole for thumbnail lookup */
  private itemObjectRoles: Map<string, string> = new Map();

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createUI();
  }

  private createUI(): void {
    this.panel = new GUI.Rectangle('containerPanel');
    this.panel.width = '700px';
    this.panel.height = '520px';
    this.panel.cornerRadius = 10;
    this.panel.color = '#4a5568';
    this.panel.thickness = 1;
    this.panel.background = 'rgba(12, 12, 18, 0.95)';
    this.panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.panel.shadowColor = 'rgba(0, 0, 0, 0.6)';
    this.panel.shadowBlur = 20;
    this.panel.shadowOffsetY = 4;
    this.advancedTexture.addControl(this.panel);

    const mainLayout = new GUI.StackPanel('containerMainLayout');
    mainLayout.isVertical = true;
    mainLayout.width = '100%';
    mainLayout.height = '100%';
    this.panel.addControl(mainLayout);

    // Title bar
    const titleBar = new GUI.Rectangle('containerTitleBar');
    titleBar.width = '700px';
    titleBar.height = '45px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(30, 30, 42, 0.98)';
    titleBar.thickness = 0;
    mainLayout.addControl(titleBar);

    this.titleText = new GUI.TextBlock('containerTitle');
    this.titleText.text = 'Container';
    this.titleText.fontSize = 18;
    this.titleText.fontWeight = 'bold';
    this.titleText.color = '#87CEEB';
    this.titleText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.titleText.left = '15px';
    titleBar.addControl(this.titleText);

    this.capacityText = new GUI.TextBlock('containerCapacity');
    this.capacityText.text = '0/0';
    this.capacityText.fontSize = 13;
    this.capacityText.color = '#AAA';
    this.capacityText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.capacityText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.capacityText.left = '-50px';
    titleBar.addControl(this.capacityText);

    const closeBtn = GUI.Button.CreateSimpleButton('containerClose', '\u2715');
    closeBtn.width = '35px';
    closeBtn.height = '35px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 16;
    closeBtn.fontWeight = 'bold';
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    closeBtn.left = '-5px';
    closeBtn.onPointerUpObservable.add(() => this.hide());
    titleBar.addControl(closeBtn);

    // Two-column layout
    const columnsContainer = new GUI.StackPanel('containerColumns');
    columnsContainer.isVertical = false;
    columnsContainer.width = '680px';
    columnsContainer.height = '440px';
    mainLayout.addControl(columnsContainer);

    // Left column: Container contents
    const leftCol = this.createColumn('contCol', 'Container Contents');
    columnsContainer.addControl(leftCol.wrapper);
    this.containerItemsPanel = leftCol.itemsPanel;

    // Divider
    const divider = new GUI.Rectangle('containerDivider');
    divider.width = '2px';
    divider.height = '400px';
    divider.background = 'rgba(100, 100, 100, 0.3)';
    divider.thickness = 0;
    columnsContainer.addControl(divider);

    // Right column: Player inventory
    const rightCol = this.createColumn('placeCol', 'Your Items');
    columnsContainer.addControl(rightCol.wrapper);
    this.playerItemsPanel = rightCol.itemsPanel;

    // Status bar
    this.statusText = new GUI.TextBlock('containerStatus');
    this.statusText.text = '';
    this.statusText.fontSize = 13;
    this.statusText.color = '#AAAAAA';
    this.statusText.height = '25px';
    mainLayout.addControl(this.statusText);

    this.panel.isVisible = false;
  }

  private createColumn(
    id: string,
    title: string,
  ): { wrapper: GUI.Rectangle; itemsPanel: GUI.StackPanel; headerText: GUI.TextBlock } {
    const wrapper = new GUI.Rectangle(`${id}_wrapper`);
    wrapper.width = '338px';
    wrapper.height = '440px';
    wrapper.thickness = 0;
    wrapper.background = 'transparent';

    const colLayout = new GUI.StackPanel(`${id}_layout`);
    colLayout.isVertical = true;
    colLayout.width = '100%';
    colLayout.height = '100%';
    wrapper.addControl(colLayout);

    const header = new GUI.Rectangle(`${id}_header`);
    header.width = '330px';
    header.height = '35px';
    header.background = 'rgba(40, 40, 50, 0.8)';
    header.cornerRadius = 5;
    header.thickness = 0;
    colLayout.addControl(header);

    const headerText = new GUI.TextBlock(`${id}_title`);
    headerText.text = title;
    headerText.fontSize = 14;
    headerText.fontWeight = 'bold';
    headerText.color = 'white';
    headerText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerText.left = '10px';
    header.addControl(headerText);

    const scrollViewer = new GUI.ScrollViewer(`${id}_scroll`);
    scrollViewer.width = '330px';
    scrollViewer.height = '400px';
    scrollViewer.thickness = 0;
    scrollViewer.barColor = 'rgba(100, 100, 100, 0.8)';
    scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    colLayout.addControl(scrollViewer);

    const itemsPanel = new GUI.StackPanel(`${id}_items`);
    itemsPanel.width = '310px';
    itemsPanel.spacing = 3;
    scrollViewer.addControl(itemsPanel);

    return { wrapper, itemsPanel, headerText };
  }

  // ── Item icon helper ───────────────────────────────────────────────────────

  private getItemEmoji(item: InventoryItem): string {
    if (item.icon) return item.icon;
    return CATEGORY_ICONS[item.category || ''] || '\u{1F4E6}';
  }

  /**
   * Create either a thumbnail Image or an emoji TextBlock for an item icon.
   */
  private createItemIcon(item: InventoryItem, uid: string, size: number): GUI.Control {
    // Try thumbnail first
    const role = (item as any).objectRole || item.baseType || item.category;
    if (role && this.thumbnailRenderer?.hasThumbnail(role)) {
      const img = this.thumbnailRenderer.createThumbnailImage(role, `${uid}_thumb`, size);
      if (img) {
        img.height = `${size}px`;
        return img;
      }
    }
    // Fallback to emoji
    const iconText = new GUI.TextBlock(`${uid}_icon`, this.getItemEmoji(item));
    iconText.fontSize = size - 8;
    iconText.width = `${size}px`;
    iconText.height = `${size}px`;
    return iconText;
  }

  // ── Icon button helper ─────────────────────────────────────────────────────

  private createIconButton(
    id: string,
    icon: string,
    tooltip: string,
    bgColor: string,
    onClick: () => void,
  ): GUI.Button {
    const btn = GUI.Button.CreateSimpleButton(id, icon);
    btn.width = '30px';
    btn.height = '28px';
    btn.color = 'white';
    btn.background = bgColor;
    btn.cornerRadius = 4;
    btn.fontSize = 14;
    btn.hoverCursor = 'pointer';
    btn.onPointerUpObservable.add(onClick);
    return btn;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public open(config: ContainerPanelConfig): void {
    this.containerConfig = config.container;
    this.playerItems = config.playerItems;

    if (this.panel) {
      const icon = CONTAINER_ICONS[config.container.containerType] || '';
      if (this.titleText) {
        this.titleText.text = `${icon} ${config.container.name}`;
      }
      this.updateCapacity();
      this.refreshContainerItems();
      this.refreshPlayerItems();
      this.panel.isVisible = true;
      this.isVisible = true;
    }
  }

  public hide(): void {
    if (this.panel) {
      this.panel.isVisible = false;
      this.isVisible = false;
      if (this.onClose) this.onClose();
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public getContainerItems(): InventoryItem[] {
    return this.containerConfig?.items || [];
  }

  private updateCapacity(): void {
    if (!this.capacityText || !this.containerConfig) return;
    const used = this.containerConfig.items.length;
    const total = this.containerConfig.capacity;
    this.capacityText.text = `${used}/${total} slots`;
    this.capacityText.color = used >= total ? '#FF6347' : '#AAA';
  }

  // ── Container items (left column) ──────────────────────────────────────────

  private refreshContainerItems(): void {
    if (!this.containerItemsPanel || !this.containerConfig) return;
    this.containerItemsPanel.clearControls();

    if (this.containerConfig.isLocked) {
      const lockedText = new GUI.TextBlock('contLocked');
      lockedText.text = '\u{1F512} This container is locked.';
      lockedText.height = '30px';
      lockedText.fontSize = 13;
      lockedText.color = '#FF6347';
      this.containerItemsPanel.addControl(lockedText);
      return;
    }

    if (this.containerConfig.items.length === 0) {
      const emptyText = new GUI.TextBlock('contEmpty');
      emptyText.text = 'Empty';
      emptyText.height = '30px';
      emptyText.fontSize = 13;
      emptyText.color = '#666';
      this.containerItemsPanel.addControl(emptyText);
    } else {
      // Take All button
      const takeAllBtn = GUI.Button.CreateSimpleButton('contTakeAll', `${ICON_TAKE_ALL} Take All`);
      takeAllBtn.width = '305px';
      takeAllBtn.height = '26px';
      takeAllBtn.color = 'white';
      takeAllBtn.background = 'rgba(40, 120, 40, 0.8)';
      takeAllBtn.cornerRadius = 5;
      takeAllBtn.fontSize = 12;
      takeAllBtn.fontWeight = 'bold';
      takeAllBtn.onPointerUpObservable.add(() => this.handleTakeAll());
      this.containerItemsPanel.addControl(takeAllBtn);

      for (const item of this.containerConfig.items) {
        const card = this.createContainerItemCard(item);
        this.containerItemsPanel.addControl(card);
      }
    }
  }

  private createContainerItemCard(item: InventoryItem): GUI.Rectangle {
    const uid = `cont_${item.id}`;
    const card = new GUI.Rectangle(uid);
    card.width = '305px';
    card.height = '48px';
    card.cornerRadius = 5;
    card.color = 'rgba(100, 100, 100, 0.3)';
    card.thickness = 1;
    card.background = 'rgba(25, 25, 30, 0.9)';

    // Horizontal layout: [icon] [name+desc] [buttons]
    const row = new GUI.StackPanel(`${uid}_row`);
    row.isVertical = false;
    row.width = '100%';
    row.height = '100%';
    card.addControl(row);

    // Item icon (thumbnail or emoji fallback)
    const icon = this.createItemIcon(item, uid, 36);
    row.addControl(icon);

    // Name + description column
    const nameCol = new GUI.StackPanel(`${uid}_nameCol`);
    nameCol.isVertical = true;
    nameCol.width = '170px';
    nameCol.height = '48px';
    nameCol.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(nameCol);

    const nameText = new GUI.TextBlock(`${uid}_name`);
    const qtyLabel = item.quantity > 1 ? ` x${item.quantity}` : '';
    nameText.text = item.name + qtyLabel;
    nameText.fontSize = 12;
    nameText.fontWeight = 'bold';
    nameText.color = item.rarity ? RARITY_COLORS[item.rarity] || '#CCCCCC' : '#CCCCCC';
    nameText.height = '20px';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.textWrapping = true;
    nameCol.addControl(nameText);

    // Value + type line
    const infoText = new GUI.TextBlock(`${uid}_info`);
    const valueStr = item.value ? `${item.value}g` : '';
    const rarityStr = item.rarity && item.rarity !== 'common' ? item.rarity : '';
    infoText.text = [valueStr, rarityStr].filter(Boolean).join(' \u00B7 ');
    infoText.fontSize = 10;
    infoText.color = item.value ? '#FFD700' : '#666';
    infoText.height = '14px';
    infoText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameCol.addControl(infoText);

    // Action buttons
    const btnGroup = new GUI.StackPanel(`${uid}_btns`);
    btnGroup.isVertical = false;
    btnGroup.width = '90px';
    btnGroup.height = '48px';
    btnGroup.spacing = 4;
    row.addControl(btnGroup);

    // Examine button (eye icon)
    btnGroup.addControl(
      this.createIconButton(`${uid}_examine`, ICON_EXAMINE, 'Examine', 'rgba(80, 80, 150, 0.9)', () => this.handleExamine(item)),
    );

    // Take button (down arrow icon)
    btnGroup.addControl(
      this.createIconButton(`${uid}_take`, ICON_TAKE, 'Take', 'rgba(40, 120, 40, 0.9)', () => this.handleTake(item)),
    );

    return card;
  }

  // ── Player items (right column) ────────────────────────────────────────────

  private refreshPlayerItems(): void {
    if (!this.playerItemsPanel || !this.containerConfig) return;
    this.playerItemsPanel.clearControls();

    const isFull = this.containerConfig.items.length >= this.containerConfig.capacity;

    if (this.playerItems.length === 0) {
      const emptyText = new GUI.TextBlock('placeEmpty');
      emptyText.text = 'No items in inventory';
      emptyText.height = '30px';
      emptyText.fontSize = 13;
      emptyText.color = '#666';
      this.playerItemsPanel.addControl(emptyText);
      return;
    }

    if (isFull) {
      const fullText = new GUI.TextBlock('placeFull');
      fullText.text = 'Container is full';
      fullText.height = '24px';
      fullText.fontSize = 12;
      fullText.color = '#FF6347';
      this.playerItemsPanel.addControl(fullText);
    }

    for (const item of this.playerItems) {
      const card = this.createPlayerItemCard(item, isFull);
      this.playerItemsPanel.addControl(card);
    }
  }

  private createPlayerItemCard(item: InventoryItem, containerFull: boolean): GUI.Rectangle {
    const uid = `place_${item.id}`;
    const card = new GUI.Rectangle(uid);
    card.width = '305px';
    card.height = '40px';
    card.cornerRadius = 5;
    card.color = containerFull ? 'rgba(80, 50, 50, 0.4)' : 'rgba(100, 100, 100, 0.3)';
    card.thickness = 1;
    card.background = containerFull ? 'rgba(30, 15, 15, 0.9)' : 'rgba(25, 25, 30, 0.9)';

    // Horizontal layout: [icon] [name] [place button]
    const row = new GUI.StackPanel(`${uid}_row`);
    row.isVertical = false;
    row.width = '100%';
    row.height = '100%';
    card.addControl(row);

    // Item icon (thumbnail or emoji fallback)
    const icon = this.createItemIcon(item, uid, 32);
    if (containerFull) icon.alpha = 0.4;
    row.addControl(icon);

    // Item name
    const nameText = new GUI.TextBlock(`${uid}_name`);
    const qtyLabel = item.quantity > 1 ? ` x${item.quantity}` : '';
    nameText.text = item.name + qtyLabel;
    nameText.fontSize = 12;
    nameText.fontWeight = 'bold';
    nameText.color = containerFull ? '#666' : (item.rarity ? RARITY_COLORS[item.rarity] || '#CCCCCC' : '#CCCCCC');
    nameText.width = '230px';
    nameText.height = '40px';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.textWrapping = true;
    row.addControl(nameText);

    // Place button (up arrow icon)
    if (!containerFull) {
      row.addControl(
        this.createIconButton(`${uid}_place`, ICON_PLACE, 'Place', 'rgba(40, 80, 150, 0.9)', () => this.handlePlace(item)),
      );
    } else {
      const disabledBtn = new GUI.TextBlock(`${uid}_disabled`, ICON_PLACE);
      disabledBtn.width = '30px';
      disabledBtn.height = '28px';
      disabledBtn.fontSize = 14;
      disabledBtn.color = '#444';
      row.addControl(disabledBtn);
    }

    return card;
  }

  // ── Transaction handlers ───────────────────────────────────────────────────

  private handleTake(item: InventoryItem): void {
    if (!this.containerConfig) return;
    const transaction: ContainerTransaction = {
      type: 'take',
      item,
      quantity: item.quantity,
      containerId: this.containerConfig.id,
    };

    // Remove from container, add to player inventory
    this.containerConfig.items = this.containerConfig.items.filter(i => i.id !== item.id);
    this.playerItems.push(item);
    if (this.onTake) this.onTake(transaction);
    this.showStatus(`Took ${item.name}`, '#2ecc71');
    this.updateCapacity();
    this.refreshContainerItems();
    this.refreshPlayerItems();
  }

  private handleTakeAll(): void {
    if (!this.containerConfig) return;
    const items = [...this.containerConfig.items];
    for (const item of items) {
      const transaction: ContainerTransaction = {
        type: 'take',
        item,
        quantity: item.quantity,
        containerId: this.containerConfig.id,
      };
      this.playerItems.push(item);
      if (this.onTake) this.onTake(transaction);
    }

    this.containerConfig.items = [];
    this.showStatus('Took all items', '#2ecc71');
    this.updateCapacity();
    this.refreshContainerItems();
    this.refreshPlayerItems();
  }

  private handlePlace(item: InventoryItem): void {
    if (!this.containerConfig) return;
    if (this.containerConfig.items.length >= this.containerConfig.capacity) {
      this.showStatus('Container is full!', '#FF6347');
      return;
    }

    const transaction: ContainerTransaction = {
      type: 'place',
      item,
      quantity: item.quantity,
      containerId: this.containerConfig.id,
    };

    this.containerConfig.items.push(item);
    this.playerItems = this.playerItems.filter(i => i.id !== item.id);

    if (this.onPlace) this.onPlace(transaction);
    this.showStatus(`Placed ${item.name}`, '#87CEEB');
    this.updateCapacity();
    this.refreshContainerItems();
    this.refreshPlayerItems();
  }

  private handleExamine(item: InventoryItem): void {
    if (!this.containerConfig) return;
    const transaction: ContainerTransaction = {
      type: 'examine',
      item,
      quantity: 1,
      containerId: this.containerConfig.id,
    };
    if (this.onExamine) this.onExamine(transaction);

    const translation = getItemTranslation(item, this.targetLanguage);
    const langInfo = translation
      ? ` \u2014 "${translation.targetWord}" (${this.targetLanguage})`
      : '';
    this.showStatus(`${item.name}: ${item.description || 'No description'}${langInfo}`, '#87CEEB');
  }

  private showStatus(text: string, color: string): void {
    if (this.statusText) {
      this.statusText.text = text;
      this.statusText.color = color;
    }
  }

  // ── Event setters ──────────────────────────────────────────────────────────

  public setOnTake(callback: (transaction: ContainerTransaction) => void): void {
    this.onTake = callback;
  }

  public setOnPlace(callback: (transaction: ContainerTransaction) => void): void {
    this.onPlace = callback;
  }

  public setOnExamine(callback: (transaction: ContainerTransaction) => void): void {
    this.onExamine = callback;
  }

  public setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  public setTargetLanguage(language: string): void {
    this.targetLanguage = language;
  }

  public setThumbnailRenderer(renderer: ItemThumbnailRenderer): void {
    this.thumbnailRenderer = renderer;
  }

  public dispose(): void {
    if (this.panel) {
      this.advancedTexture.removeControl(this.panel);
      this.panel.dispose();
      this.panel = null;
    }
    this.containerItemsPanel = null;
    this.playerItemsPanel = null;
    this.containerConfig = null;
  }
}
