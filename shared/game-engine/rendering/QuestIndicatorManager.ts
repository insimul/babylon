/**
 * Quest Indicator Manager
 *
 * Renders the 3D-world quest markers above NPC heads. Decision logic lives
 * in the unified {@link QuestMarkerService} so the minimap and any future
 * surface agree with what this manager paints. This file is now just the
 * Babylon rendering adapter — it consumes `selectNpcMarker(..., 'world')`
 * and looks up colors in `MARKER_STYLES`.
 *
 * The public {@link QuestIndicatorType} enum is preserved so external
 * consumers (notably the minimap via `getIndicatorTypeForNPC`) keep
 * working until they migrate to the new taxonomy in a follow-up commit.
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Vector3, DynamicTexture } from '@babylonjs/core';
import {
  selectNpcMarker,
  MARKER_STYLES,
  type QuestMarkerKind,
  type QuestLike,
} from '../logic/QuestMarkerService';

export type QuestIndicatorType = 'available' | 'objective' | 'active_target' | 'in_progress' | 'turn_in' | null;

interface QuestIndicator {
  mesh: Mesh;
  /** Legacy external enum (for getIndicatorTypeForNPC backward compat). */
  type: QuestIndicatorType;
  /** New service kind — drives the actual rendering. */
  kind: QuestMarkerKind;
  npcId: string;
  trackedMesh?: Mesh;
}

interface Quest extends QuestLike {
  completionCriteria?: any;
  progress?: any;
}

interface Character {
  id: string;
  canGiveQuests?: boolean;
  occupation?: string;
  [key: string]: any;
}

export type QuestCompletionChecker = (questId: string) => boolean;

/**
 * Map the service's unified kind back to the legacy enum consumed by
 * downstream code (minimap, interaction-prompt hint text) that has not
 * yet migrated to {@link QuestMarkerKind}. `active_objective` splits on
 * focus-mode so legacy consumers can still tell "assessment target vs
 * regular objective" apart visually on the minimap.
 *
 * Once the minimap migrates (Commit C), this mapping can be deleted and
 * the service kind returned directly.
 */
function kindToLegacyType(
  kind: QuestMarkerKind,
  isFocusModeTarget: boolean,
): QuestIndicatorType {
  switch (kind) {
    case 'turn_in': return 'turn_in';
    case 'active_objective': return isFocusModeTarget ? 'active_target' : 'objective';
    case 'in_progress': return 'in_progress';
    case 'available': return 'available';
    case 'available_radiant': return 'available';
  }
}

/**
 * Pick a glyph color (dark for light fills, light for dark fills) so the
 * symbol stays legible across the taxonomy. Parses the style's hex color
 * and uses perceived luminance — avoids hard-coding a per-kind text color
 * in a second table.
 */
function pickGlyphColor(bgHex: string): string {
  const hex = bgHex.replace('#', '').slice(0, 6);
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived luminance (Rec. 709). > 140 → light fill → dark glyph.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 140 ? '#000000' : '#ffffff';
}

export class QuestIndicatorManager {
  private scene: Scene;
  private indicators: Map<string, QuestIndicator> = new Map();
  private indicatorHeight: number = 3.0; // Height above NPC absolute position
  private questCompletionChecker: QuestCompletionChecker | null = null;
  /** NPC ID that is the current target for any_npc objectives (e.g., assessment conversation) */
  private _activeObjectiveNpcId: string | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Set a delegate that checks quest completion via QuestCompletionEngine.
   * When set, isQuestReadyToTurnIn delegates to this instead of reimplementing.
   */
  /** Set the NPC that is the active target for any_npc / assessment objectives */
  setActiveObjectiveNpc(npcId: string | null): void {
    this._activeObjectiveNpcId = npcId;
  }

  /** Check if an NPC is the active quest objective target (not a radiant quest giver) */
  isActiveObjectiveTarget(npcId: string): boolean {
    return this._activeObjectiveNpcId === npcId;
  }

  setQuestCompletionChecker(checker: QuestCompletionChecker): void {
    this.questCompletionChecker = checker;
  }

