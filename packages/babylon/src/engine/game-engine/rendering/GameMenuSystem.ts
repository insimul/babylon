/**
 * GameMenuSystem - Unified fullscreen game menu
 *
 * Replaces individual toggle panels (P, N, X, L, Q, I, R, H) with a single
 * fullscreen overlay that has tabbed navigation, similar to AAA games like
 * The Witcher 3. Opens with ESC, closes with ESC or clicking the close button.
 *
 * Tabs: Character, Journal, Quests, Inventory, Map, Vocabulary, Skill Tree, Notice Board, Contact List, System
 *
 * HUD elements (minimap, health bar, energy/gold) remain always visible
 * and are NOT part of this menu system.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Container,
  Control,
  Ellipse,
  Grid,
  Image,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
  TextWrapping,
} from "@babylonjs/gui";

import type { ConversationRecord, VocabularyEntry, GrammarPattern } from '@shared/language/language-progress';
import { getItemTranslation } from '@shared/game-engine/rendering/OnboardingLauncher';
import type { MinimapData } from './BabylonGUIManager';
import { NotificationStore } from '../logic/NotificationStore';
import type { SkillTreeStats } from './BabylonSkillTreePanel';
import type { NoticeArticle } from './BabylonNoticeBoardPanel';
import type { PlayerAssessmentData } from '@shared/language/cefr';
import type { GameSaveState } from '@shared/game-engine/types';
import type { MainQuestChapter, ChapterProgress, CaseNote, InvestigationBoardData } from '@shared/quest/main-quest-chapters';
import type { PortfolioData } from '@shared/quest/portfolio-types';
import type { Clue, ClueCategory } from '../logic/ClueStore';
import { isDebugLabelsEnabled } from './DebugLabelUtils';
import {
  SKILL_TIERS,
  createDefaultSkillTreeState,
  updateSkillProgress,
  type SkillTreeState,
} from '@shared/language/language-skill-tree';
import {
  createGuildSkillTrees,
  updateGuildSkillProgress,
  computeGuildStats,
  type GuildSkillTreeEntry,
  type GuildSkillStats,
} from '@shared/guild-skill-tree';
import { GUILD_DEFINITIONS, type GuildId } from '@shared/guild-definitions';
import type { ImmersionProgressData } from '@shared/language/ui-localization';
import { MARKER_STYLES, type QuestMarkerKind } from '@shared/game-engine/logic/QuestMarkerService';

// ─── Data interfaces ────────────────────────────────────────────────────────

export interface MenuPlayerData {
  name: string;
  energy: number;
  maxEnergy: number;
  status: string;
  gold: number;
  level?: number;
}

export interface MenuReputationData {
  settlementName: string;
  score: number;
  standing: string;
  isBanned: boolean;
  violationCount: number;
  outstandingFines: number;
}

export interface MenuQuestObjective {
  type: string;
  description: string;
  completed?: boolean;
  current?: number;
  required?: number;
  target?: string;
}

export interface MenuQuestData {
  id: string;
  title: string;
  description: string;
  status: string;
  questType: string;
  difficulty: string;
  progress: Record<string, any> | null;
  objectives?: MenuQuestObjective[];
  experienceReward?: number;
  assignedBy?: string | null;
  assignedByCharacterId?: string | null;
  discoveryMethod?: string | null;
  targetLanguage?: string;
  tags?: string[] | null;
}

export interface MenuInventoryItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  quantity: number;
  icon?: string;
  translations?: Record<string, {
    targetWord: string;
    pronunciation: string;
    category: string;
  }>;
}

export interface MenuRuleData {
  id: string;
  name: string;
  description?: string;
  ruleType: string;
  category?: string;
  priority?: number;
  isActive?: boolean;
  isBase?: boolean;
}

export interface MenuWorldData {
  worldName: string;
  countries: number;
  settlements: number;
  characters: number;
  rules: number;
  baseRules: number;
  actions: number;
  baseActions: number;
  quests: number;
  enabledModules?: string[];
  gameType?: string;
}

export interface MenuNPCData {
  id: string;
  name: string;
  occupation?: string;
  disposition?: string;
  questGiver: boolean;
  role?: string;
  distance?: number;
}

export interface MenuContactData {
  id: string;
  name: string;
  occupation?: string;
  disposition?: string;
  role?: string;
  questGiver: boolean;
  conversationCount: number;
  lastSpokenTimestamp: number;
  knownDetails: string[];
}

export interface MenuSettlementData {
  id: string;
  name: string;
  type: string;
  population: number;
  businesses: number;
  residences: number;
  lots: number;
  buildingCount: number;
  terrain?: string;
}

export interface MenuMapData {
  settlements: Array<{
    id: string;
    name: string;
    position: { x: number; z: number };
    type: string;
    zoneType: string;
    buildingCount?: number;
  }>;
  playerPosition: { x: number; z: number };
  worldSize: number;
}

export interface MenuPhotoLabel {
  name: string;
  category: string;
  activity?: string;
  x: number;
  y: number;
}

export interface MenuPhotoData {
  id: string;
  thumbnail: string;
  imageData: string;
  takenAt: string;
  locationName: string;
  favorite: boolean;
  labelCount: number;
  labels: MenuPhotoLabel[];
  caption?: string;
}

export interface PhotoQuestObjective {
  questId: string;
  questTitle: string;
  objectiveDescription: string;
  targetSubject?: string;
  targetCategory?: string;
  targetActivity?: string;
  currentCount: number;
  requiredCount: number;
  completed: boolean;
}

export interface SaveSlotInfo {
  slotIndex: number;
  savedAt: string;
  gameTime: number;
  zoneName?: string;
  playerGold?: number;
  playerHealth?: number;
  playerEnergy?: number;
  inventoryCount?: number;
  questCount?: number;
  playerLevel?: number;
}

export interface PlaythroughInfo {
  id: string;
  name: string;
  status: string;
  playtime: number;
  actionsCount: number;
  createdAt: string;
  lastPlayedAt?: string;
}

/** Callback interface for requesting data and dispatching actions from the menu */
export interface MenuJournalChapter {
  chapter: MainQuestChapter;
  progress: ChapterProgress;
  completionPercent: number;
  cefrMet: boolean;
}

export interface MenuJournalData {
  currentChapterId: string | null;
  totalXPEarned: number;
  chapters: MenuJournalChapter[];
  playerCefrLevel: string | null;
  /** Next periodic assessment milestone level (null if all completed) */
  nextPeriodicAssessmentLevel: number | null;
  /** Whether a periodic assessment is currently available (pending accept) */
  periodicAssessmentAvailable: boolean;
  /** Investigation board summary data */
  investigationBoard?: InvestigationBoardData | null;
  /** Case notes from the investigation (newest first) */
  caseNotes?: CaseNote[];
  /** Narrative history per chapter — for Story So Far recap */
  narrativeHistory?: Array<{
    chapterId: string;
    chapterNumber: number;
    title: string;
    introNarrative?: string;
    outroNarrative?: string;
    mysteryDetails?: string;
  }>;
}

export interface ChapterClueGroup {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  clues: Clue[];
}

export interface MenuClueData {
  clues: Clue[];
  clueCount: number;
  totalClueCount: number;
  connections: Array<[string, string]>;
  /** Clues organized by narrative chapter for the journal view */
  cluesByChapter?: ChapterClueGroup[];
}

export interface GameMenuCallbacks {
  getPlayerData: () => MenuPlayerData | null;
  getReputations: () => MenuReputationData[];
  getQuests: () => MenuQuestData[];
  getInventoryItems: () => MenuInventoryItem[];
  getRules: () => MenuRuleData[];
  getWorldData: () => MenuWorldData | null;
  getNPCs: () => MenuNPCData[];
  getSettlements: () => MenuSettlementData[];
  getMapData: () => MenuMapData | null;
  getMinimapData?: () => MinimapData | null;
  getWorldSnapshot?: () => HTMLCanvasElement | null;
  // Language learning panel data
  getVocabularyData?: () => { vocabulary: VocabularyEntry[]; grammarPatterns: GrammarPattern[]; overallFluency: number; totalCorrectUsages: number; dueForReview: VocabularyEntry[] } | null;
  getConversationHistory?: () => ConversationRecord[];
  getSkillTreeStats?: () => SkillTreeStats | null;
  getGuildQuestData?: () => Array<{ guildId?: string; guildTier?: number; status?: string }>;
  getNoticeArticles?: () => { articles: NoticeArticle[]; playerFluency: number };
  fetchServerTexts?: () => Promise<NoticeArticle[]>;
  getAssessmentData?: () => { data: PlayerAssessmentData | null; playerLevel: number };
  onNoticeWordClicked?: (word: string, meaning: string) => void;
  onNoticeQuestionAnswered?: (correct: boolean, articleId: string, selectedIndex: number, correctIndex: number) => void;
  onReadingCompleted?: (articleId: string, title: string) => void;
  onQuestionsAnswered?: (articleId: string, questionsCorrect: number, questionsTotal: number) => void;
  getAnsweredArticleIds?: () => Set<string>;
  onVocabWordSpeak?: (word: string) => void;
  getPhotos?: () => MenuPhotoData[];
  onDeletePhoto?: (photoId: string) => void;
  onTogglePhotoFavorite?: (photoId: string) => void;
  getPhotoQuestObjectives?: () => PhotoQuestObjective[];
  getContacts?: () => MenuContactData[];
  onNPCSelected?: (npcId: string) => void;
  onNPCCalled?: (npcId: string) => void;
  onQuestSetActive?: (questId: string) => void;
  onPayFines?: () => void;
  onBackToEditor?: () => void;
  onToggleFullscreen?: () => void;
  onToggleDebug?: () => void;
  onToggleVR?: () => void;
  /** Current AI provider: 'auto' | 'browser' | 'server' */
  getAIProvider?: () => string;
  /** Change AI provider */
  onSetAIProvider?: (provider: string) => void;
  /** Current voice input mode: 'push-to-talk' | 'auto-listen' */
  getVoiceInputMode?: () => string;
  /** Change voice input mode */
  onSetVoiceInputMode?: (mode: string) => void;
  /** Current UI language immersion mode: 'auto' | 'english_only' | 'maximum' */
  getUIImmersionMode?: () => string;
  /** Change UI language immersion mode */
  onSetUIImmersionMode?: (mode: string) => void;
  /** Get immersion progress data for the settings progress indicator */
  getImmersionProgress?: () => ImmersionProgressData | null;
  onToggleModule?: (moduleId: string, enabled: boolean) => void;
  getSaveSlots?: () => Promise<Array<SaveSlotInfo | null>>;
  onSaveGame?: (slotIndex: number) => Promise<boolean>;
  onLoadGame?: (slotIndex: number) => Promise<boolean>;
  onDeleteSave?: (slotIndex: number) => Promise<boolean>;
  getJournalData?: () => MenuJournalData | null;
  getClueData?: () => MenuClueData | null;
  onToggleClueFollowedUp?: (clueId: string) => void;
  getPortfolioData?: () => PortfolioData | null;
  // Playthrough management
  getPlaythroughInfo?: () => PlaythroughInfo | null;
  onRenamePlaythrough?: (newName: string) => Promise<boolean>;
  onPausePlaythrough?: () => Promise<void>;
  onAbandonPlaythrough?: () => Promise<void>;
  onDeletePlaythrough?: () => Promise<void>;
  onReturnToMainMenu?: () => void;
  onQuitGame?: () => void;
  // Crafting
  getCraftingRecipes?: () => Array<{ id: string; name: string; category: string; ingredients: Array<{ name: string; required: number; available: number }>; canCraft: boolean; outputName: string; outputQuantity: number }>;
  onCraftItem?: (recipeId: string) => void;
  // Rest / time-skip
  getTimeData?: () => { timeString: string; day: number; timeOfDay: string; timeScale?: number; paused?: boolean } | null;
  onRest?: (hours: number) => void;
  onTimeSpeedChange?: (delta: number) => void;
  onTimePauseToggle?: () => void;
}

export type MenuTab =
  | "character"
  | "rest"
  | "journal"
  | "clues"
  | "quests"
  | "inventory"
  | "crafting"
  | "map"
  | "photos"
  | "vocabulary"
  | "skills"
  | "notices"
  | "contacts"
  | "notifications"
  | "system";

interface TabDef {
  id: MenuTab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "character", label: "Character", icon: "👤" },
  { id: "rest", label: "Rest", icon: "🛏️" },
  { id: "journal", label: "Journal", icon: "📖" },
  { id: "clues", label: "Clues", icon: "🔎" },
  { id: "quests", label: "Quests", icon: "📜" },
  { id: "inventory", label: "Inventory", icon: "🎒" },
  { id: "crafting", label: "Crafting", icon: "🔨" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "photos", label: "Photos", icon: "📷" },
  { id: "vocabulary", label: "Knowledge", icon: "📚" },
  { id: "skills", label: "Skill Tree", icon: "🌳" },
  { id: "notices", label: "Library", icon: "🏛️" },
  { id: "contacts", label: "Contact List", icon: "📱" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "system", label: "System", icon: "⚙️" },
];

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "rgba(12, 12, 18, 0.96)",
  sidebarBg: "rgba(18, 18, 28, 0.98)",
  tabIdle: "rgba(255, 255, 255, 0.06)",
  tabHover: "rgba(255, 255, 255, 0.12)",
  tabActive: "rgba(66, 133, 244, 0.35)",
  tabActiveBorder: "#4285F4",
  headerBg: "rgba(255, 255, 255, 0.04)",
  cardBg: "rgba(255, 255, 255, 0.05)",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#E8EAED",
  textSecondary: "#9AA0A6",
  textMuted: "#5F6368",
  accent: "#4285F4",
  accentGreen: "#34A853",
  accentYellow: "#FBBC04",
  accentRed: "#EA4335",
  gold: "#FFD700",
  divider: "rgba(255, 255, 255, 0.08)",
};

// ─── Main class ─────────────────────────────────────────────────────────────

export class GameMenuSystem {
  private advancedTexture: AdvancedDynamicTexture;
  private callbacks: GameMenuCallbacks;

  // Root overlay
  private overlay: Rectangle | null = null;
  private sidebarPanel: Rectangle | null = null;
  private contentPanel: Rectangle | null = null;
  private tabButtons: Map<MenuTab, Button> = new Map();

  // State
  private _isOpen = false;
  private activeTab: MenuTab = "character";
  private skillTreeState: SkillTreeState = createDefaultSkillTreeState();
  private guildSkillTrees: GuildSkillTreeEntry[] = createGuildSkillTrees();
  private answeredNoticeQuestions: Set<string> = new Set();
  private noticeShowTranslations: boolean = true;
  private libraryActiveCategory: string = 'all';
  private libraryReadingArticle: NoticeArticle | null = null;
  private libraryReadArticleIds: Set<string> = new Set();
  private libraryPageSize: number = 15;
  private libraryVisibleCount: number = 15;
  private libraryServerTexts: NoticeArticle[] = [];
  private libraryServerTextsLoading: boolean = false;
  private libraryServerTextsFetched: boolean = false;

  // Language-learning
  private targetLanguage: string = 'Spanish';

  // Save/Load state
  private systemSubView: 'main' | 'save' | 'load' | 'playthrough' = 'main';
  private saveSlotCache: Array<SaveSlotInfo | null> = [null, null, null];
  private saveLoadBusy = false;

  // Playthrough management state
  private playthroughRenameBusy = false;

  // Clues tab state
  private cluesFilterCategory: ClueCategory | 'all' = 'all';

  // Photos tab state
  private selectedPhotoId: string | null = null;

  // Vocabulary tab state
  private vocabSubTab: 'vocabulary' | 'grammar' = 'vocabulary';
  private vocabSortMode: 'mastery' | 'alpha' | 'recent' | 'used' | 'review' = 'mastery';
  private vocabCategoryFilter: string = 'all';

  // Rest tab time display (live-updated)
  private _menuTimeText: TextBlock | null = null;
  private _menuDayText: TextBlock | null = null;
  private _menuTodText: TextBlock | null = null;

  // Callbacks for game state management
  private onMenuOpened: (() => void) | null = null;
  private onMenuClosed: (() => void) | null = null;

