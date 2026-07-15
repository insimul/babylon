/**
 * BabylonShopPanel
 *
 * A Babylon.js GUI panel for buying/selling items with merchant NPCs.
 * Displays merchant inventory on the left and player inventory on the right.
 *
 * Features:
 * - Quantity controls for stackable items (buy/sell multiple)
 * - Rarity-based price multipliers and color coding
 * - Sell validation: merchants only buy item types they deal in
 * - Insufficient funds / merchant can't afford feedback
 * - Gold tracking for both player and merchant
 * - Language-learning mode: item names in target language, typing-to-purchase,
 *   vocabulary tracking, TTS pronunciation, difficulty auto-scaling
 */

import * as GUI from '@babylonjs/gui';
import type { ShopItem, InventoryItem, ItemType } from '@shared/game-engine/types';
import type { WorldLanguage } from '@shared/language';
import type { VocabularyEntry } from '@shared/language-progress';

/** Accepted item types per business type for sell validation */
const BUSINESS_ACCEPTED_TYPES: Record<string, Set<string>> = {
  Bakery: new Set(['food', 'material']),
  Bar: new Set(['food', 'drink', 'material']),
  Restaurant: new Set(['food', 'drink']),
  Shop: new Set(['tool', 'consumable', 'material', 'weapon', 'armor']),
  GroceryStore: new Set(['food', 'drink', 'material']),
  Pharmacy: new Set(['consumable', 'material', 'tool']),
  JewelryStore: new Set(['armor']), // jewelry is typed as armor
  Brewery: new Set(['drink', 'material']),
  Farm: new Set(['food', 'drink', 'material', 'tool']),
  // Aliases
  Hotel: new Set(['food', 'drink']),
  Hospital: new Set(['consumable', 'material', 'tool']),
  Church: new Set(['tool', 'consumable', 'material', 'weapon', 'armor']),
  School: new Set(['tool', 'consumable', 'material', 'weapon', 'armor']),
  Generic: new Set(['tool', 'consumable', 'material', 'weapon', 'armor']),
  Blacksmith: new Set(['weapon', 'armor', 'tool', 'material']),
  Tailor: new Set(['armor', 'material']),
  Butcher: new Set(['food', 'material']),
  BookStore: new Set(['consumable', 'tool']),
  HerbShop: new Set(['consumable', 'material', 'food']),
  PawnShop: new Set(['tool', 'consumable', 'material', 'weapon', 'armor']),
  Carpenter: new Set(['tool', 'material']),
  Clinic: new Set(['consumable', 'material', 'tool']),
};

const RARITY_COLORS: Record<string, string> = {
  common: '#CCCCCC',
  uncommon: '#1EFF00',
  rare: '#0070FF',
  epic: '#A335EE',
  legendary: '#FF8000',
};

const RARITY_PRICE_MULTIPLIERS: Record<string, number> = {
  common: 1,
  uncommon: 3,
  rare: 10,
  epic: 50,
  legendary: 200,
};

/** Merchant responses in various languages for language-learning flavor */
const MERCHANT_RESPONSES: Record<string, { greeting: string; thanks: string; noGold: string }> = {
  French: { greeting: 'Bienvenue!', thanks: 'Merci!', noGold: "Vous n'avez pas assez d'or!" },
  Spanish: { greeting: 'Bienvenido!', thanks: 'Gracias!', noGold: 'No tienes suficiente oro!' },
  German: { greeting: 'Willkommen!', thanks: 'Danke!', noGold: 'Du hast nicht genug Gold!' },
  Italian: { greeting: 'Benvenuto!', thanks: 'Grazie!', noGold: "Non hai abbastanza oro!" },
  Japanese: { greeting: 'Irasshaimase!', thanks: 'Arigatou!', noGold: 'Okane ga tarinai!' },
  Portuguese: { greeting: 'Bem-vindo!', thanks: 'Obrigado!', noGold: 'Voce nao tem ouro suficiente!' },
};

export interface ShopPanelConfig {
  merchantId: string;
  merchantName: string;
  items: ShopItem[];
  goldReserve: number;
  buyMultiplier: number;
  sellMultiplier: number;
  /** Business type — used to determine which item types the merchant will buy */
  businessType?: string;
}

export interface ShopTransaction {
  type: 'buy' | 'sell';
  item: ShopItem | InventoryItem;
  quantity: number;
  totalPrice: number;
  merchantId?: string;
  merchantName?: string;
  businessType?: string;
  /** True when player typed the item name in target language to buy */
  typedInTargetLanguage?: boolean;
  /** The word the player typed (in target language) */
  typedWord?: string;
  /** The expected target-language word */
  targetWord?: string;
}

