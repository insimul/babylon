/**
 * MainMenuScreen - Title/intro screen with animated background
 *
 * Displays the game title with an animated particle effect background and
 * menu options: Continue, New Game, Load Game, Controls, Exit.
 * Continue and Load Game are disabled when no saves exist.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
  TextWrapping,
  ScrollViewer,
  Image,
} from "@babylonjs/gui";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlaythroughInfo {
  id: string;
  name: string;
  status: string;
  lastPlayedAt?: string;
  createdAt: string;
  playtime: number;
  actionsCount: number;
  /** Where this playthrough lives: 'local' (localStorage) or 'cloud' (API server) */
  source?: "local" | "cloud";
}

export interface MainMenuCallbacks {
  /** Fetch all playthroughs for this world */
  getPlaythroughs: () => Promise<PlaythroughInfo[]>;
  /** Create a new playthrough and return its ID */
  onNewGame: () => Promise<string | null>;
  /** Continue / load a specific playthrough */
  onContinue: (playthroughId: string) => void;
  /** Go back to the editor / world list */
  onBack: () => void;
  /** Delete a playthrough/save */
  onDeleteSave?: (playthroughId: string) => Promise<boolean>;
  /** Sign in to cloud saves (optional — only in standalone/electron mode) */
  onSignIn?: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Sign out of cloud saves */
  onSignOut?: () => void;
  /** Check if the user is currently signed in */
  isSignedIn?: () => boolean;
  /** Get the currently signed-in username */
  getUsername?: () => string | null;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#f5f0e8",
  overlayGradientTop: "rgba(245, 240, 232, 0.97)",
  overlayGradientBot: "rgba(235, 228, 218, 0.98)",
  cardBg: "rgba(0, 0, 0, 0.04)",
  cardBorder: "rgba(0, 0, 0, 0.08)",
  cardHover: "rgba(0, 0, 0, 0.08)",
  textPrimary: "#2c2416",
  textSecondary: "#6b5d4d",
  textMuted: "#9a8b78",
  textDisabled: "#c4b8a8",
  accent: "#7a5c3a",
  accentGreen: "#4a7a3a",
  accentYellow: "#b8941e",
  accentRed: "#a84232",
  divider: "rgba(0, 0, 0, 0.08)",
  disabled: "rgba(0, 0, 0, 0.02)",
  disabledBorder: "rgba(0, 0, 0, 0.05)",
  panelBg: "rgba(240, 234, 224, 0.98)",
};

// ─── Animated star field (canvas-based) ─────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
}

// ─── Control reference ──────────────────────────────────────────────────────

const CONTROLS_DATA = [
  { key: "W A S D / Arrows", action: "Move / Turn" },
  { key: "Q / E", action: "Strafe Left / Right" },
  { key: "Space", action: "Jump" },
  { key: "Shift", action: "Sprint (hold)" },
  { key: "CapsLock", action: "Toggle Sprint" },
  { key: "B", action: "Cycle Vehicle" },
  { key: "Enter / Click", action: "Interact (NPC / building / object)" },
  { key: "X", action: "Examine Object" },
  { key: "Y", action: "Eavesdrop" },
  { key: "T (hold)", action: "Push-to-Talk" },
  { key: "F", action: "Attack / Respawn" },
  { key: "R", action: "Target Enemy" },
  { key: "C", action: "Camera Viewfinder" },
  { key: "M", action: "Game Menu" },
  { key: "F5", action: "Quick Save" },
  { key: "F9", action: "Quick Load" },
  { key: "Shift+V", action: "Toggle VR Mode" },
];

// ─── Main class ─────────────────────────────────────────────────────────────

export class MainMenuScreen {
  private advancedTexture: AdvancedDynamicTexture;
  private callbacks: MainMenuCallbacks;
  private worldName: string;

  private overlay: Rectangle | null = null;
  private playthroughs: PlaythroughInfo[] = [];
  private _isOpen = false;
  private _view: "main" | "load" | "controls" | "signin" = "main";

  // HTML-based sign-in overlay elements
  private signInOverlay: HTMLDivElement | null = null;

  // Animated star background
  private stars: Star[] = [];
  private starCanvas: HTMLCanvasElement | null = null;
  private starCtx: CanvasRenderingContext2D | null = null;
  private starAnimId: number = 0;
  private starImage: Image | null = null;

