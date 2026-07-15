/**
 * NPC Simulation LOD (Level of Detail) System
 *
 * Centralizes distance-based LOD management for NPC simulation to maintain
 * target frame rate with many active NPCs. Provides:
 *
 * - Five LOD tiers: near / medium / far / very_far / offscreen
 * - Frame-based adaptive tick rates per tier (e.g. every 1/3/10/30 frames)
 * - AI complexity per tier: full personality-driven vs. simplified random walk vs. paused
 * - Quality presets capping the maximum number of simultaneously-active NPCs
 * - Quest-relevance + proximity prioritization when over the active cap
 * - Settlement-scoped culling (NPCs outside player's settlement are paused)
 * - Per-frame NPC simulation-time monitoring with auto-reduce above 8ms
 * - Staggered evaluations, object pooling, and animation instance sharing
 */

import { Vector3, Mesh, Scene } from '@babylonjs/core';

// --- LOD Tier Definitions ---

export type LODTier = 'near' | 'medium' | 'far' | 'very_far' | 'offscreen';

/** AI complexity level — callers choose which action-selection path to run. */
export type AIComplexity = 'full' | 'simplified' | 'paused';

/** Hardware-driven quality preset; caps the number of simultaneously-active NPCs. */
export type QualityPreset = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

/** Distance thresholds for LOD tiers (metres). */
export const LOD_DISTANCES = {
  /** Near: full personality-driven AI, pathfinding, lip sync. */
  NEAR_MAX: 20,
  /** Medium: full AI, simplified animation. */
  MEDIUM_MAX: 50,
  /** Far: simplified AI (random walk), mesh hidden if off-screen. */
  FAR_MAX: 100,
  /** Beyond FAR_MAX → very_far tier. */
  OFFSCREEN_CHECK_MS: 5000,
} as const;

/** Per-preset cap on simultaneously-active NPCs (non-capped NPCs become paused). */
export const QUALITY_PRESET_MAX_ACTIVE: Record<QualityPreset, number> = {
  minimal: 8,
  low: 15,
  medium: 30,
  high: 60,
  ultra: 100,
};

/** Per-tier update configuration. */
export interface LODTierConfig {
  /** Frame-based tick interval (1 = every frame, 3 = every 3rd, Infinity = paused). */
  tickIntervalFrames: number;
  /** Movement controller update interval in ms (0 = every frame, -1 = paused). */
  movementUpdateMs: number;
  /** AI complexity level callers should run for this NPC. */
  aiComplexity: AIComplexity;
  /** Animation enabled. */
  animationEnabled: boolean;
  /** Full pathfinding enabled. */
  pathfindingEnabled: boolean;
  /** Lip sync enabled. */
  lipSyncEnabled: boolean;
  /** Mesh visible. */
  meshVisible: boolean;
  /** Collision enabled. */
  collisionEnabled: boolean;
  /** Animation blending (crossfade) enabled. */
  blendingEnabled: boolean;
}

const TIER_CONFIG: Record<LODTier, LODTierConfig> = {
  near: {
    tickIntervalFrames: 1,
    movementUpdateMs: 0,
    aiComplexity: 'full',
    animationEnabled: true,
    pathfindingEnabled: true,
    lipSyncEnabled: true,
    meshVisible: true,
    collisionEnabled: true,
    blendingEnabled: true,
  },
  medium: {
    tickIntervalFrames: 3,
    movementUpdateMs: 100,
    aiComplexity: 'full',
    animationEnabled: true,
    pathfindingEnabled: false,
    lipSyncEnabled: false,
    meshVisible: true,
    collisionEnabled: false,
    blendingEnabled: false,
  },
  far: {
    tickIntervalFrames: 10,
    movementUpdateMs: 500,
    aiComplexity: 'simplified',
    animationEnabled: false,
    pathfindingEnabled: false,
    lipSyncEnabled: false,
    meshVisible: false,
    collisionEnabled: false,
    blendingEnabled: false,
  },
  very_far: {
    tickIntervalFrames: 30,
    movementUpdateMs: 2000,
    aiComplexity: 'simplified',
    animationEnabled: false,
    pathfindingEnabled: false,
    lipSyncEnabled: false,
    meshVisible: false,
    collisionEnabled: false,
    blendingEnabled: false,
  },
  offscreen: {
    tickIntervalFrames: Number.POSITIVE_INFINITY,
    movementUpdateMs: -1,
    aiComplexity: 'paused',
    animationEnabled: false,
    pathfindingEnabled: false,
    lipSyncEnabled: false,
    meshVisible: false,
    collisionEnabled: false,
    blendingEnabled: false,
  },
};

