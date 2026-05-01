import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Ellipse,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
  TextWrapping
} from "@babylonjs/gui";
import { Scene, Vector3 } from "@babylonjs/core";
import { QuestWaypointManager, getWaypointColor } from './QuestWaypointManager';
import { DynamicQuestWaypointDirector, type DirectorBuildingEntry, type DirectorNpcPosition, type ResolvedWaypoint, type CompassData } from '../logic/DynamicQuestWaypointDirector';
import type { GamePrologEngine } from '../logic/GamePrologEngine';
import type { IDataSource as DataSource } from '@shared/game-engine/data-source';

export interface QuestObjective {
  type: string;
  description: string;
  completed: boolean;
  current?: number;
  required?: number;
  position?: { x: number; y: number; z: number };
  locationPosition?: { x: number; y: number; z: number };
  locationName?: string;
}

export interface Quest {
  id: string;
  worldId: string;
  assignedTo: string;
  assignedBy: string | null;
  assignedByCharacterId: string | null;
  title: string;
  description: string;
  questType: string;
  difficulty: string;
  targetLanguage: string;
  progress: Record<string, any> | null;
  status: string;
  completionCriteria: Record<string, any> | null;
  experienceReward: number;
  assignedAt: Date;
  completedAt: Date | null;
  conversationContext: string | null;
  objectives?: QuestObjective[];
  rewards?: Record<string, any> | null;
  locationName?: string;
  hintsUsed?: number;
  performanceRating?: number;
  vocabularyUsed?: string[];
  grammarAccuracy?: number;
  tags?: string[];
  /** Assessment result stored by quest overlay (for assessment-type quests) */
  assessmentResult?: {
    totalScore: number;
    maxScore: number;
    cefrLevel: string;
    dimensionScores?: Record<string, number>;
    completedAt?: string;
  };
}

/** Filter criteria for quest log */
export interface QuestFilters {
  questType?: string;
  difficulty?: string;
  assignedBy?: string;
  search?: string;
}

/** Sort options for quest log */
export type QuestSortBy = 'recent' | 'difficulty' | 'reward';

/** Aggregated quest statistics */
export interface QuestStats {
  totalCompleted: number;
  totalActive: number;
  totalFailed: number;
  totalAbandoned: number;
  completionRate: number;
  averagePerformance: number;
  totalXpEarned: number;
  vocabularyWordsLearned: number;
  grammarPatternsCount: number;
  questsByType: Record<string, number>;
  questsByDifficulty: Record<string, number>;
}

/** Color for quest type background tint */
export function getQuestTypeColor(questType: string): string {
  switch (questType) {
    case 'main_quest': return '#FFD700'; // gold
    case 'conversation': case 'social': return '#2196F3'; // blue
    case 'vocabulary': case 'collection': return '#4CAF50'; // green
    case 'navigation': case 'exploration': return '#FF9800'; // orange
    case 'listening_comprehension': return '#9C27B0'; // purple
    case 'cultural': return '#F44336'; // red
    case 'grammar': return '#00BCD4'; // cyan
    case 'translation': case 'translation_challenge': return '#3F51B5'; // indigo
    case 'combat': return '#D32F2F'; // dark red
    case 'crafting': return '#795548'; // brown
    case 'escort': case 'delivery': return '#607D8B'; // blue grey
    default: return '#9E9E9E'; // grey
  }
}

/** Check if a quest is a main quest based on tags or questType */
export function isMainQuest(quest: Quest): boolean {
  return quest.questType === 'main_quest' ||
    (Array.isArray(quest.tags) && quest.tags.includes('main_quest'));
}

/** Difficulty to star count (1-3) */
export function getDifficultyStars(difficulty: string): number {
  switch (difficulty) {
    case 'beginner': case 'easy': return 1;
    case 'intermediate': case 'normal': return 2;
    case 'advanced': case 'hard': case 'legendary': return 3;
    default: return 1;
  }
}

/** Difficulty color */
export function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'beginner': case 'easy': return '#4CAF50';
    case 'intermediate': case 'normal': return '#FFC107';
    case 'advanced': case 'hard': return '#F44336';
    case 'legendary': return '#9C27B0';
    default: return '#888';
  }
}

/** Quest type icon */
export function getQuestIcon(questType: string): string {
  switch (questType) {
    case 'main_quest': return '\u{1F451}'; // crown
    case 'conversation': return '\u{1F4AC}';
    case 'translation': case 'translation_challenge': return '\u{1F504}';
    case 'vocabulary': return '\u{1F4DA}';
    case 'grammar': return '\u{1F4DD}';
    case 'cultural': return '\u{1F30D}';
    case 'listening_comprehension': return '\u{1F3A7}';
    case 'navigation': return '\u{1F9ED}';
    case 'combat': return '\u2694\uFE0F';
    case 'collection': return '\u{1F4E6}';
    case 'exploration': return '\u{1F5FA}\uFE0F';
    case 'escort': return '\u{1F6E1}\uFE0F';
    case 'delivery': return '\u{1F4E8}';
    case 'crafting': return '\u{1F528}';
    case 'social': return '\u{1F91D}';
    default: return '\u{1F3AF}';
  }
}

/** Calculate progress from objectives array */
export function calculateObjectivesProgress(objectives: QuestObjective[]): number {
  if (objectives.length === 0) return 0;
  const completed = objectives.filter(o => o.completed).length;
  return completed / objectives.length;
}

/** Calculate progress from completionCriteria/progress */
export function calculateCriteriaProgress(criteria: Record<string, any>, progress: Record<string, any>): number | null {
  switch (criteria.type) {
    case 'vocabulary_usage':
      if (criteria.requiredCount && progress.currentCount !== undefined) {
        return Math.min(progress.currentCount / criteria.requiredCount, 1);
      }
      break;
    case 'conversation_turns':
      if (criteria.requiredTurns && progress.turnsCompleted !== undefined) {
        return Math.min(progress.turnsCompleted / criteria.requiredTurns, 1);
      }
      break;
    case 'grammar_pattern':
      if (criteria.requiredCount && progress.currentCount !== undefined) {
        return Math.min(progress.currentCount / criteria.requiredCount, 1);
      }
      break;
    case 'conversation_engagement':
      if (criteria.requiredMessages && progress.messagesCount !== undefined) {
        return Math.min(progress.messagesCount / criteria.requiredMessages, 1);
      }
      break;
    case 'listening_comprehension':
      if (criteria.questions?.length && progress.questionsCorrect !== undefined) {
        return Math.min(progress.questionsCorrect / criteria.questions.length, 1);
      }
      break;
    case 'translation_challenge':
      if (criteria.phrases?.length && progress.translationsCorrect !== undefined) {
        return Math.min(progress.translationsCorrect / criteria.phrases.length, 1);
      }
      break;
    case 'navigate_language':
      if (criteria.waypoints?.length && progress.waypointsReached !== undefined) {
        return Math.min(progress.waypointsReached / criteria.waypoints.length, 1);
      }
      break;
    case 'follow_directions': {
      const required = criteria.stepsRequired || criteria.requiredCount || 1;
      if (progress.stepsCompleted !== undefined) {
        return Math.min(progress.stepsCompleted / required, 1);
      }
      break;
    }
  }
  return null;
}

/** Format distance for display */
export function formatDistance(distance: number): string {
  if (distance < 1) return '<1m';
  if (distance < 100) return `${Math.round(distance)}m`;
  return `${(distance / 100).toFixed(1)}km`;
}

/** Difficulty numeric value for sorting */
const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 1, easy: 1,
  intermediate: 2, normal: 2,
  advanced: 3, hard: 3,
  legendary: 4,
};

/** Filter quests by type, difficulty, NPC giver, and search keyword */
export function filterQuests(quests: Quest[], filters: QuestFilters): Quest[] {
  return quests.filter(q => {
    if (filters.questType && q.questType !== filters.questType) return false;
    if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
    if (filters.assignedBy && q.assignedBy !== filters.assignedBy) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      if (!q.title.toLowerCase().includes(term) && !q.description.toLowerCase().includes(term)) {
        return false;
      }
    }
    return true;
  });
}

/** Sort quests by the given criterion */
export function sortQuests(quests: Quest[], sortBy: QuestSortBy): Quest[] {
  const sorted = [...quests];
  switch (sortBy) {
    case 'recent':
      sorted.sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.assignedAt).getTime();
        const dateB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.assignedAt).getTime();
        return dateB - dateA;
      });
      break;
    case 'difficulty':
      sorted.sort((a, b) => (DIFFICULTY_ORDER[b.difficulty] ?? 0) - (DIFFICULTY_ORDER[a.difficulty] ?? 0));
      break;
    case 'reward':
      sorted.sort((a, b) => b.experienceReward - a.experienceReward);
      break;
  }
  return sorted;
}

