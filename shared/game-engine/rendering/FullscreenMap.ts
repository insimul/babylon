/**
 * Full-screen Map View (US-043)
 *
 * Renders the world map as a full-screen overlay showing settlements,
 * NPCs, quest markers, streets, and the player's position/heading.
 * Toggled with the M key. Reuses the minimap snapshot and data from
 * BabylonGUIManager's MinimapData.
 */

import {
  AdvancedDynamicTexture,
  Container,
  Control,
  Ellipse,
  Image,
  Rectangle,
  TextBlock,
} from '@babylonjs/gui';
import type { MinimapData } from './BabylonGUIManager';

const MAP_SIZE = 600; // px — the rendered map area
const PANEL_PADDING = 40; // px — space for title / legend

export class FullscreenMap {
  private advancedTexture: AdvancedDynamicTexture;
  private overlay: Rectangle | null = null;
  private mapImage: Image | null = null;
  private mapContainer: Container | null = null;
  private _isOpen = false;

  /** Full-world overhead snapshot canvas (shared from GUIManager). */
  private _fullImage: HTMLCanvasElement | null = null;
  private _worldSize = 512;

  /** Reusable canvas for drawing the full-world view with overlays. */
  private _renderCanvas: HTMLCanvasElement | null = null;
  private _renderCtx: CanvasRenderingContext2D | null = null;

  /** Dynamic GUI controls recreated each update. */
  private _dynamicControls: Control[] = [];

  /** Legend text items. */
  private _legendControls: Control[] = [];

  constructor(advancedTexture: AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createOverlay();
  }

  // ── Public API ──────────────────────────────────────────────────

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public open(): void {
    if (this.overlay) {
      this.overlay.isVisible = true;
      this._isOpen = true;
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.isVisible = false;
      this._isOpen = false;
    }
  }

  public toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Provide the world snapshot canvas (called once from BabylonGame). */
  public setWorldImage(canvas: HTMLCanvasElement, worldSize: number): void {
    this._fullImage = canvas;
    this._worldSize = worldSize;
  }

  /** Update the full-screen map with latest game data. */
  public update(data: MinimapData): void {
    if (!this._isOpen || !this.mapContainer) return;

    this.renderWorldImage(data);
    this.renderDynamicMarkers(data);
  }

  public dispose(): void {
    this.clearDynamic();
    if (this.overlay) {
      this.advancedTexture.removeControl(this.overlay);
      this.overlay.dispose();
      this.overlay = null;
    }
    this.mapContainer = null;
    this.mapImage = null;
  }

  // ── Internal ────────────────────────────────────────────────────

  private createOverlay(): void {
    // Semi-transparent full-screen backdrop
    const overlay = new Rectangle('fullscreenMapOverlay');
    overlay.width = '100%';
    overlay.height = '100%';
    overlay.background = 'rgba(0, 0, 0, 0.85)';
    overlay.color = 'transparent';
    overlay.thickness = 0;
    overlay.isVisible = false;
    overlay.zIndex = 90; // Above HUD, below menus
    this.advancedTexture.addControl(overlay);
    this.overlay = overlay;

    // Title
    const title = new TextBlock('fullscreenMapTitle', 'World Map');
    title.fontSize = 24;
    title.fontWeight = 'bold';
    title.color = 'white';
    title.height = '40px';
    title.top = '20px';
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    overlay.addControl(title);

    // Hint text
    const hint = new TextBlock('fullscreenMapHint', 'Press M to close');
    hint.fontSize = 14;
    hint.color = 'rgba(255,255,255,0.5)';
    hint.height = '24px';
    hint.top = '52px';
    hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    overlay.addControl(hint);

    // Map frame
    const frame = new Rectangle('fullscreenMapFrame');
    frame.width = `${MAP_SIZE + 4}px`;
    frame.height = `${MAP_SIZE + 4}px`;
    frame.color = 'rgba(255,255,255,0.3)';
    frame.thickness = 2;
    frame.cornerRadius = 4;
    frame.background = '#111';
    overlay.addControl(frame);

    // Static map image
    const mapImage = new Image('fullscreenMapImage');
    mapImage.width = `${MAP_SIZE}px`;
    mapImage.height = `${MAP_SIZE}px`;
    mapImage.isVisible = false;
    frame.addControl(mapImage);
    this.mapImage = mapImage;

    // Container for dynamic markers (player, NPCs, quests, settlements)
    const mapContainer = new Container('fullscreenMapContainer');
    mapContainer.width = `${MAP_SIZE}px`;
    mapContainer.height = `${MAP_SIZE}px`;
    frame.addControl(mapContainer);
    this.mapContainer = mapContainer;

    // Legend
    this.createLegend(overlay);
  }

