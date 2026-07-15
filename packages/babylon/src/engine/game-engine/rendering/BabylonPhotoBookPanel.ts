/**
 * BabylonPhotoBookPanel — In-game panel for browsing captured photos,
 * viewing/adding noun labels, and managing the photo collection.
 *
 * Opened with the P key (KEY_PHOTO_BOOK).
 */

import * as GUI from '@babylonjs/gui';
import type { PlayerPhoto, PhotoNounLabel } from '@shared/game-engine/types';

type ViewMode = 'grid' | 'detail';
type FilterMode = 'all' | 'favorites' | 'labeled' | 'unlabeled';

export interface PhotoBookCallbacks {
  onDeletePhoto?: (photoId: string) => void;
  onToggleFavorite?: (photoId: string) => void;
  onAddLabel?: (photoId: string, label: PhotoNounLabel) => void;
  onRemoveLabel?: (photoId: string, labelId: string) => void;
  onClose?: () => void;
}

const PANEL_WIDTH = 680;
const PANEL_HEIGHT = 560;
const THUMB_SIZE = 120;
const GRID_COLS = 4;

export class BabylonPhotoBookPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private detailContainer: GUI.Rectangle | null = null;
  private isVisible: boolean = false;

  private viewMode: ViewMode = 'grid';
  private filterMode: FilterMode = 'all';
  private photos: PlayerPhoto[] = [];
  private selectedPhoto: PlayerPhoto | null = null;
  private callbacks: PhotoBookCallbacks;

  // Filter buttons for re-styling
  private filterButtons: Map<string, GUI.Button> = new Map();

  constructor(advancedTexture: GUI.AdvancedDynamicTexture, callbacks: PhotoBookCallbacks = {}) {
    this.advancedTexture = advancedTexture;
    this.callbacks = callbacks;
    this.createPanel();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  get visible(): boolean {
    return this.isVisible;
  }

  show(): void {
    if (!this.container) return;
    this.container.isVisible = true;
    this.isVisible = true;
    this.renderContent();
  }

  hide(): void {
    if (!this.container) return;
    this.container.isVisible = false;
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  setPhotos(photos: PlayerPhoto[]): void {
    this.photos = photos;
    if (this.isVisible) this.renderContent();
  }

  // ─── Panel Construction ───────────────────────────────────────────────────

  private createPanel(): void {
    this.container = new GUI.Rectangle('photoBookContainer');
    this.container.width = `${PANEL_WIDTH}px`;
    this.container.height = `${PANEL_HEIGHT}px`;
    this.container.cornerRadius = 10;
    this.container.color = 'white';
    this.container.thickness = 2;
    this.container.background = 'rgba(0, 0, 0, 0.93)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 55;
    this.container.isVisible = false;
    this.advancedTexture.addControl(this.container);

    // Title bar
    const titleBar = new GUI.Rectangle('photoBookTitleBar');
    titleBar.width = `${PANEL_WIDTH}px`;
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(80, 50, 30, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('photoBookTitle');
    titleText.text = 'Photo Book';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = 'white';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '14px';
    this.container.addControl(titleText);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('photoBookClose', 'X');
    closeBtn.width = '36px';
    closeBtn.height = '36px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 16;
    closeBtn.fontWeight = 'bold';
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.top = '7px';
    closeBtn.left = '-8px';
    closeBtn.onPointerUpObservable.add(() => this.hide());
    this.container.addControl(closeBtn);

    // Filter buttons
    this.createFilterButtons();

    // Content scroll area
    this.scrollViewer = new GUI.ScrollViewer('photoBookScroll');
    this.scrollViewer.width = `${PANEL_WIDTH - 20}px`;
    this.scrollViewer.height = `${PANEL_HEIGHT - 130}px`;
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollViewer.top = '120px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(160, 120, 80, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 50, 50, 0.5)';
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('photoBookContent');
    this.contentStack.width = '100%';
    this.contentStack.isVertical = true;
    this.scrollViewer.addControl(this.contentStack);

    // Detail overlay (hidden initially)
    this.detailContainer = new GUI.Rectangle('photoDetailOverlay');
    this.detailContainer.width = `${PANEL_WIDTH - 20}px`;
    this.detailContainer.height = `${PANEL_HEIGHT - 60}px`;
    this.detailContainer.background = 'rgba(0, 0, 0, 0.97)';
    this.detailContainer.thickness = 0;
    this.detailContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.detailContainer.top = '-5px';
    this.detailContainer.isVisible = false;
    this.container.addControl(this.detailContainer);
  }

  private createFilterButtons(): void {
    const filterRow = new GUI.StackPanel('photoFilterRow');
    filterRow.isVertical = false;
    filterRow.height = '36px';
    filterRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    filterRow.top = '58px';
    filterRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    filterRow.left = '10px';
    this.container!.addControl(filterRow);

    const filters: { key: FilterMode; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'favorites', label: 'Favorites' },
      { key: 'labeled', label: 'Labeled' },
      { key: 'unlabeled', label: 'Unlabeled' },
    ];

    for (const f of filters) {
      const btn = GUI.Button.CreateSimpleButton(`photoFilter_${f.key}`, f.label);
      btn.width = '100px';
      btn.height = '30px';
      btn.color = 'white';
      btn.fontSize = 13;
      btn.cornerRadius = 4;
      btn.thickness = 1;
      btn.background = f.key === this.filterMode ? 'rgba(160, 120, 80, 0.8)' : 'rgba(60, 60, 60, 0.6)';
      btn.onPointerUpObservable.add(() => {
        this.filterMode = f.key;
        this.updateFilterButtonStyles();
        this.renderContent();
      });
      filterRow.addControl(btn);
      this.filterButtons.set(f.key, btn);
    }

    // Stats text
    const statsText = new GUI.TextBlock('photoBookStats');
    statsText.text = '';
    statsText.fontSize = 12;
    statsText.color = 'rgba(200, 200, 200, 0.8)';
    statsText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    statsText.top = '96px';
    statsText.height = '20px';
    this.container!.addControl(statsText);
  }

  private updateFilterButtonStyles(): void {
    for (const [key, btn] of this.filterButtons) {
      btn.background = key === this.filterMode ? 'rgba(160, 120, 80, 0.8)' : 'rgba(60, 60, 60, 0.6)';
    }
  }

  // ─── Content Rendering ────────────────────────────────────────────────────

  private getFilteredPhotos(): PlayerPhoto[] {
    switch (this.filterMode) {
      case 'favorites':
        return this.photos.filter(p => p.favorite);
      case 'labeled':
        return this.photos.filter(p => p.labels.length > 0);
      case 'unlabeled':
        return this.photos.filter(p => p.labels.length === 0);
      default:
        return this.photos;
    }
  }

  private renderContent(): void {
    if (!this.contentStack) return;

    // Clear existing content
    this.contentStack.clearControls();

    // Update stats
    const statsBlock = this.container?.getChildByName('photoBookStats') as GUI.TextBlock | null;
    if (statsBlock) {
      const labelCount = this.photos.reduce((sum, p) => sum + p.labels.length, 0);
      statsBlock.text = `${this.photos.length} photos  |  ${labelCount} noun labels`;
    }

    if (this.viewMode === 'grid') {
      this.renderGridView();
    } else {
      this.renderDetailView();
    }
  }

  private renderGridView(): void {
    if (!this.contentStack) return;
    this.detailContainer!.isVisible = false;

    const filtered = this.getFilteredPhotos();

    if (filtered.length === 0) {
      const emptyText = new GUI.TextBlock('photoEmpty');
      emptyText.text = this.photos.length === 0
        ? 'No photos yet!\nPress C to enter camera mode, then SPACE to take photos.'
        : 'No photos match this filter.';
      emptyText.fontSize = 15;
      emptyText.color = 'rgba(200, 200, 200, 0.7)';
      emptyText.height = '100px';
      emptyText.textWrapping = true;
      this.contentStack.addControl(emptyText);
      return;
    }

    // Render photos in rows
    let currentRow: GUI.StackPanel | null = null;
    for (let i = 0; i < filtered.length; i++) {
      if (i % GRID_COLS === 0) {
        currentRow = new GUI.StackPanel(`photoRow_${i}`);
        currentRow.isVertical = false;
        currentRow.height = `${THUMB_SIZE + 30}px`;
        currentRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.contentStack.addControl(currentRow);
      }

      const photo = filtered[i];
      this.createPhotoThumbnail(photo, currentRow!);
    }
  }

  private createPhotoThumbnail(photo: PlayerPhoto, row: GUI.StackPanel): void {
    const wrapper = new GUI.Rectangle(`photoThumb_${photo.id}`);
    wrapper.width = `${THUMB_SIZE + 20}px`;
    wrapper.height = `${THUMB_SIZE + 25}px`;
    wrapper.thickness = 0;
    wrapper.background = 'transparent';
    row.addControl(wrapper);

    // Thumbnail image
    const img = new GUI.Image(`photoImg_${photo.id}`, photo.thumbnail);
    img.width = `${THUMB_SIZE}px`;
    img.height = `${THUMB_SIZE * 0.75}px`;
    img.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    img.stretch = GUI.Image.STRETCH_UNIFORM;
    wrapper.addControl(img);

    // Favorite indicator
    if (photo.favorite) {
      const star = new GUI.TextBlock(`photoStar_${photo.id}`);
      star.text = '*';
      star.fontSize = 18;
      star.fontWeight = 'bold';
      star.color = '#f1c40f';
      star.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      star.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      star.top = '2px';
      star.left = '-4px';
      star.width = '20px';
      star.height = '20px';
      wrapper.addControl(star);
    }

    // Label count badge
    if (photo.labels.length > 0) {
      const badge = new GUI.Ellipse(`photoBadge_${photo.id}`);
      badge.width = '22px';
      badge.height = '22px';
      badge.background = 'rgba(40, 120, 200, 0.9)';
      badge.thickness = 0;
      badge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      badge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      badge.top = '2px';
      badge.left = '4px';
      wrapper.addControl(badge);

      const badgeText = new GUI.TextBlock(`photoBadgeText_${photo.id}`);
      badgeText.text = `${photo.labels.length}`;
      badgeText.fontSize = 11;
      badgeText.color = 'white';
      badgeText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      badgeText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      badgeText.top = '4px';
      badgeText.left = '7px';
      badgeText.width = '22px';
      badgeText.height = '22px';
      wrapper.addControl(badgeText);
    }

    // Location text
    const locationText = new GUI.TextBlock(`photoLoc_${photo.id}`);
    locationText.text = photo.location.settlementName || photo.location.buildingName || 'Unknown';
    locationText.fontSize = 10;
    locationText.color = 'rgba(200, 200, 200, 0.8)';
    locationText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    locationText.height = '16px';
    locationText.textWrapping = true;
    wrapper.addControl(locationText);

    // Click to open detail
    wrapper.onPointerUpObservable.add(() => {
      this.selectedPhoto = photo;
      this.viewMode = 'detail';
      this.renderDetailView();
    });
  }

  // ─── Detail View ──────────────────────────────────────────────────────────

  private renderDetailView(): void {
    if (!this.detailContainer || !this.selectedPhoto) return;

    this.detailContainer.clearControls();
    this.detailContainer.isVisible = true;

    const photo = this.selectedPhoto;

    // Back button
    const backBtn = GUI.Button.CreateSimpleButton('photoBack', 'Back');
    backBtn.width = '80px';
    backBtn.height = '30px';
    backBtn.color = 'white';
    backBtn.background = 'rgba(80, 80, 80, 0.8)';
    backBtn.cornerRadius = 4;
    backBtn.fontSize = 13;
    backBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    backBtn.top = '8px';
    backBtn.left = '10px';
    backBtn.onPointerUpObservable.add(() => {
      this.viewMode = 'grid';
      this.detailContainer!.isVisible = false;
      this.renderContent();
    });
    this.detailContainer.addControl(backBtn);

    // Favorite toggle
    const favBtn = GUI.Button.CreateSimpleButton('photoFavBtn', photo.favorite ? 'Unfavorite' : 'Favorite');
    favBtn.width = '90px';
    favBtn.height = '30px';
    favBtn.color = 'white';
    favBtn.background = photo.favorite ? 'rgba(200, 160, 40, 0.8)' : 'rgba(80, 80, 80, 0.8)';
    favBtn.cornerRadius = 4;
    favBtn.fontSize = 13;
    favBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    favBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    favBtn.top = '8px';
    favBtn.onPointerUpObservable.add(() => {
      this.callbacks.onToggleFavorite?.(photo.id);
      photo.favorite = !photo.favorite;
      this.renderDetailView();
    });
    this.detailContainer.addControl(favBtn);

    // Delete button
    const deleteBtn = GUI.Button.CreateSimpleButton('photoDeleteBtn', 'Delete');
    deleteBtn.width = '80px';
    deleteBtn.height = '30px';
    deleteBtn.color = 'white';
    deleteBtn.background = 'rgba(180, 50, 50, 0.8)';
    deleteBtn.cornerRadius = 4;
    deleteBtn.fontSize = 13;
    deleteBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    deleteBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    deleteBtn.top = '8px';
    deleteBtn.left = '-10px';
    deleteBtn.onPointerUpObservable.add(() => {
      this.callbacks.onDeletePhoto?.(photo.id);
      this.photos = this.photos.filter(p => p.id !== photo.id);
      this.selectedPhoto = null;
      this.viewMode = 'grid';
      this.detailContainer!.isVisible = false;
      this.renderContent();
    });
    this.detailContainer.addControl(deleteBtn);

    // Photo image (large)
    const photoImg = new GUI.Image('photoDetailImg', photo.imageData);
    photoImg.width = `${PANEL_WIDTH - 60}px`;
    photoImg.height = '300px';
    photoImg.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    photoImg.top = '48px';
    photoImg.stretch = GUI.Image.STRETCH_UNIFORM;
    this.detailContainer.addControl(photoImg);

    // Render noun label markers on the image
    this.renderLabelMarkers(photo, photoImg);

    // Location & date info
    const infoText = new GUI.TextBlock('photoInfo');
    const date = new Date(photo.takenAt);
    const locName = photo.location.buildingName || photo.location.settlementName || 'Unknown';
    infoText.text = `${locName}  |  ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    infoText.fontSize = 12;
    infoText.color = 'rgba(200, 200, 200, 0.8)';
    infoText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    infoText.top = '352px';
    infoText.height = '20px';
    this.detailContainer.addControl(infoText);

    // Caption
    if (photo.caption) {
      const captionText = new GUI.TextBlock('photoCaption');
      captionText.text = `"${photo.caption}"`;
      captionText.fontSize = 13;
      captionText.fontStyle = 'italic';
      captionText.color = 'rgba(230, 230, 200, 0.9)';
      captionText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      captionText.top = '374px';
      captionText.height = '20px';
      this.detailContainer.addControl(captionText);
    }

    // Noun labels section
    this.renderNounLabelList(photo);
  }

  private renderLabelMarkers(photo: PlayerPhoto, _photoImg: GUI.Image): void {
    // Overlay small markers where labels are positioned
    for (const label of photo.labels) {
      const marker = new GUI.Ellipse(`labelMarker_${label.id}`);
      marker.width = '14px';
      marker.height = '14px';
      marker.background = getCategoryColor(label.category);
      marker.thickness = 2;
      marker.color = 'white';
      // Position relative to the photo area (48px top + within 300px height)
      const imgTop = 48;
      const imgHeight = 300;
      const imgWidth = PANEL_WIDTH - 60;
      marker.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      marker.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      marker.top = `${imgTop + label.y * imgHeight}px`;
      marker.left = `${30 + label.x * imgWidth}px`;
      this.detailContainer!.addControl(marker);
    }
  }

  private renderNounLabelList(photo: PlayerPhoto): void {
    // Label list heading
    const heading = new GUI.TextBlock('labelHeading');
    heading.text = `Noun Labels (${photo.labels.length})`;
    heading.fontSize = 14;
    heading.fontWeight = 'bold';
    heading.color = 'white';
    heading.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    heading.top = '396px';
    heading.height = '22px';
    heading.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    heading.left = '10px';
    this.detailContainer!.addControl(heading);

    // Scrollable label list
    const labelScroll = new GUI.ScrollViewer('labelScroll');
    labelScroll.width = `${PANEL_WIDTH - 40}px`;
    labelScroll.height = '80px';
    labelScroll.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    labelScroll.top = '420px';
    labelScroll.thickness = 0;
    labelScroll.barColor = 'rgba(160, 120, 80, 0.6)';
    this.detailContainer!.addControl(labelScroll);

    const labelStack = new GUI.StackPanel('labelStack');
    labelStack.width = '100%';
    labelStack.isVertical = true;
    labelScroll.addControl(labelStack);

    if (photo.labels.length === 0) {
      const noLabels = new GUI.TextBlock('noLabels');
      noLabels.text = 'No noun labels. Objects in frame are auto-detected when you take photos.';
      noLabels.fontSize = 12;
      noLabels.color = 'rgba(180, 180, 180, 0.7)';
      noLabels.height = '40px';
      noLabels.textWrapping = true;
      labelStack.addControl(noLabels);
      return;
    }

    for (const label of photo.labels) {
      const row = new GUI.StackPanel(`labelRow_${label.id}`);
      row.isVertical = false;
      row.height = '28px';
      row.width = '100%';
      labelStack.addControl(row);

      // Category dot
      const dot = new GUI.Ellipse(`labelDot_${label.id}`);
      dot.width = '10px';
      dot.height = '10px';
      dot.background = getCategoryColor(label.category);
      dot.thickness = 0;
      row.addControl(dot);

      // Name
      const nameText = new GUI.TextBlock(`labelName_${label.id}`);
      nameText.text = label.targetWord ? `${label.name} → ${label.targetWord}` : label.name;
      nameText.fontSize = 12;
      nameText.color = 'white';
      nameText.width = '320px';
      nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      nameText.paddingLeft = '6px';
      row.addControl(nameText);

      // Category
      const catText = new GUI.TextBlock(`labelCat_${label.id}`);
      catText.text = label.category;
      catText.fontSize = 11;
      catText.color = 'rgba(180, 180, 180, 0.7)';
      catText.width = '80px';
      row.addControl(catText);

      // Pronunciation
      if (label.pronunciation) {
        const pronText = new GUI.TextBlock(`labelPron_${label.id}`);
        pronText.text = `[${label.pronunciation}]`;
        pronText.fontSize = 11;
        pronText.color = 'rgba(160, 200, 160, 0.8)';
        pronText.width = '120px';
        row.addControl(pronText);
      }

      // Remove button
      const removeBtn = GUI.Button.CreateSimpleButton(`labelRemove_${label.id}`, 'x');
      removeBtn.width = '24px';
      removeBtn.height = '24px';
      removeBtn.color = 'rgba(200, 80, 80, 0.8)';
      removeBtn.background = 'transparent';
      removeBtn.thickness = 0;
      removeBtn.fontSize = 12;
      removeBtn.onPointerUpObservable.add(() => {
        this.callbacks.onRemoveLabel?.(photo.id, label.id);
        photo.labels = photo.labels.filter(l => l.id !== label.id);
        this.renderDetailView();
      });
      row.addControl(removeBtn);
    }
  }

  dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryColor(category: string): string {
  switch (category) {
    case 'person': return 'rgba(60, 140, 220, 0.9)';
    case 'building': return 'rgba(180, 130, 70, 0.9)';
    case 'nature': return 'rgba(60, 180, 80, 0.9)';
    case 'item': return 'rgba(200, 180, 50, 0.9)';
    case 'animal': return 'rgba(200, 100, 60, 0.9)';
    default: return 'rgba(150, 150, 150, 0.9)';
  }
}
