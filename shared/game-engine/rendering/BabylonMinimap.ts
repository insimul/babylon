/**
 * Babylon Minimap
 *
 * Displays a minimap showing player position, settlements, NPCs, and quest objectives
 */

import {
  Scene, Vector3, FreeCamera, RenderTargetTexture, Color4,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

export interface MinimapMarker {
  id: string;
  position: Vector3;
  type: 'player' | 'settlement' | 'npc' | 'quest' | 'quest_objective' | 'building' | 'exclamation' | 'question' | 'discovery';
  label?: string;
  color?: string;
  /** Shape hint for quest_objective markers: 'diamond' for location types, 'circle' for others. */
  shape?: 'diamond' | 'circle';
}

export type TeleportRequestCallback = (worldX: number, worldZ: number) => void;
export type FullscreenToggleCallback = () => void;

export class BabylonMinimap {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private mapContainer: GUI.Rectangle | null = null;
  private titleBlock: GUI.TextBlock | null = null;
  private legendContainer: GUI.Rectangle | null = null;
  private _legendVisible: boolean = false;
  private isVisible: boolean = false;
  private _expanded: boolean = true;

  private markers: Map<string, MinimapMarker> = new Map();
  private markerElements: Map<string, GUI.Control> = new Map();

  // Minimap configuration
  private mapSize: number = 200; // GUI display size in pixels
  private rttSize: number = 512; // Render target resolution (sharp top-down capture)
  private worldSize: number = 1024; // World size in game units
  private mapScale: number = 1; // Pixels per game unit

  // Top-down camera render target
  private minimapCamera: FreeCamera | null = null;
  private minimapRTT: RenderTargetTexture | null = null;
  private mapImage: GUI.Image | null = null;
  private _lastCaptureX: number = Infinity;
  private _lastCaptureZ: number = Infinity;
  private _captureThreshold: number = 5; // world units moved before re-render
  private _captureInterval: number = 500; // ms minimum between captures
  private _lastCaptureTime: number = 0;

  // Teleport
  private onTeleportRequest: TeleportRequestCallback | null = null;
  private teleportDialog: GUI.Rectangle | null = null;

  // Fullscreen toggle
  private onFullscreenToggle: FullscreenToggleCallback | null = null;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture, worldSize: number = 1024) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;
    this.worldSize = worldSize;
    this.mapScale = this.mapSize / this.worldSize;

    this.createMinimapCamera();
    this.createMinimap();
  }

  /** Update the world size and re-frame the minimap camera. */
  setWorldSize(size: number): void {
    this.worldSize = size;
    this.mapScale = this.mapSize / this.worldSize;
    if (this.minimapCamera) {
      const half = this.worldSize / 2;
      this.minimapCamera.orthoLeft = -half;
      this.minimapCamera.orthoRight = half;
      this.minimapCamera.orthoTop = half;
      this.minimapCamera.orthoBottom = -half;
    }
  }

  /**
   * Create an orthographic top-down camera that renders the world
   * to a texture for the minimap background. Only re-renders when
   * the player moves significantly, not every frame.
   */
  private createMinimapCamera(): void {
    // Orthographic camera looking straight down
    const cam = new FreeCamera('minimapCamera', new Vector3(0, 200, 0), this.scene);
    cam.setTarget(new Vector3(0, 0, 0));
    cam.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;

    // Ortho bounds cover the full world
    const halfWorld = this.worldSize / 2;
    cam.orthoLeft = -halfWorld;
    cam.orthoRight = halfWorld;
    cam.orthoTop = halfWorld;
    cam.orthoBottom = -halfWorld;
    cam.minZ = 1;
    cam.maxZ = 500;

    // Don't let this camera be the active camera
    cam.layerMask = 0x0FFFFFFF;

    this.minimapCamera = cam;

    // Render target texture
    const rtt = new RenderTargetTexture('minimapRTT', this.rttSize, this.scene, false);
    rtt.activeCamera = cam;
    rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    rtt.clearColor = new Color4(0.35, 0.55, 0.25, 1); // green terrain fallback

    // Include all meshes by default
    this.scene.customRenderTargets.push(rtt);
    this.minimapRTT = rtt;
  }

  /**
   * Create the minimap UI
   */
  private createMinimap(): void {
    const containerW = this.mapSize + 14;

    // Main container (background)
    this.container = new GUI.Rectangle('minimapContainer');
    this.container.width = `${containerW}px`;
    this.container.height = `${this.mapSize + 20}px`;
    this.container.cornerRadius = 6;
    this.container.color = 'rgba(255, 255, 255, 0.6)';
    this.container.thickness = 1;
    this.container.background = 'rgba(0, 0, 0, 0.7)';
    this.container.isPointerBlocker = true;
    this.advancedTexture.addControl(this.container);

    // Position in top-right corner
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.left = '-8px';
    this.container.top = '8px';

    // Header row for toggle button + title
    const headerRow = new GUI.Rectangle('minimapHeader');
    headerRow.width = '100%';
    headerRow.height = '16px';
    headerRow.thickness = 0;
    headerRow.background = 'transparent';
    headerRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    headerRow.top = '2px';
    headerRow.isPointerBlocker = true;
    this.container.addControl(headerRow);

    // Toggle button (left side, same style as Notifications)
    const toggleBtn = new GUI.Rectangle('minimapToggleBtn');
    toggleBtn.width = '20px';
    toggleBtn.height = '16px';
    toggleBtn.background = 'transparent';
    toggleBtn.thickness = 0;
    toggleBtn.left = '2px';
    toggleBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    toggleBtn.isPointerBlocker = true;
    const toggleIcon = new GUI.TextBlock('minimapToggleIcon');
    toggleIcon.text = '▼';
    toggleIcon.color = 'rgba(255,255,255,0.6)';
    toggleIcon.fontSize = 9;
    toggleBtn.addControl(toggleIcon);
    headerRow.addControl(toggleBtn);

    // Title text (no chevron — toggle button handles that)
    const title = new GUI.TextBlock('minimapTitle');
    title.text = 'Map';
    title.fontSize = 9;
    title.fontWeight = 'bold';
    title.color = 'white';
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    headerRow.addControl(title);
    this.titleBlock = title;

    // Legend toggle button (right side, "?")
    const legendBtn = new GUI.Rectangle('minimapLegendBtn');
    legendBtn.width = '16px';
    legendBtn.height = '14px';
    legendBtn.background = 'transparent';
    legendBtn.thickness = 0;
    legendBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    legendBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    legendBtn.left = '-20px';
    legendBtn.isPointerBlocker = true;
    const legendIcon = new GUI.TextBlock('minimapLegendIcon');
    legendIcon.text = '?';
    legendIcon.color = 'rgba(255,255,255,0.6)';
    legendIcon.fontSize = 9;
    legendIcon.fontWeight = 'bold';
    legendBtn.addControl(legendIcon);
    headerRow.addControl(legendBtn);

    legendBtn.onPointerEnterObservable.add(() => { legendIcon.color = 'white'; });
    legendBtn.onPointerOutObservable.add(() => { legendIcon.color = 'rgba(255,255,255,0.6)'; });
    legendBtn.onPointerClickObservable.add(() => {
      this._legendVisible = !this._legendVisible;
      if (this.legendContainer) this.legendContainer.isVisible = this._legendVisible;
    });

    // Fullscreen toggle button (right side, "⛶")
    const fullscreenBtn = new GUI.Rectangle('minimapFullscreenBtn');
    fullscreenBtn.width = '16px';
    fullscreenBtn.height = '14px';
    fullscreenBtn.background = 'transparent';
    fullscreenBtn.thickness = 0;
    fullscreenBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    fullscreenBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    fullscreenBtn.left = '-2px';
    fullscreenBtn.isPointerBlocker = true;
    const fullscreenIcon = new GUI.TextBlock('minimapFullscreenIcon');
    fullscreenIcon.text = '⛶';
    fullscreenIcon.color = 'rgba(255,255,255,0.6)';
    fullscreenIcon.fontSize = 10;
    fullscreenBtn.addControl(fullscreenIcon);
    headerRow.addControl(fullscreenBtn);

    fullscreenBtn.onPointerEnterObservable.add(() => { fullscreenIcon.color = 'white'; });
    fullscreenBtn.onPointerOutObservable.add(() => { fullscreenIcon.color = 'rgba(255,255,255,0.6)'; });
    fullscreenBtn.onPointerClickObservable.add(() => {
      this.onFullscreenToggle?.();
    });

    // Click header to toggle collapse
    headerRow.onPointerClickObservable.add((_info, eventState) => {
      // Don't collapse when clicking the legend or fullscreen buttons
      if (eventState.skipNextObservers) return;
      this._expanded = !this._expanded;
      if (this._expanded) {
        this.container!.height = `${this.mapSize + 20}px`;
        if (this.mapContainer) this.mapContainer.isVisible = true;
        toggleIcon.text = '▼';
      } else {
        this.container!.height = '20px';
        if (this.mapContainer) this.mapContainer.isVisible = false;
        toggleIcon.text = '▲';
        // Hide legend when collapsing
        this._legendVisible = false;
        if (this.legendContainer) this.legendContainer.isVisible = false;
      }
    });

    // Map container (the actual map area)
    this.mapContainer = new GUI.Rectangle('minimapMap');
    this.mapContainer.width = `${this.mapSize}px`;
    this.mapContainer.height = `${this.mapSize}px`;
    this.mapContainer.thickness = 1;
    this.mapContainer.color = 'rgba(100, 100, 100, 0.5)';
    this.mapContainer.background = 'rgba(20, 20, 20, 0.8)';
    this.mapContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.mapContainer.top = '18px';
    this.container.addControl(this.mapContainer);

    // Render-target image background (top-down camera capture).
    // We render the RTT to a canvas, then feed that canvas to a GUI Image.
    if (this.minimapRTT) {
      this.mapImage = new GUI.Image('minimapImage', '');
      this.mapImage.width = `${this.mapSize}px`;
      this.mapImage.height = `${this.mapSize}px`;
      this.mapImage.stretch = GUI.Image.STRETCH_FILL;
      this.mapContainer.addControl(this.mapImage);

      // After each RTT render, copy the pixels to a canvas and update the GUI image
      this.minimapRTT.onAfterRenderObservable.add(() => {
        this.copyRTTToImage();
      });

      // Initial render
      this.scheduleCapture();
    }

    // Right-click on map area to request teleport
    this.mapContainer.onPointerClickObservable.add((info) => {
      if (info.buttonIndex !== 2) return; // right-click only
      this.handleMapRightClick(info.x, info.y);
    });
    this.setupRightClickTeleport();

    // Legend panel (anchored below the minimap container)
    this.createLegend();

    // Initially hidden
    this.container.isVisible = false;
  }

  private createLegend(): void {
    const items: Array<{ label: string; color: string }> = [
      { label: 'You', color: 'cyan' },
      { label: 'NPC', color: 'yellow' },
      { label: 'Settlement', color: 'orange' },
      { label: 'Quest', color: 'magenta' },
      { label: 'Building', color: 'gray' },
    ];

    const rowH = 14;
    const legendH = items.length * rowH + 8;
    const legendW = this.mapSize + 14;

    const legend = new GUI.Rectangle('minimapLegend');
    legend.width = `${legendW}px`;
    legend.height = `${legendH}px`;
    legend.background = 'rgba(0,0,0,0.8)';
    legend.color = 'rgba(255,255,255,0.4)';
    legend.thickness = 1;
    legend.cornerRadius = 4;
    legend.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    legend.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    legend.left = '-8px';
    legend.top = `${8 + this.mapSize + 22}px`;
    legend.isVisible = false;
    legend.isPointerBlocker = true;
    this.advancedTexture.addControl(legend);
    this.legendContainer = legend;

    items.forEach((item, i) => {
      const row = new GUI.Container(`minimapLegendRow${i}`);
      row.width = `${legendW - 8}px`;
      row.height = `${rowH}px`;
      row.top = `${4 + i * rowH}px`;
      row.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      legend.addControl(row);

      const dot = new GUI.Ellipse(`minimapLegendDot${i}`);
      dot.width = '6px';
      dot.height = '6px';
      dot.background = item.color;
      dot.color = 'transparent';
      dot.thickness = 0;
      dot.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      dot.left = '4px';
      row.addControl(dot);

      const label = new GUI.TextBlock(`minimapLegendLabel${i}`, item.label);
      label.fontSize = 8;
      label.color = 'white';
      label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      label.left = '14px';
      row.addControl(label);
    });
  }

  /** Total width of the minimap container in pixels. */
  public get containerWidth(): number {
    return this.mapSize + 14;
  }

  /** Total height of the minimap container in pixels. */
  public get containerHeight(): number {
    return this._expanded ? this.mapSize + 20 : 20;
  }

  /**
   * Show the minimap
   */
  public show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
    }
  }

  /**
   * Hide the minimap
   */
  public hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
      this._legendVisible = false;
      if (this.legendContainer) this.legendContainer.isVisible = false;
    }
  }

  /**
   * Toggle minimap visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Add or update a marker on the minimap
   */
  public addMarker(marker: MinimapMarker): void {
    // Early return if minimap is not initialized
    if (!this.mapContainer) return;

    this.markers.set(marker.id, marker);

    // Create visual marker if it doesn't exist
    if (!this.markerElements.has(marker.id)) {
      let element: GUI.Control;

      if (marker.type === 'exclamation' || marker.type === 'question') {
        const isExcl = marker.type === 'exclamation';
        // ! markers: bright orange, larger, pulsing — active quest objectives
        // ? markers: muted gold, smaller, steady — available quests to discover
        const container = new GUI.Rectangle(`minimap_marker_${marker.id}`);
        container.width = isExcl ? '14px' : '11px';
        container.height = isExcl ? '14px' : '11px';
        container.cornerRadius = isExcl ? 7 : 5;
        container.background = isExcl ? '#FF6B00' : (marker.color || '#C0A050');
        container.color = isExcl ? '#FFF' : '#000';
        container.thickness = isExcl ? 2 : 1;

        const text = new GUI.TextBlock(`minimap_marker_text_${marker.id}`);
        text.text = isExcl ? '!' : '?';
        text.fontSize = isExcl ? 10 : 8;
        text.fontWeight = 'bold';
        text.color = isExcl ? '#FFF' : '#000';
        container.addControl(text);

        // Pulse animation (only for ! — ? is steady)
        if (isExcl) {
          let pulseDir = 1;
          let pulseAlpha = 1.0;
          this.scene.onBeforeRenderObservable.add(() => {
            if (!container.isVisible) return;
            pulseAlpha += pulseDir * 0.02;
            if (pulseAlpha >= 1.0) { pulseAlpha = 1.0; pulseDir = -1; }
            if (pulseAlpha <= 0.4) { pulseAlpha = 0.4; pulseDir = 1; }
            container.alpha = pulseAlpha;
          });
        }

        element = container;
      } else if (marker.type === 'quest_objective' && marker.shape === 'diamond') {
        // Diamond marker for location-based objectives
        const diamond = new GUI.Rectangle(`minimap_marker_${marker.id}`);
        diamond.width = '6px';
        diamond.height = '6px';
        diamond.background = marker.color || '#00BCD4';
        diamond.color = '#fff';
        diamond.thickness = 1;
        diamond.rotation = Math.PI / 4;
        element = diamond;
      } else {
        const markerElement = new GUI.Ellipse(`minimap_marker_${marker.id}`);

        // Size based on type
        const size = marker.type === 'player' ? 6 :
                     marker.type === 'settlement' ? 8 :
                     marker.type === 'quest' ? 7 :
                     marker.type === 'quest_objective' ? 5 :
                     marker.type === 'discovery' ? 6 :
                     marker.type === 'building' ? 3 : 4;

        markerElement.width = `${size}px`;
        markerElement.height = `${size}px`;

        // Color based on type
        const color = marker.color || this.getDefaultColor(marker.type);
        markerElement.background = color;
        markerElement.color = color;
        markerElement.thickness = marker.type === 'player' ? 2 : 0;

        element = markerElement;
      }

      this.mapContainer.addControl(element);
      this.markerElements.set(marker.id, element);
    }

    // Update position
    this.updateMarkerPosition(marker.id);
  }

  /**
   * Remove a marker from the minimap
   */
  public removeMarker(markerId: string): void {
    this.markers.delete(markerId);

    const markerElement = this.markerElements.get(markerId);
    if (markerElement && this.mapContainer) {
      this.mapContainer.removeControl(markerElement);
      markerElement.dispose();
      this.markerElements.delete(markerId);
    }
  }

  /**
   * Update marker position
   */
  private updateMarkerPosition(markerId: string): void {
    const marker = this.markers.get(markerId);
    const markerElement = this.markerElements.get(markerId);

    if (!marker || !markerElement || !this.mapContainer) return;

    // Convert world position to minimap position
    // World coordinates: (-worldSize/2, worldSize/2) maps to (0, mapSize)
    const worldHalf = this.worldSize / 2;
    const mapHalf = this.mapSize / 2;

    const mapX = ((marker.position.x + worldHalf) / this.worldSize) * this.mapSize - mapHalf;
    const mapY = ((marker.position.z + worldHalf) / this.worldSize) * this.mapSize - mapHalf;

    markerElement.left = `${mapX}px`;
    markerElement.top = `${mapY}px`;
  }

  /**
   * Schedule a single RTT capture on the next frame.
   */
  private scheduleCapture(): void {
    if (this.minimapRTT) {
      this.minimapRTT.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }
  }

  /**
   * Copy the RTT pixel data to a canvas element and assign it to the GUI Image.
   */
  private _offscreenCanvas: HTMLCanvasElement | null = null;

  private copyRTTToImage(): void {
    if (!this.minimapRTT || !this.mapImage) return;

    const size = this.rttSize;

    // Read pixels from the RTT
    const pixels = this.minimapRTT.readPixels(0, 0, undefined, undefined, undefined, false as unknown as number);
    if (!pixels) return;

    // Resolve the promise (readPixels returns ArrayBufferView | Promise)
    const resolve = (data: ArrayBufferView) => {
      if (!this._offscreenCanvas) {
        this._offscreenCanvas = document.createElement('canvas');
        this._offscreenCanvas.width = size;
        this._offscreenCanvas.height = size;
      }
      const ctx = this._offscreenCanvas.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.createImageData(size, size);
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      // Babylon readPixels returns bottom-up RGBA; flip vertically
      for (let y = 0; y < size; y++) {
        const srcRow = (size - 1 - y) * size * 4;
        const dstRow = y * size * 4;
        for (let x = 0; x < size * 4; x++) {
          imageData.data[dstRow + x] = src[srcRow + x];
        }
      }

      ctx.putImageData(imageData, 0, 0);
      this.mapImage!.domImage = this._offscreenCanvas as any;
    };

    if (pixels instanceof Promise) {
      pixels.then(resolve);
    } else {
      resolve(pixels);
    }
  }

  /**
   * Update all marker positions (call from render loop).
   * Also re-captures the top-down view when the player has moved enough.
   */
  public update(): void {
    if (!this.isVisible) return;

    // Update positions for all markers
    for (const markerId of this.markers.keys()) {
      this.updateMarkerPosition(markerId);
    }

    // Check if we should re-capture the top-down RTT
    const player = this.markers.get('player');
    if (player && this.minimapRTT) {
      const now = performance.now();
      const dx = player.position.x - this._lastCaptureX;
      const dz = player.position.z - this._lastCaptureZ;
      const distSq = dx * dx + dz * dz;

      if (distSq > this._captureThreshold * this._captureThreshold &&
          now - this._lastCaptureTime > this._captureInterval) {
        // Move camera to follow player
        if (this.minimapCamera) {
          this.minimapCamera.position.x = player.position.x;
          this.minimapCamera.position.z = player.position.z;
          this.minimapCamera.setTarget(new Vector3(
            player.position.x, 0, player.position.z
          ));
        }
        this._lastCaptureX = player.position.x;
        this._lastCaptureZ = player.position.z;
        this._lastCaptureTime = now;
        this.scheduleCapture();
      }
    }
  }

  /**
   * Get default color for marker type
   */
  private getDefaultColor(type: string): string {
    switch (type) {
      case 'player':
        return 'cyan';
      case 'settlement':
        return 'orange';
      case 'npc':
        return 'yellow';
      case 'quest':
        return 'magenta';
      case 'building':
        return 'gray';
      case 'discovery':
        return '#81C784';
      default:
        return 'white';
    }
  }

  /**
   * Clear all markers
   */
  public clearMarkers(): void {
    // Remove all marker elements
    for (const [markerId, markerElement] of this.markerElements.entries()) {
      if (this.mapContainer) {
        this.mapContainer.removeControl(markerElement);
      }
      markerElement.dispose();
    }

    this.markers.clear();
    this.markerElements.clear();
  }

  /**
   * Register a callback invoked when the player confirms a teleport.
   */
  public setOnTeleportRequest(cb: TeleportRequestCallback): void {
    this.onTeleportRequest = cb;
  }

  /** Register a callback invoked when the user clicks the fullscreen toggle button. */
  public setOnFullscreenToggle(cb: FullscreenToggleCallback): void {
    this.onFullscreenToggle = cb;
  }

  /**
   * Convert minimap-local pixel coordinates to world X/Z and show
   * a confirmation dialog.
   */
  private handleMapRightClick(screenX: number, screenY: number): void {
    if (!this.mapContainer || !this.onTeleportRequest) return;

    // The observable gives us screen-space coords. We need to convert
    // them to local minimap-space. Get the map container's screen rect
    // via the linked mesh approach or manual calculation.
    const engine = this.scene.getEngine();
    const canvasRect = engine.getRenderingCanvas()?.getBoundingClientRect();
    if (!canvasRect) return;

    // Map container center in screen space — it's positioned in the
    // top-right of the screen.
    const containerRight = 8; // container.left = '-8px'
    const containerTop = 8 + 18; // container.top = '8px', mapContainer.top = '18px'

    const canvasW = canvasRect.width;
    const mapCenterX = canvasW - containerRight - (this.mapSize + 14) / 2;
    const mapCenterY = containerTop + this.mapSize / 2;

    // Offset from map center in pixels
    const localX = screenX - mapCenterX;
    const localY = screenY - mapCenterY;

    // Clamp to map bounds
    const half = this.mapSize / 2;
    if (Math.abs(localX) > half || Math.abs(localY) > half) return;

    // Convert to world coordinates
    const worldHalf = this.worldSize / 2;
    const worldX = (localX / half) * worldHalf;
    const worldZ = (localY / half) * worldHalf;

    this.showTeleportDialog(worldX, worldZ);
  }

  /**
   * Show a Yes/No dialog asking whether to teleport.
   */
  private showTeleportDialog(worldX: number, worldZ: number): void {
    // Remove any existing dialog
    this.dismissTeleportDialog();

    const dialog = new GUI.Rectangle('teleportDialog');
    dialog.width = '220px';
    dialog.height = '90px';
    dialog.cornerRadius = 8;
    dialog.color = 'rgba(255,255,255,0.7)';
    dialog.thickness = 1;
    dialog.background = 'rgba(0,0,0,0.85)';
    dialog.isPointerBlocker = true;
    dialog.zIndex = 100;
    this.advancedTexture.addControl(dialog);
    this.teleportDialog = dialog;

    // Question text
    const text = new GUI.TextBlock('teleportQuestion');
    text.text = 'Teleport here?';
    text.color = 'white';
    text.fontSize = 14;
    text.fontWeight = 'bold';
    text.top = '-14px';
    text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    dialog.addControl(text);

    // Button row
    const btnRow = new GUI.StackPanel('teleportBtnRow');
    btnRow.isVertical = false;
    btnRow.height = '30px';
    btnRow.top = '18px';
    btnRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    dialog.addControl(btnRow);

    // Yes button
    const yesBtn = new GUI.Rectangle('teleportYes');
    yesBtn.width = '70px';
    yesBtn.height = '28px';
    yesBtn.cornerRadius = 4;
    yesBtn.background = '#2a7a2a';
    yesBtn.color = '#4a4';
    yesBtn.thickness = 1;
    yesBtn.isPointerBlocker = true;
    btnRow.addControl(yesBtn);

    const yesTxt = new GUI.TextBlock();
    yesTxt.text = 'Yes';
    yesTxt.color = 'white';
    yesTxt.fontSize = 13;
    yesTxt.fontWeight = 'bold';
    yesBtn.addControl(yesTxt);

    yesBtn.onPointerEnterObservable.add(() => { yesBtn.background = '#3a9a3a'; });
    yesBtn.onPointerOutObservable.add(() => { yesBtn.background = '#2a7a2a'; });
    yesBtn.onPointerClickObservable.add(() => {
      this.onTeleportRequest?.(worldX, worldZ);
      this.dismissTeleportDialog();
    });

    // Spacer
    const spacer = new GUI.Rectangle('teleportSpacer');
    spacer.width = '12px';
    spacer.height = '28px';
    spacer.thickness = 0;
    spacer.background = 'transparent';
    btnRow.addControl(spacer);

    // No button
    const noBtn = new GUI.Rectangle('teleportNo');
    noBtn.width = '70px';
    noBtn.height = '28px';
    noBtn.cornerRadius = 4;
    noBtn.background = '#7a2a2a';
    noBtn.color = '#a44';
    noBtn.thickness = 1;
    noBtn.isPointerBlocker = true;
    btnRow.addControl(noBtn);

    const noTxt = new GUI.TextBlock();
    noTxt.text = 'No';
    noTxt.color = 'white';
    noTxt.fontSize = 13;
    noTxt.fontWeight = 'bold';
    noBtn.addControl(noTxt);

    noBtn.onPointerEnterObservable.add(() => { noBtn.background = '#9a3a3a'; });
    noBtn.onPointerOutObservable.add(() => { noBtn.background = '#7a2a2a'; });
    noBtn.onPointerClickObservable.add(() => {
      this.dismissTeleportDialog();
    });
  }

  /**
   * Remove the teleport confirmation dialog if present.
   */
  private dismissTeleportDialog(): void {
    if (this.teleportDialog) {
      this.advancedTexture.removeControl(this.teleportDialog);
      this.teleportDialog.dispose();
      this.teleportDialog = null;
    }
  }

  /**
   * Prevent the browser context menu from appearing when right-clicking
   * on the game canvas (so the teleport dialog shows instead).
   */
  private setupRightClickTeleport(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /**
   * Dispose the minimap
   */
  public dispose(): void {
    this.dismissTeleportDialog();
    this.clearMarkers();

    if (this.legendContainer) {
      this.advancedTexture.removeControl(this.legendContainer);
      this.legendContainer.dispose();
      this.legendContainer = null;
    }

    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }

    // Clean up render target and camera
    if (this.minimapRTT) {
      const idx = this.scene.customRenderTargets.indexOf(this.minimapRTT);
      if (idx >= 0) this.scene.customRenderTargets.splice(idx, 1);
      this.minimapRTT.dispose();
      this.minimapRTT = null;
    }
    if (this.minimapCamera) {
      this.minimapCamera.dispose();
      this.minimapCamera = null;
    }
    this._offscreenCanvas = null;
    this.mapImage = null;
    this.mapContainer = null;
  }
}