  constructor(
    advancedTexture: AdvancedDynamicTexture,
    worldName: string,
    callbacks: MainMenuCallbacks,
  ) {
    this.advancedTexture = advancedTexture;
    this.worldName = worldName;
    this.callbacks = callbacks;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async show(): Promise<void> {
    this._isOpen = true;
    this._view = "main";

    // Fetch playthroughs
    try {
      this.playthroughs = await this.callbacks.getPlaythroughs();
    } catch {
      this.playthroughs = [];
    }

    this.buildUI();
  }

  hide(): void {
    this._isOpen = false;
    this.stopStarAnimation();
    this.removeSignInOverlay();
    if (this.overlay) {
      this.advancedTexture.removeControl(this.overlay);
      this.overlay = null;
    }
  }

  private removeSignInOverlay(): void {
    if (this.signInOverlay) {
      this.signInOverlay.remove();
      this.signInOverlay = null;
    }
  }

  dispose(): void {
    this.hide();
  }

  // ─── Star-field animation ───────────────────────────────────────────────

  private initStarField(): void {
    this.stopStarAnimation();

    const width = 800;
    const height = 600;

    this.starCanvas = document.createElement("canvas");
    this.starCanvas.width = width;
    this.starCanvas.height = height;
    this.starCtx = this.starCanvas.getContext("2d");

    // Generate stars
    this.stars = [];
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
        speed: Math.random() * 0.3 + 0.05,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Create Babylon GUI Image control from canvas
    this.starImage = new Image("starFieldBg", "");
    this.starImage.width = 1;
    this.starImage.height = 1;
    this.starImage.stretch = Image.STRETCH_FILL;
    this.starImage.zIndex = -1;

    if (this.overlay) {
      this.overlay.addControl(this.starImage);
    }

    let time = 0;
    const animate = () => {
      if (!this.starCtx || !this.starCanvas) return;
      time += 0.016;

      const ctx = this.starCtx;
      // Dark gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "rgb(8, 12, 28)");
      grad.addColorStop(0.5, "rgb(6, 8, 18)");
      grad.addColorStop(1, "rgb(4, 4, 10)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw stars with twinkling
      for (const star of this.stars) {
        const twinkle = Math.sin(time * star.speed * 4 + star.phase) * 0.3 + 0.7;
        const alpha = star.opacity * twinkle;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 230, 255, ${alpha})`;
        ctx.fill();

        // Occasional bright glow
        if (star.size > 1.5) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 200, 255, ${alpha * 0.08})`;
          ctx.fill();
        }
      }

      // Subtle nebula-like glow patches
      const drawGlow = (gx: number, gy: number, r: number, color: string, a: number) => {
        const pulse = Math.sin(time * 0.3 + gx * 0.01) * 0.15 + 0.85;
        const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        grd.addColorStop(0, color.replace("A)", `${a * pulse})`));
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      };
      drawGlow(200, 150, 180, "rgba(60, 80, 180, A)", 0.06);
      drawGlow(600, 400, 200, "rgba(100, 50, 140, A)", 0.04);
      drawGlow(400, 300, 150, "rgba(40, 120, 160, A)", 0.03);

      // Update the Babylon Image from canvas
      if (this.starImage) {
        this.starImage.source = this.starCanvas.toDataURL("image/png");
      }

      this.starAnimId = requestAnimationFrame(animate);
    };

    this.starAnimId = requestAnimationFrame(animate);
  }

  private stopStarAnimation(): void {
    if (this.starAnimId) {
      cancelAnimationFrame(this.starAnimId);
      this.starAnimId = 0;
    }
    this.starCanvas = null;
    this.starCtx = null;
    this.starImage = null;
  }

  // ─── UI Building ────────────────────────────────────────────────────────

  private buildUI(): void {
    // Remove previous overlay
    if (this.overlay) {
      this.stopStarAnimation();
      this.advancedTexture.removeControl(this.overlay);
    }

    // Full-screen overlay
    this.overlay = new Rectangle("mainMenuOverlay");
    this.overlay.width = 1;
    this.overlay.height = 1;
    this.overlay.thickness = 0;
    this.overlay.background = COLORS.bg;
    this.overlay.zIndex = 9000;
    this.advancedTexture.addControl(this.overlay);

    // Simple solid background — no animated star field (was causing massive
    // PNG data URL generation every frame via canvas.toDataURL)

    // Clean up HTML overlay when switching views
    this.removeSignInOverlay();

    if (this._view === "main") {
      this.renderMainView();
    } else if (this._view === "load") {
      this.renderLoadView();
    } else if (this._view === "controls") {
      this.renderControlsView();
    } else if (this._view === "signin") {
      this.renderSignInView();
    }
  }