  constructor(
    advancedTexture: AdvancedDynamicTexture,
    callbacks: GameMenuCallbacks
  ) {
    this.advancedTexture = advancedTexture;
    this.callbacks = callbacks;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  public setTargetLanguage(language: string): void {
    this.targetLanguage = language;
  }

  /** Get the set of article IDs the player has opened/read this session. */
  public getReadArticleIds(): Set<string> {
    return this.libraryReadArticleIds;
  }

  /** Restore read article IDs from saved state (e.g., after load). */
  public restoreReadArticleIds(ids: string[]): void {
    this.libraryReadArticleIds = new Set(ids);
  }

  /** Get the set of article IDs with answered comprehension questions. */
  public getAnsweredQuestionIds(): Set<string> {
    return this.answeredNoticeQuestions;
  }

  /** Restore answered question IDs from saved state (e.g., after load). */
  public restoreAnsweredQuestionIds(ids: string[]): void {
    this.answeredNoticeQuestions = new Set(ids);
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(tab?: MenuTab): void {
    if (!this.overlay) {
      this.buildUI();
    }
    if (tab) {
      this.activeTab = tab;
    }
    this.overlay!.isVisible = true;
    this._isOpen = true;
    this.refreshActiveTab();
    this.updateTabHighlights();
    this.onMenuOpened?.();
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.isVisible = false;
    }
    this._isOpen = false;
    this.onMenuClosed?.();
  }

  public setOnMenuOpened(cb: () => void): void {
    this.onMenuOpened = cb;
  }

  public setOnMenuClosed(cb: () => void): void {
    this.onMenuClosed = cb;
  }

  public dispose(): void {
    if (this.overlay) {
      this.advancedTexture.removeControl(this.overlay);
      this.overlay.dispose();
      this.overlay = null;
    }
    this.tabButtons.clear();
    this._menuTimeText = null;
    this._menuDayText = null;
    this._menuTodText = null;
  }

  private static readonly TOD_ICONS: Record<string, string> = {
    dawn: '🌅', morning: '☀️', midday: '🌞',
    afternoon: '🌤️', evening: '🌇', night: '🌙',
  };

  /** Called from the render loop to live-update time display when menu is open on the Rest tab */
  public updateTime(timeString: string, day: number, timeOfDay: string): void {
    if (!this._isOpen || this.activeTab !== 'rest') return;
    if (this._menuTimeText) this._menuTimeText.text = timeString;
    if (this._menuDayText) this._menuDayText.text = `Day ${day}`;
    if (this._menuTodText) this._menuTodText.text = GameMenuSystem.TOD_ICONS[timeOfDay] ?? '☀️';
  }

  // ─── Build UI ───────────────────────────────────────────────────────────

  private buildUI(): void {
    // Full-screen semi-transparent overlay
    this.overlay = new Rectangle("gameMenuOverlay");
    this.overlay.width = 1;
    this.overlay.height = 1;
    this.overlay.background = COLORS.bg;
    this.overlay.thickness = 0;
    this.overlay.isVisible = false;
    this.overlay.zIndex = 100;
    this.advancedTexture.addControl(this.overlay);

    // ── Inner frame (centered, with some padding from edges) ──
    const frame = new Rectangle("menuFrame");
    frame.width = "94%";
    frame.height = "92%";
    frame.thickness = 0;
    frame.background = "transparent";
    this.overlay.addControl(frame);

    // Use a Grid to split into sidebar (200px fixed) and content (remaining)
    const grid = new Grid("menuGrid");
    grid.width = 1;
    grid.height = 1;
    grid.addColumnDefinition(165, true);  // Sidebar: fixed width
    grid.addColumnDefinition(1);          // Content: remaining space
    grid.addRowDefinition(1);             // Single row
    frame.addControl(grid);

    // ── Sidebar (left column) ──
    this.sidebarPanel = new Rectangle("menuSidebar");
    this.sidebarPanel.width = 1;
    this.sidebarPanel.height = 1;
    this.sidebarPanel.background = COLORS.sidebarBg;
    this.sidebarPanel.thickness = 0;
    grid.addControl(this.sidebarPanel, 0, 0);

    this.buildSidebar();

    // ── Content area (right column) ──
    this.contentPanel = new Rectangle("menuContent");
    this.contentPanel.width = 1;
    this.contentPanel.height = 1;
    this.contentPanel.background = "transparent";
    this.contentPanel.thickness = 0;
    grid.addControl(this.contentPanel, 0, 1);

    // ── Close button (top-right) ──
    const closeBtn = Button.CreateSimpleButton("menuCloseBtn", "✕");
    closeBtn.width = "36px";
    closeBtn.height = "36px";
    closeBtn.color = COLORS.textSecondary;
    closeBtn.background = "transparent";
    closeBtn.thickness = 0;
    closeBtn.fontSize = 18;
    closeBtn.cornerRadius = 18;
    closeBtn.top = "9px";
    closeBtn.left = "-15px";
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.onPointerClickObservable.add(() => this.close());
    closeBtn.onPointerEnterObservable.add(() => {
      closeBtn.color = COLORS.textPrimary;
      closeBtn.background = COLORS.tabHover;
    });
    closeBtn.onPointerOutObservable.add(() => {
      closeBtn.color = COLORS.textSecondary;
      closeBtn.background = "transparent";
    });
    this.overlay.addControl(closeBtn);

    // ── ESC hint (bottom center) ──
    const escHint = new TextBlock("escHint");
    escHint.text = "Press M to close";
    escHint.color = COLORS.textMuted;
    escHint.fontSize = 12;
    escHint.height = "24px";
    escHint.top = "-12px";
    escHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.overlay.addControl(escHint);
  }

  private buildSidebar(): void {
    if (!this.sidebarPanel) return;

    const stack = new StackPanel("sidebarStack");
    stack.width = "90%";
    stack.top = "14px";
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.sidebarPanel.addControl(stack);

    // Title
    const title = new TextBlock("menuTitle");
    title.text = "GAME MENU";
    title.color = COLORS.textSecondary;
    title.fontSize = 12;
    title.fontWeight = "bold";
    title.height = "24px";
    title.paddingLeft = "17px";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(title);

    // Spacer
    const spacer = new Rectangle("sidebarSpacer1");
    spacer.width = 1;
    spacer.height = "6px";
    spacer.thickness = 0;
    spacer.background = "transparent";
    stack.addControl(spacer);

    // Tab buttons
    TABS.forEach((tab) => {
      const btn = Button.CreateSimpleButton(`tab_${tab.id}`, `  ${tab.icon}  ${tab.label}`);
      btn.width = "100%";
      btn.height = "29px";
      btn.color = COLORS.textPrimary;
      btn.background = COLORS.tabIdle;
      btn.fontSize = 12;
      btn.thickness = 0;
      btn.cornerRadius = 5;
      btn.paddingTop = "2px";
      btn.paddingBottom = "2px";
      btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      // Left-align text
      if (btn.textBlock) {
        btn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        btn.textBlock.paddingLeft = "11px";
      }

      btn.onPointerClickObservable.add(() => {
        this.activeTab = tab.id;
        this.selectedPhotoId = null;
        this.refreshActiveTab();
        this.updateTabHighlights();
      });

      btn.onPointerEnterObservable.add(() => {
        if (this.activeTab !== tab.id) {
          btn.background = COLORS.tabHover;
        }
      });

      btn.onPointerOutObservable.add(() => {
        if (this.activeTab !== tab.id) {
          btn.background = COLORS.tabIdle;
        }
      });

      stack.addControl(btn);
      this.tabButtons.set(tab.id, btn);
    });
  }

  private updateTabHighlights(): void {
    this.tabButtons.forEach((btn, tabId) => {
      if (tabId === this.activeTab) {
        btn.background = COLORS.tabActive;
        btn.color = "#fff";
        // Simulate left border accent by using thickness
        (btn as any).thickness = 0;
      } else {
        btn.background = COLORS.tabIdle;
        btn.color = COLORS.textPrimary;
        (btn as any).thickness = 0;
      }
    });
  }

  // ─── Tab content rendering ──────────────────────────────────────────────

  private refreshActiveTab(): void {
    if (!this.contentPanel) return;

    // Clear old content
    this.contentPanel.children.slice().forEach((c) => {
      this.contentPanel!.removeControl(c);
      c.dispose();
    });

    switch (this.activeTab) {
      case "character":
        this.renderCharacterTab();
        break;
      case "rest":
        this.renderRestTab();
        break;
      case "journal":
        this.renderJournalTab();
        break;
      case "clues":
        this.renderCluesTab();
        break;
      case "quests":
        this.renderQuestsTab();
        break;
      case "inventory":
        this.renderInventoryTab();
        break;
      case "crafting":
        this.renderCraftingTab();
        break;
      case "map":
        this.renderMapTab();
        break;
      case "photos":
        this.renderPhotosTab();
        break;
      case "vocabulary":
        this.renderVocabularyTab();
        break;
      case "skills":
        this.renderSkillsTab();
        break;
      case "notices":
        this.renderNoticesTab();
        break;
      case "contacts":
        this.renderContactsTab();
        break;
      case "notifications":
        this.renderNotificationsTab();
        break;
      case "system":
        this.renderSystemTab();
        break;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private makeScrollableContent(name: string): { scroll: ScrollViewer; stack: StackPanel } {
    // Clear any existing content to prevent overlapping renders
    if (this.contentPanel) {
      this.contentPanel.children.slice().forEach((c) => {
        this.contentPanel!.removeControl(c);
        c.dispose();
      });
    }

    const scroll = new ScrollViewer(`${name}_scroll`);
    scroll.width = 1;
    scroll.height = "95%";
    scroll.top = "15px";
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.thickness = 0;
    scroll.barSize = 8;
    scroll.barColor = COLORS.textMuted;
    this.contentPanel!.addControl(scroll);

    const stack = new StackPanel(`${name}_stack`);
    stack.width = "90%";
    stack.left = "15px";
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    scroll.addControl(stack);

    // Top spacer inside stack (since padding/top offset clips inside ScrollViewer)
    const topSpacer = new Rectangle(`${name}_topSpacer`);
    topSpacer.height = "10px";
    topSpacer.thickness = 0;
    topSpacer.background = "transparent";
    stack.addControl(topSpacer);

    return { scroll, stack };
  }

  private addSectionHeader(parent: StackPanel, text: string): void {
    const header = new TextBlock();
    header.text = text;
    header.color = COLORS.textPrimary;
    header.fontSize = 18;
    header.fontWeight = "bold";
    header.height = "33px";
    header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(header);
  }

  private addSubHeader(parent: StackPanel, text: string): void {
    const sub = new TextBlock();
    sub.text = text;
    sub.color = COLORS.textSecondary;
    sub.fontSize = 12;
    sub.height = "30px";
    sub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sub.paddingBottom = "11px";
    parent.addControl(sub);
  }

  private addDivider(parent: StackPanel): void {
    const line = new Rectangle();
    line.width = 1;
    line.height = "2px";
    line.background = COLORS.divider;
    line.thickness = 0;
    line.paddingTop = "6px";
    line.paddingBottom = "6px";
    parent.addControl(line);

    const spacer = new Rectangle();
    spacer.width = 1;
    spacer.height = "11px";
    spacer.thickness = 0;
    spacer.background = "transparent";
    parent.addControl(spacer);
  }

  /**
   * Render a horizontal tab bar with positioned tab buttons.
   * Returns the selected tab id.
   */
  private renderTabBar<T extends string>(
    parent: StackPanel,
    tabs: Array<{ id: T; label: string; count?: number; color?: string }>,
    activeId: T,
    onSelect: (id: T) => void,
    tabWidth: number = 110,
  ): void {
    const tabRow = new Rectangle();
    tabRow.width = 1;
    tabRow.height = "32px";
    tabRow.thickness = 0;
    tabRow.background = "transparent";
    parent.addControl(tabRow);

    for (let t = 0; t < tabs.length; t++) {
      const tab = tabs[t];
      const isActive = activeId === tab.id;
      const tabBtn = new Rectangle();
      tabBtn.width = `${tabWidth}px`;
      tabBtn.height = "28px";
      tabBtn.left = `${t * tabWidth}px`;
      tabBtn.background = isActive ? "rgba(255,255,255,0.12)" : "transparent";
      tabBtn.thickness = 0;
      tabBtn.cornerRadius = 4;
      tabBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      tabBtn.isPointerBlocker = true;
      tabBtn.hoverCursor = "pointer";

      const labelText = tab.count != null ? `${tab.label} (${tab.count})` : tab.label;
      const tabLabel = new TextBlock();
      tabLabel.text = labelText;
      tabLabel.color = isActive ? (tab.color || COLORS.accent) : COLORS.textMuted;
      tabLabel.fontSize = 12;
      tabLabel.fontWeight = isActive ? "bold" : "normal";
      tabBtn.addControl(tabLabel);

      if (!isActive) {
        tabBtn.onPointerEnterObservable.add(() => { tabBtn.background = "rgba(255,255,255,0.06)"; });
        tabBtn.onPointerOutObservable.add(() => { tabBtn.background = "transparent"; });
      }
      tabBtn.onPointerClickObservable.add(() => onSelect(tab.id));

      tabRow.addControl(tabBtn);
    }

    // Separator line
    const sep = new Rectangle();
    sep.width = 1;
    sep.height = "1px";
    sep.background = "rgba(255,255,255,0.1)";
    sep.thickness = 0;
    parent.addControl(sep);
  }

  private makeCard(parent: StackPanel, height?: string): StackPanel {
    const card = new Rectangle();
    card.width = 1;
    card.height = height || "auto";
    card.adaptHeightToChildren = !height;
    card.background = COLORS.cardBg;
    card.color = COLORS.cardBorder;
    card.thickness = 1;
    card.cornerRadius = 6;
    card.paddingBottom = "6px";
    parent.addControl(card);

    const inner = new StackPanel();
    inner.width = "100%";
    inner.paddingTop = "11px";
    inner.paddingBottom = "11px";
    inner.paddingLeft = "14px";
    inner.paddingRight = "14px";
    card.addControl(inner);

    return inner;
  }

  private addStatRow(parent: StackPanel, label: string, value: string, valueColor?: string): void {
    const row = new Rectangle();
    row.width = 1;
    row.height = "23px";
    row.thickness = 0;
    row.background = "transparent";
    parent.addControl(row);

    const lbl = new TextBlock();
    lbl.text = label;
    lbl.color = COLORS.textSecondary;
    lbl.fontSize = 12;
    lbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    lbl.paddingLeft = "5px";
    row.addControl(lbl);

    const val = new TextBlock();
    val.text = value;
    val.color = valueColor || COLORS.textPrimary;
    val.fontSize = 12;
    val.fontWeight = "bold";
    val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    val.paddingRight = "5px";
    row.addControl(val);
  }

  private addProgressBar(
    parent: StackPanel,
    current: number,
    max: number,
    color: string,
    label?: string
  ): void {
    const barOuter = new Rectangle();
    barOuter.width = 1;
    barOuter.height = "18px";
    barOuter.background = "rgba(255,255,255,0.06)";
    barOuter.cornerRadius = 3;
    barOuter.thickness = 0;
    barOuter.paddingBottom = "5px";
    parent.addControl(barOuter);

    const pct = Math.max(0, Math.min(1, current / max));
    const barFill = new Rectangle();
    barFill.width = pct;
    barFill.height = 1;
    barFill.background = color;
    barFill.cornerRadius = 3;
    barFill.thickness = 0;
    barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barOuter.addControl(barFill);

    if (label) {
      const txt = new TextBlock();
      txt.text = label;
      txt.color = "#fff";
      txt.fontSize = 12;
      barOuter.addControl(txt);
    }
  }

  // ─── REST TAB ──────────────────────────────────────────────────────────

  private renderRestTab(): void {
    const { stack } = this.makeScrollableContent("rest");

    this.addSectionHeader(stack, "Rest");
    this.addSubHeader(stack, "Take a break and let time pass");

    // Current time display
    this._menuTimeText = null;
    this._menuDayText = null;
    this._menuTodText = null;

    const timeData = this.callbacks.getTimeData?.();
    const timeCard = this.makeCard(stack);

    const timeRow = new StackPanel();
    timeRow.isVertical = false;
    timeRow.height = "34px";
    timeCard.addControl(timeRow);

    const todIcon = new TextBlock();
    todIcon.text = timeData ? (GameMenuSystem.TOD_ICONS[timeData.timeOfDay] ?? '☀️') : '☀️';
    todIcon.color = "white";
    todIcon.fontSize = 22;
    todIcon.width = "36px";
    todIcon.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    timeRow.addControl(todIcon);
    this._menuTodText = todIcon;

    const timeTxt = new TextBlock();
    timeTxt.text = timeData?.timeString ?? '08:00';
    timeTxt.color = COLORS.textPrimary;
    timeTxt.fontSize = 24;
    timeTxt.fontWeight = "bold";
    timeTxt.width = "90px";
    timeTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    timeRow.addControl(timeTxt);
    this._menuTimeText = timeTxt;

    const dayTxt = new TextBlock();
    dayTxt.text = timeData ? `Day ${timeData.day}` : 'Day 1';
    dayTxt.color = COLORS.textSecondary;
    dayTxt.fontSize = 15;
    dayTxt.width = "80px";
    dayTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    timeRow.addControl(dayTxt);
    this._menuDayText = dayTxt;

    this.addDivider(stack);

    // Rest duration picker (+/- stepper)
    const restCard = this.makeCard(stack);

    const restLabel = new TextBlock();
    restLabel.text = "How long would you like to rest?";
    restLabel.color = COLORS.textPrimary;
    restLabel.fontSize = 15;
    restLabel.height = "28px";
    restLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    restCard.addControl(restLabel);

    let restHours = 1;
    const MIN_HOURS = 1;
    const MAX_HOURS = 24;

    const stepperRow = new StackPanel();
    stepperRow.isVertical = false;
    stepperRow.height = "44px";
    restCard.addControl(stepperRow);

    const makeStepperBtn = (id: string, label: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(id, label);
      btn.width = "44px";
      btn.height = "38px";
      btn.color = "white";
      btn.background = COLORS.accent;
      btn.cornerRadius = 5;
      btn.fontSize = 20;
      btn.fontWeight = "bold";
      btn.onPointerEnterObservable.add(() => { btn.background = "#5A9CF5"; });
      btn.onPointerOutObservable.add(() => { btn.background = COLORS.accent; });
      btn.onPointerClickObservable.add(onClick);
      return btn;
    };

    const hoursDisplay = new TextBlock();
    hoursDisplay.text = `${restHours} hr`;
    hoursDisplay.color = COLORS.textPrimary;
    hoursDisplay.fontSize = 20;
    hoursDisplay.fontWeight = "bold";
    hoursDisplay.width = "80px";
    hoursDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    const updateDisplay = () => {
      hoursDisplay.text = restHours === 1 ? "1 hr" : `${restHours} hrs`;
    };

    const minusBtn = makeStepperBtn("rest_minus", "−", () => {
      if (restHours > MIN_HOURS) { restHours--; updateDisplay(); }
    });
    stepperRow.addControl(minusBtn);
    stepperRow.addControl(hoursDisplay);
    const plusBtn = makeStepperBtn("rest_plus", "+", () => {
      if (restHours < MAX_HOURS) { restHours++; updateDisplay(); }
    });
    stepperRow.addControl(plusBtn);

    // Spacer
    const spacer = new TextBlock();
    spacer.width = "16px";
    stepperRow.addControl(spacer);

    const restBtn = Button.CreateSimpleButton("rest_go", "Rest");
    restBtn.width = "80px";
    restBtn.height = "38px";
    restBtn.color = "white";
    restBtn.background = COLORS.accent;
    restBtn.cornerRadius = 5;
    restBtn.fontSize = 15;
    restBtn.fontWeight = "bold";
    restBtn.onPointerEnterObservable.add(() => { restBtn.background = "#5A9CF5"; });
    restBtn.onPointerOutObservable.add(() => { restBtn.background = COLORS.accent; });
    restBtn.onPointerClickObservable.add(() => {
      this.callbacks.onRest?.(restHours);
      setTimeout(() => this.refreshActiveTab(), 100);
    });
    stepperRow.addControl(restBtn);

    // Quick rest shortcuts
    const shortcutRow = new StackPanel();
    shortcutRow.isVertical = false;
    shortcutRow.height = "36px";
    shortcutRow.paddingTop = "6px";
    restCard.addControl(shortcutRow);

    const makeShortcutBtn = (id: string, label: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(id, label);
      btn.width = "140px";
      btn.height = "30px";
      btn.color = COLORS.textSecondary;
      btn.background = COLORS.cardBg;
      btn.cornerRadius = 5;
      btn.fontSize = 12;
      btn.onPointerEnterObservable.add(() => { btn.background = "#3A3A4A"; });
      btn.onPointerOutObservable.add(() => { btn.background = COLORS.cardBg; });
      btn.onPointerClickObservable.add(onClick);
      return btn;
    };

    const calcHoursUntil = (targetHour: number): number => {
      const currentFractional = this.callbacks.getTimeData?.();
      const curHour = currentFractional?.timeString
        ? parseInt(currentFractional.timeString.split(':')[0], 10)
        : 8;
      let h = curHour < targetHour ? targetHour - curHour : (24 - curHour) + targetHour;
      if (h <= 0) h = 1;
      return h;
    };

    const dawnBtn = makeShortcutBtn("rest_dawn", "🌅 Until Dawn (5:00)", () => {
      this.callbacks.onRest?.(calcHoursUntil(5));
      setTimeout(() => this.refreshActiveTab(), 100);
    });
    shortcutRow.addControl(dawnBtn);

    const shortcutSpacer = new TextBlock();
    shortcutSpacer.width = "8px";
    shortcutRow.addControl(shortcutSpacer);

    const duskBtn = makeShortcutBtn("rest_dusk", "🌙 Until Dusk (20:00)", () => {
      this.callbacks.onRest?.(calcHoursUntil(20));
      setTimeout(() => this.refreshActiveTab(), 100);
    });
    shortcutRow.addControl(duskBtn);

    // ── Time Speed Controls ──
    if (this.callbacks.onTimeSpeedChange || this.callbacks.onTimePauseToggle) {
      this.addDivider(stack);
      this.addSectionHeader(stack, "Time Speed");
      this.addSubHeader(stack, "Control how fast time passes in the world");

      const speedCard = this.makeCard(stack);

      // Current speed display
      const speedRow = new StackPanel();
      speedRow.isVertical = false;
      speedRow.height = "40px";
      speedCard.addControl(speedRow);

      const speedLabel = new TextBlock();
      speedLabel.text = timeData?.paused ? "⏸ Paused" : `▶ ${timeData?.timeScale ?? 1}x speed`;
      speedLabel.color = timeData?.paused ? "#FFC107" : COLORS.textPrimary;
      speedLabel.fontSize = 16;
      speedLabel.fontWeight = "bold";
      speedLabel.width = "160px";
      speedLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      speedLabel.left = "8px";
      speedRow.addControl(speedLabel);

      // Pause button
      const pauseBtn = Button.CreateSimpleButton("time_pause", timeData?.paused ? "▶ Resume" : "⏸ Pause");
      pauseBtn.width = "90px";
      pauseBtn.height = "30px";
      pauseBtn.color = "white";
      pauseBtn.background = timeData?.paused ? "#4CAF50" : COLORS.cardBg;
      pauseBtn.cornerRadius = 5;
      pauseBtn.fontSize = 12;
      pauseBtn.thickness = 1;
      (pauseBtn as any).borderColor = COLORS.cardBorder;
      pauseBtn.paddingRight = "4px";
      pauseBtn.onPointerEnterObservable.add(() => { pauseBtn.background = COLORS.tabHover; });
      pauseBtn.onPointerOutObservable.add(() => { pauseBtn.background = timeData?.paused ? "#4CAF50" : COLORS.cardBg; });
      pauseBtn.onPointerClickObservable.add(() => {
        this.callbacks.onTimePauseToggle?.();
        setTimeout(() => this.refreshActiveTab(), 50);
      });
      speedRow.addControl(pauseBtn);

      // Slower button
      const slowerBtn = Button.CreateSimpleButton("time_slower", "◀ Slower");
      slowerBtn.width = "80px";
      slowerBtn.height = "30px";
      slowerBtn.color = COLORS.textSecondary;
      slowerBtn.background = COLORS.cardBg;
      slowerBtn.cornerRadius = 5;
      slowerBtn.fontSize = 12;
      slowerBtn.thickness = 1;
      (slowerBtn as any).borderColor = COLORS.cardBorder;
      slowerBtn.paddingRight = "4px";
      slowerBtn.onPointerEnterObservable.add(() => { slowerBtn.background = COLORS.tabHover; slowerBtn.color = COLORS.textPrimary; });
      slowerBtn.onPointerOutObservable.add(() => { slowerBtn.background = COLORS.cardBg; slowerBtn.color = COLORS.textSecondary; });
      slowerBtn.onPointerClickObservable.add(() => {
        this.callbacks.onTimeSpeedChange?.(-1);
        setTimeout(() => this.refreshActiveTab(), 50);
      });
      speedRow.addControl(slowerBtn);

      // Faster button
      const fasterBtn = Button.CreateSimpleButton("time_faster", "Faster ▶");
      fasterBtn.width = "80px";
      fasterBtn.height = "30px";
      fasterBtn.color = COLORS.textSecondary;
      fasterBtn.background = COLORS.cardBg;
      fasterBtn.cornerRadius = 5;
      fasterBtn.fontSize = 12;
      fasterBtn.thickness = 1;
      (fasterBtn as any).borderColor = COLORS.cardBorder;
      fasterBtn.onPointerEnterObservable.add(() => { fasterBtn.background = COLORS.tabHover; fasterBtn.color = COLORS.textPrimary; });
      fasterBtn.onPointerOutObservable.add(() => { fasterBtn.background = COLORS.cardBg; fasterBtn.color = COLORS.textSecondary; });
      fasterBtn.onPointerClickObservable.add(() => {
        this.callbacks.onTimeSpeedChange?.(1);
        setTimeout(() => this.refreshActiveTab(), 50);
      });
      speedRow.addControl(fasterBtn);
    }
  }

  // ─── CHARACTER TAB ──────────────────────────────────────────────────────

  private renderCharacterTab(): void {
    const { stack } = this.makeScrollableContent("char");
    const player = this.callbacks.getPlayerData();

    this.addSectionHeader(stack, "Character");
    this.addSubHeader(stack, "Player stats, status, and reputation");

    if (!player) {
      const noData = new TextBlock();
      noData.text = "No player data available";
      noData.color = COLORS.textMuted;
      noData.fontSize = 12;
      noData.height = "33px";
      stack.addControl(noData);
      return;
    }

    // Status card
    const statusCard = this.makeCard(stack);
    this.addStatRow(statusCard, "Status", player.status, COLORS.accentGreen);
    this.addStatRow(statusCard, "Gold", `${player.gold}`, COLORS.gold);
    if (player.level !== undefined) {
      this.addStatRow(statusCard, "Level", `${player.level}`, COLORS.accent);
    }

    // Energy bar
    const spacer = new Rectangle();
    spacer.width = 1;
    spacer.height = "11px";
    spacer.thickness = 0;
    spacer.background = "transparent";
    stack.addControl(spacer);

    const energyCard = this.makeCard(stack);
    const energyLabel = new TextBlock();
    energyLabel.text = "Energy";
    energyLabel.color = COLORS.textSecondary;
    energyLabel.fontSize = 12;
    energyLabel.height = "18px";
    energyLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    energyCard.addControl(energyLabel);

    const energyPct = player.energy / player.maxEnergy;
    const energyColor =
      energyPct > 0.5 ? COLORS.accentGreen : energyPct > 0.25 ? COLORS.accentYellow : COLORS.accentRed;
    this.addProgressBar(energyCard, player.energy, player.maxEnergy, energyColor, `${player.energy} / ${player.maxEnergy}`);

    // Reputation section
    this.addDivider(stack);
    const reputations = this.callbacks.getReputations();
    if (reputations.length > 0) {
      const repTitle = new TextBlock();
      repTitle.text = "Reputation";
      repTitle.color = COLORS.textPrimary;
      repTitle.fontSize = 15;
      repTitle.fontWeight = "bold";
      repTitle.height = "29px";
      repTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(repTitle);

      reputations.forEach((rep) => {
        const repCard = this.makeCard(stack);
        this.addStatRow(repCard, rep.settlementName, rep.standing.charAt(0).toUpperCase() + rep.standing.slice(1), this.getReputationColor(rep.score));
        this.addProgressBar(repCard, rep.score + 100, 200, this.getReputationColor(rep.score), `${rep.score}`);
        if (rep.isBanned) {
          const warn = new TextBlock();
          warn.text = "⚠ BANNED";
          warn.color = COLORS.accentRed;
          warn.fontSize = 12;
          warn.height = "17px";
          warn.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          repCard.addControl(warn);
        }
        if (rep.outstandingFines > 0 && !rep.isBanned) {
          const fineBtn = Button.CreateSimpleButton("payFines", `Pay Fines (${rep.outstandingFines}g)`);
          fineBtn.width = "132px";
          fineBtn.height = "24px";
          fineBtn.color = "white";
          fineBtn.background = COLORS.accentGreen;
          fineBtn.cornerRadius = 5;
          fineBtn.fontSize = 12;
          fineBtn.onPointerClickObservable.add(() => this.callbacks.onPayFines?.());
          repCard.addControl(fineBtn);
        }
      });
    }
  }

  private getReputationColor(score: number): string {
    if (score >= 51) return COLORS.accentGreen;
    if (score >= 1) return "#8BC34A";
    if (score >= -49) return COLORS.accentYellow;
    if (score >= -99) return "#FF9800";
    return COLORS.accentRed;
  }

  // ─── JOURNAL TAB ────────────────────────────────────────────────────────

  private renderJournalTab(): void {
    const { stack } = this.makeScrollableContent("journal");
    const data = this.callbacks.getJournalData?.();

    const clueData = this.callbacks.getClueData?.();
    const clueLabel = clueData ? ` — Clues: ${clueData.clueCount}/${clueData.totalClueCount} found` : '';
    this.addSectionHeader(stack, "Investigation Journal");
    this.addSubHeader(stack, `Your reporter's case file — clues, progress, and notes${clueLabel}`);

    if (!data || data.chapters.length === 0) {
      const noData = new TextBlock();
      noData.text = "No journal data available. Complete the onboarding to begin your investigation.";
      noData.color = COLORS.textMuted;
      noData.fontSize = 13;
      noData.height = "40px";
      noData.textWrapping = TextWrapping.WordWrap;
      stack.addControl(noData);
      return;
    }

    // ─── SECTION 1: Investigation Board ────────────────────────────
    this.renderInvestigationBoard(stack, data);

    this.addDivider(stack);

    // ─── SECTION 2: Story So Far ─────────────────────────────────
    this.renderStorySoFar(stack, data);

    this.addDivider(stack);

    // ─── SECTION 3: Chapter Progress ───────────────────────────────
    this.renderChapterProgressSection(stack, data);

    this.addDivider(stack);

    // ─── SECTION 3: Case Notes ─────────────────────────────────────
    this.renderCaseNotesSection(stack, data.caseNotes ?? []);

    // Portfolio & Learning Journal sections
    const portfolio = this.callbacks.getPortfolioData?.();
    if (portfolio) {
      this.renderPortfolioSection(stack, portfolio);
      this.renderLearningJournalSection(stack, portfolio);
    }
  }

  // ─── INVESTIGATION BOARD ──────────────────────────────────────────────────

  private renderInvestigationBoard(parent: StackPanel, data: MenuJournalData): void {
    const board = data.investigationBoard;
    const boardCard = this.makeCard(parent);

    // Board header with investigation theme
    const boardHeader = new TextBlock();
    boardHeader.text = "INVESTIGATION BOARD";
    boardHeader.color = COLORS.accentYellow;
    boardHeader.fontSize = 14;
    boardHeader.fontWeight = "bold";
    boardHeader.height = "26px";
    boardHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    boardHeader.paddingLeft = "4px";
    boardCard.addControl(boardHeader);

    // Writer name
    const writerName = board?.writerName ?? 'The Missing Writer';
    const writerRow = new TextBlock();
    writerRow.text = `Subject: ${writerName}`;
    writerRow.color = COLORS.textPrimary;
    writerRow.fontSize = 13;
    writerRow.fontWeight = "bold";
    writerRow.height = "22px";
    writerRow.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    writerRow.paddingLeft = "4px";
    boardCard.addControl(writerRow);

    // Evidence stats row — merge server board data with real-time ClueStore data
    const clueData = this.callbacks.getClueData?.();
    const cluesFound = clueData ? clueData.clueCount : (board?.cluesFound ?? 0);
    const evidenceCollected = clueData
      ? clueData.clues.filter(c => c.category === 'written_evidence' || c.category === 'physical_evidence').length
      : (board?.evidenceCollected ?? 0);
    const completedCount = data.chapters.filter(c => c.progress.status === 'completed').length;

    this.addStatRow(boardCard, "Clues Found", `${cluesFound}`, COLORS.accentGreen);
    this.addStatRow(boardCard, "Evidence Collected", `${evidenceCollected}`, COLORS.accent);
    this.addStatRow(boardCard, "Chapters Closed", `${completedCount} / ${data.chapters.length}`, COLORS.accentGreen);
    this.addStatRow(boardCard, "CEFR Level", data.playerCefrLevel || "A1", COLORS.accent);
    this.addStatRow(boardCard, "Total XP", `${data.totalXPEarned}`, COLORS.accentYellow);

    // Timeline
    if (board?.timeline && board.timeline.length > 0) {
      const timelineHeader = new TextBlock();
      timelineHeader.text = "Timeline";
      timelineHeader.color = COLORS.textPrimary;
      timelineHeader.fontSize = 12;
      timelineHeader.fontWeight = "bold";
      timelineHeader.height = "24px";
      timelineHeader.paddingTop = "6px";
      timelineHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      timelineHeader.paddingLeft = "4px";
      boardCard.addControl(timelineHeader);

      for (const event of board.timeline) {
        const eventRow = new Rectangle();
        eventRow.width = 1;
        eventRow.height = "20px";
        eventRow.thickness = 0;
        eventRow.background = "transparent";
        boardCard.addControl(eventRow);

        const eventText = new TextBlock();
        eventText.text = `${event.completed ? "●" : "○"}  ${event.label}`;
        eventText.color = event.completed ? COLORS.accentGreen : COLORS.textSecondary;
        eventText.fontSize = 11;
        eventText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        eventText.paddingLeft = "10px";
        eventRow.addControl(eventText);

        const detailText = new TextBlock();
        detailText.text = event.detail;
        detailText.color = COLORS.textMuted;
        detailText.fontSize = 10;
        detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        detailText.paddingRight = "4px";
        eventRow.addControl(detailText);
      }
    }

    // Key NPCs met
    const npcsMet = board?.keyNPCsMet ?? [];
    if (npcsMet.length > 0) {
      const npcHeader = new TextBlock();
      npcHeader.text = `Key Contacts (${npcsMet.length})`;
      npcHeader.color = COLORS.textPrimary;
      npcHeader.fontSize = 12;
      npcHeader.fontWeight = "bold";
      npcHeader.height = "24px";
      npcHeader.paddingTop = "6px";
      npcHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      npcHeader.paddingLeft = "4px";
      boardCard.addControl(npcHeader);

      for (const npc of npcsMet.slice(0, 5)) {
        const npcRow = new TextBlock();
        npcRow.text = `  • ${npc.name}`;
        npcRow.color = COLORS.accent;
        npcRow.fontSize = 11;
        npcRow.height = "18px";
        npcRow.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        npcRow.paddingLeft = "10px";
        boardCard.addControl(npcRow);
      }
    }
  }

  // ─── STORY SO FAR SECTION ────────────────────────────────────────────────

  private renderStorySoFar(parent: StackPanel, data: MenuJournalData): void {
    const history = data.narrativeHistory || [];
    // Only show chapters that have been started or completed
    const completedOrActive = data.chapters.filter(
      ch => ch.progress.status === 'completed' || ch.progress.status === 'active'
    );

    if (completedOrActive.length === 0 && history.length === 0) return;

    this.addSectionHeader(parent, "📖 Story So Far");

    for (const chEntry of completedOrActive) {
      const narrative = history.find(h => h.chapterId === chEntry.chapter.id);
      if (!narrative?.introNarrative && !narrative?.outroNarrative) continue;

      const isCompleted = chEntry.progress.status === 'completed';
      const isCurrent = chEntry.progress.status === 'active';

      // Chapter title
      const titleBlock = new TextBlock();
      titleBlock.text = `${isCompleted ? '✅' : '🔍'} Chapter ${chEntry.chapter.number}: ${chEntry.chapter.title}`;
      titleBlock.color = isCurrent ? '#FFD700' : COLORS.textPrimary;
      titleBlock.fontSize = 14;
      titleBlock.fontWeight = 'bold';
      titleBlock.height = '24px';
      titleBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      titleBlock.paddingLeft = '8px';
      titleBlock.paddingTop = '6px';
      parent.addControl(titleBlock);

      // Intro narrative
      if (narrative.introNarrative) {
        const introBlock = new TextBlock();
        introBlock.text = narrative.introNarrative;
        introBlock.color = COLORS.textMuted;
        introBlock.fontSize = 12;
        introBlock.textWrapping = TextWrapping.WordWrap;
        introBlock.resizeToFit = true;
        introBlock.paddingLeft = '16px';
        introBlock.paddingRight = '8px';
        introBlock.paddingTop = '4px';
        introBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(introBlock);
      }

      // Mystery details (if completed or current)
      if (narrative.mysteryDetails) {
        const mysteryBlock = new TextBlock();
        mysteryBlock.text = `🔎 ${narrative.mysteryDetails}`;
        mysteryBlock.color = '#D4A574';
        mysteryBlock.fontSize = 11;
        mysteryBlock.textWrapping = TextWrapping.WordWrap;
        mysteryBlock.resizeToFit = true;
        mysteryBlock.paddingLeft = '16px';
        mysteryBlock.paddingRight = '8px';
        mysteryBlock.paddingTop = '4px';
        mysteryBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(mysteryBlock);
      }

      // Outro narrative (only for completed chapters)
      if (isCompleted && narrative.outroNarrative) {
        const outroBlock = new TextBlock();
        outroBlock.text = narrative.outroNarrative;
        outroBlock.color = '#7EC8A0';
        outroBlock.fontSize = 12;
        outroBlock.fontStyle = 'italic';
        outroBlock.textWrapping = TextWrapping.WordWrap;
        outroBlock.resizeToFit = true;
        outroBlock.paddingLeft = '16px';
        outroBlock.paddingRight = '8px';
        outroBlock.paddingTop = '4px';
        outroBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(outroBlock);
      }
    }
  }

  // ─── CHAPTER PROGRESS SECTION ─────────────────────────────────────────────

  private renderChapterProgressSection(parent: StackPanel, data: MenuJournalData): void {
    const sectionHeader = new TextBlock();
    sectionHeader.text = "CHAPTER PROGRESS";
    sectionHeader.color = COLORS.accentYellow;
    sectionHeader.fontSize = 14;
    sectionHeader.fontWeight = "bold";
    sectionHeader.height = "26px";
    sectionHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sectionHeader.paddingLeft = "4px";
    parent.addControl(sectionHeader);

    // Periodic assessment status
    if (data.periodicAssessmentAvailable) {
      const assessStatus = new TextBlock();
      assessStatus.text = "📋 Progress Check available — visit the Notice Board (N)";
      assessStatus.color = COLORS.accent;
      assessStatus.fontSize = 12;
      assessStatus.height = "22px";
      assessStatus.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      assessStatus.paddingLeft = "4px";
      parent.addControl(assessStatus);
    } else if (data.nextPeriodicAssessmentLevel !== null) {
      const assessStatus = new TextBlock();
      assessStatus.text = `Next progress check at level ${data.nextPeriodicAssessmentLevel}`;
      assessStatus.color = COLORS.textSecondary;
      assessStatus.fontSize = 11;
      assessStatus.height = "20px";
      assessStatus.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      assessStatus.paddingLeft = "4px";
      parent.addControl(assessStatus);
    }

    // Render current chapter first (prominently), then others
    const currentChapter = data.chapters.find(c => c.chapter.id === data.currentChapterId);
    if (currentChapter) {
      this.renderJournalChapter(parent, currentChapter, data.currentChapterId);
    }

    // Completed chapters (collapsed)
    const completed = data.chapters.filter(c => c.progress.status === 'completed');
    if (completed.length > 0) {
      const completedHeader = new TextBlock();
      completedHeader.text = `Completed Chapters (${completed.length})`;
      completedHeader.color = COLORS.textSecondary;
      completedHeader.fontSize = 12;
      completedHeader.fontWeight = "bold";
      completedHeader.height = "24px";
      completedHeader.paddingTop = "4px";
      completedHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      completedHeader.paddingLeft = "4px";
      parent.addControl(completedHeader);

      for (const entry of completed) {
        this.renderCollapsedChapter(parent, entry);
      }
    }

    // Locked chapters
    const locked = data.chapters.filter(
      c => c.progress.status === 'locked' || c.progress.status === 'available',
    );
    if (locked.length > 0) {
      for (const entry of locked) {
        this.renderCollapsedChapter(parent, entry);
      }
    }
  }

  /** Render a collapsed chapter card (completed or locked) */
  private renderCollapsedChapter(parent: StackPanel, entry: MenuJournalChapter): void {
    const { chapter, progress, completionPercent, cefrMet } = entry;
    const isCompleted = progress.status === 'completed';
    const isLocked = progress.status === 'locked';

    const row = new Rectangle();
    row.width = 1;
    row.height = "28px";
    row.thickness = 0;
    row.background = COLORS.cardBg;
    row.cornerRadius = 4;
    row.paddingBottom = "2px";
    parent.addControl(row);

    const icon = isCompleted ? "✅" : isLocked ? "🔒" : "⏳";
    const label = new TextBlock();
    label.text = `${icon}  Ch. ${chapter.number}: ${chapter.title}`;
    label.color = isLocked ? COLORS.textMuted : COLORS.textSecondary;
    label.fontSize = 12;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = "8px";
    row.addControl(label);

    const badge = new TextBlock();
    badge.text = isCompleted
      ? `${completionPercent}%`
      : isLocked && !cefrMet
        ? `Requires ${chapter.requiredCefrLevel}`
        : '';
    badge.color = isCompleted ? COLORS.accentGreen : COLORS.accentRed;
    badge.fontSize = 11;
    badge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    badge.paddingRight = "8px";
    row.addControl(badge);
  }

  // ─── CASE NOTES SECTION ───────────────────────────────────────────────────

  private renderCaseNotesSection(parent: StackPanel, caseNotes: CaseNote[]): void {
    const sectionHeader = new TextBlock();
    sectionHeader.text = "CASE NOTES";
    sectionHeader.color = COLORS.accentYellow;
    sectionHeader.fontSize = 14;
    sectionHeader.fontWeight = "bold";
    sectionHeader.height = "26px";
    sectionHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sectionHeader.paddingLeft = "4px";
    parent.addControl(sectionHeader);

    if (caseNotes.length === 0) {
      const emptyNote = new TextBlock();
      emptyNote.text = "No case notes yet. Complete objectives to build your investigation file.";
      emptyNote.color = COLORS.textMuted;
      emptyNote.fontSize = 12;
      emptyNote.height = "30px";
      emptyNote.textWrapping = TextWrapping.WordWrap;
      emptyNote.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      emptyNote.paddingLeft = "4px";
      parent.addControl(emptyNote);
      return;
    }

    const categoryIcons: Record<string, string> = {
      clue: '🔍',
      npc_interview: '🗣️',
      text_found: '📄',
      location_visited: '📍',
      chapter_event: '⭐',
    };

    // Show up to 20 most recent notes (already newest-first)
    for (const note of caseNotes.slice(0, 20)) {
      const card = this.makeCard(parent);

      // Day header
      const dayRow = new Rectangle();
      dayRow.width = 1;
      dayRow.height = "20px";
      dayRow.thickness = 0;
      dayRow.background = "transparent";
      card.addControl(dayRow);

      const dayLabel = new TextBlock();
      dayLabel.text = `Day ${note.day}`;
      dayLabel.color = COLORS.accent;
      dayLabel.fontSize = 12;
      dayLabel.fontWeight = "bold";
      dayLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      dayLabel.paddingLeft = "4px";
      dayRow.addControl(dayLabel);

      const categoryIcon = categoryIcons[note.category] ?? '📌';
      const catLabel = new TextBlock();
      catLabel.text = categoryIcon;
      catLabel.fontSize = 12;
      catLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      catLabel.paddingRight = "4px";
      dayRow.addControl(catLabel);

      // Note text
      const noteText = new TextBlock();
      noteText.text = note.text;
      noteText.color = COLORS.textSecondary;
      noteText.fontSize = 12;
      noteText.textWrapping = TextWrapping.WordWrap;
      noteText.resizeToFit = true;
      noteText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      noteText.paddingLeft = "4px";
      noteText.paddingBottom = "4px";
      card.addControl(noteText);
    }
  }

  // ─── CLUES TAB ───────────────────────────────────────────────────────────

  private static readonly CLUE_CATEGORIES: Array<{ id: ClueCategory | 'all'; label: string; icon: string }> = [
    { id: 'all', label: 'All Clues', icon: '🔎' },
    { id: 'witness_testimony', label: 'Testimony', icon: '🗣️' },
    { id: 'written_evidence', label: 'Written', icon: '📄' },
    { id: 'physical_evidence', label: 'Physical', icon: '🔬' },
    { id: 'photo_evidence', label: 'Photos', icon: '📸' },
  ];

  private renderCluesTab(): void {
    const { stack } = this.makeScrollableContent("clues");
    const data = this.callbacks.getClueData?.();

    const clueCount = data?.clueCount ?? 0;
    const totalCount = data?.totalClueCount ?? 12;

    this.addSectionHeader(stack, "Evidence Board");
    this.addSubHeader(stack, `Clues: ${clueCount}/${totalCount} found`);

    // ─── Progress bar ─────────────────────────────────────────────
    this.addProgressBar(stack, clueCount, totalCount, COLORS.accentYellow, "Investigation Progress");

    this.addDivider(stack);

    // ─── Category filter tabs ──────────────────────────────────
    this.renderTabBar(
      stack,
      GameMenuSystem.CLUE_CATEGORIES.map(cat => ({ id: cat.id, label: `${cat.icon} ${cat.label}` })),
      this.cluesFilterCategory,
      (id) => { this.cluesFilterCategory = id; this.refreshActiveTab(); },
      90,
    );

    if (!data || data.clues.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = "No clues discovered yet. Explore the world, talk to NPCs, read texts, and take photos to uncover evidence.";
      emptyText.color = COLORS.textMuted;
      emptyText.fontSize = 13;
      emptyText.textWrapping = TextWrapping.WordWrap;
      emptyText.resizeToFit = true;
      emptyText.paddingTop = "12px";
      emptyText.paddingLeft = "4px";
      stack.addControl(emptyText);
      return;
    }

    // ─── Filter clues ─────────────────────────────────────────────
    const filtered = this.cluesFilterCategory === 'all'
      ? data.clues
      : data.clues.filter(c => c.category === this.cluesFilterCategory);

    // ─── Category summary counts ──────────────────────────────────
    const summaryCard = this.makeCard(stack);
    const counts: Record<string, number> = {};
    for (const clue of data.clues) {
      counts[clue.category] = (counts[clue.category] ?? 0) + 1;
    }
    for (const cat of GameMenuSystem.CLUE_CATEGORIES) {
      if (cat.id === 'all') continue;
      this.addStatRow(summaryCard, `${cat.icon} ${cat.label}`, `${counts[cat.id] ?? 0}`,
        (counts[cat.id] ?? 0) > 0 ? COLORS.accentGreen : COLORS.textMuted);
    }

    this.addDivider(stack);

    // ─── Connection visualization ─────────────────────────────────
    if (data.connections.length > 0) {
      this.renderClueConnections(stack, filtered, data.connections);
      this.addDivider(stack);
    }

    // ─── Chapter grouping ────────────────────────────────────────
    // If cluesByChapter is available, render chapter headers above each group
    const chapterGroups = data.cluesByChapter;
    const hasChapterGroups = chapterGroups && chapterGroups.length > 0;

    // ─── Clue cards ───────────────────────────────────────────────
    const categoryIcons: Record<string, string> = {
      witness_testimony: '🗣️',
      written_evidence: '📄',
      physical_evidence: '🔬',
      photo_evidence: '📸',
    };

    // Render function for a single clue card (reused in both paths)
    const renderClueCard = (clue: Clue) => {
      const card = this.makeCard(stack);

      // Header row: icon + category + followed-up toggle
      const headerRow = new Rectangle();
      headerRow.width = 1;
      headerRow.height = "24px";
      headerRow.thickness = 0;
      headerRow.background = "transparent";
      card.addControl(headerRow);

      const catIcon = categoryIcons[clue.category] ?? '🔍';
      const catLabel = new TextBlock();
      catLabel.text = `${catIcon}  ${clue.category.replace(/_/g, ' ').toUpperCase()}`;
      catLabel.color = COLORS.accent;
      catLabel.fontSize = 11;
      catLabel.fontWeight = "bold";
      catLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      catLabel.paddingLeft = "4px";
      headerRow.addControl(catLabel);

      // Followed-up toggle button
      const followBtn = Button.CreateSimpleButton(
        `clueFollow_${clue.id}`,
        clue.followedUp ? "✓ Followed Up" : "Mark Followed Up",
      );
      followBtn.width = "120px";
      followBtn.height = "20px";
      followBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      followBtn.color = clue.followedUp ? COLORS.accentGreen : COLORS.textSecondary;
      followBtn.background = clue.followedUp ? "rgba(52, 168, 83, 0.15)" : COLORS.cardBg;
      followBtn.cornerRadius = 4;
      followBtn.fontSize = 10;
      followBtn.thickness = 0;
      followBtn.onPointerClickObservable.add(() => {
        this.callbacks.onToggleClueFollowedUp?.(clue.id);
        this.refreshActiveTab();
      });
      headerRow.addControl(followBtn);

      // Clue text
      const clueText = new TextBlock();
      clueText.text = clue.text;
      clueText.color = COLORS.textPrimary;
      clueText.fontSize = 12;
      clueText.textWrapping = TextWrapping.WordWrap;
      clueText.resizeToFit = true;
      clueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      clueText.paddingLeft = "4px";
      clueText.paddingTop = "4px";
      clueText.paddingBottom = "4px";
      card.addControl(clueText);

      // Source row
      const sourceRow = new Rectangle();
      sourceRow.width = 1;
      sourceRow.height = "20px";
      sourceRow.thickness = 0;
      sourceRow.background = "transparent";
      card.addControl(sourceRow);

      const sourceText = new TextBlock();
      sourceText.text = `Source: ${clue.source}`;
      sourceText.color = COLORS.textSecondary;
      sourceText.fontSize = 11;
      sourceText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      sourceText.paddingLeft = "4px";
      sourceRow.addControl(sourceText);

      const timeText = new TextBlock();
      timeText.text = new Date(clue.discoveredAt).toLocaleDateString();
      timeText.color = COLORS.textMuted;
      timeText.fontSize = 10;
      timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      timeText.paddingRight = "4px";
      sourceRow.addControl(timeText);

      // Tags row
      if (clue.tags.length > 0) {
        const tagText = new TextBlock();
        tagText.text = `Tags: ${clue.tags.join(', ')}`;
        tagText.color = COLORS.textMuted;
        tagText.fontSize = 10;
        tagText.textWrapping = TextWrapping.WordWrap;
        tagText.resizeToFit = true;
        tagText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        tagText.paddingLeft = "4px";
        tagText.paddingBottom = "2px";
        card.addControl(tagText);
      }
    };

    // Render: chapter-grouped or flat
    if (hasChapterGroups) {
      // Ungrouped clues (no chapterId) first
      const ungrouped = filtered.filter(c => !c.chapterId);
      if (ungrouped.length > 0) {
        this.addSubHeader(stack, "General Evidence");
        for (const clue of ungrouped) renderClueCard(clue);
      }
      // Then by chapter
      for (const group of chapterGroups!) {
        const chapterClues = filtered.filter(c => c.chapterId === group.chapterId);
        if (chapterClues.length === 0) continue;
        this.addSubHeader(stack, `Ch.${group.chapterNumber}: ${group.chapterTitle}`);
        for (const clue of chapterClues) renderClueCard(clue);
      }
    } else {
      // Flat list (legacy / no chapter data)
      for (const clue of filtered) renderClueCard(clue);
    }
  }

  /**
   * Render a simple grouped connection visualization.
   * Clues sharing tags are shown as linked groups.
   */
  private renderClueConnections(
    parent: StackPanel,
    clues: Clue[],
    connections: Array<[string, string]>,
  ): void {
    const header = new TextBlock();
    header.text = "CONNECTIONS";
    header.color = COLORS.accentYellow;
    header.fontSize = 14;
    header.fontWeight = "bold";
    header.height = "26px";
    header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.paddingLeft = "4px";
    parent.addControl(header);

    // Build adjacency groups via union-find
    const clueMap = new Map(clues.map(c => [c.id, c]));
    const parentMap = new Map<string, string>();
    const find = (id: string): string => {
      let root = id;
      while (parentMap.get(root) !== root && parentMap.has(root)) root = parentMap.get(root)!;
      parentMap.set(id, root);
      return root;
    };
    const union = (a: string, b: string) => {
      parentMap.set(find(a), find(b));
    };

    for (const clue of clues) parentMap.set(clue.id, clue.id);
    for (const [a, b] of connections) {
      if (clueMap.has(a) && clueMap.has(b)) union(a, b);
    }

    // Group by root
    const groups = new Map<string, Clue[]>();
    for (const clue of clues) {
      const root = find(clue.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(clue);
    }

    // Only show groups with 2+ connected clues
    groups.forEach((group: Clue[]) => {
      if (group.length < 2) return;

      const card = this.makeCard(parent);

      // Find shared tags
      const tagSets = group.map((c: Clue) => new Set(c.tags));
      const sharedTags = Array.from(tagSets[0]).filter((t: string) => tagSets.every((s: Set<string>) => s.has(t)));

      const linkLabel = new TextBlock();
      linkLabel.text = sharedTags.length > 0
        ? `Linked by: ${sharedTags.join(', ')}`
        : `${group.length} connected clues`;
      linkLabel.color = COLORS.accent;
      linkLabel.fontSize = 11;
      linkLabel.fontWeight = "bold";
      linkLabel.height = "20px";
      linkLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      linkLabel.paddingLeft = "4px";
      card.addControl(linkLabel);

      for (const clue of group) {
        const row = new TextBlock();
        row.text = `  ├─ ${clue.source}: "${clue.text.slice(0, 60)}${clue.text.length > 60 ? '...' : ''}"`;
        row.color = COLORS.textSecondary;
        row.fontSize = 11;
        row.textWrapping = TextWrapping.WordWrap;
        row.resizeToFit = true;
        row.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.paddingLeft = "4px";
        card.addControl(row);
      }
    });
  }

  private renderJournalChapter(
    parent: StackPanel,
    entry: MenuJournalChapter,
    currentChapterId: string | null,
  ): void {
    const { chapter, progress, completionPercent, cefrMet } = entry;
    const isCurrent = chapter.id === currentChapterId;
    const isLocked = progress.status === 'locked';
    const isCompleted = progress.status === 'completed';

    const card = this.makeCard(parent);

    // Chapter header row
    const headerRow = new Rectangle();
    headerRow.width = 1;
    headerRow.height = "28px";
    headerRow.thickness = 0;
    headerRow.background = "transparent";
    card.addControl(headerRow);

    const statusIcon = isCompleted ? "✅" : isCurrent ? "🔍" : isLocked ? "🔒" : "⏳";
    const statusLabel = isCompleted ? "CLOSED" : isCurrent ? "ACTIVE" : isLocked ? "SEALED" : "PENDING";
    const titleText = new TextBlock();
    titleText.text = `${statusIcon}  Ch. ${chapter.number}: ${chapter.title}  [${statusLabel}]`;
    titleText.color = isLocked ? COLORS.textMuted : COLORS.textPrimary;
    titleText.fontSize = 15;
    titleText.fontWeight = "bold";
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = "4px";
    headerRow.addControl(titleText);

    // CEFR requirement badge
    const cefrBadge = new TextBlock();
    cefrBadge.text = `CEFR ${chapter.requiredCefrLevel}${cefrMet ? " ✓" : ""}`;
    cefrBadge.color = cefrMet ? COLORS.accentGreen : COLORS.accentRed;
    cefrBadge.fontSize = 11;
    cefrBadge.fontWeight = "bold";
    cefrBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    cefrBadge.paddingRight = "4px";
    headerRow.addControl(cefrBadge);

    // Description
    const desc = new TextBlock();
    desc.text = chapter.description;
    desc.color = isLocked ? COLORS.textMuted : COLORS.textSecondary;
    desc.fontSize = 12;
    desc.textWrapping = TextWrapping.WordWrap;
    desc.resizeToFit = true;
    desc.paddingBottom = "6px";
    desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    desc.paddingLeft = "4px";
    card.addControl(desc);

    // Show narrative as case notes for current chapter
    if (isCurrent && chapter.introNarrative) {
      const narrative = new TextBlock();
      narrative.text = `Case notes: "${chapter.introNarrative}"`;
      narrative.color = COLORS.accentYellow;
      narrative.fontSize = 11;
      narrative.fontStyle = "italic";
      narrative.textWrapping = TextWrapping.WordWrap;
      narrative.resizeToFit = true;
      narrative.paddingBottom = "8px";
      narrative.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      narrative.paddingLeft = "4px";
      card.addControl(narrative);
    }

    // Progress bar (only for active/completed)
    if (!isLocked) {
      this.addProgressBar(
        card,
        completionPercent,
        100,
        isCompleted ? COLORS.accentGreen : COLORS.accent,
        `${completionPercent}%`,
      );
    }

    // Objectives (only for current/completed chapters)
    if (isCurrent || isCompleted) {
      for (const obj of chapter.objectives) {
        const current = progress.objectiveProgress[obj.id] ?? 0;
        const done = current >= obj.requiredCount;
        const objRow = new Rectangle();
        objRow.width = 1;
        objRow.height = "22px";
        objRow.thickness = 0;
        objRow.background = "transparent";
        card.addControl(objRow);

        const objText = new TextBlock();
        const marker = done ? "✓" : "▸";
        objText.text = `  ${marker}  ${obj.title}  (${Math.min(current, obj.requiredCount)}/${obj.requiredCount})`;
        objText.color = done ? COLORS.accentGreen : COLORS.textSecondary;
        objText.fontSize = 12;
        objText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objText.paddingLeft = "10px";
        objRow.addControl(objText);
      }
    }

    // Completion bonus
    if (isCompleted) {
      this.addStatRow(card, "Bonus XP", `+${chapter.completionBonusXP}`, COLORS.accentYellow);
    }

    // CEFR lock message
    if (isLocked && !cefrMet) {
      const lockMsg = new TextBlock();
      lockMsg.text = `Requires CEFR ${chapter.requiredCefrLevel} to unlock`;
      lockMsg.color = COLORS.accentRed;
      lockMsg.fontSize = 11;
      lockMsg.height = "20px";
      lockMsg.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      lockMsg.paddingLeft = "4px";
      card.addControl(lockMsg);
    }
  }

  // ─── PORTFOLIO & LEARNING JOURNAL ──────────────────────────────────────

  private renderPortfolioSection(parent: StackPanel, portfolio: PortfolioData): void {
    this.addDivider(parent);
    this.addSectionHeader(parent, "Quest Portfolio");
    this.addSubHeader(parent, "Your completed quest achievements");

    const { summary } = portfolio;

    // Summary card
    const summaryCard = this.makeCard(parent);
    this.addStatRow(summaryCard, "Quests Completed", `${summary.totalCompleted}`, COLORS.accentGreen);
    this.addStatRow(summaryCard, "Total XP Earned", `${summary.totalXP}`, COLORS.accentYellow);
    this.addStatRow(summaryCard, "Current Streak", `${summary.currentStreak}`, COLORS.accent);
    this.addStatRow(summaryCard, "Longest Streak", `${summary.longestStreak}`, COLORS.accent);
    this.addStatRow(summaryCard, "Quest Givers Met", `${summary.uniqueQuestGivers}`, COLORS.textSecondary);
    this.addStatRow(summaryCard, "Quest Chains", `${summary.chainsCompleted}`, COLORS.textSecondary);

    // By quest type breakdown
    if (Object.keys(summary.byType).length > 0) {
      this.addDivider(parent);
      const typeCard = this.makeCard(parent);
      const typeHeader = new TextBlock();
      typeHeader.text = "By Quest Type";
      typeHeader.color = COLORS.textPrimary;
      typeHeader.fontSize = 13;
      typeHeader.fontWeight = "bold";
      typeHeader.height = "24px";
      typeHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      typeHeader.paddingLeft = "4px";
      typeCard.addControl(typeHeader);

      for (const [type, count] of Object.entries(summary.byType)) {
        this.addStatRow(typeCard, type, `${count}`, COLORS.textSecondary);
      }
    }

    // Recent completions (show up to 10)
    if (portfolio.entries.length > 0) {
      this.addDivider(parent);
      const recentHeader = new TextBlock();
      recentHeader.text = `Recent Completions (${Math.min(portfolio.entries.length, 10)} of ${portfolio.entries.length})`;
      recentHeader.color = COLORS.textPrimary;
      recentHeader.fontSize = 13;
      recentHeader.fontWeight = "bold";
      recentHeader.height = "26px";
      recentHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      recentHeader.paddingLeft = "4px";
      parent.addControl(recentHeader);

      for (const entry of portfolio.entries.slice(0, 10)) {
        this.renderPortfolioEntry(parent, entry);
      }
    }
  }

  private renderPortfolioEntry(parent: StackPanel, entry: PortfolioData['entries'][0]): void {
    const card = this.makeCard(parent);

    // Title row
    const titleRow = new Rectangle();
    titleRow.width = 1;
    titleRow.height = "24px";
    titleRow.thickness = 0;
    titleRow.background = "transparent";
    card.addControl(titleRow);

    const title = new TextBlock();
    title.text = `✓  ${entry.title}`;
    title.color = COLORS.accentGreen;
    title.fontSize = 13;
    title.fontWeight = "bold";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = "4px";
    titleRow.addControl(title);

    const xpBadge = new TextBlock();
    xpBadge.text = `+${entry.xpEarned} XP`;
    xpBadge.color = COLORS.accentYellow;
    xpBadge.fontSize = 11;
    xpBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    xpBadge.paddingRight = "4px";
    titleRow.addControl(xpBadge);

    // Details row
    const details: string[] = [entry.questType, entry.difficulty];
    if (entry.cefrLevel) details.push(`CEFR ${entry.cefrLevel}`);
    if (entry.assignedBy) details.push(`from ${entry.assignedBy}`);
    const date = new Date(entry.completedAt);
    details.push(date.toLocaleDateString());

    const detailText = new TextBlock();
    detailText.text = details.join("  ·  ");
    detailText.color = COLORS.textMuted;
    detailText.fontSize = 11;
    detailText.height = "18px";
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = "4px";
    card.addControl(detailText);

    // Skills gained
    if (entry.skillsGained.length > 0) {
      const skillsText = new TextBlock();
      skillsText.text = `Skills: ${entry.skillsGained.join(", ")}`;
      skillsText.color = COLORS.accent;
      skillsText.fontSize = 11;
      skillsText.height = "18px";
      skillsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      skillsText.paddingLeft = "4px";
      card.addControl(skillsText);
    }
  }

  private renderLearningJournalSection(parent: StackPanel, portfolio: PortfolioData): void {
    if (portfolio.journal.length === 0) return;

    this.addDivider(parent);
    this.addSectionHeader(parent, "Learning Journal");
    this.addSubHeader(parent, "Daily progress log");

    // Show up to 14 days
    for (const entry of portfolio.journal.slice(0, 14)) {
      const card = this.makeCard(parent);

      // Date header
      const dateRow = new Rectangle();
      dateRow.width = 1;
      dateRow.height = "22px";
      dateRow.thickness = 0;
      dateRow.background = "transparent";
      card.addControl(dateRow);

      const dateText = new TextBlock();
      const d = new Date(entry.date + 'T00:00:00');
      dateText.text = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      dateText.color = COLORS.textPrimary;
      dateText.fontSize = 13;
      dateText.fontWeight = "bold";
      dateText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      dateText.paddingLeft = "4px";
      dateRow.addControl(dateText);

      const questCount = new TextBlock();
      questCount.text = `${entry.questsCompleted} quest${entry.questsCompleted !== 1 ? 's' : ''}`;
      questCount.color = COLORS.accentGreen;
      questCount.fontSize = 11;
      questCount.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      questCount.paddingRight = "4px";
      dateRow.addControl(questCount);

      // Stats
      this.addStatRow(card, "XP Earned", `+${entry.xpEarned}`, COLORS.accentYellow);
      this.addStatRow(card, "Skills Practiced", entry.skillsPracticed.join(", "), COLORS.textSecondary);
      this.addStatRow(card, "Hardest Level", entry.highestDifficulty, COLORS.textSecondary);
      if (entry.streakCount > 0) {
        this.addStatRow(card, "Streak", `${entry.streakCount}`, COLORS.accent);
      }
    }
  }

  // ─── QUESTS TAB ─────────────────────────────────────────────────────────

  private _questTabFilter: 'current' | 'available' | 'completed' = 'current';
  private _activeGuildTab: string = 'all';

  private renderQuestsTab(): void {
    const { stack } = this.makeScrollableContent("quests");
    const allQuests = this.callbacks.getQuests();

    const current = allQuests.filter(q => q.status === "active");
    // Only show quests the player has actually discovered — chain/auto quests
    // are revealed automatically; notice_board/npc/guild quests require the
    // player to visit the board, talk to the NPC, or join the guild first.
    const available = allQuests.filter(q => {
      if (q.status !== "available") return false;
      const disc = q.discoveryMethod;
      // Auto and chain quests are always visible once available
      if (!disc || disc === 'auto' || disc === 'chain') return true;
      // NPC/guild/notice_board quests are NOT shown in the journal until
      // the player discovers them (talks to NPC, visits board, joins guild).
      // They appear as ? indicators in the world instead.
      return false;
    });
    const completed = allQuests.filter(q => q.status === "completed");

    this.addSectionHeader(stack, "Quests");

    // ── Tab bar ─────────────────────────────────────────────────────────────
    this.renderTabBar(stack, [
      { id: 'current' as const, label: 'Current', count: current.length, color: COLORS.accentGreen },
      { id: 'available' as const, label: 'Available', count: available.length, color: COLORS.accent },
      { id: 'completed' as const, label: 'Completed', count: completed.length, color: COLORS.textMuted },
    ], this._questTabFilter, (id) => {
      this._questTabFilter = id;
      this.renderQuestsTab();
    });

    // ── Filtered quest list ─────────────────────────────────────────────────
    const filtered = this._questTabFilter === 'current' ? current
      : this._questTabFilter === 'available' ? available
      : completed;

    if (filtered.length === 0) {
      const empty = new TextBlock();
      empty.text = this._questTabFilter === 'current' ? "No active quests. Check Available for new quests!"
        : this._questTabFilter === 'available' ? "No available quests right now."
        : "No completed quests yet.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "40px";
      empty.paddingTop = "12px";
      stack.addControl(empty);
      return;
    }

    for (const quest of filtered) {
      this.renderQuestCard(stack, quest);
    }
  }

  private renderQuestCard(parent: StackPanel, quest: MenuQuestData): void {
    const card = this.makeCard(parent);

    // ── Title row ──────────────────────────────────────────────────────────
    const titleRow = new Rectangle();
    titleRow.width = 1;
    titleRow.height = "24px";
    titleRow.thickness = 0;
    titleRow.background = "transparent";
    card.addControl(titleRow);

    const titleText = new TextBlock();
    titleText.text = quest.title;
    titleText.color = COLORS.textPrimary;
    titleText.fontSize = 14;
    titleText.fontWeight = "bold";
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleRow.addControl(titleText);

    // XP badge on the right
    if (quest.experienceReward) {
      const xpBadge = new TextBlock();
      xpBadge.text = `${quest.experienceReward} XP`;
      xpBadge.color = COLORS.gold;
      xpBadge.fontSize = 11;
      xpBadge.fontWeight = "bold";
      xpBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      titleRow.addControl(xpBadge);
    }

    // ── Description ────────────────────────────────────────────────────────
    if (quest.description) {
      const desc = new TextBlock();
      desc.text = quest.description;
      desc.color = COLORS.textSecondary;
      desc.fontSize = 11;
      desc.textWrapping = TextWrapping.WordWrap;
      desc.resizeToFit = true;
      desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      desc.paddingBottom = "4px";
      card.addControl(desc);
    }

    // ── Meta row ───────────────────────────────────────────────────────────
    const metaRow = new StackPanel();
    metaRow.isVertical = false;
    metaRow.width = 1;
    metaRow.height = "18px";
    card.addControl(metaRow);

    if (quest.questType) {
      const typeBadge = this.makeInlineBadge(quest.questType, COLORS.accent);
      metaRow.addControl(typeBadge);
    }
    if (quest.difficulty) {
      const diffColor =
        quest.difficulty === "beginner" || quest.difficulty === "easy" ? COLORS.accentGreen :
        quest.difficulty === "advanced" || quest.difficulty === "hard" ? COLORS.accentRed :
        COLORS.accentYellow;
      const diffBadge = this.makeInlineBadge(quest.difficulty, diffColor);
      metaRow.addControl(diffBadge);
    }
    if (quest.assignedBy) {
      const giverBadge = this.makeInlineBadge(`from ${quest.assignedBy}`, COLORS.textMuted);
      metaRow.addControl(giverBadge);
    }

    // ── Objectives ─────────────────────────────────────────────────────────
    const objectives = quest.objectives || [];
    if (objectives.length > 0) {
      const objHeader = new TextBlock();
      objHeader.text = "Objectives";
      objHeader.color = COLORS.textSecondary;
      objHeader.fontSize = 10;
      objHeader.fontWeight = "bold";
      objHeader.height = "20px";
      objHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      objHeader.paddingTop = "4px";
      card.addControl(objHeader);

      objectives.forEach((obj) => {
        const objRow = new StackPanel();
        objRow.isVertical = false;
        objRow.width = 1;
        objRow.height = "18px";
        card.addControl(objRow);

        // Checkbox indicator
        const check = new TextBlock();
        check.text = obj.completed ? "✓" : "○";
        check.color = obj.completed ? COLORS.accentGreen : COLORS.textMuted;
        check.fontSize = 11;
        check.width = "18px";
        check.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(check);

        // Description — constrain width when progress count is shown
        const hasCount = obj.required && obj.required > 1;
        const objDesc = new TextBlock();
        objDesc.text = obj.description || obj.type;
        objDesc.color = obj.completed ? COLORS.textSecondary : COLORS.textPrimary;
        objDesc.fontSize = 11;
        if (hasCount) objDesc.width = 0.75; // leave room for progress count
        objDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(objDesc);

        // Progress count if countable — yellow, right-aligned
        if (hasCount) {
          const countText = new TextBlock();
          countText.text = `${obj.current || 0}/${obj.required}`;
          countText.color = "#FFD700"; // gold/yellow for visibility
          countText.fontSize = 11;
          countText.fontWeight = "bold";
          countText.width = 0.25;
          countText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          objRow.addControl(countText);
        }
      });

      // Overall progress bar
      const completedCount = objectives.filter(o => o.completed).length;
      if (objectives.length > 1) {
        const progressBg = new Rectangle();
        progressBg.width = 1;
        progressBg.height = "6px";
        progressBg.background = "rgba(255,255,255,0.08)";
        progressBg.thickness = 0;
        progressBg.cornerRadius = 3;
        progressBg.paddingTop = "4px";
        card.addControl(progressBg);

        const progressFill = new Rectangle();
        const pct = objectives.length > 0 ? completedCount / objectives.length : 0;
        progressFill.width = Math.max(pct, 0.02); // min 2% so it's visible
        progressFill.height = 1;
        progressFill.background = pct >= 1 ? COLORS.accentGreen : COLORS.accent;
        progressFill.thickness = 0;
        progressFill.cornerRadius = 3;
        progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        progressBg.addControl(progressFill);
      }
    }

    // "Make Active" button for available quests
    if (quest.status === "available" && this.callbacks.onQuestSetActive) {
      const btnRow = new Rectangle();
      btnRow.width = 1;
      btnRow.height = "26px";
      btnRow.thickness = 0;
      btnRow.background = "transparent";
      btnRow.paddingTop = "4px";
      card.addControl(btnRow);

      const btn = new Rectangle();
      btn.width = "100px";
      btn.height = "22px";
      btn.background = "rgba(66, 165, 245, 0.25)";
      btn.color = COLORS.accent;
      btn.thickness = 1;
      btn.cornerRadius = 4;
      btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.isPointerBlocker = true;
      btn.hoverCursor = "pointer";

      const btnLabel = new TextBlock();
      btnLabel.text = "▶ Make Active";
      btnLabel.color = COLORS.accent;
      btnLabel.fontSize = 10;
      btnLabel.fontWeight = "bold";
      btn.addControl(btnLabel);

      btn.onPointerEnterObservable.add(() => { btn.background = "rgba(66, 165, 245, 0.45)"; });
      btn.onPointerOutObservable.add(() => { btn.background = "rgba(66, 165, 245, 0.25)"; });
      btn.onPointerClickObservable.add(() => {
        this.callbacks.onQuestSetActive!(quest.id);
        // Re-render the tab to reflect the change
        this.renderQuestsTab();
      });

      btnRow.addControl(btn);
    }

    // Status badge for active quests
    if (quest.status === "active") {
      const activeBadgeRow = new Rectangle();
      activeBadgeRow.width = 1;
      activeBadgeRow.height = "22px";
      activeBadgeRow.thickness = 0;
      activeBadgeRow.background = "transparent";
      activeBadgeRow.paddingTop = "4px";
      card.addControl(activeBadgeRow);

      const badge = new Rectangle();
      badge.width = "80px";
      badge.height = "18px";
      badge.background = "rgba(76, 175, 80, 0.2)";
      badge.cornerRadius = 3;
      badge.thickness = 0;
      badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

      const badgeLabel = new TextBlock();
      badgeLabel.text = "● Active";
      badgeLabel.color = COLORS.accentGreen;
      badgeLabel.fontSize = 10;
      badgeLabel.fontWeight = "bold";
      badge.addControl(badgeLabel);

      activeBadgeRow.addControl(badge);
    }

    // Card bottom spacer
    const spacer = new Rectangle();
    spacer.width = 1;
    spacer.height = "6px";
    spacer.thickness = 0;
    spacer.background = "transparent";
    parent.addControl(spacer);
  }

  private makeInlineBadge(text: string, color: string): Rectangle {
    const badge = new Rectangle();
    badge.width = `${Math.max(text.length * 7 + 12, 50)}px`;
    badge.height = "16px";
    badge.background = "rgba(255,255,255,0.06)";
    badge.cornerRadius = 3;
    badge.thickness = 0;
    badge.paddingRight = "4px";

    const label = new TextBlock();
    label.text = text;
    label.color = color;
    label.fontSize = 9;
    label.fontWeight = "bold";
    badge.addControl(label);

    return badge;
  }

  // ─── INVENTORY TAB ──────────────────────────────────────────────────────

  private renderInventoryTab(): void {
    const { stack } = this.makeScrollableContent("inv");
    const items = this.callbacks.getInventoryItems();

    this.addSectionHeader(stack, "Inventory");
    this.addSubHeader(stack, `${items.length} item${items.length !== 1 ? "s" : ""}`);

    if (items.length === 0) {
      const empty = new TextBlock();
      empty.text = "Your inventory is empty. Explore the world to find items!";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "33px";
      stack.addControl(empty);
      return;
    }

    // Group items by type
    const grouped = new Map<string, MenuInventoryItem[]>();
    items.forEach((item) => {
      const type = item.type || "misc";
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(item);
    });

    grouped.forEach((typeItems, type) => {
      // Type header
      const typeHeader = new TextBlock();
      typeHeader.text = type.charAt(0).toUpperCase() + type.slice(1);
      typeHeader.color = COLORS.accent;
      typeHeader.fontSize = 12;
      typeHeader.fontWeight = "bold";
      typeHeader.height = "24px";
      typeHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      typeHeader.paddingTop = "6px";
      stack.addControl(typeHeader);

      typeItems.forEach((item) => {
        const card = this.makeCard(stack);

        const nameRow = new Rectangle();
        nameRow.width = 1;
        nameRow.height = "21px";
        nameRow.thickness = 0;
        nameRow.background = "transparent";
        card.addControl(nameRow);

        const nameText = new TextBlock();
        const itemDisplayName = getItemTranslation(item, this.targetLanguage)?.targetWord || item.name;
        nameText.text = `${item.icon || "•"} ${itemDisplayName}`;
        nameText.color = COLORS.textPrimary;
        nameText.fontSize = 12;
        nameText.fontWeight = "bold";
        nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameRow.addControl(nameText);

        if (item.quantity > 1) {
          const qty = new TextBlock();
          qty.text = `×${item.quantity}`;
          qty.color = COLORS.accentYellow;
          qty.fontSize = 12;
          qty.fontWeight = "bold";
          qty.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          nameRow.addControl(qty);
        }

        if (item.description) {
          const desc = new TextBlock();
          desc.text = item.description;
          desc.color = COLORS.textSecondary;
          desc.fontSize = 12;
          desc.height = "18px";
          desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          card.addControl(desc);
        }
      });
    });
  }

  // ─── MAP TAB ────────────────────────────────────────────────────────────

  /** Reusable canvas for compositing the menu map view. */
  private _menuMapCanvas: HTMLCanvasElement | null = null;
  private _menuMapCtx: CanvasRenderingContext2D | null = null;

  private renderMapTab(): void {
    const { stack } = this.makeScrollableContent("map");

    const minimapData = this.callbacks.getMinimapData?.() ?? null;
    const snapshot = this.callbacks.getWorldSnapshot?.() ?? null;

    this.addSectionHeader(stack, "World Map");

    if (!minimapData || minimapData.settlements.length === 0) {
      const empty = new TextBlock();
      empty.text = "Map data not available";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "33px";
      stack.addControl(empty);
      return;
    }

    this.addSubHeader(stack, `${minimapData.settlements.length} settlements discovered`);

    // ── Large rendered map (reuses world snapshot like FullscreenMap) ────
    const MAP_PX = 480;

    const mapFrame = new Rectangle("fullMap");
    mapFrame.width = `${MAP_PX + 4}px`;
    mapFrame.height = `${MAP_PX + 4}px`;
    mapFrame.background = "rgba(20, 20, 30, 0.95)";
    mapFrame.cornerRadius = 6;
    mapFrame.color = COLORS.cardBorder;
    mapFrame.thickness = 1;
    mapFrame.isPointerBlocker = false;
    stack.addControl(mapFrame);

    // Render the snapshot + overlays onto a canvas, then display as Image
    const mapImage = new Image("menuMapImage");
    mapImage.width = `${MAP_PX}px`;
    mapImage.height = `${MAP_PX}px`;
    mapFrame.addControl(mapImage);

    // Container for dynamic GUI markers on top of the image
    const mapContainer = new Container("menuMapMarkerContainer");
    mapContainer.width = `${MAP_PX}px`;
    mapContainer.height = `${MAP_PX}px`;
    mapFrame.addControl(mapContainer);

    // Composit the snapshot + streets onto the canvas
    if (!this._menuMapCanvas) {
      this._menuMapCanvas = document.createElement("canvas");
      this._menuMapCanvas.width = MAP_PX;
      this._menuMapCanvas.height = MAP_PX;
      this._menuMapCtx = this._menuMapCanvas.getContext("2d");
    }
    const ctx = this._menuMapCtx;
    if (ctx) {
      ctx.clearRect(0, 0, MAP_PX, MAP_PX);
      if (snapshot) {
        ctx.drawImage(snapshot, 0, 0, MAP_PX, MAP_PX);
      } else {
        ctx.fillStyle = "rgba(20, 20, 30, 1)";
        ctx.fillRect(0, 0, MAP_PX, MAP_PX);
      }
      // Draw streets
      if (minimapData.streets && minimapData.streets.length > 0) {
        const worldSize = minimapData.worldSize;
        const worldHalf = worldSize / 2;
        ctx.save();
        ctx.strokeStyle = "rgba(200, 200, 200, 0.5)";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const street of minimapData.streets) {
          if (street.waypoints.length < 2) continue;
          ctx.lineWidth = Math.max(1, (street.width / worldSize) * MAP_PX);
          ctx.beginPath();
          const sx = ((street.waypoints[0].x + worldHalf) / worldSize) * MAP_PX;
          const sy = ((-street.waypoints[0].z + worldHalf) / worldSize) * MAP_PX;
          ctx.moveTo(sx, sy);
          for (let i = 1; i < street.waypoints.length; i++) {
            const px = ((street.waypoints[i].x + worldHalf) / worldSize) * MAP_PX;
            const py = ((-street.waypoints[i].z + worldHalf) / worldSize) * MAP_PX;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // Draw buildings
      if (minimapData.buildings && minimapData.buildings.length > 0) {
        const worldSize = minimapData.worldSize;
        const worldHalf = worldSize / 2;
        ctx.save();
        for (const b of minimapData.buildings) {
          const bx = ((b.position.x + worldHalf) / worldSize) * MAP_PX;
          const by = ((-b.position.z + worldHalf) / worldSize) * MAP_PX;
          const bw = Math.max(2, ((b.width ?? 6) / worldSize) * MAP_PX);
          const bh = Math.max(2, ((b.depth ?? 6) / worldSize) * MAP_PX);
          ctx.fillStyle = b.type === "business" ? "rgba(100,149,237,0.6)"
            : b.type === "residence" ? "rgba(210,180,140,0.6)"
            : "rgba(160,160,160,0.5)";
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
        }
        ctx.restore();
      }
      mapImage.source = this._menuMapCanvas.toDataURL("image/jpeg", 0.9);
    }

    // ── Helper: world coords → map pixel offset ──
    const worldSize = minimapData.worldSize;
    const worldHalf = worldSize / 2;
    const mapHalf = MAP_PX / 2;
    const toMap = (wx: number, wz: number): [number, number] => {
      const mx = ((wx + worldHalf) / worldSize) * MAP_PX - mapHalf;
      const mz = ((-wz + worldHalf) / worldSize) * MAP_PX - mapHalf;
      return [mx, mz];
    };

    // ── Shared tooltip for map markers ──
    const tooltip = new Rectangle("menuMapTooltip");
    tooltip.adaptWidthToChildren = true;
    tooltip.adaptHeightToChildren = true;
    tooltip.background = "rgba(0, 0, 0, 0.85)";
    tooltip.color = "rgba(255, 255, 255, 0.3)";
    tooltip.thickness = 1;
    tooltip.cornerRadius = 4;
    tooltip.paddingLeft = "6px";
    tooltip.paddingRight = "6px";
    tooltip.paddingTop = "3px";
    tooltip.paddingBottom = "3px";
    tooltip.isVisible = false;
    tooltip.isPointerBlocker = false;
    tooltip.zIndex = 100;

    const tooltipText = new TextBlock("menuMapTooltipText");
    tooltipText.color = "#FFFFFF";
    tooltipText.fontSize = 10;
    tooltipText.resizeToFit = true;
    tooltipText.textWrapping = true;
    tooltip.addControl(tooltipText);
    // Add tooltip last so it renders on top
    const showTooltip = (text: string, x: number, y: number) => {
      tooltipText.text = text;
      tooltip.left = `${x}px`;
      tooltip.top = `${y - 18}px`;
      tooltip.isVisible = true;
    };
    const hideTooltip = () => { tooltip.isVisible = false; };

    // Track all hoverable markers for proximity-based tooltip
    const hoverTargets: Array<{ mx: number; mz: number; label: string; dot: Ellipse | Rectangle; origColor: string }> = [];
    let activeHover: typeof hoverTargets[0] | null = null;

    const registerHoverable = (label: string, mx: number, mz: number, dot: Ellipse | Rectangle, origColor: string) => {
      hoverTargets.push({ mx, mz, label, dot, origColor });
    };

    // Hover detection: use a transparent overlay on top of everything that
    // captures pointer events and does proximity-based hit testing.
    const hoverOverlay = new Rectangle("menuMapHoverOverlay");
    hoverOverlay.width = `${MAP_PX}px`;
    hoverOverlay.height = `${MAP_PX}px`;
    hoverOverlay.thickness = 0;
    hoverOverlay.background = "transparent";
    hoverOverlay.isPointerBlocker = true;
    hoverOverlay.zIndex = 99;

    hoverOverlay.onPointerMoveObservable.add((pi) => {
      if (hoverTargets.length === 0) return;
      // pi.x / pi.y are in screen pixels — convert relative to the overlay center
      const measure = (hoverOverlay as any)._currentMeasure;
      if (!measure) return;
      const relX = pi.x - measure.left - measure.width / 2;
      const relY = pi.y - measure.top - measure.height / 2;

      let nearest: typeof hoverTargets[0] | null = null;
      let nearestDist = 16;
      for (const t of hoverTargets) {
        const dx = relX - t.mx;
        const dy = relY - t.mz;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = t;
        }
      }

      if (nearest !== activeHover) {
        if (activeHover) activeHover.dot.color = activeHover.origColor;
        activeHover = nearest;
        if (nearest) {
          showTooltip(nearest.label, nearest.mx, nearest.mz);
          nearest.dot.color = "#FFFFFF";
        } else {
          hideTooltip();
        }
      }
    });
    hoverOverlay.onPointerOutObservable.add(() => {
      if (activeHover) {
        activeHover.dot.color = activeHover.origColor;
        activeHover = null;
      }
      hideTooltip();
    });

    // ── Settlement markers ──
    for (const s of minimapData.settlements) {
      const [sx, sz] = toMap(s.position.x, s.position.z);
      const dot = new Ellipse(`menuMapSettDot_${s.id}`);
      dot.width = "10px";
      dot.height = "10px";
      dot.background = s.type === "city" ? "#9C27B0" : s.type === "town" ? "#2196F3" : "#4CAF50";
      dot.color = "white";
      dot.thickness = 1;
      dot.left = `${sx}px`;
      dot.top = `${sz}px`;
      mapContainer.addControl(dot);

      const label = new TextBlock(`menuMapSettLabel_${s.id}`, s.name);
      label.fontSize = 10;
      label.color = "white";
      label.left = `${sx}px`;
      label.top = `${sz - 13}px`;
      label.resizeToFit = true;
      mapContainer.addControl(label);
    }

    // ── NPC markers ──
    if (minimapData.npcPositions) {
      for (const npc of minimapData.npcPositions) {
        const [nx, nz] = toMap(npc.position.x, npc.position.z);
        // Unified taxonomy: read QuestMarkerKind produced by
        // selectNpcMarker(..., 'minimap') in BabylonGame.
        const kind = (npc as any).questMarkerKind as QuestMarkerKind | null;

        if (kind) {
          // Style (color, glyph, size, pulsing) comes from the single
          // MARKER_STYLES registry in QuestMarkerService. No local color
          // switch — one source of truth.
          const style = MARKER_STYLES[kind];
          const indicatorColor = style.color;
          const indicatorSymbol = style.symbol;
          const markerSize = style.minimapSize;
          const glowEnabled = style.minimapPulsing;

          if (glowEnabled) {
            const glow = new Ellipse(`menuMapNpcGlow_${npc.id}`);
            glow.width = `${markerSize + 4}px`;
            glow.height = `${markerSize + 4}px`;
            glow.background = `${indicatorColor}33`;
            glow.color = `${indicatorColor}80`;
            glow.thickness = 1;
            glow.left = `${nx}px`;
            glow.top = `${nz}px`;
            mapContainer.addControl(glow);
          }

          // Prominence: turn_in + active_objective get thicker borders
          // and higher-contrast glyph color, the ?-kind markers stay
          // quieter to match the visual hierarchy in the 3D world.
          const isProminent = kind === 'turn_in' || kind === 'active_objective';
          const qdot = new Ellipse(`menuMapNpcQ_${npc.id}`);
          qdot.width = `${markerSize}px`;
          qdot.height = `${markerSize}px`;
          qdot.background = indicatorColor;
          qdot.color = isProminent ? '#FFFFFF' : '#FFFFFF80';
          qdot.thickness = isProminent ? 2 : 1;
          qdot.left = `${nx}px`;
          qdot.top = `${nz}px`;
          mapContainer.addControl(qdot);

          const qtext = new TextBlock(`menuMapNpcQT_${npc.id}`, indicatorSymbol);
          qtext.color = isProminent ? '#FFFFFF' : '#000000';
          qtext.fontSize = isProminent ? 11 : 9;
          qtext.fontWeight = 'bold';
          qtext.left = `${nx}px`;
          qtext.top = `${nz}px`;
          mapContainer.addControl(qtext);

          // Hover tooltip — label comes from the registry so tooltip
          // language auto-updates when styles evolve.
          const npcName = (npc as any).name || 'NPC';
          registerHoverable(`${npcName} — ${style.label}`, nx, nz, qdot, qdot.color as string);
        } else {
          // Regular NPC dot
          const dot = new Ellipse(`menuMapNpc_${npc.id}`);
          dot.width = "6px";
          dot.height = "6px";
          dot.thickness = 0;
          dot.background = npc.role === "guard" ? "#F44336"
            : npc.role === "merchant" ? "#4CAF50"
            : npc.role === "questgiver" ? "#FFC107"
            : "rgba(200,200,200,0.7)";
          dot.left = `${nx}px`;
          dot.top = `${nz}px`;
          mapContainer.addControl(dot);
        }
      }
    }

    // ── Quest markers ──
    if (minimapData.questMarkers) {
      for (const quest of minimapData.questMarkers) {
        const [qx, qz] = toMap(quest.position.x, quest.position.z);
        const marker = new Rectangle(`menuMapQuest_${quest.id}`);
        marker.width = "12px";
        marker.height = "12px";
        marker.background = "#E040FB";
        marker.color = "#FFFFFF";
        marker.thickness = 1;
        marker.cornerRadius = 2;
        marker.rotation = Math.PI / 4;
        marker.left = `${qx}px`;
        marker.top = `${qz}px`;
        mapContainer.addControl(marker);

        const qlabel = new TextBlock(`menuMapQuestLabel_${quest.id}`, quest.title);
        qlabel.fontSize = 9;
        qlabel.color = "#E040FB";
        qlabel.left = `${qx}px`;
        qlabel.top = `${qz - 13}px`;
        qlabel.resizeToFit = true;
        mapContainer.addControl(qlabel);
      }
    }

    // ── Quest objective markers ──
    if (minimapData.questObjectiveMarkers) {
      for (const obj of minimapData.questObjectiveMarkers) {
        const [ox, oz] = toMap(obj.position.x, obj.position.z);
        const objMarker = new Ellipse(`menuMapObj_${obj.id}`);
        objMarker.width = "10px";
        objMarker.height = "10px";
        objMarker.background = obj.color || "#E040FB";
        objMarker.color = "#FFFFFF";
        objMarker.thickness = 1;
        objMarker.left = `${ox}px`;
        objMarker.top = `${oz}px`;
        mapContainer.addControl(objMarker);

        const objDesc = obj.objectiveDescription || obj.objectiveType || 'Quest objective';
        registerHoverable(`${obj.questTitle}: ${objDesc}`, ox, oz, objMarker, objMarker.color as string);
      }
    }

    // ── Notice board markers ──
    if (minimapData.noticeBoards) {
      for (const board of minimapData.noticeBoards) {
        const [bx, bz] = toMap(board.position.x, board.position.z);

        const boardGlow = new Ellipse(`menuMapBoardGlow_${board.id}`);
        boardGlow.width = "20px";
        boardGlow.height = "20px";
        boardGlow.background = "rgba(255, 215, 0, 0.2)";
        boardGlow.color = "rgba(255, 215, 0, 0.5)";
        boardGlow.thickness = 1;
        boardGlow.left = `${bx}px`;
        boardGlow.top = `${bz}px`;
        mapContainer.addControl(boardGlow);

        const boardDot = new Rectangle(`menuMapBoard_${board.id}`);
        boardDot.width = "14px";
        boardDot.height = "14px";
        boardDot.background = "#C0A050";
        boardDot.color = "#FFFFFF80";
        boardDot.thickness = 1;
        boardDot.cornerRadius = 2;
        boardDot.left = `${bx}px`;
        boardDot.top = `${bz}px`;
        mapContainer.addControl(boardDot);

        const boardText = new TextBlock(`menuMapBoardT_${board.id}`, '?');
        boardText.color = "#000000";
        boardText.fontSize = 9;
        boardText.fontWeight = "bold";
        boardText.left = `${bx}px`;
        boardText.top = `${bz}px`;
        mapContainer.addControl(boardText);

        registerHoverable(`Notice Board — ${board.questCount} quest${board.questCount > 1 ? 's' : ''} available`, bx, bz, boardDot, "#FFFFFF80");
      }
    }

    // ── Quest item markers (gold circles for fetch quest collectibles) ──
    if (minimapData.questItemMarkers) {
      for (const item of minimapData.questItemMarkers) {
        const [ix, iz] = toMap(item.position.x, item.position.z);
        const itemMarker = new Ellipse(`menuMapQuestItem_${item.id}`);
        itemMarker.width = "8px";
        itemMarker.height = "8px";
        itemMarker.background = "#FFD700";
        itemMarker.color = "#FFFFFF";
        itemMarker.thickness = 1;
        itemMarker.left = `${ix}px`;
        itemMarker.top = `${iz}px`;
        mapContainer.addControl(itemMarker);
      }
    }

    // ── Player marker (always on top) ──
    const [ppx, ppz] = toMap(minimapData.playerPosition.x, minimapData.playerPosition.z);
    const playerOuter = new Ellipse("menuMapPlayerOuter");
    playerOuter.width = "18px";
    playerOuter.height = "18px";
    playerOuter.background = "rgba(0,0,0,0.4)";
    playerOuter.color = "transparent";
    playerOuter.thickness = 0;
    playerOuter.left = `${ppx}px`;
    playerOuter.top = `${ppz}px`;
    mapContainer.addControl(playerOuter);

    const playerDot = new Ellipse("menuMapPlayerDot");
    playerDot.width = "14px";
    playerDot.height = "14px";
    playerDot.background = "#FFC107";
    playerDot.color = "white";
    playerDot.thickness = 2;
    playerDot.left = `${ppx}px`;
    playerDot.top = `${ppz}px`;
    mapContainer.addControl(playerDot);

    // Player direction arrow
    const dirAngle = minimapData.playerRotationY || 0;
    const arrowDist = 14;
    // playerRotationY: 0 = facing -Z (north on map = up), positive = clockwise
    const arrowDx = Math.sin(dirAngle) * arrowDist;
    const arrowDz = -Math.cos(dirAngle) * arrowDist;
    const dirArrow = new TextBlock("menuMapPlayerDir", "\u25B2");
    dirArrow.fontSize = 12;
    dirArrow.fontWeight = "bold";
    dirArrow.color = "#FFC107";
    dirArrow.left = `${ppx + arrowDx}px`;
    dirArrow.top = `${ppz + arrowDz}px`;
    dirArrow.rotation = dirAngle;
    mapContainer.addControl(dirArrow);

    // Add hover overlay and tooltip on top of everything
    mapFrame.addControl(hoverOverlay);
    hoverOverlay.addControl(tooltip);

    // ── Legend ──
    this.addDivider(stack);
    const legendCard = this.makeCard(stack);
    this.addStatRow(legendCard, "Yellow dot", "You", "#FFC107");
    this.addStatRow(legendCard, "Gold ?", "Quest available", "#FFD700");
    this.addStatRow(legendCard, "Gold !", "Quest objective / Notice Board", "#FFD700");
    this.addStatRow(legendCard, "Green \u2713", "Quest turn-in", "#32CD32");
    this.addStatRow(legendCard, "Purple dot", "City", "#9C27B0");
    this.addStatRow(legendCard, "Blue dot", "Town", "#2196F3");
    this.addStatRow(legendCard, "Green dot", "Village / Merchant", "#4CAF50");
    this.addStatRow(legendCard, "Red dot", "Guard", "#F44336");

    // ── Settlement list below map ──
    this.addDivider(stack);
    const settlements = this.callbacks.getSettlements();
    if (settlements.length > 0) {
      const settTitle = new TextBlock();
      settTitle.text = "Settlements";
      settTitle.color = COLORS.textPrimary;
      settTitle.fontSize = 15;
      settTitle.fontWeight = "bold";
      settTitle.height = "29px";
      settTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(settTitle);

      settlements.forEach((s) => {
        const card = this.makeCard(stack);
        this.addStatRow(card, "Name", s.name, COLORS.textPrimary);
        this.addStatRow(card, "Type", s.type, COLORS.textSecondary);
        this.addStatRow(card, "Population", `${s.population.toLocaleString()}`, COLORS.textSecondary);
        this.addStatRow(card, "Buildings", `${s.buildingCount}`, COLORS.textSecondary);
        if (s.terrain) {
          this.addStatRow(card, "Terrain", s.terrain, COLORS.textSecondary);
        }
      });
    }
  }

  // ─── CONTACT LIST TAB ───────────────────────────────────────────────────

  private renderContactsTab(): void {
    const { stack } = this.makeScrollableContent("contacts");
    const contacts = this.callbacks.getContacts?.() || [];

    this.addSectionHeader(stack, "Contact List");

    if (contacts.length === 0) {
      const empty = new TextBlock();
      empty.text = "No contacts yet.\nSpeak with NPCs in person to add them to your contact list.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "50px";
      empty.textWrapping = true;
      stack.addControl(empty);
      return;
    }

    this.addSubHeader(stack, `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`);

    // Sort: most recently spoken to first
    const sorted = [...contacts].sort((a, b) => b.lastSpokenTimestamp - a.lastSpokenTimestamp);

    sorted.forEach((contact) => {
      const card = this.makeCard(stack);

      // Name row with role badge
      const nameRow = new Rectangle();
      nameRow.width = 1;
      nameRow.height = "21px";
      nameRow.thickness = 0;
      nameRow.background = "transparent";
      card.addControl(nameRow);

      const roleIcon =
        contact.role === "guard" ? "🛡️" :
        contact.role === "merchant" ? "🪙" :
        contact.role === "questgiver" ? "❗" : "🧑";

      const nameText = new TextBlock();
      nameText.text = `${roleIcon} ${contact.name}`;
      nameText.color = contact.questGiver ? COLORS.accentYellow : COLORS.textPrimary;
      nameText.fontSize = 13;
      nameText.fontWeight = "bold";
      nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      nameRow.addControl(nameText);

      if (contact.role) {
        const roleBadge = new TextBlock();
        roleBadge.text = contact.role.toUpperCase();
        roleBadge.color = COLORS.textMuted;
        roleBadge.fontSize = 10;
        roleBadge.fontWeight = "bold";
        roleBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        nameRow.addControl(roleBadge);
      }

      // Occupation
      if (contact.occupation) {
        const occText = new TextBlock();
        occText.text = contact.occupation;
        occText.color = COLORS.textSecondary;
        occText.fontSize = 12;
        occText.height = "17px";
        occText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(occText);
      }

      // Known details
      if (contact.knownDetails.length > 0) {
        const detailsHeader = new TextBlock();
        detailsHeader.text = "What you know:";
        detailsHeader.color = COLORS.textMuted;
        detailsHeader.fontSize = 10;
        detailsHeader.height = "16px";
        detailsHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(detailsHeader);

        for (const detail of contact.knownDetails.slice(0, 4)) {
          const detailText = new TextBlock();
          detailText.text = `  · ${detail}`;
          detailText.color = COLORS.textSecondary;
          detailText.fontSize = 11;
          detailText.height = "15px";
          detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          card.addControl(detailText);
        }
        if (contact.knownDetails.length > 4) {
          const moreText = new TextBlock();
          moreText.text = `  +${contact.knownDetails.length - 4} more...`;
          moreText.color = COLORS.textMuted;
          moreText.fontSize = 10;
          moreText.height = "14px";
          moreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          card.addControl(moreText);
        }
      }

      // Stats row
      const timeAgo = this.formatTimeAgo(contact.lastSpokenTimestamp);
      this.addStatRow(card, "Conversations", `${contact.conversationCount}`, COLORS.textSecondary);
      this.addStatRow(card, "Last spoken", timeAgo, COLORS.textMuted);

      // Call button
      const callBtn = Button.CreateSimpleButton(`callNPC_${contact.id}`, "📞 Call");
      callBtn.width = "80px";
      callBtn.height = "25px";
      callBtn.color = "white";
      callBtn.background = COLORS.accentGreen;
      callBtn.cornerRadius = 5;
      callBtn.fontSize = 12;
      callBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      callBtn.onPointerClickObservable.add(() => {
        this.callbacks.onNPCCalled?.(contact.id);
        this.close();
      });
      callBtn.onPointerEnterObservable.add(() => {
        callBtn.background = "#2E9348";
      });
      callBtn.onPointerOutObservable.add(() => {
        callBtn.background = COLORS.accentGreen;
      });
      card.addControl(callBtn);

      // Spacer
      const spacer = new Rectangle();
      spacer.width = 1;
      spacer.height = "5px";
      spacer.thickness = 0;
      spacer.background = "transparent";
      stack.addControl(spacer);
    });
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // ─── NOTIFICATIONS TAB ──────────────────────────────────────────────────

  private renderNotificationsTab(): void {
    const { stack } = this.makeScrollableContent("notifications");

    this.addSectionHeader(stack, "Notifications");

    const items = NotificationStore.all();

    if (items.length === 0) {
      const empty = new TextBlock();
      empty.text = "No notifications yet.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "40px";
      empty.textWrapping = true;
      stack.addControl(empty);
      return;
    }

    this.addSubHeader(stack, `${items.length} notification${items.length !== 1 ? "s" : ""}`);

    // Clear all button
    const clearBtn = Button.CreateSimpleButton("clearNotifs", "Clear All");
    clearBtn.width = "90px";
    clearBtn.height = "26px";
    clearBtn.color = COLORS.textSecondary;
    clearBtn.background = COLORS.cardBg;
    clearBtn.fontSize = 11;
    clearBtn.cornerRadius = 4;
    clearBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    clearBtn.onPointerClickObservable.add(() => {
      NotificationStore.clear();
      this.refreshActiveTab();
    });
    stack.addControl(clearBtn);

    this.addDivider(stack);

    for (const n of items) {
      const card = this.makeCard(stack);

      // Header row: icon + title + time
      const headerRow = new Rectangle();
      headerRow.width = 1;
      headerRow.height = "20px";
      headerRow.thickness = 0;
      headerRow.background = "transparent";
      card.addControl(headerRow);

      const titleText = new TextBlock();
      titleText.text = `${n.icon ? n.icon + " " : ""}${n.title}`;
      titleText.color = n.color || COLORS.textPrimary;
      titleText.fontSize = 12;
      titleText.fontWeight = "bold";
      titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      headerRow.addControl(titleText);

      // Timestamp
      const timeText = new TextBlock();
      const date = new Date(n.timestamp);
      const h = date.getHours().toString().padStart(2, "0");
      const m = date.getMinutes().toString().padStart(2, "0");
      timeText.text = `${h}:${m}`;
      timeText.color = COLORS.textMuted;
      timeText.fontSize = 10;
      timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      headerRow.addControl(timeText);

      // Description
      if (n.description) {
        const descText = new TextBlock();
        descText.text = n.description;
        descText.color = COLORS.textSecondary;
        descText.fontSize = 11;
        descText.height = "18px";
        descText.textWrapping = TextWrapping.WordWrap;
        descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(descText);
      }

      // Category badge
      if (n.category) {
        const badge = new TextBlock();
        badge.text = n.category.toUpperCase();
        badge.color = COLORS.textMuted;
        badge.fontSize = 9;
        badge.height = "14px";
        badge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(badge);
      }
    }
  }

  // ─── SYSTEM TAB ─────────────────────────────────────────────────────────

  private renderCraftingTab(): void {
    const { stack } = this.makeScrollableContent("crafting");
    this.addSectionHeader(stack, "Crafting");

    const recipes = this.callbacks.getCraftingRecipes?.() || [];

    if (recipes.length === 0) {
      const empty = new TextBlock();
      empty.text = "No recipes discovered yet. Find recipe documents or visit crafting stations to learn new recipes.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "33px";
      empty.textWrapping = true;
      stack.addControl(empty);
      return;
    }

    this.addSubHeader(stack, `${recipes.length} recipe${recipes.length !== 1 ? "s" : ""}`);

    // Group recipes by category
    const grouped = new Map<string, typeof recipes>();
    for (const recipe of recipes) {
      const cat = recipe.category || "misc";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(recipe);
    }

    grouped.forEach((catRecipes, category) => {
      const catHeader = new TextBlock();
      catHeader.text = category.charAt(0).toUpperCase() + category.slice(1);
      catHeader.color = COLORS.accent;
      catHeader.fontSize = 12;
      catHeader.fontWeight = "bold";
      catHeader.height = "24px";
      catHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      catHeader.paddingTop = "6px";
      stack.addControl(catHeader);

      for (const recipe of catRecipes) {
        const card = this.makeCard(stack);

        // Recipe name and output
        const nameText = new TextBlock();
        nameText.text = `${recipe.name} → ${recipe.outputName} ×${recipe.outputQuantity}`;
        nameText.color = COLORS.textPrimary;
        nameText.fontSize = 12;
        nameText.fontWeight = "bold";
        nameText.height = "20px";
        nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(nameText);

        // Ingredients list
        for (const ing of recipe.ingredients) {
          const ingText = new TextBlock();
          const hasEnough = ing.available >= ing.required;
          ingText.text = `  ${hasEnough ? "✓" : "✗"} ${ing.name}: ${ing.available}/${ing.required}`;
          ingText.color = hasEnough ? COLORS.accentGreen || "#4ade80" : "#ef4444";
          ingText.fontSize = 11;
          ingText.height = "16px";
          ingText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          card.addControl(ingText);
        }

        // Craft button
        const craftBtn = Button.CreateSimpleButton(`craft_${recipe.id}`, recipe.canCraft ? "Craft" : "Missing ingredients");
        craftBtn.width = "140px";
        craftBtn.height = "28px";
        craftBtn.color = "white";
        craftBtn.background = recipe.canCraft ? (COLORS.accent || "#6366f1") : "#374151";
        craftBtn.cornerRadius = 4;
        craftBtn.fontSize = 11;
        craftBtn.isEnabled = recipe.canCraft;
        craftBtn.onPointerUpObservable.add(() => {
          this.callbacks.onCraftItem?.(recipe.id);
          setTimeout(() => this.refreshActiveTab(), 100);
        });
        card.addControl(craftBtn);
      }
    });
  }

  private renderSystemTab(): void {
    switch (this.systemSubView) {
      case 'save':
        this.renderSaveLoadView('save');
        return;
      case 'load':
        this.renderSaveLoadView('load');
        return;
      case 'playthrough':
        this.renderPlaythroughManagementView();
        return;
    }

    const { stack } = this.makeScrollableContent("system");

    this.addSectionHeader(stack, "System");
    this.addSubHeader(stack, "Game settings and controls");

    // Save / Load buttons at top
    if (this.callbacks.onSaveGame || this.callbacks.onLoadGame) {
      const saveLoadRow = new StackPanel("saveLoadRow");
      saveLoadRow.isVertical = false;
      saveLoadRow.width = 1;
      saveLoadRow.height = "40px";
      saveLoadRow.paddingBottom = "8px";
      stack.addControl(saveLoadRow);

      if (this.callbacks.onSaveGame) {
        const saveBtn = this.makeSystemButton("sys_saveGame", "Save Game");
        saveBtn.width = "140px";
        saveBtn.height = "34px";
        saveBtn.fontSize = 13;
        saveBtn.fontWeight = "bold";
        saveBtn.background = COLORS.accent;
        saveBtn.color = "#FFFFFF";
        saveBtn.paddingRight = "8px";
        saveBtn.onPointerEnterObservable.add(() => { saveBtn.background = "#5A9CF5"; });
        saveBtn.onPointerOutObservable.add(() => { saveBtn.background = COLORS.accent; });
        saveBtn.onPointerClickObservable.add(() => {
          this.systemSubView = 'save';
          this.refreshSaveSlots();
        });
        saveLoadRow.addControl(saveBtn);
      }

      if (this.callbacks.onLoadGame) {
        const loadBtn = this.makeSystemButton("sys_loadGame", "Load Game");
        loadBtn.width = "140px";
        loadBtn.height = "34px";
        loadBtn.fontSize = 13;
        loadBtn.fontWeight = "bold";
        loadBtn.onPointerClickObservable.add(() => {
          this.systemSubView = 'load';
          this.refreshSaveSlots();
        });
        saveLoadRow.addControl(loadBtn);
      }

      this.addDivider(stack);
    }

    // Debug toggle — prominent position near the top
    if (this.callbacks.onToggleDebug) {
      const debugBtn = this.makeSystemButton("sys_debugToggle", `\u{1F527} Debug: ${isDebugLabelsEnabled() ? 'ON' : 'OFF'}`);
      debugBtn.width = "160px";
      debugBtn.height = "34px";
      debugBtn.fontSize = 13;
      debugBtn.fontWeight = "bold";
      debugBtn.background = isDebugLabelsEnabled() ? '#2a5a2a' : COLORS.cardBg;
      debugBtn.paddingBottom = "4px";
      debugBtn.onPointerClickObservable.add(() => {
        this.callbacks.onToggleDebug?.();
        this.renderSystemTab(); // Re-render to update button label
      });
      stack.addControl(debugBtn);
      this.addDivider(stack);
    }

    // Playthrough Management button
    if (this.callbacks.getPlaythroughInfo) {
      const ptInfo = this.callbacks.getPlaythroughInfo();
      if (ptInfo) {
        const ptBtn = this.makeSystemButton("sys_playthroughMgmt", `Playthrough: ${ptInfo.name || 'Unnamed'}`);
        ptBtn.width = 1;
        ptBtn.height = "34px";
        ptBtn.fontSize = 13;
        ptBtn.paddingBottom = "4px";
        ptBtn.onPointerClickObservable.add(() => {
          this.systemSubView = 'playthrough';
          this.refreshActiveTab();
        });
        stack.addControl(ptBtn);
      }
    }

    // Return to Main Menu / Quit buttons
    const exitRow = new StackPanel("exitRow");
    exitRow.isVertical = false;
    exitRow.width = 1;
    exitRow.height = "40px";
    exitRow.paddingBottom = "8px";
    stack.addControl(exitRow);

    if (this.callbacks.onReturnToMainMenu) {
      const menuBtn = this.makeSystemButton("sys_returnMainMenu", "Main Menu");
      menuBtn.width = "140px";
      menuBtn.height = "34px";
      menuBtn.fontSize = 13;
      menuBtn.paddingRight = "8px";
      menuBtn.onPointerClickObservable.add(() => {
        this.showConfirmDialog(
          "Return to Main Menu?",
          "Your game will be auto-saved and paused.",
          "Return",
          () => { this.callbacks.onReturnToMainMenu?.(); }
        );
      });
      exitRow.addControl(menuBtn);
    }

    if (this.callbacks.onQuitGame) {
      const quitBtn = this.makeSystemButton("sys_quitGame", "Quit Game");
      quitBtn.width = "140px";
      quitBtn.height = "34px";
      quitBtn.fontSize = 13;
      quitBtn.onPointerClickObservable.add(() => {
        this.showConfirmDialog(
          "Quit Game?",
          "Your game will be auto-saved before exiting.",
          "Quit",
          () => { this.callbacks.onQuitGame?.(); }
        );
      });
      exitRow.addControl(quitBtn);
    }

    this.addDivider(stack);

    // AI Provider setting
    if (this.callbacks.onSetAIProvider) {
      const aiTitle = new TextBlock();
      aiTitle.text = "AI Conversation Provider";
      aiTitle.color = COLORS.textPrimary;
      aiTitle.fontSize = 15;
      aiTitle.fontWeight = "bold";
      aiTitle.height = "29px";
      aiTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(aiTitle);

      const aiDesc = new TextBlock();
      aiDesc.text = "Choose how NPC conversations are generated.";
      aiDesc.color = COLORS.textMuted;
      aiDesc.fontSize = 11;
      aiDesc.height = "18px";
      aiDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(aiDesc);

      const currentProvider = this.callbacks.getAIProvider?.() || 'auto';

      const providerOptions: Array<{ id: string; label: string; desc: string }> = [
        { id: 'auto', label: 'Auto', desc: 'Browser AI if available, server fallback' },
        { id: 'browser', label: 'Browser (WebLLM)', desc: 'Runs locally via WebGPU — fastest, no server needed' },
        { id: 'server', label: 'Server (Gemini)', desc: 'Uses Insimul server — higher quality, requires connection' },
      ];

      const aiCard = this.makeCard(stack);
      for (const opt of providerOptions) {
        const row = new StackPanel(`aiProvider_${opt.id}`);
        row.isVertical = false;
        row.width = 1;
        row.height = "32px";
        row.paddingBottom = "2px";
        aiCard.addControl(row);

        const isSelected = currentProvider === opt.id;

        const radio = Button.CreateSimpleButton(`aiRadio_${opt.id}`, isSelected ? '◉' : '○');
        radio.width = "28px";
        radio.height = "28px";
        radio.color = isSelected ? COLORS.accent : COLORS.textMuted;
        radio.background = "transparent";
        radio.thickness = 0;
        radio.fontSize = 16;
        row.addControl(radio);

        const labelCol = new StackPanel(`aiLabel_${opt.id}`);
        labelCol.isVertical = true;
        labelCol.width = 1;
        labelCol.height = "32px";
        row.addControl(labelCol);

        const labelText = new TextBlock();
        labelText.text = opt.label;
        labelText.color = isSelected ? COLORS.textPrimary : COLORS.textSecondary;
        labelText.fontSize = 12;
        labelText.fontWeight = isSelected ? "bold" : "normal";
        labelText.height = "16px";
        labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(labelText);

        const descText = new TextBlock();
        descText.text = opt.desc;
        descText.color = COLORS.textMuted;
        descText.fontSize = 9;
        descText.height = "14px";
        descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(descText);

        // Click handler on the whole row
        row.onPointerClickObservable.add(() => {
          this.callbacks.onSetAIProvider?.(opt.id);
          // Re-render to update radio buttons
          this.renderSystemTab();
        });
      }

      this.addDivider(stack);
    }

    // Voice Input Mode setting
    if (this.callbacks.onSetVoiceInputMode) {
      const voiceTitle = new TextBlock();
      voiceTitle.text = "Voice Input Mode";
      voiceTitle.color = COLORS.textPrimary;
      voiceTitle.fontSize = 15;
      voiceTitle.fontWeight = "bold";
      voiceTitle.height = "29px";
      voiceTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(voiceTitle);

      const voiceDesc = new TextBlock();
      voiceDesc.text = "Choose how you talk to NPCs.";
      voiceDesc.color = COLORS.textMuted;
      voiceDesc.fontSize = 11;
      voiceDesc.height = "18px";
      voiceDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(voiceDesc);

      const currentMode = this.callbacks.getVoiceInputMode?.() || 'auto-listen';

      const voiceOptions: Array<{ id: string; label: string; desc: string }> = [
        { id: 'push-to-talk', label: 'Push to Talk', desc: 'Hold T to record your voice' },
        { id: 'auto-listen', label: 'Auto Listen', desc: 'Mic opens automatically — starts listening when chat opens' },
      ];

      const voiceCard = this.makeCard(stack);
      for (const opt of voiceOptions) {
        const row = new StackPanel(`voiceMode_${opt.id}`);
        row.isVertical = false;
        row.width = 1;
        row.height = "32px";
        row.paddingBottom = "2px";
        voiceCard.addControl(row);

        const isSelected = currentMode === opt.id;

        const radio = Button.CreateSimpleButton(`voiceRadio_${opt.id}`, isSelected ? '◉' : '○');
        radio.width = "28px";
        radio.height = "28px";
        radio.color = isSelected ? COLORS.accent : COLORS.textMuted;
        radio.background = "transparent";
        radio.thickness = 0;
        radio.fontSize = 16;
        row.addControl(radio);

        const labelCol = new StackPanel(`voiceLabel_${opt.id}`);
        labelCol.isVertical = true;
        labelCol.width = 1;
        labelCol.height = "32px";
        row.addControl(labelCol);

        const labelText = new TextBlock();
        labelText.text = opt.label;
        labelText.color = isSelected ? COLORS.textPrimary : COLORS.textSecondary;
        labelText.fontSize = 12;
        labelText.fontWeight = isSelected ? "bold" : "normal";
        labelText.height = "16px";
        labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(labelText);

        const descText = new TextBlock();
        descText.text = opt.desc;
        descText.color = COLORS.textMuted;
        descText.fontSize = 9;
        descText.height = "14px";
        descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(descText);

        row.onPointerClickObservable.add(() => {
          this.callbacks.onSetVoiceInputMode?.(opt.id);
          this.renderSystemTab();
        });
      }

      this.addDivider(stack);
    }

    // UI Language Immersion setting
    if (this.callbacks.onSetUIImmersionMode) {
      const immTitle = new TextBlock();
      immTitle.text = "UI Language Immersion";
      immTitle.color = COLORS.textPrimary;
      immTitle.fontSize = 15;
      immTitle.fontWeight = "bold";
      immTitle.height = "29px";
      immTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(immTitle);

      const immDesc = new TextBlock();
      immDesc.text = "Control how much of the UI appears in the target language.";
      immDesc.color = COLORS.textMuted;
      immDesc.fontSize = 11;
      immDesc.height = "18px";
      immDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(immDesc);

      const currentMode = this.callbacks.getUIImmersionMode?.() || 'auto';

      const immersionOptions: Array<{ id: string; label: string; desc: string }> = [
        { id: 'auto', label: 'Auto', desc: 'Increases with your CEFR level' },
        { id: 'english_only', label: 'English Only', desc: 'All UI stays in English' },
        { id: 'maximum', label: 'Maximum', desc: 'Translate as much UI as possible' },
      ];

      const immCard = this.makeCard(stack);
      for (const opt of immersionOptions) {
        const row = new StackPanel(`immMode_${opt.id}`);
        row.isVertical = false;
        row.width = 1;
        row.height = "32px";
        row.paddingBottom = "2px";
        immCard.addControl(row);

        const isSelected = currentMode === opt.id;

        const radio = Button.CreateSimpleButton(`immRadio_${opt.id}`, isSelected ? '◉' : '○');
        radio.width = "28px";
        radio.height = "28px";
        radio.color = isSelected ? COLORS.accent : COLORS.textMuted;
        radio.background = "transparent";
        radio.thickness = 0;
        radio.fontSize = 16;
        row.addControl(radio);

        const labelCol = new StackPanel(`immLabel_${opt.id}`);
        labelCol.isVertical = true;
        labelCol.width = 1;
        labelCol.height = "32px";
        row.addControl(labelCol);

        const labelText = new TextBlock();
        labelText.text = opt.label;
        labelText.color = isSelected ? COLORS.textPrimary : COLORS.textSecondary;
        labelText.fontSize = 12;
        labelText.fontWeight = isSelected ? "bold" : "normal";
        labelText.height = "16px";
        labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(labelText);

        const descText = new TextBlock();
        descText.text = opt.desc;
        descText.color = COLORS.textMuted;
        descText.fontSize = 9;
        descText.height = "14px";
        descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelCol.addControl(descText);

        row.isPointerBlocker = true;
        row.onPointerClickObservable.add(() => {
          this.callbacks.onSetUIImmersionMode?.(opt.id);
          this.renderSystemTab();
        });
      }

      // ── Immersion Progress Indicator ──
      const progressData = this.callbacks.getImmersionProgress?.();
      if (progressData) {
        // Spacer
        const spacer = new Rectangle();
        spacer.width = 1;
        spacer.height = "8px";
        spacer.thickness = 0;
        spacer.background = "transparent";
        stack.addControl(spacer);

        // CEFR level badge + immersion percentage
        const headerRow = new StackPanel("immProgressHeader");
        headerRow.isVertical = false;
        headerRow.width = 1;
        headerRow.height = "24px";
        stack.addControl(headerRow);

        const cefrBadge = Button.CreateSimpleButton("cefrBadge", progressData.cefrLevel);
        cefrBadge.width = "36px";
        cefrBadge.height = "22px";
        cefrBadge.color = "#fff";
        cefrBadge.background = COLORS.accent;
        cefrBadge.fontSize = 11;
        cefrBadge.fontWeight = "bold";
        cefrBadge.cornerRadius = 4;
        cefrBadge.thickness = 0;
        cefrBadge.isHitTestVisible = false;
        headerRow.addControl(cefrBadge);

        const cefrLabel = new TextBlock();
        cefrLabel.text = `  ${progressData.cefrDescription}  ·  ${progressData.immersionPercent}% immersion`;
        cefrLabel.color = COLORS.textSecondary;
        cefrLabel.fontSize = 11;
        cefrLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        headerRow.addControl(cefrLabel);

        if (progressData.isTransitioning) {
          const transLabel = new TextBlock();
          transLabel.text = "  ↻ transitioning";
          transLabel.color = COLORS.accentYellow;
          transLabel.fontSize = 10;
          transLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          headerRow.addControl(transLabel);
        }

        // Overall progress bar
        this.addProgressBar(
          stack,
          progressData.immersionPercent,
          90, // Max immersion is 90%
          COLORS.accent,
          `${progressData.activeCount} / ${progressData.totalCount} categories`,
        );

        // Namespace breakdown card
        const nsCard = this.makeCard(stack);
        const nsTitle = new TextBlock();
        nsTitle.text = "Translation Categories";
        nsTitle.color = COLORS.textSecondary;
        nsTitle.fontSize = 10;
        nsTitle.fontWeight = "bold";
        nsTitle.height = "16px";
        nsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nsCard.addControl(nsTitle);

        for (const ns of progressData.namespaces) {
          const nsRow = new StackPanel(`ns_${ns.namespace}`);
          nsRow.isVertical = false;
          nsRow.width = 1;
          nsRow.height = "20px";
          nsCard.addControl(nsRow);

          const dot = new TextBlock();
          dot.text = ns.active ? "●" : "○";
          dot.color = ns.active ? COLORS.accentGreen : COLORS.textMuted;
          dot.fontSize = 10;
          dot.width = "18px";
          dot.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nsRow.addControl(dot);

          const nsLabel = new TextBlock();
          nsLabel.text = ns.label;
          nsLabel.color = ns.active ? COLORS.textPrimary : COLORS.textMuted;
          nsLabel.fontSize = 11;
          nsLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nsRow.addControl(nsLabel);

          const nsStatus = new TextBlock();
          nsStatus.text = ns.active ? "Active" : "Locked";
          nsStatus.color = ns.active ? COLORS.accentGreen : COLORS.textMuted;
          nsStatus.fontSize = 10;
          nsStatus.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          nsStatus.paddingRight = "4px";
          nsRow.addControl(nsStatus);
        }
      }

      this.addDivider(stack);
    }

    // Keyboard shortcuts
    const shortcutsTitle = new TextBlock();
    shortcutsTitle.text = "Keyboard Shortcuts";
    shortcutsTitle.color = COLORS.textPrimary;
    shortcutsTitle.fontSize = 15;
    shortcutsTitle.fontWeight = "bold";
    shortcutsTitle.height = "29px";
    shortcutsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(shortcutsTitle);

    const shortcuts = [
      { key: "ESC / M", action: "Open / Close this menu" },
      { key: "W / A / S / D", action: "Move" },
      { key: "Q / E", action: "Strafe left / right" },
      { key: "Shift", action: "Sprint (hold)" },
      { key: "CapsLock", action: "Toggle sprint" },
      { key: "Space", action: "Jump" },
      { key: "B", action: "Cycle vehicle" },
      { key: "Enter / Click", action: "Interact (NPC / building / object)" },
      { key: "X", action: "Examine nearby object" },
      { key: "Y", action: "Eavesdrop on NPC conversation" },
      { key: "T", action: "Push-to-talk (hold to record)" },
      { key: "F", action: "Attack / Respawn" },
      { key: "R", action: "Target nearest enemy" },
      { key: "C", action: "Camera viewfinder (photo mode)" },
      { key: "F5", action: "Quick save" },
      { key: "F9", action: "Quick load" },
      { key: "Shift+V", action: "Toggle VR mode" },
    ];

    const shortcutCard = this.makeCard(stack);
    shortcuts.forEach((sc) => {
      this.addStatRow(shortcutCard, sc.action, `[ ${sc.key} ]`, COLORS.textMuted);
    });

    this.addDivider(stack);

    // System buttons — horizontal row
    const buttonRow = new StackPanel("sysButtonRow");
    buttonRow.isVertical = false;
    buttonRow.width = 1;
    buttonRow.height = "32px";
    buttonRow.paddingTop = "4px";
    stack.addControl(buttonRow);

    const buttonDefs = [
      { label: "Fullscreen", icon: "\u{1F5A5}\uFE0F", cb: () => this.callbacks.onToggleFullscreen?.() },
      { label: "VR Mode", icon: "\u{1F97D}", cb: () => this.callbacks.onToggleVR?.() },
      { label: "Debug", icon: "\u{1F527}", cb: () => this.callbacks.onToggleDebug?.() },
    ];

    buttonDefs.forEach((def) => {
      const btn = Button.CreateSimpleButton(`sys_${def.label}`, `${def.icon} ${def.label}`);
      btn.width = "110px";
      btn.height = "28px";
      btn.color = COLORS.textSecondary;
      btn.background = COLORS.cardBg;
      btn.cornerRadius = 4;
      btn.fontSize = 10;
      btn.thickness = 1;
      (btn as any).borderColor = COLORS.cardBorder;
      btn.paddingRight = "4px";

      btn.onPointerEnterObservable.add(() => {
        btn.background = COLORS.tabHover;
        btn.color = COLORS.textPrimary;
      });
      btn.onPointerOutObservable.add(() => {
        btn.background = COLORS.cardBg;
        btn.color = COLORS.textSecondary;
      });

      btn.onPointerClickObservable.add(() => def.cb());
      buttonRow.addControl(btn);
    });

    // Feature Modules section
    if (this.callbacks.onToggleModule) {
      this.addDivider(stack);

      const modulesTitle = new TextBlock();
      modulesTitle.text = "Feature Modules";
      modulesTitle.color = COLORS.textPrimary;
      modulesTitle.fontSize = 15;
      modulesTitle.fontWeight = "bold";
      modulesTitle.height = "29px";
      modulesTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(modulesTitle);

      const modulesDesc = new TextBlock();
      modulesDesc.text = "Toggle gameplay features on or off for this world.";
      modulesDesc.color = COLORS.textMuted;
      modulesDesc.fontSize = 11;
      modulesDesc.height = "18px";
      modulesDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(modulesDesc);

      const world = this.callbacks.getWorldData?.();
      const enabled = new Set(world?.enabledModules ?? []);

      const MODULE_DEFS: Array<{ id: string; label: string }> = [
        { id: 'knowledge-acquisition', label: 'Knowledge Tracking' },
        { id: 'proficiency', label: 'Proficiency' },
        { id: 'pattern-recognition', label: 'Pattern Recognition' },
        { id: 'gamification', label: 'XP & Levels' },
        { id: 'skill-tree', label: 'Skill Tree' },
        { id: 'adaptive-difficulty', label: 'Adaptive Difficulty' },
        { id: 'assessment', label: 'Assessment' },
        { id: 'npc-exams', label: 'NPC Exams' },
        { id: 'performance-scoring', label: 'Performance Scoring' },
        { id: 'voice', label: 'Voice Interaction' },
        { id: 'world-lore', label: 'World Lore' },
        { id: 'conversation-analytics', label: 'Conversation Analytics' },
        { id: 'onboarding', label: 'Onboarding' },
      ];

      const moduleCard = this.makeCard(stack);
      for (const mod of MODULE_DEFS) {
        const isEnabled = enabled.has(mod.id);
        const row = new Rectangle();
        row.width = 1;
        row.height = "26px";
        row.thickness = 0;
        row.background = "transparent";
        moduleCard.addControl(row);

        const label = new TextBlock();
        label.text = `${isEnabled ? '✓' : '○'} ${mod.label}`;
        label.color = isEnabled ? COLORS.textPrimary : COLORS.textMuted;
        label.fontSize = 11;
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "8px";
        row.addControl(label);

        row.isPointerBlocker = true;
        row.onPointerClickObservable.add(() => {
          this.callbacks.onToggleModule?.(mod.id, !isEnabled);
          // Re-render system tab to reflect change
          this.renderSystemTab();
        });
        row.onPointerEnterObservable.add(() => { row.background = COLORS.tabHover; });
        row.onPointerOutObservable.add(() => { row.background = "transparent"; });
      }
    }
  }

  private makeSystemButton(name: string, label: string): Button {
    const btn = Button.CreateSimpleButton(name, label);
    btn.color = COLORS.textSecondary;
    btn.background = COLORS.cardBg;
    btn.cornerRadius = 6;
    btn.thickness = 1;
    (btn as any).borderColor = COLORS.cardBorder;
    btn.onPointerEnterObservable.add(() => {
      btn.background = COLORS.tabHover;
      btn.color = COLORS.textPrimary;
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = COLORS.cardBg;
      btn.color = COLORS.textSecondary;
    });
    return btn;
  }

  private refreshSaveSlots(): void {
    if (!this.callbacks.getSaveSlots) {
      this.renderSystemTab();
      return;
    }
    this.callbacks.getSaveSlots().then((slots) => {
      this.saveSlotCache = slots;
      this.refreshActiveTab();
    }).catch(() => {
      this.refreshActiveTab();
    });
  }

  private formatGameTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  private formatSaveDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  private renderSaveLoadView(mode: 'save' | 'load'): void {
    const { stack } = this.makeScrollableContent("saveload");

    // Back button + header
    const headerRow = new Rectangle();
    headerRow.width = 1;
    headerRow.height = "36px";
    headerRow.thickness = 0;
    headerRow.background = "transparent";
    stack.addControl(headerRow);

    const backBtn = Button.CreateSimpleButton("saveload_back", "< Back");
    backBtn.width = "70px";
    backBtn.height = "28px";
    backBtn.color = COLORS.textSecondary;
    backBtn.background = COLORS.cardBg;
    backBtn.cornerRadius = 4;
    backBtn.fontSize = 11;
    backBtn.thickness = 1;
    (backBtn as any).borderColor = COLORS.cardBorder;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.onPointerEnterObservable.add(() => { backBtn.background = COLORS.tabHover; backBtn.color = COLORS.textPrimary; });
    backBtn.onPointerOutObservable.add(() => { backBtn.background = COLORS.cardBg; backBtn.color = COLORS.textSecondary; });
    backBtn.onPointerClickObservable.add(() => {
      this.systemSubView = 'main';
      this.refreshActiveTab();
    });
    headerRow.addControl(backBtn);

    this.addSectionHeader(stack, mode === 'save' ? "Save Game" : "Load Game");
    this.addSubHeader(stack, mode === 'save'
      ? "Choose a slot to save your progress"
      : "Choose a save slot to load");

    // Render 3 slots
    for (let i = 0; i < 3; i++) {
      const slot = this.saveSlotCache[i];
      this.renderSlotCard(stack, i, slot, mode);
    }
  }

  private renderSlotCard(parent: StackPanel, slotIndex: number, slot: SaveSlotInfo | null, mode: 'save' | 'load'): void {
    const card = new Rectangle(`slot_card_${slotIndex}`);
    card.width = 1;
    card.height = slot ? "110px" : "80px";
    card.background = COLORS.cardBg;
    card.color = COLORS.cardBorder;
    card.thickness = 1;
    card.cornerRadius = 6;
    card.paddingBottom = "8px";
    card.isPointerBlocker = true;
    parent.addControl(card);

    const slotLabel = new TextBlock();
    slotLabel.text = `Slot ${slotIndex + 1}${slotIndex === 0 ? ' (Auto)' : ''}`;
    slotLabel.color = COLORS.textPrimary;
    slotLabel.fontSize = 14;
    slotLabel.fontWeight = "bold";
    slotLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slotLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    slotLabel.left = "14px";
    slotLabel.top = "10px";
    card.addControl(slotLabel);

    if (slot) {
      // Date and play time row
      const dateText = new TextBlock();
      dateText.text = `${this.formatSaveDate(slot.savedAt)}  |  ${this.formatGameTime(slot.gameTime)}`;
      dateText.color = COLORS.textSecondary;
      dateText.fontSize = 11;
      dateText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      dateText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      dateText.left = "14px";
      dateText.top = "30px";
      card.addControl(dateText);

      // Zone name
      if (slot.zoneName) {
        const zoneText = new TextBlock();
        zoneText.text = slot.zoneName;
        zoneText.color = COLORS.accent;
        zoneText.fontSize = 11;
        zoneText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        zoneText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        zoneText.left = "-14px";
        zoneText.top = "10px";
        card.addControl(zoneText);
      }

      // Stats preview row
      const statsRow = new StackPanel(`slot_stats_${slotIndex}`);
      statsRow.isVertical = false;
      statsRow.width = "280px";
      statsRow.height = "18px";
      statsRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      statsRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      statsRow.left = "14px";
      statsRow.top = "48px";
      card.addControl(statsRow);

      const statItems: Array<{ label: string; value: string; color: string }> = [];
      if (slot.playerHealth != null) statItems.push({ label: "HP", value: `${slot.playerHealth}`, color: COLORS.accentRed });
      if (slot.playerGold != null) statItems.push({ label: "Gold", value: `${slot.playerGold}`, color: COLORS.gold });
      if (slot.playerEnergy != null) statItems.push({ label: "EN", value: `${slot.playerEnergy}`, color: COLORS.accentGreen });
      if (slot.inventoryCount != null) statItems.push({ label: "Items", value: `${slot.inventoryCount}`, color: COLORS.textSecondary });
      if (slot.questCount != null) statItems.push({ label: "Quests", value: `${slot.questCount}`, color: COLORS.accentYellow });
      if (slot.playerLevel != null) statItems.push({ label: "Lv", value: `${slot.playerLevel}`, color: COLORS.accent });

      for (const stat of statItems) {
        const statText = new TextBlock();
        statText.text = `${stat.label}: ${stat.value}`;
        statText.color = stat.color;
        statText.fontSize = 10;
        statText.width = "65px";
        statText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        statsRow.addControl(statText);
      }
    } else {
      const emptyText = new TextBlock();
      emptyText.text = mode === 'save' ? "Empty slot" : "No save data";
      emptyText.color = COLORS.textMuted;
      emptyText.fontSize = 12;
      emptyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      emptyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      emptyText.left = "14px";
      emptyText.top = "36px";
      card.addControl(emptyText);
    }

    // Button row at bottom-right
    const btnRow = new StackPanel(`slot_btns_${slotIndex}`);
    btnRow.isVertical = false;
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    btnRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    btnRow.width = "180px";
    btnRow.height = "28px";
    btnRow.left = "-10px";
    btnRow.top = "-10px";
    card.addControl(btnRow);

    // Delete button (only for occupied slots)
    if (slot && this.callbacks.onDeleteSave) {
      const deleteBtn = Button.CreateSimpleButton(`slot_delete_${slotIndex}`, "Delete");
      deleteBtn.width = "60px";
      deleteBtn.height = "28px";
      deleteBtn.fontSize = 10;
      deleteBtn.color = COLORS.textMuted;
      deleteBtn.background = "transparent";
      deleteBtn.cornerRadius = 4;
      deleteBtn.thickness = 1;
      (deleteBtn as any).borderColor = COLORS.cardBorder;
      deleteBtn.paddingRight = "6px";
      deleteBtn.onPointerEnterObservable.add(() => { deleteBtn.color = COLORS.accentRed; (deleteBtn as any).borderColor = COLORS.accentRed; });
      deleteBtn.onPointerOutObservable.add(() => { deleteBtn.color = COLORS.textMuted; (deleteBtn as any).borderColor = COLORS.cardBorder; });
      deleteBtn.onPointerClickObservable.add(() => {
        if (this.saveLoadBusy) return;
        this.showDeleteConfirm(slotIndex);
      });
      btnRow.addControl(deleteBtn);
    }

    // Action button
    const isDisabled = mode === 'load' && !slot;
    const actionBtn = Button.CreateSimpleButton(
      `slot_action_${slotIndex}`,
      mode === 'save' ? (slot ? "Overwrite" : "Save") : "Load"
    );
    actionBtn.width = "80px";
    actionBtn.height = "28px";
    actionBtn.fontSize = 11;
    actionBtn.fontWeight = "bold";
    actionBtn.cornerRadius = 4;
    actionBtn.thickness = 0;

    if (isDisabled) {
      actionBtn.color = COLORS.textMuted;
      actionBtn.background = COLORS.cardBg;
      actionBtn.isEnabled = false;
    } else {
      actionBtn.color = "#FFFFFF";
      actionBtn.background = mode === 'save' ? COLORS.accent : COLORS.accentGreen;
      const hoverColor = mode === 'save' ? "#5A9CF5" : "#45B864";
      const baseColor = mode === 'save' ? COLORS.accent : COLORS.accentGreen;
      actionBtn.onPointerEnterObservable.add(() => { actionBtn.background = hoverColor; });
      actionBtn.onPointerOutObservable.add(() => { actionBtn.background = baseColor; });
      actionBtn.onPointerClickObservable.add(() => {
        if (this.saveLoadBusy) return;
        if (mode === 'save' && slot) {
          this.showOverwriteConfirm(slotIndex, slot);
        } else if (mode === 'load' && slot) {
          this.showLoadConfirm(slotIndex);
        } else {
          this.executeSave(slotIndex);
        }
      });
    }
    btnRow.addControl(actionBtn);

    // Hover effects on card
    card.onPointerEnterObservable.add(() => { card.background = COLORS.tabHover; });
    card.onPointerOutObservable.add(() => { card.background = COLORS.cardBg; });
  }

  /** Build a short preview string from slot info for confirmation dialogs. */
  private buildSlotPreviewText(slot: SaveSlotInfo): string {
    const parts: string[] = [];
    parts.push(this.formatSaveDate(slot.savedAt));
    parts.push(`Play time: ${this.formatGameTime(slot.gameTime)}`);
    if (slot.zoneName) parts.push(`Location: ${slot.zoneName}`);
    const stats: string[] = [];
    if (slot.playerHealth != null) stats.push(`HP ${slot.playerHealth}`);
    if (slot.playerGold != null) stats.push(`Gold ${slot.playerGold}`);
    if (slot.questCount != null) stats.push(`${slot.questCount} quests`);
    if (stats.length) parts.push(stats.join('  |  '));
    return parts.join('\n');
  }

  private showOverwriteConfirm(slotIndex: number, slot: SaveSlotInfo): void {
    if (!this.overlay) return;
    const confirmBg = new Rectangle("confirmOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("confirmDialog");
    dialog.width = "360px";
    dialog.height = "210px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = `Overwrite Slot ${slotIndex + 1}?`;
    msg.color = COLORS.textPrimary;
    msg.fontSize = 15;
    msg.fontWeight = "bold";
    msg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    msg.top = "16px";
    dialog.addControl(msg);

    // Preview of existing save being overwritten
    const previewBox = new Rectangle("overwritePreview");
    previewBox.width = "320px";
    previewBox.height = "80px";
    previewBox.background = "rgba(234, 67, 53, 0.1)";
    previewBox.color = "rgba(234, 67, 53, 0.3)";
    previewBox.thickness = 1;
    previewBox.cornerRadius = 6;
    previewBox.top = "-8px";
    dialog.addControl(previewBox);

    const previewLabel = new TextBlock();
    previewLabel.text = "This save will be replaced:";
    previewLabel.color = COLORS.accentRed;
    previewLabel.fontSize = 10;
    previewLabel.fontWeight = "bold";
    previewLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    previewLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    previewLabel.left = "10px";
    previewLabel.top = "8px";
    previewBox.addControl(previewLabel);

    const previewText = new TextBlock();
    previewText.text = this.buildSlotPreviewText(slot);
    previewText.color = COLORS.textSecondary;
    previewText.fontSize = 10;
    previewText.textWrapping = true;
    previewText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    previewText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    previewText.left = "10px";
    previewText.top = "24px";
    previewBox.addControl(previewText);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "220px";
    btnRow.height = "34px";
    btnRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    btnRow.top = "-16px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("confirmCancel", "Cancel");
    cancelBtn.width = "100px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const okBtn = Button.CreateSimpleButton("confirmOk", "Overwrite");
    okBtn.width = "100px";
    okBtn.height = "30px";
    okBtn.fontSize = 12;
    okBtn.color = "#FFFFFF";
    okBtn.background = COLORS.accentRed;
    okBtn.cornerRadius = 4;
    okBtn.thickness = 0;
    okBtn.onPointerEnterObservable.add(() => { okBtn.background = "#D93025"; });
    okBtn.onPointerOutObservable.add(() => { okBtn.background = COLORS.accentRed; });
    okBtn.onPointerClickObservable.add(() => {
      this.overlay?.removeControl(confirmBg);
      this.executeSave(slotIndex);
    });
    btnRow.addControl(okBtn);
  }

  private showDeleteConfirm(slotIndex: number): void {
    if (!this.overlay) return;
    const slot = this.saveSlotCache[slotIndex];
    const confirmBg = new Rectangle("deleteConfirmOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("deleteConfirmDialog");
    dialog.width = "340px";
    dialog.height = slot ? "190px" : "140px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = `Delete Slot ${slotIndex + 1}?`;
    msg.color = COLORS.textPrimary;
    msg.fontSize = 15;
    msg.fontWeight = "bold";
    msg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    msg.top = "16px";
    dialog.addControl(msg);

    const sub = new TextBlock();
    sub.text = "This save will be permanently deleted.";
    sub.color = COLORS.accentRed;
    sub.fontSize = 11;
    sub.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    sub.top = "38px";
    dialog.addControl(sub);

    if (slot) {
      const previewText = new TextBlock();
      previewText.text = this.buildSlotPreviewText(slot);
      previewText.color = COLORS.textMuted;
      previewText.fontSize = 10;
      previewText.textWrapping = true;
      previewText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      previewText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      previewText.left = "20px";
      previewText.top = "58px";
      dialog.addControl(previewText);
    }

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "220px";
    btnRow.height = "34px";
    btnRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    btnRow.top = "-16px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("deleteCancel", "Cancel");
    cancelBtn.width = "100px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const okBtn = Button.CreateSimpleButton("deleteOk", "Delete");
    okBtn.width = "100px";
    okBtn.height = "30px";
    okBtn.fontSize = 12;
    okBtn.color = "#FFFFFF";
    okBtn.background = COLORS.accentRed;
    okBtn.cornerRadius = 4;
    okBtn.thickness = 0;
    okBtn.onPointerEnterObservable.add(() => { okBtn.background = "#D93025"; });
    okBtn.onPointerOutObservable.add(() => { okBtn.background = COLORS.accentRed; });
    okBtn.onPointerClickObservable.add(() => {
      this.overlay?.removeControl(confirmBg);
      this.executeDelete(slotIndex);
    });
    btnRow.addControl(okBtn);
  }

  private showLoadConfirm(slotIndex: number): void {
    if (!this.overlay) return;
    const confirmBg = new Rectangle("loadConfirmOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("loadConfirmDialog");
    dialog.width = "340px";
    dialog.height = "140px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = `Load Slot ${slotIndex + 1}?`;
    msg.color = COLORS.textPrimary;
    msg.fontSize = 15;
    msg.fontWeight = "bold";
    msg.top = "-20px";
    dialog.addControl(msg);

    const sub = new TextBlock();
    sub.text = "Any unsaved progress will be lost.";
    sub.color = COLORS.textSecondary;
    sub.fontSize = 11;
    sub.top = "8px";
    dialog.addControl(sub);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "220px";
    btnRow.height = "34px";
    btnRow.top = "38px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("loadCancel", "Cancel");
    cancelBtn.width = "100px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const okBtn = Button.CreateSimpleButton("loadOk", "Load");
    okBtn.width = "100px";
    okBtn.height = "30px";
    okBtn.fontSize = 12;
    okBtn.color = "#FFFFFF";
    okBtn.background = COLORS.accentGreen;
    okBtn.cornerRadius = 4;
    okBtn.thickness = 0;
    okBtn.onPointerClickObservable.add(() => {
      this.overlay?.removeControl(confirmBg);
      this.executeLoad(slotIndex);
    });
    btnRow.addControl(okBtn);
  }

  // ─── Playthrough Management View ─────────────────────────────────────────

  private renderPlaythroughManagementView(): void {
    const { stack } = this.makeScrollableContent("playthroughMgmt");

    // Back button + header
    const headerRow = new Rectangle();
    headerRow.width = 1;
    headerRow.height = "36px";
    headerRow.thickness = 0;
    headerRow.background = "transparent";
    stack.addControl(headerRow);

    const backBtn = Button.CreateSimpleButton("pt_back", "< Back");
    backBtn.width = "70px";
    backBtn.height = "28px";
    backBtn.color = COLORS.textSecondary;
    backBtn.background = COLORS.cardBg;
    backBtn.cornerRadius = 4;
    backBtn.fontSize = 11;
    backBtn.thickness = 1;
    (backBtn as any).borderColor = COLORS.cardBorder;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.onPointerEnterObservable.add(() => { backBtn.background = COLORS.tabHover; backBtn.color = COLORS.textPrimary; });
    backBtn.onPointerOutObservable.add(() => { backBtn.background = COLORS.cardBg; backBtn.color = COLORS.textSecondary; });
    backBtn.onPointerClickObservable.add(() => {
      this.systemSubView = 'main';
      this.refreshActiveTab();
    });
    headerRow.addControl(backBtn);

    this.addSectionHeader(stack, "Playthrough Management");

    const ptInfo = this.callbacks.getPlaythroughInfo?.();
    if (!ptInfo) {
      this.addSubHeader(stack, "No active playthrough");
      return;
    }

    // Playthrough info card
    const infoCard = this.makeCard(stack);
    this.addStatRow(infoCard, "Name", ptInfo.name || "Unnamed", COLORS.textPrimary);
    this.addStatRow(infoCard, "Status", ptInfo.status, COLORS.accentGreen);
    this.addStatRow(infoCard, "Play Time", this.formatGameTime(ptInfo.playtime || 0), COLORS.textSecondary);
    this.addStatRow(infoCard, "Actions", String(ptInfo.actionsCount || 0), COLORS.textSecondary);
    this.addStatRow(infoCard, "Started", this.formatSaveDate(ptInfo.createdAt), COLORS.textMuted);
    if (ptInfo.lastPlayedAt) {
      this.addStatRow(infoCard, "Last Played", this.formatSaveDate(ptInfo.lastPlayedAt), COLORS.textMuted);
    }

    this.addDivider(stack);

    // Rename Playthrough
    if (this.callbacks.onRenamePlaythrough) {
      const renameTitle = new TextBlock();
      renameTitle.text = "Rename Playthrough";
      renameTitle.color = COLORS.textPrimary;
      renameTitle.fontSize = 13;
      renameTitle.fontWeight = "bold";
      renameTitle.height = "24px";
      renameTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(renameTitle);

      const renameRow = new StackPanel("renameRow");
      renameRow.isVertical = false;
      renameRow.width = 1;
      renameRow.height = "36px";
      renameRow.paddingBottom = "8px";
      stack.addControl(renameRow);

      // Use a button that shows current name and opens rename dialog
      const renameBtn = this.makeSystemButton("pt_rename", `Rename: "${ptInfo.name || 'Unnamed'}"`);
      renameBtn.width = 1;
      renameBtn.height = "32px";
      renameBtn.fontSize = 12;
      renameBtn.onPointerClickObservable.add(() => {
        this.showRenameDialog(ptInfo.name || '');
      });
      renameRow.addControl(renameBtn);
    }

    this.addDivider(stack);

    // Action buttons
    const actionsTitle = new TextBlock();
    actionsTitle.text = "Actions";
    actionsTitle.color = COLORS.textPrimary;
    actionsTitle.fontSize = 13;
    actionsTitle.fontWeight = "bold";
    actionsTitle.height = "24px";
    actionsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(actionsTitle);

    // Pause Playthrough
    if (this.callbacks.onPausePlaythrough) {
      const pauseBtn = this.makeSystemButton("pt_pause", "Pause Playthrough & Return to Menu");
      pauseBtn.width = 1;
      pauseBtn.height = "34px";
      pauseBtn.fontSize = 12;
      pauseBtn.paddingBottom = "6px";
      pauseBtn.onPointerClickObservable.add(() => {
        this.showConfirmDialog(
          "Pause Playthrough?",
          "Your game will be auto-saved. You can resume later from the main menu.",
          "Pause & Exit",
          async () => { await this.callbacks.onPausePlaythrough?.(); }
        );
      });
      stack.addControl(pauseBtn);
    }

    // Abandon Playthrough
    if (this.callbacks.onAbandonPlaythrough) {
      const abandonBtn = this.makeSystemButton("pt_abandon", "Abandon Playthrough");
      abandonBtn.width = 1;
      abandonBtn.height = "34px";
      abandonBtn.fontSize = 12;
      abandonBtn.color = COLORS.accentYellow;
      abandonBtn.paddingBottom = "6px";
      abandonBtn.onPointerClickObservable.add(() => {
        this.showConfirmDialog(
          "Abandon Playthrough?",
          "Your progress will be marked as abandoned but not deleted. You won't be able to resume.",
          "Abandon",
          async () => { await this.callbacks.onAbandonPlaythrough?.(); },
          COLORS.accentYellow
        );
      });
      stack.addControl(abandonBtn);
    }

    // Delete Playthrough
    if (this.callbacks.onDeletePlaythrough) {
      const deleteBtn = this.makeSystemButton("pt_delete", "Delete Playthrough");
      deleteBtn.width = 1;
      deleteBtn.height = "34px";
      deleteBtn.fontSize = 12;
      deleteBtn.color = COLORS.accentRed;
      deleteBtn.paddingBottom = "6px";
      deleteBtn.onPointerClickObservable.add(() => {
        this.showDeletePlaythroughConfirm();
      });
      stack.addControl(deleteBtn);
    }
  }

  private showRenameDialog(currentName: string): void {
    if (!this.overlay) return;
    const confirmBg = new Rectangle("renameOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("renameDialog");
    dialog.width = "380px";
    dialog.height = "180px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = "Rename Playthrough";
    msg.color = COLORS.textPrimary;
    msg.fontSize = 15;
    msg.fontWeight = "bold";
    msg.top = "-50px";
    dialog.addControl(msg);

    // Input field simulation using a button (Babylon.js GUI has no native text input)
    let newName = currentName;
    const inputBtn = Button.CreateSimpleButton("renameInput", currentName || "Enter name...");
    inputBtn.width = "320px";
    inputBtn.height = "32px";
    inputBtn.fontSize = 13;
    inputBtn.color = COLORS.textPrimary;
    inputBtn.background = COLORS.cardBg;
    inputBtn.cornerRadius = 4;
    inputBtn.thickness = 1;
    (inputBtn as any).borderColor = COLORS.cardBorder;
    inputBtn.top = "-10px";
    inputBtn.onPointerClickObservable.add(() => {
      const result = prompt("Enter new playthrough name:", currentName);
      if (result !== null) {
        newName = result;
        const tb = inputBtn.textBlock;
        if (tb) tb.text = result || "Enter name...";
      }
    });
    dialog.addControl(inputBtn);

    const hint = new TextBlock();
    hint.text = "Click above to edit name";
    hint.color = COLORS.textMuted;
    hint.fontSize = 10;
    hint.top = "14px";
    dialog.addControl(hint);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "220px";
    btnRow.height = "34px";
    btnRow.top = "48px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("renameCancel", "Cancel");
    cancelBtn.width = "100px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const saveBtn = Button.CreateSimpleButton("renameSave", "Save");
    saveBtn.width = "100px";
    saveBtn.height = "30px";
    saveBtn.fontSize = 12;
    saveBtn.color = "#FFFFFF";
    saveBtn.background = COLORS.accent;
    saveBtn.cornerRadius = 4;
    saveBtn.thickness = 0;
    saveBtn.onPointerClickObservable.add(async () => {
      if (this.playthroughRenameBusy || !newName.trim()) return;
      this.playthroughRenameBusy = true;
      const ok = await this.callbacks.onRenamePlaythrough?.(newName.trim());
      this.playthroughRenameBusy = false;
      this.overlay?.removeControl(confirmBg);
      if (ok) {
        this.refreshActiveTab();
      }
    });
    btnRow.addControl(saveBtn);
  }

  private showDeletePlaythroughConfirm(): void {
    if (!this.overlay) return;
    const confirmBg = new Rectangle("deletePlaythroughOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("deletePlaythroughDialog");
    dialog.width = "400px";
    dialog.height = "200px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = "Delete Playthrough?";
    msg.color = COLORS.accentRed;
    msg.fontSize = 16;
    msg.fontWeight = "bold";
    msg.top = "-55px";
    dialog.addControl(msg);

    const sub = new TextBlock();
    sub.text = "This will permanently delete all save data,\nprogress, and history. This cannot be undone.";
    sub.color = COLORS.textSecondary;
    sub.fontSize = 11;
    sub.top = "-20px";
    sub.textWrapping = TextWrapping.WordWrap;
    dialog.addControl(sub);

    // Type DELETE to confirm
    const instruction = new TextBlock();
    instruction.text = "Type DELETE below to confirm:";
    instruction.color = COLORS.textMuted;
    instruction.fontSize = 11;
    instruction.top = "14px";
    dialog.addControl(instruction);

    let confirmText = '';
    const inputBtn = Button.CreateSimpleButton("deleteInput", "Click to type DELETE...");
    inputBtn.width = "300px";
    inputBtn.height = "30px";
    inputBtn.fontSize = 12;
    inputBtn.color = COLORS.textMuted;
    inputBtn.background = COLORS.cardBg;
    inputBtn.cornerRadius = 4;
    inputBtn.thickness = 1;
    (inputBtn as any).borderColor = COLORS.cardBorder;
    inputBtn.top = "40px";
    inputBtn.onPointerClickObservable.add(() => {
      const result = prompt("Type DELETE to confirm deletion:");
      if (result !== null) {
        confirmText = result;
        const tb = inputBtn.textBlock;
        if (tb) tb.text = result || "Click to type DELETE...";
        if (result === 'DELETE') {
          deleteBtn.isEnabled = true;
          deleteBtn.color = "#FFFFFF";
          deleteBtn.background = COLORS.accentRed;
        }
      }
    });
    dialog.addControl(inputBtn);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "220px";
    btnRow.height = "34px";
    btnRow.top = "75px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("deleteCancel", "Cancel");
    cancelBtn.width = "100px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const deleteBtn = Button.CreateSimpleButton("deleteOk", "Delete");
    deleteBtn.width = "100px";
    deleteBtn.height = "30px";
    deleteBtn.fontSize = 12;
    deleteBtn.color = COLORS.textMuted;
    deleteBtn.background = COLORS.cardBg;
    deleteBtn.cornerRadius = 4;
    deleteBtn.thickness = 0;
    deleteBtn.isEnabled = false;
    deleteBtn.onPointerClickObservable.add(async () => {
      if (confirmText !== 'DELETE') return;
      this.overlay?.removeControl(confirmBg);
      await this.callbacks.onDeletePlaythrough?.();
    });
    btnRow.addControl(deleteBtn);
  }

  private showConfirmDialog(
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => void,
    confirmColor: string = COLORS.accent
  ): void {
    if (!this.overlay) return;
    const confirmBg = new Rectangle("genericConfirmOverlay");
    confirmBg.width = 1;
    confirmBg.height = 1;
    confirmBg.background = "rgba(0, 0, 0, 0.6)";
    confirmBg.thickness = 0;
    confirmBg.zIndex = 200;
    this.overlay.addControl(confirmBg);

    const dialog = new Rectangle("genericConfirmDialog");
    dialog.width = "380px";
    dialog.height = "160px";
    dialog.background = COLORS.sidebarBg;
    dialog.color = COLORS.cardBorder;
    dialog.thickness = 1;
    dialog.cornerRadius = 10;
    confirmBg.addControl(dialog);

    const msg = new TextBlock();
    msg.text = title;
    msg.color = COLORS.textPrimary;
    msg.fontSize = 15;
    msg.fontWeight = "bold";
    msg.top = "-30px";
    dialog.addControl(msg);

    const sub = new TextBlock();
    sub.text = description;
    sub.color = COLORS.textSecondary;
    sub.fontSize = 11;
    sub.top = "4px";
    sub.textWrapping = TextWrapping.WordWrap;
    dialog.addControl(sub);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.width = "240px";
    btnRow.height = "34px";
    btnRow.top = "46px";
    dialog.addControl(btnRow);

    const cancelBtn = Button.CreateSimpleButton("genericCancel", "Cancel");
    cancelBtn.width = "110px";
    cancelBtn.height = "30px";
    cancelBtn.fontSize = 12;
    cancelBtn.color = COLORS.textSecondary;
    cancelBtn.background = COLORS.cardBg;
    cancelBtn.cornerRadius = 4;
    cancelBtn.thickness = 0;
    cancelBtn.paddingRight = "8px";
    cancelBtn.onPointerClickObservable.add(() => { this.overlay?.removeControl(confirmBg); });
    btnRow.addControl(cancelBtn);

    const okBtn = Button.CreateSimpleButton("genericOk", confirmLabel);
    okBtn.width = "110px";
    okBtn.height = "30px";
    okBtn.fontSize = 12;
    okBtn.color = "#FFFFFF";
    okBtn.background = confirmColor;
    okBtn.cornerRadius = 4;
    okBtn.thickness = 0;
    okBtn.onPointerClickObservable.add(() => {
      this.overlay?.removeControl(confirmBg);
      onConfirm();
    });
    btnRow.addControl(okBtn);
  }

  private async executeSave(slotIndex: number): Promise<void> {
    if (this.saveLoadBusy || !this.callbacks.onSaveGame) return;
    this.saveLoadBusy = true;
    this.showSaveLoadOverlay("Saving...");
    try {
      await this.callbacks.onSaveGame(slotIndex);
      this.showSaveLoadOverlay("Saved!");
      setTimeout(() => {
        this.removeSaveLoadOverlay();
        this.saveLoadBusy = false;
        this.refreshSaveSlots();
      }, 800);
    } catch {
      this.showSaveLoadOverlay("Save failed");
      setTimeout(() => {
        this.removeSaveLoadOverlay();
        this.saveLoadBusy = false;
      }, 1500);
    }
  }

  private async executeLoad(slotIndex: number): Promise<void> {
    if (this.saveLoadBusy || !this.callbacks.onLoadGame) return;
    this.saveLoadBusy = true;
    this.showSaveLoadOverlay("Loading...");
    try {
      const success = await this.callbacks.onLoadGame(slotIndex);
      if (success) {
        this.showSaveLoadOverlay("Loaded!");
        setTimeout(() => {
          this.removeSaveLoadOverlay();
          this.saveLoadBusy = false;
          this.close();
        }, 800);
      } else {
        this.showSaveLoadOverlay("No save data");
        setTimeout(() => {
          this.removeSaveLoadOverlay();
          this.saveLoadBusy = false;
        }, 1500);
      }
    } catch {
      this.showSaveLoadOverlay("Load failed");
      setTimeout(() => {
        this.removeSaveLoadOverlay();
        this.saveLoadBusy = false;
      }, 1500);
    }
  }

  private async executeDelete(slotIndex: number): Promise<void> {
    if (this.saveLoadBusy || !this.callbacks.onDeleteSave) return;
    this.saveLoadBusy = true;
    this.showSaveLoadOverlay("Deleting...");
    try {
      await this.callbacks.onDeleteSave(slotIndex);
      this.showSaveLoadOverlay("Deleted!");
      setTimeout(() => {
        this.removeSaveLoadOverlay();
        this.saveLoadBusy = false;
        this.refreshSaveSlots();
      }, 800);
    } catch {
      this.showSaveLoadOverlay("Delete failed");
      setTimeout(() => {
        this.removeSaveLoadOverlay();
        this.saveLoadBusy = false;
      }, 1500);
    }
  }

  private saveLoadOverlayRect: Rectangle | null = null;

  private showSaveLoadOverlay(text: string): void {
    this.removeSaveLoadOverlay();
    const rect = new Rectangle("saveLoadOverlay");
    rect.width = "200px";
    rect.height = "60px";
    rect.background = "rgba(0, 0, 0, 0.85)";
    rect.cornerRadius = 10;
    rect.thickness = 0;
    rect.zIndex = 300;
    this.advancedTexture.addControl(rect);

    const txt = new TextBlock();
    txt.text = text;
    txt.color = COLORS.textPrimary;
    txt.fontSize = 16;
    txt.fontWeight = "bold";
    rect.addControl(txt);

    this.saveLoadOverlayRect = rect;
  }

  private removeSaveLoadOverlay(): void {
    if (this.saveLoadOverlayRect) {
      this.advancedTexture.removeControl(this.saveLoadOverlayRect);
      this.saveLoadOverlayRect.dispose();
      this.saveLoadOverlayRect = null;
    }
  }

  /** Quick-save to slot 0. Can be called externally (e.g. from F5 key). */
  public quickSave(): void {
    this.executeSave(0);
  }

  /** Quick-load from slot 0. Can be called externally (e.g. from F9 key). */
  public quickLoad(): void {
    this.executeLoad(0);
  }

  // ── PHOTOS TAB ────────────────────────────────────────────────────────

  private renderPhotosTab(): void {
    const { stack } = this.makeScrollableContent("photos");

    const photos = this.callbacks.getPhotos?.() ?? [];

    // If a photo is selected, show detail view
    if (this.selectedPhotoId) {
      const selected = photos.find(p => p.id === this.selectedPhotoId);
      if (selected) {
        this.renderPhotoDetailView(stack, selected);
        return;
      }
      this.selectedPhotoId = null;
    }

    // Photo Quests section (show active photo objectives)
    const photoObjectives = this.callbacks.getPhotoQuestObjectives?.() ?? [];
    if (photoObjectives.length > 0) {
      this.addSectionHeader(stack, "Photo Quests");
      const questCard = this.makeCard(stack);
      for (const obj of photoObjectives) {
        const row = new StackPanel(`photoQuestRow_${obj.questId}`);
        row.isVertical = false;
        row.height = "28px";
        row.width = 1;
        questCard.addControl(row);

        const icon = new TextBlock();
        icon.text = obj.completed ? "[x]" : "[ ]";
        icon.color = obj.completed ? "#4CAF50" : COLORS.textMuted;
        icon.fontSize = 12;
        icon.width = "30px";
        icon.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(icon);

        const desc = new TextBlock();
        desc.text = `${obj.questTitle}: ${obj.objectiveDescription} (${obj.currentCount}/${obj.requiredCount})`;
        desc.color = obj.completed ? "#4CAF50" : COLORS.textPrimary;
        desc.fontSize = 11;
        desc.textWrapping = true;
        desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        desc.resizeToFit = true;
        row.addControl(desc);
      }
      this.addDivider(stack);
    }

    this.addSectionHeader(stack, "Photo Library");

    if (photos.length === 0) {
      const empty = new TextBlock();
      empty.text = "No photos yet. Press C to enter camera mode, then Space to take a photo.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 13;
      empty.height = "40px";
      empty.textWrapping = true;
      empty.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(empty);
      return;
    }

    // Stats
    const statsCard = this.makeCard(stack);
    this.addStatRow(statsCard, "Total Photos", `${photos.length}`, COLORS.textPrimary);
    const favoriteCount = photos.filter(p => p.favorite).length;
    this.addStatRow(statsCard, "Favorites", `${favoriteCount}`, "#FFC107");
    const labeledCount = photos.filter(p => p.labelCount > 0).length;
    this.addStatRow(statsCard, "Labeled", `${labeledCount}`, "#4CAF50");

    this.addDivider(stack);

    // Photo grid (thumbnails)
    const GRID_COLS = 4;
    const THUMB_SIZE = 100;
    let currentRow: StackPanel | null = null;

    for (let i = 0; i < photos.length; i++) {
      if (i % GRID_COLS === 0) {
        currentRow = new StackPanel(`photoRow_${Math.floor(i / GRID_COLS)}`);
        currentRow.isVertical = false;
        currentRow.width = 1;
        currentRow.height = `${THUMB_SIZE + 40}px`;
        currentRow.paddingBottom = "4px";
        stack.addControl(currentRow);
      }

      const photo = photos[i];
      const cell = new Rectangle(`photoCell_${i}`);
      cell.width = `${THUMB_SIZE + 8}px`;
      cell.height = `${THUMB_SIZE + 36}px`;
      cell.thickness = 0;
      cell.background = "transparent";
      cell.paddingRight = "4px";

      // Thumbnail image
      const img = new Image(`photoThumb_${i}`, photo.thumbnail);
      img.width = `${THUMB_SIZE}px`;
      img.height = `${THUMB_SIZE}px`;
      img.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      img.stretch = Image.STRETCH_UNIFORM;
      cell.addControl(img);

      // Favorite star
      if (photo.favorite) {
        const star = new TextBlock();
        star.text = "★";
        star.color = "#FFC107";
        star.fontSize = 14;
        star.width = "18px";
        star.height = "18px";
        star.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        star.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        cell.addControl(star);
      }

      // Label count badge
      if (photo.labelCount > 0) {
        const badge = new TextBlock();
        badge.text = `${photo.labelCount}`;
        badge.color = "white";
        badge.fontSize = 10;
        badge.width = "18px";
        badge.height = "18px";
        badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        cell.addControl(badge);
      }

      // Timestamp label
      const date = new Date(photo.takenAt);
      const timeText = new TextBlock();
      timeText.text = `${date.toLocaleDateString()}`;
      timeText.color = COLORS.textMuted;
      timeText.fontSize = 8;
      timeText.height = "12px";
      timeText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      timeText.top = "-14px";
      timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      cell.addControl(timeText);

      // Location label
      const loc = new TextBlock();
      loc.text = photo.locationName || "Unknown";
      loc.color = COLORS.textMuted;
      loc.fontSize = 9;
      loc.height = "14px";
      loc.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      loc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      cell.addControl(loc);

      // Hover effect
      cell.onPointerEnterObservable.add(() => { cell.background = COLORS.tabHover; });
      cell.onPointerOutObservable.add(() => { cell.background = "transparent"; });

      // Click to open detail view
      cell.isPointerBlocker = true;
      cell.onPointerClickObservable.add(() => {
        this.selectedPhotoId = photo.id;
        this.renderPhotosTab();
      });

      currentRow!.addControl(cell);
    }
  }

  private renderPhotoDetailView(stack: StackPanel, photo: MenuPhotoData): void {
    // Back button
    const backRow = new StackPanel("photoDetailBackRow");
    backRow.isVertical = false;
    backRow.height = "30px";
    backRow.width = 1;
    stack.addControl(backRow);

    const backBtn = Button.CreateSimpleButton("photoDetailBack", "< Back to Library");
    backBtn.width = "140px";
    backBtn.height = "26px";
    backBtn.color = COLORS.textPrimary;
    backBtn.background = COLORS.cardBg;
    backBtn.fontSize = 11;
    backBtn.cornerRadius = 4;
    backBtn.thickness = 1;
    (backBtn as any).borderColor = COLORS.cardBorder;
    backBtn.onPointerClickObservable.add(() => {
      this.selectedPhotoId = null;
      this.renderPhotosTab();
    });
    backRow.addControl(backBtn);

    // Action buttons
    const favBtn = Button.CreateSimpleButton("photoDetailFav", photo.favorite ? "Unfavorite" : "Favorite");
    favBtn.width = "90px";
    favBtn.height = "26px";
    favBtn.color = "white";
    favBtn.background = photo.favorite ? "#B8860B" : COLORS.cardBg;
    favBtn.fontSize = 11;
    favBtn.cornerRadius = 4;
    favBtn.thickness = 1;
    (favBtn as any).borderColor = COLORS.cardBorder;
    favBtn.onPointerClickObservable.add(() => {
      this.callbacks.onTogglePhotoFavorite?.(photo.id);
      this.refreshActiveTab();
    });
    backRow.addControl(favBtn);

    const delBtn = Button.CreateSimpleButton("photoDetailDel", "Delete");
    delBtn.width = "70px";
    delBtn.height = "26px";
    delBtn.color = "white";
    delBtn.background = "rgba(180, 50, 50, 0.8)";
    delBtn.fontSize = 11;
    delBtn.cornerRadius = 4;
    delBtn.thickness = 1;
    (delBtn as any).borderColor = "#aa3333";
    delBtn.onPointerClickObservable.add(() => {
      this.callbacks.onDeletePhoto?.(photo.id);
      this.selectedPhotoId = null;
      this.refreshActiveTab();
    });
    backRow.addControl(delBtn);

    // Full-size photo with label overlays
    const photoContainer = new Rectangle("photoDetailImgContainer");
    photoContainer.width = 1;
    photoContainer.height = "260px";
    photoContainer.thickness = 0;
    photoContainer.background = "rgba(0,0,0,0.5)";
    stack.addControl(photoContainer);

    const photoImg = new Image("photoDetailImg", photo.imageData);
    photoImg.stretch = Image.STRETCH_UNIFORM;
    photoImg.width = "100%";
    photoImg.height = "100%";
    photoContainer.addControl(photoImg);

    // Overlay label markers at their screen positions
    const LABEL_COLORS: Record<string, string> = {
      person: "#4A90D9",
      building: "#8B6914",
      nature: "#4CAF50",
      item: "#FFC107",
      animal: "#FF9800",
    };
    for (const label of photo.labels) {
      const marker = new Rectangle(`detailMarker_${label.name}`);
      marker.width = "12px";
      marker.height = "12px";
      marker.cornerRadius = 6;
      marker.background = LABEL_COLORS[label.category] || COLORS.textMuted;
      marker.thickness = 2;
      marker.color = "white";
      marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      marker.left = `${label.x * 100}%`;
      marker.top = `${label.y * 100}%`;
      photoContainer.addControl(marker);
    }

    // Info line: location + timestamp
    const date = new Date(photo.takenAt);
    const infoLine = new TextBlock("photoDetailInfo");
    infoLine.text = `${photo.locationName}  |  ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    infoLine.color = COLORS.textMuted;
    infoLine.fontSize = 11;
    infoLine.height = "20px";
    infoLine.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(infoLine);

    // Caption
    if (photo.caption) {
      const captionText = new TextBlock("photoDetailCaption");
      captionText.text = `"${photo.caption}"`;
      captionText.color = "#E8E0C8";
      captionText.fontSize = 12;
      captionText.fontStyle = "italic";
      captionText.height = "20px";
      captionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(captionText);
    }

    this.addDivider(stack);

    // Subjects detected
    this.addSectionHeader(stack, `Subjects Detected (${photo.labels.length})`);

    if (photo.labels.length === 0) {
      const noLabels = new TextBlock();
      noLabels.text = "No subjects detected in this photo.";
      noLabels.color = COLORS.textMuted;
      noLabels.fontSize = 12;
      noLabels.height = "24px";
      noLabels.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(noLabels);
    } else {
      const labelCard = this.makeCard(stack);
      for (const label of photo.labels) {
        const labelRow = new StackPanel(`labelRow_${label.name}`);
        labelRow.isVertical = false;
        labelRow.height = "24px";
        labelRow.width = 1;
        labelCard.addControl(labelRow);

        // Category dot
        const dot = new TextBlock();
        dot.text = "●";
        dot.color = LABEL_COLORS[label.category] || COLORS.textMuted;
        dot.fontSize = 10;
        dot.width = "18px";
        dot.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        labelRow.addControl(dot);

        // Name + activity
        const nameText = new TextBlock();
        nameText.text = label.activity ? `${label.name} - ${label.activity}` : label.name;
        nameText.color = COLORS.textPrimary;
        nameText.fontSize = 12;
        nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameText.resizeToFit = true;
        labelRow.addControl(nameText);

        // Category tag
        const catTag = new TextBlock();
        catTag.text = `[${label.category}]`;
        catTag.color = COLORS.textMuted;
        catTag.fontSize = 10;
        catTag.width = "70px";
        catTag.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        labelRow.addControl(catTag);
      }
    }
  }

  // ── VOCABULARY TAB ──────────────────────────────────────────────────────

  private renderVocabularyTab(): void {
    const { stack } = this.makeScrollableContent("vocab");
    const data = this.callbacks.getVocabularyData?.();

    this.addSectionHeader(stack, "Language Progress");

    // ── Sub-tab buttons (Vocabulary / Grammar) ──
    this.renderTabBar(stack, [
      { id: 'vocabulary' as const, label: 'Vocabulary', color: COLORS.accent },
      { id: 'grammar' as const, label: 'Grammar', color: COLORS.accentYellow },
    ], this.vocabSubTab, (id) => {
      this.vocabSubTab = id;
      this.refreshActiveTab();
    });

    if (!data || (data.vocabulary.length === 0 && data.grammarPatterns.length === 0)) {
      const noData = new TextBlock();
      noData.text = "No vocabulary learned yet.\nTalk to NPCs to learn new words!";
      noData.color = COLORS.textMuted;
      noData.fontSize = 12;
      noData.height = "50px";
      noData.textWrapping = true;
      stack.addControl(noData);
      return;
    }

    // Stats summary (always visible)
    const mastered = data.vocabulary.filter(v => v.masteryLevel === 'mastered').length;
    const totalAttempts = data.totalCorrectUsages +
      data.vocabulary.reduce((sum, v) => sum + v.timesUsedIncorrectly, 0);
    const accuracy = totalAttempts > 0 ? Math.round((data.totalCorrectUsages / totalAttempts) * 100) : 0;

    const statsCard = this.makeCard(stack);
    this.addStatRow(statsCard, "Words Learned", `${data.vocabulary.length}`);
    this.addStatRow(statsCard, "Words Mastered", `${mastered}`, COLORS.gold);
    this.addStatRow(statsCard, "Accuracy", `${accuracy}%`, accuracy >= 80 ? COLORS.accentGreen : COLORS.accentYellow);
    this.addStatRow(statsCard, "Fluency", `${Math.round(data.overallFluency)}%`, COLORS.accent);
    this.addProgressBar(statsCard, data.overallFluency, 100, COLORS.accent, `${Math.round(data.overallFluency)}% fluency`);

    // ── Per-category mastery breakdown bars ──
    const categoryMap = new Map<string, { total: number; mastered: number; familiar: number; learning: number }>();
    for (const v of data.vocabulary) {
      const cat = v.category || 'general';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { total: 0, mastered: 0, familiar: 0, learning: 0 });
      const entry = categoryMap.get(cat)!;
      entry.total++;
      if (v.masteryLevel === 'mastered') entry.mastered++;
      else if (v.masteryLevel === 'familiar') entry.familiar++;
      else if (v.masteryLevel === 'learning') entry.learning++;
    }
    if (categoryMap.size > 1) {
      this.addDivider(stack);
      const breakdownTitle = new TextBlock();
      breakdownTitle.text = "Category Mastery";
      breakdownTitle.color = COLORS.textPrimary;
      breakdownTitle.fontSize = 14;
      breakdownTitle.fontWeight = "bold";
      breakdownTitle.height = "24px";
      breakdownTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(breakdownTitle);

      const sortedCats = Array.from(categoryMap.entries())
        .sort((a, b) => b[1].total - a[1].total);
      for (const [cat, counts] of sortedCats) {
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        const pct = counts.total > 0 ? Math.round(((counts.mastered + counts.familiar) / counts.total) * 100) : 0;
        const color = pct >= 80 ? COLORS.accentGreen : pct >= 50 ? COLORS.accentYellow : COLORS.accentRed;
        const catCard = this.makeCard(stack);
        this.addStatRow(catCard, label, `${counts.mastered + counts.familiar}/${counts.total} known (${pct}%)`, color);
        this.addProgressBar(catCard, counts.mastered + counts.familiar, counts.total, color);
      }
    }

    if (this.vocabSubTab === 'vocabulary') {
      this.renderVocabularySubTab(stack, data);
    } else {
      this.renderGrammarSubTab(stack, data);
    }
  }

  private renderVocabularySubTab(stack: StackPanel, data: NonNullable<ReturnType<NonNullable<GameMenuCallbacks['getVocabularyData']>>>): void {
    const CATEGORIES = [
      'all', 'greetings', 'numbers', 'food', 'family', 'nature',
      'body', 'emotions', 'actions', 'colors', 'time', 'general',
    ];

    // ── Category filter row ──
    this.addDivider(stack);
    const filterLabel = new TextBlock();
    filterLabel.text = "Category";
    filterLabel.color = COLORS.textSecondary;
    filterLabel.fontSize = 12;
    filterLabel.height = "17px";
    filterLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(filterLabel);

    // Two rows of category buttons (6 per row to fit)
    for (let rowIdx = 0; rowIdx < 2; rowIdx++) {
      const catRow = new Rectangle();
      catRow.width = 1;
      catRow.height = "24px";
      catRow.thickness = 0;
      catRow.background = "transparent";
      stack.addControl(catRow);

      const rowCats = CATEGORIES.slice(rowIdx * 6, (rowIdx + 1) * 6);
      let xOff = 4;
      for (const cat of rowCats) {
        const label = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
        const isActive = this.vocabCategoryFilter === cat;
        const btn = Button.CreateSimpleButton(`catBtn_${cat}`, label);
        const btnWidth = Math.max(24, label.length * 5 + 8);
        btn.width = `${btnWidth}px`;
        btn.height = "21px";
        btn.fontSize = 12;
        btn.color = COLORS.textPrimary;
        btn.cornerRadius = 3;
        btn.thickness = 1;
        (btn as any).borderColor = isActive ? COLORS.tabActiveBorder : COLORS.cardBorder;
        btn.background = isActive ? COLORS.tabActive : COLORS.cardBg;
        btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        btn.left = `${xOff}px`;
        btn.onPointerClickObservable.add(() => {
          this.vocabCategoryFilter = cat;
          this.refreshActiveTab();
        });
        catRow.addControl(btn);
        xOff += btnWidth + 4;
      }
    }

    // ── Sort row ──
    const sortRow = new Rectangle();
    sortRow.width = 1;
    sortRow.height = "24px";
    sortRow.thickness = 0;
    sortRow.background = "transparent";
    stack.addControl(sortRow);

    const sortLabel = new TextBlock();
    sortLabel.text = "Sort:";
    sortLabel.fontSize = 12;
    sortLabel.color = COLORS.textSecondary;
    sortLabel.width = "24px";
    sortLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sortLabel.left = "5px";
    sortRow.addControl(sortLabel);

    const sortOptions: { key: 'mastery' | 'alpha' | 'recent' | 'used' | 'review'; label: string }[] = [
      { key: 'mastery', label: 'Mastery' },
      { key: 'alpha', label: 'A-Z' },
      { key: 'recent', label: 'Recent' },
      { key: 'used', label: 'Most Used' },
      { key: 'review', label: 'Due' },
    ];

    let sortX = 38;
    for (const opt of sortOptions) {
      const isActive = this.vocabSortMode === opt.key;
      const btn = Button.CreateSimpleButton(`sortBtn_${opt.key}`, opt.label);
      const btnW = opt.label.length * 5 + 9;
      btn.width = `${btnW}px`;
      btn.height = "20px";
      btn.fontSize = 12;
      btn.color = COLORS.textPrimary;
      btn.cornerRadius = 3;
      btn.thickness = 1;
      (btn as any).borderColor = isActive ? COLORS.tabActiveBorder : COLORS.cardBorder;
      btn.background = isActive ? COLORS.tabActive : COLORS.cardBg;
      btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.left = `${sortX}px`;
      btn.onPointerClickObservable.add(() => {
        this.vocabSortMode = opt.key;
        this.refreshActiveTab();
      });
      sortRow.addControl(btn);
      sortX += btnW + 4;
    }

    // ── Due for review ──
    const dueSet = new Set((data.dueForReview || []).map(v => v.word));
    if (data.dueForReview.length > 0) {
      this.addDivider(stack);
      const reviewTitle = new TextBlock();
      reviewTitle.text = `Due for Review (${data.dueForReview.length})`;
      reviewTitle.color = COLORS.accentYellow;
      reviewTitle.fontSize = 14;
      reviewTitle.fontWeight = "bold";
      reviewTitle.height = "24px";
      reviewTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(reviewTitle);

      for (const word of data.dueForReview.slice(0, 10)) {
        const card = this.makeCard(stack);
        this.addStatRow(card, word.word, word.meaning, COLORS.accentYellow);
      }
    }

    // ── Apply filter and sort ──
    let filtered = [...data.vocabulary];
    if (this.vocabCategoryFilter !== 'all') {
      filtered = filtered.filter(v => (v.category || 'general') === this.vocabCategoryFilter);
    }

    const masteryOrder: Record<string, number> = { mastered: 0, familiar: 1, learning: 2, new: 3 };
    switch (this.vocabSortMode) {
      case 'mastery':
        filtered.sort((a, b) => masteryOrder[a.masteryLevel] - masteryOrder[b.masteryLevel]);
        break;
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
        filtered.sort((a, b) => {
          const aDue = dueSet.has(a.word) ? 0 : 1;
          const bDue = dueSet.has(b.word) ? 0 : 1;
          if (aDue !== bDue) return aDue - bDue;
          return a.lastEncountered - b.lastEncountered;
        });
        break;
    }

    // ── Word list ──
    this.addDivider(stack);
    const vocabTitle = new TextBlock();
    vocabTitle.text = this.vocabCategoryFilter === 'all'
      ? `All Words (${filtered.length})`
      : `${this.vocabCategoryFilter.charAt(0).toUpperCase() + this.vocabCategoryFilter.slice(1)} (${filtered.length})`;
    vocabTitle.color = COLORS.textPrimary;
    vocabTitle.fontSize = 15;
    vocabTitle.fontWeight = "bold";
    vocabTitle.height = "29px";
    vocabTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(vocabTitle);

    if (filtered.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = data.vocabulary.length === 0
        ? "No vocabulary learned yet.\nTalk to NPCs to learn new words!"
        : "No words in this category.";
      emptyText.color = COLORS.textMuted;
      emptyText.fontSize = 12;
      emptyText.height = "42px";
      emptyText.textWrapping = true;
      stack.addControl(emptyText);
      return;
    }

    // Header row
    const headerRow = new Rectangle();
    headerRow.width = 1;
    headerRow.height = "21px";
    headerRow.thickness = 0;
    headerRow.background = COLORS.headerBg;
    headerRow.cornerRadius = 3;
    stack.addControl(headerRow);

    const hWord = new TextBlock();
    hWord.text = "WORD";
    hWord.color = COLORS.textMuted;
    hWord.fontSize = 12;
    hWord.fontWeight = "bold";
    hWord.width = "28%";
    hWord.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hWord.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hWord.paddingLeft = "5px";
    headerRow.addControl(hWord);

    const hMeaning = new TextBlock();
    hMeaning.text = "MEANING";
    hMeaning.color = COLORS.textMuted;
    hMeaning.fontSize = 12;
    hMeaning.fontWeight = "bold";
    hMeaning.width = "30%";
    hMeaning.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hMeaning.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hMeaning.left = "28%";
    headerRow.addControl(hMeaning);

    const hMastery = new TextBlock();
    hMastery.text = "MASTERY";
    hMastery.color = COLORS.textMuted;
    hMastery.fontSize = 12;
    hMastery.fontWeight = "bold";
    hMastery.width = "16%";
    hMastery.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hMastery.left = "58%";
    headerRow.addControl(hMastery);

    const hUsed = new TextBlock();
    hUsed.text = "USED";
    hUsed.color = COLORS.textMuted;
    hUsed.fontSize = 12;
    hUsed.fontWeight = "bold";
    hUsed.width = "10%";
    hUsed.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    hUsed.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    hUsed.left = "-45px";
    headerRow.addControl(hUsed);

    const masteryColors: Record<string, string> = { mastered: '#f1c40f', familiar: '#2ecc71', learning: '#f39c12', new: '#e74c3c' };
    const masteryLabels: Record<string, string> = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };

    for (const entry of filtered) {
      const isDue = dueSet.has(entry.word);
      const row = new Rectangle();
      row.width = 1;
      row.height = "27px";
      row.thickness = 0;
      row.background = isDue ? "rgba(251, 188, 4, 0.06)" : "transparent";
      row.paddingBottom = "2px";
      stack.addControl(row);

      const wordText = new TextBlock();
      wordText.text = entry.word;
      wordText.color = COLORS.textPrimary;
      wordText.fontSize = 12;
      wordText.fontWeight = "bold";
      wordText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      wordText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      wordText.paddingLeft = "5px";
      wordText.width = "28%";
      row.addControl(wordText);

      const meaningText = new TextBlock();
      meaningText.text = entry.meaning;
      meaningText.color = COLORS.textSecondary;
      meaningText.fontSize = 12;
      meaningText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      meaningText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      meaningText.left = "28%";
      meaningText.width = "30%";
      row.addControl(meaningText);

      const masteryText = new TextBlock();
      masteryText.text = isDue ? 'Review!' : (masteryLabels[entry.masteryLevel] || entry.masteryLevel);
      masteryText.color = isDue ? COLORS.accentYellow : (masteryColors[entry.masteryLevel] || COLORS.textMuted);
      masteryText.fontSize = 12;
      masteryText.fontWeight = "bold";
      masteryText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      masteryText.left = "58%";
      masteryText.width = "16%";
      row.addControl(masteryText);

      const usedText = new TextBlock();
      usedText.text = `${entry.timesUsedCorrectly}/${entry.timesEncountered}`;
      usedText.color = COLORS.textMuted;
      usedText.fontSize = 12;
      usedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      usedText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      usedText.left = "-45px";
      usedText.width = "10%";
      row.addControl(usedText);

      // TTS speaker button
      const speakBtn = Button.CreateSimpleButton(`speak_${entry.word}`, "\u{1F50A}");
      speakBtn.width = "21px";
      speakBtn.height = "21px";
      speakBtn.fontSize = 12;
      speakBtn.color = COLORS.accent;
      speakBtn.background = "transparent";
      speakBtn.thickness = 0;
      speakBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      speakBtn.left = "-3px";
      speakBtn.onPointerClickObservable.add(() => {
        this.callbacks.onVocabWordSpeak?.(entry.word);
      });
      speakBtn.onPointerEnterObservable.add(() => { speakBtn.color = COLORS.accentGreen; });
      speakBtn.onPointerOutObservable.add(() => { speakBtn.color = COLORS.accent; });
      row.addControl(speakBtn);
    }
  }

  private renderGrammarSubTab(stack: StackPanel, data: NonNullable<ReturnType<NonNullable<GameMenuCallbacks['getVocabularyData']>>>): void {
    this.addDivider(stack);
    const gramTitle = new TextBlock();
    gramTitle.text = `Grammar Patterns (${data.grammarPatterns.length})`;
    gramTitle.color = COLORS.textPrimary;
    gramTitle.fontSize = 15;
    gramTitle.fontWeight = "bold";
    gramTitle.height = "29px";
    gramTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(gramTitle);

    if (data.grammarPatterns.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = "No grammar patterns tracked yet.\nConverse with NPCs to practice grammar!";
      emptyText.color = COLORS.textMuted;
      emptyText.fontSize = 12;
      emptyText.height = "42px";
      emptyText.textWrapping = true;
      stack.addControl(emptyText);
      return;
    }

    // Sort: weak patterns first, then by total usage
    const sorted = [...data.grammarPatterns].sort((a, b) => {
      const aWeak = !a.mastered && a.timesUsedIncorrectly > 0;
      const bWeak = !b.mastered && b.timesUsedIncorrectly > 0;
      if (aWeak && !bWeak) return -1;
      if (!aWeak && bWeak) return 1;
      return (b.timesUsedCorrectly + b.timesUsedIncorrectly) - (a.timesUsedCorrectly + a.timesUsedIncorrectly);
    });

    for (const pattern of sorted) {
      const total = pattern.timesUsedCorrectly + pattern.timesUsedIncorrectly;
      const acc = total > 0 ? Math.round((pattern.timesUsedCorrectly / total) * 100) : 0;
      const isWeak = !pattern.mastered && pattern.timesUsedIncorrectly > 0;

      const card = this.makeCard(stack);

      // Pattern name row with status badge
      const nameRow = new Rectangle();
      nameRow.width = 1;
      nameRow.height = "20px";
      nameRow.thickness = 0;
      card.addControl(nameRow);

      const nameText = new TextBlock();
      nameText.text = pattern.pattern;
      nameText.color = COLORS.textPrimary;
      nameText.fontSize = 12;
      nameText.fontWeight = "bold";
      nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      nameRow.addControl(nameText);

      const badgeText = new TextBlock();
      badgeText.text = pattern.mastered ? "Mastered" : (isWeak ? "Practice this!" : "Learning");
      badgeText.color = pattern.mastered ? COLORS.gold : (isWeak ? COLORS.accentRed : COLORS.textMuted);
      badgeText.fontSize = 12;
      badgeText.fontWeight = "bold";
      badgeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      nameRow.addControl(badgeText);

      // Accuracy
      this.addStatRow(card, "Accuracy", `${acc}% (${pattern.timesUsedCorrectly}/${total})`,
        pattern.mastered ? COLORS.gold : (acc >= 80 ? COLORS.accentGreen : (acc >= 50 ? COLORS.accentYellow : COLORS.accentRed)));
      this.addProgressBar(card, acc, 100, acc >= 80 ? COLORS.accentGreen : (acc >= 50 ? COLORS.accentYellow : COLORS.accentRed));

      // Example correction (most recent)
      if (pattern.examples && pattern.examples.length > 0) {
        const exText = new TextBlock();
        exText.text = `Example: "${pattern.examples[pattern.examples.length - 1]}"`;
        exText.color = COLORS.textMuted;
        exText.fontSize = 12;
        exText.fontStyle = "italic";
        exText.height = "17px";
        exText.textWrapping = true;
        exText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(exText);
      }

      // Pattern explanation (most recent)
      if (pattern.explanations && pattern.explanations.length > 0) {
        const explainText = new TextBlock();
        explainText.text = `Rule: ${pattern.explanations[pattern.explanations.length - 1]}`;
        explainText.color = COLORS.textSecondary;
        explainText.fontSize = 12;
        explainText.height = "17px";
        explainText.textWrapping = true;
        explainText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(explainText);
      }
    }
  }

  // ── CONVERSATIONS TAB ───────────────────────────────────────────────────

  // ── SKILL TREE TAB ──────────────────────────────────────────────────────

  private renderSkillsTab(): void {
    const { stack } = this.makeScrollableContent("skills");
    const questData = this.callbacks.getGuildQuestData?.() || [];

    this.addSectionHeader(stack, "Guild Progress");

    // Update all guild trees
    let totalUnlocked = 0;
    let totalNodes = 0;
    for (const entry of this.guildSkillTrees) {
      const guildStats = computeGuildStats(entry.guildId, questData);
      updateGuildSkillProgress(entry, guildStats);
      totalUnlocked += entry.state.nodes.filter(n => n.unlocked).length;
      totalNodes += entry.state.nodes.length;
    }
    this.addSubHeader(stack, `${totalUnlocked}/${totalNodes} skills unlocked across all guilds`);

    // Guild tabs
    const guildTabs: Array<{ id: string; label: string; color: string }> = [
      { id: 'all', label: 'All', color: COLORS.accent },
      ...this.guildSkillTrees.map(e => {
        const def = GUILD_DEFINITIONS[e.guildId];
        return { id: e.guildId, label: def ? `${def.icon} ${def.nameFr}` : e.guildId, color: def?.color ?? COLORS.accent };
      }),
    ];
    this.renderTabBar(stack, guildTabs, this._activeGuildTab, (id) => {
      this._activeGuildTab = id;
      this.renderSkillsTab();
    }, 95);

    // Render filtered guild skill trees
    const filteredEntries = this._activeGuildTab === 'all'
      ? this.guildSkillTrees
      : this.guildSkillTrees.filter(e => e.guildId === this._activeGuildTab);

    for (const entry of filteredEntries) {
      const guildDef = GUILD_DEFINITIONS[entry.guildId];
      if (!guildDef) continue;

      const guildUnlocked = entry.state.nodes.filter(n => n.unlocked).length;
      const guildTotal = entry.state.nodes.length;
      const isJoined = entry.state.nodes.some(n => n.id.endsWith('_join') && n.unlocked);

      const guildCard = this.makeCard(stack);

      const guildHeader = new Rectangle();
      guildHeader.width = 1;
      guildHeader.height = "24px";
      guildHeader.thickness = 0;
      guildCard.addControl(guildHeader);

      const guildTitle = new TextBlock();
      guildTitle.text = `${guildDef.icon} ${guildDef.nameFr}`;
      guildTitle.color = isJoined ? guildDef.color : COLORS.textMuted;
      guildTitle.fontSize = 13;
      guildTitle.fontWeight = "bold";
      guildTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      guildHeader.addControl(guildTitle);

      const guildBadge = new TextBlock();
      guildBadge.text = isJoined ? `${guildUnlocked}/${guildTotal}` : 'Not joined';
      guildBadge.color = isJoined ? COLORS.accentGreen : COLORS.textMuted;
      guildBadge.fontSize = 11;
      guildBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      guildHeader.addControl(guildBadge);

      const descText = new TextBlock();
      descText.text = guildDef.description;
      descText.color = COLORS.textSecondary;
      descText.fontSize = 10;
      descText.textWrapping = TextWrapping.WordWrap;
      descText.height = "24px";
      descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      descText.paddingLeft = "4px";
      guildCard.addControl(descText);

      for (const tierDef of entry.config.tiers) {
        const tierNodes = entry.state.nodes.filter(n => n.tier === tierDef.tier);
        const tierUnlocked = tierNodes.filter(n => n.unlocked).length;

        const tierRow = new Rectangle();
        tierRow.width = 1;
        tierRow.height = "16px";
        tierRow.thickness = 0;
        guildCard.addControl(tierRow);

        const tierLabel = new TextBlock();
        tierLabel.text = `${tierDef.name} (${tierUnlocked}/${tierNodes.length})`;
        tierLabel.color = tierUnlocked > 0 ? guildDef.color : COLORS.textMuted;
        tierLabel.fontSize = 10;
        tierLabel.fontWeight = "bold";
        tierLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        tierLabel.left = "8px";
        tierRow.addControl(tierLabel);

        for (const node of tierNodes) {
          const nodeRow = new Rectangle();
          nodeRow.width = 1;
          nodeRow.height = "28px";
          nodeRow.thickness = 0;
          nodeRow.background = node.unlocked ? `rgba(${this.hexToRgb(guildDef.color)}, 0.1)` : "transparent";
          nodeRow.cornerRadius = 3;
          guildCard.addControl(nodeRow);

          const nodeIcon = new TextBlock();
          nodeIcon.text = node.icon;
          nodeIcon.fontSize = 13;
          nodeIcon.width = "20px";
          nodeIcon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nodeIcon.left = "12px";
          nodeRow.addControl(nodeIcon);

          const nodeName = new TextBlock();
          nodeName.text = node.name;
          nodeName.color = node.unlocked ? COLORS.textPrimary : COLORS.textMuted;
          nodeName.fontSize = 11;
          nodeName.fontWeight = "bold";
          nodeName.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nodeName.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nodeName.left = "34px";
          nodeName.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
          nodeName.top = "3px";
          nodeName.height = "14px";
          nodeRow.addControl(nodeName);

          const nodeDesc = new TextBlock();
          nodeDesc.text = node.description;
          nodeDesc.color = node.unlocked ? COLORS.textSecondary : COLORS.textMuted;
          nodeDesc.fontSize = 9;
          nodeDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nodeDesc.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          nodeDesc.left = "34px";
          nodeDesc.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
          nodeDesc.top = "15px";
          nodeDesc.height = "12px";
          nodeRow.addControl(nodeDesc);

          if (node.unlocked) {
            const check = new TextBlock();
            check.text = "\u2713";
            check.fontSize = 13;
            check.fontWeight = "bold";
            check.color = COLORS.accentGreen;
            check.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            check.left = "-10px";
            check.width = "18px";
            nodeRow.addControl(check);
          } else if (node.progress > 0) {
            const pctText = new TextBlock();
            pctText.text = `${Math.round(node.progress * 100)}%`;
            pctText.fontSize = 10;
            pctText.color = COLORS.textMuted;
            pctText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            pctText.left = "-10px";
            pctText.width = "28px";
            nodeRow.addControl(pctText);
          }
        }
      }
    }
  }

  private hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  // ── LIBRARY TAB ─────────────────────────────────────────────────────────

  private static readonly LIBRARY_CATEGORIES: { id: string; label: string; icon: string }[] = [
    { id: 'all', label: 'All', icon: '📚' },
    { id: 'notice', label: 'Notices', icon: '📋' },
    { id: 'book', label: 'Books', icon: '📖' },
    { id: 'story', label: 'Stories', icon: '📝' },
    { id: 'poem', label: 'Poems', icon: '🎭' },
    { id: 'journal', label: 'Journals', icon: '📓' },
    { id: 'letter', label: 'Letters', icon: '✉️' },
    { id: 'recipe', label: 'Recipes', icon: '🍳' },
    { id: 'document', label: 'Documents', icon: '📄' },
  ];

  private renderNoticesTab(): void {
    // Fetch server texts once when tab opens
    if (!this.libraryServerTextsFetched && !this.libraryServerTextsLoading && this.callbacks.fetchServerTexts) {
      this.libraryServerTextsLoading = true;
      this.callbacks.fetchServerTexts().then(texts => {
        this.libraryServerTexts = texts;
        this.libraryServerTextsFetched = true;
        this.libraryServerTextsLoading = false;
        if (this.activeTab === 'notices') this.refreshActiveTab();
      }).catch(() => {
        this.libraryServerTextsLoading = false;
        this.libraryServerTextsFetched = true;
        if (this.activeTab === 'notices') this.refreshActiveTab();
      });
    }

    if (this.libraryReadingArticle) {
      this.renderLibraryReadingView();
      return;
    }
    this.renderLibraryListView();
  }

  private renderLibraryListView(): void {
    const { stack } = this.makeScrollableContent("notices");
    const noticeData = this.callbacks.getNoticeArticles?.();

    this.addSectionHeader(stack, "Library");
    this.addSubHeader(stack, "Your collection of texts found throughout the world");

    // Show loading indicator while fetching server texts
    if (this.libraryServerTextsLoading) {
      const loadingText = new TextBlock();
      loadingText.text = "Loading texts from server...";
      loadingText.color = COLORS.textMuted;
      loadingText.fontSize = 12;
      loadingText.height = "30px";
      stack.addControl(loadingText);
    }

    // Merge local notices with server texts, dedup by id
    const localArticles = noticeData?.articles || [];
    const playerFluency = noticeData?.playerFluency || 0;
    const seenIds = new Set(localArticles.map(a => a.id));
    const allArticles = [...localArticles];
    for (const st of this.libraryServerTexts) {
      if (!seenIds.has(st.id)) {
        allArticles.push(st);
        seenIds.add(st.id);
      }
    }

    if (allArticles.length === 0 && !this.libraryServerTextsLoading) {
      const noData = new TextBlock();
      noData.text = "No readings collected yet. Find notice boards in settlements or documents in the world to start your collection!";
      noData.color = COLORS.textMuted;
      noData.fontSize = 12;
      noData.height = "50px";
      noData.textWrapping = TextWrapping.WordWrap;
      stack.addControl(noData);
      return;
    }

    // Category filter tabs
    const tabRow = new StackPanel("libCatRow");
    tabRow.isVertical = false;
    tabRow.width = 1;
    tabRow.height = "32px";
    tabRow.paddingBottom = "8px";
    stack.addControl(tabRow);

    // Count articles per category for badges
    const categoryCounts = new Map<string, number>();
    for (const a of allArticles) {
      const cat = a.documentType || 'notice';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    for (const cat of GameMenuSystem.LIBRARY_CATEGORIES) {
      const count = cat.id === 'all' ? allArticles.length : (categoryCounts.get(cat.id) || 0);
      if (cat.id !== 'all' && count === 0) continue;

      const isActive = this.libraryActiveCategory === cat.id;
      const catBtn = Button.CreateSimpleButton(`libCat_${cat.id}`, `${cat.icon} ${cat.label} (${count})`);
      catBtn.width = "auto";
      catBtn.height = "28px";
      catBtn.paddingLeft = "2px";
      catBtn.paddingRight = "2px";
      catBtn.color = isActive ? COLORS.textPrimary : COLORS.textSecondary;
      catBtn.background = isActive ? COLORS.tabActive : COLORS.tabIdle;
      catBtn.cornerRadius = 14;
      catBtn.fontSize = 11;
      catBtn.thickness = isActive ? 1 : 0;
      (catBtn as any).borderColor = isActive ? COLORS.tabActiveBorder : "transparent";
      catBtn.onPointerClickObservable.add(() => {
        this.libraryActiveCategory = cat.id;
        this.libraryVisibleCount = this.libraryPageSize;
        this.refreshActiveTab();
      });
      tabRow.addControl(catBtn);
    }

    // Stats row
    const readCount = allArticles.filter(a => this.libraryReadArticleIds.has(a.id)).length;
    const statsText = new TextBlock();
    statsText.text = `${allArticles.length} collected · ${readCount} read`;
    statsText.color = COLORS.textMuted;
    statsText.fontSize = 11;
    statsText.height = "20px";
    statsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(statsText);

    // Filter by category + fluency
    const articles = allArticles.filter(a => {
      if (this.libraryActiveCategory !== 'all') {
        const cat = a.documentType || 'notice';
        if (cat !== this.libraryActiveCategory) return false;
      }
      if (a.difficulty === 'intermediate' && playerFluency < 25) return false;
      if (a.difficulty === 'advanced' && playerFluency < 55) return false;
      return true;
    });

    if (articles.length === 0) {
      const empty = new TextBlock();
      empty.text = "No texts in this category yet.";
      empty.color = COLORS.textMuted;
      empty.fontSize = 12;
      empty.height = "30px";
      stack.addControl(empty);
      return;
    }

    // Pagination: only render up to libraryVisibleCount articles
    const visibleArticles = articles.slice(0, this.libraryVisibleCount);

    // Article cards (compact list — click to read)
    for (const article of visibleArticles) {
      const isRead = this.libraryReadArticleIds.has(article.id);
      const diffColor = article.difficulty === 'beginner' ? COLORS.accentGreen
        : (article.difficulty === 'intermediate' ? COLORS.accentYellow : COLORS.accentRed);
      const typeLabel = this.getDocumentTypeLabel(article);
      const gameText = article as any;
      const hasClue = !!(gameText.clueText);
      const cefrLevel = gameText.cefrLevel as string | undefined;
      const pages = gameText.pages as any[] | undefined;

      const card = this.makeCard(stack);

      // Title row with type badge and difficulty
      const titleRow = new Rectangle();
      titleRow.width = 1;
      titleRow.height = "20px";
      titleRow.thickness = 0;
      card.addControl(titleRow);

      const titlePrefix = `${isRead ? '✓ ' : ''}${hasClue ? '🔍 ' : ''}`;
      const titleText = new TextBlock();
      titleText.text = `${titlePrefix}${article.title}`;
      titleText.color = isRead ? COLORS.textSecondary : COLORS.textPrimary;
      titleText.fontSize = 13;
      titleText.fontWeight = "bold";
      titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      titleRow.addControl(titleText);

      // Badge with CEFR level if available
      const diffLabel = cefrLevel ? `${cefrLevel}` : article.difficulty;
      const badgeText = new TextBlock();
      badgeText.text = `${typeLabel} · ${diffLabel}`;
      badgeText.color = diffColor;
      badgeText.fontSize = 11;
      badgeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      titleRow.addControl(badgeText);

      // Author + XP + page count row
      const metaParts: string[] = [];
      if (article.author) metaParts.push(`by ${article.author.name}`);
      if (pages && pages.length > 0) metaParts.push(`${pages.length} pg`);
      if (article.readingXp) metaParts.push(`${article.readingXp} XP`);
      if (metaParts.length > 0) {
        const metaText = new TextBlock();
        metaText.text = metaParts.join(' · ');
        metaText.color = COLORS.textMuted;
        metaText.fontSize = 11;
        metaText.height = "16px";
        metaText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        card.addControl(metaText);
      }

      // Preview (first 80 chars of body)
      const preview = new TextBlock();
      preview.text = article.body.length > 80 ? article.body.substring(0, 80) + '…' : article.body;
      preview.color = COLORS.textSecondary;
      preview.fontSize = 11;
      preview.height = "16px";
      preview.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      preview.paddingTop = "3px";
      card.addControl(preview);

      // "Read" button
      const readBtn = Button.CreateSimpleButton(`libRead_${article.id}`, "Read →");
      readBtn.width = "70px";
      readBtn.height = "24px";
      readBtn.color = COLORS.textPrimary;
      readBtn.background = COLORS.accent;
      readBtn.cornerRadius = 4;
      readBtn.fontSize = 11;
      readBtn.thickness = 0;
      readBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      readBtn.paddingTop = "4px";
      readBtn.onPointerClickObservable.add(() => {
        this.libraryReadingArticle = article;
        const isFirstRead = !this.libraryReadArticleIds.has(article.id);
        this.libraryReadArticleIds.add(article.id);
        if (isFirstRead) {
          this.callbacks.onReadingCompleted?.(article.id, article.title);
        }
        this.refreshActiveTab();
      });
      card.addControl(readBtn);
    }

    // "Load More" button when there are more articles to show
    if (this.libraryVisibleCount < articles.length) {
      const remaining = articles.length - this.libraryVisibleCount;
      const loadMoreBtn = Button.CreateSimpleButton("libLoadMore", `Load More (${remaining} remaining)`);
      loadMoreBtn.width = "200px";
      loadMoreBtn.height = "32px";
      loadMoreBtn.color = COLORS.textPrimary;
      loadMoreBtn.background = COLORS.cardBg;
      loadMoreBtn.cornerRadius = 6;
      loadMoreBtn.fontSize = 12;
      loadMoreBtn.thickness = 1;
      (loadMoreBtn as any).borderColor = COLORS.accent;
      loadMoreBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      loadMoreBtn.paddingTop = "8px";
      loadMoreBtn.onPointerClickObservable.add(() => {
        this.libraryVisibleCount += this.libraryPageSize;
        this.refreshActiveTab();
      });
      stack.addControl(loadMoreBtn);
    }
  }

  private renderLibraryReadingView(): void {
    const article = this.libraryReadingArticle!;
    const { stack } = this.makeScrollableContent("noticesReading");

    const diffColor = article.difficulty === 'beginner' ? COLORS.accentGreen
      : (article.difficulty === 'intermediate' ? COLORS.accentYellow : COLORS.accentRed);

    // Back button
    const backBtn = Button.CreateSimpleButton("libBack", "← Back to Library");
    backBtn.width = "150px";
    backBtn.height = "28px";
    backBtn.color = COLORS.textSecondary;
    backBtn.background = COLORS.cardBg;
    backBtn.cornerRadius = 4;
    backBtn.fontSize = 11;
    backBtn.thickness = 1;
    (backBtn as any).borderColor = COLORS.cardBorder;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.paddingBottom = "8px";
    backBtn.onPointerClickObservable.add(() => {
      this.libraryReadingArticle = null;
      this.refreshActiveTab();
    });
    stack.addControl(backBtn);

    // Document type + difficulty header
    const typeLabel = this.getDocumentTypeLabel(article);
    const headerMeta = new TextBlock();
    headerMeta.text = `${typeLabel} · ${article.difficulty}`;
    headerMeta.color = diffColor;
    headerMeta.fontSize = 11;
    headerMeta.fontWeight = "bold";
    headerMeta.height = "18px";
    headerMeta.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(headerMeta);

    // Title
    const titleText = new TextBlock();
    titleText.text = article.title;
    titleText.color = COLORS.textPrimary;
    titleText.fontSize = 18;
    titleText.fontWeight = "bold";
    titleText.textWrapping = true;
    titleText.resizeToFit = true;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(titleText);

    // Title translation (toggle)
    if (this.noticeShowTranslations) {
      const titleTrans = new TextBlock();
      titleTrans.text = article.titleTranslation;
      titleTrans.color = COLORS.textMuted;
      titleTrans.fontSize = 13;
      titleTrans.fontStyle = "italic";
      titleTrans.textWrapping = true;
      titleTrans.resizeToFit = true;
      titleTrans.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(titleTrans);
    }

    // Author
    if (article.author) {
      const authorText = new TextBlock();
      authorText.text = `by ${article.author.name}${article.author.occupation ? ` (${article.author.occupation})` : ''}`;
      authorText.color = COLORS.textSecondary;
      authorText.fontSize = 12;
      authorText.height = "20px";
      authorText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      authorText.paddingTop = "2px";
      stack.addControl(authorText);
    }

    this.addDivider(stack);

    // Body text
    const bodyText = new TextBlock();
    bodyText.text = article.body;
    bodyText.color = COLORS.textPrimary;
    bodyText.fontSize = 14;
    bodyText.lineSpacing = "4px";
    bodyText.textWrapping = true;
    bodyText.resizeToFit = true;
    bodyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bodyText.paddingBottom = "8px";
    stack.addControl(bodyText);

    // Body translation
    if (this.noticeShowTranslations) {
      const bodyTrans = new TextBlock();
      bodyTrans.text = article.bodyTranslation;
      bodyTrans.color = COLORS.textMuted;
      bodyTrans.fontSize = 13;
      bodyTrans.fontStyle = "italic";
      bodyTrans.textWrapping = true;
      bodyTrans.resizeToFit = true;
      bodyTrans.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bodyTrans.paddingBottom = "8px";
      stack.addControl(bodyTrans);
    }

    // Toggle translations button
    const toggleBtn = Button.CreateSimpleButton("libToggleTrans", this.noticeShowTranslations ? "Hide Translations" : "Show Translations");
    toggleBtn.width = "149px";
    toggleBtn.height = "27px";
    toggleBtn.color = COLORS.textPrimary;
    toggleBtn.background = COLORS.cardBg;
    toggleBtn.cornerRadius = 5;
    toggleBtn.fontSize = 12;
    toggleBtn.thickness = 1;
    (toggleBtn as any).borderColor = COLORS.cardBorder;
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.paddingBottom = "8px";
    toggleBtn.onPointerClickObservable.add(() => {
      this.noticeShowTranslations = !this.noticeShowTranslations;
      this.refreshActiveTab();
    });
    stack.addControl(toggleBtn);

    // Clue indicator
    const readGameText = article as any;
    if (readGameText.clueText) {
      const clueRow = new TextBlock();
      clueRow.text = `🔍 Clue: ${readGameText.clueText}`;
      clueRow.color = COLORS.accentYellow;
      clueRow.fontSize = 12;
      clueRow.fontWeight = "bold";
      clueRow.textWrapping = true;
      clueRow.resizeToFit = true;
      clueRow.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      clueRow.paddingTop = "4px";
      clueRow.paddingBottom = "4px";
      stack.addControl(clueRow);
    }

    this.addDivider(stack);

    // Vocabulary section
    if (article.vocabularyWords.length > 0) {
      const vocabHeader = new TextBlock();
      vocabHeader.text = "Vocabulary";
      vocabHeader.color = COLORS.accent;
      vocabHeader.fontSize = 14;
      vocabHeader.fontWeight = "bold";
      vocabHeader.height = "22px";
      vocabHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(vocabHeader);

      for (const word of article.vocabularyWords) {
        const wordRow = new Rectangle();
        wordRow.width = 1;
        wordRow.height = "20px";
        wordRow.thickness = 0;
        wordRow.paddingTop = "2px";
        stack.addControl(wordRow);

        const wordText = new TextBlock();
        wordText.text = word.word;
        wordText.color = COLORS.textPrimary;
        wordText.fontSize = 13;
        wordText.fontWeight = "bold";
        wordText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        wordRow.addControl(wordText);

        const meaningText = new TextBlock();
        meaningText.text = word.meaning;
        meaningText.color = COLORS.textSecondary;
        meaningText.fontSize = 13;
        meaningText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        wordRow.addControl(meaningText);
      }

      const vocabSpacer = new Rectangle();
      vocabSpacer.width = 1;
      vocabSpacer.height = "8px";
      vocabSpacer.thickness = 0;
      vocabSpacer.background = "transparent";
      stack.addControl(vocabSpacer);
    }

    // Comprehension question
    const answeredIds = this.callbacks.getAnsweredArticleIds?.() ?? this.answeredNoticeQuestions;
    const hasQuestion = article.comprehensionQuestion && !answeredIds.has(article.id);
    if (hasQuestion && article.comprehensionQuestion) {
      this.addDivider(stack);
      const q = article.comprehensionQuestion;

      const qHeader = new TextBlock();
      qHeader.text = "Comprehension Check";
      qHeader.color = COLORS.accentYellow;
      qHeader.fontSize = 14;
      qHeader.fontWeight = "bold";
      qHeader.height = "22px";
      qHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(qHeader);

      const qText = new TextBlock();
      qText.text = this.noticeShowTranslations ? `${q.question}\n(${q.questionTranslation})` : q.question;
      qText.color = COLORS.textPrimary;
      qText.fontSize = 13;
      qText.textWrapping = true;
      qText.resizeToFit = true;
      qText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      qText.paddingBottom = "6px";
      stack.addControl(qText);

      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const isCorrect = i === q.correctIndex;
        const optBtn = Button.CreateSimpleButton(`libOpt_${article.id}_${i}`, opt);
        optBtn.width = "100%";
        optBtn.height = "30px";
        optBtn.color = COLORS.textPrimary;
        optBtn.background = COLORS.cardBg;
        optBtn.cornerRadius = 4;
        optBtn.fontSize = 13;
        optBtn.thickness = 1;
        (optBtn as any).borderColor = COLORS.cardBorder;
        optBtn.paddingTop = "3px";
        optBtn.paddingBottom = "3px";
        optBtn.onPointerClickObservable.add(() => {
          this.answeredNoticeQuestions.add(article.id);
          this.callbacks.onNoticeQuestionAnswered?.(isCorrect, article.id, i, q.correctIndex);
          this.callbacks.onQuestionsAnswered?.(article.id, isCorrect ? 1 : 0, 1);
          this.refreshActiveTab();
        });
        stack.addControl(optBtn);
      }
    } else if (article.comprehensionQuestion && answeredIds.has(article.id)) {
      const completedText = new TextBlock();
      completedText.text = "✓ Comprehension check completed";
      completedText.color = COLORS.accentGreen;
      completedText.fontSize = 12;
      completedText.height = "20px";
      completedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(completedText);
    }

    // XP reward display
    if (article.readingXp) {
      const xpText = new TextBlock();
      xpText.text = `📖 +${article.readingXp} Reading XP`;
      xpText.color = COLORS.gold;
      xpText.fontSize = 12;
      xpText.height = "22px";
      xpText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      xpText.paddingTop = "4px";
      stack.addControl(xpText);
    }

    // Navigation — prev/next within current category (using merged articles)
    const noticeData = this.callbacks.getNoticeArticles?.();
    const navLocalArticles = noticeData?.articles || [];
    const navSeenIds = new Set(navLocalArticles.map(a => a.id));
    const navAllArticles = [...navLocalArticles];
    for (const st of this.libraryServerTexts) {
      if (!navSeenIds.has(st.id)) {
        navAllArticles.push(st);
        navSeenIds.add(st.id);
      }
    }
    if (navAllArticles.length > 0) {
      const filtered = navAllArticles.filter(a => {
        if (this.libraryActiveCategory !== 'all') {
          return (a.documentType || 'notice') === this.libraryActiveCategory;
        }
        return true;
      });
      const currentIdx = filtered.findIndex(a => a.id === article.id);
      if (filtered.length > 1) {
        this.addDivider(stack);
        const navRow = new StackPanel("libNav");
        navRow.isVertical = false;
        navRow.width = 1;
        navRow.height = "32px";
        stack.addControl(navRow);

        if (currentIdx > 0) {
          const prevBtn = Button.CreateSimpleButton("libPrev", "← Previous");
          prevBtn.width = "100px";
          prevBtn.height = "28px";
          prevBtn.color = COLORS.textSecondary;
          prevBtn.background = COLORS.cardBg;
          prevBtn.cornerRadius = 4;
          prevBtn.fontSize = 11;
          prevBtn.thickness = 1;
          (prevBtn as any).borderColor = COLORS.cardBorder;
          prevBtn.onPointerClickObservable.add(() => {
            this.libraryReadingArticle = filtered[currentIdx - 1];
            this.libraryReadArticleIds.add(filtered[currentIdx - 1].id);
            this.refreshActiveTab();
          });
          navRow.addControl(prevBtn);
        }

        const posText = new TextBlock();
        posText.text = `${currentIdx + 1} / ${filtered.length}`;
        posText.color = COLORS.textMuted;
        posText.fontSize = 11;
        posText.width = "80px";
        posText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        navRow.addControl(posText);

        if (currentIdx < filtered.length - 1) {
          const nextBtn = Button.CreateSimpleButton("libNext", "Next →");
          nextBtn.width = "100px";
          nextBtn.height = "28px";
          nextBtn.color = COLORS.textSecondary;
          nextBtn.background = COLORS.cardBg;
          nextBtn.cornerRadius = 4;
          nextBtn.fontSize = 11;
          nextBtn.thickness = 1;
          (nextBtn as any).borderColor = COLORS.cardBorder;
          nextBtn.onPointerClickObservable.add(() => {
            this.libraryReadingArticle = filtered[currentIdx + 1];
            this.libraryReadArticleIds.add(filtered[currentIdx + 1].id);
            this.refreshActiveTab();
          });
          navRow.addControl(nextBtn);
        }
      }
    }
  }

  private getDocumentTypeLabel(article: NoticeArticle): string {
    const docType = article.documentType || 'notice';
    const cat = GameMenuSystem.LIBRARY_CATEGORIES.find(c => c.id === docType);
    if (!cat) return `📋 ${docType}`;
    const singular = cat.label.endsWith('ies')
      ? cat.label.slice(0, -3) + 'y'
      : cat.label.replace(/s$/, '');
    return `${cat.icon} ${singular}`;
  }

}