// --- NPC Registration ---

export interface LODNPCRegistration {
  /** True if this NPC is involved in an active/tracked quest (priority when capping). */
  questRelevant?: boolean;
  /** Settlement the NPC belongs to; used for settlement-scoped culling. */
  settlementId?: string | null;
  /** Billboard LOD mesh (cheap quad shown at far distance). */
  billboard?: Mesh | null;
}

export interface LODNPCEntry {
  npcId: string;
  mesh: Mesh;
  /** Billboard LOD mesh (cheap quad shown at medium/far distance). */
  billboard: Mesh | null;
  /** Current LOD tier. */
  tier: LODTier;
  /** Distance to player (updated each evaluation). */
  distance: number;
  /** Last time this NPC's movement was updated (ms). */
  lastMovementUpdate: number;
  /** Frame on which this NPC was last ticked. */
  lastTickFrame: number;
  /** Last time this NPC's tier was evaluated (ms). */
  lastTierEval: number;
  /** Current animation name (for instancing dedup). */
  currentAnimation: string;
  /** Whether this NPC is in a conversation (exempt from LOD degradation). */
  inConversation: boolean;
  /** Schedule target position — used for far-tier teleporting. */
  scheduleTarget: Vector3 | null;
  /** True if this NPC is quest-relevant (priority when over active cap). */
  questRelevant: boolean;
  /** Settlement ownership for scoped culling; null = no settlement. */
  settlementId: string | null;
  /** True if this NPC was capped out (beyond active-NPC budget) this frame. */
  capped: boolean;
}

// --- Object Pool ---

export interface MeshPoolEntry {
  mesh: Mesh;
  skeletonType: string;
  inUse: boolean;
}

// --- Animation Instance Group ---

interface AnimationInstanceGroup {
  animationName: string;
  npcIds: Set<string>;
  lastEvalFrame: number;
}

// --- Frame Budget Monitor ---

export interface FrameBudgetStats {
  /** Rolling average frame time in ms (delta passed to update). */
  avgFrameTimeMs: number;
  /** Rolling average NPC simulation time in ms (measured inside update). */
  avgSimTimeMs: number;
  /** Whether quality reduction is active. */
  qualityReduced: boolean;
  /** Current NPC update frequency multiplier (1.0 = normal, 2.0 = half speed). */
  updateFrequencyMultiplier: number;
  /** Number of NPCs per tier. */
  tierCounts: Record<LODTier, number>;
  /** Number of NPCs capped out this frame (over max-active budget). */
  cappedCount: number;
  /** Current quality preset. */
  qualityPreset: QualityPreset;
  /** Max active NPCs allowed under current preset. */
  maxActiveNPCs: number;
}

// --- Update Result ---

export interface LODUpdateResult {
  /** NPCs that should receive a movement update this frame. */
  updateSet: Set<string>;
  /** NPCs that should run full (personality-driven) AI action selection. */
  aiFullSet: Set<string>;
  /** NPCs that should run simplified (random walk) AI this frame. */
  aiSimplifiedSet: Set<string>;
}

// --- Main Class ---

export class NPCSimulationLOD {
  private scene: Scene;

  private npcs: Map<string, LODNPCEntry> = new Map();
  private meshPool: MeshPoolEntry[] = [];
  private animationGroups: Map<string, AnimationInstanceGroup> = new Map();

  private frameTimes: number[] = [];
  private simTimes: number[] = [];
  private static readonly FRAME_HISTORY = 60;
  private static readonly QUALITY_REDUCE_THRESHOLD = 18; // ~55fps overall frame budget
  private static readonly QUALITY_RESTORE_THRESHOLD = 15; // ~67fps
  /** NPC sim time above this (rolling avg, ms) triggers auto-reduce. */
  private static readonly SIM_TIME_BUDGET_MS = 8;

