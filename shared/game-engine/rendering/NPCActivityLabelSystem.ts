/**
 * NPC Activity Label System
 *
 * Manages floating activity labels above NPCs performing visible activities
 * and tracks proximity-based observation for quest objectives.
 *
 * Activity labels:
 * - Small text above NPC heads (e.g., "Cooking", "Painting", "Reading")
 * - Only visible within 15m of the player
 * - Auto-update when activity changes
 *
 * Observation tracking:
 * - Monitors player proximity to working NPCs
 * - When player is within 10m for 5+ seconds, fires 'activity_observed' event
 */

import { Mesh, Vector3, DynamicTexture, StandardMaterial, Scene, Color3 } from '@babylonjs/core';

// ---------- Types ----------

export interface ActivityLabelCallbacks {
  /** Get the player's current world position */
  getPlayerPosition: () => Vector3 | null;
  /** Get an NPC's current visible activity (null = no activity) */
  getNPCActivity: (npcId: string) => string | null;
  /** Get an NPC's display name */
  getNPCName: (npcId: string) => string;
  /** Get an NPC mesh by ID */
  getNPCMesh: (npcId: string) => Mesh | null;
  /** Called when player has observed an NPC activity for the required duration */
  onActivityObserved: (npcId: string, npcName: string, activity: string, durationSeconds: number) => void;
  /** Called each update with observation progress (0-1). Return false to suppress. */
  onObservationProgress?: (npcId: string, npcName: string, activity: string, progress: number) => void;
}

/** Per-NPC observation state */
interface ObservationState {
  /** NPC ID being observed */
  npcId: string;
  /** Activity being observed */
  activity: string;
  /** Real-time timestamp when observation started */
  startTime: number;
  /** Whether the observation has already been reported (avoid duplicate events) */
  reported: boolean;
}

// ---------- Constants ----------

/** Maximum distance for activity labels to be visible */
const LABEL_VISIBLE_DISTANCE = 15;
/** Maximum distance for observation to count */
const OBSERVE_DISTANCE = 10;
/** Minimum observation duration in seconds */
const OBSERVE_DURATION_SECONDS = 5;
/** Label update interval in milliseconds (no need to update every frame) */
const LABEL_UPDATE_INTERVAL_MS = 500;

// ---------- System ----------

export class NPCActivityLabelSystem {
  private scene: Scene;
  private callbacks: ActivityLabelCallbacks;

  /** Floating label meshes per NPC */
  private labels: Map<string, Mesh> = new Map();
  /** Cached activity strings to avoid unnecessary label rebuilds */
  private cachedActivities: Map<string, string | null> = new Map();
  /** Observation tracking for nearby NPCs */
  private observations: Map<string, ObservationState> = new Map();
  /** Timestamp of last label update pass */
  private lastUpdateTime: number = 0;
  /** All registered NPC IDs to check */
  private registeredNPCs: Set<string> = new Set();

