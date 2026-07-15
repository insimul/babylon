/**
 * QuestHotspotManager
 *
 * Manages temporary action hotspots spawned by quest objectives.
 * When a quest requires a physical action at a specific location (e.g.,
 * "dance at the town square"), this manager creates the hotspot mesh,
 * registers it with InteractionPromptSystem, and adds a minimap marker.
 *
 * Hotspots have two states:
 *   - **staged**: Mesh exists but is hidden, not interactable, no minimap marker.
 *     Used when the objective exists but is blocked by earlier objectives.
 *   - **active**: Visible glow on ground, registered for interaction, pulsing "!"
 *     exclamation marker on the minimap. Used when the objective is "up next".
 *
 * Hotspots are removed entirely when the quest completes/fails/is abandoned.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { InteractionPromptSystem } from './InteractionPromptSystem';
import type { BabylonMinimap } from './BabylonMinimap';
import { PlayerActionSystem } from './PlayerActionSystem';

// ── Types ────────────────────────────────────────────────────────────────────

interface QuestHotspotEntry {
  questId: string;
  objectiveId: string;
  actionType: string;
  label: string;
  mesh: Mesh;
  glowMesh: Mesh;
  minimapMarkerId: string;
  /** Whether the hotspot is currently active (interactable + visible on minimap). */
  isActive: boolean;
}

// ── Manager ──────────────────────────────────────────────────────────────────

export class QuestHotspotManager {
  private scene: Scene;
  private interactionPrompt: InteractionPromptSystem;
  private minimap: BabylonMinimap | null;
  private hotspots: Map<string, QuestHotspotEntry> = new Map();

  constructor(
    scene: Scene,
    interactionPrompt: InteractionPromptSystem,
    minimap: BabylonMinimap | null,
  ) {
    this.scene = scene;
    this.interactionPrompt = interactionPrompt;
    this.minimap = minimap;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Create a quest hotspot. Starts in **staged** (hidden) state.
   * Call `refreshActiveState()` after all hotspots are spawned to activate
   * whichever objectives are currently "up next".
   */
  spawnHotspot(
    questId: string,
    objectiveId: string,
    actionType: string,
    position: Vector3,
    label?: string,
  ): void {
    const key = `${questId}_${objectiveId}`;
    if (this.hotspots.has(key)) return;

    // Invisible but pickable sphere for interaction detection
    const mesh = MeshBuilder.CreateSphere(
      `quest_hotspot_${key}`,
      { diameter: 1.5 },
      this.scene,
    );
    mesh.position = position.clone();
    mesh.isPickable = false;   // starts staged — not pickable
    mesh.isVisible = false;

    // Ground glow disc (child of mesh so it moves/disposes together)
    const glowMesh = MeshBuilder.CreateDisc(
      `quest_hotspot_glow_${key}`,
      { radius: 1.2 },
      this.scene,
    );
    glowMesh.position = new Vector3(0, 0.05, 0);
    glowMesh.rotation.x = Math.PI / 2;
    const glowMat = new StandardMaterial(`quest_hotspot_mat_${key}`, this.scene);
    glowMat.diffuseColor = new Color3(1.0, 0.6, 0.1);
    glowMat.alpha = 0.5;
    glowMat.emissiveColor = new Color3(1.0, 0.6, 0.1);
    glowMesh.material = glowMat;
    glowMesh.parent = mesh;
    glowMesh.isVisible = false; // starts hidden

    const promptLabel = label || PlayerActionSystem.getPromptText(actionType as any);

    this.hotspots.set(key, {
      questId,
      objectiveId,
      actionType,
      label: promptLabel,
      mesh,
      glowMesh,
      minimapMarkerId: `quest_hotspot_${key}`,
      isActive: false,
    });
  }

  /**
   * Remove a specific quest hotspot entirely.
   */
  removeHotspot(questId: string, objectiveId: string): void {
    const key = `${questId}_${objectiveId}`;
    const entry = this.hotspots.get(key);
    if (!entry) return;

    // Deactivate first (unregister interaction + minimap)
    if (entry.isActive) this.deactivate(entry);

    entry.mesh.getChildMeshes().forEach((child) => child.dispose());
    entry.mesh.dispose();
    this.hotspots.delete(key);
  }

  /**
   * Remove all hotspots for a quest (on completion/abandon/fail).
   */
  removeAllForQuest(questId: string): void {
    const keys = Array.from(this.hotspots.keys()).filter(
      (k) => this.hotspots.get(k)!.questId === questId,
    );
    for (const key of keys) {
      const entry = this.hotspots.get(key)!;
      this.removeHotspot(entry.questId, entry.objectiveId);
    }
  }

  // ── Active state management ──────────────────────────────────────────────

  /**
   * Refresh which hotspots are active based on which objectives are "up next".
   *
   * @param isObjectiveNext A callback that returns true if the given
   *   (questId, objectiveId) is the next incomplete, non-blocked objective.
   *   Typically delegates to QuestCompletionEngine.isObjectiveLocked().
   */
  refreshActiveState(
    isObjectiveNext: (questId: string, objectiveId: string) => boolean,
  ): void {
    this.hotspots.forEach((entry) => {
      const shouldBeActive = isObjectiveNext(entry.questId, entry.objectiveId);

      if (shouldBeActive && !entry.isActive) {
        this.activate(entry);
      } else if (!shouldBeActive && entry.isActive) {
        this.deactivate(entry);
      }
    });
  }

  private activate(entry: QuestHotspotEntry): void {
    entry.isActive = true;

    // Make pickable + register for interaction
    entry.mesh.isPickable = true;
    entry.glowMesh.isVisible = true;
    this.interactionPrompt.registerActionHotspot(
      entry.mesh,
      entry.actionType,
      entry.label,
    );

    // Add pulsing exclamation marker to minimap
    if (this.minimap) {
      this.minimap.addMarker({
        id: entry.minimapMarkerId,
        position: entry.mesh.position,
        type: 'exclamation',
        label: entry.label,
        color: '#ffcc00',
      });
    }
  }

  private deactivate(entry: QuestHotspotEntry): void {
    entry.isActive = false;

    // Hide and unregister
    entry.mesh.isPickable = false;
    entry.glowMesh.isVisible = false;
    this.interactionPrompt.unregisterActionHotspot(entry.mesh);

    // Remove minimap marker
    this.minimap?.removeMarker(entry.minimapMarkerId);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  hasHotspot(questId: string, objectiveId: string): boolean {
    return this.hotspots.has(`${questId}_${objectiveId}`);
  }

  getHotspotActionType(questId: string, objectiveId: string): string | null {
    return this.hotspots.get(`${questId}_${objectiveId}`)?.actionType ?? null;
  }

  isHotspotActive(questId: string, objectiveId: string): boolean {
    return this.hotspots.get(`${questId}_${objectiveId}`)?.isActive ?? false;
  }

  dispose(): void {
    this.hotspots.forEach((entry) => {
      if (entry.isActive) this.deactivate(entry);
      entry.mesh.getChildMeshes().forEach((child) => child.dispose());
      entry.mesh.dispose();
    });
    this.hotspots.clear();
  }
}