  private frameCounter = 0;
  private static readonly STAGGER_WINDOW = 10;

  private _qualityReduced = false;
  private _updateFrequencyMultiplier = 1.0;

  private playerPosition: Vector3 | null = null;

  /** Settlement the player is currently in; null = wilderness. */
  private currentSettlementId: string | null = null;
  /** If true, NPCs outside current settlement get paused (offscreen tier). */
  private settlementCullingEnabled = true;

  /** Active quality preset; determines max active NPC count. */
  private qualityPreset: QualityPreset = 'medium';

  private lastCappedCount = 0;

  private static readonly MAX_POOLED_MESHES = 50;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  // ---- Public API ----

  registerNPC(
    npcId: string,
    mesh: Mesh,
    billboardOrOptions?: Mesh | null | LODNPCRegistration,
    options?: LODNPCRegistration,
  ): void {
    // Back-compat: old signature was `(id, mesh, billboard?)`.
    let billboard: Mesh | null = null;
    let questRelevant = false;
    let settlementId: string | null = null;

    if (billboardOrOptions && typeof (billboardOrOptions as Mesh).getScene === 'function') {
      billboard = billboardOrOptions as Mesh;
    } else if (billboardOrOptions && typeof billboardOrOptions === 'object') {
      const opts = billboardOrOptions as LODNPCRegistration;
      billboard = opts.billboard ?? null;
      questRelevant = opts.questRelevant ?? false;
      settlementId = opts.settlementId ?? null;
    }

    if (options) {
      if (options.billboard !== undefined) billboard = options.billboard;
      if (options.questRelevant !== undefined) questRelevant = options.questRelevant;
      if (options.settlementId !== undefined) settlementId = options.settlementId;
    }

    this.npcs.set(npcId, {
      npcId,
      mesh,
      billboard,
      tier: 'near',
      distance: 0,
      lastMovementUpdate: 0,
      lastTickFrame: -1,
      lastTierEval: 0,
      currentAnimation: 'idle',
      inConversation: false,
      scheduleTarget: null,
      questRelevant,
      settlementId,
      capped: false,
    });
  }

  unregisterNPC(npcId: string): void {
    const entry = this.npcs.get(npcId);
    if (entry) {
      this.removeFromAnimationGroup(npcId, entry.currentAnimation);
      this.npcs.delete(npcId);
    }
  }

  setPlayerPosition(position: Vector3): void {
    this.playerPosition = position;
  }

  /** Set the player's current settlement (null = wilderness); enables settlement-scoped culling. */
  setCurrentSettlement(settlementId: string | null): void {
    this.currentSettlementId = settlementId;
  }

  /** Enable or disable settlement-scoped culling (default: enabled). */
  setSettlementCullingEnabled(enabled: boolean): void {
    this.settlementCullingEnabled = enabled;
  }

  /** Set the active quality preset, which caps simultaneously-active NPCs. */
  setQualityPreset(preset: QualityPreset): void {
    this.qualityPreset = preset;
  }

  getQualityPreset(): QualityPreset {
    return this.qualityPreset;
  }

  getMaxActiveNPCs(): number {
    return QUALITY_PRESET_MAX_ACTIVE[this.qualityPreset];
  }

  /** Update whether an NPC is quest-relevant (priority when over active cap). */
  setQuestRelevant(npcId: string, relevant: boolean): void {
    const entry = this.npcs.get(npcId);
    if (entry) entry.questRelevant = relevant;
  }

  /** Update the settlement an NPC belongs to (for scoped culling). */
  setNPCSettlement(npcId: string, settlementId: string | null): void {
    const entry = this.npcs.get(npcId);
    if (entry) entry.settlementId = settlementId;
  }

  setInConversation(npcId: string, inConversation: boolean): void {
    const entry = this.npcs.get(npcId);
    if (entry) {
      entry.inConversation = inConversation;
      if (inConversation) {
        this.applyTierChange(entry, 'near');
      }
    }
  }