  constructor(scene: Scene, callbacks: ActivityLabelCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  // ---------- Registration ----------

  registerNPC(npcId: string): void {
    this.registeredNPCs.add(npcId);
  }

  unregisterNPC(npcId: string): void {
    this.registeredNPCs.delete(npcId);
    this.removeLabel(npcId);
    this.observations.delete(npcId);
    this.cachedActivities.delete(npcId);
  }

  // ---------- Main Update ----------

  /**
   * Call every frame. Updates label visibility/content and observation tracking.
   */
  update(now: number): void {
    const playerPos = this.callbacks.getPlayerPosition();
    if (!playerPos) return;

    // Update labels at reduced frequency
    const shouldUpdateLabels = now - this.lastUpdateTime >= LABEL_UPDATE_INTERVAL_MS;
    if (shouldUpdateLabels) {
      this.lastUpdateTime = now;
    }

    const npcIds = Array.from(this.registeredNPCs);
    for (const npcId of npcIds) {
      const npcMesh = this.callbacks.getNPCMesh(npcId);
      if (!npcMesh) continue;

      const dist = Vector3.Distance(playerPos, npcMesh.position);
      const activity = this.callbacks.getNPCActivity(npcId);

      // --- Activity Labels ---
      if (shouldUpdateLabels) {
        this.updateLabel(npcId, npcMesh, activity, dist);
      }

      // --- Observation Tracking ---
      this.updateObservation(npcId, activity, dist, now);
    }
  }

  // ---------- Label Management ----------

  private updateLabel(npcId: string, npcMesh: Mesh, activity: string | null, dist: number): void {
    const cached = this.cachedActivities.get(npcId);

    // Show label only if NPC has an activity AND is within range
    if (activity && dist <= LABEL_VISIBLE_DISTANCE) {
      if (cached !== activity) {
        // Activity changed — rebuild label
        this.removeLabel(npcId);
        this.createLabel(npcId, npcMesh, activity);
        this.cachedActivities.set(npcId, activity);
      }
      // Make sure label is visible
      const label = this.labels.get(npcId);
      if (label) {
        label.isVisible = true;
        // Update position to track NPC head
        label.position.copyFrom(npcMesh.position);
        label.position.y += 2.5; // Above head
      }
    } else {
      // Hide or remove label
      const label = this.labels.get(npcId);
      if (label) {
        label.isVisible = false;
      }
      if (cached !== activity) {
        this.cachedActivities.set(npcId, activity);
      }
    }
  }

  private createLabel(npcId: string, npcMesh: Mesh, activity: string): void {
    const displayText = activity.charAt(0).toUpperCase() + activity.slice(1);

    // Create dynamic texture for the label
    const textureWidth = 256;
    const textureHeight = 48;
    const texture = new DynamicTexture(`actLabel_tex_${npcId}`, { width: textureWidth, height: textureHeight }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext();
    ctx.clearRect(0, 0, textureWidth, textureHeight);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const radius = 6;
    const x = 8;
    const y = 4;
    const w = textureWidth - 16;
    const h = textureHeight - 8;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#FFFFFF';
    (ctx as any).textAlign = 'center';
    (ctx as any).textBaseline = 'middle';
    ctx.fillText(displayText, textureWidth / 2, textureHeight / 2);

    texture.update();

    // Create billboard plane
    const plane = Mesh.CreatePlane(`actLabel_${npcId}`, 1, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.scaling.x = 1.5;
    plane.scaling.y = 0.3;

    const mat = new StandardMaterial(`actLabel_mat_${npcId}`, this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    // Position above NPC
    plane.position.copyFrom(npcMesh.position);
    plane.position.y += 2.5;

    // Don't pick this mesh
    plane.isPickable = false;

    this.labels.set(npcId, plane);
  }

  private removeLabel(npcId: string): void {
    const label = this.labels.get(npcId);
    if (label) {
      label.dispose();
      this.labels.delete(npcId);
    }
  }

  // ---------- Observation Tracking ----------

  private updateObservation(npcId: string, activity: string | null, dist: number, now: number): void {
    const existing = this.observations.get(npcId);

    if (!activity || dist > OBSERVE_DISTANCE) {
      // Not observing — clear state
      if (existing) {
        this.observations.delete(npcId);
      }
      return;
    }

    if (existing) {
      // Check if activity changed
      if (existing.activity !== activity) {
        // Activity changed — restart observation
        this.observations.set(npcId, { npcId, activity, startTime: now, reported: false });
        return;
      }

      // Check if observation duration met
      if (!existing.reported) {
        const elapsedSeconds = (now - existing.startTime) / 1000;
        const progress = Math.min(1, elapsedSeconds / OBSERVE_DURATION_SECONDS);
        const npcName = this.callbacks.getNPCName(npcId);

        // Fire progress callback for UI
        this.callbacks.onObservationProgress?.(npcId, npcName, activity, progress);

        if (elapsedSeconds >= OBSERVE_DURATION_SECONDS) {
          existing.reported = true;
          this.callbacks.onActivityObserved(npcId, npcName, activity, elapsedSeconds);
        }
      }
    } else {
      // Start new observation
      this.observations.set(npcId, { npcId, activity, startTime: now, reported: false });
    }
  }

  // ---------- Query ----------

  /**
   * Get the current observation duration for an NPC (in seconds).
   * Returns 0 if not currently observing.
   */
  getObservationDuration(npcId: string, now: number): number {
    const obs = this.observations.get(npcId);
    if (!obs) return 0;
    return (now - obs.startTime) / 1000;
  }

  // ---------- Cleanup ----------

  dispose(): void {
    const labels = Array.from(this.labels.values());
    for (const label of labels) {
      label.dispose();
    }
    this.labels.clear();
    this.observations.clear();
    this.cachedActivities.clear();
    this.registeredNPCs.clear();
  }
}
