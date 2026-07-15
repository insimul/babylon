/**
 * PlaythroughMainMenu - Babylon.js GUI overlay for selecting/creating playthroughs
 *
 * Shown when the game starts without a pre-selected playthroughId.
 * Displays existing playthroughs and a "New Playthrough" button.
 * Once a playthrough is selected/created, it calls onSelect and the game proceeds.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Control,
  InputText,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
  TextWrapping,
} from "@babylonjs/gui";

export interface PlaythroughMenuEntry {
  id: string;
  name?: string;
  status: string;
  playtime?: number;
  actionsCount?: number;
  createdAt: string;
  lastPlayedAt?: string;
}

export interface PlaythroughMainMenuCallbacks {
  onSelect: (playthroughId: string) => void;
  onCreateNew: (name: string) => Promise<string | null>;
  onBack: () => void;
}

const COLORS = {
  bg: "rgba(12, 12, 18, 0.97)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardHover: "rgba(255, 255, 255, 0.10)",
  cardBorder: "rgba(255, 255, 255, 0.10)",
  accent: "#4285F4",
  accentHover: "#5A9BFF",
  textPrimary: "#E8EAED",
  textSecondary: "#9AA0A6",
  textMuted: "#5F6368",
  green: "#34A853",
  yellow: "#FBBC04",
  red: "#EA4335",
  inputBg: "rgba(255, 255, 255, 0.08)",
};

export class PlaythroughMainMenu {
  private advancedTexture: AdvancedDynamicTexture;
  private callbacks: PlaythroughMainMenuCallbacks;
  private overlay: Rectangle | null = null;
  private listContainer: StackPanel | null = null;
  private _isVisible = false;

  constructor(
    advancedTexture: AdvancedDynamicTexture,
    callbacks: PlaythroughMainMenuCallbacks,
  ) {
    this.advancedTexture = advancedTexture;
    this.callbacks = callbacks;
  }

  public get isVisible(): boolean {
    return this._isVisible;
  }

  public show(playthroughs: PlaythroughMenuEntry[]): void {
    if (this.overlay) {
      this.dispose();
    }
    this.buildUI(playthroughs);
    this._isVisible = true;
  }

  public dispose(): void {
    if (this.overlay) {
      this.advancedTexture.removeControl(this.overlay);
      this.overlay.dispose();
      this.overlay = null;
    }
    this.listContainer = null;
    this._isVisible = false;
  }

  private buildUI(playthroughs: PlaythroughMenuEntry[]): void {
    // Full-screen overlay
    this.overlay = new Rectangle("playthroughMenuOverlay");
    this.overlay.width = 1;
    this.overlay.height = 1;
    this.overlay.background = COLORS.bg;
    this.overlay.thickness = 0;
    this.overlay.zIndex = 200;
    this.advancedTexture.addControl(this.overlay);

    // Centered container
    const container = new Rectangle("playthroughMenuContainer");
    container.width = "560px";
    container.adaptHeightToChildren = true;
    container.thickness = 0;
    container.background = "transparent";
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.overlay.addControl(container);

    const stack = new StackPanel("playthroughMenuStack");
    stack.width = 1;
    container.addControl(stack);

    // Title
    const title = new TextBlock("ptMenuTitle");
    title.text = "SELECT PLAYTHROUGH";
    title.color = COLORS.textPrimary;
    title.fontSize = 28;
    title.fontWeight = "bold";
    title.height = "50px";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(title);

    // Subtitle
    const subtitle = new TextBlock("ptMenuSubtitle");
    subtitle.text = "Choose a playthrough to resume or start a new one";
    subtitle.color = COLORS.textSecondary;
    subtitle.fontSize = 14;
    subtitle.height = "30px";
    subtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(subtitle);

    // Spacer
    const spacer1 = new Rectangle("ptSpacer1");
    spacer1.height = "20px";
    spacer1.thickness = 0;
    spacer1.background = "transparent";
    stack.addControl(spacer1);

    // New Playthrough button row
    this.buildNewPlaythroughRow(stack);

    // Spacer
    const spacer2 = new Rectangle("ptSpacer2");
    spacer2.height = "16px";
    spacer2.thickness = 0;
    spacer2.background = "transparent";
    stack.addControl(spacer2);

    // Playthrough list
    if (playthroughs.length > 0) {
      this.buildPlaythroughList(stack, playthroughs);
    } else {
      const empty = new TextBlock("ptEmpty");
      empty.text = "No existing playthroughs";
      empty.color = COLORS.textMuted;
      empty.fontSize = 14;
      empty.height = "40px";
      empty.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(empty);
    }

    // Spacer
    const spacer3 = new Rectangle("ptSpacer3");
    spacer3.height = "20px";
    spacer3.thickness = 0;
    spacer3.background = "transparent";
    stack.addControl(spacer3);

    // Back button
    const backBtn = Button.CreateSimpleButton("ptBackBtn", "Back to Editor");
    backBtn.width = "180px";
    backBtn.height = "40px";
    backBtn.color = COLORS.textSecondary;
    backBtn.background = "transparent";
    backBtn.thickness = 1;
    backBtn.fontSize = 14;
    backBtn.cornerRadius = 6;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    backBtn.onPointerClickObservable.add(() => this.callbacks.onBack());
    backBtn.onPointerEnterObservable.add(() => {
      backBtn.color = COLORS.textPrimary;
      backBtn.background = COLORS.cardBg;
    });
    backBtn.onPointerOutObservable.add(() => {
      backBtn.color = COLORS.textSecondary;
      backBtn.background = "transparent";
    });
    stack.addControl(backBtn);
  }

  private buildNewPlaythroughRow(parent: StackPanel): void {
    const row = new Rectangle("ptNewRow");
    row.height = "50px";
    row.thickness = 0;
    row.background = "transparent";
    parent.addControl(row);

    // Input field
    const input = new InputText("ptNewName");
    input.width = "320px";
    input.height = "42px";
    input.left = "-80px";
    input.placeholderText = "Playthrough name (optional)";
    input.placeholderColor = COLORS.textMuted;
    input.color = COLORS.textPrimary;
    input.background = COLORS.inputBg;
    input.focusedBackground = "rgba(255, 255, 255, 0.12)";
    input.thickness = 1;
    input.focusedColor = COLORS.accent;
    input.fontSize = 14;
    input.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.addControl(input);

    // Create button
    const createBtn = Button.CreateSimpleButton("ptCreateBtn", "New Game");
    createBtn.width = "120px";
    createBtn.height = "42px";
    createBtn.left = "206px";
    createBtn.color = "#FFFFFF";
    createBtn.background = COLORS.accent;
    createBtn.thickness = 0;
    createBtn.fontSize = 14;
    createBtn.fontWeight = "bold";
    createBtn.cornerRadius = 6;
    createBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    const handleCreate = async () => {
      if (!createBtn.isEnabled) return;
      const name = input.text?.trim() || '';
      createBtn.isEnabled = false;
      const textBlock = createBtn.textBlock;
      if (textBlock) textBlock.text = "Creating...";
      const id = await this.callbacks.onCreateNew(name);
      if (id) {
        this.dispose();
      } else {
        createBtn.isEnabled = true;
        if (textBlock) textBlock.text = "New Game";
      }
    };
    createBtn.onPointerClickObservable.add(handleCreate);
    createBtn.onPointerEnterObservable.add(() => {
      createBtn.background = COLORS.accentHover;
    });
    createBtn.onPointerOutObservable.add(() => {
      createBtn.background = COLORS.accent;
    });
    row.addControl(createBtn);

    // Handle Enter key on input
    input.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === "Enter") {
        handleCreate();
      }
    });
  }

  private buildPlaythroughList(parent: StackPanel, playthroughs: PlaythroughMenuEntry[]): void {
    // Section header
    const header = new TextBlock("ptListHeader");
    header.text = `EXISTING PLAYTHROUGHS (${playthroughs.length})`;
    header.color = COLORS.textSecondary;
    header.fontSize = 11;
    header.fontWeight = "bold";
    header.height = "24px";
    header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.paddingLeft = "4px";
    parent.addControl(header);

    // Scrollable list
    const scrollViewer = new ScrollViewer("ptScrollViewer");
    scrollViewer.width = 1;
    scrollViewer.height = "300px";
    scrollViewer.thickness = 0;
    scrollViewer.barSize = 8;
    scrollViewer.barColor = COLORS.textMuted;
    scrollViewer.barBackground = "transparent";
    parent.addControl(scrollViewer);

    this.listContainer = new StackPanel("ptList");
    this.listContainer.width = 1;
    scrollViewer.addControl(this.listContainer);

    // Sort: active first, then by lastPlayedAt descending
    const sorted = [...playthroughs].sort((a, b) => {
      const statusOrder: Record<string, number> = { active: 0, paused: 1, completed: 2, abandoned: 3 };
      const sa = statusOrder[a.status] ?? 4;
      const sb = statusOrder[b.status] ?? 4;
      if (sa !== sb) return sa - sb;
      const da = a.lastPlayedAt || a.createdAt;
      const db = b.lastPlayedAt || b.createdAt;
      return new Date(db).getTime() - new Date(da).getTime();
    });

    for (const pt of sorted) {
      this.buildPlaythroughCard(this.listContainer, pt);
    }
  }

  private buildPlaythroughCard(parent: StackPanel, pt: PlaythroughMenuEntry): void {
    const card = new Rectangle(`ptCard_${pt.id}`);
    card.width = 1;
    card.height = "80px";
    card.background = COLORS.cardBg;
    card.thickness = 1;
    card.color = COLORS.cardBorder;
    card.cornerRadius = 8;
    card.paddingBottom = "6px";
    parent.addControl(card);

    // Name
    const name = new TextBlock(`ptName_${pt.id}`);
    name.text = pt.name || "Unnamed Playthrough";
    name.color = COLORS.textPrimary;
    name.fontSize = 16;
    name.fontWeight = "bold";
    name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    name.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    name.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    name.left = "16px";
    name.top = "14px";
    name.textWrapping = TextWrapping.Ellipsis;
    card.addControl(name);

    // Status badge
    const statusColors: Record<string, string> = {
      active: COLORS.green,
      paused: COLORS.yellow,
      completed: COLORS.accent,
      abandoned: COLORS.red,
    };
    const status = new TextBlock(`ptStatus_${pt.id}`);
    status.text = pt.status.toUpperCase();
    status.color = statusColors[pt.status] || COLORS.textMuted;
    status.fontSize = 10;
    status.fontWeight = "bold";
    status.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    status.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    status.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    status.left = "-16px";
    status.top = "18px";
    card.addControl(status);

    // Info line
    const info = new TextBlock(`ptInfo_${pt.id}`);
    const parts: string[] = [];
    if (pt.actionsCount) parts.push(`${pt.actionsCount} actions`);
    parts.push(formatDuration(pt.playtime));
    if (pt.lastPlayedAt) parts.push(`Last played ${formatDate(pt.lastPlayedAt)}`);
    else parts.push(`Started ${formatDate(pt.createdAt)}`);
    info.text = parts.join("  |  ");
    info.color = COLORS.textSecondary;
    info.fontSize = 12;
    info.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    info.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    info.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    info.left = "16px";
    info.top = "-14px";
    card.addControl(info);

    // Resume/Continue button
    if (pt.status === "active" || pt.status === "paused") {
      const resumeBtn = Button.CreateSimpleButton(`ptResume_${pt.id}`, pt.status === "active" ? "Resume" : "Continue");
      resumeBtn.width = "90px";
      resumeBtn.height = "30px";
      resumeBtn.color = "#FFFFFF";
      resumeBtn.background = COLORS.accent;
      resumeBtn.thickness = 0;
      resumeBtn.fontSize = 12;
      resumeBtn.fontWeight = "bold";
      resumeBtn.cornerRadius = 6;
      resumeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      resumeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      resumeBtn.left = "-16px";
      resumeBtn.top = "-12px";
      resumeBtn.onPointerClickObservable.add(() => {
        this.callbacks.onSelect(pt.id);
        this.dispose();
      });
      resumeBtn.onPointerEnterObservable.add(() => {
        resumeBtn.background = COLORS.accentHover;
      });
      resumeBtn.onPointerOutObservable.add(() => {
        resumeBtn.background = COLORS.accent;
      });
      card.addControl(resumeBtn);
    }

    // Hover effect on the card itself
    card.onPointerEnterObservable.add(() => {
      card.background = COLORS.cardHover;
    });
    card.onPointerOutObservable.add(() => {
      card.background = COLORS.cardBg;
    });

    // Click on card body to select (for active/paused)
    if (pt.status === "active" || pt.status === "paused") {
      card.onPointerClickObservable.add(() => {
        this.callbacks.onSelect(pt.id);
        this.dispose();
      });
    }
  }
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDate(dateString: string | undefined): string {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString();
}
