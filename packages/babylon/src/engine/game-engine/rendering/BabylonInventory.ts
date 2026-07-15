/**
 * Babylon Inventory
 *
 * Manages player inventory for quest items and collected objects,
 * with equipment slots for weapon, armor, and accessory.
 * Supports category filtering, grouping, and rarity color coding.
 */

import { Scene } from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

// Re-export engine-agnostic type from shared game-engine
export type { InventoryItem } from '@shared/game-engine/types';
import type { InventoryItem, EquipmentSlot } from '@shared/game-engine/types';
import { getItemTranslation } from '@shared/game-engine/rendering/OnboardingLauncher';

const EQUIPPABLE_TYPES = new Set(['weapon', 'armor', 'tool']);
const USABLE_TYPES = new Set(['consumable', 'food', 'drink', 'quest', 'key', 'document', 'collectible']);
const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
};

/** Display categories for filtering. */
const FILTER_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'weapons_armor', label: 'Gear' },
  { key: 'consumables', label: 'Consumables' },
  { key: 'materials', label: 'Materials' },
  { key: 'quest', label: 'Quest' },
  { key: 'other', label: 'Other' },
] as const;

type FilterKey = (typeof FILTER_CATEGORIES)[number]['key'];

/** Map an item to a filter category key. */
function itemFilterCategory(item: InventoryItem): FilterKey {
  const cat = item.category?.toLowerCase();
  const type = item.type;

  if (type === 'quest' || type === 'key') return 'quest';
  if (type === 'weapon' || type === 'armor' || type === 'tool' || cat === 'weapons' || cat === 'armor' || cat === 'tools') return 'weapons_armor';
  if (type === 'consumable' || type === 'food' || type === 'drink' || cat === 'consumables' || cat === 'food_drink' || cat === 'alchemy') return 'consumables';
  if (type === 'material' || cat === 'materials' || cat === 'crafting') return 'materials';
  return 'other';
}