/** Compute aggregate statistics from a full quest list */
export function computeQuestStats(quests: Quest[]): QuestStats {
  const completed = quests.filter(q => q.status === 'completed');
  const active = quests.filter(q => q.status === 'active');
  const failed = quests.filter(q => q.status === 'failed');
  const abandoned = quests.filter(q => q.status === 'abandoned');

  const totalWithOutcome = completed.length + failed.length + abandoned.length;
  const completionRate = totalWithOutcome > 0 ? completed.length / totalWithOutcome : 0;

  const ratings = completed.filter(q => q.performanceRating != null).map(q => q.performanceRating!);
  const averagePerformance = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const totalXpEarned = completed.reduce((sum, q) => sum + q.experienceReward, 0);

  const vocabSet = new Set<string>();
  for (const q of completed) {
    if (q.vocabularyUsed) {
      for (const word of q.vocabularyUsed) vocabSet.add(word);
    }
  }

  let grammarPatternsCount = 0;
  for (const q of completed) {
    if (q.questType === 'grammar') grammarPatternsCount++;
  }

  const questsByType: Record<string, number> = {};
  const questsByDifficulty: Record<string, number> = {};
  for (const q of quests) {
    questsByType[q.questType] = (questsByType[q.questType] || 0) + 1;
    questsByDifficulty[q.difficulty] = (questsByDifficulty[q.difficulty] || 0) + 1;
  }

  return {
    totalCompleted: completed.length,
    totalActive: active.length,
    totalFailed: failed.length,
    totalAbandoned: abandoned.length,
    completionRate,
    averagePerformance,
    totalXpEarned,
    vocabularyWordsLearned: vocabSet.size,
    grammarPatternsCount,
    questsByType,
    questsByDifficulty,
  };
}

/** Get unique NPC givers from quest list */
export function getUniqueQuestGivers(quests: Quest[]): string[] {
  const givers = new Set<string>();
  for (const q of quests) {
    if (q.assignedBy) givers.add(q.assignedBy);
  }
  return Array.from(givers).sort();
}

/** Get unique quest types from quest list */
export function getUniqueQuestTypes(quests: Quest[]): string[] {
  const types = new Set<string>();
  for (const q of quests) {
    types.add(q.questType);
  }
  return Array.from(types).sort();
}

export class BabylonQuestTracker {
  private advancedTexture: AdvancedDynamicTexture;
  private scene: Scene;
  private questPanel: Rectangle | null = null;
  private questListPanel: StackPanel | null = null;
  private detailPanel: Rectangle | null = null;
  private detailStack: StackPanel | null = null;
  private quests: Quest[] = [];
  private isVisible = false;
  private isMinimized = false;

  // Tab state
  private activeTab: 'active' | 'completed' | 'stats' = 'active';
  private activeTabBtn: Button | null = null;
  private completedTabBtn: Button | null = null;
  private statsTabBtn: Button | null = null;

  // Filter, sort, search state
  private filters: QuestFilters = {};
  private sortBy: QuestSortBy = 'recent';
  private filterBarPanel: StackPanel | null = null;

  // Selection and tracking
  private selectedQuestId: string | null = null;
  private trackedQuestId: string | null = null;
  private disposed = false;

  // Player position for distance calculation
  private playerPosition: Vector3 = Vector3.Zero();

  // Waypoint system
  private waypointManager: QuestWaypointManager;
  private waypointDirector: DynamicQuestWaypointDirector;
  private showWaypoints: boolean = true;
  private resolvedWaypoints: ResolvedWaypoint[] = [];

  // World data for dynamic waypoint resolution
  private buildingData: Map<string, DirectorBuildingEntry> = new Map();
  private npcBuildingMap: Map<string, string> = new Map();
  private npcPositions: DirectorNpcPosition[] = [];
  private playerForwardAngle: number = 0;

  // Compass HUD
  private compassContainer: Rectangle | null = null;
  private compassArrow: Ellipse | null = null;
  private compassLabel: TextBlock | null = null;
  private compassDistance: TextBlock | null = null;

  // World context for quest types
  private worldId: string = '';

  // Prolog engine for quest evaluation
  private prologEngine: GamePrologEngine | null = null;
  private playerId: string = 'player';

  // Data source for overlay-aware quest loading
  private dataSource: DataSource | null = null;

  // Callbacks
  private onClose: (() => void) | null = null;

  // Scroll viewer reference for layout
  private scrollViewer: ScrollViewer | null = null;

  constructor(advancedTexture: AdvancedDynamicTexture, scene: Scene) {
    this.advancedTexture = advancedTexture;
    this.scene = scene;
    this.waypointManager = new QuestWaypointManager(scene);
    this.waypointDirector = new DynamicQuestWaypointDirector();
    this.createQuestUI();
    this.createCompassHUD();
  }

  private createQuestUI() {
    // Main container
    this.questPanel = new Rectangle("questPanel");
    this.questPanel.width = "209px";
    this.questPanel.height = "275px";
    this.questPanel.background = "rgba(0, 0, 0, 0.9)";
    this.questPanel.color = "#FFD700";
    this.questPanel.thickness = 2;
    this.questPanel.cornerRadius = 6;
    this.questPanel.top = "6px";
    this.questPanel.left = "-10px";
    this.questPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.questPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.questPanel.isVisible = false;
    this.questPanel.zIndex = 50;

    const mainStack = new StackPanel();
    mainStack.width = "100%";
    mainStack.height = "100%";
    this.questPanel.addControl(mainStack);

    // Header
    const header = new Rectangle("questHeader");
    header.width = "100%";
    header.height = "28px";
    header.background = "rgba(30, 30, 30, 0.95)";
    header.thickness = 0;
    mainStack.addControl(header);

    const headerStack = new StackPanel();
    headerStack.isVertical = false;
    headerStack.width = "100%";
    headerStack.height = "100%";
    header.addControl(headerStack);

    const titleText = new TextBlock();
    titleText.text = "Quest Log";
    titleText.color = "#FFD700";
    titleText.fontSize = 10;
    titleText.fontWeight = "bold";
    titleText.paddingLeft = "8px";
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.width = "121px";
    headerStack.addControl(titleText);

    // Minimize button
    const minimizeBtn = Button.CreateSimpleButton("minimizeQuest", "\u2212");
    minimizeBtn.width = "19px";
    minimizeBtn.height = "19px";
    minimizeBtn.color = "white";
    minimizeBtn.background = "rgba(100, 100, 100, 0.8)";
    minimizeBtn.cornerRadius = 3;
    minimizeBtn.fontSize = 12;
    minimizeBtn.onPointerClickObservable.add(() => {
      this.toggleMinimize();
    });
    headerStack.addControl(minimizeBtn);

    // Close button
    const closeBtn = Button.CreateSimpleButton("closeQuest", "\u2715");
    closeBtn.width = "19px";
    closeBtn.height = "19px";
    closeBtn.color = "white";
    closeBtn.background = "rgba(255, 50, 50, 0.8)";
    closeBtn.cornerRadius = 3;
    closeBtn.fontSize = 10;
    closeBtn.paddingLeft = "3px";
    closeBtn.onPointerClickObservable.add(() => {
      this.hide();
      this.onClose?.();
    });
    headerStack.addControl(closeBtn);

    // Tab bar
    const tabBar = new StackPanel("questTabBar");
    tabBar.isVertical = false;
    tabBar.width = "100%";
    tabBar.height = "19px";
    mainStack.addControl(tabBar);

    this.activeTabBtn = Button.CreateSimpleButton("activeTab", "Active");
    this.activeTabBtn.width = "70px";
    this.activeTabBtn.height = "19px";
    this.activeTabBtn.color = "white";
    this.activeTabBtn.background = "#4CAF50";
    this.activeTabBtn.fontSize = 8;
    this.activeTabBtn.fontWeight = "bold";
    this.activeTabBtn.thickness = 0;
    this.activeTabBtn.onPointerClickObservable.add(() => {
      this.setActiveTab('active');
    });
    tabBar.addControl(this.activeTabBtn);

    this.completedTabBtn = Button.CreateSimpleButton("completedTab", "Completed");
    this.completedTabBtn.width = "70px";
    this.completedTabBtn.height = "19px";
    this.completedTabBtn.color = "#AAA";
    this.completedTabBtn.background = "rgba(60, 60, 60, 0.8)";
    this.completedTabBtn.fontSize = 8;
    this.completedTabBtn.fontWeight = "bold";
    this.completedTabBtn.thickness = 0;
    this.completedTabBtn.onPointerClickObservable.add(() => {
      this.setActiveTab('completed');
    });
    tabBar.addControl(this.completedTabBtn);

    this.statsTabBtn = Button.CreateSimpleButton("statsTab", "Stats");
    this.statsTabBtn.width = "69px";
    this.statsTabBtn.height = "19px";
    this.statsTabBtn.color = "#AAA";
    this.statsTabBtn.background = "rgba(60, 60, 60, 0.8)";
    this.statsTabBtn.fontSize = 8;
    this.statsTabBtn.fontWeight = "bold";
    this.statsTabBtn.thickness = 0;
    this.statsTabBtn.onPointerClickObservable.add(() => {
      this.setActiveTab('stats');
    });
    tabBar.addControl(this.statsTabBtn);

    // Filter bar (for active/completed tabs)
    this.filterBarPanel = new StackPanel("filterBar");
    this.filterBarPanel.width = "100%";
    this.filterBarPanel.adaptHeightToChildren = true;
    mainStack.addControl(this.filterBarPanel);
    this.rebuildFilterBar();

    // Quest list scroll area
    this.scrollViewer = new ScrollViewer("questScroll");
    this.scrollViewer.width = "100%";
    this.scrollViewer.height = "204px";
    this.scrollViewer.paddingTop = "3px";
    this.scrollViewer.paddingBottom = "3px";
    this.scrollViewer.background = "rgba(20, 20, 20, 0.5)";
    mainStack.addControl(this.scrollViewer);

    this.questListPanel = new StackPanel("questListPanel");
    this.questListPanel.width = "100%";
    this.scrollViewer.addControl(this.questListPanel);

    // Detail panel (hidden by default, overlays over the list)
    this.detailPanel = new Rectangle("questDetailPanel");
    this.detailPanel.width = "209px";
    this.detailPanel.height = "275px";
    this.detailPanel.background = "rgba(10, 10, 10, 0.95)";
    this.detailPanel.color = "#FFD700";
    this.detailPanel.thickness = 2;
    this.detailPanel.cornerRadius = 6;
    this.detailPanel.top = "6px";
    this.detailPanel.left = "-10px";
    this.detailPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.detailPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.detailPanel.isVisible = false;
    this.detailPanel.zIndex = 55;

    const detailScroll = new ScrollViewer("questDetailScroll");
    detailScroll.width = "100%";
    detailScroll.height = "100%";
    detailScroll.paddingTop = "6px";
    detailScroll.paddingBottom = "6px";
    this.detailPanel.addControl(detailScroll);

    this.detailStack = new StackPanel("questDetailStack");
    this.detailStack.width = "100%";
    detailScroll.addControl(this.detailStack);

    this.advancedTexture.addControl(this.questPanel);
    this.advancedTexture.addControl(this.detailPanel);
  }