  /**
   * Update all NPC indicators based on current quest state
   */
  public updateIndicators(
    npcs: Map<string, { mesh: Mesh; character: Character }>,
    quests: Quest[]
  ): void {
    npcs.forEach((npcData, npcId) => {
      const kind = this.selectKind(npcData.character, quests, npcId);
      this.setIndicator(npcId, npcData.mesh, kind);
    });
  }

  /**
   * Resolve the marker kind for a single NPC via the unified service.
   * Thin wrapper — existed here historically; kept so callers that pass
   * only a character still work.
   */
  private selectKind(
    npc: Character,
    quests: Quest[],
    npcId?: string,
  ): QuestMarkerKind | null {
    return selectNpcMarker(
      {
        id: npcId ?? npc.id,
        firstName: npc.firstName,
        lastName: npc.lastName,
      },
      {
        quests,
        activeObjectiveNpcId: this._activeObjectiveNpcId,
        questCompletionChecker: this.questCompletionChecker,
      },
      'world',
    );
  }

  /**
   * Reset the active radiant NPC (called when the current radiant quest is accepted/completed).
   * The next updateIndicators() call will pick a new NPC.
   */
  public resetRadiantMarker(): void {
    // No-op — all NPCs with available quests now show indicators
  }

  /**
   * Check if a quest is ready to be turned in
   */
  private isQuestReadyToTurnIn(quest: Quest): boolean {
    // Delegate to QuestCompletionEngine when available (single source of truth)
    if (this.questCompletionChecker) {
      return this.questCompletionChecker(quest.id);
    }

    // Fallback: check objective-based completion from quest data
    if (quest.objectives && Array.isArray(quest.objectives)) {
      return quest.objectives.every((obj: any) => !!obj.completed);
    }

    // Fallback: check progress-based completion
    if (quest.completionCriteria && quest.progress) {
      const criteria = quest.completionCriteria;
      const progress = quest.progress;

      switch (criteria.type) {
        case 'vocabulary_usage':
          return (progress.currentCount || 0) >= (criteria.requiredCount || 10);
        case 'conversation_turns':
          return (progress.turnsCompleted || 0) >= (criteria.requiredTurns || 5);
        case 'grammar_pattern':
          return (progress.currentCount || 0) >= (criteria.requiredCount || 5);
        case 'conversation_engagement':
          return (progress.messagesCount || 0) >= (criteria.requiredMessages || 8);
        case 'follow_directions':
          return (progress.stepsCompleted || 0) >= (criteria.stepsRequired || criteria.requiredCount || 1);
      }
    }

    return false;
  }

  /**
   * Determine if an NPC can give quests based on their properties
   */
  private canNPCGiveQuests(npc: Character): boolean {
    // Main quest NPCs always show as quest givers
    if (npc.generationConfig?.mainQuestNPC) return true;

    // Explicit flag
    if (npc.canGiveQuests === true) return true;
    if (npc.canGiveQuests === false) return false;

    // Default: certain occupations can give quests
    const questGiverOccupations = [
      'teacher', 'professor', 'merchant', 'shopkeeper', 'guard',
      'mayor', 'innkeeper', 'blacksmith', 'librarian', 'elder',
      'captain', 'guide', 'trainer', 'master', 'chief',
      // Additional occupations common in procedurally generated worlds
      'baker', 'farmer', 'fisher', 'artisan', 'healer', 'priest',
      'herbalist', 'tailor', 'weaver', 'potter', 'hunter', 'ranger',
      'sailor', 'dock', 'harbor', 'stable', 'brewer', 'cook',
      'barkeep', 'bartender', 'clerk', 'postmaster', 'constable',
      'sheriff', 'warden', 'monk', 'nun', 'scribe', 'scholar',
      'apothecary', 'midwife', 'nurse', 'doctor', 'veterinarian',
      'musician', 'bard', 'storyteller', 'vendor', 'owner', 'keeper',
    ];

    if (npc.occupation) {
      const occupation = npc.occupation.toLowerCase();
      return questGiverOccupations.some(occ => occupation.includes(occ));
    }

    return false;
  }