/** Language-learning configuration for the shop */
export interface ShopLanguageConfig {
  /** The target language for learning */
  targetLanguage: WorldLanguage;
  /** Player proficiency level 0-100 */
  playerProficiency: number;
  /** Already-learned vocabulary entries */
  learnedVocabulary: VocabularyEntry[];
  /** Callback to track a purchased word as new vocabulary */
  onVocabularyLearned?: (word: string, meaning: string, category: string) => void;
  /** Callback to speak an item name via TTS */
  onPronounce?: (text: string, languageCode: string) => void;
}

/** Difficulty mode derived from player proficiency */
type LanguageDifficulty = 'beginner' | 'intermediate' | 'advanced';

export class BabylonShopPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private merchantItemsContainer: GUI.StackPanel | null = null;
  private playerItemsContainer: GUI.StackPanel | null = null;
  private playerGoldText: GUI.TextBlock | null = null;
  private merchantGoldText: GUI.TextBlock | null = null;
  private statusText: GUI.TextBlock | null = null;
  private isVisible: boolean = false;

  private merchantConfig: ShopPanelConfig | null = null;
  private playerItems: InventoryItem[] = [];
  private playerGold: number = 0;

  /** Track selected quantities per item for multi-buy/sell */
  private selectedQuantities: Map<string, number> = new Map();

  private onBuy: ((transaction: ShopTransaction) => void) | null = null;
  private onSell: ((transaction: ShopTransaction) => void) | null = null;
  private onClose: (() => void) | null = null;

  // Language-learning state
  private languageConfig: ShopLanguageConfig | null = null;
  private languageDifficulty: LanguageDifficulty = 'beginner';
  /** Map item name (English) → target language name */
  private itemTranslations: Map<string, string> = new Map();
  /** Active text input for intermediate mode typing */
  private activeInputField: GUI.InputText | null = null;
  private activeInputItemId: string | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createUI();
  }

  /**
   * Enable language-learning mode. Call before open() to activate.
   */
  public setLanguageConfig(config: ShopLanguageConfig | null): void {
    this.languageConfig = config;
    if (config) {
      this.languageDifficulty = this.computeDifficulty(config.playerProficiency);
      this.buildItemTranslations(config.targetLanguage);
    } else {
      this.itemTranslations.clear();
    }
  }

  private computeDifficulty(proficiency: number): LanguageDifficulty {
    if (proficiency < 30) return 'beginner';
    if (proficiency < 65) return 'intermediate';
    return 'advanced';
  }

  /** Build English→target language name map. Priority: item DB translations > sampleWords */
  private buildItemTranslations(lang: WorldLanguage): void {
    this.itemTranslations.clear();
    // Fallback: sampleWords from the language definition
    if (lang.sampleWords) {
      for (const [english, conlang] of Object.entries(lang.sampleWords)) {
        this.itemTranslations.set(english.toLowerCase(), conlang as string);
      }
    }
  }

  /** Resolve the target language name from an item's own translations field. */
  private getLanguageName(): string {
    return this.languageConfig?.targetLanguage?.name || 'French';
  }

  /** Look up target-language name for an item. Checks item translations first. */
  private getTranslatedName(englishName: string, item?: any): string | null {
    if (!this.languageConfig) return null;

    // Priority 1: item's own DB translations field (from migration 046)
    if (item?.translations) {
      const langName = this.getLanguageName();
      const trans = item.translations[langName];
      if (trans?.targetWord) return trans.targetWord;
    }

    // Priority 2: sampleWords fallback
    const lower = englishName.toLowerCase();
    const direct = this.itemTranslations.get(lower);
    if (direct) return direct;
    const words = lower.split(/\s+/);
    for (const w of words) {
      const match = this.itemTranslations.get(w);
      if (match) return match;
    }
    return null;
  }

  /** Check if player already knows a word */
  private isWordLearned(word: string): boolean {
    if (!this.languageConfig) return false;
    return this.languageConfig.learnedVocabulary.some(
      v => v.word.toLowerCase() === word.toLowerCase()
    );
  }

  /** Fuzzy match for intermediate mode: accept minor typos (Levenshtein distance <= 2) */
  private fuzzyMatch(input: string, target: string): boolean {
    const a = input.toLowerCase().trim();
    const b = target.toLowerCase().trim();
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    return this.levenshteinDistance(a, b) <= 2;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    // Use single-row optimization
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  private get isLanguageMode(): boolean {
    return this.languageConfig !== null;
  }

  private getMerchantResponse(key: 'greeting' | 'thanks' | 'noGold'): string | null {
    if (!this.languageConfig) return null;
    const langName = this.languageConfig.targetLanguage.name;
    // Try real language name first
    const responses = MERCHANT_RESPONSES[langName];
    if (responses) return responses[key];
    // Try realCode-based lookup
    const code = this.languageConfig.targetLanguage.realCode;
    if (code) {
      for (const [name, resps] of Object.entries(MERCHANT_RESPONSES)) {
        if (name.toLowerCase().startsWith(code.substring(0, 2).toLowerCase())) {
          return resps[key];
        }
      }
    }
    return null;
  }

  private createUI(): void {
    // Main container
    this.container = new GUI.Rectangle('shopContainer');
    this.container.width = '700px';
    this.container.height = '520px';
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.9)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.advancedTexture.addControl(this.container);

    // Vertical layout: title bar -> columns -> status
    const mainLayout = new GUI.StackPanel('shopMainLayout');
    mainLayout.isVertical = true;
    mainLayout.width = '100%';
    mainLayout.height = '100%';
    this.container.addControl(mainLayout);

    // Title bar
    const titleBar = new GUI.Rectangle('shopTitleBar');
    titleBar.width = '700px';
    titleBar.height = '45px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(50, 35, 20, 1)';
    titleBar.thickness = 0;
    mainLayout.addControl(titleBar);

    const titleText = new GUI.TextBlock('shopTitle');
    titleText.text = 'Shop';
    titleText.fontSize = 18;
    titleText.fontWeight = 'bold';
    titleText.color = '#FFD700';
    titleBar.addControl(titleText);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('shopClose', 'X');
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
    const columnsContainer = new GUI.StackPanel('shopColumns');
    columnsContainer.isVertical = false;
    columnsContainer.width = '680px';
    columnsContainer.height = '440px';
    mainLayout.addControl(columnsContainer);

    // Left column: Merchant inventory
    const leftCol = this.createColumn('merchantCol', 'Merchant Wares', true);
    columnsContainer.addControl(leftCol.wrapper);
    this.merchantItemsContainer = leftCol.itemsPanel;
    this.merchantGoldText = leftCol.goldText;

    // Divider
    const divider = new GUI.Rectangle('shopDivider');
    divider.width = '2px';
    divider.height = '400px';
    divider.background = 'rgba(100, 100, 100, 0.5)';
    divider.thickness = 0;
    columnsContainer.addControl(divider);

    // Right column: Player inventory (sellable)
    const rightCol = this.createColumn('playerCol', 'Your Items', false);
    columnsContainer.addControl(rightCol.wrapper);
    this.playerItemsContainer = rightCol.itemsPanel;
    this.playerGoldText = rightCol.goldText;

    // Status bar at bottom
    this.statusText = new GUI.TextBlock('shopStatus');
    this.statusText.text = '';
    this.statusText.fontSize = 13;
    this.statusText.color = '#AAAAAA';
    this.statusText.height = '25px';
    mainLayout.addControl(this.statusText);

    this.container.isVisible = false;
  }

  private createColumn(
    id: string,
    title: string,
    _isMerchant: boolean
  ): { wrapper: GUI.Rectangle; itemsPanel: GUI.StackPanel; goldText: GUI.TextBlock } {
    // Use a StackPanel wrapper to vertically stack header + scroll area
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

    // Column header
    const header = new GUI.Rectangle(`${id}_header`);
    header.width = '330px';
    header.height = '35px';
    header.background = 'rgba(40, 40, 40, 0.8)';
    header.cornerRadius = 5;
    header.thickness = 0;
    colLayout.addControl(header);

    const headerText = new GUI.TextBlock(`${id}_title`);
    headerText.text = title;
    headerText.fontSize = 14;
    headerText.fontWeight = 'bold';
    headerText.color = 'white';
    headerText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerText.paddingLeft = '10px';
    headerText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.addControl(headerText);

    const goldText = new GUI.TextBlock(`${id}_gold`);
    goldText.text = 'Gold: 0';
    goldText.fontSize = 13;
    goldText.color = '#FFD700';
    goldText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    goldText.paddingRight = '10px';
    goldText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    header.addControl(goldText);

    // Scrollable items area — fills remaining height
    const scrollViewer = new GUI.ScrollViewer(`${id}_scroll`);
    scrollViewer.width = '330px';
    scrollViewer.height = '400px';
    scrollViewer.thickness = 0;
    scrollViewer.barColor = 'rgba(100, 100, 100, 0.8)';
    scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    colLayout.addControl(scrollViewer);

    const itemsPanel = new GUI.StackPanel(`${id}_items`);
    itemsPanel.width = '310px';
    itemsPanel.spacing = 4;
    scrollViewer.addControl(itemsPanel);

    return { wrapper, itemsPanel, goldText };
  }

  public open(config: ShopPanelConfig, playerItems: InventoryItem[], playerGold: number): void {
    this.merchantConfig = config;
    this.playerItems = playerItems;
    this.playerGold = playerGold;
    this.selectedQuantities.clear();
    this.activeInputField = null;
    this.activeInputItemId = null;

    if (this.container) {
      // Update title
      const titleControl = this.container.getChildByName('shopTitle') as GUI.TextBlock;
      if (titleControl) {
        titleControl.text = `${config.merchantName}'s Shop`;
      }

      this.refreshMerchantItems();
      this.refreshPlayerItems();
      this.updateGoldDisplays();

      this.container.isVisible = true;
      this.isVisible = true;

      // Language mode greeting
      if (this.isLanguageMode) {
        const greeting = this.getMerchantResponse('greeting');
        if (greeting) {
          this.showStatus(`${config.merchantName}: "${greeting}"`, '#87CEEB');
        }
      }
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
      this.activeInputField = null;
      this.activeInputItemId = null;
      if (this.onClose) this.onClose();
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Check if the merchant accepts a given item type for selling.
   */
  private merchantAcceptsItemType(itemType: ItemType): boolean {
    if (!this.merchantConfig?.businessType) return true; // no business type = accept all
    const accepted = BUSINESS_ACCEPTED_TYPES[this.merchantConfig.businessType];
    if (!accepted) return true; // unknown business type = accept all
    return accepted.has(itemType);
  }

  private refreshMerchantItems(): void {
    if (!this.merchantItemsContainer || !this.merchantConfig) return;
    this.merchantItemsContainer.clearControls();

    if (this.merchantConfig.items.length === 0) {
      const emptyText = new GUI.TextBlock('shopEmpty');
      emptyText.text = 'No items for sale';
      emptyText.height = '30px';
      emptyText.fontSize = 13;
      emptyText.color = '#888';
      this.merchantItemsContainer.addControl(emptyText);
      return;
    }

    for (const item of this.merchantConfig.items) {
      if (item.stock <= 0) continue;
      const card = this.createShopItemCard(item, 'buy');
      this.merchantItemsContainer.addControl(card);
    }
  }

  private refreshPlayerItems(): void {
    if (!this.playerItemsContainer) return;
    this.playerItemsContainer.clearControls();

    const sellableItems = this.playerItems.filter(
      i => i.tradeable !== false && i.type !== 'quest'
    );

    if (sellableItems.length === 0) {
      const emptyText = new GUI.TextBlock('sellEmpty');
      emptyText.text = 'No items to sell';
      emptyText.height = '30px';
      emptyText.fontSize = 13;
      emptyText.color = '#888';
      this.playerItemsContainer.addControl(emptyText);
      return;
    }

    for (const item of sellableItems) {
      const accepted = this.merchantAcceptsItemType(item.type);
      const sellPrice = accepted
        ? Math.floor(
            (item.sellValue || item.value || 0) * (this.merchantConfig?.sellMultiplier || 0.5)
          )
        : 0;
      const shopItem: ShopItem = {
        ...item,
        buyPrice: item.value || 0,
        sellPrice,
        stock: item.quantity,
        maxStock: item.quantity,
      };
      const card = this.createShopItemCard(shopItem, 'sell', !accepted);
      this.playerItemsContainer.addControl(card);
    }
  }

  private createShopItemCard(
    item: ShopItem,
    mode: 'buy' | 'sell',
    merchantRefuses: boolean = false
  ): GUI.Rectangle {
    const uid = `${mode}_${item.id}`;
    const qtyKey = `${mode}_${item.id}`;
    const maxQty = mode === 'buy' ? item.stock : item.quantity;
    const isStackable = maxQty > 1;

    // Initialize quantity selection
    if (!this.selectedQuantities.has(qtyKey)) {
      this.selectedQuantities.set(qtyKey, 1);
    }
    const selectedQty = this.selectedQuantities.get(qtyKey) || 1;
    const unitPrice = mode === 'buy' ? item.buyPrice : item.sellPrice;
    const totalPrice = unitPrice * selectedQty;

    // Language mode: compute translated name
    const translatedName = this.isLanguageMode ? this.getTranslatedName(item.name, item) : null;
    const hasTranslation = translatedName !== null;
    const wordKnown = hasTranslation ? this.isWordLearned(translatedName) : false;

    // In language mode, cards are taller to accommodate language elements
    const langExtraHeight = this.isLanguageMode && hasTranslation ? 22 : 0;
    // Intermediate mode typing row adds more height
    const typingHeight = this.isLanguageMode && hasTranslation &&
      this.languageDifficulty !== 'beginner' && mode === 'buy' ? 26 : 0;

    const card = new GUI.Rectangle(uid);
    card.width = '305px';
    card.height = `${(isStackable ? 80 : 65) + langExtraHeight + typingHeight}px`;
    card.cornerRadius = 5;
    card.color = merchantRefuses ? 'rgba(80, 50, 50, 0.6)' : 'rgba(100, 100, 100, 0.4)';
    card.thickness = 1;
    card.background = merchantRefuses ? 'rgba(30, 15, 15, 0.9)' : 'rgba(25, 25, 25, 0.9)';

    // Vertical stack for card content rows
    const cardStack = new GUI.StackPanel(`${uid}_stack`);
    cardStack.isVertical = true;
    cardStack.width = '100%';
    cardStack.height = '100%';
    cardStack.paddingLeft = '10px';
    cardStack.paddingRight = '10px';
    cardStack.paddingTop = '4px';
    card.addControl(cardStack);

    // Row 1: Name + rarity + stock
    const topRow = new GUI.StackPanel(`${uid}_topRow`);
    topRow.isVertical = false;
    topRow.width = '100%';
    topRow.height = '20px';
    cardStack.addControl(topRow);

    const nameText = new GUI.TextBlock(`${uid}_name`);
    const rarityLabel = item.rarity && item.rarity !== 'common' ? ` [${item.rarity}]` : '';

    if (this.isLanguageMode && hasTranslation) {
      // Show target language name as primary
      nameText.text = translatedName + rarityLabel;
    } else {
      nameText.text = item.name + rarityLabel;
    }
    nameText.fontSize = 14;
    nameText.fontWeight = 'bold';
    nameText.color = merchantRefuses
      ? '#666'
      : (item.rarity ? RARITY_COLORS[item.rarity] || this.getItemColor(item.type) : this.getItemColor(item.type));
    nameText.width = mode === 'buy' ? '60%' : '90%';
    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    topRow.addControl(nameText);

    // Pronunciation button (language mode)
    if (this.isLanguageMode && hasTranslation && mode === 'buy') {
      const speakBtn = GUI.Button.CreateSimpleButton(`${uid}_speak`, '\u{1F50A}');
      speakBtn.width = '24px';
      speakBtn.height = '20px';
      speakBtn.color = '#87CEEB';
      speakBtn.background = 'transparent';
      speakBtn.thickness = 0;
      speakBtn.fontSize = 14;
      speakBtn.onPointerUpObservable.add(() => {
        if (this.languageConfig?.onPronounce && translatedName) {
          const langCode = this.languageConfig.targetLanguage.realCode || 'en';
          this.languageConfig.onPronounce(translatedName, langCode);
        }
      });
      topRow.addControl(speakBtn);
    }

    if (mode === 'buy') {
      const stockText = new GUI.TextBlock(`${uid}_stock`);
      stockText.text = `Stock: ${item.stock}`;
      stockText.fontSize = 11;
      stockText.color = item.stock <= 2 ? '#FF6347' : '#AAA';
      stockText.width = '25%';
      stockText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      topRow.addControl(stockText);
    }

    // Language row: native-language tooltip (shows English meaning)
    if (this.isLanguageMode && hasTranslation) {
      const langRow = new GUI.StackPanel(`${uid}_langRow`);
      langRow.isVertical = false;
      langRow.width = '100%';
      langRow.height = '18px';
      cardStack.addControl(langRow);

      const meaningText = new GUI.TextBlock(`${uid}_meaning`);
      meaningText.text = `(${item.name})`;
      meaningText.fontSize = 11;
      meaningText.color = '#888';
      meaningText.fontStyle = 'italic';
      meaningText.width = '70%';
      meaningText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      langRow.addControl(meaningText);

      // Mastery indicator
      const masteryText = new GUI.TextBlock(`${uid}_mastery`);
      if (wordKnown) {
        masteryText.text = 'Learned';
        masteryText.color = '#2ecc71';
      } else {
        masteryText.text = 'New word!';
        masteryText.color = '#f39c12';
      }
      masteryText.fontSize = 10;
      masteryText.fontWeight = 'bold';
      masteryText.width = '30%';
      masteryText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      langRow.addControl(masteryText);
    }

    // Row 2: Description (or refusal notice)
    const descText = new GUI.TextBlock(`${uid}_desc`);
    descText.text = merchantRefuses
      ? `${this.merchantConfig?.merchantName || 'Merchant'} doesn't deal in ${item.type} items`
      : (item.description || '');
    descText.fontSize = 10;
    descText.color = merchantRefuses ? '#AA4444' : '#999';
    descText.height = '16px';
    descText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cardStack.addControl(descText);

    // Row 2.5: Quantity controls (only for stackable items)
    if (isStackable && !merchantRefuses) {
      const qtyRow = new GUI.StackPanel(`${uid}_qtyRow`);
      qtyRow.isVertical = false;
      qtyRow.width = '100%';
      qtyRow.height = '18px';
      cardStack.addControl(qtyRow);

      const qtyLabel = new GUI.TextBlock(`${uid}_qtyLabel`);
      qtyLabel.text = 'Qty:';
      qtyLabel.fontSize = 11;
      qtyLabel.color = '#AAA';
      qtyLabel.width = '30px';
      qtyLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      qtyRow.addControl(qtyLabel);

      const minusBtn = GUI.Button.CreateSimpleButton(`${uid}_minus`, '-');
      minusBtn.width = '22px';
      minusBtn.height = '16px';
      minusBtn.color = 'white';
      minusBtn.background = 'rgba(80, 80, 80, 0.8)';
      minusBtn.cornerRadius = 3;
      minusBtn.fontSize = 12;
      minusBtn.fontWeight = 'bold';
      minusBtn.onPointerUpObservable.add(() => {
        const cur = this.selectedQuantities.get(qtyKey) || 1;
        if (cur > 1) {
          this.selectedQuantities.set(qtyKey, cur - 1);
          this.refreshMerchantItems();
          this.refreshPlayerItems();
        }
      });
      qtyRow.addControl(minusBtn);

      const qtyText = new GUI.TextBlock(`${uid}_qtyVal`);
      qtyText.text = ` ${selectedQty} `;
      qtyText.fontSize = 12;
      qtyText.color = 'white';
      qtyText.fontWeight = 'bold';
      qtyText.width = '30px';
      qtyRow.addControl(qtyText);

      const plusBtn = GUI.Button.CreateSimpleButton(`${uid}_plus`, '+');
      plusBtn.width = '22px';
      plusBtn.height = '16px';
      plusBtn.color = 'white';
      plusBtn.background = 'rgba(80, 80, 80, 0.8)';
      plusBtn.cornerRadius = 3;
      plusBtn.fontSize = 12;
      plusBtn.fontWeight = 'bold';
      plusBtn.onPointerUpObservable.add(() => {
        const cur = this.selectedQuantities.get(qtyKey) || 1;
        if (cur < maxQty) {
          this.selectedQuantities.set(qtyKey, cur + 1);
          this.refreshMerchantItems();
          this.refreshPlayerItems();
        }
      });
      qtyRow.addControl(plusBtn);

      // Spacer
      const spacer = new GUI.TextBlock(`${uid}_spacer`);
      spacer.text = '';
      spacer.width = '60%';
      qtyRow.addControl(spacer);
    }

    // Intermediate/Advanced mode: typing input row for buy mode
    if (this.isLanguageMode && hasTranslation && translatedName &&
        this.languageDifficulty !== 'beginner' && mode === 'buy' && !merchantRefuses) {
      const inputRow = new GUI.StackPanel(`${uid}_inputRow`);
      inputRow.isVertical = false;
      inputRow.width = '100%';
      inputRow.height = '24px';
      cardStack.addControl(inputRow);

      const inputHint = new GUI.TextBlock(`${uid}_inputHint`);
      inputHint.text = 'Type: ';
      inputHint.fontSize = 11;
      inputHint.color = '#87CEEB';
      inputHint.width = '40px';
      inputHint.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      inputRow.addControl(inputHint);

      const inputField = new GUI.InputText(`${uid}_input`);
      inputField.width = '160px';
      inputField.height = '22px';
      inputField.color = 'white';
      inputField.background = 'rgba(40, 40, 60, 0.9)';
      inputField.focusedBackground = 'rgba(50, 50, 80, 0.9)';
      inputField.thickness = 1;
      inputField.fontSize = 12;
      inputField.placeholderText = this.languageDifficulty === 'advanced' ? '???' : translatedName.substring(0, 2) + '...';
      inputField.placeholderColor = '#555';

      const capturedTranslatedName = translatedName;
      const capturedItem = item;
      const capturedQtyKey = qtyKey;

      inputField.onKeyboardEventProcessedObservable.add((eventData) => {
        if (eventData && (eventData as KeyboardEvent).key === 'Enter') {
          const typed = inputField.text;
          if (this.fuzzyMatch(typed, capturedTranslatedName)) {
            // Correct! Execute purchase
            const qty = this.selectedQuantities.get(capturedQtyKey) || 1;
            this.executeTransaction('buy', capturedItem, qty, capturedItem.buyPrice * qty,
              { typedWord: typed, targetWord: capturedTranslatedName });
            inputField.text = '';
          } else {
            this.showStatus(`Not quite! Try again... (hint: ${capturedTranslatedName})`, '#f39c12');
          }
        }
      });

      inputRow.addControl(inputField);

      const submitBtn = GUI.Button.CreateSimpleButton(`${uid}_submit`, 'OK');
      submitBtn.width = '35px';
      submitBtn.height = '22px';
      submitBtn.color = 'white';
      submitBtn.background = 'rgba(40, 120, 40, 0.9)';
      submitBtn.cornerRadius = 3;
      submitBtn.fontSize = 11;
      submitBtn.fontWeight = 'bold';
      submitBtn.onPointerUpObservable.add(() => {
        const typed = inputField.text;
        if (this.fuzzyMatch(typed, capturedTranslatedName)) {
          const qty = this.selectedQuantities.get(capturedQtyKey) || 1;
          this.executeTransaction('buy', capturedItem, qty, capturedItem.buyPrice * qty,
            { typedWord: typed, targetWord: capturedTranslatedName });
          inputField.text = '';
        } else {
          this.showStatus(`Not quite! Try again... (hint: ${capturedTranslatedName})`, '#f39c12');
        }
      });
      inputRow.addControl(submitBtn);
    }

    // Row 3: Price + action button
    const canAfford = mode === 'buy' ? this.playerGold >= totalPrice : true;
    const merchantCanAfford = mode === 'sell'
      ? (this.merchantConfig?.goldReserve || 0) >= totalPrice
      : true;
    const canTransact = canAfford && merchantCanAfford && !merchantRefuses;

    // In intermediate+ language mode for buy, the typing input IS the buy action
    const hasTypingInput = this.isLanguageMode && hasTranslation &&
      this.languageDifficulty !== 'beginner' && mode === 'buy' && !merchantRefuses;

    const bottomRow = new GUI.StackPanel(`${uid}_bottomRow`);
    bottomRow.isVertical = false;
    bottomRow.width = '100%';
    bottomRow.height = '26px';
    cardStack.addControl(bottomRow);

    const priceText = new GUI.TextBlock(`${uid}_price`);
    if (merchantRefuses) {
      priceText.text = 'N/A';
      priceText.color = '#666';
    } else {
      const qtyStr = selectedQty > 1 ? ` (${unitPrice}g x${selectedQty})` : '';
      priceText.text = `${totalPrice}g${qtyStr}`;
      priceText.color = canTransact ? '#FFD700' : '#FF4444';
    }
    priceText.fontSize = 14;
    priceText.fontWeight = 'bold';
    priceText.width = '70%';
    priceText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bottomRow.addControl(priceText);

    // In beginner mode or sell mode or no translation: show standard Buy/Sell button
    if (!hasTypingInput) {
      const actionBtn = GUI.Button.CreateSimpleButton(
        `${uid}_btn`,
        merchantRefuses ? 'Refused' : (mode === 'buy' ? 'Buy' : 'Sell')
      );
      actionBtn.width = '65px';
      actionBtn.height = '24px';
      actionBtn.color = merchantRefuses ? '#666' : 'white';
      actionBtn.cornerRadius = 4;
      actionBtn.fontSize = 12;
      actionBtn.fontWeight = 'bold';

      if (merchantRefuses) {
        actionBtn.background = 'rgba(50, 50, 50, 0.5)';
      } else if (mode === 'buy') {
        actionBtn.background = canAfford ? 'rgba(40, 120, 40, 0.9)' : 'rgba(80, 80, 80, 0.5)';
      } else {
        actionBtn.background = merchantCanAfford ? 'rgba(40, 80, 150, 0.9)' : 'rgba(80, 80, 80, 0.5)';
      }

      if (canTransact) {
        actionBtn.onPointerUpObservable.add(() => {
          const qty = this.selectedQuantities.get(qtyKey) || 1;
          this.executeTransaction(mode, item, qty, unitPrice * qty);
        });
      } else if (!merchantRefuses) {
        // Show reason on click
        actionBtn.onPointerUpObservable.add(() => {
          if (mode === 'buy' && !canAfford) {
            const noGoldMsg = this.getMerchantResponse('noGold');
            if (noGoldMsg) {
              this.showStatus(`${this.merchantConfig?.merchantName}: "${noGoldMsg}" (Need ${totalPrice}g)`, '#FF4444');
            } else {
              this.showStatus(`Insufficient gold! Need ${totalPrice}g, have ${this.playerGold}g`, '#FF4444');
            }
          } else if (mode === 'sell' && !merchantCanAfford) {
            this.showStatus(`Merchant can't afford ${totalPrice}g (has ${this.merchantConfig?.goldReserve || 0}g)`, '#FF4444');
          }
        });
      }

      bottomRow.addControl(actionBtn);
    }

    return card;
  }

  private executeTransaction(
    type: 'buy' | 'sell',
    item: ShopItem,
    quantity: number,
    totalPrice: number,
    typedPurchase?: { typedWord: string; targetWord: string }
  ): void {
    const transaction: ShopTransaction = {
      type, item, quantity, totalPrice,
      merchantId: this.merchantConfig?.merchantId,
      merchantName: this.merchantConfig?.merchantName,
      businessType: this.merchantConfig?.businessType,
      typedInTargetLanguage: !!typedPurchase,
      typedWord: typedPurchase?.typedWord,
      targetWord: typedPurchase?.targetWord,
    };

    if (type === 'buy') {
      if (this.playerGold < totalPrice) {
        const noGoldMsg = this.getMerchantResponse('noGold');
        if (noGoldMsg) {
          this.showStatus(`${this.merchantConfig?.merchantName}: "${noGoldMsg}" (Need ${totalPrice}g)`, '#FF4444');
        } else {
          this.showStatus(`Insufficient gold! Need ${totalPrice}g, have ${this.playerGold}g`, '#FF4444');
        }
        return;
      }

      this.playerGold -= totalPrice;
      if (this.merchantConfig) {
        this.merchantConfig.goldReserve += totalPrice;
        const shopItem = this.merchantConfig.items.find(i => i.id === item.id);
        if (shopItem) shopItem.stock -= quantity;
      }

      // Add item to player inventory
      const existing = this.playerItems.find(i => i.name === item.name && i.type === item.type);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.playerItems.push({
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          quantity,
          icon: item.icon,
          value: item.buyPrice,
          sellValue: item.sellPrice,
          tradeable: item.tradeable,
          effects: item.effects,
          category: item.category,
          rarity: item.rarity,
        });
      }

      if (this.onBuy) this.onBuy(transaction);

      // Language-learning feedback on purchase
      if (this.isLanguageMode) {
        const translatedName = this.getTranslatedName(item.name, item);
        if (translatedName) {
          // Track vocabulary
          if (this.languageConfig?.onVocabularyLearned) {
            this.languageConfig.onVocabularyLearned(
              translatedName,
              item.name,
              this.categorizeItemForVocab(item.type)
            );
          }

          const thanksMsg = this.getMerchantResponse('thanks');
          const qtyStr = quantity > 1 ? ` x${quantity}` : '';
          const vocabNote = `You bought ${translatedName} (${item.name})${qtyStr}`;
          if (thanksMsg) {
            this.showStatus(`${this.merchantConfig?.merchantName}: "${thanksMsg}" - ${vocabNote}`, '#90EE90');
          } else {
            this.showStatus(vocabNote, '#90EE90');
          }
        } else {
          const qtyStr = quantity > 1 ? ` x${quantity}` : '';
          this.showStatus(`Bought ${item.name}${qtyStr} for ${totalPrice}g`, '#90EE90');
        }
      } else {
        const qtyStr = quantity > 1 ? ` x${quantity}` : '';
        this.showStatus(`Bought ${item.name}${qtyStr} for ${totalPrice}g`, '#90EE90');
      }
    } else {
      if (this.merchantConfig && this.merchantConfig.goldReserve < totalPrice) {
        this.showStatus(`Merchant can't afford ${totalPrice}g!`, '#FF4444');
        return;
      }

      this.playerGold += totalPrice;
      if (this.merchantConfig) {
        this.merchantConfig.goldReserve -= totalPrice;
      }

      // Remove from player items
      const playerItem = this.playerItems.find(i => i.id === item.id);
      if (playerItem) {
        playerItem.quantity -= quantity;
        if (playerItem.quantity <= 0) {
          this.playerItems = this.playerItems.filter(i => i.id !== item.id);
        }
      }

      // Add stock back to merchant (if they sell this type)
      if (this.merchantConfig) {
        const merchantItem = this.merchantConfig.items.find(i => i.name === item.name);
        if (merchantItem) {
          merchantItem.stock += quantity;
        }
      }

      if (this.onSell) this.onSell(transaction);
      const qtyStr = quantity > 1 ? ` x${quantity}` : '';
      this.showStatus(`Sold ${item.name}${qtyStr} for ${totalPrice}g`, '#87CEEB');
    }

    // Reset quantity selection for this item
    this.selectedQuantities.delete(`${type}_${item.id}`);

    this.refreshMerchantItems();
    this.refreshPlayerItems();
    this.updateGoldDisplays();
  }

  /** Categorize item type to vocabulary category */
  private categorizeItemForVocab(itemType: ItemType): string {
    switch (itemType) {
      case 'food':
      case 'drink':
        return 'food';
      case 'weapon':
      case 'armor':
      case 'tool':
        return 'actions';
      default:
        return 'general';
    }
  }

  private updateGoldDisplays(): void {
    if (this.playerGoldText) {
      this.playerGoldText.text = `Gold: ${this.playerGold}`;
    }
    if (this.merchantGoldText && this.merchantConfig) {
      this.merchantGoldText.text = `Gold: ${this.merchantConfig.goldReserve}`;
    }
  }

  private showStatus(message: string, color: string): void {
    if (this.statusText) {
      this.statusText.text = message;
      this.statusText.color = color;
    }
  }

  private getItemColor(type: string): string {
    switch (type) {
      case 'quest': return '#FFD700';
      case 'weapon': return '#FF8C00';
      case 'armor': return '#B0C4DE';
      case 'consumable': return '#90EE90';
      case 'food': case 'drink': return '#DEB887';
      case 'material': return '#D2B48C';
      case 'tool': return '#C0C0C0';
      case 'key': return '#FF6347';
      case 'collectible': return '#87CEEB';
      default: return 'white';
    }
  }

  public getPlayerGold(): number {
    return this.playerGold;
  }

  public getPlayerItems(): InventoryItem[] {
    return this.playerItems;
  }

  public setOnBuy(callback: (transaction: ShopTransaction) => void): void {
    this.onBuy = callback;
  }

  public setOnSell(callback: (transaction: ShopTransaction) => void): void {
    this.onSell = callback;
  }

  public setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
    this.merchantItemsContainer = null;
    this.playerItemsContainer = null;
    this.activeInputField = null;
    this.languageConfig = null;
    this.itemTranslations.clear();
  }
}
