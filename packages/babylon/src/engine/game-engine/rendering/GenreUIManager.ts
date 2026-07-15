/**
 * Genre UI Manager
 *
 * Creates and manages genre-specific HUD layouts.
 * Each genre gets an appropriate UI overlay:
 * - action_rpg: Health, stamina, minimap, quest tracker
 * - fps: Crosshair, ammo counter, health/armor, compass
 * - rts: Resources, minimap, build menu, unit info
 * - platformer: Lives, collectibles, timer
 * - puzzle: Timer, moves counter, hint button
 * - minimal: Just health (if applicable)
 * - fighting: Health bars, special meter, combo counter, round/timer
 */

import * as GUI from '@babylonjs/gui';
import { Scene } from '@babylonjs/core';
import type { UILayout, GenreFeatures } from '@shared/game-genres/types';

export interface GenreUIConfig {
  layout: UILayout;
  features: GenreFeatures;
  showMinimap: boolean;
  showHealthBar: boolean;
  showStaminaBar: boolean;
  showAmmoCounter: boolean;
  showCompass: boolean;
}

export class GenreUIManager {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private config: GenreUIConfig;

  // Shared elements
  private genreContainer: GUI.Container | null = null;

  // FPS HUD elements
  private crosshair: GUI.Ellipse | null = null;
  private ammoText: GUI.TextBlock | null = null;
  private ammoPanel: GUI.Rectangle | null = null;
  private weaponNameText: GUI.TextBlock | null = null;
  private compassPanel: GUI.Rectangle | null = null;
  private compassText: GUI.TextBlock | null = null;
  private armorBar: GUI.Rectangle | null = null;
  private armorFill: GUI.Rectangle | null = null;
  private armorText: GUI.TextBlock | null = null;

  // RTS HUD elements
  private resourcePanel: GUI.Rectangle | null = null;
  private resourceTexts: Map<string, GUI.TextBlock> = new Map();
  private buildMenuPanel: GUI.Rectangle | null = null;
  private unitInfoPanel: GUI.Rectangle | null = null;
  private unitInfoText: GUI.TextBlock | null = null;

  // Platformer HUD elements
  private livesText: GUI.TextBlock | null = null;
  private collectiblesText: GUI.TextBlock | null = null;
  private timerText: GUI.TextBlock | null = null;
  private platformerPanel: GUI.Rectangle | null = null;

  // Fighting HUD elements
  private player1HealthBar: GUI.Rectangle | null = null;
  private player1HealthFill: GUI.Rectangle | null = null;
  private player1NameText: GUI.TextBlock | null = null;
  private player2HealthBar: GUI.Rectangle | null = null;
  private player2HealthFill: GUI.Rectangle | null = null;
  private player2NameText: GUI.TextBlock | null = null;
  private specialMeterBar: GUI.Rectangle | null = null;
  private specialMeterFill: GUI.Rectangle | null = null;
  private comboText: GUI.TextBlock | null = null;
  private roundText: GUI.TextBlock | null = null;
  private fightTimerText: GUI.TextBlock | null = null;

  // Puzzle HUD elements
  private puzzleTimerText: GUI.TextBlock | null = null;
  private movesText: GUI.TextBlock | null = null;
  private hintButton: GUI.Button | null = null;
  private puzzlePanel: GUI.Rectangle | null = null;