  private createLegend(parent: Rectangle): void {
    const legend = new Rectangle('fullscreenMapLegend');
    legend.width = '160px';
    legend.height = '130px';
    legend.background = 'rgba(0,0,0,0.6)';
    legend.color = 'rgba(255,255,255,0.3)';
    legend.thickness = 1;
    legend.cornerRadius = 6;
    legend.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    legend.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    legend.left = '-20px';
    legend.top = '-20px';
    parent.addControl(legend);

    const items: Array<{ label: string; color: string }> = [
      { label: 'You', color: '#FFC107' },
      { label: 'NPC', color: 'rgba(200,200,200,0.7)' },
      { label: 'Quest', color: '#E040FB' },
      { label: 'Guard', color: '#F44336' },
      { label: 'Merchant', color: '#4CAF50' },
    ];

    items.forEach((item, i) => {
      const row = new Container(`legendRow${i}`);
      row.width = '140px';
      row.height = '20px';
      row.top = `${10 + i * 22}px`;
      row.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      legend.addControl(row);

      const dot = new Ellipse(`legendDot${i}`);
      dot.width = '10px';
      dot.height = '10px';
      dot.background = item.color;
      dot.color = 'transparent';
      dot.thickness = 0;
      dot.left = '-50px';
      row.addControl(dot);

      const label = new TextBlock(`legendLabel${i}`, item.label);
      label.fontSize = 12;
      label.color = 'white';
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      label.left = '-20px';
      row.addControl(label);
    });
  }

  /**
   * Render the world snapshot into the full-screen map image.
   * Shows the entire world (not a sliding viewport like the minimap).
   */
  private renderWorldImage(data: MinimapData): void {
    if (!this._fullImage || !this.mapImage) return;

    if (!this._renderCanvas) {
      this._renderCanvas = document.createElement('canvas');
      this._renderCanvas.width = MAP_SIZE;
      this._renderCanvas.height = MAP_SIZE;
      this._renderCtx = this._renderCanvas.getContext('2d');
    }

    if (!this._renderCtx) return;

    const ctx = this._renderCtx;
    // Draw the full world snapshot scaled to MAP_SIZE
    ctx.drawImage(this._fullImage, 0, 0, MAP_SIZE, MAP_SIZE);

    // Draw streets
    if (data.streets && data.streets.length > 0) {
      this.drawStreets(ctx, data);
    }

    const dataUrl = this._renderCanvas.toDataURL('image/jpeg', 0.9);
    this.mapImage.source = dataUrl;
    this.mapImage.isVisible = true;
  }