  // ─── Main title view ───────────────────────────────────────────────────

  private renderMainView(): void {
    if (!this.overlay) return;

    const container = new StackPanel("mainMenuContainer");
    container.width = "420px";
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.overlay.addControl(container);

    // ── Game title ──
    const titleContainer = new Rectangle("titleContainer");
    titleContainer.height = "120px";
    titleContainer.thickness = 0;
    titleContainer.background = "transparent";
    container.addControl(titleContainer);

    const title = new TextBlock("gameTitle", this.worldName);
    title.color = COLORS.textPrimary;
    title.fontSize = 48;
    title.fontWeight = "bold";
    title.fontFamily = "Georgia, 'Times New Roman', serif";
    title.textWrapping = TextWrapping.Ellipsis;
    title.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    titleContainer.addControl(title);

    // Subtle glow/shadow effect via a duplicate text behind
    const titleGlow = new TextBlock("gameTitleGlow", this.worldName);
    titleGlow.color = "rgba(66, 133, 244, 0.3)";
    titleGlow.fontSize = 48;
    titleGlow.fontWeight = "bold";
    titleGlow.fontFamily = "Georgia, 'Times New Roman', serif";
    titleGlow.textWrapping = TextWrapping.Ellipsis;
    titleGlow.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    titleGlow.top = "2px";
    titleGlow.left = "2px";
    titleGlow.zIndex = -1;
    titleContainer.addControl(titleGlow);

    // Decorative line under title
    const divider = new Rectangle("titleDivider");
    divider.width = "200px";
    divider.height = "2px";
    divider.thickness = 0;
    divider.background = "rgba(66, 133, 244, 0.4)";
    divider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(divider);

    // Spacer
    this.addSpacer(container, "40px");

    // ── Menu buttons ──
    const mostRecent = this.getMostRecentPlaythrough();
    const hasPlaythroughs = this.playthroughs.length > 0;

    // Continue
    this.addTitleMenuButton(
      container,
      "Continue",
      COLORS.accentGreen,
      !!mostRecent,
      () => {
        if (mostRecent) {
          this.hide();
          this.callbacks.onContinue(mostRecent.id);
        }
      },
    );

    // New Game
    this.addTitleMenuButton(
      container,
      "New Game",
      COLORS.accent,
      true,
      async () => {
        this.showLoadingState("Creating new game...");
        const playthroughId = await this.callbacks.onNewGame();
        if (playthroughId) {
          this.hide();
          this.callbacks.onContinue(playthroughId);
        } else {
          this.buildUI();
        }
      },
    );

    // Load Game
    this.addTitleMenuButton(
      container,
      "Load Game",
      COLORS.accentYellow,
      hasPlaythroughs,
      () => {
        this._view = "load";
        this.buildUI();
      },
    );

    // Controls
    this.addTitleMenuButton(
      container,
      "Controls",
      COLORS.textSecondary,
      true,
      () => {
        this._view = "controls";
        this.buildUI();
      },
    );

    // Spacer before exit
    this.addSpacer(container, "16px");

    // Exit
    this.addTitleMenuButton(
      container,
      "Exit",
      COLORS.textMuted,
      true,
      () => {
        this.hide();
        this.callbacks.onBack();
      },
    );

    // ── Cloud saves sign-in status ──
    this.addSpacer(container, "24px");

    if (this.callbacks.onSignIn) {
      const signedIn = this.callbacks.isSignedIn?.() ?? false;

      if (signedIn) {
        const username = this.callbacks.getUsername?.() || "User";
        const signedInRow = new StackPanel("signedInRow");
        signedInRow.isVertical = false;
        signedInRow.height = "24px";
        signedInRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.addControl(signedInRow);

        const statusText = new TextBlock("signedInStatus", `Signed in as ${username}`);
        statusText.color = COLORS.accentGreen;
        statusText.fontSize = 12;
        statusText.width = "200px";
        statusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        signedInRow.addControl(statusText);

        const signOutBtn = Button.CreateSimpleButton("signOutBtn", "Sign Out");
        signOutBtn.width = "80px";
        signOutBtn.height = "22px";
        signOutBtn.color = COLORS.textMuted;
        signOutBtn.background = "transparent";
        signOutBtn.thickness = 0;
        signOutBtn.fontSize = 11;
        signOutBtn.onPointerClickObservable.add(() => {
          this.callbacks.onSignOut?.();
          this.buildUI(); // Refresh to show signed-out state
        });
        signedInRow.addControl(signOutBtn);
      } else {
        const signInBtn = Button.CreateSimpleButton(
          "cloudSignInBtn",
          "Sign In for Cloud Saves",
        );
        signInBtn.width = "220px";
        signInBtn.height = "28px";
        signInBtn.color = COLORS.accent;
        signInBtn.background = "transparent";
        signInBtn.thickness = 0;
        signInBtn.fontSize = 12;
        signInBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        signInBtn.onPointerEnterObservable.add(() => {
          signInBtn.color = "#FFFFFF";
        });
        signInBtn.onPointerOutObservable.add(() => {
          signInBtn.color = COLORS.accent;
        });
        signInBtn.onPointerClickObservable.add(() => {
          this._view = "signin";
          this.buildUI();
        });
        container.addControl(signInBtn);
      }
    }

    // Version / footer
    this.addSpacer(container, "16px");
    const footer = new TextBlock("footer", "Press any button to begin");
    footer.color = COLORS.textMuted;
    footer.fontSize = 12;
    footer.height = "20px";
    footer.alpha = 0.6;
    container.addControl(footer);
  }