  // Callbacks
  private onBuildSelected: ((buildingType: string) => void) | null = null;
  private onHintRequested: (() => void) | null = null;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture, config: GenreUIConfig) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;
    this.config = config;

    this.createGenreUI();
  }

  /**
   * Create the appropriate genre UI based on layout type
   */
  private createGenreUI(): void {
    this.genreContainer = new GUI.Container('genreUI');
    this.advancedTexture.addControl(this.genreContainer);

    switch (this.config.layout) {
      case 'fps':
        this.createFPSHUD();
        break;
      case 'rts':
        this.createRTSHUD();
        break;
      case 'platformer':
        this.createPlatformerHUD();
        break;
      case 'puzzle':
        this.createPuzzleHUD();
        break;
      case 'action_rpg':
        this.createActionRPGHUD();
        break;
      case 'minimal':
        // Minimal layout uses the base BabylonGUIManager elements only
        break;
    }

  }

  // ==========================================
  // FPS HUD
  // ==========================================
  private createFPSHUD(): void {
    // Crosshair
    this.crosshair = new GUI.Ellipse('crosshair');
    this.crosshair.width = '20px';
    this.crosshair.height = '20px';
    this.crosshair.color = 'white';
    this.crosshair.thickness = 2;
    this.crosshair.background = '';
    this.genreContainer!.addControl(this.crosshair);

    // Inner dot
    const innerDot = new GUI.Ellipse('crosshairDot');
    innerDot.width = '4px';
    innerDot.height = '4px';
    innerDot.color = 'white';
    innerDot.thickness = 0;
    innerDot.background = 'white';
    this.genreContainer!.addControl(innerDot);

    // Ammo counter (bottom-right)
    if (this.config.showAmmoCounter) {
      this.ammoPanel = new GUI.Rectangle('ammoPanel');
      this.ammoPanel.width = '160px';
      this.ammoPanel.height = '70px';
      this.ammoPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      this.ammoPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
      this.ammoPanel.left = '-20px';
      this.ammoPanel.top = '-20px';
      this.ammoPanel.background = 'rgba(0,0,0,0.6)';
      this.ammoPanel.cornerRadius = 8;
      this.ammoPanel.thickness = 1;
      this.ammoPanel.color = 'rgba(255,255,255,0.3)';
      this.genreContainer!.addControl(this.ammoPanel);

      const ammoStack = new GUI.StackPanel('ammoStack');
      ammoStack.isVertical = true;
      ammoStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
      this.ammoPanel.addControl(ammoStack);

      this.ammoText = new GUI.TextBlock('ammoText');
      this.ammoText.text = '30 / 90';
      this.ammoText.fontSize = 28;
      this.ammoText.fontWeight = 'bold';
      this.ammoText.color = 'white';
      this.ammoText.height = '40px';
      ammoStack.addControl(this.ammoText);

      this.weaponNameText = new GUI.TextBlock('weaponName');
      this.weaponNameText.text = 'Pistol';
      this.weaponNameText.fontSize = 12;
      this.weaponNameText.color = 'rgba(255,255,255,0.7)';
      this.weaponNameText.height = '20px';
      ammoStack.addControl(this.weaponNameText);
    }

    // Compass (top-center)
    if (this.config.showCompass) {
      this.compassPanel = new GUI.Rectangle('compassPanel');
      this.compassPanel.width = '300px';
      this.compassPanel.height = '30px';
      this.compassPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.compassPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      this.compassPanel.top = '10px';
      this.compassPanel.background = 'rgba(0,0,0,0.5)';
      this.compassPanel.cornerRadius = 4;
      this.compassPanel.thickness = 0;
      this.genreContainer!.addControl(this.compassPanel);

      this.compassText = new GUI.TextBlock('compassText');
      this.compassText.text = 'N --- NE --- E --- SE --- S --- SW --- W --- NW --- N';
      this.compassText.fontSize = 11;
      this.compassText.color = 'white';
      this.compassPanel.addControl(this.compassText);
    }
  }

  // ==========================================
  // RTS HUD
  // ==========================================
  private createRTSHUD(): void {
    // Resource bar (top)
    this.resourcePanel = new GUI.Rectangle('resourcePanel');
    this.resourcePanel.width = '600px';
    this.resourcePanel.height = '40px';
    this.resourcePanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.resourcePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.resourcePanel.top = '10px';
    this.resourcePanel.background = 'rgba(0,0,0,0.7)';
    this.resourcePanel.cornerRadius = 6;
    this.resourcePanel.thickness = 1;
    this.resourcePanel.color = 'rgba(255,200,50,0.5)';
    this.genreContainer!.addControl(this.resourcePanel);

    const resourceStack = new GUI.StackPanel('resourceStack');
    resourceStack.isVertical = false;
    resourceStack.spacing = 20;
    this.resourcePanel.addControl(resourceStack);

    // Default resources
    const resources = [
      { id: 'gold', label: '💰 Gold', value: '1000' },
      { id: 'wood', label: '🪵 Wood', value: '500' },
      { id: 'stone', label: '🪨 Stone', value: '300' },
      { id: 'food', label: '🌾 Food', value: '200' },
      { id: 'pop', label: '👥 Pop', value: '10/50' },
    ];

    for (const res of resources) {
      const resText = new GUI.TextBlock(`resource_${res.id}`);
      resText.text = `${res.label}: ${res.value}`;
      resText.fontSize = 13;
      resText.color = 'white';
      resText.width = '110px';
      resText.height = '30px';
      resourceStack.addControl(resText);
      this.resourceTexts.set(res.id, resText);
    }

    // Build menu (right side)
    this.buildMenuPanel = new GUI.Rectangle('buildMenu');
    this.buildMenuPanel.width = '200px';
    this.buildMenuPanel.height = '300px';
    this.buildMenuPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.buildMenuPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.buildMenuPanel.left = '-10px';
    this.buildMenuPanel.background = 'rgba(0,0,0,0.7)';
    this.buildMenuPanel.cornerRadius = 8;
    this.buildMenuPanel.thickness = 1;
    this.buildMenuPanel.color = 'rgba(255,255,255,0.3)';
    this.buildMenuPanel.isVisible = false; // Toggle with B key
    this.genreContainer!.addControl(this.buildMenuPanel);

    const buildMainStack = new GUI.StackPanel('buildMainStack');
    buildMainStack.isVertical = true;
    buildMainStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    buildMainStack.paddingTop = '10px';
    buildMainStack.spacing = 5;
    this.buildMenuPanel.addControl(buildMainStack);

    const buildTitle = new GUI.TextBlock('buildTitle');
    buildTitle.text = '🏗️ Build';
    buildTitle.fontSize = 16;
    buildTitle.fontWeight = 'bold';
    buildTitle.color = 'white';
    buildTitle.height = '30px';
    buildMainStack.addControl(buildTitle);

    const buildStack = buildMainStack;

    const buildings = ['House', 'Barracks', 'Farm', 'Workshop', 'Tower', 'Wall'];
    for (const building of buildings) {
      const btn = GUI.Button.CreateSimpleButton(`build_${building}`, building);
      btn.width = '180px';
      btn.height = '30px';
      btn.color = 'white';
      btn.fontSize = 13;
      btn.background = 'rgba(60,60,80,0.8)';
      btn.cornerRadius = 4;
      btn.onPointerUpObservable.add(() => {
        this.onBuildSelected?.(building.toLowerCase());
      });
      buildStack.addControl(btn);
    }

    // Unit info (bottom-center)
    this.unitInfoPanel = new GUI.Rectangle('unitInfo');
    this.unitInfoPanel.width = '400px';
    this.unitInfoPanel.height = '80px';
    this.unitInfoPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.unitInfoPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.unitInfoPanel.top = '-10px';
    this.unitInfoPanel.background = 'rgba(0,0,0,0.7)';
    this.unitInfoPanel.cornerRadius = 8;
    this.unitInfoPanel.thickness = 1;
    this.unitInfoPanel.color = 'rgba(255,255,255,0.3)';
    this.unitInfoPanel.isVisible = false;
    this.genreContainer!.addControl(this.unitInfoPanel);

    this.unitInfoText = new GUI.TextBlock('unitInfoText');
    this.unitInfoText.text = 'Select a unit or building';
    this.unitInfoText.fontSize = 13;
    this.unitInfoText.color = 'white';
    this.unitInfoPanel.addControl(this.unitInfoText);
  }

  // ==========================================
  // Platformer HUD
  // ==========================================
  private createPlatformerHUD(): void {
    // Top bar with lives, collectibles, timer
    this.platformerPanel = new GUI.Rectangle('platformerPanel');
    this.platformerPanel.width = '100%';
    this.platformerPanel.height = '50px';
    this.platformerPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.platformerPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.platformerPanel.background = 'rgba(0,0,0,0.4)';
    this.platformerPanel.thickness = 0;
    this.genreContainer!.addControl(this.platformerPanel);

    // Horizontal stack distributes lives / collectibles / timer evenly
    const platformerStack = new GUI.StackPanel('platformerStack');
    platformerStack.isVertical = false;
    platformerStack.width = '100%';
    platformerStack.height = '100%';
    platformerStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.platformerPanel.addControl(platformerStack);

    // Lives (left)
    this.livesText = new GUI.TextBlock('lives');
    this.livesText.text = '❤️ x 3';
    this.livesText.fontSize = 22;
    this.livesText.fontWeight = 'bold';
    this.livesText.color = 'white';
    this.livesText.outlineWidth = 2;
    this.livesText.outlineColor = 'black';
    this.livesText.width = '33%';
    this.livesText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.livesText.paddingLeft = '20px';
    platformerStack.addControl(this.livesText);

    // Collectibles (center)
    this.collectiblesText = new GUI.TextBlock('collectibles');
    this.collectiblesText.text = '⭐ 0 / 100';
    this.collectiblesText.fontSize = 22;
    this.collectiblesText.fontWeight = 'bold';
    this.collectiblesText.color = '#FFD700';
    this.collectiblesText.outlineWidth = 2;
    this.collectiblesText.outlineColor = 'black';
    this.collectiblesText.width = '34%';
    platformerStack.addControl(this.collectiblesText);

    // Timer (right)
    this.timerText = new GUI.TextBlock('timer');
    this.timerText.text = '⏱️ 0:00';
    this.timerText.fontSize = 22;
    this.timerText.fontWeight = 'bold';
    this.timerText.color = 'white';
    this.timerText.outlineWidth = 2;
    this.timerText.outlineColor = 'black';
    this.timerText.width = '33%';
    this.timerText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.timerText.paddingRight = '20px';
    platformerStack.addControl(this.timerText);
  }

  // ==========================================
  // Fighting HUD
  // ==========================================
  private createFightingHUD(): void {
    // Top bar container
    const topBar = new GUI.Rectangle('fightTopBar');
    topBar.width = '100%';
    topBar.height = '80px';
    topBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topBar.background = 'rgba(0,0,0,0.5)';
    topBar.thickness = 0;
    this.genreContainer!.addControl(topBar);

    // Player 1 health bar (left)
    this.player1NameText = new GUI.TextBlock('p1Name');
    this.player1NameText.text = 'Player 1';
    this.player1NameText.fontSize = 14;
    this.player1NameText.fontWeight = 'bold';
    this.player1NameText.color = 'white';
    this.player1NameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.player1NameText.left = '20px';
    this.player1NameText.top = '5px';
    this.player1NameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.player1NameText.width = '200px';
    this.player1NameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    topBar.addControl(this.player1NameText);

    this.player1HealthBar = new GUI.Rectangle('p1HealthBg');
    this.player1HealthBar.width = '350px';
    this.player1HealthBar.height = '25px';
    this.player1HealthBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.player1HealthBar.left = '20px';
    this.player1HealthBar.top = '25px';
    this.player1HealthBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.player1HealthBar.background = 'rgba(80,0,0,0.8)';
    this.player1HealthBar.cornerRadius = 4;
    this.player1HealthBar.thickness = 1;
    this.player1HealthBar.color = 'rgba(255,255,255,0.3)';
    topBar.addControl(this.player1HealthBar);

    this.player1HealthFill = new GUI.Rectangle('p1HealthFill');
    this.player1HealthFill.width = '100%';
    this.player1HealthFill.height = '100%';
    this.player1HealthFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.player1HealthFill.background = '#22CC44';
    this.player1HealthFill.cornerRadius = 4;
    this.player1HealthFill.thickness = 0;
    this.player1HealthBar.addControl(this.player1HealthFill);

    // Player 2 health bar (right, mirrored)
    this.player2NameText = new GUI.TextBlock('p2Name');
    this.player2NameText.text = 'Player 2';
    this.player2NameText.fontSize = 14;
    this.player2NameText.fontWeight = 'bold';
    this.player2NameText.color = 'white';
    this.player2NameText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.player2NameText.left = '-20px';
    this.player2NameText.top = '5px';
    this.player2NameText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.player2NameText.width = '200px';
    this.player2NameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    topBar.addControl(this.player2NameText);

    this.player2HealthBar = new GUI.Rectangle('p2HealthBg');
    this.player2HealthBar.width = '350px';
    this.player2HealthBar.height = '25px';
    this.player2HealthBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.player2HealthBar.left = '-20px';
    this.player2HealthBar.top = '25px';
    this.player2HealthBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.player2HealthBar.background = 'rgba(80,0,0,0.8)';
    this.player2HealthBar.cornerRadius = 4;
    this.player2HealthBar.thickness = 1;
    this.player2HealthBar.color = 'rgba(255,255,255,0.3)';
    topBar.addControl(this.player2HealthBar);

    this.player2HealthFill = new GUI.Rectangle('p2HealthFill');
    this.player2HealthFill.width = '100%';
    this.player2HealthFill.height = '100%';
    this.player2HealthFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.player2HealthFill.background = '#CC2222';
    this.player2HealthFill.cornerRadius = 4;
    this.player2HealthFill.thickness = 0;
    this.player2HealthBar.addControl(this.player2HealthFill);

    // Round and timer (center top) — vertical stack for proper flow
    const centerStack = new GUI.StackPanel('fightCenterStack');
    centerStack.isVertical = true;
    centerStack.width = '100px';
    centerStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    centerStack.paddingTop = '5px';
    topBar.addControl(centerStack);

    this.roundText = new GUI.TextBlock('roundText');
    this.roundText.text = 'Round 1';
    this.roundText.fontSize = 16;
    this.roundText.fontWeight = 'bold';
    this.roundText.color = '#FFD700';
    this.roundText.height = '22px';
    centerStack.addControl(this.roundText);

    this.fightTimerText = new GUI.TextBlock('fightTimer');
    this.fightTimerText.text = '99';
    this.fightTimerText.fontSize = 32;
    this.fightTimerText.fontWeight = 'bold';
    this.fightTimerText.color = 'white';
    this.fightTimerText.height = '42px';
    centerStack.addControl(this.fightTimerText);

    // Special meter (bottom-left)
    this.specialMeterBar = new GUI.Rectangle('specialMeterBg');
    this.specialMeterBar.width = '300px';
    this.specialMeterBar.height = '15px';
    this.specialMeterBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.specialMeterBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.specialMeterBar.left = '20px';
    this.specialMeterBar.top = '-20px';
    this.specialMeterBar.background = 'rgba(0,0,80,0.8)';
    this.specialMeterBar.cornerRadius = 3;
    this.specialMeterBar.thickness = 1;
    this.specialMeterBar.color = 'rgba(100,100,255,0.5)';
    this.genreContainer!.addControl(this.specialMeterBar);

    this.specialMeterFill = new GUI.Rectangle('specialMeterFill');
    this.specialMeterFill.width = '0%';
    this.specialMeterFill.height = '100%';
    this.specialMeterFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.specialMeterFill.background = '#4444FF';
    this.specialMeterFill.cornerRadius = 3;
    this.specialMeterFill.thickness = 0;
    this.specialMeterBar.addControl(this.specialMeterFill);

    // Combo counter (center)
    this.comboText = new GUI.TextBlock('comboText');
    this.comboText.text = '';
    this.comboText.fontSize = 36;
    this.comboText.fontWeight = 'bold';
    this.comboText.color = '#FFD700';
    this.comboText.outlineWidth = 3;
    this.comboText.outlineColor = 'black';
    this.comboText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.comboText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.comboText.left = '-40px';
    this.comboText.isVisible = false;
    this.genreContainer!.addControl(this.comboText);
  }

  // ==========================================
  // Puzzle HUD
  // ==========================================
  private createPuzzleHUD(): void {
    this.puzzlePanel = new GUI.Rectangle('puzzlePanel');
    this.puzzlePanel.width = '250px';
    this.puzzlePanel.height = '120px';
    this.puzzlePanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.puzzlePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.puzzlePanel.left = '-15px';
    this.puzzlePanel.top = '15px';
    this.puzzlePanel.background = 'rgba(0,0,0,0.6)';
    this.puzzlePanel.cornerRadius = 10;
    this.puzzlePanel.thickness = 1;
    this.puzzlePanel.color = 'rgba(255,255,255,0.2)';
    this.genreContainer!.addControl(this.puzzlePanel);

    const puzzleStack = new GUI.StackPanel('puzzleStack');
    puzzleStack.spacing = 8;
    this.puzzlePanel.addControl(puzzleStack);

    // Timer
    this.puzzleTimerText = new GUI.TextBlock('puzzleTimer');
    this.puzzleTimerText.text = '⏱️ 0:00';
    this.puzzleTimerText.fontSize = 20;
    this.puzzleTimerText.fontWeight = 'bold';
    this.puzzleTimerText.color = 'white';
    this.puzzleTimerText.height = '30px';
    puzzleStack.addControl(this.puzzleTimerText);

    // Moves
    this.movesText = new GUI.TextBlock('movesText');
    this.movesText.text = 'Moves: 0';
    this.movesText.fontSize = 16;
    this.movesText.color = 'rgba(255,255,255,0.8)';
    this.movesText.height = '25px';
    puzzleStack.addControl(this.movesText);

    // Hint button
    this.hintButton = GUI.Button.CreateSimpleButton('hintBtn', '💡 Hint');
    this.hintButton.width = '100px';
    this.hintButton.height = '30px';
    this.hintButton.color = 'white';
    this.hintButton.fontSize = 14;
    this.hintButton.background = 'rgba(80,80,120,0.8)';
    this.hintButton.cornerRadius = 6;
    this.hintButton.onPointerUpObservable.add(() => {
      this.onHintRequested?.();
    });
    puzzleStack.addControl(this.hintButton);
  }

  // ==========================================
  // Action RPG HUD (supplements existing UI)
  // ==========================================
  private createActionRPGHUD(): void {
    // The base BabylonGUIManager already provides most action RPG elements.
    // This adds supplemental elements like stamina bar if configured.

    if (this.config.showStaminaBar) {
      const staminaContainer = new GUI.Rectangle('staminaBg');
      staminaContainer.width = '200px';
      staminaContainer.height = '10px';
      staminaContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      staminaContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      staminaContainer.left = '20px';
      staminaContainer.top = '55px';
      staminaContainer.background = 'rgba(0,0,0,0.5)';
      staminaContainer.cornerRadius = 3;
      staminaContainer.thickness = 0;
      this.genreContainer!.addControl(staminaContainer);

      const staminaFill = new GUI.Rectangle('staminaFill');
      staminaFill.width = '100%';
      staminaFill.height = '100%';
      staminaFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      staminaFill.background = '#44AA44';
      staminaFill.cornerRadius = 3;
      staminaFill.thickness = 0;
      staminaContainer.addControl(staminaFill);
    }
  }

  // ==========================================
  // Public update methods
  // ==========================================

  /**
   * Update ammo display (FPS)
   */
  public updateAmmo(current: number, magazineSize: number, total: number): void {
    if (this.ammoText) {
      this.ammoText.text = `${current} / ${total}`;
      // Flash red when low
      if (current <= Math.floor(magazineSize * 0.25)) {
        this.ammoText.color = '#FF4444';
      } else {
        this.ammoText.color = 'white';
      }
    }
  }

  /**
   * Update weapon name (FPS)
   */
  public updateWeaponName(name: string): void {
    if (this.weaponNameText) {
      this.weaponNameText.text = name;
    }
  }

  /**
   * Update compass heading (FPS)
   */
  public updateCompass(heading: number): void {
    if (!this.compassText) return;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((heading % 360) + 360) % 360 / 45) % 8;
    this.compassText.text = `Heading: ${Math.round(heading)}° ${directions[index]}`;
  }

  /**
   * Update resource display (RTS)
   */
  public updateResource(resourceId: string, label: string, value: string): void {
    const text = this.resourceTexts.get(resourceId);
    if (text) {
      text.text = `${label}: ${value}`;
    }
  }

  /**
   * Update unit info display (RTS)
   */
  public updateUnitInfo(info: string | null): void {
    if (this.unitInfoPanel && this.unitInfoText) {
      if (info) {
        this.unitInfoText.text = info;
        this.unitInfoPanel.isVisible = true;
      } else {
        this.unitInfoPanel.isVisible = false;
      }
    }
  }

  /**
   * Toggle build menu (RTS)
   */
  public toggleBuildMenu(): void {
    if (this.buildMenuPanel) {
      this.buildMenuPanel.isVisible = !this.buildMenuPanel.isVisible;
    }
  }

  /**
   * Update lives display (Platformer)
   */
  public updateLives(lives: number): void {
    if (this.livesText) {
      this.livesText.text = `❤️ x ${lives}`;
    }
  }

  /**
   * Update collectibles display (Platformer)
   */
  public updateCollectibles(current: number, total: number): void {
    if (this.collectiblesText) {
      this.collectiblesText.text = `⭐ ${current} / ${total}`;
    }
  }

  /**
   * Update timer display (Platformer/Puzzle)
   */
  public updateTimer(seconds: number): void {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const timeStr = `${minutes}:${secs.toString().padStart(2, '0')}`;

    if (this.timerText) {
      this.timerText.text = `⏱️ ${timeStr}`;
    }
    if (this.puzzleTimerText) {
      this.puzzleTimerText.text = `⏱️ ${timeStr}`;
    }
  }

  /**
   * Update fighting health bars
   */
  public updateFighterHealth(player: 1 | 2, healthPercent: number): void {
    const fill = player === 1 ? this.player1HealthFill : this.player2HealthFill;
    if (fill) {
      const pct = Math.max(0, Math.min(1, healthPercent));
      fill.width = `${pct * 100}%`;
      // Color transitions: green -> yellow -> red
      if (pct > 0.5) {
        fill.background = '#22CC44';
      } else if (pct > 0.25) {
        fill.background = '#CCCC22';
      } else {
        fill.background = '#CC2222';
      }
    }
  }

  /**
   * Update fighter names
   */
  public updateFighterName(player: 1 | 2, name: string): void {
    const text = player === 1 ? this.player1NameText : this.player2NameText;
    if (text) {
      text.text = name;
    }
  }

  /**
   * Update special meter (Fighting)
   */
  public updateSpecialMeter(percent: number): void {
    if (this.specialMeterFill) {
      this.specialMeterFill.width = `${Math.max(0, Math.min(100, percent))}%`;
      // Glow when full
      if (percent >= 100) {
        this.specialMeterFill.background = '#8888FF';
      } else {
        this.specialMeterFill.background = '#4444FF';
      }
    }
  }

  /**
   * Show combo counter (Fighting)
   */
  public showCombo(hits: number, damage: number): void {
    if (this.comboText) {
      if (hits > 1) {
        this.comboText.text = `${hits} HIT COMBO!\n${damage} DMG`;
        this.comboText.isVisible = true;
        // Auto-hide after delay
        setTimeout(() => {
          if (this.comboText) this.comboText.isVisible = false;
        }, 2000);
      } else {
        this.comboText.isVisible = false;
      }
    }
  }

  /**
   * Update round display (Fighting)
   */
  public updateRound(round: number): void {
    if (this.roundText) {
      this.roundText.text = `Round ${round}`;
    }
  }

  /**
   * Update fight timer (Fighting)
   */
  public updateFightTimer(seconds: number): void {
    if (this.fightTimerText) {
      this.fightTimerText.text = `${Math.max(0, Math.ceil(seconds))}`;
      if (seconds <= 10) {
        this.fightTimerText.color = '#FF4444';
      } else {
        this.fightTimerText.color = 'white';
      }
    }
  }

  /**
   * Update moves counter (Puzzle)
   */
  public updateMoves(moves: number): void {
    if (this.movesText) {
      this.movesText.text = `Moves: ${moves}`;
    }
  }

  /**
   * Show reload indicator (FPS)
   */
  public showReloading(show: boolean): void {
    if (this.ammoText) {
      if (show) {
        this.ammoText.text = 'RELOADING...';
        this.ammoText.color = '#FFAA00';
      }
    }
  }

  /**
   * Get current layout type
   */
  public getLayout(): UILayout {
    return this.config.layout;
  }

  /**
   * Switch to a different layout (disposes current and recreates)
   */
  public switchLayout(newConfig: GenreUIConfig): void {
    this.dispose();
    this.config = newConfig;
    this.createGenreUI();
  }

  // Callback setters
  public setOnBuildSelected(cb: (buildingType: string) => void): void { this.onBuildSelected = cb; }
  public setOnHintRequested(cb: () => void): void { this.onHintRequested = cb; }

  /**
   * Handle genre-specific keyboard shortcuts
   */
  public handleKeyboardShortcut(key: string): boolean {
    switch (this.config.layout) {
      case 'rts':
        if (key.toLowerCase() === 'b') {
          this.toggleBuildMenu();
          return true;
        }
        break;
    }
    return false;
  }

  /**
   * Dispose all genre-specific UI elements
   */
  public dispose(): void {
    if (this.genreContainer) {
      this.advancedTexture.removeControl(this.genreContainer);
      this.genreContainer.dispose();
      this.genreContainer = null;
    }

    // Clear references
    this.crosshair = null;
    this.ammoText = null;
    this.ammoPanel = null;
    this.weaponNameText = null;
    this.compassPanel = null;
    this.compassText = null;
    this.armorBar = null;
    this.armorFill = null;
    this.armorText = null;
    this.resourcePanel = null;
    this.resourceTexts.clear();
    this.buildMenuPanel = null;
    this.unitInfoPanel = null;
    this.unitInfoText = null;
    this.livesText = null;
    this.collectiblesText = null;
    this.timerText = null;
    this.platformerPanel = null;
    this.player1HealthBar = null;
    this.player1HealthFill = null;
    this.player1NameText = null;
    this.player2HealthBar = null;
    this.player2HealthFill = null;
    this.player2NameText = null;
    this.specialMeterBar = null;
    this.specialMeterFill = null;
    this.comboText = null;
    this.roundText = null;
    this.fightTimerText = null;
    this.puzzleTimerText = null;
    this.movesText = null;
    this.hintButton = null;
    this.puzzlePanel = null;
  }
}
