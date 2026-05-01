/**
 * QuestMarkerService — unified decision layer for quest markers across the
 * 3D world and the minimap.
 *
 * Why it exists: the game previously maintained THREE parallel decision
 * trees for quest markers — one in QuestIndicatorManager (NPC 3D
 * indicators), one in QuestMinimapMarkers (minimap objective dots), and
 * one implicitly in QuestObjectManager (location pillars) / BabylonMinimap
 * (minimap NPC glyphs). Each had its own color table, its own trigger
 * logic, and its own edge-case handling. Adding a new objective type or
 * retuning a color required edits in three places and drift was already
 * visible (e.g. location pillars cyan, minimap location markers cyan but
 * different shape conventions, NPC `!` vs location pillar not matching).
 *
 * This module is the single source of truth. Every marker-rendering
 * surface consults it to decide:
 *  1. Which marker kind (if any) applies to this entity/objective right now
 *  2. What that kind looks like (color, symbol, priority)
 *  3. Whether surface-specific gating applies (e.g. "minimap suppresses
 *     all available markers while the player has an active quest")
 *
 * Design constraints (from the user):
 *  - Same visual language everywhere: 0.8m square plane with a glyph for
 *    NPCs AND locations. No more 10m pillars. No more "large circles vs
 *    small squares" depending on entity type.
 *  - 3D world: radiant `?` suppressed while player has any active quest
 *    (keeps discovery of non-radiant quest-givers intact).
 *  - Minimap: both available and radiant `?` suppressed while player has
 *    any active quest (map declutters to just active-quest markers).
 *  - Priority: turn_in > active_objective > in_progress > available >
 *    available_radiant. Higher priority wins when multiple trigger.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type QuestMarkerKind =
  /** Green ✓ — quest assigned by this NPC is ready to turn in. */
  | 'turn_in'
  /** Red ! — this NPC or location is the current active quest objective. */
  | 'active_objective'
  /** Silver ? — NPC gave the player an active quest, nothing to do with them right now. */
  | 'in_progress'
  /** Gold ? — NPC has an available non-radiant quest to offer. */
  | 'available'
  /** Muted yellow ? — NPC has an available radiant quest to offer. */
  | 'available_radiant';

export type MarkerSurface = 'world' | 'minimap';

export interface QuestMarkerStyle {
  /** Higher wins when multiple kinds could apply to the same entity. */
  priority: number;
  /** Glyph rendered inside the plane / minimap badge. */
  symbol: string;
  /** CSS color for fill (3D plane tint + minimap fill). */
  color: string;
  /** Border color for the glyph texture / minimap dot border. */
  borderColor: string;
  /** Minimap marker size in px. */
  minimapSize: number;
  /** Whether the minimap version pulses. */
  minimapPulsing: boolean;
  /** Human-readable label for hint tooltips. */
  label: string;
}

/**
 * Minimal shape of the quest entries the service reads. Intentionally loose
 * to avoid pulling the full SaveFile types into the shared helper.
 */
export interface QuestLike {
  id: string;
  status: string;
  tags?: readonly string[] | null;
  assignedByCharacterId?: string | null;
  assignedBy?: string | null;
  objectives?: ReadonlyArray<{
    type?: string;
    npcId?: string | null;
    targetNpcId?: string | null;
    objectiveLocation?: string | null;
    locationPosition?: { x: number; y?: number; z: number } | null;
    position?: { x: number; y?: number; z: number } | null;
    completed?: boolean;
    description?: string;
  } | null | undefined> | null;
}

export interface QuestMarkerContext {
  quests: readonly QuestLike[];
  /** NPC id in 'focus mode' — when set, only that NPC gets a marker. */
  activeObjectiveNpcId?: string | null;
  /** Delegate to QuestCompletionEngine. */
  questCompletionChecker?: ((questId: string) => boolean) | null;
}

// ── Style registry (the ONE place to tune appearance) ────────────────────

/**
 * Central marker style table. Every rendering surface (3D indicators,
 * minimap, interaction prompt hints) reads from here. Do not duplicate
 * these values elsewhere — add a new kind or retune in place.
 */