/** Display group label for sorted rendering. */
function itemGroupLabel(item: InventoryItem): string {
  if (item.category) {
    return item.category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Fallback to type
  return (item.type || 'Other')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const RARITY_COLORS: Record<string, string> = {
  common: '#CCCCCC',
  uncommon: '#1EFF00',
  rare: '#0070DD',
  epic: '#A335EE',
  legendary: '#FF8000',
};

export class BabylonInventory {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private itemsContainer: GUI.StackPanel | null = null;
  private isVisible: boolean = false;

  private items: Map<string, InventoryItem> = new Map();
  private playerGold: number = 100;
  private goldDisplay: GUI.TextBlock | null = null;
  private titleText: GUI.TextBlock | null = null;
  private countDisplay: GUI.TextBlock | null = null;

  // Filter state
  private activeFilter: FilterKey = 'all';
  private filterButtons: Map<FilterKey, GUI.Button> = new Map();
  // Collapsed groups
  private collapsedGroups: Set<string> = new Set();

  // Equipment slot display elements
  private equipmentSlots: Map<EquipmentSlot, GUI.Rectangle> = new Map();
  private equipmentLabels: Map<EquipmentSlot, GUI.TextBlock> = new Map();

  // Language-learning mode
  private isLanguageLearning: boolean = false;
  private targetLanguage: string = 'Spanish';

  // Callbacks
  private onItemAdded: ((item: InventoryItem) => void) | null = null;
  private onItemRemoved: ((itemId: string) => void) | null = null;
  private onItemDropped: ((item: InventoryItem) => void) | null = null;
  private onItemUsed: ((item: InventoryItem) => void) | null = null;
  private onItemEquipped: ((item: InventoryItem) => void) | null = null;
  private onItemUnequipped: ((item: InventoryItem) => void) | null = null;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;

    this.createInventoryUI();
  }

  /** Enable language-learning mode so inventory shows target-language item names. */
  public setLanguageLearning(enabled: boolean, targetLanguage?: string): void {
    this.isLanguageLearning = enabled;
    if (targetLanguage) this.targetLanguage = targetLanguage;
  }

  /** Get the display name for an item, using target language when available. */
  private getDisplayName(item: InventoryItem): string {
    const translation = getItemTranslation(item, this.targetLanguage);
    if (this.isLanguageLearning && translation?.targetWord) {
      return translation.targetWord;
    }
    return item.name;
  }

  private createInventoryUI(): void {
    // Main container
    this.container = new GUI.Rectangle('inventoryContainer');
    this.container.width = '370px';
    this.container.height = '640px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.85)';
    this.advancedTexture.addControl(this.container);

    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    // Title bar
    const titleBar = new GUI.Rectangle('inventoryTitleBar');
    titleBar.width = '370px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(40, 40, 40, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    // Title text
    this.titleText = new GUI.TextBlock('inventoryTitle');
    this.titleText.text = 'Inventory';
    this.titleText.fontSize = 20;
    this.titleText.fontWeight = 'bold';
    this.titleText.color = 'white';
    this.titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.titleText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.titleText.top = '15px';
    this.titleText.left = '15px';
    this.titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.addControl(this.titleText);

    // Item count display (next to title)
    this.countDisplay = new GUI.TextBlock('inventoryCount');
    this.countDisplay.text = '';
    this.countDisplay.fontSize = 13;
    this.countDisplay.color = '#888888';
    this.countDisplay.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.countDisplay.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.countDisplay.top = '19px';
    this.countDisplay.left = '115px';
    this.countDisplay.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.addControl(this.countDisplay);

    // Gold display
    this.goldDisplay = new GUI.TextBlock('inventoryGold');
    this.goldDisplay.text = `Gold: ${this.playerGold}`;
    this.goldDisplay.fontSize = 16;
    this.goldDisplay.fontWeight = 'bold';
    this.goldDisplay.color = '#FFD700';
    this.goldDisplay.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.goldDisplay.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.goldDisplay.top = '17px';
    this.goldDisplay.left = '-50px';
    this.goldDisplay.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.container.addControl(this.goldDisplay);

    // Close button
    const closeButton = GUI.Button.CreateSimpleButton('inventoryClose', 'X');
    closeButton.width = '40px';
    closeButton.height = '40px';
    closeButton.color = 'white';
    closeButton.background = 'rgba(200, 50, 50, 0.8)';
    closeButton.cornerRadius = 5;
    closeButton.fontSize = 18;
    closeButton.fontWeight = 'bold';
    closeButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    closeButton.top = '5px';
    closeButton.left = '-5px';
    closeButton.onPointerUpObservable.add(() => {
      this.hide();
    });
    this.container.addControl(closeButton);

    // ── Equipment Section ──
    this.createEquipmentSection();

    // ── Filter Tabs ──
    this.createFilterTabs();

    // Items scroll view — shifted down for equipment + filters
    const scrollViewer = new GUI.ScrollViewer('inventoryScroll');
    scrollViewer.width = '350px';
    scrollViewer.height = '340px';
    scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    scrollViewer.top = '175px';
    scrollViewer.thickness = 0;
    scrollViewer.barColor = 'rgba(100, 100, 100, 0.8)';
    scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    this.container.addControl(scrollViewer);

    // Items container (stack panel inside scroll viewer)
    this.itemsContainer = new GUI.StackPanel('inventoryItems');
    this.itemsContainer.width = '330px';
    this.itemsContainer.spacing = 4;
    scrollViewer.addControl(this.itemsContainer);

    // Initially hidden
    this.container.isVisible = false;
  }

  private createEquipmentSection(): void {
    if (!this.container) return;

    // Equipment header label
    const equipLabel = new GUI.TextBlock('equipLabel');
    equipLabel.text = 'Equipment';
    equipLabel.fontSize = 12;
    equipLabel.color = '#888888';
    equipLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    equipLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    equipLabel.top = '55px';
    equipLabel.left = '15px';
    equipLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.addControl(equipLabel);

    // Slot row
    const slotRow = new GUI.StackPanel('equipSlotRow');
    slotRow.isVertical = false;
    slotRow.height = '65px';
    slotRow.width = '350px';
    slotRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    slotRow.top = '70px';
    slotRow.spacing = 8;
    this.container.addControl(slotRow);

    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];
    for (const slot of slots) {
      const slotRect = new GUI.Rectangle(`equipSlot_${slot}`);
      slotRect.width = '105px';
      slotRect.height = '60px';
      slotRect.cornerRadius = 5;
      slotRect.color = 'rgba(100, 100, 100, 0.6)';
      slotRect.thickness = 1;
      slotRect.background = 'rgba(20, 20, 20, 0.8)';

      // Slot type label
      const typeLabel = new GUI.TextBlock(`equipType_${slot}`);
      typeLabel.text = SLOT_LABELS[slot];
      typeLabel.fontSize = 10;
      typeLabel.color = '#666666';
      typeLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      typeLabel.top = '4px';
      slotRect.addControl(typeLabel);

      // Item name label
      const nameLabel = new GUI.TextBlock(`equipName_${slot}`);
      nameLabel.text = 'Empty';
      nameLabel.fontSize = 11;
      nameLabel.color = '#555555';
      nameLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
      nameLabel.top = '8px';
      nameLabel.textWrapping = true;
      slotRect.addControl(nameLabel);

      // Click to unequip
      slotRect.onPointerUpObservable.add(() => {
        const nameText = this.equipmentLabels.get(slot);
        if (nameText && nameText.text !== 'Empty') {
          // Find the equipped item in inventory
          for (const item of Array.from(this.items.values())) {
            if (item.equipped && this.getItemSlot(item) === slot) {
              if (this.onItemUnequipped) this.onItemUnequipped(item);
              break;
            }
          }
        }
      });

      this.equipmentSlots.set(slot, slotRect);
      this.equipmentLabels.set(slot, nameLabel);
      slotRow.addControl(slotRect);
    }
  }

  private createFilterTabs(): void {
    if (!this.container) return;

    const filterRow = new GUI.StackPanel('filterRow');
    filterRow.isVertical = false;
    filterRow.height = '28px';
    filterRow.width = '350px';
    filterRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    filterRow.top = '142px';
    filterRow.spacing = 3;
    this.container.addControl(filterRow);

    for (const cat of FILTER_CATEGORIES) {
      const btn = GUI.Button.CreateSimpleButton(`filter_${cat.key}`, cat.label);
      btn.width = `${Math.floor(340 / FILTER_CATEGORIES.length)}px`;
      btn.height = '24px';
      btn.color = 'white';
      btn.cornerRadius = 3;
      btn.fontSize = 10;
      btn.fontWeight = cat.key === 'all' ? 'bold' : 'normal';
      btn.background = cat.key === 'all' ? 'rgba(80, 120, 200, 0.9)' : 'rgba(50, 50, 50, 0.8)';

      btn.onPointerUpObservable.add(() => {
        this.setFilter(cat.key);
      });

      this.filterButtons.set(cat.key, btn);
      filterRow.addControl(btn);
    }
  }

  private setFilter(filter: FilterKey): void {
    this.activeFilter = filter;
    // Update button styles
    for (const [key, btn] of Array.from(this.filterButtons.entries())) {
      if (key === filter) {
        btn.background = 'rgba(80, 120, 200, 0.9)';
        btn.fontWeight = 'bold';
      } else {
        btn.background = 'rgba(50, 50, 50, 0.8)';
        btn.fontWeight = 'normal';
      }
    }
    this.refreshItemList();
  }

  /** Determine which equipment slot an item belongs to. */
  private getItemSlot(item: InventoryItem): EquipmentSlot | null {
    if (item.equipSlot) return item.equipSlot;
    if (item.type === 'weapon') return 'weapon';
    if (item.type === 'armor') return 'armor';
    if (item.type === 'tool' && item.effects) return 'accessory';
    return null;
  }

  // ─── Show / Hide ────────────────────────────────────────────────────────

  public show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
      this.refreshItemList();
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

  // ─── Item Management ────────────────────────────────────────────────────

  public addItem(item: InventoryItem): void {
    const existingItem = this.items.get(item.id);

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      this.items.set(item.id, { ...item });
    }

    this.refreshItemList();

    if (this.onItemAdded) {
      this.onItemAdded(item);
    }
  }

  public removeItem(itemId: string, quantity: number = 1): boolean {
    const item = this.items.get(itemId);

    if (!item) {
      return false;
    }

    // Prevent dropping quest items while quest is active
    if (item.type === 'quest' && item.questId) {
      return false;
    }

    item.quantity -= quantity;

    if (item.quantity <= 0) {
      this.items.delete(itemId);
    }

    this.refreshItemList();

    if (this.onItemRemoved) {
      this.onItemRemoved(itemId);
    }

    return true;
  }

  public hasItem(itemId: string): boolean {
    return this.items.has(itemId);
  }

  public getItem(itemId: string): InventoryItem | undefined {
    return this.items.get(itemId);
  }

  public getAllItems(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  public clearAll(): void {
    this.items.clear();
    this.refreshItemList();
  }

  // ─── Equipment Display ──────────────────────────────────────────────────

  /** Update equipment slot displays from external equipment state. */
  public updateEquipmentDisplay(equipped: Map<EquipmentSlot, InventoryItem | null>): void {
    for (const [slot, item] of Array.from(equipped.entries())) {
      const label = this.equipmentLabels.get(slot);
      const rect = this.equipmentSlots.get(slot);
      if (!label || !rect) continue;

      if (item) {
        label.text = this.getDisplayName(item);
        label.color = this.getItemNameColor(item);
        rect.color = this.getItemNameColor(item);
        rect.background = 'rgba(30, 40, 30, 0.9)';
      } else {
        label.text = 'Empty';
        label.color = '#555555';
        rect.color = 'rgba(100, 100, 100, 0.6)';
        rect.background = 'rgba(20, 20, 20, 0.8)';
      }
    }
  }

  // ─── Item List Rendering ────────────────────────────────────────────────

  public refreshItemList(): void {
    if (!this.itemsContainer) return;

    this.itemsContainer.clearControls();

    // Get filtered items
    const allItems = Array.from(this.items.values());
    const filtered = this.activeFilter === 'all'
      ? allItems
      : allItems.filter((item) => itemFilterCategory(item) === this.activeFilter);

    // Update header count
    this.updateCountDisplay(allItems.length, filtered.length);

    if (filtered.length === 0) {
      const emptyText = new GUI.TextBlock('emptyInventory');
      emptyText.text = this.activeFilter === 'all'
        ? 'Your inventory is empty'
        : 'No items in this category';
      emptyText.height = '40px';
      emptyText.fontSize = 14;
      emptyText.color = '#888888';
      emptyText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
      this.itemsContainer.addControl(emptyText);
      return;
    }

    // Group by category label
    const groups = new Map<string, InventoryItem[]>();
    for (const item of filtered) {
      const group = itemGroupLabel(item);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(item);
    }

    // Sort groups alphabetically, but pin "Quest" first
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Quest') return -1;
      if (b === 'Quest') return 1;
      return a.localeCompare(b);
    });

    for (const [groupName, items] of sortedGroups) {
      // Group header (collapsible)
      const isCollapsed = this.collapsedGroups.has(groupName);
      const header = this.createGroupHeader(groupName, items.length, isCollapsed);
      this.itemsContainer.addControl(header);

      if (!isCollapsed) {
        // Sort items within group: equipped first, then by rarity (legendary→common), then name
        const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
        items.sort((a, b) => {
          if (a.equipped && !b.equipped) return -1;
          if (!a.equipped && b.equipped) return 1;
          const ra = rarityOrder[a.rarity || 'common'] ?? 4;
          const rb = rarityOrder[b.rarity || 'common'] ?? 4;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });

        for (const item of items) {
          const itemCard = this.createItemCard(item);
          this.itemsContainer.addControl(itemCard);
        }
      }
    }
  }

  private createGroupHeader(groupName: string, count: number, collapsed: boolean): GUI.Rectangle {
    const header = new GUI.Rectangle(`group_${groupName}`);
    header.width = '320px';
    header.height = '26px';
    header.cornerRadius = 3;
    header.color = 'transparent';
    header.thickness = 0;
    header.background = 'rgba(60, 60, 80, 0.6)';

    const label = new GUI.TextBlock(`groupLabel_${groupName}`);
    label.text = `${collapsed ? '>' : 'v'} ${groupName} (${count})`;
    label.fontSize = 12;
    label.fontWeight = 'bold';
    label.color = '#AAAACC';
    label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '10px';
    header.addControl(label);

    header.onPointerUpObservable.add(() => {
      if (this.collapsedGroups.has(groupName)) {
        this.collapsedGroups.delete(groupName);
      } else {
        this.collapsedGroups.add(groupName);
      }
      this.refreshItemList();
    });

    return header;
  }

  private updateCountDisplay(total: number, filtered: number): void {
    if (!this.countDisplay) return;
    if (this.activeFilter === 'all') {
      this.countDisplay.text = `(${total})`;
    } else {
      this.countDisplay.text = `(${filtered}/${total})`;
    }
  }

  private createItemCard(item: InventoryItem): GUI.Rectangle {
    const card = new GUI.Rectangle(`item_${item.id}`);
    card.width = '320px';
    card.height = '90px';
    card.cornerRadius = 5;
    card.color = this.getRarityBorderColor(item.rarity);
    card.thickness = 1;
    card.background = 'rgba(30, 30, 30, 0.8)';

    // Item name (with [E] badge if equipped)
    const displayName = this.getDisplayName(item);
    const hasLangData = this.isLanguageLearning && !!getItemTranslation(item, this.targetLanguage)?.targetWord;
    const nameText = new GUI.TextBlock(`item_name_${item.id}`);
    nameText.text = item.equipped ? `[E] ${displayName}` : displayName;
    nameText.fontSize = 15;
    nameText.fontWeight = 'bold';
    nameText.color = item.equipped ? '#90EE90' : this.getItemNameColor(item);
    nameText.height = '20px';
    nameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    nameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.top = '6px';
    nameText.left = '12px';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.addControl(nameText);

    // Show English name as subtitle in language-learning mode
    if (hasLangData) {
      const englishLabel = new GUI.TextBlock(`item_eng_${item.id}`);
      englishLabel.text = `(${item.name})`;
      englishLabel.fontSize = 11;
      englishLabel.color = '#888888';
      englishLabel.fontStyle = 'italic';
      englishLabel.height = '14px';
      englishLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      englishLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      englishLabel.top = '24px';
      englishLabel.left = '12px';
      englishLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      card.addControl(englishLabel);
    }

    // Quantity badge and value — top right
    const infoRow = new GUI.StackPanel(`item_info_${item.id}`);
    infoRow.isVertical = false;
    infoRow.height = '20px';
    infoRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    infoRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    infoRow.top = '6px';
    infoRow.left = '-8px';
    card.addControl(infoRow);

    if (item.value) {
      const valueText = new GUI.TextBlock(`item_val_${item.id}`);
      valueText.text = `${item.value}g`;
      valueText.fontSize = 11;
      valueText.color = '#FFD700';
      valueText.width = '40px';
      infoRow.addControl(valueText);
    }

    // Always show quantity badge
    const quantityText = new GUI.TextBlock(`item_qty_${item.id}`);
    quantityText.text = `x${item.quantity}`;
    quantityText.fontSize = 11;
    quantityText.fontWeight = 'bold';
    quantityText.color = item.quantity > 1 ? '#8888FF' : '#666666';
    quantityText.width = '35px';
    infoRow.addControl(quantityText);

    // Rarity + type tag line
    const tagParts: string[] = [];
    if (item.rarity && item.rarity !== 'common') {
      tagParts.push(item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1));
    }
    if (item.baseType) {
      tagParts.push(item.baseType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    } else if (item.type) {
      tagParts.push(item.type.charAt(0).toUpperCase() + item.type.slice(1));
    }
    if (item.material) {
      tagParts.push(item.material.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    }

    if (tagParts.length > 0) {
      const tagText = new GUI.TextBlock(`item_tag_${item.id}`);
      tagText.text = tagParts.join(' · ');
      tagText.fontSize = 10;
      tagText.color = '#999999';
      tagText.height = '14px';
      tagText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      tagText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      tagText.top = '24px';
      tagText.left = '12px';
      tagText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      card.addControl(tagText);
    }

    // Description line + stat preview
    const descLine = this.getDescriptionWithStats(item);
    if (descLine) {
      const descText = new GUI.TextBlock(`item_desc_${item.id}`);
      descText.text = descLine;
      descText.fontSize = 10;
      descText.color = '#BBBBBB';
      descText.height = '26px';
      descText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      descText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      descText.top = '38px';
      descText.left = '12px';
      descText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      descText.textWrapping = true;
      card.addControl(descText);
    }

    // Action buttons row
    const buttonsRow = new GUI.StackPanel(`item_btns_${item.id}`);
    buttonsRow.isVertical = false;
    buttonsRow.height = '25px';
    buttonsRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    buttonsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    buttonsRow.top = '-4px';
    buttonsRow.left = '-8px';
    card.addControl(buttonsRow);

    // Equip button — for equippable types, not already equipped
    const slot = this.getItemSlot(item);
    if (slot && !item.equipped) {
      const equipBtn = GUI.Button.CreateSimpleButton(`equip_${item.id}`, 'Equip');
      equipBtn.width = '50px';
      equipBtn.height = '22px';
      equipBtn.color = 'white';
      equipBtn.background = 'rgba(50, 90, 160, 0.9)';
      equipBtn.cornerRadius = 3;
      equipBtn.fontSize = 11;
      equipBtn.onPointerUpObservable.add(() => {
        if (this.onItemEquipped) this.onItemEquipped(item);
      });
      buttonsRow.addControl(equipBtn);
    }

    // Use/Read button — for consumable, food, drink, quest, key, document items
    if (USABLE_TYPES.has(item.type)) {
      const isDocument = item.type === 'document' || item.category === 'document';
      const useBtn = GUI.Button.CreateSimpleButton(`use_${item.id}`, isDocument ? 'Read' : 'Use');
      useBtn.width = '50px';
      useBtn.height = '22px';
      useBtn.color = 'white';
      useBtn.background = 'rgba(60, 130, 60, 0.9)';
      useBtn.cornerRadius = 3;
      useBtn.fontSize = 11;
      useBtn.onPointerUpObservable.add(() => {
        if (this.onItemUsed) this.onItemUsed(item);
      });
      buttonsRow.addControl(useBtn);
    }

    // Drop button — not for quest items, not for equipped items
    if (item.type !== 'quest' && !item.equipped) {
      const dropBtn = GUI.Button.CreateSimpleButton(`drop_${item.id}`, 'Drop');
      dropBtn.width = '50px';
      dropBtn.height = '22px';
      dropBtn.color = 'white';
      dropBtn.background = 'rgba(130, 60, 60, 0.9)';
      dropBtn.cornerRadius = 3;
      dropBtn.fontSize = 11;
      dropBtn.paddingLeft = '4px';
      dropBtn.onPointerUpObservable.add(() => {
        if (this.onItemDropped) this.onItemDropped(item);
      });
      buttonsRow.addControl(dropBtn);
    }

    return card;
  }

  /** Build description string, appending stat bonuses if present. */
  private getDescriptionWithStats(item: InventoryItem): string {
    const parts: string[] = [];
    if (item.description) parts.push(item.description);

    if (item.effects) {
      const statParts: string[] = [];
      if (item.effects.attackPower) statParts.push(`ATK +${item.effects.attackPower}`);
      if (item.effects.defense) statParts.push(`DEF +${item.effects.defense}`);
      if (item.effects.dodgeChance) statParts.push(`DODGE +${(item.effects.dodgeChance * 100).toFixed(0)}%`);
      if (item.effects.health) statParts.push(`HP +${item.effects.health}`);
      if (item.effects.energy) statParts.push(`EN +${item.effects.energy}`);
      if (statParts.length > 0) parts.push(statParts.join(' | '));
    }

    return parts.join(' — ');
  }

  /** Get the display color for an item name, preferring rarity color. */
  private getItemNameColor(item: InventoryItem): string {
    if (item.rarity && RARITY_COLORS[item.rarity]) {
      return RARITY_COLORS[item.rarity];
    }
    return this.getItemTypeColor(item.type);
  }

  /** Get a subtle border/accent color based on rarity. */
  private getRarityBorderColor(rarity?: string): string {
    if (rarity && RARITY_COLORS[rarity] && rarity !== 'common') {
      return RARITY_COLORS[rarity] + '88'; // semi-transparent
    }
    return 'rgba(150, 150, 150, 0.5)';
  }

  private getItemTypeColor(type: string): string {
    switch (type) {
      case 'quest':
        return '#FFD700';
      case 'collectible':
        return '#87CEEB';
      case 'key':
        return '#FF6347';
      case 'consumable':
        return '#90EE90';
      case 'weapon':
        return '#FF8C00';
      case 'armor':
        return '#B0C4DE';
      case 'food':
      case 'drink':
        return '#DEB887';
      case 'material':
        return '#D2B48C';
      case 'tool':
        return '#C0C0C0';
      default:
        return 'white';
    }
  }

  // ─── Gold Management ──────────────────────────────────────────────────────

  public getGold(): number {
    return this.playerGold;
  }

  public setGold(amount: number): void {
    this.playerGold = Math.max(0, amount);
    this.updateGoldDisplay();
  }

  public addGold(amount: number): void {
    this.playerGold += amount;
    this.updateGoldDisplay();
  }

  public removeGold(amount: number): boolean {
    if (this.playerGold < amount) return false;
    this.playerGold -= amount;
    this.updateGoldDisplay();
    return true;
  }

  private updateGoldDisplay(): void {
    if (this.goldDisplay) {
      this.goldDisplay.text = `Gold: ${this.playerGold}`;
    }
  }

  // ─── Callbacks ────────────────────────────────────────────────────────

  public setOnItemAdded(callback: (item: InventoryItem) => void): void {
    this.onItemAdded = callback;
  }

  public setOnItemRemoved(callback: (itemId: string) => void): void {
    this.onItemRemoved = callback;
  }

  public setOnItemDropped(callback: (item: InventoryItem) => void): void {
    this.onItemDropped = callback;
  }

  public setOnItemUsed(callback: (item: InventoryItem) => void): void {
    this.onItemUsed = callback;
  }

  public setOnItemEquipped(callback: (item: InventoryItem) => void): void {
    this.onItemEquipped = callback;
  }

  public setOnItemUnequipped(callback: (item: InventoryItem) => void): void {
    this.onItemUnequipped = callback;
  }

  /**
   * Dispose inventory
   */
  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    this.itemsContainer = null;
    this.equipmentSlots.clear();
    this.equipmentLabels.clear();
    this.filterButtons.clear();
    this.items.clear();
  }
}
