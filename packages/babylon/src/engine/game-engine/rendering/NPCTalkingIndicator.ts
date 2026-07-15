/**
 * NPC Talking Indicator
 *
 * Visual indicators for NPC conversations:
 * - Speech bubble with animated ellipsis or text snippets above the NPC's head
 * - Procedural "talking" body sway animation (subtle torso bob)
 * - Works for both player-NPC and NPC-NPC conversations
 */

import {
  Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Color4,
  Vector3, Animation, TransformNode,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

interface IndicatorState {
  /** The 3D anchor mesh parented to the NPC (for GUI linking) */
  anchor: Mesh;
  /** GUI container linked to the anchor */
  container: GUI.Rectangle;
  /** The text block inside the bubble */
  textBlock: GUI.TextBlock;
  /** Tail triangle below the bubble */
  tail: GUI.Image | null;
  /** Body sway animation handle */
  swayAnimatable: any | null;
  /** Ellipsis animation interval */
  ellipsisTimer: number | null;
  /** The NPC mesh this indicator is attached to */
  npcMesh: Mesh;
}

export class NPCTalkingIndicator {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture | null = null;
  private indicators: Map<string, IndicatorState> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Set the shared GUI texture (call once after BabylonGUIManager creates it).
   * If not set, a fullscreen UI will be created on demand.
   */
  public setGUI(gui: GUI.AdvancedDynamicTexture): void {
    this.advancedTexture = gui;
  }

  private getGUI(): GUI.AdvancedDynamicTexture {
    if (!this.advancedTexture) {
      this.advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI(
        'npcTalkUI', true, this.scene,
      );
      this.advancedTexture.idealWidth = 1280;
    }
    return this.advancedTexture;
  }

  // ── Show / hide ────────────────────────────────────────────────────────────

  /**
   * Show a conversation indicator above an NPC.
   * @param npcId   Unique NPC identifier
   * @param npcMesh The NPC's root mesh
   * @param text    Optional initial text to display (defaults to animated "...")
   */
  public show(npcId: string, npcMesh: Mesh, text?: string): void {
    if (this.indicators.has(npcId)) {
      // Already showing — just update text if provided
      if (text) this.updateText(npcId, text);
      return;
    }

    const gui = this.getGUI();

    // 3D anchor above NPC head
    const anchor = MeshBuilder.CreateBox(`talkAnchor_${npcId}`, { size: 0.01 }, this.scene);
    anchor.parent = npcMesh;
    anchor.position = new Vector3(0, 2.6, 0);
    anchor.isVisible = false;
    anchor.isPickable = false;

    // ── GUI speech bubble ───────────────────────────────────────────────────

    // Outer container (holds bubble + tail)
    const container = new GUI.Rectangle(`talkBubble_${npcId}`);
    container.width = '140px';
    container.height = '44px';
    container.cornerRadius = 12;
    container.thickness = 0;
    container.background = 'rgba(255, 255, 255, 0.92)';
    container.shadowColor = 'rgba(0,0,0,0.35)';
    container.shadowBlur = 6;
    container.shadowOffsetY = 2;
    container.isPointerBlocker = false;

    // Text
    const textBlock = new GUI.TextBlock(`talkText_${npcId}`);
    textBlock.text = text || '...';
    textBlock.color = '#1a1a2e';
    textBlock.fontSize = 13;
    textBlock.fontFamily = 'system-ui, -apple-system, sans-serif';
    textBlock.textWrapping = GUI.TextWrapping.Ellipsis;
    textBlock.resizeToFit = false;
    textBlock.paddingLeft = '10px';
    textBlock.paddingRight = '10px';
    container.addControl(textBlock);

    gui.addControl(container);
    container.linkWithMesh(anchor);
    container.linkOffsetY = -30;

    // ── Tail triangle (drawn via a small stacked container) ─────────────────
    const tail = new GUI.Rectangle(`talkTail_${npcId}`);
    tail.width = '12px';
    tail.height = '8px';
    tail.thickness = 0;
    tail.background = 'rgba(255, 255, 255, 0.92)';
    tail.rotation = Math.PI / 4;
    tail.isPointerBlocker = false;
    gui.addControl(tail);
    tail.linkWithMesh(anchor);
    tail.linkOffsetY = -10;

    // ── Animated ellipsis (when no specific text provided) ──────────────────
    let ellipsisTimer: number | null = null;
    if (!text) {
      let dots = 0;
      ellipsisTimer = window.setInterval(() => {
        dots = (dots + 1) % 4;
        const dotStr = '.'.repeat(dots || 1);
        textBlock.text = dotStr;
      }, 400);
    }

    // ── Procedural body sway animation ──────────────────────────────────────
    const swayAnimatable = this.startBodySway(npcId, npcMesh);

    const state: IndicatorState = {
      anchor,
      container,
      textBlock,
      tail: tail as any,
      swayAnimatable,
      ellipsisTimer,
      npcMesh,
    };

    this.indicators.set(npcId, state);
  }

  /**
   * Update the displayed text in an existing speech bubble.
   * Useful for showing snippets of what the NPC is saying.
   */
  public updateText(npcId: string, text: string): void {
    const state = this.indicators.get(npcId);
    if (!state) return;

    // Stop ellipsis animation when real text arrives
    if (state.ellipsisTimer !== null) {
      window.clearInterval(state.ellipsisTimer);
      state.ellipsisTimer = null;
    }

    // Truncate long text for the bubble
    const maxLen = 60;
    state.textBlock.text = text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;

    // Auto-size bubble width based on text
    const estimatedWidth = Math.min(Math.max(text.length * 7 + 24, 80), 220);
    state.container.width = `${estimatedWidth}px`;
  }

  /**
   * Hide talking indicator for an NPC.
   */
  public hide(npcId: string): void {
    const state = this.indicators.get(npcId);
    if (!state) return;

    // Clean up ellipsis timer
    if (state.ellipsisTimer !== null) {
      window.clearInterval(state.ellipsisTimer);
    }

    // Stop body sway
    if (state.swayAnimatable) {
      state.swayAnimatable.stop();
    }

    // Remove GUI elements
    const gui = this.getGUI();
    gui.removeControl(state.container);
    state.container.dispose();
    if (state.tail) {
      gui.removeControl(state.tail as any);
      (state.tail as any).dispose();
    }

    // Remove 3D anchor
    state.anchor.dispose();

    this.indicators.delete(npcId);
  }

  /**
   * Check if an NPC has a talking indicator showing.
   */
  public isShowing(npcId: string): boolean {
    return this.indicators.has(npcId);
  }

  /**
   * Hide all talking indicators.
   */
  public hideAll(): void {
    for (const npcId of Array.from(this.indicators.keys())) {
      this.hide(npcId);
    }
  }

  /**
   * Clean up all resources.
   */
  public dispose(): void {
    this.hideAll();
  }

  // ── Body sway animation ─────────────────────────────────────────────────

  /**
   * Apply a subtle procedural body sway to simulate talking gestures.
   * Since the NPC models don't have a dedicated "talk" animation, we layer
   * a gentle torso rotation oscillation on top of whatever the
   * CharacterController is playing.
   */
  private startBodySway(npcId: string, npcMesh: Mesh): any {
    // Find the first child transform that looks like a torso/spine bone.
    // If none found, apply directly to the mesh (less ideal but still looks okay).
    let target: TransformNode = npcMesh;
    const children = npcMesh.getChildTransformNodes(false);
    for (const child of children) {
      const lower = child.name.toLowerCase();
      if (lower.includes('spine') || lower.includes('torso') || lower.includes('chest')) {
        target = child;
        break;
      }
    }

    // Create a subtle Z-axis rotation oscillation (side-to-side sway)
    const swayAnim = new Animation(
      `talkSway_${npcId}`,
      'rotation.z',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const amplitude = 0.04; // ~2.3 degrees — very subtle
    swayAnim.setKeys([
      { frame: 0, value: 0 },
      { frame: 20, value: amplitude },
      { frame: 40, value: 0 },
      { frame: 60, value: -amplitude },
      { frame: 80, value: 0 },
    ]);

    // Also add a tiny Y-axis head bob
    const bobAnim = new Animation(
      `talkBob_${npcId}`,
      'rotation.x',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const bobAmplitude = 0.03;
    bobAnim.setKeys([
      { frame: 0, value: 0 },
      { frame: 15, value: bobAmplitude },
      { frame: 30, value: 0 },
      { frame: 45, value: -bobAmplitude },
      { frame: 60, value: 0 },
    ]);

    // Use beginDirectAnimation to play ONLY the sway/bob animations.
    // Do NOT push to target.animations or use beginAnimation — that would
    // replay ALL animations on the mesh (walk, idle, position, etc.),
    // causing the NPC to snap to unexpected positions and "disappear."
    return this.scene.beginDirectAnimation(target, [swayAnim, bobAnim], 0, 80, true, 0.8);
  }
}
