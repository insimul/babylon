/**
 * Quest Minimap Markers
 *
 * Derives minimap marker data from quest objective data. Each incomplete
 * objective with a known position produces a marker. After the marker
 * unification (see QuestMarkerService), all active-quest objective
 * markers are colored uniformly red (`active_objective` in the unified
 * taxonomy) regardless of objective type — the type-specific color
 * palette that used to live here has been retired because it duplicated
 * the 3D indicator styling and made "what does red mean?" inconsistent
 * across surfaces.
 *
 * Objective type is still carried forward as a SHAPE distinction
 * (location → diamond, everything else → circle) so the minimap can
 * still hint "go somewhere" vs "do something with a person/item" without
 * relying on color.
 */

import type { Quest } from '@shared/game-engine/system-contracts';
import { MARKER_STYLES } from './QuestMarkerService';

/**
 * Color used on BOTH the minimap and the in-world `!` indicator for any
 * active quest objective. Re-exported from the unified registry so this
 * file doesn't keep a second copy of the constant. Kept as a named export
 * for the few legacy callers that still import it.
 *
 * @deprecated Use `MARKER_STYLES.active_objective.color` directly.
 */
export const ACTIVE_OBJECTIVE_COLOR = MARKER_STYLES.active_objective.color;

/**
 * Color for objective markers on the minimap.
 *
 * Before unification this returned a different color per objective type
 * (cyan for location, green for NPC interaction, gold for items, etc.).
 * Every active objective now reads red from the unified taxonomy — the
 * shape still conveys the type distinction.
 *
 * @deprecated Kept for back-compat with any external caller. New code
 *   should read {@link MARKER_STYLES} directly.
 */
export function getObjectiveMarkerColor(_objectiveType: string): string {
  return MARKER_STYLES.active_objective.color;
}

/** Shape hint for rendering: 'diamond' for location, 'circle' for others. */
export type MarkerShape = 'diamond' | 'circle';

export function getObjectiveMarkerShape(objectiveType: string): MarkerShape {
  switch (objectiveType) {
    case 'visit_location':
    case 'discover_location':
    case 'navigate_language':
    case 'follow_directions':
      return 'diamond';
    default:
      return 'circle';
  }
}

// ── Marker extraction ───────────────────────────────────────────────────────

export interface QuestObjectiveMarker {
  id: string;
  questId: string;
  questTitle: string;
  objectiveType: string;
  objectiveDescription: string;
  position: { x: number; z: number };
  color: string;
  shape: MarkerShape;
}

/**
 * Extract minimap markers from all active quests' incomplete objectives.
 * Every incomplete objective produces a marker. Position resolution order:
 *   1. objective.locationPosition
 *   2. objective.position
 *   3. quest-level locationPosition
 *   4. dynamically resolved position (from DynamicQuestWaypointDirector)
 *
 * @param quests - All quests (only active quests with incomplete objectives produce markers)
 * @param resolvedPositions - Optional map of objectiveId → position from DynamicQuestWaypointDirector.
 *   Key format: `${questId}_${objectiveId}` matching the director's output.
 */
export function extractObjectiveMarkers(
  quests: Quest[],
  resolvedPositions?: Map<string, { x: number; z: number }>,
  /** Named locations that can be referenced by objective location atoms (e.g., notice_board → {x, z}) */
  namedLocations?: Map<string, { x: number; z: number }>,
  /** NPC id the player must currently reach (e.g. the assessment conversation
   *  target). Objectives that point to this NPC are recolored red so the
   *  minimap marker matches the red `!` above the NPC's head. */
  activeObjectiveNpcId?: string | null,
): QuestObjectiveMarker[] {
  const markers: QuestObjectiveMarker[] = [];

  for (const quest of quests) {
    if (quest.status !== 'active') continue;
    if (!quest.objectives || quest.objectives.length === 0) continue;

    // Quest-level fallback position
    const questPos = (quest as any).locationPosition as { x: number; y?: number; z: number } | undefined;

    // Only show marker for the first incomplete objective (the current one)
    // This prevents cluttering the map with markers for future objectives
    let foundCurrent = false;
    for (let i = 0; i < quest.objectives.length; i++) {
      const obj = quest.objectives[i] as any;
      if (obj.completed) continue;
      if (foundCurrent) break; // only show one objective per quest
      foundCurrent = true;

      // Skip objectives targeting a SPECIFIC NPC — those show via the NPC indicator system.
      // Generic 'any_npc' still gets a location marker pointing to the nearest NPC.
      const objLoc = obj.objectiveLocation || '';
      if (objLoc.startsWith('npc(')) continue;

      // Prefer objective-level position, fall back to quest-level, then dynamic resolution
      let pos = obj.locationPosition ?? obj.position ?? questPos;

      if (!pos && resolvedPositions) {
        const markerId = `${quest.id}_obj_${i}`;
        const dynPos = resolvedPositions.get(markerId);
        if (dynPos) {
          pos = { x: dynPos.x, y: 0, z: dynPos.z } as any;
        }
      }

      // Resolve named location atoms (e.g., notice_board, any_npc, settlement)
      // Also handles Prolog terms: location('Name'), npc('Name'), merchant('Name')
      if (!pos && namedLocations && obj.objectiveLocation) {
        let locKey = obj.objectiveLocation;
        // Extract name from Prolog term wrappers: location('Name') → Name
        const termMatch = locKey.match(/^(?:location|npc|merchant|settlement)\(\s*'?([^')]+)'?\s*\)$/);
        if (termMatch) locKey = termMatch[1];
        const namedPos = namedLocations.get(locKey);
        if (namedPos) {
          pos = { x: namedPos.x, y: 0, z: namedPos.z } as any;
        }
      }

      if (!pos) continue;

      // All active-quest objective markers share the unified
      // `active_objective` color so the minimap language matches the 3D
      // indicator `!`. Focus-mode (activeObjectiveNpcId) is a no-op here
      // now — it was only needed when the per-type color table was in
      // use to pull the "important" marker out.
      void activeObjectiveNpcId;
      markers.push({
        id: `${quest.id}_obj_${i}`,
        questId: quest.id,
        questTitle: (quest as any).title || (quest as any).name || quest.id,
        objectiveType: obj.type,
        objectiveDescription: obj.description,
        position: { x: pos.x, z: pos.z },
        color: MARKER_STYLES.active_objective.color,
        shape: getObjectiveMarkerShape(obj.type),
      });
    }
  }

  return markers;
}