  // ─── Load game view ────────────────────────────────────────────────────

  private renderLoadView(): void {
    if (!this.overlay) return;

    const container = new StackPanel("loadMenuContainer");
    container.width = "500px";
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.overlay.addControl(container);

    // Header with back button
    this.addSubViewHeader(container, "Load Game");

    this.addSpacer(container, "20px");

    // Scrollable list of playthroughs
    const scrollViewer = new ScrollViewer("loadScroll");
    scrollViewer.width = 1;
    scrollViewer.height = "400px";
    scrollViewer.thickness = 0;
    scrollViewer.barColor = COLORS.textMuted;
    scrollViewer.barBackground = COLORS.divider;
    container.addControl(scrollViewer);

    const list = new StackPanel("loadList");
    list.width = 1;
    scrollViewer.addControl(list);

    // Sort playthroughs by most recently played
    const sorted = [...this.playthroughs].sort((a, b) => {
      const dateA = a.lastPlayedAt || a.createdAt;
      const dateB = b.lastPlayedAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    for (const pt of sorted) {
      this.addPlaythroughCard(list, pt);
    }

    if (sorted.length === 0) {
      const empty = new TextBlock(
        "emptyMsg",
        "No playthroughs found.\nStart a New Game from the main menu.",
      );
      empty.color = COLORS.textSecondary;
      empty.fontSize = 14;
      empty.height = "60px";
      empty.textWrapping = TextWrapping.WordWrap;
      list.addControl(empty);
    }
  }

  // ─── Controls view ─────────────────────────────────────────────────────

  private renderControlsView(): void {
    if (!this.overlay) return;

    const container = new StackPanel("controlsContainer");
    container.width = "500px";
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.overlay.addControl(container);

    // Header with back button
    this.addSubViewHeader(container, "Controls");

    this.addSpacer(container, "20px");

    // Scrollable controls list
    const scrollViewer = new ScrollViewer("controlsScroll");
    scrollViewer.width = 1;
    scrollViewer.height = "420px";
    scrollViewer.thickness = 0;
    scrollViewer.barColor = COLORS.textMuted;
    scrollViewer.barBackground = COLORS.divider;
    container.addControl(scrollViewer);

    const list = new StackPanel("controlsList");
    list.width = 1;
    scrollViewer.addControl(list);

    for (let i = 0; i < CONTROLS_DATA.length; i++) {
      const ctrl = CONTROLS_DATA[i];
      this.addControlRow(list, ctrl.key, ctrl.action, i % 2 === 0);
    }
  }

  private addControlRow(
    parent: StackPanel,
    key: string,
    action: string,
    alternate: boolean,
  ): void {
    const row = new Rectangle(`ctrlRow_${key}`);
    row.width = 1;
    row.height = "38px";
    row.thickness = 0;
    row.background = alternate ? "rgba(255, 255, 255, 0.03)" : "transparent";
    parent.addControl(row);

    // Key badge
    const keyBadge = new Rectangle(`ctrlKey_${key}`);
    keyBadge.width = "160px";
    keyBadge.height = "28px";
    keyBadge.thickness = 1;
    keyBadge.color = "rgba(66, 133, 244, 0.4)";
    keyBadge.background = "rgba(66, 133, 244, 0.1)";
    keyBadge.cornerRadius = 4;
    keyBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    keyBadge.left = "20px";
    row.addControl(keyBadge);

    const keyText = new TextBlock(`ctrlKeyTxt_${key}`, key);
    keyText.color = COLORS.accent;
    keyText.fontSize = 13;
    keyText.fontWeight = "bold";
    keyText.fontFamily = "'Courier New', monospace";
    keyBadge.addControl(keyText);

    // Action label
    const actionText = new TextBlock(`ctrlAction_${key}`, action);
    actionText.color = COLORS.textPrimary;
    actionText.fontSize = 14;
    actionText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    actionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    actionText.left = "200px";
    row.addControl(actionText);
  }

  // ─── Shared sub-view header ─────────────────────────────────────────────

  private addSubViewHeader(parent: StackPanel, title: string): void {
    const header = new StackPanel(`${title}Header`);
    header.isVertical = false;
    header.height = "50px";
    header.width = 1;
    parent.addControl(header);

    // Back arrow button
    const backBtn = Button.CreateSimpleButton("subViewBackBtn", "\u2190 Back");
    backBtn.width = "100px";
    backBtn.height = "40px";
    backBtn.color = COLORS.textSecondary;
    backBtn.background = "transparent";
    backBtn.thickness = 0;
    backBtn.fontSize = 14;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.onPointerEnterObservable.add(() => {
      backBtn.color = COLORS.textPrimary;
    });
    backBtn.onPointerOutObservable.add(() => {
      backBtn.color = COLORS.textSecondary;
    });
    backBtn.onPointerClickObservable.add(() => {
      this._view = "main";
      this.buildUI();
    });
    header.addControl(backBtn);

    const titleBlock = new TextBlock("subViewTitle", title);
    titleBlock.color = COLORS.textPrimary;
    titleBlock.fontSize = 24;
    titleBlock.fontWeight = "bold";
    titleBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    header.addControl(titleBlock);

    // Spacer for symmetry
    const spacerRight = new Rectangle("spacerRight");
    spacerRight.width = "100px";
    spacerRight.thickness = 0;
    spacerRight.background = "transparent";
    header.addControl(spacerRight);
  }

  // ─── UI Components ──────────────────────────────────────────────────────

  private addPlaythroughCard(parent: StackPanel, pt: PlaythroughInfo): void {
    const card = new Rectangle(`ptCard_${pt.id}`);
    card.width = 1;
    card.height = "80px";
    card.thickness = 1;
    card.color = COLORS.cardBorder;
    card.background = COLORS.cardBg;
    card.cornerRadius = 8;
    card.paddingBottom = "8px";
    parent.addControl(card);

    const inner = new StackPanel(`ptInner_${pt.id}`);
    inner.width = 1;
    inner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inner.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    inner.paddingLeft = "16px";
    card.addControl(inner);

    // Name
    const name = new TextBlock(
      `ptName_${pt.id}`,
      pt.name || "Playthrough",
    );
    name.color = COLORS.textPrimary;
    name.fontSize = 16;
    name.fontWeight = "bold";
    name.height = "24px";
    name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    name.left = "16px";
    inner.addControl(name);

    // Source badge (local/cloud)
    if (pt.source) {
      const badge = new Rectangle(`ptBadge_${pt.id}`);
      badge.width = "52px";
      badge.height = "18px";
      badge.thickness = 1;
      badge.cornerRadius = 4;
      badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      badge.top = "8px";
      badge.left = "-12px";
      badge.color =
        pt.source === "cloud"
          ? "rgba(66, 133, 244, 0.5)"
          : "rgba(154, 160, 166, 0.5)";
      badge.background =
        pt.source === "cloud"
          ? "rgba(66, 133, 244, 0.12)"
          : "rgba(154, 160, 166, 0.08)";
      card.addControl(badge);

      const badgeText = new TextBlock(
        `ptBadgeTxt_${pt.id}`,
        pt.source === "cloud" ? "Cloud" : "Local",
      );
      badgeText.color =
        pt.source === "cloud" ? COLORS.accent : COLORS.textSecondary;
      badgeText.fontSize = 10;
      badge.addControl(badgeText);
    }

    // Details line
    const details: string[] = [];
    if (pt.status) details.push(pt.status);
    details.push(this.formatLastPlayed(pt.lastPlayedAt || pt.createdAt));
    if (pt.playtime) details.push(this.formatPlaytime(pt.playtime));

    const detailText = new TextBlock(
      `ptDetail_${pt.id}`,
      details.join("  \u2022  "),
    );
    detailText.color = COLORS.textSecondary;
    detailText.fontSize = 12;
    detailText.height = "20px";
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.left = "16px";
    inner.addControl(detailText);

    // Delete button (right side)
    let isHoveringDelete = false;
    if (this.callbacks.onDeleteSave) {
      const deleteBtn = Button.CreateSimpleButton(`ptDel_${pt.id}`, "\u{1F5D1}");
      deleteBtn.width = "32px";
      deleteBtn.height = "32px";
      deleteBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      deleteBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      deleteBtn.top = "4px";
      deleteBtn.left = "-12px";
      deleteBtn.color = COLORS.textMuted;
      deleteBtn.background = "transparent";
      deleteBtn.thickness = 0;
      deleteBtn.fontSize = 16;
      deleteBtn.isPointerBlocker = true;
      deleteBtn.onPointerEnterObservable.add(() => {
        isHoveringDelete = true;
        deleteBtn.color = "#FF6B6B";
        card.background = COLORS.cardBg; // Reset card hover when entering delete btn
      });
      deleteBtn.onPointerOutObservable.add(() => {
        isHoveringDelete = false;
        deleteBtn.color = COLORS.textMuted;
      });
      deleteBtn.onPointerClickObservable.add(async () => {
        // Confirm deletion
        const confirmed = await this.showDeleteConfirmation(pt.name || 'this save');
        if (!confirmed) return;
        const deleted = await this.callbacks.onDeleteSave!(pt.id);
        if (deleted) {
          // Remove from list and re-render
          this.playthroughs = this.playthroughs.filter(p => p.id !== pt.id);
          this.clearOverlay();
          this.renderLoadView();
        }
      });
      card.addControl(deleteBtn);
    }

    // Hover effects (skip when hovering the delete button)
    card.onPointerEnterObservable.add(() => {
      if (!isHoveringDelete) card.background = COLORS.cardHover;
    });
    card.onPointerOutObservable.add(() => {
      card.background = COLORS.cardBg;
    });

    // Click to load
    card.onPointerClickObservable.add(() => {
      this.hide();
      this.callbacks.onContinue(pt.id);
    });
  }

  private addTitleMenuButton(
    parent: StackPanel,
    label: string,
    accentColor: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const card = new Rectangle(`menuBtn_${label}`);
    card.width = 1;
    card.height = "54px";
    card.thickness = 1;
    card.color = enabled ? COLORS.cardBorder : COLORS.disabledBorder;
    card.background = enabled ? COLORS.cardBg : COLORS.disabled;
    card.cornerRadius = 6;
    card.paddingBottom = "6px";
    parent.addControl(card);

    // Accent bar on the left
    const accentBar = new Rectangle(`accent_${label}`);
    accentBar.width = "3px";
    accentBar.height = 1;
    accentBar.thickness = 0;
    accentBar.background = enabled ? accentColor : COLORS.textDisabled;
    accentBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.addControl(accentBar);

    const labelText = new TextBlock(`btnLabel_${label}`, label);
    labelText.color = enabled ? COLORS.textPrimary : COLORS.textDisabled;
    labelText.fontSize = 18;
    labelText.fontWeight = "600";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    labelText.left = "24px";
    card.addControl(labelText);

    if (!enabled) {
      // Show "No saves" hint for disabled items
      const hint = new TextBlock(`btnHint_${label}`, "No saves");
      hint.color = COLORS.textDisabled;
      hint.fontSize = 11;
      hint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      hint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      hint.left = "-24px";
      card.addControl(hint);
    }

    if (enabled) {
      // Hover effects
      card.onPointerEnterObservable.add(() => {
        card.background = COLORS.cardHover;
        card.color = accentColor;
        accentBar.background = accentColor;
        labelText.color = "#FFFFFF";
      });
      card.onPointerOutObservable.add(() => {
        card.background = COLORS.cardBg;
        card.color = COLORS.cardBorder;
        accentBar.background = accentColor;
        labelText.color = COLORS.textPrimary;
      });

      card.onPointerClickObservable.add(() => onClick());
    }
  }

  /** Clear all overlay content except the star background, then re-render. */
  private clearOverlay(): void {
    if (!this.overlay) return;
    const controls = this.overlay.children.slice();
    for (const c of controls) {
      if (c !== this.starImage) {
        this.overlay.removeControl(c);
      }
    }
  }

  /** Show a confirmation dialog for deleting a save. Returns true if confirmed. */
  private showDeleteConfirmation(saveName: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.overlay) { resolve(false); return; }

      const backdrop = new Rectangle("deleteConfirmBackdrop");
      backdrop.width = 1;
      backdrop.height = 1;
      backdrop.background = "rgba(0, 0, 0, 0.6)";
      backdrop.zIndex = 100;
      this.overlay.addControl(backdrop);

      const dialog = new Rectangle("deleteConfirmDialog");
      dialog.width = "360px";
      dialog.height = "160px";
      dialog.background = COLORS.panelBg;
      dialog.color = COLORS.cardBorder;
      dialog.thickness = 1;
      dialog.cornerRadius = 10;
      dialog.zIndex = 101;
      this.overlay.addControl(dialog);

      const content = new StackPanel("deleteConfirmContent");
      content.width = "90%";
      content.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      dialog.addControl(content);

      const msg = new TextBlock("deleteMsg", `Delete "${saveName}"?\nThis cannot be undone.`);
      msg.color = COLORS.textPrimary;
      msg.fontSize = 15;
      msg.height = "50px";
      msg.textWrapping = TextWrapping.WordWrap;
      content.addControl(msg);

      const btnRow = new StackPanel("deleteConfirmBtns");
      btnRow.isVertical = false;
      btnRow.width = 1;
      btnRow.height = "44px";
      btnRow.paddingTop = "12px";
      content.addControl(btnRow);

      const cancelBtn = Button.CreateSimpleButton("delCancel", "Cancel");
      cancelBtn.width = "120px";
      cancelBtn.height = "36px";
      cancelBtn.color = COLORS.textSecondary;
      cancelBtn.background = COLORS.cardBg;
      cancelBtn.cornerRadius = 6;
      cancelBtn.thickness = 1;
      cancelBtn.fontSize = 13;
      cancelBtn.paddingRight = "8px";
      cancelBtn.onPointerClickObservable.add(() => {
        this.overlay?.removeControl(backdrop);
        this.overlay?.removeControl(dialog);
        resolve(false);
      });
      btnRow.addControl(cancelBtn);

      const deleteBtn = Button.CreateSimpleButton("delConfirm", "Delete");
      deleteBtn.width = "120px";
      deleteBtn.height = "36px";
      deleteBtn.color = "#FFFFFF";
      deleteBtn.background = "#D32F2F";
      deleteBtn.cornerRadius = 6;
      deleteBtn.thickness = 0;
      deleteBtn.fontSize = 13;
      deleteBtn.onPointerEnterObservable.add(() => { deleteBtn.background = "#B71C1C"; });
      deleteBtn.onPointerOutObservable.add(() => { deleteBtn.background = "#D32F2F"; });
      deleteBtn.onPointerClickObservable.add(() => {
        this.overlay?.removeControl(backdrop);
        this.overlay?.removeControl(dialog);
        resolve(true);
      });
      btnRow.addControl(deleteBtn);
    });
  }

  private showLoadingState(message: string): void {
    if (!this.overlay) return;

    // Clear existing content (keep star background running)
    const controls = this.overlay.children.slice();
    for (const c of controls) {
      if (c !== this.starImage) {
        this.overlay.removeControl(c);
      }
    }

    const loadingText = new TextBlock("loadingMsg", message);
    loadingText.color = COLORS.textSecondary;
    loadingText.fontSize = 18;
    this.overlay.addControl(loadingText);
  }

  private addSpacer(parent: StackPanel, height: string): void {
    const spacer = new Rectangle(`spacer_${Math.random().toString(36).slice(2, 7)}`);
    spacer.height = height;
    spacer.thickness = 0;
    spacer.background = "transparent";
    parent.addControl(spacer);
  }

  // ─── Sign-in view (HTML overlay for text input) ────────────────────────

  private renderSignInView(): void {
    if (!this.overlay) return;

    // Show a "Signing In..." message in the Babylon overlay
    const container = new StackPanel("signInBgContainer");
    container.width = "420px";
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.overlay.addControl(container);

    this.addSubViewHeader(container, "Sign In");

    // Create an HTML overlay for the form (better text input than Babylon GUI)
    this.removeSignInOverlay();

    const overlay = document.createElement("div");
    overlay.id = "insimul-signin-overlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; pointer-events: none;
    `;

    const form = document.createElement("div");
    form.style.cssText = `
      pointer-events: all; background: rgba(245, 240, 232, 0.98);
      border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 12px;
      padding: 32px; width: 360px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    `;

    const inputStyle = `
      width: 100%; padding: 10px 12px; margin: 6px 0 16px 0;
      background: rgba(0, 0, 0, 0.04); border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 6px; color: #2c2416; font-size: 14px; outline: none;
      box-sizing: border-box;
    `;

    form.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="color: #9AA0A6; font-size: 13px;">
          Sign in to your Insimul account to access cloud saves
        </div>
      </div>
      <label style="color: #6b5d4d; font-size: 12px; display: block;">Username</label>
      <input id="signin-username" type="text" autocomplete="username"
             style="${inputStyle}" placeholder="Enter username" />
      <label style="color: #6b5d4d; font-size: 12px; display: block;">Password</label>
      <input id="signin-password" type="password" autocomplete="current-password"
             style="${inputStyle}" placeholder="Enter password" />
      <div id="signin-error" style="color: #a84232; font-size: 12px; min-height: 20px; margin-bottom: 8px;"></div>
      <button id="signin-submit" style="
        width: 100%; padding: 10px; background: #7a5c3a; color: white; border: none;
        border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
        margin-bottom: 12px;
      ">Sign In</button>
      <button id="signin-cancel" style="
        width: 100%; padding: 8px; background: transparent; color: #6b5d4d; border: none;
        border-radius: 6px; font-size: 13px; cursor: pointer;
      ">Cancel</button>
    `;

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    this.signInOverlay = overlay;

    // Focus the username input
    setTimeout(() => {
      const usernameInput = document.getElementById("signin-username") as HTMLInputElement | null;
      usernameInput?.focus();
    }, 100);

    // Wire up events
    const submitBtn = document.getElementById("signin-submit");
    const cancelBtn = document.getElementById("signin-cancel");
    const errorDiv = document.getElementById("signin-error");
    const passwordInput = document.getElementById("signin-password") as HTMLInputElement | null;

    const doSubmit = async () => {
      const username = (document.getElementById("signin-username") as HTMLInputElement)?.value?.trim();
      const password = (document.getElementById("signin-password") as HTMLInputElement)?.value;

      if (!username || !password) {
        if (errorDiv) errorDiv.textContent = "Please enter both username and password.";
        return;
      }

      if (submitBtn) {
        submitBtn.textContent = "Signing in...";
        (submitBtn as HTMLButtonElement).disabled = true;
      }

      const result = await this.callbacks.onSignIn?.(username, password);
      if (result?.success) {
        this.removeSignInOverlay();
        // Re-fetch playthroughs with new credentials and go back to main
        try {
          this.playthroughs = await this.callbacks.getPlaythroughs();
        } catch { /* ignore */ }
        this._view = "main";
        this.buildUI();
      } else {
        if (errorDiv) errorDiv.textContent = result?.error || "Sign-in failed. Please try again.";
        if (submitBtn) {
          submitBtn.textContent = "Sign In";
          (submitBtn as HTMLButtonElement).disabled = false;
        }
      }
    };

    submitBtn?.addEventListener("click", doSubmit);
    cancelBtn?.addEventListener("click", () => {
      this._view = "main";
      this.buildUI();
    });
    passwordInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSubmit();
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private getMostRecentPlaythrough(): PlaythroughInfo | null {
    if (this.playthroughs.length === 0) return null;
    return [...this.playthroughs].sort((a, b) => {
      const dateA = a.lastPlayedAt || a.createdAt;
      const dateB = b.lastPlayedAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })[0];
  }

  private formatLastPlayed(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  private formatPlaytime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m played`;
    return `${mins}m played`;
  }
}