  setScheduleTarget(npcId: string, target: Vector3 | null): void {
    const entry = this.npcs.get(npcId);
    if (entry) {
      entry.scheduleTarget = target;
    }
  }

  setNPCAnimation(npcId: string, animationName: string): void {
    const entry = this.npcs.get(npcId);
    if (!entry) return;
    const oldAnim = entry.currentAnimation;
    if (oldAnim === animationName) return;
    this.removeFromAnimationGroup(npcId, oldAnim);
    entry.currentAnimation = animationName;
    this.addToAnimationGroup(npcId, animationName);
  }

  /**
   * Main update — call once per frame from the game loop. Evaluates LOD tiers
   * for staggered NPCs, applies tier changes, enforces the active-NPC cap,
   * and monitors per-frame NPC simulation time.
   *
   * @returns `LODUpdateResult` describing which NPCs tick, which run full AI,
   *          and which run simplified AI this frame. The returned `Set<string>`
   *          is the `updateSet` for backwards compatibility: callers that
   *          destructure `{ updateSet }` or that only used the returned set
   *          continue to work unchanged.
   */
  update(deltaTimeMs: number): LODUpdateResult {
    const simStart = this.now();
    this.frameCounter++;

    this.frameTimes.push(deltaTimeMs);
    if (this.frameTimes.length > NPCSimulationLOD.FRAME_HISTORY) {
      this.frameTimes.shift();
    }

    const updateSet = new Set<string>();
    const aiFullSet = new Set<string>();
    const aiSimplifiedSet = new Set<string>();

    if (!this.playerPosition) {
      this.npcs.forEach((entry) => {
        if (entry.tier === 'near') {
          updateSet.add(entry.npcId);
          aiFullSet.add(entry.npcId);
        }
      });
      this.recordSimTime(simStart);
      this.updateFrameBudget();
      return { updateSet, aiFullSet, aiSimplifiedSet };
    }

    const playerPos = this.playerPosition;
    const staggerSlot = this.frameCounter % NPCSimulationLOD.STAGGER_WINDOW;
    const freqMult = this._updateFrequencyMultiplier;
    const maxActive = this.getMaxActiveNPCs();
    const now = this.now();

    // ---- Pass 1: update distances + compute candidate tiers for every NPC ----
    const entries = Array.from(this.npcs.values());
    let npcIndex = 0;
    for (const entry of entries) {
      const slotMatch = (npcIndex % NPCSimulationLOD.STAGGER_WINDOW) === staggerSlot;
      npcIndex++;

      if (entry.mesh && entry.mesh.position) {
        entry.distance = Vector3.Distance(playerPos, entry.mesh.position);
      } else {
        entry.distance = Infinity;
      }

      if (slotMatch || entry.inConversation) {
        const newTier = this.computeTier(entry);
        if (newTier !== entry.tier) {
          this.applyTierChange(entry, newTier);
        }
        entry.lastTierEval = now;
      }
    }

    // ---- Pass 2: enforce active-NPC cap via prioritization ----
    const cappedIds = this.applyActiveCap(entries, maxActive);
    this.lastCappedCount = cappedIds.size;

    // ---- Pass 3: decide per-NPC ticking + AI complexity ----
    for (const entry of entries) {
      if (cappedIds.has(entry.npcId)) {
        // Capped → paused; no tick, no AI this frame.
        continue;
      }

      const config = TIER_CONFIG[entry.tier];

      // Frame-based tick gate: skip if not our frame this cycle.
      const interval = Math.max(1, Math.round(config.tickIntervalFrames * freqMult));
      if (!Number.isFinite(interval)) continue;
      if (entry.lastTickFrame >= 0 && this.frameCounter - entry.lastTickFrame < interval) {
        continue;
      }
      entry.lastTickFrame = this.frameCounter;

      // Time-based movement gate (kept for back-compat with existing movement controllers).
      if (config.movementUpdateMs < 0) {
        continue;
      }
      if (config.movementUpdateMs === 0) {
        updateSet.add(entry.npcId);
      } else {
        const ms = config.movementUpdateMs * freqMult;
        if (now - entry.lastMovementUpdate >= ms) {
          entry.lastMovementUpdate = now;
          updateSet.add(entry.npcId);
        }
      }

      // AI complexity routing.
      if (config.aiComplexity === 'full') {
        aiFullSet.add(entry.npcId);
      } else if (config.aiComplexity === 'simplified') {
        aiSimplifiedSet.add(entry.npcId);
      }
    }

    this.recordSimTime(simStart);
    this.updateFrameBudget();

    return { updateSet, aiFullSet, aiSimplifiedSet };
  }

