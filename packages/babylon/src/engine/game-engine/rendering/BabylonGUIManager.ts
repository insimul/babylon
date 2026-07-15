import {
  AdvancedDynamicTexture,
  Button,
  Container,
  Control,
  Ellipse,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
  Image
} from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";
import type { Action } from '@shared/game-engine/types';
import { NotificationStore } from "../logic/NotificationStore";
import { MARKER_STYLES } from "../logic/QuestMarkerService";
import { createTickerText, disposeTickers, type TickerHandle } from "./GUITickerText";

export interface GUIConfig {
  worldName: string;
  worldId: string;
}

export interface WorldStats {
  countries: number;
  settlements: number;
  characters: number;
  rules: number;
  baseRules: number;
  actions: number;
  baseActions: number;
  quests: number;
}

export interface PlayerStatus {
  energy: number;
  maxEnergy: number;
  status: string;
  gold?: number; // Player's currency
}

export interface NPCInfo {
  id: string;
  name: string;
  occupation?: string;
  disposition?: string;
  questGiver: boolean;
  role?: 'civilian' | 'guard' | 'merchant' | 'questgiver';
}

export interface ActionFeedbackData {
  actionName: string;
  targetName: string;
  narrativeText: string;
  success: boolean;
  timestamp: number;
}

export interface MinimapBuilding {
  position: { x: number; z: number };
  type: 'business' | 'residence' | 'other';
  width?: number;  // footprint width in world units (default 6)
  depth?: number;  // footprint depth in world units (default 6)
}

export interface MinimapData {
  settlements: Array<{
    id: string;
    name: string;
    position: { x: number; z: number };
    type: string; // city, town, village
    zoneType: string; // safe, neutral, caution
    buildingCount?: number;
  }>;
  buildings?: MinimapBuilding[];
  questMarkers?: Array<{
    id: string;
    title: string;
    position: { x: number; z: number };
  }>;
  questObjectiveMarkers?: Array<{
    id: string;
    questTitle: string;
    objectiveType: string;
    objectiveDescription: string;
    position: { x: number; z: number };
    color: string;
    shape: 'diamond' | 'circle';
  }>;
  questItemMarkers?: Array<{
    id: string;
    itemName: string;
    position: { x: number; z: number };
  }>;
  npcPositions?: Array<{
    id: string;
    position: { x: number; z: number };
    role?: string;
    name?: string;
    /** Unified quest-marker kind from QuestMarkerService. */
    questMarkerKind?: import('../logic/QuestMarkerService').QuestMarkerKind | null;
  }>;
  /** NPC ID to highlight with a prominent marker (e.g. assessment conversation target). */
  highlightedNpcId?: string;
  /** Notice boards with available quests */
  noticeBoards?: Array<{
    id: string;
    position: { x: number; z: number };
    questCount: number;
  }>;
  streets?: Array<{
    waypoints: Array<{ x: number; z: number }>;
    width: number;
  }>;
  playerPosition: { x: number; z: number };
  playerRotationY: number; // Player's Y-axis rotation in radians
  worldSize: number; // Terrain size for scaling
}

export interface ReputationData {
  settlementName: string;
  score: number; // -100 to 100
  standing: string; // hostile, unfriendly, neutral, friendly, revered
  isBanned: boolean;
  violationCount: number;
  outstandingFines: number;
}

export interface SettlementDetails {
  id: string;
  name: string;
  type: string;
  population: number;
  businesses: number;
  residences: number;
  lots: number;
  buildingCount: number;
  zoneType?: string;
  terrain?: string;
}

export class BabylonGUIManager {
  public advancedTexture: AdvancedDynamicTexture;
  private scene: Scene;
  private config: GUIConfig;

  // UI Elements
  private crosshairContainer: Container | null = null;
  private crosshairFreeMode = false;
  private crosshairMouseHandler: ((e: MouseEvent) => void) | null = null;
  private hudContainer: Container | null = null;
  private worldStatsPanel: Container | null = null;
  private playerStatsPanel: Container | null = null;
  private actionPanel: Container | null = null;
  private npcListPanel: Container | null = null;
  private feedbackPanel: Container | null = null;
  private menuButton: Button | null = null;
  private cameraButton: Button | null = null;
  private fullscreenButton: Button | null = null;
  private menuPanel: Rectangle | null = null;
  private static readonly MINIMAP_SIZE = 166;
  private minimapPanel: Container | null = null;
  private _minimapExpanded = true;
  private _minimapTitle: TextBlock | null = null;
  private _minimapToggleIcon: TextBlock | null = null;
  private _onMinimapCollapsedChanged: ((expanded: boolean) => void) | null = null;
  private _onHudLayoutChanged: ((npcIndicatorTop: number) => void) | null = null;

  // Notifications HUD panel (below minimap, right side)
  private _notifPanel: Rectangle | null = null;
  private _notifStack: StackPanel | null = null;
  private _notifScrollViewer: ScrollViewer | null = null;
  private _notifExpanded = true;
  private _notifToggleIcon: TextBlock | null = null;
  private _notifTickerHandles: TickerHandle[] = [];
  private _notifSubId: (() => void) | null = null;
  private minimapStaticRendered: boolean = false;
  private minimapStaticImage: Image | null = null;
  private minimapTerrainImage: Image | null = null;
  private reputationPanel: Container | null = null;
  private settlementDetailsPanel: Container | null = null;
  private helpPanel: Container | null = null;
  private fluencyPanel: Rectangle | null = null;
  private _gameType: string | null = null;

  // Time HUD indicator (bottom-left, compact)
  private _timePanel: Rectangle | null = null;
  private _timeText: TextBlock | null = null;
  private _dayText: TextBlock | null = null;
  private _todText: TextBlock | null = null;

  // State
  private isMenuOpen = false;
  private selectedNPCId: string | null = null;

  // Callbacks
  private onActionSelected: ((actionId: string) => void) | null = null;
  private onNPCSelected: ((npcId: string) => void) | null = null;
  private onBackPressed: (() => void) | null = null;
  private onFullscreenPressed: (() => void) | null = null;
  private onDebugPressed: (() => void) | null = null;
  private onPayFines: (() => void) | null = null;
  private onVRToggled: (() => void) | null = null;
  private onCameraModePressed: (() => void) | null = null;
  private onMinimapNavigate: ((worldX: number, worldZ: number) => void) | null = null;