  /**
   * Set or update an indicator for an NPC. Accepts the unified
   * {@link QuestMarkerKind} from the service.
   */
  public setIndicator(npcId: string, npcMesh: Mesh | null, kind: QuestMarkerKind | null): void {
    const existing = this.indicators.get(npcId);

    // Remove existing if kind changed or should be removed
    if (existing && (existing.kind !== kind || kind === null)) {
      this.removeIndicator(npcId);
    }

    // Create new indicator if needed
    if (kind && npcMesh && (!existing || existing.kind !== kind)) {
      this.createIndicator(npcId, npcMesh, kind);
    }
  }

  /**
   * Create a quest indicator above an NPC. Style (glyph, color, border)
   * comes from the single {@link MARKER_STYLES} registry in the service —
   * there is no local color table to drift.
   *
   * World-space positioning (not parented) avoids NPC meshes' negative Z
   * scale flipping the billboard.
   */
  private createIndicator(npcId: string, npcMesh: Mesh, kind: QuestMarkerKind): void {
    const style = MARKER_STYLES[kind];

    const indicator = MeshBuilder.CreatePlane(
      `quest_indicator_${npcId}`,
      { width: 0.8, height: 0.8 },
      this.scene
    );

    const absPos = npcMesh.getAbsolutePosition();
    indicator.position = new Vector3(absPos.x, absPos.y + this.indicatorHeight, absPos.z);
    indicator.billboardMode = Mesh.BILLBOARDMODE_ALL;

    // Dynamic texture — one glyph rendered inside a colored disc.
    const textureResolution = 128;
    const dynamicTexture = new DynamicTexture(
      `quest_indicator_tex_${npcId}`,
      textureResolution,
      this.scene,
      false
    );
    const ctx = dynamicTexture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, textureResolution, textureResolution);

    // Background disc
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Glyph (text color is auto-picked for contrast: dark glyph on light
    // fills like gold/silver, light glyph on red/green).
    ctx.fillStyle = pickGlyphColor(style.color);
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.symbol, 64, 68);

    dynamicTexture.update();

    const material = new StandardMaterial(`quest_indicator_mat_${npcId}`, this.scene);
    material.diffuseTexture = dynamicTexture;
    material.emissiveTexture = dynamicTexture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.backFaceCulling = false;
    indicator.material = material;

    this.indicators.set(npcId, {
      mesh: indicator,
      kind,
      type: kindToLegacyType(kind, this._activeObjectiveNpcId === npcId),
      npcId,
      trackedMesh: npcMesh,
    });
  }

  /**
   * Update indicator positions — no-op, indicators are parented to NPC meshes.
   * Kept for API compatibility.
   */
  public updatePositions(): void {
    this.indicators.forEach((indicator) => {
      if (indicator.trackedMesh && !indicator.trackedMesh.isDisposed()) {
        const absPos = indicator.trackedMesh.getAbsolutePosition();
        indicator.mesh.position.x = absPos.x;
        indicator.mesh.position.y = absPos.y + this.indicatorHeight;
        indicator.mesh.position.z = absPos.z;
      }
    });
  }

  /**
   * Remove an indicator
   */
  public removeIndicator(npcId: string): void {
    const indicator = this.indicators.get(npcId);
    if (indicator) {
      this.scene.stopAnimation(indicator.mesh);
      indicator.mesh.dispose();
      this.indicators.delete(npcId);
    }
  }

  /**
   * Force refresh indicator for a specific NPC
   */
  public refreshIndicator(npcId: string, npcMesh: Mesh, character: Character, quests: Quest[]): void {
    const kind = this.selectKind(character, quests, npcId);
    this.setIndicator(npcId, npcMesh, kind);
  }

  /**
   * Clear all indicators
   */
  public clearAll(): void {
    this.indicators.forEach((indicator, npcId) => {
      this.removeIndicator(npcId);
    });
  }

  /**
   * Get current indicator type for an NPC
   */
  public getIndicatorTypeForNPC(npcId: string): QuestIndicatorType {
    return this.indicators.get(npcId)?.type || null;
  }

  /**
   * Dispose manager
   */
  public dispose(): void {
    this.clearAll();
  }
}