  getTier(npcId: string): LODTier | null {
    return this.npcs.get(npcId)?.tier ?? null;
  }

  getTierConfig(tier: LODTier): LODTierConfig {
    return TIER_CONFIG[tier];
  }

  getDistance(npcId: string): number {
    return this.npcs.get(npcId)?.distance ?? Infinity;
  }

  /** Get the AI complexity this NPC should run right now (honours capping). */
  getAIComplexity(npcId: string): AIComplexity {
    const entry = this.npcs.get(npcId);
    if (!entry) return 'paused';
    if (entry.capped) return 'paused';
    return TIER_CONFIG[entry.tier].aiComplexity;
  }

  /** Frames between simulation ticks for this NPC under current multiplier (1 = every frame). */
  getTickIntervalFrames(npcId: string): number {
    const entry = this.npcs.get(npcId);
    if (!entry) return Number.POSITIVE_INFINITY;
    if (entry.capped) return Number.POSITIVE_INFINITY;
    const base = TIER_CONFIG[entry.tier].tickIntervalFrames;
    if (!Number.isFinite(base)) return base;
    return Math.max(1, Math.round(base * this._updateFrequencyMultiplier));
  }

  shouldPathfind(npcId: string): boolean {
    const entry = this.npcs.get(npcId);
    if (!entry || entry.capped) return false;
    return TIER_CONFIG[entry.tier].pathfindingEnabled;
  }

  shouldLipSync(npcId: string): boolean {
    const entry = this.npcs.get(npcId);
    if (!entry || entry.capped) return false;
    return TIER_CONFIG[entry.tier].lipSyncEnabled;
  }

  shouldAnimate(npcId: string): boolean {
    const entry = this.npcs.get(npcId);
    if (!entry || entry.capped) return false;
    return TIER_CONFIG[entry.tier].animationEnabled;
  }

  /** True when this NPC is paused because it exceeded the active-NPC cap. */
  isCapped(npcId: string): boolean {
    return this.npcs.get(npcId)?.capped ?? false;
  }

  getStats(): FrameBudgetStats {
    const tierCounts: Record<LODTier, number> = {
      near: 0,
      medium: 0,
      far: 0,
      very_far: 0,
      offscreen: 0,
    };
    this.npcs.forEach((entry) => {
      tierCounts[entry.tier]++;
    });

    return {
      avgFrameTimeMs: this.getAverage(this.frameTimes),
      avgSimTimeMs: this.getAverage(this.simTimes),
      qualityReduced: this._qualityReduced,
      updateFrequencyMultiplier: this._updateFrequencyMultiplier,
      tierCounts,
      cappedCount: this.lastCappedCount,
      qualityPreset: this.qualityPreset,
      maxActiveNPCs: this.getMaxActiveNPCs(),
    };
  }

  getAllEntries(): LODNPCEntry[] {
    return Array.from(this.npcs.values());
  }

  // ---- Object Pooling ----

  acquireMesh(skeletonType: string): Mesh | null {
    const available = this.meshPool.find(
      (e) => !e.inUse && e.skeletonType === skeletonType
    );
    if (available) {
      available.inUse = true;
      available.mesh.setEnabled(true);
      return available.mesh;
    }
    return null;
  }

  releaseMesh(mesh: Mesh): void {
    const poolEntry = this.meshPool.find((e) => e.mesh === mesh);
    if (poolEntry) {
      poolEntry.inUse = false;
      poolEntry.mesh.setEnabled(false);
      poolEntry.mesh.position.set(0, -1000, 0);
    }
  }

  addToPool(mesh: Mesh, skeletonType: string): void {
    if (this.meshPool.length >= NPCSimulationLOD.MAX_POOLED_MESHES) return;
    this.meshPool.push({ mesh, skeletonType, inUse: false });
    mesh.setEnabled(false);
    mesh.position.set(0, -1000, 0);
  }