  constructor(scene: Scene, config: GUIConfig) {
    this.scene = scene;
    this.config = config;
    // Revert to layer mode (third parameter = true)
    this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);
    // Scale GUI coordinates so controls are sized for ~1280px logical width.
    // This keeps the texture at full DPI (sharp) but makes elements physically
    // larger on high-resolution screens — no stretching or blurring.
    this.advancedTexture.idealWidth = 1280;
    this.initialize();
  }

  private initialize() {
    this.createHUD();
    this.createFullscreenButton();
  }

  /**
   * Show a centered crosshair reticle for first-person mode.
   */
  public showCrosshair(): void {
    if (this.crosshairContainer) return;

    const container = new Container('crosshair_container');
    container.width = '30px';
    container.height = '30px';
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.isPointerBlocker = false;

    // Outer ring
    const ring = new Ellipse('crosshair_ring');
    ring.width = '20px';
    ring.height = '20px';
    ring.color = 'rgba(255, 255, 255, 0.6)';
    ring.thickness = 1.5;
    ring.background = '';
    container.addControl(ring);

    // Center dot
    const dot = new Ellipse('crosshair_dot');
    dot.width = '4px';
    dot.height = '4px';
    dot.color = 'white';
    dot.thickness = 0;
    dot.background = 'rgba(255, 255, 255, 0.8)';
    container.addControl(dot);

    this.advancedTexture.addControl(container);
    this.crosshairContainer = container;
  }

  /**
   * Hide the crosshair reticle.
   */
  public hideCrosshair(): void {
    this.setCrosshairFreeMode(false);
    if (this.crosshairContainer) {
      this.advancedTexture.removeControl(this.crosshairContainer);
      this.crosshairContainer = null;
    }
  }

  /**
   * Switch crosshair to free-move mode (tracks mouse position) or back to
   * centered mode (fixed at screen center for pointer-lock look).
   */
  public setCrosshairFreeMode(free: boolean): void {
    if (free === this.crosshairFreeMode) return;
    this.crosshairFreeMode = free;

    if (!this.crosshairContainer) return;

    if (free) {
      // Switch from centered to absolute positioning
      this.crosshairContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.crosshairContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

      // Position at screen center initially
      const idealW = this.advancedTexture.idealWidth;
      const aspectRatio = this.advancedTexture.getSize().height / this.advancedTexture.getSize().width;
      const idealH = idealW * aspectRatio;
      this.crosshairContainer.leftInPixels = idealW / 2;
      this.crosshairContainer.topInPixels = idealH / 2;

      // Track mouse movement to move the crosshair
      this.crosshairMouseHandler = (e: MouseEvent) => {
        if (!this.crosshairContainer || !this.crosshairFreeMode) return;
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        // Convert mouse CSS position to GUI ideal coordinates
        const guiX = ((e.clientX - rect.left) / rect.width) * idealW;
        const guiY = ((e.clientY - rect.top) / rect.height) * idealH;
        this.crosshairContainer.leftInPixels = guiX;
        this.crosshairContainer.topInPixels = guiY;
      };
      window.addEventListener('mousemove', this.crosshairMouseHandler);
    } else {
      // Switch back to centered
      if (this.crosshairMouseHandler) {
        window.removeEventListener('mousemove', this.crosshairMouseHandler);
        this.crosshairMouseHandler = null;
      }
      this.crosshairContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.crosshairContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      this.crosshairContainer.leftInPixels = 0;
      this.crosshairContainer.topInPixels = 0;
    }
  }

  private createHUD() {
    // Main HUD container
    this.hudContainer = new Container("hud");
    this.advancedTexture.addControl(this.hudContainer);

    // Create all HUD panels
    this.createPlayerStatsPanel();
    this.createWorldStatsPanel();
    this.createNPCListPanel();
    this.createActionPanel();
    this.createFeedbackPanel();
    this.createMinimapPanel();
    this.createNotificationsPanel();
    this.createReputationPanel();
    this.createFluencyPanel();
    this.createTimePanel();
  }

  private createMenuButton() {
    this.menuButton = Button.CreateSimpleButton("menuBtn", "☰ Menu");
    this.menuButton.width = "100px";
    this.menuButton.height = "40px";
    this.menuButton.color = "white";
    this.menuButton.background = "rgba(0, 0, 0, 0.6)";
    this.menuButton.cornerRadius = 5;
    this.menuButton.top = "10px";
    this.menuButton.left = "-10px";
    this.menuButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.menuButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.menuButton.fontSize = 16;
    this.menuButton.isVisible = true; // Explicitly set visible

    this.menuButton.onPointerClickObservable.add(() => {
      this.toggleMenu();
    });

    this.advancedTexture.addControl(this.menuButton);
  }

  private createCameraButton() {
    this.cameraButton = Button.CreateSimpleButton("cameraBtn", "📷 3rd Person");
    this.cameraButton.width = "120px";
    this.cameraButton.height = "40px";
    this.cameraButton.color = "white";
    this.cameraButton.background = "rgba(0, 0, 0, 0.6)";
    this.cameraButton.cornerRadius = 5;
    this.cameraButton.top = "60px"; // Position below menu button
    this.cameraButton.left = "-10px";
    this.cameraButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.cameraButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.cameraButton.fontSize = 14;

    this.cameraButton.onPointerClickObservable.add(() => {
      this.onCameraModePressed?.();
    });

    this.advancedTexture.addControl(this.cameraButton);
  }

  /**
   * Update the camera button text to reflect current mode
   */
  public updateCameraButtonText(modeText: string): void {
    if (this.cameraButton) {
      const icon = modeText === 'First Person' ? '👁️' : modeText === 'Isometric' ? '🗺️' : '📷';
      (this.cameraButton.children[0] as any).text = `${icon} ${modeText}`;
    }
  }

  private createFullscreenButton() {
    this.fullscreenButton = Button.CreateSimpleButton("fullscreenBtn", "⛶");
    this.fullscreenButton.width = "32px";
    this.fullscreenButton.height = "32px";
    this.fullscreenButton.color = "white";
    this.fullscreenButton.background = "rgba(0, 0, 0, 0.6)";
    this.fullscreenButton.cornerRadius = 5;
    this.fullscreenButton.top = "-8px";
    this.fullscreenButton.left = "-8px";
    this.fullscreenButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.fullscreenButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.fullscreenButton.fontSize = 16;

    this.fullscreenButton.onPointerClickObservable.add(() => {
      this.onFullscreenPressed?.();
    });

    this.advancedTexture.addControl(this.fullscreenButton);
  }

  /**
   * Set callback for camera mode button
   */
  public setOnCameraModePressed(callback: () => void): void {
    this.onCameraModePressed = callback;
  }

  private toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;

    if (this.isMenuOpen) {
      this.showMenu();
    } else {
      this.hideMenu();
    }
  }

  private showMenu() {
    if (this.menuPanel) {
      this.menuPanel.isVisible = true;
      return;
    }

    // Create menu panel
    this.menuPanel = new Rectangle("menuPanel");
    this.menuPanel.width = "400px";
    this.menuPanel.height = "500px";
    this.menuPanel.background = "rgba(0, 0, 0, 0.9)";
    this.menuPanel.color = "white";
    this.menuPanel.thickness = 2;
    this.menuPanel.cornerRadius = 10;
    this.menuPanel.top = "110px"; // Position below camera button
    this.menuPanel.left = "-10px";
    this.menuPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.menuPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const menuStack = new StackPanel();
    menuStack.width = "100%";
    menuStack.paddingTop = "20px";
    menuStack.paddingBottom = "20px";
    this.menuPanel.addControl(menuStack);

    // Title
    const title = new TextBlock();
    title.text = this.config.worldName;
    title.color = "white";
    title.fontSize = 24;
    title.height = "40px";
    title.fontWeight = "bold";
    menuStack.addControl(title);

    // World ID
    const worldId = new TextBlock();
    worldId.text = `World ID: ${this.config.worldId}`;
    worldId.color = "#888";
    worldId.fontSize = 14;
    worldId.height = "30px";
    menuStack.addControl(worldId);

    // Buttons
    const buttonsData = [
      { text: "🥽 Toggle VR Mode", callback: () => this.onVRToggled?.() },
      { text: "🖥️ Fullscreen", callback: () => this.onFullscreenPressed?.() },
      { text: "🔧 Toggle Debug", callback: () => this.onDebugPressed?.() },
      { text: "⬅️ Back to Menu", callback: () => this.onBackPressed?.() }
    ];

    buttonsData.forEach((data) => {
      const btn = Button.CreateSimpleButton("menuBtn", data.text);
      btn.width = "90%";
      btn.height = "50px";
      btn.color = "white";
      btn.background = "rgba(60, 60, 60, 0.8)";
      btn.cornerRadius = 5;
      btn.fontSize = 16;
      btn.paddingTop = "10px";
      btn.paddingBottom = "10px";
      btn.onPointerClickObservable.add(() => {
        data.callback();
        this.toggleMenu();
      });
      menuStack.addControl(btn);
    });

    this.advancedTexture.addControl(this.menuPanel);
  }

  private hideMenu() {
    if (this.menuPanel) {
      this.menuPanel.isVisible = false;
    }
  }

  private createPlayerStatsPanel() {
    const panel = new Rectangle("playerStats");
    panel.width = "200px";
    panel.height = "125px"; // Increased height for gold display
    panel.background = "rgba(0, 0, 0, 0.7)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "60px";
    panel.left = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock();
    title.text = "Player Status";
    title.color = "white";
    title.fontSize = 16;
    title.height = "25px";
    title.fontWeight = "bold";
    stack.addControl(title);

    // Status text
    const statusText = new TextBlock("playerStatusText");
    statusText.text = "Ready";
    statusText.color = "#4CAF50";
    statusText.fontSize = 14;
    statusText.height = "20px";
    stack.addControl(statusText);

    // Energy bar background
    const energyBg = new Rectangle("energyBg");
    energyBg.width = "180px";
    energyBg.height = "20px";
    energyBg.background = "rgba(60, 60, 60, 0.8)";
    energyBg.color = "#444";
    energyBg.thickness = 1;
    energyBg.cornerRadius = 3;
    stack.addControl(energyBg);

    // Energy bar fill
    const energyFill = new Rectangle("energyFill");
    energyFill.width = "180px";
    energyFill.height = "20px";
    energyFill.background = "#4CAF50";
    energyFill.cornerRadius = 3;
    energyFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    energyBg.addControl(energyFill);

    // Energy text
    const energyText = new TextBlock("energyText");
    energyText.text = "100 / 100";
    energyText.color = "white";
    energyText.fontSize = 12;
    energyBg.addControl(energyText);

    // Gold display
    const goldText = new TextBlock("playerGoldText");
    goldText.text = "Gold: 100";
    goldText.color = "#FFD700"; // Gold color
    goldText.fontSize = 14;
    goldText.height = "20px";
    goldText.fontWeight = "bold";
    goldText.paddingTop = "5px";
    stack.addControl(goldText);

    panel.isVisible = false; // Start hidden - toggle with P key
    this.playerStatsPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createWorldStatsPanel() {
    const panel = new Rectangle("worldStats");
    panel.width = "250px";
    panel.height = "220px";
    panel.background = "rgba(0, 0, 0, 0.7)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "170px";
    panel.left = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    stack.paddingLeft = "10px";
    stack.paddingRight = "10px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock();
    title.text = "World Data";
    title.color = "white";
    title.fontSize = 16;
    title.height = "25px";
    title.fontWeight = "bold";
    stack.addControl(title);

    // Stats container (will be populated dynamically)
    const statsContainer = new StackPanel("worldStatsContainer");
    statsContainer.width = "100%";
    stack.addControl(statsContainer);

    panel.isVisible = false; // Start hidden - toggle with L key
    this.worldStatsPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createSettlementDetailsPanel() {
    const panel = new Rectangle("settlementDetailsPanel");
    panel.width = "250px";
    panel.height = "180px";
    panel.background = "rgba(0, 0, 0, 0.7)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "330px";
    panel.left = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    stack.paddingLeft = "10px";
    stack.paddingRight = "10px";
    panel.addControl(stack);

    const title = new TextBlock();
    title.text = "Settlement";
    title.color = "white";
    title.fontSize = 16;
    title.height = "24px";
    title.fontWeight = "bold";
    stack.addControl(title);

    const nameText = new TextBlock("settlementDetailsName");
    nameText.text = "";
    nameText.color = "#E5E7EB";
    nameText.fontSize = 14;
    nameText.height = "20px";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(nameText);

    const typePopText = new TextBlock("settlementDetailsTypePop");
    typePopText.text = "";
    typePopText.color = "#9CA3AF";
    typePopText.fontSize = 13;
    typePopText.height = "20px";
    typePopText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(typePopText);

    const buildingsText = new TextBlock("settlementDetailsBuildings");
    buildingsText.text = "";
    buildingsText.color = "#D1D5DB";
    buildingsText.fontSize = 13;
    buildingsText.height = "40px";
    buildingsText.textWrapping = true;
    buildingsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(buildingsText);

    const zoneTerrainText = new TextBlock("settlementDetailsZoneTerrain");
    zoneTerrainText.text = "";
    zoneTerrainText.color = "#9CA3AF";
    zoneTerrainText.fontSize = 12;
    zoneTerrainText.height = "20px";
    zoneTerrainText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(zoneTerrainText);

    panel.isVisible = false;
    this.settlementDetailsPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createNPCListPanel() {
    const panel = new Rectangle("npcList");
    panel.width = "300px";
    panel.height = "200px";
    panel.background = "rgba(0, 0, 0, 0.7)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "-10px";
    panel.left = "-10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock();
    title.text = "NPCs Nearby";
    title.color = "white";
    title.fontSize = 16;
    title.height = "25px";
    title.fontWeight = "bold";
    stack.addControl(title);

    // NPC list container
    const scrollViewer = new ScrollViewer("npcScrollViewer");
    scrollViewer.width = "100%";
    scrollViewer.height = "160px";
    scrollViewer.paddingTop = "5px";
    scrollViewer.paddingBottom = "5px";
    stack.addControl(scrollViewer);

    const npcContainer = new StackPanel("npcContainer");
    npcContainer.width = "100%";
    scrollViewer.addControl(npcContainer);

    panel.isVisible = false; // Start hidden - toggle with N key
    this.npcListPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createActionPanel() {
    const panel = new Rectangle("actionPanel");
    panel.width = "350px";
    panel.height = "250px";
    panel.background = "rgba(0, 0, 0, 0.8)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "-220px";
    panel.left = "-10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.isVisible = false;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock("actionPanelTitle");
    title.text = "Actions";
    title.color = "white";
    title.fontSize = 16;
    title.height = "25px";
    title.fontWeight = "bold";
    stack.addControl(title);

    // Action list container
    const scrollViewer = new ScrollViewer("actionScrollViewer");
    scrollViewer.width = "100%";
    scrollViewer.height = "210px";
    scrollViewer.paddingTop = "5px";
    scrollViewer.paddingBottom = "5px";
    stack.addControl(scrollViewer);

    const actionContainer = new StackPanel("actionContainer");
    actionContainer.width = "100%";
    scrollViewer.addControl(actionContainer);

    panel.isVisible = false; // Start hidden - toggle with X key
    this.actionPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createFeedbackPanel() {
    const panel = new Rectangle("feedbackPanel");
    panel.width = "400px";
    panel.height = "120px";
    panel.background = "rgba(0, 0, 0, 0.9)";
    panel.color = "#4CAF50";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.isVisible = false;

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    stack.paddingLeft = "15px";
    stack.paddingRight = "15px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock("feedbackTitle");
    title.text = "Action Result";
    title.color = "white";
    title.fontSize = 16;
    title.height = "25px";
    title.fontWeight = "bold";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(title);

    // Message
    const message = new TextBlock("feedbackMessage");
    message.text = "";
    message.color = "white";
    message.fontSize = 14;
    message.height = "80px";
    message.textWrapping = true;
    message.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    message.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stack.addControl(message);

    this.feedbackPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createMinimapPanel() {
    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;

    const panel = new Rectangle("minimapPanel");
    panel.width = `${BabylonGUIManager.NOTIF_PANEL_WIDTH}px`;
    panel.height = `${MAP_SIZE + 56}px`;
    panel.background = "rgba(0, 0, 0, 0.78)";
    panel.color = "rgba(255, 255, 255, 0.15)";
    panel.thickness = 1;
    panel.cornerRadius = 6;
    panel.top = "8px";
    panel.left = "-8px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    // Header row — toggle button + title (matches Notifications style)
    const headerRow = new Rectangle("minimapHeaderRow");
    headerRow.width = "100%";
    headerRow.height = "21px";
    headerRow.thickness = 0;
    headerRow.background = "transparent";
    headerRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    headerRow.top = "2px";
    headerRow.isPointerBlocker = true;
    headerRow.onPointerClickObservable.add(() => this.toggleMinimapCollapse());
    panel.addControl(headerRow);

    // Toggle button (left side)
    const toggleBtn = new Rectangle("minimapToggleBtn");
    toggleBtn.width = "20px";
    toggleBtn.height = "20px";
    toggleBtn.background = "transparent";
    toggleBtn.thickness = 0;
    toggleBtn.left = "4px";
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    const toggleIcon = new TextBlock("minimapToggleIcon");
    toggleIcon.text = "▼";
    toggleIcon.color = "rgba(255,255,255,0.6)";
    toggleIcon.fontSize = 9;
    toggleBtn.addControl(toggleIcon);
    headerRow.addControl(toggleBtn);
    this._minimapToggleIcon = toggleIcon;

    // Title text — matches Notifications header style
    const title = new TextBlock();
    title.text = "Map";
    title.color = "rgba(255,255,255,0.7)";
    title.fontSize = 10;
    title.fontWeight = "bold";
    title.left = "26px";
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerRow.addControl(title);
    this._minimapTitle = title;

    // Map background (terrain color)
    const mapBackground = new Rectangle("minimapBackground");
    mapBackground.width = `${MAP_SIZE}px`;
    mapBackground.height = `${MAP_SIZE}px`;
    mapBackground.background = "#1a3a1a";
    mapBackground.cornerRadius = 4;
    mapBackground.top = "26px";
    mapBackground.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.addControl(mapBackground);

    // Terrain background image (heightmap-derived coloring)
    const terrainImage = new Image("minimapTerrainImage");
    terrainImage.width = `${MAP_SIZE}px`;
    terrainImage.height = `${MAP_SIZE}px`;
    terrainImage.top = "26px";
    terrainImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    terrainImage.isVisible = false;
    panel.addControl(terrainImage);
    this.minimapTerrainImage = terrainImage;

    // Static map image (rendered once with buildings/terrain)
    const staticImage = new Image("minimapStaticImage");
    staticImage.width = `${MAP_SIZE}px`;
    staticImage.height = `${MAP_SIZE}px`;
    staticImage.top = "26px";
    staticImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    staticImage.isVisible = false;
    panel.addControl(staticImage);
    this.minimapStaticImage = staticImage;

    // Container for dynamic elements (player, NPCs, quests)
    const mapContainer = new Container("minimapContainer");
    mapContainer.width = `${MAP_SIZE}px`;
    mapContainer.height = `${MAP_SIZE}px`;
    mapContainer.top = "26px";
    mapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.addControl(mapContainer);

    // Drag-to-pan: use the canvas element's native pointer events directly
    // instead of Babylon GUI observables, which have unreliable pointerup delivery.
    const canvas = this.scene.getEngine().getRenderingCanvas();
    let lastClickTime = 0;
    if (canvas) {
      const onDown = (e: PointerEvent) => {
        // Check if the click is within the minimap bounds
        const rect = canvas!.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        // Minimap is in the top-right corner
        const minimapRight = rect.width;
        const minimapTop = 0;
        const minimapLeft = minimapRight - MAP_SIZE - 20; // approximate panel position
        const minimapBottom = minimapTop + MAP_SIZE + 50;
        if (canvasX >= minimapLeft && canvasX <= minimapRight && canvasY >= minimapTop && canvasY <= minimapBottom) {
          this._minimapDragging = true;
          this._minimapDragLast = { x: e.clientX, y: e.clientY };
          e.preventDefault();
        }
      };
      const onMove = (e: PointerEvent) => {
        if (!this._minimapDragging) return;
        const dx = e.clientX - this._minimapDragLast.x;
        const dy = e.clientY - this._minimapDragLast.y;
        this._minimapDragLast = { x: e.clientX, y: e.clientY };
        const viewRadius = this._minimapLastViewRadius || this._minimapWorldSize * 0.2;
        const vpSize = viewRadius * 2;
        this._minimapPanOffset.x -= (dx / MAP_SIZE) * vpSize;
        this._minimapPanOffset.z += (dy / MAP_SIZE) * vpSize;
        this._minimapLastSrcX = -1;
        this._minimapLastSrcY = -1;
        this._minimapLastDataUrl = '';
      };
      const onUp = () => {
        if (!this._minimapDragging) return;
        this._minimapDragging = false;
        const now = Date.now();
        if (now - lastClickTime < 350) {
          this._minimapPanOffset = { x: 0, z: 0 };
          this._minimapLastSrcX = -1;
          this._minimapLastSrcY = -1;
          this._minimapLastDataUrl = '';
        }
        lastClickTime = now;
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onUp);
    }

    // Zoom controls row
    const zoomRow = new Rectangle("minimapZoomRow");
    zoomRow.width = `${MAP_SIZE}px`;
    zoomRow.height = "21px";
    zoomRow.top = `${26 + MAP_SIZE + 2}px`;
    zoomRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    zoomRow.background = "transparent";
    zoomRow.thickness = 0;
    panel.addControl(zoomRow);

    const zoomOutBtn = Button.CreateSimpleButton("minimapZoomOut", "−");
    zoomOutBtn.width = "14px";
    zoomOutBtn.height = "14px";
    zoomOutBtn.color = "white";
    zoomOutBtn.background = "rgba(80,80,80,0.8)";
    zoomOutBtn.cornerRadius = 3;
    zoomOutBtn.fontSize = 14;
    zoomOutBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    zoomOutBtn.onPointerClickObservable.add(() => this.minimapZoom(-1));
    zoomRow.addControl(zoomOutBtn);

    const zoomLabel = new TextBlock("minimapZoomLabel");
    zoomLabel.text = "4.00x";
    zoomLabel.color = "rgba(255,255,255,0.7)";
    zoomLabel.fontSize = 12;
    zoomLabel.isHitTestVisible = false;
    this._minimapZoomLabel = zoomLabel;
    zoomRow.addControl(zoomLabel);

    const zoomInBtn = Button.CreateSimpleButton("minimapZoomIn", "+");
    zoomInBtn.width = "14px";
    zoomInBtn.height = "14px";
    zoomInBtn.color = "white";
    zoomInBtn.background = "rgba(80,80,80,0.8)";
    zoomInBtn.cornerRadius = 3;
    zoomInBtn.fontSize = 14;
    zoomInBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    zoomInBtn.onPointerClickObservable.add(() => this.minimapZoom(1));
    zoomRow.addControl(zoomInBtn);

    this.minimapPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  /** Register a callback for when the minimap is collapsed or expanded. */
  public onMinimapCollapsedChanged(cb: (expanded: boolean) => void): void {
    this._onMinimapCollapsedChanged = cb;
  }

  /** Register a callback fired whenever the right-side HUD stack changes height.
   *  The callback receives the Y position where the NPC indicator should be placed. */
  public onHudLayoutChanged(cb: (npcIndicatorTop: number) => void): void {
    this._onHudLayoutChanged = cb;
  }

  /** Whether the minimap is currently expanded. */
  public get isMinimapExpanded(): boolean {
    return this._minimapExpanded;
  }

  /** Toggle minimap between collapsed (title-only) and expanded states. */
  private toggleMinimapCollapse(): void {
    if (!this.minimapPanel) return;
    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;
    this._minimapExpanded = !this._minimapExpanded;

    // Find the header row so we can keep it (and its children) always visible
    const headerRow = this.minimapPanel.getChildByName("minimapHeaderRow");

    if (this._minimapExpanded) {
      (this.minimapPanel as Rectangle).height = `${MAP_SIZE + 56}px`;
      (this.minimapPanel as Rectangle).alpha = 1.0;
      if (this._minimapToggleIcon) this._minimapToggleIcon.text = "▼";
      for (const child of this.minimapPanel.getDescendants(true)) {
        if (child !== headerRow && (!headerRow || !headerRow.getDescendants(true).includes(child))) {
          child.isVisible = true;
        }
      }
    } else {
      (this.minimapPanel as Rectangle).height = "26px";
      (this.minimapPanel as Rectangle).alpha = 0.5;
      if (this._minimapToggleIcon) this._minimapToggleIcon.text = "▲";
      for (const child of this.minimapPanel.getDescendants(true)) {
        if (child !== headerRow && (!headerRow || !headerRow.getDescendants(true).includes(child))) {
          child.isVisible = false;
        }
      }
    }
    this._onMinimapCollapsedChanged?.(this._minimapExpanded);
    // Reposition notifications panel below minimap
    this.updateNotifPanelPosition();
  }

  /**
   * Adjust the minimap zoom level by the given direction (+1 = zoom in, -1 = zoom out).
   */
  public minimapZoom(direction: number): void {
    const step = BabylonGUIManager.MINIMAP_ZOOM_STEP;
    const newZoom = Math.round((this._minimapZoomLevel + direction * step) * 100) / 100;
    this._minimapZoomLevel = Math.max(
      BabylonGUIManager.MINIMAP_ZOOM_MIN,
      Math.min(BabylonGUIManager.MINIMAP_ZOOM_MAX, newZoom)
    );
    if (this._minimapZoomLabel) {
      this._minimapZoomLabel.text = `${this._minimapZoomLevel.toFixed(2)}x`;
    }
    // Force minimap re-render by invalidating the last source position and data URL
    this._minimapLastSrcX = -1;
    this._minimapLastSrcY = -1;
    this._minimapLastDataUrl = '';
  }

  /** Get the current minimap zoom level. */
  public getMinimapZoomLevel(): number {
    return this._minimapZoomLevel;
  }

  /** Set a callback for when the user clicks on the minimap to navigate. */
  public setMinimapNavigateCallback(cb: (worldX: number, worldZ: number) => void): void {
    this.onMinimapNavigate = cb;
  }

  /** Highlight a specific NPC on the minimap with a prominent pulsing marker. */
  public setHighlightedNpc(npcId: string): void {
    this._highlightedNpcId = npcId;
  }

  /** Clear the highlighted NPC marker. */
  public clearHighlightedNpc(): void {
    this._highlightedNpcId = null;
  }

  // ── Notifications HUD Panel ──────────────────────────────────────────────

  private static readonly NOTIF_PANEL_WIDTH = 190;
  private static readonly NOTIF_LIST_HEIGHT = 140;

  private createNotificationsPanel(): void {
    const W = BabylonGUIManager.NOTIF_PANEL_WIDTH;
    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;
    // Position below the minimap (minimap panel height = MAP_SIZE + 56, top = 8)
    const panelTop = MAP_SIZE + 56 + 8 + 4; // 4px gap

    const panel = new Rectangle("notifHudPanel");
    panel.width = `${W}px`;
    panel.adaptHeightToChildren = true;
    panel.background = "rgba(0, 0, 0, 0.78)";
    panel.color = "rgba(255, 255, 255, 0.15)";
    panel.thickness = 1;
    panel.cornerRadius = 6;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = `${panelTop}px`;
    panel.left = "-8px";
    panel.zIndex = 9;
    panel.paddingTop = "3px";
    panel.paddingBottom = "3px";
    this._notifPanel = panel;

    // Inner stack holds header + scrollable list
    const outerStack = new StackPanel("notifOuterStack");
    outerStack.width = "100%";
    panel.addControl(outerStack);

    // Header row — toggle + title (matches minimap style)
    const headerRow = new Rectangle("notifHeaderRow");
    headerRow.width = "100%";
    headerRow.height = "29px";
    headerRow.thickness = 0;
    headerRow.background = "transparent";
    headerRow.isPointerBlocker = true;
    headerRow.onPointerClickObservable.add(() => this.toggleNotifCollapse());
    outerStack.addControl(headerRow);

    // Toggle icon (left side)
    const toggleBtn = new Rectangle("notifToggleBtn");
    toggleBtn.width = "20px";
    toggleBtn.height = "20px";
    toggleBtn.background = "transparent";
    toggleBtn.thickness = 0;
    toggleBtn.left = "4px";
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerRow.addControl(toggleBtn);

    const toggleIcon = new TextBlock("notifToggleIcon");
    toggleIcon.text = "▼";
    toggleIcon.color = "rgba(255,255,255,0.6)";
    toggleIcon.fontSize = 10;
    this._notifToggleIcon = toggleIcon;
    toggleBtn.addControl(toggleIcon);

    // Title
    const title = new TextBlock("notifTitle");
    title.text = "Notifications";
    title.color = "rgba(255,255,255,0.7)";
    title.fontSize = 10;
    title.fontWeight = "bold";
    title.left = "26px";
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerRow.addControl(title);

    // Scroll viewer for list
    const sv = new ScrollViewer("notifScrollViewer");
    sv.width = "100%";
    sv.height = `${BabylonGUIManager.NOTIF_LIST_HEIGHT}px`;
    sv.thickness = 0;
    sv.barSize = 4;
    sv.barColor = "rgba(255,255,255,0.2)";
    sv.barBackground = "transparent";
    this._notifScrollViewer = sv;
    outerStack.addControl(sv);

    const stack = new StackPanel("notifStack");
    stack.width = "100%";
    this._notifStack = stack;
    sv.addControl(stack);

    this.advancedTexture.addControl(panel);

    // Initial build + subscribe to changes
    this.rebuildNotificationList();
    this._notifSubId = NotificationStore.subscribe(() => this.rebuildNotificationList());
  }

  private toggleNotifCollapse(): void {
    if (!this._notifPanel || !this._notifScrollViewer) return;
    this._notifExpanded = !this._notifExpanded;

    if (this._notifExpanded) {
      this._notifScrollViewer.isVisible = true;
      (this._notifPanel as Rectangle).alpha = 1.0;
      if (this._notifToggleIcon) this._notifToggleIcon.text = "▼";
    } else {
      this._notifScrollViewer.isVisible = false;
      (this._notifPanel as Rectangle).alpha = 0.5;
      if (this._notifToggleIcon) this._notifToggleIcon.text = "▲";
    }
    // Notify so downstream panels (NPC indicator) can reposition
    this.updateNotifPanelPosition();
  }

  /** Recalculate notifications panel position based on minimap state,
   *  then notify downstream consumers (NPC indicator) of the new layout. */
  private updateNotifPanelPosition(): void {
    if (!this._notifPanel) return;
    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;
    const minimapHeight = this._minimapExpanded ? MAP_SIZE + 56 : 26;
    this._notifPanel.top = `${8 + minimapHeight + 4}px`;
    this._onHudLayoutChanged?.(this.getNotifPanelBottom());
  }

  /** Get the bottom edge of the notifications panel for downstream positioning. */
  public getNotifPanelBottom(): number {
    if (!this._notifPanel) return 240;
    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;
    const minimapHeight = this._minimapExpanded ? MAP_SIZE + 56 : 26;
    const notifHeight = this._notifExpanded ? 35 + BabylonGUIManager.NOTIF_LIST_HEIGHT : 35;
    return 8 + minimapHeight + 4 + notifHeight + 4;
  }

  private rebuildNotificationList(): void {
    if (!this._notifStack) return;

    // Guard: the notification panel may not be attached to the GUI texture yet
    // (e.g. during title screen before HUD is fully wired up). Babylon's
    // addControl() will throw if the host AdvancedDynamicTexture is null.
    try {
      // Quick probe — if this throws, the stack isn't connected to a live texture
      this._notifStack.getDescendants?.();
    } catch {
      return;
    }

    // Clean up ticker handles
    disposeTickers(this._notifTickerHandles);

    // Clear existing items
    this._notifStack.children.slice().forEach((c) => {
      this._notifStack!.removeControl(c);
      c.dispose();
    });

    const items = NotificationStore.recent(20);
    if (items.length === 0) {
      const empty = new TextBlock("notifEmpty");
      empty.text = "No notifications yet";
      empty.color = "rgba(255,255,255,0.4)";
      empty.fontSize = 10;
      empty.height = "30px";
      try { this._notifStack.addControl(empty); } catch { return; }
      return;
    }

    for (const n of items) {
      const row = new Rectangle(`notif_${n.id}`);
      row.width = "100%";
      row.height = "28px";
      row.background = "transparent";
      row.thickness = 0;
      row.paddingLeft = "6px";
      row.paddingRight = "4px";

      // Time ago
      const ago = this.formatTimeAgo(n.timestamp);
      const timeText = new TextBlock();
      timeText.text = ago;
      timeText.color = "rgba(255,255,255,0.35)";
      timeText.fontSize = 8;
      timeText.width = "30px";
      timeText.left = "2px";
      timeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(timeText);

      // Icon
      if (n.icon) {
        const iconTb = new TextBlock();
        iconTb.text = n.icon;
        iconTb.fontSize = 10;
        iconTb.width = "16px";
        iconTb.left = "32px";
        iconTb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(iconTb);
      }

      // Title + description — ticker-enabled
      const text = n.description ? `${n.title}: ${n.description}` : n.title;
      const textLeft = n.icon ? 50 : 34;
      const textWidth = n.icon ? 110 : 126;
      const tickerClip = createTickerText({
        id: `notif_text_${n.id}`,
        text,
        color: n.color || "rgba(255,255,255,0.8)",
        fontSize: 9,
        containerWidth: textWidth,
        height: 28,
      }, this._notifTickerHandles);
      tickerClip.left = `${textLeft}px`;
      tickerClip.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(tickerClip);

      try {
        this._notifStack.addControl(row);
      } catch {
        // Host texture not available — bail out
        return;
      }

      // Divider
      const div = new Rectangle();
      div.width = "90%";
      div.height = "1px";
      div.background = "rgba(255,255,255,0.08)";
      div.thickness = 0;
      this._notifStack.addControl(div);
    }
  }

  private formatTimeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  private createReputationPanel() {
    const panel = new Rectangle("reputationPanel");
    panel.width = "220px";
    panel.height = "160px"; // Increased height for fine payment button
    panel.background = "rgba(0, 0, 0, 0.75)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 5;
    panel.top = "-10px";
    panel.left = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.isVisible = false; // Hidden by default, shown when in a zone

    const stack = new StackPanel();
    stack.paddingTop = "10px";
    stack.paddingLeft = "10px";
    stack.paddingRight = "10px";
    panel.addControl(stack);

    // Title
    const title = new TextBlock("reputationTitle");
    title.text = "Reputation";
    title.color = "white";
    title.fontSize = 14;
    title.height = "20px";
    title.fontWeight = "bold";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(title);

    // Settlement name
    const settlementName = new TextBlock("reputationSettlement");
    settlementName.text = "Unknown";
    settlementName.color = "#AAA";
    settlementName.fontSize = 12;
    settlementName.height = "18px";
    settlementName.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(settlementName);

    // Standing text
    const standing = new TextBlock("reputationStanding");
    standing.text = "Neutral";
    standing.color = "#FFC107";
    standing.fontSize = 14;
    standing.height = "20px";
    standing.fontWeight = "bold";
    standing.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(standing);

    // Reputation bar background
    const repBarBg = new Rectangle("reputationBarBg");
    repBarBg.width = "200px";
    repBarBg.height = "16px";
    repBarBg.background = "rgba(60, 60, 60, 0.9)";
    repBarBg.color = "#444";
    repBarBg.thickness = 1;
    repBarBg.cornerRadius = 3;
    stack.addControl(repBarBg);

    // Reputation bar fill
    const repBarFill = new Rectangle("reputationBarFill");
    repBarFill.width = "100px"; // Will be updated based on score
    repBarFill.height = "16px";
    repBarFill.background = "#FFC107"; // Yellow for neutral
    repBarFill.cornerRadius = 3;
    repBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    repBarBg.addControl(repBarFill);

    // Score text overlay
    const scoreText = new TextBlock("reputationScore");
    scoreText.text = "0 / 100";
    scoreText.color = "white";
    scoreText.fontSize = 11;
    repBarBg.addControl(scoreText);

    // Warning/Ban indicator
    const warningText = new TextBlock("reputationWarning");
    warningText.text = "";
    warningText.color = "#F44336";
    warningText.fontSize = 11;
    warningText.height = "16px";
    warningText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(warningText);

    // Pay Fines button
    const payFinesBtn = Button.CreateSimpleButton("payFinesBtn", "Pay Fines (50g)");
    payFinesBtn.width = "200px";
    payFinesBtn.height = "28px";
    payFinesBtn.color = "white";
    payFinesBtn.background = "rgba(76, 175, 80, 0.8)"; // Green
    payFinesBtn.cornerRadius = 5;
    payFinesBtn.fontSize = 12;
    payFinesBtn.fontWeight = "bold";
    payFinesBtn.paddingTop = "4px";
    payFinesBtn.isVisible = false; // Hidden until there are fines
    payFinesBtn.onPointerClickObservable.add(() => {
      if (this.onPayFines) {
        this.onPayFines();
      }
    });
    stack.addControl(payFinesBtn);

    this.reputationPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private createFluencyPanel() {
    const panel = new Rectangle("fluencyPanel");
    panel.width = "280px";
    panel.height = "50px";
    panel.background = "rgba(0, 0, 0, 0.7)";
    panel.color = "#4FC3F7";
    panel.thickness = 1;
    panel.cornerRadius = 5;
    panel.top = "10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.isVisible = false; // Only visible for language-learning games

    const fluencyStack = new StackPanel("fluencyStack");
    fluencyStack.isVertical = true;
    fluencyStack.width = "100%";
    fluencyStack.paddingTop = "5px";
    fluencyStack.spacing = 5;
    panel.addControl(fluencyStack);

    // Fluency level label
    const levelLabel = new TextBlock("fluencyLevelLabel");
    levelLabel.text = "Beginner";
    levelLabel.color = "#4FC3F7";
    levelLabel.fontSize = 12;
    levelLabel.fontWeight = "bold";
    levelLabel.height = "16px";
    fluencyStack.addControl(levelLabel);

    // Bar background
    const barBg = new Rectangle("fluencyBarBg");
    barBg.width = "250px";
    barBg.height = "12px";
    barBg.background = "rgba(60, 60, 60, 0.9)";
    barBg.color = "#555";
    barBg.thickness = 1;
    barBg.cornerRadius = 6;
    fluencyStack.addControl(barBg);

    // Bar fill
    const barFill = new Rectangle("fluencyBarFill");
    barFill.width = "0px";
    barFill.height = "12px";
    barFill.background = "#4FC3F7";
    barFill.cornerRadius = 6;
    barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(barFill);

    // Fluency percentage text
    const percentText = new TextBlock("fluencyPercentText");
    percentText.text = "0%";
    percentText.color = "white";
    percentText.fontSize = 9;
    barBg.addControl(percentText);

    this.fluencyPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  public setGameType(gameType: string) {
    this._gameType = gameType;
    const isLanguageLearning = gameType === 'language-learning' || gameType === 'educational';
    if (this.fluencyPanel) {
      this.fluencyPanel.isVisible = isLanguageLearning;
    }
  }

  public updateFluency(fluency: number, fluencyGain?: number) {
    if (!this.fluencyPanel) return;

    // Determine level label
    let levelName: string;
    let color: string;
    if (fluency >= 80) { levelName = 'Near-Native'; color = '#FFD700'; }
    else if (fluency >= 60) { levelName = 'Advanced'; color = '#4CAF50'; }
    else if (fluency >= 40) { levelName = 'Intermediate'; color = '#8BC34A'; }
    else if (fluency >= 20) { levelName = 'Elementary'; color = '#FFC107'; }
    else { levelName = 'Beginner'; color = '#4FC3F7'; }

    const levelLabel = this.fluencyPanel.getDescendants().find(
      c => c.name === 'fluencyLevelLabel'
    ) as TextBlock;
    if (levelLabel) {
      levelLabel.text = `${levelName} — ${fluency.toFixed(0)}%`;
      levelLabel.color = color;
    }

    const barFill = this.fluencyPanel.getDescendants().find(
      c => c.name === 'fluencyBarFill'
    ) as Rectangle;
    if (barFill) {
      barFill.width = `${250 * (fluency / 100)}px`;
      barFill.background = color;
    }

    const percentText = this.fluencyPanel.getDescendants().find(
      c => c.name === 'fluencyPercentText'
    ) as TextBlock;
    if (percentText) {
      percentText.text = `${fluency.toFixed(1)}%`;
    }

    this.fluencyPanel.color = color;

    // Show floating gain text if provided
    if (fluencyGain && fluencyGain > 0) {
      this.showFluencyGainToast(`+${fluencyGain.toFixed(2)} Fluency`);
    }
  }

  private showFluencyGainToast(text: string) {
    const toast = new TextBlock("fluencyGainToast");
    toast.text = text;
    toast.color = "#4FC3F7";
    toast.fontSize = 16;
    toast.fontWeight = "bold";
    toast.top = "65px";
    toast.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    toast.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.advancedTexture.addControl(toast);

    // Animate fade out
    let alpha = 1;
    let yOffset = 65;
    const interval = setInterval(() => {
      alpha -= 0.02;
      yOffset -= 0.5;
      toast.alpha = alpha;
      toast.top = `${yOffset}px`;
      if (alpha <= 0) {
        clearInterval(interval);
        this.advancedTexture.removeControl(toast);
      }
    }, 33);
  }

  // Public methods for updating UI

  public updatePlayerStatus(status: PlayerStatus) {
    if (!this.playerStatsPanel) return;

    const statusText = this.playerStatsPanel.getDescendants().find(
      (c) => c.name === "playerStatusText"
    ) as TextBlock;
    if (statusText) {
      statusText.text = status.status;
    }

    const energyText = this.playerStatsPanel.getDescendants().find(
      (c) => c.name === "energyText"
    ) as TextBlock;
    if (energyText) {
      energyText.text = `${status.energy} / ${status.maxEnergy}`;
    }

    const energyFill = this.playerStatsPanel.getDescendants().find(
      (c) => c.name === "energyFill"
    ) as Rectangle;
    if (energyFill) {
      const percentage = status.energy / status.maxEnergy;
      energyFill.width = `${180 * percentage}px`;

      // Change color based on energy level
      if (percentage > 0.5) {
        energyFill.background = "#4CAF50"; // Green
      } else if (percentage > 0.25) {
        energyFill.background = "#FFC107"; // Yellow
      } else {
        energyFill.background = "#F44336"; // Red
      }
    }

    // Update gold display
    if (status.gold !== undefined) {
      const goldText = this.playerStatsPanel.getDescendants().find(
        (c) => c.name === "playerGoldText"
      ) as TextBlock;
      if (goldText) {
        goldText.text = `Gold: ${status.gold}`;
      }
    }
  }

  public updateWorldStats(stats: WorldStats) {
    if (!this.worldStatsPanel) return;

    const container = this.worldStatsPanel.getDescendants().find(
      (c) => c.name === "worldStatsContainer"
    ) as StackPanel;
    if (!container) return;

    // Clear existing stats
    container.clearControls();

    const statsData = [
      { label: "Countries", value: stats.countries },
      { label: "Settlements", value: stats.settlements },
      { label: "Characters", value: stats.characters },
      { label: "Rules", value: `${stats.rules + stats.baseRules}` },
      { label: "Actions", value: `${stats.actions + stats.baseActions}` },
      { label: "Quests", value: stats.quests }
    ];

    statsData.forEach((stat) => {
      const statText = new TextBlock();
      statText.text = `${stat.label}: ${stat.value}`;
      statText.color = "white";
      statText.fontSize = 13;
      statText.height = "22px";
      statText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      statText.paddingLeft = "5px";
      container.addControl(statText);
    });
  }

  public updateSettlementDetails(data: SettlementDetails | null) {
    if (!this.settlementDetailsPanel) return;

    if (!data) {
      this.settlementDetailsPanel.isVisible = false;
      return;
    }

    this.settlementDetailsPanel.isVisible = true;

    const nameText = this.settlementDetailsPanel.getDescendants().find(
      (c) => c.name === "settlementDetailsName"
    ) as TextBlock;
    if (nameText) {
      nameText.text = data.name;
    }

    const typePopText = this.settlementDetailsPanel.getDescendants().find(
      (c) => c.name === "settlementDetailsTypePop"
    ) as TextBlock;
    if (typePopText) {
      const popText = data.population ? data.population.toLocaleString() : "Unknown";
      typePopText.text = `Type: ${data.type || "Settlement"} · Population: ${popText}`;
    }

    const buildingsText = this.settlementDetailsPanel.getDescendants().find(
      (c) => c.name === "settlementDetailsBuildings"
    ) as TextBlock;
    if (buildingsText) {
      buildingsText.text = `Buildings: ${data.buildingCount} (Lots: ${data.lots}, Businesses: ${data.businesses}, Residences: ${data.residences})`;
    }

    const zoneTerrainText = this.settlementDetailsPanel.getDescendants().find(
      (c) => c.name === "settlementDetailsZoneTerrain"
    ) as TextBlock;
    if (zoneTerrainText) {
      const zone = data.zoneType ? `Zone: ${data.zoneType}` : "";
      const terrain = data.terrain ? `Terrain: ${data.terrain}` : "";
      const parts = [zone, terrain].filter(Boolean);
      zoneTerrainText.text = parts.join(" · ");
    }
  }

  public updateNPCList(npcs: NPCInfo[]) {
    if (!this.npcListPanel) return;

    const container = this.npcListPanel.getDescendants().find(
      (c) => c.name === "npcContainer"
    ) as StackPanel;
    if (!container) return;

    // Clear existing NPCs
    container.clearControls();

    if (npcs.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = "No NPCs nearby";
      emptyText.color = "#888";
      emptyText.fontSize = 14;
      emptyText.height = "30px";
      container.addControl(emptyText);
      return;
    }

    npcs.forEach((npc) => {
      let roleTag = '';
      if (npc.role === 'guard') roleTag = '[Guard] ';
      else if (npc.role === 'merchant') roleTag = '[Merchant] ';
      else if (npc.role === 'questgiver') roleTag = '[Quest] ';
      else if (npc.role === 'civilian') roleTag = '[Civ] ';

      const label = `${roleTag}${npc.name}`;

      const btn = Button.CreateSimpleButton(`npc-${npc.id}`, label);
      btn.width = "95%";
      btn.height = "35px";
      btn.fontSize = 14;
      btn.paddingTop = "5px";
      btn.paddingBottom = "5px";

      if (npc.id === this.selectedNPCId) {
        btn.background = "rgba(76, 175, 80, 0.8)";
        btn.color = "white";
      } else if (npc.questGiver) {
        btn.background = "rgba(255, 193, 7, 0.6)";
        btn.color = "white";
      } else {
        btn.background = "rgba(60, 60, 60, 0.6)";
        btn.color = "white";
      }

      btn.cornerRadius = 3;

      btn.onPointerClickObservable.add(() => {
        this.selectedNPCId = npc.id;
        this.onNPCSelected?.(npc.id);
        this.updateNPCList(npcs); // Refresh to update selection
      });

      container.addControl(btn);
    });
  }

  public updateActionList(npc: NPCInfo | null, actions: Action[], playerEnergy: number) {
    if (!this.actionPanel) return;

    const title = this.actionPanel.getDescendants().find(
      (c) => c.name === "actionPanelTitle"
    ) as TextBlock;
    const container = this.actionPanel.getDescendants().find(
      (c) => c.name === "actionContainer"
    ) as StackPanel;

    if (!container) return;

    // Clear existing actions
    container.clearControls();

    if (!npc) {
      this.actionPanel.isVisible = false;
      return;
    }

    this.actionPanel.isVisible = true;

    if (title) {
      title.text = `Actions: ${npc.name}`;
    }

    if (actions.length === 0) {
      const emptyText = new TextBlock();
      emptyText.text = "No actions available";
      emptyText.color = "#888";
      emptyText.fontSize = 14;
      emptyText.height = "30px";
      container.addControl(emptyText);
      return;
    }

    actions.forEach((action) => {
      const canAfford = !action.energyCost || playerEnergy >= action.energyCost;

      const btn = Button.CreateSimpleButton(`action-${action.id}`, action.name);
      btn.width = "95%";
      btn.height = "40px";
      btn.fontSize = 14;
      btn.paddingTop = "5px";
      btn.paddingBottom = "5px";
      btn.color = "white";
      btn.cornerRadius = 3;

      if (canAfford) {
        btn.background = "rgba(33, 150, 243, 0.8)";
      } else {
        btn.background = "rgba(100, 100, 100, 0.5)";
        btn.color = "#666";
      }

      btn.onPointerClickObservable.add(() => {
        if (canAfford) {
          this.onActionSelected?.(action.id);
        }
      });

      container.addControl(btn);

      // Energy cost label
      if (action.energyCost) {
        const costText = new TextBlock();
        costText.text = `⚡${action.energyCost}`;
        costText.color = canAfford ? "#FFC107" : "#666";
        costText.fontSize = 12;
        costText.height = "18px";
        costText.paddingLeft = "10px";
        costText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(costText);
      }
    });
  }

  public showActionFeedback(feedback: ActionFeedbackData) {
    if (!this.feedbackPanel) return;

    const title = this.feedbackPanel.getDescendants().find(
      (c) => c.name === "feedbackTitle"
    ) as TextBlock;
    const message = this.feedbackPanel.getDescendants().find(
      (c) => c.name === "feedbackMessage"
    ) as TextBlock;

    if (title) {
      title.text = `${feedback.actionName} → ${feedback.targetName}`;
    }

    if (message) {
      message.text = feedback.narrativeText || (feedback.success ? "Action succeeded!" : "Action failed.");
    }

    // Update color based on success
    if (this.feedbackPanel instanceof Rectangle) {
      this.feedbackPanel.color = feedback.success ? "#4CAF50" : "#F44336";
    }

    this.feedbackPanel.isVisible = true;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.feedbackPanel) {
        this.feedbackPanel.isVisible = false;
      }
    }, 5000);
  }

  public hideActionFeedback() {
    if (this.feedbackPanel) {
      this.feedbackPanel.isVisible = false;
    }
  }

  /**
   * Set the minimap terrain background from a canvas rendered by MinimapTerrainRenderer.
   * This layer sits behind the 3D screenshot and provides heightmap-based coloring.
   */
  public setMinimapTerrainBackground(canvas: HTMLCanvasElement): void {
    if (!this.minimapTerrainImage) return;
    const dataUrl = canvas.toDataURL('image/png');
    this.minimapTerrainImage.source = dataUrl;
    this.minimapTerrainImage.isVisible = true;
  }

  /**
   * Set the minimap background image from a pre-rendered data URL.
   * Called once during loading by BabylonGame after capturing a top-down screenshot.
   */
  public setMinimapImage(dataUrl: string, worldSize: number): void {
    this._minimapWorldSize = worldSize;

    // Load the data URL into an HTMLImageElement, then draw to a canvas
    // so we can do sliding-window extraction efficiently.
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        this._minimapFullImage = canvas;
        this.minimapStaticRendered = true;
      }
    };
    img.src = dataUrl;
  }

  private _minimapWorldSize: number = 512;

  /** The full-world overhead snapshot canvas, used by the sliding-window minimap. */
  private _minimapFullImage: HTMLCanvasElement | null = null;
  /** Reusable offscreen canvas for minimap viewport extraction (avoids per-frame allocation). */
  private _minimapVpCanvas: HTMLCanvasElement | null = null;
  private _minimapVpCtx: CanvasRenderingContext2D | null = null;
  /** Last source rect used for the minimap viewport, to skip redundant redraws. */
  private _minimapLastSrcX = -1;
  private _minimapLastSrcY = -1;
  /** Last data URL assigned to the minimap background to avoid redundant source assignments. */
  private _minimapLastDataUrl = '';

  // Persistent minimap controls (created once, updated per frame)
  private _minimapPlayerOuter: Ellipse | null = null;
  private _minimapPlayerMarker: Ellipse | null = null;
  private _minimapConeImg: Image | null = null;
  private _minimapConeSvgUrl = '';
  private _minimapConeZoom = -1;
  /** Ephemeral minimap controls that are recreated each frame (NPCs, quests). */
  private _minimapDynamicControls: Control[] = [];
  /** Current minimap zoom level. 1.0 = default, higher = more zoomed in. */
  private _minimapZoomLevel = 4.0;
  private static readonly MINIMAP_ZOOM_MIN = 0.25;
  private static readonly MINIMAP_ZOOM_MAX = 4.0;
  private static readonly MINIMAP_ZOOM_STEP = 0.25;
  /** Zoom level label displayed on the minimap. */
  private _minimapZoomLabel: TextBlock | null = null;
  /** Last player position used for minimap calculations. */
  private _minimapLastPlayerPos: { x: number; z: number } = { x: 0, z: 0 };
  /** NPC ID to highlight with a prominent marker on the minimap. */
  private _highlightedNpcId: string | null = null;
  /** Animation counter for pulsing highlight effect. */
  private _highlightPulseCounter = 0;
  /** Pan offset in world units (accumulated from drag). */
  private _minimapPanOffset: { x: number; z: number } = { x: 0, z: 0 };
  /** Whether the user is currently dragging the minimap. */
  private _minimapDragging = false;
  /** Last pointer position during drag (screen pixels). */
  private _minimapDragLast: { x: number; y: number } = { x: 0, y: 0 };
  private _minimapLastViewRadius = 0;

  public updateMinimap(data: MinimapData) {
    if (!this.minimapPanel) return;

    const mapContainer = this.minimapPanel.getDescendants().find(
      (c) => c.name === "minimapContainer"
    ) as Container;

    if (!mapContainer) return;

    const MAP_SIZE = BabylonGUIManager.MINIMAP_SIZE;
    const mapHalf = MAP_SIZE / 2;
    const worldSize = data.worldSize;
    const worldHalf = worldSize / 2;

    // Store player position for minimap calculations
    this._minimapLastPlayerPos = { x: data.playerPosition.x, z: data.playerPosition.z };

    // View radius shrinks as zoom increases (zoom in = see less area)
    const baseViewRadius = worldSize * 0.2;
    const viewRadiusZoomed = baseViewRadius / this._minimapZoomLevel;
    this._minimapLastViewRadius = viewRadiusZoomed;

    // Viewport center = player + pan offset (reset pan if not dragging and player moved significantly)
    const vpCenterX = data.playerPosition.x + this._minimapPanOffset.x;
    const vpCenterZ = data.playerPosition.z + this._minimapPanOffset.z;

    // --- Sliding-window background: extract the area around the viewport center ---
    if (this._minimapFullImage && this.minimapStaticImage) {
      const viewRadius = viewRadiusZoomed;
      const px = vpCenterX;
      const pz = vpCenterZ;

      const imgW = this._minimapFullImage.width;
      const imgH = this._minimapFullImage.height;
      const playerImgX = ((px + worldHalf) / worldSize) * imgW;
      const playerImgY = ((-pz + worldHalf) / worldSize) * imgH;
      const viewRadiusPx = (viewRadius / worldSize) * imgW;

      // Don't clamp — always center the viewport on the player so markers align.
      const srcX = playerImgX - viewRadiusPx;
      const srcY = playerImgY - viewRadiusPx;
      const srcSize = viewRadiusPx * 2;

      // Only re-encode when the viewport has shifted enough to matter visually.
      const dx = Math.abs(srcX - this._minimapLastSrcX);
      const dy = Math.abs(srcY - this._minimapLastSrcY);
      if (dx >= 2 || dy >= 2 || !this.minimapStaticImage.isVisible) {
        if (!this._minimapVpCanvas) {
          this._minimapVpCanvas = document.createElement('canvas');
          this._minimapVpCanvas.width = MAP_SIZE;
          this._minimapVpCanvas.height = MAP_SIZE;
          this._minimapVpCtx = this._minimapVpCanvas.getContext('2d');
        }
        if (this._minimapVpCtx) {
          const ctx = this._minimapVpCtx;

          // Fill with ground color for any area outside the world bounds
          ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
          ctx.fillStyle = '#3d5a28';
          ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

          // Compute the visible intersection between viewport and world image
          const clampedSrcLeft = Math.max(0, srcX);
          const clampedSrcTop = Math.max(0, srcY);
          const clampedSrcRight = Math.min(imgW, srcX + srcSize);
          const clampedSrcBottom = Math.min(imgH, srcY + srcSize);
          const clampedSrcW = clampedSrcRight - clampedSrcLeft;
          const clampedSrcH = clampedSrcBottom - clampedSrcTop;

          if (clampedSrcW > 0 && clampedSrcH > 0) {
            // Map the clamped source rect to the corresponding destination rect
            const dstX = ((clampedSrcLeft - srcX) / srcSize) * MAP_SIZE;
            const dstY = ((clampedSrcTop - srcY) / srcSize) * MAP_SIZE;
            const dstW = (clampedSrcW / srcSize) * MAP_SIZE;
            const dstH = (clampedSrcH / srcSize) * MAP_SIZE;
            ctx.drawImage(
              this._minimapFullImage,
              clampedSrcLeft, clampedSrcTop, clampedSrcW, clampedSrcH,
              dstX, dstY, dstW, dstH
            );
          }
          // Draw 2D overlays only when zoomed in enough that individual
          // buildings are distinguishable. When zoomed out, the 3D snapshot
          // already contains buildings/streets and the overlays would cause
          // visible doubling due to 3D-vs-2D projection mismatch.
          if (srcSize < imgW * 0.45) {
            if (data.streets && data.streets.length > 0) {
              this.drawMinimapStreets(ctx, data.streets, viewRadius, { x: vpCenterX, z: vpCenterZ }, MAP_SIZE);
            }
            if (data.buildings && data.buildings.length > 0) {
              this.drawMinimapBuildings(ctx, data.buildings, viewRadius, { x: vpCenterX, z: vpCenterZ }, MAP_SIZE);
            }
          }
          // Pre-load the data URL into an HTMLImageElement before assigning
          // to the GUI Image, so the old frame stays visible until the new
          // one finishes loading (prevents flicker).
          const dataUrl = this._minimapVpCanvas.toDataURL('image/jpeg', 0.85);
          if (dataUrl !== this._minimapLastDataUrl) {
            this._minimapLastDataUrl = dataUrl;
            const tmpImg = new window.Image();
            tmpImg.onload = () => {
              if (this.minimapStaticImage) {
                this.minimapStaticImage.domImage = tmpImg;
                this.minimapStaticImage.isVisible = true;
              }
            };
            tmpImg.src = dataUrl;
          } else {
            this.minimapStaticImage.isVisible = true;
          }
        }
        this._minimapLastSrcX = srcX;
        this._minimapLastSrcY = srcY;
      }
    }

    // --- Remove only ephemeral markers (NPCs, quests) from the previous frame ---
    for (const ctrl of this._minimapDynamicControls) {
      mapContainer.removeControl(ctrl);
      ctrl.dispose();
    }
    this._minimapDynamicControls = [];

    // Map world coords to minimap pixel offsets relative to the current viewport
    const viewRadius = viewRadiusZoomed;
    const vpCx = vpCenterX;
    const vpCz = vpCenterZ;
    const vpSize = viewRadius * 2;
    // Scale dot sizes with zoom (reference: 7px NPC dots at 4.0x zoom)
    const zoomDotScale = this._minimapZoomLevel / 4.0;

    const toMap = (wx: number, wz: number): [number, number] => {
      const mx = ((wx - vpCx) / vpSize) * MAP_SIZE;
      const mz = (-(wz - vpCz) / vpSize) * MAP_SIZE;
      return [mx, mz];
    };

    // Determine highlighted NPC from data or stored ID
    const highlightId = data.highlightedNpcId || this._highlightedNpcId;

    // Animate pulse counter for highlighted marker
    this._highlightPulseCounter = (this._highlightPulseCounter + 1) % 60;
    const pulseScale = 1 + 0.3 * Math.sin((this._highlightPulseCounter / 60) * Math.PI * 2);

    // Draw NPC markers — ephemeral, recreated each frame
    if (data.npcPositions) {
      for (const npc of data.npcPositions) {
        const [nx, nz] = toMap(npc.position.x, npc.position.z);
        const isHighlighted = !!highlightId && npc.id === highlightId;
        // Unified taxonomy. BabylonGame computes this via
        // selectNpcMarker(..., 'minimap') — both available and radiant
        // are suppressed while the player has an active quest.
        const kind = npc.questMarkerKind ?? null;
        // Prominent = has a marker OR is the focus-mode highlight target.
        const isProminent = !!kind || isHighlighted;

        // Show prominent NPCs even if slightly off-screen (clamped to edge)
        if (!isProminent && (Math.abs(nx) > mapHalf || Math.abs(nz) > mapHalf)) continue;

        if (isProminent) {
          // Look up style from the single MARKER_STYLES registry. For a
          // highlighted NPC with no explicit kind (rare but possible when
          // focus mode is set externally), fall back to active_objective.
          const style = kind
            ? MARKER_STYLES[kind]
            : MARKER_STYLES.active_objective;
          const isPulsing = style.minimapPulsing;
          // Keep the existing "prominent kinds render larger on the
          // minimap" behaviour: turn_in and active_objective use the
          // bigger 18px base; the `?`-kinds stay at their smaller registry
          // size but scale with zoom.
          const isHighPriority = kind === 'turn_in' || kind === 'active_objective' || isHighlighted;
          const baseSize = isHighPriority ? 18 : style.minimapSize;
          const indicatorScale = Math.max(0.6, zoomDotScale);
          const pulseSize = Math.round(baseSize * indicatorScale * (isPulsing ? pulseScale : 1));
          const indicatorColor = style.color;
          const indicatorSymbol = style.symbol;
          const clampedNx = Math.max(-mapHalf + 12, Math.min(mapHalf - 12, nx));
          const clampedNz = Math.max(-mapHalf + 12, Math.min(mapHalf - 12, nz));

          // Outer glow ring (only for pulsing kinds — turn_in + active_objective)
          if (isPulsing) {
            const glow = new Ellipse(`npc-glow-${npc.id}`);
            glow.width = `${pulseSize + Math.round(6 * indicatorScale)}px`;
            glow.height = `${pulseSize + Math.round(6 * indicatorScale)}px`;
            glow.background = `${indicatorColor}33`;
            glow.color = `${indicatorColor}80`;
            glow.thickness = 1;
            glow.left = `${clampedNx}px`;
            glow.top = `${clampedNz}px`;
            mapContainer.addControl(glow);
            this._minimapDynamicControls.push(glow);
          }

          // Inner marker
          const dot = new Ellipse(`npc-hl-${npc.id}`);
          dot.width = `${pulseSize}px`;
          dot.height = `${pulseSize}px`;
          dot.background = indicatorColor;
          dot.color = isHighPriority ? '#FFFFFF' : '#FFFFFF80';
          dot.thickness = isHighPriority ? 2 : 1;
          dot.left = `${clampedNx}px`;
          dot.top = `${clampedNz}px`;
          mapContainer.addControl(dot);
          this._minimapDynamicControls.push(dot);

          // Symbol text
          const excl = new TextBlock(`npc-hl-text-${npc.id}`);
          excl.text = indicatorSymbol;
          excl.color = isHighPriority ? '#FFFFFF' : '#000000';
          excl.fontSize = Math.round((isHighPriority ? 11 : 9) * indicatorScale * (isPulsing ? pulseScale : 1));
          excl.fontWeight = 'bold';
          excl.left = `${clampedNx}px`;
          excl.top = `${clampedNz}px`;
          mapContainer.addControl(excl);
          this._minimapDynamicControls.push(excl);
        } else {
          // Regular NPC dot
          const npcDotSize = Math.max(3, Math.round(7 * zoomDotScale));
          const dot = new Ellipse(`npc-${npc.id}`);
          dot.width = `${npcDotSize}px`;
          dot.height = `${npcDotSize}px`;
          dot.thickness = zoomDotScale >= 0.5 ? 1 : 0;

          if (npc.role === 'guard') { dot.background = '#F44336'; dot.color = '#F44336'; }
          else if (npc.role === 'questgiver') { dot.background = '#FFC107'; dot.color = '#FFC107'; }
          else if (npc.role !== 'merchant') { dot.background = '#00E676'; dot.color = '#00E676'; }

          if (npc.role === 'merchant') {
            // Merchant: larger green circle with $ symbol
            const merchantSize = Math.max(8, Math.round(14 * zoomDotScale));
            dot.width = `${merchantSize}px`;
            dot.height = `${merchantSize}px`;
            dot.background = '#4CAF50';
            dot.color = '#2E7D32';
            dot.thickness = 1;
            dot.left = `${nx}px`;
            dot.top = `${nz}px`;
            mapContainer.addControl(dot);
            this._minimapDynamicControls.push(dot);

            const dollarSign = new TextBlock(`npc-merchant-${npc.id}`);
            dollarSign.text = '$';
            dollarSign.color = '#FFFFFF';
            dollarSign.fontSize = Math.max(6, Math.round(10 * zoomDotScale));
            dollarSign.fontWeight = 'bold';
            dollarSign.left = `${nx}px`;
            dollarSign.top = `${nz}px`;
            mapContainer.addControl(dollarSign);
            this._minimapDynamicControls.push(dollarSign);
          } else {
            dot.left = `${nx}px`;
            dot.top = `${nz}px`;
            mapContainer.addControl(dot);
            this._minimapDynamicControls.push(dot);
          }

          // Show quest indicator symbol above NPC dot on minimap
          // (only for non-prominent indicators — prominent ones handled above).
          // in_progress is the only kind that reaches this branch because
          // available / available_radiant are suppressed by the minimap
          // gating rule in selectNpcMarker, and turn_in / active_objective
          // are prominent.
          if (kind === 'in_progress') {
            const inProgressStyle = MARKER_STYLES.in_progress;
            const indicatorSize = Math.max(6, Math.round(12 * zoomDotScale));
            const symbolOffset = -(npcDotSize / 2 + indicatorSize / 2 + 1);

            const indBg = new Ellipse(`npc-qi-bg-${npc.id}`);
            indBg.width = `${indicatorSize}px`;
            indBg.height = `${indicatorSize}px`;
            indBg.thickness = 0;
            indBg.background = inProgressStyle.color;
            indBg.left = `${nx}px`;
            indBg.top = `${nz + symbolOffset}px`;
            mapContainer.addControl(indBg);
            this._minimapDynamicControls.push(indBg);

            const indText = new TextBlock(`npc-qi-${npc.id}`);
            indText.text = '?';
            indText.color = '#000000';
            indText.fontSize = Math.max(5, Math.round(9 * zoomDotScale));
            indText.fontWeight = 'bold';
            indText.left = `${nx}px`;
            indText.top = `${nz + symbolOffset}px`;
            mapContainer.addControl(indText);
            this._minimapDynamicControls.push(indText);
          }
        }
      }
    }

    // Draw quest markers (diamond shape) — ephemeral
    if (data.questMarkers) {
      for (const quest of data.questMarkers) {
        const [qx, qz] = toMap(quest.position.x, quest.position.z);
        if (Math.abs(qx) > mapHalf || Math.abs(qz) > mapHalf) continue;

        const questDotSize = Math.max(4, Math.round(10 * zoomDotScale));
        const questMarker = new Rectangle(`quest-${quest.id}`);
        questMarker.width = `${questDotSize}px`;
        questMarker.height = `${questDotSize}px`;
        questMarker.background = "#FFD700";
        questMarker.color = "#FFFFFF";
        questMarker.thickness = 1;
        questMarker.cornerRadius = 2;
        questMarker.rotation = Math.PI / 4;
        questMarker.left = `${qx}px`;
        questMarker.top = `${qz}px`;
        mapContainer.addControl(questMarker);
        this._minimapDynamicControls.push(questMarker);
      }
    }

    // Draw quest objective markers — pulsing exclamation points
    if (data.questObjectiveMarkers) {
      // All objective markers are active_objective (red `!`) after the
      // marker unification — pull glyph + glyph-color from the registry
      // so the location markers and the NPC active_objective markers
      // render the same symbol in the same color (white `!` on red),
      // instead of the old inconsistent black-on-red for locations.
      const objStyle = MARKER_STYLES.active_objective;
      for (const obj of data.questObjectiveMarkers) {
        const [ox, oz] = toMap(obj.position.x, obj.position.z);
        // Clamp to minimap bounds so off-screen objectives show at edges
        const clampedOx = Math.max(-mapHalf + 12, Math.min(mapHalf - 12, ox));
        const clampedOz = Math.max(-mapHalf + 12, Math.min(mapHalf - 12, oz));

        const markerColor = obj.color || objStyle.color;
        const objPulseSize = Math.round(16 * zoomDotScale * pulseScale);

        // Outer glow ring
        const glow = new Ellipse(`obj-glow-${obj.id}`);
        glow.width = `${objPulseSize + Math.round(6 * zoomDotScale)}px`;
        glow.height = `${objPulseSize + Math.round(6 * zoomDotScale)}px`;
        glow.background = `${markerColor}33`; // 20% opacity
        glow.color = `${markerColor}80`;       // 50% opacity
        glow.thickness = 1;
        glow.left = `${clampedOx}px`;
        glow.top = `${clampedOz}px`;
        mapContainer.addControl(glow);
        this._minimapDynamicControls.push(glow);

        // Inner marker
        const dot = new Ellipse(`obj-dot-${obj.id}`);
        dot.width = `${objPulseSize}px`;
        dot.height = `${objPulseSize}px`;
        dot.background = markerColor;
        dot.color = '#FFFFFF';
        dot.thickness = 2;
        dot.left = `${clampedOx}px`;
        dot.top = `${clampedOz}px`;
        mapContainer.addControl(dot);
        this._minimapDynamicControls.push(dot);

        // Glyph — matches the NPC active_objective marker for consistency.
        const excl = new TextBlock(`obj-excl-${obj.id}`);
        excl.text = objStyle.symbol;
        excl.color = '#FFFFFF';
        excl.fontSize = Math.round(10 * zoomDotScale * pulseScale);
        excl.fontWeight = 'bold';
        excl.left = `${clampedOx}px`;
        excl.top = `${clampedOz}px`;
        mapContainer.addControl(excl);
        this._minimapDynamicControls.push(excl);
      }
    }

    // Draw quest item markers (gold circles for fetch quest collectibles)
    if (data.questItemMarkers) {
      for (const item of data.questItemMarkers) {
        const [ix, iz] = toMap(item.position.x, item.position.z);
        if (Math.abs(ix) > mapHalf || Math.abs(iz) > mapHalf) continue;

        const itemDotSize = Math.max(3, Math.round(7 * zoomDotScale));
        const itemMarker = new Ellipse(`quest-item-${item.id}`);
        itemMarker.width = `${itemDotSize}px`;
        itemMarker.height = `${itemDotSize}px`;
        itemMarker.background = "#FFD700";
        itemMarker.color = "#FFFFFF";
        itemMarker.thickness = 1;
        itemMarker.left = `${ix}px`;
        itemMarker.top = `${iz}px`;
        mapContainer.addControl(itemMarker);
        this._minimapDynamicControls.push(itemMarker);
      }
    }

    // --- Persistent player controls: created once, updated per frame ---
    // Map player world position so it shifts correctly when panning
    const [playerMx, playerMz] = toMap(data.playerPosition.x, data.playerPosition.z);
    // Scale player marker sizes with zoom
    const playerOuterSize = Math.max(6, Math.round(14 * zoomDotScale));
    const playerInnerSize = Math.max(4, Math.round(10 * zoomDotScale));
    const coneScale = Math.max(0.4, zoomDotScale);

    // Direction cone (added first so it renders behind the player dot)
    // Only recreate SVG when zoom level changes
    if (!this._minimapConeImg || this._minimapConeZoom !== this._minimapZoomLevel) {
      if (this._minimapConeImg) {
        mapContainer.removeControl(this._minimapConeImg);
        this._minimapConeImg.dispose();
        this._minimapConeImg = null;
      }
      const coneW = Math.round(10 * coneScale);
      const coneH = Math.round(28 * coneScale);
      const triH = Math.round(10 * coneScale);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${coneW}" height="${coneH}" viewBox="0 0 ${coneW} ${coneH}">` +
        `<polygon points="${coneW / 2},1 ${coneW - 1},${triH} ${1},${triH}" ` +
        `fill="rgba(255,193,7,0.5)" stroke="#FFC107" stroke-width="1"/>` +
        `</svg>`;
      this._minimapConeSvgUrl = "data:image/svg+xml," + encodeURIComponent(svg);
      this._minimapConeImg = new Image("player-cone", this._minimapConeSvgUrl);
      this._minimapConeImg.width = `${Math.round(10 * coneScale)}px`;
      this._minimapConeImg.height = `${Math.round(28 * coneScale)}px`;
      mapContainer.addControl(this._minimapConeImg);
      this._minimapConeZoom = this._minimapZoomLevel;
    }
    this._minimapConeImg.left = `${playerMx}px`;
    this._minimapConeImg.top = `${playerMz}px`;
    this._minimapConeImg.rotation = data.playerRotationY;

    if (!this._minimapPlayerOuter) {
      this._minimapPlayerOuter = new Ellipse("player-marker-outer");
      this._minimapPlayerOuter.background = "rgba(0,0,0,0.4)";
      this._minimapPlayerOuter.color = "transparent";
      this._minimapPlayerOuter.thickness = 0;
      mapContainer.addControl(this._minimapPlayerOuter);
    }
    this._minimapPlayerOuter.width = `${playerOuterSize}px`;
    this._minimapPlayerOuter.height = `${playerOuterSize}px`;
    this._minimapPlayerOuter.left = `${playerMx}px`;
    this._minimapPlayerOuter.top = `${playerMz}px`;

    if (!this._minimapPlayerMarker) {
      this._minimapPlayerMarker = new Ellipse("player-marker");
      this._minimapPlayerMarker.background = "#FFC107";
      this._minimapPlayerMarker.color = "white";
      mapContainer.addControl(this._minimapPlayerMarker);
    }
    this._minimapPlayerMarker.width = `${playerInnerSize}px`;
    this._minimapPlayerMarker.height = `${playerInnerSize}px`;
    this._minimapPlayerMarker.thickness = zoomDotScale >= 0.5 ? 2 : 1;
    this._minimapPlayerMarker.left = `${playerMx}px`;
    this._minimapPlayerMarker.top = `${playerMz}px`;
  }

  /**
   * Draw street network polylines onto the minimap viewport canvas.
   */
  private drawMinimapStreets(
    ctx: CanvasRenderingContext2D,
    streets: NonNullable<MinimapData['streets']>,
    viewRadius: number,
    playerPos: { x: number; z: number },
    mapSize: number
  ): void {
    const vpSize = viewRadius * 2;
    const half = mapSize / 2;

    // Convert world coords to canvas pixel coords
    const toCanvas = (wx: number, wz: number): [number, number] => {
      const cx = ((wx - playerPos.x) / vpSize) * mapSize + half;
      const cy = (-(wz - playerPos.z) / vpSize) * mapSize + half;
      return [cx, cy];
    };

    ctx.save();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const street of streets) {
      if (street.waypoints.length < 2) continue;

      // Scale road width from world units to minimap pixels (min 1px)
      const lineWidth = Math.max(1, (street.width / vpSize) * mapSize);
      ctx.lineWidth = lineWidth;

      ctx.beginPath();
      const [sx, sy] = toCanvas(street.waypoints[0].x, street.waypoints[0].z);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < street.waypoints.length; i++) {
        const [px, py] = toCanvas(street.waypoints[i].x, street.waypoints[i].z);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw building footprints as filled rectangles onto the minimap viewport canvas.
   */
  private drawMinimapBuildings(
    ctx: CanvasRenderingContext2D,
    buildings: MinimapBuilding[],
    viewRadius: number,
    playerPos: { x: number; z: number },
    mapSize: number
  ): void {
    const vpSize = viewRadius * 2;
    const half = mapSize / 2;

    const toCanvas = (wx: number, wz: number): [number, number] => {
      const cx = ((wx - playerPos.x) / vpSize) * mapSize + half;
      const cy = (-(wz - playerPos.z) / vpSize) * mapSize + half;
      return [cx, cy];
    };

    ctx.save();

    for (const building of buildings) {
      const [cx, cy] = toCanvas(building.position.x, building.position.z);
      const w = Math.max(2, ((building.width ?? 6) / vpSize) * mapSize);
      const h = Math.max(2, ((building.depth ?? 6) / vpSize) * mapSize);

      // Skip buildings entirely outside the viewport
      if (cx + w / 2 < 0 || cx - w / 2 > mapSize || cy + h / 2 < 0 || cy - h / 2 > mapSize) continue;

      switch (building.type) {
        case 'business':
          ctx.fillStyle = 'rgba(100, 149, 237, 0.7)'; // cornflower blue
          break;
        case 'residence':
          ctx.fillStyle = 'rgba(210, 180, 140, 0.7)'; // tan
          break;
        default:
          ctx.fillStyle = 'rgba(169, 169, 169, 0.7)'; // dark gray
          break;
      }

      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

      // Thin outline for definition
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }

    ctx.restore();
  }

  /**
   * Force a re-render of the minimap's 3D overhead snapshot.
   * Currently a no-op since the snapshot is captured during loading.
   */
  public refreshMinimapSnapshot(_data: MinimapData): Promise<void> {
    return Promise.resolve();
  }

  public updateReputation(data: ReputationData | null) {
    if (!this.reputationPanel) return;

    // Hide panel if no reputation data (not in any zone)
    if (!data) {
      this.reputationPanel.isVisible = false;
      return;
    }

    // Show panel
    this.reputationPanel.isVisible = true;

    // Update settlement name
    const settlementName = this.reputationPanel.getDescendants().find(
      (c) => c.name === "reputationSettlement"
    ) as TextBlock;
    if (settlementName) {
      settlementName.text = data.settlementName;
    }

    // Update standing text and color
    const standing = this.reputationPanel.getDescendants().find(
      (c) => c.name === "reputationStanding"
    ) as TextBlock;
    if (standing) {
      standing.text = data.standing.charAt(0).toUpperCase() + data.standing.slice(1);

      // Color based on standing
      if (data.standing === 'revered') {
        standing.color = "#4CAF50"; // Green
      } else if (data.standing === 'friendly') {
        standing.color = "#8BC34A"; // Light green
      } else if (data.standing === 'neutral') {
        standing.color = "#FFC107"; // Yellow
      } else if (data.standing === 'unfriendly') {
        standing.color = "#FF9800"; // Orange
      } else if (data.standing === 'hostile') {
        standing.color = "#F44336"; // Red
      }
    }

    // Update reputation bar
    const repBarFill = this.reputationPanel.getDescendants().find(
      (c) => c.name === "reputationBarFill"
    ) as Rectangle;
    if (repBarFill) {
      // Convert score (-100 to 100) to bar width (0 to 200px)
      const normalizedScore = ((data.score + 100) / 200) * 200;
      repBarFill.width = `${Math.max(0, Math.min(200, normalizedScore))}px`;

      // Color based on score
      if (data.score >= 51) {
        repBarFill.background = "#4CAF50"; // Green (Revered)
      } else if (data.score >= 1) {
        repBarFill.background = "#8BC34A"; // Light green (Friendly)
      } else if (data.score >= -49) {
        repBarFill.background = "#FFC107"; // Yellow (Neutral)
      } else if (data.score >= -99) {
        repBarFill.background = "#FF9800"; // Orange (Unfriendly)
      } else {
        repBarFill.background = "#F44336"; // Red (Hostile)
      }
    }

    // Update score text
    const scoreText = this.reputationPanel.getDescendants().find(
      (c) => c.name === "reputationScore"
    ) as TextBlock;
    if (scoreText) {
      scoreText.text = `${data.score} / 100`;
    }

    // Update warning/ban text
    const warningText = this.reputationPanel.getDescendants().find(
      (c) => c.name === "reputationWarning"
    ) as TextBlock;
    if (warningText) {
      if (data.isBanned) {
        warningText.text = "⚠ BANNED - Leave immediately!";
        warningText.color = "#F44336";
      } else if (data.violationCount > 0) {
        warningText.text = `⚠ Violations: ${data.violationCount}`;
        warningText.color = "#FF9800";
      } else if (data.outstandingFines > 0) {
        warningText.text = `Fine due: ${data.outstandingFines} gold`;
        warningText.color = "#FFC107";
      } else {
        warningText.text = "";
      }
    }

    // Show/hide Pay Fines button based on outstanding fines
    const payFinesBtn = this.reputationPanel.getDescendants().find(
      (c) => c.name === "payFinesBtn"
    ) as Button;
    if (payFinesBtn) {
      if (data.outstandingFines > 0 && !data.isBanned) {
        payFinesBtn.isVisible = true;
        payFinesBtn.textBlock!.text = `Pay Fines (${data.outstandingFines}g)`;
      } else {
        payFinesBtn.isVisible = false;
      }
    }
  }

  // Panel toggle methods
  public togglePlayerStatsPanel() {
    if (this.playerStatsPanel) {
      this.playerStatsPanel.isVisible = !this.playerStatsPanel.isVisible;
    }
  }

  public toggleWorldStatsPanel() {
    if (this.worldStatsPanel) {
      this.worldStatsPanel.isVisible = !this.worldStatsPanel.isVisible;
    }
  }

  public toggleNPCListPanel() {
    if (this.npcListPanel) {
      this.npcListPanel.isVisible = !this.npcListPanel.isVisible;
    }
  }

  public toggleActionPanel() {
    if (this.actionPanel) {
      this.actionPanel.isVisible = !this.actionPanel.isVisible;
    }
  }

  // Notification system — routes to the shared NotificationStore
  public showToast(options: { title: string; description?: string; variant?: 'default' | 'destructive'; duration?: number }) {
    NotificationStore.push({
      title: options.title,
      description: options.description,
      category: options.variant === 'destructive' ? 'system' : 'general',
    });
  }

  /**
   * Show a prominent centered popup describing a quest objective.
   * Used when a quest is first activated (for the first objective) and
   * after each objective is completed (for the next one).
   * The popup must be dismissed before the player can continue.
   */
  public showObjectivePopup(options: {
    questTitle: string;
    objectiveDescription: string;
    objectiveIndex: number;
    totalObjectives: number;
    hint?: string;
    isFirstObjective?: boolean;
  }): Promise<void> {
    // Remove any existing popup (resolves its pending promise)
    this.hideObjectivePopup();

    return new Promise<void>((resolve) => {
      (this as any)._objectivePopupResolve = resolve;

      const backdrop = new Rectangle('objectivePopupBackdrop');
      backdrop.width = '100%';
      backdrop.height = '100%';
      backdrop.background = 'rgba(0, 0, 0, 0.6)';
      backdrop.thickness = 0;
      backdrop.isPointerBlocker = true;
      backdrop.zIndex = 90;
      this.advancedTexture.addControl(backdrop);

      const card = new Rectangle('objectivePopupCard');
      card.width = '360px';
      card.adaptHeightToChildren = true;
      card.background = 'rgba(20, 18, 30, 0.97)';
      card.color = '#FFD700';
      card.thickness = 2;
      card.cornerRadius = 12;
      card.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      card.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      card.paddingTop = '16px';
      card.paddingBottom = '16px';
      card.paddingLeft = '20px';
      card.paddingRight = '20px';
      backdrop.addControl(card);

      const stack = new StackPanel('objectivePopupStack');
      stack.width = '100%';
      card.addControl(stack);

      // Header — quest title
      const header = new TextBlock('objectivePopupHeader');
      header.text = options.questTitle;
      header.color = '#FFD700';
      header.fontSize = 16;
      header.fontWeight = 'bold';
      header.height = '28px';
      header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(header);

      // Subheader — "Objective N of M" or "Quest Started"
      const sub = new TextBlock('objectivePopupSub');
      sub.text = options.isFirstObjective
        ? 'New Quest'
        : `Objective ${options.objectiveIndex} of ${options.totalObjectives}`;
      sub.color = 'rgba(255, 255, 255, 0.5)';
      sub.fontSize = 11;
      sub.height = '20px';
      sub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(sub);

      // Spacer
      const spacer1 = new Rectangle('objPopupSpacer1');
      spacer1.height = '10px';
      spacer1.thickness = 0;
      spacer1.background = 'transparent';
      stack.addControl(spacer1);

      // Objective description
      const desc = new TextBlock('objectivePopupDesc');
      desc.text = options.objectiveDescription;
      desc.color = '#FFFFFF';
      desc.fontSize = 14;
      desc.textWrapping = true;
      desc.resizeToFit = true;
      desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      desc.paddingLeft = '8px';
      desc.paddingRight = '8px';
      stack.addControl(desc);

      // Hint (if provided)
      if (options.hint) {
        const hintSpacer = new Rectangle('objPopupHintSpacer');
        hintSpacer.height = '8px';
        hintSpacer.thickness = 0;
        hintSpacer.background = 'transparent';
        stack.addControl(hintSpacer);

        const hint = new TextBlock('objectivePopupHint');
        hint.text = options.hint;
        hint.color = 'rgba(255, 215, 0, 0.7)';
        hint.fontSize = 11;
        hint.fontStyle = 'italic';
        hint.textWrapping = true;
        hint.resizeToFit = true;
        hint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        hint.paddingLeft = '8px';
        hint.paddingRight = '8px';
        stack.addControl(hint);
      }

      // Spacer before button
      const spacer2 = new Rectangle('objPopupSpacer2');
      spacer2.height = '14px';
      spacer2.thickness = 0;
      spacer2.background = 'transparent';
      stack.addControl(spacer2);

      // Dismiss button
      const btn = Button.CreateSimpleButton('objectivePopupBtn', 'Got it');
      btn.width = '120px';
      btn.height = '34px';
      btn.color = '#000';
      btn.background = '#FFD700';
      btn.cornerRadius = 6;
      btn.fontSize = 13;
      btn.fontWeight = 'bold';
      btn.thickness = 0;
      btn.onPointerClickObservable.add(() => {
        this.hideObjectivePopup();
      });
      stack.addControl(btn);

      (this as any)._objectivePopupBackdrop = backdrop;
    });
  }

  /** Dismiss the objective guidance popup if visible. */
  public hideObjectivePopup(): void {
    const existing = (this as any)._objectivePopupBackdrop as Rectangle | null;
    if (existing) {
      this.advancedTexture.removeControl(existing);
      existing.dispose();
      (this as any)._objectivePopupBackdrop = null;
    }
    const pendingResolve = (this as any)._objectivePopupResolve as (() => void) | null;
    if (pendingResolve) {
      (this as any)._objectivePopupResolve = null;
      pendingResolve();
    }
  }

  /**
   * Resolves when the current objective popup is dismissed, or immediately if
   * no popup is visible. Subsystems that want to gate follow-up UI (assessment
   * panels, next-phase instructions) on the player acknowledging "Got it" can
   * await this.
   */
  public waitForObjectivePopup(): Promise<void> {
    const pendingResolve = (this as any)._objectivePopupResolve as (() => void) | null;
    if (!pendingResolve) return Promise.resolve();
    return new Promise<void>((resolve) => {
      (this as any)._objectivePopupResolve = () => {
        pendingResolve();
        resolve();
      };
    });
  }

  // Help panel
  public toggleHelpPanel() {
    if (!this.helpPanel) {
      this.createHelpPanel();
    }
    this.helpPanel!.isVisible = !this.helpPanel!.isVisible;
  }

  private createHelpPanel() {
    const panel = new Rectangle("helpPanel");
    panel.width = "700px";
    panel.height = "700px";
    panel.background = "rgba(0, 0, 0, 0.95)";
    panel.color = "white";
    panel.thickness = 2;
    panel.cornerRadius = 10;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.isVisible = false;

    const scrollViewer = new ScrollViewer("helpScroll");
    scrollViewer.width = "100%";
    scrollViewer.height = "100%";
    panel.addControl(scrollViewer);

    const mainStack = new StackPanel();
    mainStack.width = "100%";
    mainStack.paddingTop = "20px";
    mainStack.paddingBottom = "20px";
    mainStack.paddingLeft = "30px";
    mainStack.paddingRight = "30px";
    scrollViewer.addControl(mainStack);

    // Title
    const title = new TextBlock();
    title.text = "Keyboard Shortcuts";
    title.color = "white";
    title.fontSize = 24;
    title.fontWeight = "bold";
    title.height = "40px";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mainStack.addControl(title);

    // Subtitle
    const subtitle = new TextBlock();
    subtitle.text = "Press H to toggle this help menu";
    subtitle.color = "rgba(255, 255, 255, 0.7)";
    subtitle.fontSize = 14;
    subtitle.height = "30px";
    subtitle.paddingBottom = "20px";
    subtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mainStack.addControl(subtitle);

    // Sections
    this.addHelpSection(mainStack, "Movement", [
      { key: "W/A/S/D", action: "Move Forward/Left/Backward/Right" },
      { key: "Q/E", action: "Strafe Left/Right" },
      { key: "Shift", action: "Sprint (hold)" },
      { key: "CapsLock", action: "Toggle Sprint" },
      { key: "Space", action: "Jump" },
      { key: "B", action: "Cycle Vehicle (foot/bicycle/horse)" }
    ]);

    this.addHelpSection(mainStack, "Interactions", [
      { key: "Enter / Click", action: "Interact (NPC / building / object)" },
      { key: "X", action: "Examine Nearest Object" },
      { key: "Y", action: "Eavesdrop on NPC Conversation" },
      { key: "T", action: "Push-to-Talk (hold to speak)" }
    ]);

    this.addHelpSection(mainStack, "UI Panels", [
      { key: "C", action: "Camera Viewfinder (photo mode)" },
      { key: "M", action: "Toggle Game Menu" }
    ]);

    this.addHelpSection(mainStack, "System", [
      { key: "F5", action: "Quick Save" },
      { key: "F9", action: "Quick Load" },
      { key: "Shift+V", action: "Toggle VR Mode" }
    ]);

    this.helpPanel = panel;
    this.advancedTexture.addControl(panel);
  }

  private addHelpSection(parent: StackPanel, title: string, shortcuts: Array<{ key: string; action: string }>) {
    // Section title
    const sectionTitle = new TextBlock();
    sectionTitle.text = title;
    sectionTitle.color = "white";
    sectionTitle.fontSize = 18;
    sectionTitle.fontWeight = "bold";
    sectionTitle.height = "35px";
    sectionTitle.paddingTop = "15px";
    sectionTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(sectionTitle);

    // Shortcuts
    shortcuts.forEach(shortcut => {
      const container = new Rectangle();
      container.width = "100%";
      container.height = "40px";
      container.background = "rgba(255, 255, 255, 0.05)";
      container.cornerRadius = 5;
      container.thickness = 0;
      container.paddingTop = "5px";
      container.paddingBottom = "5px";

      const stack = new StackPanel();
      stack.isVertical = false;
      stack.width = "100%";
      stack.height = "100%";
      container.addControl(stack);

      const actionText = new TextBlock();
      actionText.text = shortcut.action;
      actionText.color = "white";
      actionText.fontSize = 14;
      actionText.width = "500px";
      actionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      actionText.paddingLeft = "10px";
      stack.addControl(actionText);

      const keyBadge = new Rectangle();
      keyBadge.width = "100px";
      keyBadge.height = "30px";
      keyBadge.background = "rgba(100, 100, 100, 0.8)";
      keyBadge.cornerRadius = 5;
      keyBadge.thickness = 1;
      keyBadge.color = "rgba(255, 255, 255, 0.3)";

      const keyText = new TextBlock();
      keyText.text = shortcut.key;
      keyText.color = "white";
      keyText.fontSize = 14;
      keyText.fontWeight = "bold";
      keyBadge.addControl(keyText);
      stack.addControl(keyBadge);

      parent.addControl(container);
    });
  }

  // Callback setters
  public setOnActionSelected(callback: (actionId: string) => void) {
    this.onActionSelected = callback;
  }

  public setOnNPCSelected(callback: (npcId: string) => void) {
    this.onNPCSelected = callback;
  }

  public setOnBackPressed(callback: () => void) {
    this.onBackPressed = callback;
  }

  public setOnFullscreenPressed(callback: () => void) {
    this.onFullscreenPressed = callback;
  }

  public setOnDebugPressed(callback: () => void) {
    this.onDebugPressed = callback;
  }

  public setOnPayFines(callback: () => void) {
    this.onPayFines = callback;
  }
  
  public setOnVRToggled(callback: () => void) {
    this.onVRToggled = callback;
  }

  /**
   * Show or hide all 2D overlay UI elements.
   * Used when entering/exiting VR to switch between 2D and world-space UI.
   */
  public setVisible(visible: boolean): void {
    if (this.hudContainer) this.hudContainer.isVisible = visible;
    if (this.menuButton) this.menuButton.isVisible = visible;
    if (this.cameraButton) this.cameraButton.isVisible = visible;
    if (this.fullscreenButton) this.fullscreenButton.isVisible = visible;
    if (this.minimapPanel) this.minimapPanel.isVisible = visible && this.minimapPanel.isVisible;

    // Hide any open panels when going invisible
    if (!visible) {
      if (this.menuPanel) this.menuPanel.isVisible = false;
      if (this.helpPanel) this.helpPanel.isVisible = false;
      if (this.playerStatsPanel) this.playerStatsPanel.isVisible = false;
      if (this.worldStatsPanel) this.worldStatsPanel.isVisible = false;
      if (this.npcListPanel) this.npcListPanel.isVisible = false;
      if (this.actionPanel) this.actionPanel.isVisible = false;
      if (this.settlementDetailsPanel) this.settlementDetailsPanel.isVisible = false;
      if (this.reputationPanel) this.reputationPanel.isVisible = false;
    }
  }

  // ── Time HUD panel ───────────────────────────────────────────────────────

  private static readonly TOD_ICONS: Record<string, string> = {
    dawn: '🌅', morning: '☀️', midday: '🌞',
    afternoon: '🌤️', evening: '🌇', night: '🌙',
  };

  private createTimePanel() {
    const panel = new Rectangle("timePanel");
    panel.width = "140px";
    panel.height = "32px";
    panel.background = "rgba(0, 0, 0, 0.6)";
    panel.color = "rgba(255, 255, 255, 0.5)";
    panel.thickness = 1;
    panel.cornerRadius = 4;
    panel.left = "10px";
    panel.top = "-10px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;

    const row = new StackPanel();
    row.isVertical = false;
    row.height = "24px";
    panel.addControl(row);

    const todIcon = new TextBlock("todIcon");
    todIcon.text = "☀️";
    todIcon.color = "white";
    todIcon.fontSize = 13;
    todIcon.width = "24px";
    todIcon.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.addControl(todIcon);
    this._todText = todIcon;

    const timeText = new TextBlock("timeText");
    timeText.text = "08:00";
    timeText.color = "white";
    timeText.fontSize = 13;
    timeText.fontWeight = "bold";
    timeText.width = "50px";
    timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.addControl(timeText);
    this._timeText = timeText;

    const dayText = new TextBlock("dayText");
    dayText.text = "Day 1";
    dayText.color = "#AAAAAA";
    dayText.fontSize = 11;
    dayText.width = "50px";
    dayText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.addControl(dayText);
    this._dayText = dayText;

    this._timePanel = panel;
    this.advancedTexture.addControl(panel);
  }

  public updateTime(timeString: string, day: number, timeOfDay: string, _speed: number, _paused: boolean) {
    if (this._timeText) this._timeText.text = timeString;
    if (this._dayText) this._dayText.text = `Day ${day}`;
    if (this._todText) this._todText.text = BabylonGUIManager.TOD_ICONS[timeOfDay] ?? '☀️';
  }

  public dispose() {
    this.advancedTexture.dispose();
  }
}