export const MARKER_STYLES: Record<QuestMarkerKind, QuestMarkerStyle> = {
  turn_in: {
    priority: 50,
    symbol: '✓',
    color: '#32CD32',
    borderColor: '#228b22',
    minimapSize: 14,
    minimapPulsing: true,
    label: 'Ready to turn in',
  },
  active_objective: {
    priority: 40,
    symbol: '!',
    color: '#F44336',
    borderColor: '#b71c1c',
    minimapSize: 14,
    minimapPulsing: true,
    label: 'Current objective',
  },
  in_progress: {
    priority: 30,
    symbol: '?',
    color: '#C0C0C0',
    borderColor: '#808080',
    minimapSize: 11,
    minimapPulsing: false,
    label: 'Quest in progress',
  },
  available: {
    priority: 20,
    symbol: '?',
    color: '#FFD700',
    borderColor: '#cc9900',
    minimapSize: 11,
    minimapPulsing: false,
    label: 'Quest available',
  },
  available_radiant: {
    priority: 10,
    symbol: '?',
    color: '#C0A050',
    borderColor: '#806830',
    minimapSize: 10,
    minimapPulsing: false,
    label: 'Side quest available',
  },
};

// ── State predicates ─────────────────────────────────────────────────────

/**
 * True when the player has any active (accepted, in-progress) quest. Drives
 * the minimap declutter rule and the 3D radiant suppression rule.
 */
export function hasActiveQuest(quests: readonly QuestLike[]): boolean {
  for (const q of quests) {
    if (q && q.status === 'active') return true;
  }
  return false;
}

/**
 * Radiant quests are procedurally-generated side quests tagged 'radiant'
 * (see server/services/language/quest-difficulty-adapter.ts). They exist
 * in volume and clutter the HUD when the player is mid-quest.
 */
export function isRadiantQuest(quest: QuestLike): boolean {
  const tags = quest.tags;
  if (!tags || !Array.isArray(tags)) return false;
  return tags.includes('radiant');
}

// ── NPC marker selection ─────────────────────────────────────────────────

/**
 * Resolve the marker kind for a single NPC on a given rendering surface.
 * Returns `null` when no marker should show.
 *
 * Priority resolution (first match wins):
 *   1. turn_in          — NPC assigned a quest now ready to turn in
 *   2. active_objective — `_activeObjectiveNpcId` override (focus mode)
 *      OR an active quest's current incomplete objective targets this NPC
 *   3. focus-mode suppression: if `_activeObjectiveNpcId` is set and this
 *      NPC isn't the target, return null (quiet the rest of the town)
 *   4. in_progress      — NPC is the giver of an active quest, not in step 2
 *   5. available        — NPC has an unaccepted non-radiant quest
 *   6. available_radiant — NPC has an unaccepted radiant quest
 *
 * Surface-specific gating:
 *   - world:   suppresses `available_radiant` while any quest is active
 *   - minimap: suppresses BOTH `available` and `available_radiant` while
 *              any quest is active
 */