  getPoolStats(): { total: number; inUse: number; available: number } {
    const inUse = this.meshPool.filter((e) => e.inUse).length;
    return {
      total: this.meshPool.length,
      inUse,
      available: this.meshPool.length - inUse,
    };
  }

  // ---- Animation Instancing ----

  getAnimationInstanceGroup(animationName: string): string[] {
    const group = this.animationGroups.get(animationName);
    if (!group) return [];
    return Array.from(group.npcIds);
  }

  isAnimationLeader(npcId: string): boolean {
    const entry = this.npcs.get(npcId);
    if (!entry) return false;
    const group = this.animationGroups.get(entry.currentAnimation);
    if (!group || group.npcIds.size === 0) return true;
    const firstId = group.npcIds.values().next().value;
    return firstId === npcId;
  }

  // ---- Cleanup ----

  dispose(): void {
    this.npcs.clear();
    this.meshPool.forEach((e) => {
      e.inUse = false;
    });
    this.meshPool = [];
    this.animationGroups.clear();
    this.frameTimes = [];
    this.simTimes = [];
  }

  // ---- Internal Methods ----

  private computeTier(entry: LODNPCEntry): LODTier {
    if (entry.inConversation) return 'near';

    // Settlement-scoped culling: NPCs outside the player's settlement are paused
    // unless they are within the near band (so a questgiver loitering at a gate
    // doesn't vanish the moment the player steps over the settlement boundary).
    if (
      this.settlementCullingEnabled
      && this.currentSettlementId !== null
      && entry.settlementId !== null
      && entry.settlementId !== this.currentSettlementId
      && entry.distance > LOD_DISTANCES.NEAR_MAX
    ) {
      return 'offscreen';
    }

    const dist = entry.distance;
    if (dist <= LOD_DISTANCES.NEAR_MAX) return 'near';
    if (dist <= LOD_DISTANCES.MEDIUM_MAX) return 'medium';
    if (dist <= LOD_DISTANCES.FAR_MAX) {
      if (this.isOnScreen(entry.mesh)) return 'far';
      return 'offscreen';
    }
    // Beyond FAR_MAX.
    if (this.isOnScreen(entry.mesh)) return 'very_far';
    return 'offscreen';
  }

  private isOnScreen(mesh: Mesh): boolean {
    if (!mesh || !this.scene.activeCamera) return false;
    return this.scene.activeCamera.isInFrustum(mesh);
  }

  private applyTierChange(entry: LODNPCEntry, newTier: LODTier): void {
    entry.tier = newTier;
    const config = TIER_CONFIG[newTier];

    if (entry.mesh) {
      if (config.meshVisible) {
        if (!entry.mesh.isEnabled()) entry.mesh.setEnabled(true);
      } else {
        if (entry.mesh.isEnabled()) entry.mesh.setEnabled(false);
      }
    }

    if (entry.billboard) {
      // Show billboard at far/very_far (cheap placeholder for distant NPCs).
      if (newTier === 'far' || newTier === 'very_far') {
        if (entry.mesh) {
          entry.billboard.position.copyFrom(entry.mesh.position);
          entry.billboard.position.y += 1.2;
        }
        if (!entry.billboard.isEnabled()) entry.billboard.setEnabled(true);
      } else {
        if (entry.billboard.isEnabled()) entry.billboard.setEnabled(false);
      }
    }

    if (entry.mesh) {
      entry.mesh.checkCollisions = config.collisionEnabled;
    }

    // Teleport to schedule target when degrading past visible tiers — keeps
    // off-camera NPCs plausibly at their scheduled location without us having
    // to pathfind them there.
    if (
      (newTier === 'far' || newTier === 'very_far' || newTier === 'offscreen')
      && entry.scheduleTarget
      && entry.mesh
    ) {
      entry.mesh.position.copyFrom(entry.scheduleTarget);
    }
  }