  private setActiveTab(tab: 'active' | 'completed' | 'stats') {
    this.activeTab = tab;
    this.selectedQuestId = null;
    this.hideDetailPanel();

    const inactive = { bg: "rgba(60, 60, 60, 0.8)", color: "#AAA" };
    const buttons = [
      { btn: this.activeTabBtn, active: tab === 'active', activeBg: "#4CAF50", activeColor: "white" },
      { btn: this.completedTabBtn, active: tab === 'completed', activeBg: "#FFD700", activeColor: "#000" },
      { btn: this.statsTabBtn, active: tab === 'stats', activeBg: "#9C27B0", activeColor: "white" },
    ];
    for (const { btn, active, activeBg, activeColor } of buttons) {
      if (btn) {
        btn.background = active ? activeBg : inactive.bg;
        btn.color = active ? activeColor : inactive.color;
      }
    }

    // Show/hide filter bar for stats tab
    if (this.filterBarPanel) {
      this.filterBarPanel.isVisible = tab !== 'stats';
    }

    this.updateQuestsDisplay();
  }

  public setDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource;
  }

  public async updateQuests(worldId: string) {
    try {
      this.worldId = worldId;

      if (!this.dataSource) throw new Error('No dataSource set — save file not loaded');
      this.quests = await this.dataSource.loadQuests(worldId);

      if (this.disposed) return;
      this.updateQuestsDisplay();
      this.updateWaypoints();
    } catch (error) {
      if (!this.disposed) console.error('Failed to load quests:', error);
    }
  }

  public setPlayerPosition(position: Vector3) {
    this.playerPosition = position.clone();
  }

  private updateQuestsDisplay() {
    if (!this.questListPanel) return;

    this.questListPanel.clearControls();

    const allActive = this.quests.filter(q => q.status === 'active');
    const allCompleted = this.quests.filter(q => q.status === 'completed');

    // Update tab labels with counts
    if (this.activeTabBtn) this.activeTabBtn.textBlock!.text = `Active (${allActive.length})`;
    if (this.completedTabBtn) this.completedTabBtn.textBlock!.text = `Done (${allCompleted.length})`;

    if (this.activeTab === 'stats') {
      this.renderStatsTab();
      return;
    }

    // Determine base quests for current tab
    const baseQuests = this.activeTab === 'active' ? allActive : allCompleted;

    // Apply filters and sorting
    const filtered = filterQuests(baseQuests, this.filters);
    const sorted = sortQuests(filtered, this.sortBy);

    // Partition: main quests first, then group side quests by guild
    const mainQuests = sorted.filter(q => isMainQuest(q));
    const sideQuests = sorted.filter(q => !isMainQuest(q));

    if (mainQuests.length === 0 && sideQuests.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = this.activeTab === 'active'
        ? "No active quests\n\nTalk to NPCs to receive quests!"
        : "No completed quests yet.";
      emptyText.color = "#888";
      emptyText.fontSize = 8;
      emptyText.height = "44px";
      emptyText.textWrapping = TextWrapping.WordWrap;
      emptyText.paddingTop = "11px";
      this.questListPanel.addControl(emptyText);
      return;
    }

    // Main quests section
    if (mainQuests.length > 0) {
      this.addGuildHeader('Main Quest', '#FFD700', '⭐');
      mainQuests.forEach((quest) => {
        this.questListPanel?.addControl(this.createQuestCard(quest));
      });
    }

    // Group side quests by guild
    const GUILD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
      marchands: { label: 'Marchands', icon: '🏪', color: '#f59e0b' },
      artisans: { label: 'Artisans', icon: '🔨', color: '#ef4444' },
      conteurs: { label: 'Conteurs', icon: '📖', color: '#8b5cf6' },
      explorateurs: { label: 'Explorateurs', icon: '🧭', color: '#10b981' },
      diplomates: { label: 'Diplomates', icon: '🤝', color: '#3b82f6' },
    };

    // Group by guild
    const guildGroups = new Map<string, typeof sideQuests>();
    for (const q of sideQuests) {
      const guildId = (q as any).guildId || 'other';
      if (!guildGroups.has(guildId)) guildGroups.set(guildId, []);
      guildGroups.get(guildId)!.push(q);
    }

    // Render guild groups
    guildGroups.forEach((quests, guildId) => {
      const guild = GUILD_LABELS[guildId];
      if (guild) {
        this.addGuildHeader(guild.label, guild.color, guild.icon);
      } else if (quests.length > 0) {
        this.addGuildHeader('Other Quests', '#888', '📋');
      }
      quests.forEach((quest) => {
        this.questListPanel?.addControl(this.createQuestCard(quest));
      });
    });
  }

  private addGuildHeader(label: string, color: string, icon: string): void {
    if (!this.questListPanel) return;
    const header = new TextBlock();
    header.text = `${icon} ${label}`;
    header.color = color;
    header.fontSize = 9;
    header.fontWeight = 'bold';
    header.height = '18px';
    header.textHorizontalAlignment = 0; // left
    header.paddingTop = '4px';
    header.paddingLeft = '4px';
    this.questListPanel.addControl(header);
  }

  private createQuestCard(quest: Quest): Rectangle {
    const typeColor = getQuestTypeColor(quest.questType);
    const isTracked = this.trackedQuestId === quest.id;
    const isMain = isMainQuest(quest);

    const card = new Rectangle(`quest-${quest.id}`);
    card.width = "95%";
    card.adaptHeightToChildren = true;
    card.background = isMain
      ? (quest.status === 'active' ? 'rgba(255, 215, 0, 0.12)' : 'rgba(255, 215, 0, 0.06)')
      : (quest.status === 'active' ? `${typeColor}22` : "rgba(80, 80, 80, 0.25)");
    card.color = isMain ? '#FFD700' : (isTracked ? "#FFD700" : typeColor);
    card.thickness = isMain ? 2 : (isTracked ? 2 : 1);
    card.cornerRadius = 3;
    card.paddingTop = "4px";
    card.paddingBottom = "4px";
    card.paddingLeft = "4px";
    card.paddingRight = "4px";

    // Click to select
    card.onPointerClickObservable.add(() => {
      this.selectedQuestId = quest.id;
      this.showDetailPanel(quest);
    });

    const cardStack = new StackPanel();
    cardStack.width = "100%";
    card.addControl(cardStack);

    // Title row with icon, title, and difficulty stars
    const titleRow = new StackPanel();
    titleRow.isVertical = false;
    titleRow.width = "100%";
    titleRow.height = "12px";
    cardStack.addControl(titleRow);

    const iconText = new TextBlock();
    iconText.text = getQuestIcon(quest.questType);
    iconText.fontSize = 8;
    iconText.width = "14px";
    iconText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleRow.addControl(iconText);

    const titleText = new TextBlock();
    titleText.text = quest.title;
    titleText.color = "white";
    titleText.fontSize = 8;
    titleText.fontWeight = "bold";
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.textWrapping = TextWrapping.Clip;
    titleText.width = "127px";
    titleRow.addControl(titleText);

    // Difficulty stars
    const stars = getDifficultyStars(quest.difficulty);
    const starsText = new TextBlock();
    starsText.text = "\u2605".repeat(stars) + "\u2606".repeat(3 - stars);
    starsText.color = getDifficultyColor(quest.difficulty);
    starsText.fontSize = 8;
    starsText.width = "33px";
    starsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titleRow.addControl(starsText);

    // Metadata row: XP reward + type badge + distance
    const metaRow = new StackPanel();
    metaRow.isVertical = false;
    metaRow.width = "100%";
    metaRow.height = "10px";
    metaRow.paddingTop = "3px";
    cardStack.addControl(metaRow);

    const rewardText = new TextBlock();
    rewardText.text = `${quest.experienceReward} XP`;
    rewardText.color = "#FFD700";
    rewardText.fontSize = 8;
    rewardText.width = "33px";
    rewardText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    metaRow.addControl(rewardText);

    const typeLabel = new TextBlock();
    typeLabel.text = (quest.questType || 'quest').replace(/_/g, ' ');
    typeLabel.color = typeColor;
    typeLabel.fontSize = 8;
    typeLabel.fontWeight = "bold";
    typeLabel.width = "66px";
    typeLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    metaRow.addControl(typeLabel);

    // Distance from player (if quest has location)
    const distance = this.getQuestDistance(quest);
    if (distance !== null) {
      const distText = new TextBlock();
      distText.text = formatDistance(distance);
      distText.color = "#AAA";
      distText.fontSize = 8;
      distText.width = "33px";
      distText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      metaRow.addControl(distText);
    }

    // Completed quest: show completion date and rewards
    if (quest.status === 'completed' && quest.completedAt) {
      const completedRow = new StackPanel();
      completedRow.isVertical = false;
      completedRow.width = "100%";
      completedRow.height = "9px";
      completedRow.paddingTop = "3px";
      cardStack.addControl(completedRow);

      const dateText = new TextBlock();
      const date = new Date(quest.completedAt);
      dateText.text = `Completed: ${date.toLocaleDateString()}`;
      dateText.color = "#4CAF50";
      dateText.fontSize = 8;
      dateText.width = "88px";
      dateText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      completedRow.addControl(dateText);

      const earnedText = new TextBlock();
      earnedText.text = `Earned: ${quest.experienceReward} XP`;
      earnedText.color = "#FFD700";
      earnedText.fontSize = 8;
      earnedText.width = "66px";
      earnedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      completedRow.addControl(earnedText);
    }

    // Assessment result summary (for completed assessment quests)
    if (quest.status === 'completed' && quest.assessmentResult) {
      const ar = quest.assessmentResult;
      const cefrColors: Record<string, string> = {
        A1: '#e74c3c', A2: '#e67e22', B1: '#f1c40f', B2: '#2ecc71', C1: '#3498db', C2: '#9b59b6',
      };

      const cefrRow = new StackPanel();
      cefrRow.isVertical = false;
      cefrRow.width = "100%";
      cefrRow.height = "11px";
      cefrRow.paddingTop = "3px";
      cardStack.addControl(cefrRow);

      const cefrLabel = new TextBlock();
      cefrLabel.text = `Language Level: ${ar.cefrLevel}`;
      cefrLabel.color = cefrColors[ar.cefrLevel] || '#FFF';
      cefrLabel.fontSize = 9;
      cefrLabel.fontWeight = 'bold';
      cefrLabel.width = "88px";
      cefrLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      cefrRow.addControl(cefrLabel);

      const scorePct = ar.maxScore > 0 ? Math.round((ar.totalScore / ar.maxScore) * 100) : 0;
      const scoreText = new TextBlock();
      scoreText.text = `Score: ${scorePct}%`;
      scoreText.color = "#CCC";
      scoreText.fontSize = 8;
      scoreText.width = "66px";
      scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      cefrRow.addControl(scoreText);

      // Dimension scores breakdown
      if (ar.dimensionScores && Object.keys(ar.dimensionScores).length > 0) {
        const dimRow = new StackPanel();
        dimRow.isVertical = false;
        dimRow.width = "100%";
        dimRow.height = "9px";
        dimRow.paddingTop = "2px";
        cardStack.addControl(dimRow);

        const dimEntries = Object.entries(ar.dimensionScores).slice(0, 4);
        const dimStr = dimEntries.map(([k, v]) => `${k.slice(0, 4)}: ${Math.round((v as number) * 100)}%`).join('  ');
        const dimText = new TextBlock();
        dimText.text = dimStr;
        dimText.color = "#AAA";
        dimText.fontSize = 7;
        dimText.width = "100%";
        dimText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        dimRow.addControl(dimText);
      }
    }

    // Per-objective progress (for active quests with objectives)
    if (quest.status === 'active' && quest.objectives && quest.objectives.length > 0) {
      quest.objectives.forEach((obj, idx) => {
        const objRow = new StackPanel();
        objRow.isVertical = false;
        objRow.width = "100%";
        objRow.height = "9px";
        objRow.paddingTop = idx === 0 ? "5px" : "2px";
        cardStack.addControl(objRow);

        const checkText = new TextBlock();
        checkText.text = obj.completed ? "\u2713" : "\u25CB";
        checkText.color = obj.completed ? "#4CAF50" : "#888";
        checkText.fontSize = 8;
        checkText.width = "11px";
        checkText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(checkText);

        const objDesc = new TextBlock();
        const progressSuffix = (obj.required && obj.required > 1)
          ? ` (${obj.current ?? 0}/${obj.required})`
          : '';
        // Strip any baked-in count like "(3)" from description — we show it as progress
        const descText = (obj.description || obj.type?.replace(/_/g, ' ') || '').replace(/\s*\(\d+\)\s*$/, '');
        objDesc.text = descText + progressSuffix;
        objDesc.color = obj.completed ? "#4CAF50" : "#CCC";
        objDesc.fontSize = 8;
        objDesc.width = "165px";
        objDesc.textWrapping = TextWrapping.Clip;
        objDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(objDesc);
      });

      // Overall objectives progress bar
      const objectiveProgress = calculateObjectivesProgress(quest.objectives);
      this.addProgressBar(cardStack, objectiveProgress, typeColor);
    }
    // Fallback: criteria-based progress bar
    else if (quest.status === 'active' && quest.completionCriteria && quest.progress) {
      const progress = this.calculateProgress(quest);
      if (progress !== null) {
        this.addProgressBar(cardStack, progress, typeColor);
      }
    }

    return card;
  }

  private addProgressBar(parent: StackPanel, progress: number, color: string) {
    const container = new Rectangle();
    container.width = "100%";
    container.height = "8px";
    container.background = "rgba(40, 40, 40, 0.8)";
    container.cornerRadius = 2;
    container.thickness = 0;
    container.paddingTop = "3px";
    parent.addControl(container);

    const bar = new Rectangle();
    bar.width = `${Math.max(progress * 100, 2)}%`;
    bar.height = "8px";
    bar.background = color;
    bar.cornerRadius = 2;
    bar.thickness = 0;
    bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(bar);

    const pctText = new TextBlock();
    pctText.text = `${Math.round(progress * 100)}%`;
    pctText.color = "white";
    pctText.fontSize = 8;
    pctText.fontWeight = "bold";
    container.addControl(pctText);
  }

  private showDetailPanel(quest: Quest) {
    if (!this.detailPanel || !this.detailStack) return;

    this.detailStack.clearControls();

    // Back button
    const backBtn = Button.CreateSimpleButton("backBtn", "\u2190 Back");
    backBtn.width = "44px";
    backBtn.height = "16px";
    backBtn.color = "white";
    backBtn.background = "rgba(80, 80, 80, 0.8)";
    backBtn.cornerRadius = 3;
    backBtn.fontSize = 8;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.paddingLeft = "6px";
    backBtn.onPointerClickObservable.add(() => {
      this.hideDetailPanel();
    });
    this.detailStack.addControl(backBtn);

    const typeColor = getQuestTypeColor(quest.questType);

    // Title
    const title = new TextBlock();
    title.text = `${getQuestIcon(quest.questType)} ${quest.title}`;
    title.color = "white";
    title.fontSize = 9;
    title.fontWeight = "bold";
    title.height = "16px";
    title.paddingTop = "6px";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = "6px";
    this.detailStack.addControl(title);

    // Type + difficulty row
    const infoRow = new StackPanel();
    infoRow.isVertical = false;
    infoRow.width = "100%";
    infoRow.height = "12px";
    infoRow.paddingLeft = "6px";
    this.detailStack.addControl(infoRow);

    const typeBadge = new TextBlock();
    typeBadge.text = quest.questType.replace(/_/g, ' ').toUpperCase();
    typeBadge.color = typeColor;
    typeBadge.fontSize = 8;
    typeBadge.fontWeight = "bold";
    typeBadge.width = "82px";
    typeBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoRow.addControl(typeBadge);

    const stars = getDifficultyStars(quest.difficulty);
    const diffText = new TextBlock();
    diffText.text = `${quest.difficulty.toUpperCase()} ${ "\u2605".repeat(stars)}`;
    diffText.color = getDifficultyColor(quest.difficulty);
    diffText.fontSize = 8;
    diffText.fontWeight = "bold";
    diffText.width = "82px";
    diffText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoRow.addControl(diffText);

    // Description
    const desc = new TextBlock();
    desc.text = quest.description;
    desc.color = "#CCC";
    desc.fontSize = 8;
    desc.textWrapping = TextWrapping.WordWrap;
    desc.resizeToFit = true;
    desc.paddingTop = "6px";
    desc.paddingLeft = "6px";
    desc.paddingRight = "6px";
    desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.detailStack.addControl(desc);

    // Assigner
    if (quest.assignedBy) {
      const assignerText = new TextBlock();
      assignerText.text = `From: ${quest.assignedBy}`;
      assignerText.color = "#AAA";
      assignerText.fontSize = 8;
      assignerText.height = "11px";
      assignerText.paddingTop = "3px";
      assignerText.paddingLeft = "6px";
      assignerText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.detailStack.addControl(assignerText);
    }

    // Location and distance
    const distance = this.getQuestDistance(quest);
    if (quest.locationName || distance !== null) {
      const locText = new TextBlock();
      const parts: string[] = [];
      if (quest.locationName) parts.push(quest.locationName);
      if (distance !== null) parts.push(formatDistance(distance) + ' away');
      locText.text = `Location: ${parts.join(' \u2022 ')}`;
      locText.color = "#AAA";
      locText.fontSize = 8;
      locText.height = "11px";
      locText.paddingLeft = "6px";
      locText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.detailStack.addControl(locText);
    }

    // Reward
    const rewardRow = new TextBlock();
    rewardRow.text = `Reward: ${quest.experienceReward} XP`;
    rewardRow.color = "#FFD700";
    rewardRow.fontSize = 8;
    rewardRow.fontWeight = "bold";
    rewardRow.height = "12px";
    rewardRow.paddingTop = "3px";
    rewardRow.paddingLeft = "6px";
    rewardRow.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.detailStack.addControl(rewardRow);

    // Objectives section header
    const objectivesHeader = new TextBlock();
    objectivesHeader.text = "OBJECTIVES";
    objectivesHeader.color = "#FFD700";
    objectivesHeader.fontSize = 8;
    objectivesHeader.fontWeight = "bold";
    objectivesHeader.height = "14px";
    objectivesHeader.paddingTop = "6px";
    objectivesHeader.paddingLeft = "6px";
    objectivesHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.detailStack.addControl(objectivesHeader);

    // Objectives list
    const objectives = quest.objectives || [];
    if (objectives.length > 0) {
      objectives.forEach((obj) => {
        const objRow = new StackPanel();
        objRow.isVertical = false;
        objRow.width = "100%";
        objRow.height = "12px";
        objRow.paddingLeft = "8px";
        this.detailStack!.addControl(objRow);

        const check = new TextBlock();
        check.text = obj.completed ? "\u2713" : "\u25CB";
        check.color = obj.completed ? "#4CAF50" : "#888";
        check.fontSize = 8;
        check.width = "11px";
        check.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(check);

        const objText = new TextBlock();
        const progressStr = (obj.required && obj.required > 1)
          ? ` (${obj.current ?? 0}/${obj.required})`
          : '';
        const detailDesc = (obj.description || obj.type?.replace(/_/g, ' ') || '').replace(/\s*\(\d+\)\s*$/, '');
        objText.text = detailDesc + progressStr;
        objText.color = obj.completed ? "#4CAF50" : "#DDD";
        objText.fontSize = 8;
        objText.textWrapping = TextWrapping.WordWrap;
        objText.width = "170px";
        objText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        objRow.addControl(objText);

        // Per-objective progress bar if applicable
        if (!obj.completed && obj.required && obj.required > 1 && obj.current !== undefined) {
          const objProgress = Math.min(obj.current / obj.required, 1);
          const objBar = new Rectangle();
          objBar.width = "90%";
          objBar.height = "4px";
          objBar.background = "rgba(40, 40, 40, 0.8)";
          objBar.cornerRadius = 1;
          objBar.thickness = 0;
          objBar.paddingLeft = "19px";
          this.detailStack!.addControl(objBar);

          const objFill = new Rectangle();
          objFill.width = `${Math.max(objProgress * 100, 2)}%`;
          objFill.height = "4px";
          objFill.background = typeColor;
          objFill.cornerRadius = 1;
          objFill.thickness = 0;
          objFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          objBar.addControl(objFill);
        }
      });
    } else {
      const noObj = new TextBlock();
      noObj.text = "No specific objectives listed.";
      noObj.color = "#888";
      noObj.fontSize = 8;
      noObj.height = "11px";
      noObj.paddingLeft = "8px";
      noObj.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.detailStack.addControl(noObj);
    }

    // Track button (active quests only)
    if (quest.status === 'active') {
      const isTracked = this.trackedQuestId === quest.id;
      const trackBtn = Button.CreateSimpleButton(
        "trackBtn",
        isTracked ? "\u2713 Tracking" : "Track Quest"
      );
      trackBtn.width = "77px";
      trackBtn.height = "19px";
      trackBtn.color = isTracked ? "#000" : "white";
      trackBtn.background = isTracked ? "#FFD700" : typeColor;
      trackBtn.cornerRadius = 3;
      trackBtn.fontSize = 8;
      trackBtn.fontWeight = "bold";
      trackBtn.paddingTop = "8px";
      trackBtn.onPointerClickObservable.add(() => {
        this.trackQuest(quest.id);
        this.showDetailPanel(quest); // refresh
        this.updateQuestsDisplay(); // refresh list too
      });
      this.detailStack.addControl(trackBtn);
    }

    // Completed quest: show completion info
    if (quest.status === 'completed' && quest.completedAt) {
      const completedInfo = new TextBlock();
      const date = new Date(quest.completedAt);
      completedInfo.text = `Completed on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
      completedInfo.color = "#4CAF50";
      completedInfo.fontSize = 8;
      completedInfo.height = "14px";
      completedInfo.paddingTop = "8px";
      completedInfo.paddingLeft = "6px";
      completedInfo.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.detailStack.addControl(completedInfo);

      const earnedXP = new TextBlock();
      earnedXP.text = `Earned: ${quest.experienceReward} XP`;
      earnedXP.color = "#FFD700";
      earnedXP.fontSize = 8;
      earnedXP.fontWeight = "bold";
      earnedXP.height = "12px";
      earnedXP.paddingLeft = "6px";
      earnedXP.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.detailStack.addControl(earnedXP);

      // Performance rating
      if (quest.performanceRating != null) {
        const perfText = new TextBlock();
        const fullStars = Math.round(quest.performanceRating);
        perfText.text = `Performance: ${ "\u2605".repeat(fullStars)}${"\u2606".repeat(5 - fullStars)}`;
        perfText.color = "#FFC107";
        perfText.fontSize = 8;
        perfText.height = "11px";
        perfText.paddingLeft = "6px";
        perfText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(perfText);
      }

      // Time taken
      if (quest.assignedAt && quest.completedAt) {
        const msElapsed = new Date(quest.completedAt).getTime() - new Date(quest.assignedAt).getTime();
        const mins = Math.round(msElapsed / 60000);
        const timeText = new TextBlock();
        timeText.text = `Time taken: ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`;
        timeText.color = "#AAA";
        timeText.fontSize = 8;
        timeText.height = "10px";
        timeText.paddingLeft = "6px";
        timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(timeText);
      }

      // Hints used
      if (quest.hintsUsed != null && quest.hintsUsed > 0) {
        const hintsText = new TextBlock();
        hintsText.text = `Hints used: ${quest.hintsUsed}`;
        hintsText.color = "#AAA";
        hintsText.fontSize = 8;
        hintsText.height = "10px";
        hintsText.paddingLeft = "6px";
        hintsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(hintsText);
      }

      // Vocabulary used
      if (quest.vocabularyUsed && quest.vocabularyUsed.length > 0) {
        const vocabLabel = new TextBlock();
        vocabLabel.text = `Vocabulary: ${quest.vocabularyUsed.join(', ')}`;
        vocabLabel.color = "#4CAF50";
        vocabLabel.fontSize = 8;
        vocabLabel.textWrapping = TextWrapping.WordWrap;
        vocabLabel.resizeToFit = true;
        vocabLabel.paddingLeft = "6px";
        vocabLabel.paddingRight = "6px";
        vocabLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(vocabLabel);
      }

      // Grammar accuracy
      if (quest.grammarAccuracy != null) {
        const grammarText = new TextBlock();
        grammarText.text = `Grammar accuracy: ${Math.round(quest.grammarAccuracy * 100)}%`;
        grammarText.color = "#00BCD4";
        grammarText.fontSize = 8;
        grammarText.height = "10px";
        grammarText.paddingLeft = "6px";
        grammarText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(grammarText);
      }

      // Assessment results section (for assessment-type quests)
      if (quest.assessmentResult) {
        const ar = quest.assessmentResult;
        const cefrColors: Record<string, string> = {
          A1: '#e74c3c', A2: '#e67e22', B1: '#f1c40f', B2: '#2ecc71', C1: '#3498db', C2: '#9b59b6',
        };

        const arHeader = new TextBlock();
        arHeader.text = "ASSESSMENT RESULTS";
        arHeader.color = "#FFD700";
        arHeader.fontSize = 8;
        arHeader.fontWeight = "bold";
        arHeader.height = "14px";
        arHeader.paddingTop = "8px";
        arHeader.paddingLeft = "6px";
        arHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(arHeader);

        const cefrText = new TextBlock();
        cefrText.text = `Language Level: ${ar.cefrLevel}`;
        cefrText.color = cefrColors[ar.cefrLevel] || '#FFF';
        cefrText.fontSize = 10;
        cefrText.fontWeight = 'bold';
        cefrText.height = "14px";
        cefrText.paddingLeft = "6px";
        cefrText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(cefrText);

        const scorePct = ar.maxScore > 0 ? Math.round((ar.totalScore / ar.maxScore) * 100) : 0;
        const totalScoreText = new TextBlock();
        totalScoreText.text = `Overall Score: ${scorePct}% (${Math.round(ar.totalScore)}/${ar.maxScore})`;
        totalScoreText.color = "#CCC";
        totalScoreText.fontSize = 8;
        totalScoreText.height = "11px";
        totalScoreText.paddingLeft = "6px";
        totalScoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailStack.addControl(totalScoreText);

        if (ar.dimensionScores && Object.keys(ar.dimensionScores).length > 0) {
          for (const [dim, score] of Object.entries(ar.dimensionScores)) {
            const dimLabel = dim.charAt(0).toUpperCase() + dim.slice(1);
            const dimPct = Math.round((score as number) * 100);
            const dimText = new TextBlock();
            dimText.text = `  ${dimLabel}: ${dimPct}%`;
            dimText.color = "#AAA";
            dimText.fontSize = 8;
            dimText.height = "10px";
            dimText.paddingLeft = "6px";
            dimText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.detailStack.addControl(dimText);
          }
        }
      }
    }

    this.detailPanel.isVisible = true;
  }

  private rebuildFilterBar() {
    if (!this.filterBarPanel) return;
    this.filterBarPanel.clearControls();

    // Row 1: Sort buttons + search hint
    const sortRow = new StackPanel("sortRow");
    sortRow.isVertical = false;
    sortRow.width = "100%";
    sortRow.height = "14px";
    this.filterBarPanel.addControl(sortRow);

    const sortLabel = new TextBlock();
    sortLabel.text = "Sort:";
    sortLabel.color = "#AAA";
    sortLabel.fontSize = 8;
    sortLabel.width = "19px";
    sortLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sortLabel.paddingLeft = "3px";
    sortRow.addControl(sortLabel);

    const sortOptions: { label: string; value: QuestSortBy }[] = [
      { label: "Recent", value: "recent" },
      { label: "Difficulty", value: "difficulty" },
      { label: "Reward", value: "reward" },
    ];

    for (const opt of sortOptions) {
      const btn = Button.CreateSimpleButton(`sort_${opt.value}`, opt.label);
      btn.width = "38px";
      btn.height = "12px";
      btn.fontSize = 8;
      btn.thickness = 0;
      btn.cornerRadius = 2;
      btn.color = this.sortBy === opt.value ? "white" : "#888";
      btn.background = this.sortBy === opt.value ? "rgba(100,100,100,0.8)" : "transparent";
      btn.onPointerClickObservable.add(() => {
        this.sortBy = opt.value;
        this.rebuildFilterBar();
        this.updateQuestsDisplay();
      });
      sortRow.addControl(btn);
    }

    // Row 2: Filter buttons (type cycling + difficulty cycling + clear)
    const filterRow = new StackPanel("filterRow");
    filterRow.isVertical = false;
    filterRow.width = "100%";
    filterRow.height = "14px";
    this.filterBarPanel.addControl(filterRow);

    // Quest type filter button
    const types = getUniqueQuestTypes(this.quests);
    const typeBtn = Button.CreateSimpleButton("filterType",
      this.filters.questType ? `Type: ${this.filters.questType}` : "All Types");
    typeBtn.width = "61px";
    typeBtn.height = "12px";
    typeBtn.fontSize = 8;
    typeBtn.thickness = 0;
    typeBtn.cornerRadius = 2;
    typeBtn.color = this.filters.questType ? "white" : "#888";
    typeBtn.background = this.filters.questType ? getQuestTypeColor(this.filters.questType) + "88" : "transparent";
    typeBtn.onPointerClickObservable.add(() => {
      if (!this.filters.questType) {
        this.filters.questType = types[0];
      } else {
        const idx = types.indexOf(this.filters.questType);
        this.filters.questType = idx < types.length - 1 ? types[idx + 1] : undefined;
      }
      this.rebuildFilterBar();
      this.updateQuestsDisplay();
    });
    filterRow.addControl(typeBtn);

    // Difficulty filter button
    const diffs = ['beginner', 'intermediate', 'advanced'];
    const diffBtn = Button.CreateSimpleButton("filterDiff",
      this.filters.difficulty ? `Diff: ${this.filters.difficulty}` : "All Diff");
    diffBtn.width = "55px";
    diffBtn.height = "12px";
    diffBtn.fontSize = 8;
    diffBtn.thickness = 0;
    diffBtn.cornerRadius = 2;
    diffBtn.color = this.filters.difficulty ? "white" : "#888";
    diffBtn.background = this.filters.difficulty ? getDifficultyColor(this.filters.difficulty) + "88" : "transparent";
    diffBtn.onPointerClickObservable.add(() => {
      if (!this.filters.difficulty) {
        this.filters.difficulty = diffs[0];
      } else {
        const idx = diffs.indexOf(this.filters.difficulty);
        this.filters.difficulty = idx < diffs.length - 1 ? diffs[idx + 1] : undefined;
      }
      this.rebuildFilterBar();
      this.updateQuestsDisplay();
    });
    filterRow.addControl(diffBtn);

    // NPC filter button
    const givers = getUniqueQuestGivers(this.quests);
    if (givers.length > 0) {
      const npcBtn = Button.CreateSimpleButton("filterNpc",
        this.filters.assignedBy ? `NPC: ${this.filters.assignedBy.substring(0, 8)}` : "All NPCs");
      npcBtn.width = "50px";
      npcBtn.height = "12px";
      npcBtn.fontSize = 8;
      npcBtn.thickness = 0;
      npcBtn.cornerRadius = 2;
      npcBtn.color = this.filters.assignedBy ? "white" : "#888";
      npcBtn.background = this.filters.assignedBy ? "rgba(100,100,100,0.8)" : "transparent";
      npcBtn.onPointerClickObservable.add(() => {
        if (!this.filters.assignedBy) {
          this.filters.assignedBy = givers[0];
        } else {
          const idx = givers.indexOf(this.filters.assignedBy);
          this.filters.assignedBy = idx < givers.length - 1 ? givers[idx + 1] : undefined;
        }
        this.rebuildFilterBar();
        this.updateQuestsDisplay();
      });
      filterRow.addControl(npcBtn);
    }

    // Clear all filters button
    const hasFilters = this.filters.questType || this.filters.difficulty || this.filters.assignedBy || this.filters.search;
    if (hasFilters) {
      const clearBtn = Button.CreateSimpleButton("clearFilters", "\u2715");
      clearBtn.width = "16px";
      clearBtn.height = "12px";
      clearBtn.fontSize = 8;
      clearBtn.thickness = 0;
      clearBtn.cornerRadius = 2;
      clearBtn.color = "#F44336";
      clearBtn.background = "transparent";
      clearBtn.onPointerClickObservable.add(() => {
        this.filters = {};
        this.rebuildFilterBar();
        this.updateQuestsDisplay();
      });
      filterRow.addControl(clearBtn);
    }

    // Row 3: Search display (show current search term if any)
    if (this.filters.search) {
      const searchRow = new StackPanel("searchRow");
      searchRow.isVertical = false;
      searchRow.width = "100%";
      searchRow.height = "12px";
      this.filterBarPanel.addControl(searchRow);

      const searchText = new TextBlock();
      searchText.text = `Search: "${this.filters.search}"`;
      searchText.color = "#AAA";
      searchText.fontSize = 8;
      searchText.width = "165px";
      searchText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      searchText.paddingLeft = "6px";
      searchRow.addControl(searchText);
    }
  }

  private renderStatsTab() {
    if (!this.questListPanel) return;

    const stats = computeQuestStats(this.quests);

    // Title
    const title = new TextBlock();
    title.text = "Quest Statistics";
    title.color = "#FFD700";
    title.fontSize = 9;
    title.fontWeight = "bold";
    title.height = "16px";
    title.paddingTop = "6px";
    this.questListPanel.addControl(title);

    // Summary stats
    const summaryItems = [
      { label: "Total Completed", value: `${stats.totalCompleted}`, color: "#4CAF50" },
      { label: "Active Quests", value: `${stats.totalActive}`, color: "#2196F3" },
      { label: "Failed / Abandoned", value: `${stats.totalFailed} / ${stats.totalAbandoned}`, color: "#F44336" },
      { label: "Completion Rate", value: `${Math.round(stats.completionRate * 100)}%`, color: "#FFC107" },
      { label: "Avg Performance", value: stats.averagePerformance > 0 ? `${stats.averagePerformance.toFixed(1)} / 5` : "N/A", color: "#FFC107" },
      { label: "Total XP Earned", value: `${stats.totalXpEarned}`, color: "#FFD700" },
      { label: "Vocabulary Learned", value: `${stats.vocabularyWordsLearned} words`, color: "#4CAF50" },
      { label: "Grammar Quests", value: `${stats.grammarPatternsCount}`, color: "#00BCD4" },
    ];

    for (const item of summaryItems) {
      const row = new StackPanel();
      row.isVertical = false;
      row.width = "100%";
      row.height = "13px";
      row.paddingLeft = "8px";
      this.questListPanel.addControl(row);

      const label = new TextBlock();
      label.text = item.label;
      label.color = "#AAA";
      label.fontSize = 8;
      label.width = "99px";
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(label);

      const value = new TextBlock();
      value.text = item.value;
      value.color = item.color;
      value.fontSize = 8;
      value.fontWeight = "bold";
      value.width = "82px";
      value.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(value);
    }

    // Quests by type breakdown
    const typeHeader = new TextBlock();
    typeHeader.text = "BY TYPE";
    typeHeader.color = "#FFD700";
    typeHeader.fontSize = 8;
    typeHeader.fontWeight = "bold";
    typeHeader.height = "15px";
    typeHeader.paddingTop = "7px";
    typeHeader.paddingLeft = "8px";
    typeHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.questListPanel.addControl(typeHeader);

    for (const [type, count] of Object.entries(stats.questsByType)) {
      const row = new StackPanel();
      row.isVertical = false;
      row.width = "100%";
      row.height = "11px";
      row.paddingLeft = "11px";
      this.questListPanel.addControl(row);

      const typeLabel = new TextBlock();
      typeLabel.text = `${getQuestIcon(type)} ${type.replace(/_/g, ' ')}`;
      typeLabel.color = getQuestTypeColor(type);
      typeLabel.fontSize = 8;
      typeLabel.width = "110px";
      typeLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(typeLabel);

      const countText = new TextBlock();
      countText.text = `${count}`;
      countText.color = "#CCC";
      countText.fontSize = 8;
      countText.width = "28px";
      countText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(countText);
    }

    // Quests by difficulty breakdown
    const diffHeader = new TextBlock();
    diffHeader.text = "BY DIFFICULTY";
    diffHeader.color = "#FFD700";
    diffHeader.fontSize = 8;
    diffHeader.fontWeight = "bold";
    diffHeader.height = "15px";
    diffHeader.paddingTop = "7px";
    diffHeader.paddingLeft = "8px";
    diffHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.questListPanel.addControl(diffHeader);

    for (const [diff, count] of Object.entries(stats.questsByDifficulty)) {
      const row = new StackPanel();
      row.isVertical = false;
      row.width = "100%";
      row.height = "11px";
      row.paddingLeft = "11px";
      this.questListPanel.addControl(row);

      const diffLabel = new TextBlock();
      const stars = getDifficultyStars(diff);
      diffLabel.text = `${diff} ${"\u2605".repeat(stars)}`;
      diffLabel.color = getDifficultyColor(diff);
      diffLabel.fontSize = 8;
      diffLabel.width = "110px";
      diffLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(diffLabel);

      const countText = new TextBlock();
      countText.text = `${count}`;
      countText.color = "#CCC";
      countText.fontSize = 8;
      countText.width = "28px";
      countText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(countText);
    }
  }

  private hideDetailPanel() {
    if (this.detailPanel) {
      this.detailPanel.isVisible = false;
    }
    this.selectedQuestId = null;
  }

  /** Track a quest — activates waypoints for its objectives */
  public trackQuest(questId: string) {
    if (this.trackedQuestId === questId) {
      // Untrack
      this.trackedQuestId = null;
      this.waypointManager.clearAll();
    } else {
      this.trackedQuestId = questId;
      this.updateWaypointsForTrackedQuest();
    }
  }

  private getQuestDistance(quest: Quest): number | null {
    // Try to find a position from objectives
    const objectives = quest.objectives || [];
    for (const obj of objectives) {
      if (obj.completed) continue;
      const pos = obj.position || obj.locationPosition;
      if (pos) {
        const target = new Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
        return Vector3.Distance(this.playerPosition, target);
      }
    }

    // Try completionCriteria objectives
    if (quest.completionCriteria?.objectives) {
      const criteriaObjs = Array.isArray(quest.completionCriteria.objectives)
        ? quest.completionCriteria.objectives : [];
      for (const obj of criteriaObjs) {
        if (obj.completed) continue;
        const pos = obj.position || obj.locationPosition;
        if (pos) {
          const target = new Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
          return Vector3.Distance(this.playerPosition, target);
        }
      }
    }

    return null;
  }

  private calculateProgress(quest: Quest): number | null {
    if (!quest.completionCriteria || !quest.progress) return null;

    // Check Prolog-based completion (async, fire-and-forget for UI update)
    if (this.prologEngine && quest.status === 'active') {
      this.evaluateQuestCompletion(quest.id).then(complete => {
        if (complete && quest.status === 'active') {
        }
      }).catch(() => { /* non-fatal */ });
    }

    return calculateCriteriaProgress(quest.completionCriteria, quest.progress);
  }

  private getQuestIcon(questType: string): string {
    switch (questType) {
      // Language learning
      case 'conversation': return '💬';
      case 'translation': return '🔄';
      case 'vocabulary': return '📚';
      case 'grammar': return '📝';
      case 'cultural': return '🌍';
      case 'listening_comprehension': return '🎧';
      case 'translation_challenge': return '🔄';
      case 'navigation': return '🧭';

      // RPG
      case 'combat': return '⚔️';
      case 'collection': return '📦';
      case 'exploration': return '🗺️';
      case 'escort': return '🛡️';
      case 'delivery': return '📨';
      case 'crafting': return '🔨';
      case 'social': return '🤝';

      default: return '🎯';
    }
  }

  private getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
      // Language learning
      case 'beginner': return '#4CAF50';
      case 'intermediate': return '#FFC107';
      case 'advanced': return '#F44336';

      // RPG
      case 'easy': return '#4CAF50';
      case 'normal': return '#FFC107';
      case 'hard': return '#F44336';
      case 'legendary': return '#9C27B0'; // Purple

      default: return '#888';
    }
  }

  public show() {
    this.isVisible = true;
    if (this.questPanel) {
      this.questPanel.isVisible = true;
    }
  }

  public hide() {
    this.isVisible = false;
    if (this.questPanel) {
      this.questPanel.isVisible = false;
    }
    this.hideDetailPanel();
  }

  public toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  private toggleMinimize() {
    if (!this.questPanel) return;

    this.isMinimized = !this.isMinimized;

    if (this.isMinimized) {
      this.questPanel.height = "28px";
      this.hideDetailPanel();
    } else {
      this.questPanel.height = "275px";
    }
  }

  public setOnClose(callback: () => void) {
    this.onClose = callback;
  }

  public setPrologEngine(engine: GamePrologEngine): void {
    this.prologEngine = engine;
  }

  public async evaluateQuestCompletion(questId: string): Promise<boolean> {
    if (!this.prologEngine) return false;
    try {
      return await this.prologEngine.isQuestComplete(questId, this.playerId);
    } catch {
      return false;
    }
  }

  public async isQuestAvailable(questId: string): Promise<boolean> {
    if (!this.prologEngine) return true;
    try {
      return await this.prologEngine.isQuestAvailable(questId, this.playerId);
    } catch {
      return true;
    }
  }

  private updateWaypoints() {
    if (!this.showWaypoints) {
      this.waypointManager.clearAll();
      this.resolvedWaypoints = [];
      this.updateCompassHUD(null);
      return;
    }

    // If tracking a specific quest, only show its waypoints
    if (this.trackedQuestId) {
      this.updateWaypointsForTrackedQuest();
      return;
    }

    this.waypointManager.clearAll();
    this.resolvedWaypoints = [];

    const activeQuests = this.quests.filter(q => q.status === 'active');

    for (const quest of activeQuests) {
      const resolved = this.waypointDirector.resolveWaypoints(
        quest, this.buildingData, this.npcBuildingMap, this.npcPositions, this.playerPosition
      );
      for (const wp of resolved) {
        const pos = new Vector3(wp.position.x, wp.position.y || 0, wp.position.z);
        this.waypointManager.createWaypointForObjectiveType(wp.objectiveId, pos, wp.objectiveType);
      }
      this.resolvedWaypoints.push(...resolved);
    }

  }

  private updateWaypointsForTrackedQuest() {
    this.waypointManager.clearAll();
    this.resolvedWaypoints = [];

    if (!this.trackedQuestId) return;

    const quest = this.quests.find(q => q.id === this.trackedQuestId);
    if (!quest) return;

    const resolved = this.waypointDirector.resolveWaypoints(
      quest, this.buildingData, this.npcBuildingMap, this.npcPositions, this.playerPosition
    );

    for (const wp of resolved) {
      const pos = new Vector3(wp.position.x, wp.position.y || 0, wp.position.z);
      this.waypointManager.createWaypointForObjectiveType(wp.objectiveId, pos, wp.objectiveType);
    }

    this.resolvedWaypoints = resolved;
  }

  public toggleWaypoints(): boolean {
    this.showWaypoints = !this.showWaypoints;

    if (this.showWaypoints) {
      this.updateWaypoints();
    } else {
      this.waypointManager.clearAll();
    }

    return this.showWaypoints;
  }

  public setWaypointsVisible(visible: boolean) {
    this.showWaypoints = visible;

    if (visible) {
      this.updateWaypoints();
    } else {
      this.waypointManager.clearAll();
    }
  }

  public getWaypointManager(): QuestWaypointManager {
    return this.waypointManager;
  }

  public getTrackedQuestId(): string | null {
    return this.trackedQuestId;
  }

  public getSelectedQuestId(): string | null {
    return this.selectedQuestId;
  }

  public getActiveTab(): 'active' | 'completed' | 'stats' {
    return this.activeTab;
  }

  /** Set search filter and refresh display */
  public setSearch(term: string) {
    this.filters.search = term || undefined;
    this.rebuildFilterBar();
    this.updateQuestsDisplay();
  }

  /** Get current filters (for testing) */
  public getFilters(): QuestFilters {
    return { ...this.filters };
  }

  /** Get current sort (for testing) */
  public getSortBy(): QuestSortBy {
    return this.sortBy;
  }

  // ── World data setters (called from BabylonGame) ───────────────────────

  /** Set building data for dynamic waypoint resolution */
  public setWorldData(
    buildingData: Map<string, DirectorBuildingEntry>,
    npcBuildingMap: Map<string, string>,
    npcPositions: DirectorNpcPosition[]
  ): void {
    this.buildingData = buildingData;
    this.npcBuildingMap = npcBuildingMap;
    this.npcPositions = npcPositions;
    // Re-resolve waypoints now that we have world data
    // (updateQuests may have run before setWorldData was called)
    this.updateWaypoints();
  }

  /** Update NPC positions (call when NPCs move) */
  public setNpcPositions(npcPositions: DirectorNpcPosition[]): void {
    this.npcPositions = npcPositions;
  }

  /** Set player facing direction for compass calculation */
  public setPlayerForwardAngle(angle: number): void {
    this.playerForwardAngle = angle;
  }

  // ── Per-frame update ──────────────────────────────────────────────────

  /**
   * Called per-frame (or throttled) to update distance fading and compass.
   * Handles smooth waypoint transitions when objectives complete.
   */
  public updateFrame(playerPosition: Vector3): void {
    this.playerPosition = playerPosition.clone();

    if (!this.showWaypoints) return;

    // Update distance-based fading on waypoint meshes
    this.waypointManager.updateDistanceFading(playerPosition);

    // Update compass HUD
    const compassData = this.waypointDirector.getCompassData(
      this.resolvedWaypoints, playerPosition, this.playerForwardAngle
    );
    this.updateCompassHUD(compassData);

    // Re-resolve conversation-only waypoints (nearest NPC may change)
    this.updateConversationWaypoints();
  }

  /** Re-resolve waypoints for conversation-only objectives pointing to nearest NPC */
  private updateConversationWaypoints(): void {
    if (this.npcPositions.length === 0) return;

    for (const wp of this.resolvedWaypoints) {
      if (wp.label === 'Nearby NPC') {
        // Find nearest NPC and update position
        let nearestDist = Infinity;
        let nearestPos: { x: number; y: number; z: number } | null = null;
        for (const npc of this.npcPositions) {
          const dx = npc.position.x - this.playerPosition.x;
          const dz = npc.position.z - this.playerPosition.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestPos = npc.position;
          }
        }
        if (nearestPos) {
          wp.position = nearestPos;
          this.waypointManager.updateWaypointPosition(
            wp.objectiveId,
            new Vector3(nearestPos.x, nearestPos.y || 0, nearestPos.z)
          );
        }
      }
    }
  }

  // ── Compass HUD ───────────────────────────────────────────────────────

  private createCompassHUD(): void {
    // Container at top center of screen
    this.compassContainer = new Rectangle("compassContainer");
    this.compassContainer.width = "160px";
    this.compassContainer.height = "40px";
    this.compassContainer.background = "rgba(0, 0, 0, 0.6)";
    this.compassContainer.color = "rgba(255, 255, 255, 0.3)";
    this.compassContainer.thickness = 1;
    this.compassContainer.cornerRadius = 8;
    this.compassContainer.top = "8px";
    this.compassContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.compassContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.compassContainer.isVisible = false;
    this.compassContainer.zIndex = 45;
    this.advancedTexture.addControl(this.compassContainer);

    const stack = new StackPanel();
    stack.isVertical = false;
    stack.width = "100%";
    stack.height = "100%";
    this.compassContainer.addControl(stack);

    // Arrow indicator
    this.compassArrow = new Ellipse("compassArrow");
    this.compassArrow.width = "24px";
    this.compassArrow.height = "24px";
    this.compassArrow.color = "#FFD700";
    this.compassArrow.thickness = 2;
    this.compassArrow.background = "rgba(255, 215, 0, 0.3)";
    stack.addControl(this.compassArrow);

    // Arrow character inside ellipse
    const arrowText = new TextBlock("compassArrowText");
    arrowText.text = "^";
    arrowText.color = "#FFD700";
    arrowText.fontSize = 16;
    arrowText.fontWeight = "bold";
    this.compassArrow.addControl(arrowText);

    // Info stack (label + distance)
    const infoStack = new StackPanel();
    infoStack.isVertical = true;
    infoStack.width = "120px";
    infoStack.height = "100%";
    stack.addControl(infoStack);

    this.compassLabel = new TextBlock("compassLabel");
    this.compassLabel.text = "";
    this.compassLabel.color = "#FFF";
    this.compassLabel.fontSize = 9;
    this.compassLabel.height = "18px";
    this.compassLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.compassLabel.paddingLeft = "4px";
    infoStack.addControl(this.compassLabel);

    this.compassDistance = new TextBlock("compassDistance");
    this.compassDistance.text = "";
    this.compassDistance.color = "#AAA";
    this.compassDistance.fontSize = 8;
    this.compassDistance.height = "16px";
    this.compassDistance.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.compassDistance.paddingLeft = "4px";
    infoStack.addControl(this.compassDistance);
  }

  private updateCompassHUD(data: CompassData | null): void {
    if (!this.compassContainer) return;

    if (!data || !this.showWaypoints) {
      this.compassContainer.isVisible = false;
      return;
    }

    this.compassContainer.isVisible = true;

    // Update arrow rotation to point toward objective
    if (this.compassArrow) {
      // Convert angle to degrees for rotation
      this.compassArrow.rotation = data.angle;

      // Color based on objective type
      const color = getWaypointColor(data.objectiveType);
      const hexColor = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
      this.compassArrow.color = hexColor;

      const arrowText = this.compassArrow.children[0] as TextBlock;
      if (arrowText) {
        arrowText.color = hexColor;
        // Change arrow symbol based on direction
        const absAngle = Math.abs(data.angle);
        if (absAngle < 0.4) arrowText.text = "\u2191"; // Up arrow (ahead)
        else if (data.angle > 0.4 && data.angle < 2.7) arrowText.text = "\u2192"; // Right
        else if (data.angle < -0.4 && data.angle > -2.7) arrowText.text = "\u2190"; // Left
        else arrowText.text = "\u2193"; // Down arrow (behind)
      }
    }

    // Update label
    if (this.compassLabel) {
      const label = data.label || data.objectiveType.replace(/_/g, ' ');
      this.compassLabel.text = label.length > 18 ? label.substring(0, 16) + '..' : label;
    }

    // Update distance
    if (this.compassDistance) {
      const dist = Math.round(data.distance);
      this.compassDistance.text = dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`;
    }
  }

  public dispose() {
    this.disposed = true;
    if (this.questPanel) {
      this.advancedTexture.removeControl(this.questPanel);
    }
    if (this.detailPanel) {
      this.advancedTexture.removeControl(this.detailPanel);
    }
    if (this.compassContainer) {
      this.advancedTexture.removeControl(this.compassContainer);
    }
    this.waypointManager.dispose();
  }
}