export function selectNpcMarker(
  npc: { id: string; firstName?: string; lastName?: string },
  context: QuestMarkerContext,
  surface: MarkerSurface = 'world',
): QuestMarkerKind | null {
  const { quests, activeObjectiveNpcId, questCompletionChecker } = context;
  const npcFullName = [npc.firstName, npc.lastName].filter(Boolean).join(' ').trim();

  // 1. turn_in
  if (questCompletionChecker) {
    for (const q of quests) {
      if (!q || q.status !== 'active') continue;
      if (!npcGaveQuest(q, npc.id, npcFullName)) continue;
      if (questCompletionChecker(q.id)) return 'turn_in';
    }
  }

  // 2. active_objective (via focus-mode override)
  if (activeObjectiveNpcId && activeObjectiveNpcId === npc.id) {
    return 'active_objective';
  }

  // 2b. active_objective (via objective-match)
  for (const q of quests) {
    if (!q || q.status !== 'active') continue;
    const obj = firstIncompleteObjective(q);
    if (!obj) continue;
    if (npcMatchesObjective(obj, npc.id, npcFullName)) {
      return 'active_objective';
    }
  }

  // 3. focus-mode suppression
  if (activeObjectiveNpcId && activeObjectiveNpcId !== npc.id) {
    return null;
  }

  // 4. in_progress
  for (const q of quests) {
    if (!q || q.status !== 'active') continue;
    if (npcGaveQuest(q, npc.id, npcFullName)) return 'in_progress';
  }

  // 5 / 6. available (non-radiant first, radiant second)
  let radiantFound = false;
  for (const q of quests) {
    if (!q || q.status !== 'available') continue;
    if (!npcGaveQuest(q, npc.id, npcFullName)) continue;
    if (!isRadiantQuest(q)) {
      // Minimap hides all available markers while any quest is active.
      if (surface === 'minimap' && hasActiveQuest(quests)) return null;
      return 'available';
    }
    radiantFound = true;
  }
  if (radiantFound) {
    // Radiant is the lowest priority — hidden on both surfaces while any
    // quest is active (declutter rule).
    if (hasActiveQuest(quests)) return null;
    return 'available_radiant';
  }

  return null;
}

// ── Location marker selection ────────────────────────────────────────────

/**
 * Resolve the marker kind for a given quest objective pointing at a
 * location (visit_location, discover_location, and other position-anchored
 * objectives that aren't NPC-bound). Returns `null` when no marker should
 * show for that location on that surface.
 *
 * Today this is just `'active_objective'` for the first incomplete
 * objective of an active quest — locations don't have an `available` state
 * of their own (that belongs to NPCs). Kept as a function for symmetry
 * with `selectNpcMarker` and to leave room for future states (e.g.
 * `turn_in` dropoff points).
 */
export function selectLocationMarker(
  quest: QuestLike,
  objective: NonNullable<QuestLike['objectives']>[number],
  context: QuestMarkerContext,
  _surface: MarkerSurface = 'world',
): QuestMarkerKind | null {
  if (!objective) return null;
  if (quest.status !== 'active') return null;
  if (objective.completed) return null;
  // NPC-bound objectives are handled by selectNpcMarker; skip them here.
  const objLoc = objective.objectiveLocation ?? '';
  if (typeof objLoc === 'string' && objLoc.startsWith('npc(')) return null;
  if (objective.npcId || objective.targetNpcId) return null;
  return 'active_objective';
}

// ── Helpers (private to the module) ──────────────────────────────────────

function firstIncompleteObjective(
  quest: QuestLike,
): NonNullable<QuestLike['objectives']>[number] | null {
  const objs = quest.objectives;
  if (!Array.isArray(objs)) return null;
  for (const obj of objs) {
    if (obj && !obj.completed) return obj;
  }
  return null;
}

function npcMatchesObjective(
  objective: NonNullable<QuestLike['objectives']>[number],
  npcId: string,
  npcFullName: string,
): boolean {
  if (!objective) return false;
  if (objective.npcId && objective.npcId === npcId) return true;
  if (objective.targetNpcId && objective.targetNpcId === npcId) return true;
  const locRef = typeof objective.objectiveLocation === 'string'
    ? objective.objectiveLocation
    : '';
  if (!locRef) return false;
  const match = locRef.match(/^npc\(\s*'?([^')]+)'?\s*\)$/);
  if (!match) return false;
  const refName = match[1];
  if (!refName) return false;
  if (refName === npcId) return true;
  if (npcFullName && refName.toLowerCase() === npcFullName.toLowerCase()) return true;
  return false;
}

function npcGaveQuest(
  quest: QuestLike,
  npcId: string,
  npcFullName: string,
): boolean {
  if (quest.assignedByCharacterId && quest.assignedByCharacterId === npcId) return true;
  if (
    quest.assignedBy &&
    npcFullName &&
    String(quest.assignedBy).toLowerCase() === npcFullName.toLowerCase()
  ) {
    return true;
  }
  return false;
}