  /**
   * Enforce the active-NPC cap. Returns the set of NPC IDs that are capped
   * (i.e. paused this frame) because they did not make the priority cut.
   *
   * Priority ordering (higher wins):
   *   1. inConversation NPCs
   *   2. quest-relevant NPCs (per PRD: prioritize quest-relevant + nearest)
   *   3. near-tier NPCs
   *   4. nearest by distance
   *
   * NPCs in offscreen/very_far tiers are not counted against the active cap
   * since they already run at minimal cost.
   */
  private applyActiveCap(entries: LODNPCEntry[], maxActive: number): Set<string> {
    const capped = new Set<string>();

    // Eligible = NPCs in near/medium/far that actually cost meaningful cycles.
    const eligible = entries.filter(
      (e) => e.tier === 'near' || e.tier === 'medium' || e.tier === 'far',
    );

    if (eligible.length <= maxActive) {
      // Nobody needs to be capped; clear any stale capped flags.
      for (const e of entries) {
        if (e.capped) e.capped = false;
      }
      return capped;
    }

    const tierRank: Record<LODTier, number> = {
      near: 0,
      medium: 1,
      far: 2,
      very_far: 3,
      offscreen: 4,
    };

    eligible.sort((a, b) => {
      if (a.inConversation !== b.inConversation) return a.inConversation ? -1 : 1;
      if (a.questRelevant !== b.questRelevant) return a.questRelevant ? -1 : 1;
      const tr = tierRank[a.tier] - tierRank[b.tier];
      if (tr !== 0) return tr;
      return a.distance - b.distance;
    });

    for (let i = 0; i < eligible.length; i++) {
      const entry = eligible[i];
      const shouldCap = i >= maxActive;
      entry.capped = shouldCap;
      if (shouldCap) capped.add(entry.npcId);
    }

    // Non-eligible entries are implicitly not capped (they are already paused).
    for (const e of entries) {
      if (!eligible.includes(e) && e.capped) e.capped = false;
    }

    return capped;
  }

  private recordSimTime(simStart: number): void {
    const elapsed = this.now() - simStart;
    this.simTimes.push(elapsed);
    if (this.simTimes.length > NPCSimulationLOD.FRAME_HISTORY) {
      this.simTimes.shift();
    }
  }

  /**
   * Update frame/simulation budget monitoring and adjust quality if needed.
   * Reduces NPC update frequency when either (a) overall frame time is poor
   * or (b) NPC simulation alone exceeds the per-frame sim-time budget.
   */
  private updateFrameBudget(): void {
    const avgFrame = this.getAverage(this.frameTimes);
    const avgSim = this.getAverage(this.simTimes);

    const overBudget =
      avgFrame > NPCSimulationLOD.QUALITY_REDUCE_THRESHOLD
      || avgSim > NPCSimulationLOD.SIM_TIME_BUDGET_MS;
    const recovered =
      avgFrame < NPCSimulationLOD.QUALITY_RESTORE_THRESHOLD
      && avgSim < NPCSimulationLOD.SIM_TIME_BUDGET_MS * 0.75;

    if (!this._qualityReduced && overBudget) {
      this._qualityReduced = true;
      this._updateFrequencyMultiplier = 2.0;
    } else if (this._qualityReduced && recovered) {
      this._qualityReduced = false;
      this._updateFrequencyMultiplier = 1.0;
    }
  }

  private getAverage(arr: number[]): number {
    if (arr.length === 0) return 0;
    let sum = 0;
    for (const t of arr) sum += t;
    return sum / arr.length;
  }

  /** performance.now() if available (browser/node-18+), else Date.now(). */
  private now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  // ---- Animation Instancing Helpers ----

  private addToAnimationGroup(npcId: string, animationName: string): void {
    let group = this.animationGroups.get(animationName);
    if (!group) {
      group = {
        animationName,
        npcIds: new Set<string>(),
        lastEvalFrame: 0,
      };
      this.animationGroups.set(animationName, group);
    }
    group.npcIds.add(npcId);
  }

  private removeFromAnimationGroup(npcId: string, animationName: string): void {
    const group = this.animationGroups.get(animationName);
    if (!group) return;
    group.npcIds.delete(npcId);
    if (group.npcIds.size === 0) {
      this.animationGroups.delete(animationName);
    }
  }
}