  private drawStreets(
    ctx: CanvasRenderingContext2D,
    data: MinimapData
  ): void {
    const worldSize = data.worldSize;
    const worldHalf = worldSize / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const street of data.streets!) {
      if (street.waypoints.length < 2) continue;
      ctx.lineWidth = Math.max(1, (street.width / worldSize) * MAP_SIZE);
      ctx.beginPath();
      const sx = ((street.waypoints[0].x + worldHalf) / worldSize) * MAP_SIZE;
      const sy = ((-street.waypoints[0].z + worldHalf) / worldSize) * MAP_SIZE;
      ctx.moveTo(sx, sy);
      for (let i = 1; i < street.waypoints.length; i++) {
        const px = ((street.waypoints[i].x + worldHalf) / worldSize) * MAP_SIZE;
        const py = ((-street.waypoints[i].z + worldHalf) / worldSize) * MAP_SIZE;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Convert world coordinates to full-screen map pixel offsets. */
  private worldToMap(
    wx: number,
    wz: number,
    worldSize: number
  ): [number, number] {
    const worldHalf = worldSize / 2;
    const mapHalf = MAP_SIZE / 2;
    const mx = ((wx + worldHalf) / worldSize) * MAP_SIZE - mapHalf;
    const mz = ((-wz + worldHalf) / worldSize) * MAP_SIZE - mapHalf;
    return [mx, mz];
  }

  private clearDynamic(): void {
    if (!this.mapContainer) return;
    for (const ctrl of this._dynamicControls) {
      this.mapContainer.removeControl(ctrl);
      ctrl.dispose();
    }
    this._dynamicControls = [];
  }

  private renderDynamicMarkers(data: MinimapData): void {
    if (!this.mapContainer) return;
    this.clearDynamic();

    const worldSize = data.worldSize;

    // Settlement labels
    for (const s of data.settlements) {
      const [sx, sz] = this.worldToMap(s.position.x, s.position.z, worldSize);
      const dot = new Ellipse(`fs-settlement-${s.id}`);
      dot.width = '10px';
      dot.height = '10px';
      dot.background =
        s.type === 'city' ? '#9C27B0' : s.type === 'town' ? '#2196F3' : '#4CAF50';
      dot.color = 'white';
      dot.thickness = 1;
      dot.left = `${sx}px`;
      dot.top = `${sz}px`;
      this.mapContainer.addControl(dot);
      this._dynamicControls.push(dot);

      const label = new TextBlock(`fs-settlement-label-${s.id}`, s.name);
      label.fontSize = 11;
      label.color = 'white';
      label.left = `${sx}px`;
      label.top = `${sz - 14}px`;
      label.resizeToFit = true;
      this.mapContainer.addControl(label);
      this._dynamicControls.push(label);
    }

    // NPC markers
    if (data.npcPositions) {
      for (const npc of data.npcPositions) {
        const [nx, nz] = this.worldToMap(npc.position.x, npc.position.z, worldSize);
        const dot = new Ellipse(`fs-npc-${npc.id}`);
        dot.width = '6px';
        dot.height = '6px';
        dot.thickness = 0;
        if (npc.role === 'guard') dot.background = '#F44336';
        else if (npc.role === 'merchant') dot.background = '#4CAF50';
        else if (npc.role === 'questgiver') dot.background = '#FFC107';
        else dot.background = 'rgba(200,200,200,0.7)';
        dot.left = `${nx}px`;
        dot.top = `${nz}px`;
        this.mapContainer.addControl(dot);
        this._dynamicControls.push(dot);

        // Quest indicator above NPC dot
        if (npc.questIndicator) {
          const indBg = new Ellipse(`fs-npc-qi-bg-${npc.id}`);
          indBg.width = '10px';
          indBg.height = '10px';
          indBg.thickness = 0;
          if (npc.questIndicator === 'available' || npc.questIndicator === 'objective') indBg.background = '#FFD700';
          else if (npc.questIndicator === 'turn_in') indBg.background = '#32CD32';
          else indBg.background = '#C0C0C0';
          indBg.left = `${nx}px`;
          indBg.top = `${nz - 8}px`;
          this.mapContainer.addControl(indBg);
          this._dynamicControls.push(indBg);

          const indText = new TextBlock(`fs-npc-qi-${npc.id}`);
          indText.text = npc.questIndicator === 'objective' ? '!' : npc.questIndicator === 'turn_in' ? '\u2713' : '?';
          indText.color = '#000000';
          indText.fontSize = 8;
          indText.fontWeight = 'bold';
          indText.left = `${nx}px`;
          indText.top = `${nz - 8}px`;
          this.mapContainer.addControl(indText);
          this._dynamicControls.push(indText);
        }
      }
    }

    // Quest markers
    if (data.questMarkers) {
      for (const quest of data.questMarkers) {
        const [qx, qz] = this.worldToMap(quest.position.x, quest.position.z, worldSize);
        const marker = new Rectangle(`fs-quest-${quest.id}`);
        marker.width = '12px';
        marker.height = '12px';
        marker.background = '#E040FB';
        marker.color = '#FFFFFF';
        marker.thickness = 1;
        marker.cornerRadius = 2;
        marker.rotation = Math.PI / 4;
        marker.left = `${qx}px`;
        marker.top = `${qz}px`;
        this.mapContainer.addControl(marker);
        this._dynamicControls.push(marker);

        const label = new TextBlock(`fs-quest-label-${quest.id}`, quest.title);
        label.fontSize = 10;
        label.color = '#E040FB';
        label.left = `${qx}px`;
        label.top = `${qz - 14}px`;
        label.resizeToFit = true;
        this.mapContainer.addControl(label);
        this._dynamicControls.push(label);
      }
    }

    // Quest objective markers (derived from individual objectives)
    if (data.questObjectiveMarkers) {
      for (const obj of data.questObjectiveMarkers) {
        const [ox, oz] = this.worldToMap(obj.position.x, obj.position.z, worldSize);

        if (obj.shape === 'diamond') {
          const marker = new Rectangle(`fs-obj-${obj.id}`);
          marker.width = '10px';
          marker.height = '10px';
          marker.background = obj.color;
          marker.color = '#FFFFFF';
          marker.thickness = 1;
          marker.cornerRadius = 1;
          marker.rotation = Math.PI / 4;
          marker.left = `${ox}px`;
          marker.top = `${oz}px`;
          this.mapContainer.addControl(marker);
          this._dynamicControls.push(marker);
        } else {
          const marker = new Ellipse(`fs-obj-${obj.id}`);
          marker.width = '9px';
          marker.height = '9px';
          marker.background = obj.color;
          marker.color = '#FFFFFF';
          marker.thickness = 1;
          marker.left = `${ox}px`;
          marker.top = `${oz}px`;
          this.mapContainer.addControl(marker);
          this._dynamicControls.push(marker);
        }

        const label = new TextBlock(`fs-obj-label-${obj.id}`, obj.objectiveDescription);
        label.fontSize = 9;
        label.color = obj.color;
        label.left = `${ox}px`;
        label.top = `${oz - 12}px`;
        label.resizeToFit = true;
        this.mapContainer.addControl(label);
        this._dynamicControls.push(label);
      }
    }

    // Quest item markers (gold circles for fetch quest collectibles)
    if (data.questItemMarkers) {
      for (const item of data.questItemMarkers) {
        const [ix, iz] = this.worldToMap(item.position.x, item.position.z, worldSize);
        const itemMarker = new Ellipse(`fs-quest-item-${item.id}`);
        itemMarker.width = '8px';
        itemMarker.height = '8px';
        itemMarker.background = '#FFD700';
        itemMarker.color = '#FFFFFF';
        itemMarker.thickness = 1;
        itemMarker.left = `${ix}px`;
        itemMarker.top = `${iz}px`;
        this.mapContainer.addControl(itemMarker);
        this._dynamicControls.push(itemMarker);
      }
    }

    // Player marker (always last so it renders on top)
    const [px, pz] = this.worldToMap(
      data.playerPosition.x,
      data.playerPosition.z,
      worldSize
    );

    const playerOuter = new Ellipse('fs-player-outer');
    playerOuter.width = '18px';
    playerOuter.height = '18px';
    playerOuter.background = 'rgba(0,0,0,0.4)';
    playerOuter.color = 'transparent';
    playerOuter.thickness = 0;
    playerOuter.left = `${px}px`;
    playerOuter.top = `${pz}px`;
    this.mapContainer.addControl(playerOuter);
    this._dynamicControls.push(playerOuter);

    const playerDot = new Ellipse('fs-player');
    playerDot.width = '14px';
    playerDot.height = '14px';
    playerDot.background = '#FFC107';
    playerDot.color = 'white';
    playerDot.thickness = 2;
    playerDot.left = `${px}px`;
    playerDot.top = `${pz}px`;
    this.mapContainer.addControl(playerDot);
    this._dynamicControls.push(playerDot);
  }
}
