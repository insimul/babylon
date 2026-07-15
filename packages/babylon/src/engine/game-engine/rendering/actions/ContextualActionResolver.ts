/**
 * ContextualActionResolver
 *
 * Determines the available actions for a given InteractableTarget.
 * Each action carries French/English labels for language learning,
 * plus energy/duration/tool metadata for the ContextualActionMenu.
 *
 * This resolver is the single source of truth for "what can the player do
 * with this target?" — replacing the hard-coded switch in handleUnifiedInteraction.
 */

import type { InteractableTarget } from '../InteractionPromptSystem';
import type { PlayerActionSystem, PhysicalActionType } from '../PlayerActionSystem';
import type { ContextualAction } from './ContextualActionMenu';
import type { CEFRLevel } from '@shared/language/cefr';
import { translateMenuTitle } from '@shared/language/in-world-text';
import type { UIImmersionMode } from '@shared/language/ui-localization';
import { getActionLabel, type TranslationLookupFn } from '@shared/language/action-labels';

// ── Action icons ─────────────────────────────────────────────────────────────

const PHYSICAL_ACTION_ICONS: Record<string, string> = {
  fishing: '🎣',
  mining: '⛏️',
  harvesting: '🌾',
  cooking: '🍳',
  crafting: '🔨',
  painting: '🎨',
  reading: '📖',
  praying: '🙏',
  sweeping: '🧹',
  chopping: '🪓',
  herbalism: '🌿',
  farm_plant: '🌱',
  farm_water: '💧',
  farm_harvest: '🌾',
};

// ── Dynamic action labels ────────────────────────────────────────────────────

/** Module-level translation lookup — set via setActionTranslationLookup(). */
let _translationLookup: TranslationLookupFn | undefined;

/**
 * Set the translation lookup function for action labels.
 * Call this once when the game initialises (e.g., from the HoverTranslationSystem cache).
 */
export function setActionTranslationLookup(fn: TranslationLookupFn): void {
  _translationLookup = fn;
}

/** Resolve the label pair for an action id, using the current translation lookup. */
function actionLabels(actionId: string): { label: string; labelTranslation: string } {
  return getActionLabel(actionId, _translationLookup);
}

// ── French menu title translations ──────────────────────────────────────────

const MENU_TITLE_FRENCH: Record<string, string> = {
  'Object': 'Objet',
  'Notice Board': "Tableau d'affichage",
  'Furniture': 'Meuble',
  'Actions': 'Actions',
  'Container': 'Contenant',
  'Crafting Station': 'Atelier',
  'Interact': 'Interagir',
};

// ── Context required for resolution ─────��──────────────────────��─────────────

export interface ActionResolverContext {
  /** PlayerActionSystem for checking physical action availability. */
  playerActionSystem: PlayerActionSystem | null;
  /** Nearby action hotspot types (from InteractionPromptSystem). */
  nearbyActionHotspotTypes: string[];
  /** Whether the player is inside a building. */
  isInsideBuilding: boolean;
  /** Current building business type (if inside). */
  currentBusinessType: string | null;
  /** Whether this NPC is a placed interior NPC with business interactions. */
  hasBusinessInteractions: boolean;
  /** Whether the player has items in their inventory (for give_gift). */
  hasInventoryItems: boolean;
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve available actions for a target. Returns a flat list of ContextualAction
 * objects suitable for the ContextualActionMenu.
 */
export function resolveActions(
  target: InteractableTarget,
  context: ActionResolverContext,
): ContextualAction[] {
  switch (target.type) {
    case 'npc':
      return resolveNPCActions(target, context);
    case 'building':
      return resolveBuildingActions(target);
    case 'sign':
    case 'object':
      return resolveObjectActions(target);
    case 'notice_board':
      return resolveNoticeBoardActions(target);
    case 'furniture':
      return resolveFurnitureActions(target);
    case 'action_hotspot':
      return resolvePhysicalActions(target, context);
    case 'container':
      return resolveContainerActions(target);
    case 'crafting_station':
      return resolveCraftingStationActions(target);
    default:
      return [];
  }
}

/**
 * Resolve the menu title for a target.
 * When cefrLevel is provided, translates fallback titles (Object, Furniture, etc.)
 * using the locations namespace priority.
 */
export function resolveMenuOptions(
  target: InteractableTarget,
  cefrLevel?: CEFRLevel,
  immersionMode?: UIImmersionMode,
): { title: string; titleIcon?: string } {
  const t = (english: string): string => {
    if (!cefrLevel) return english;
    return translateMenuTitle(english, MENU_TITLE_FRENCH[english], cefrLevel, immersionMode);
  };

  switch (target.type) {
    case 'npc':
      return { title: target.name, titleIcon: '👤' };
    case 'building':
      return { title: target.name, titleIcon: '🏠' };
    case 'sign':
    case 'object':
      return { title: target.name || t('Object'), titleIcon: '🔍' };
    case 'notice_board':
      return { title: target.name || t('Notice Board'), titleIcon: '📋' };
    case 'furniture':
      return { title: target.name || t('Furniture'), titleIcon: '🪑' };
    case 'action_hotspot':
      return { title: t('Actions'), titleIcon: '💪' };
    case 'container':
      return { title: target.name || t('Container'), titleIcon: '📦' };
    case 'crafting_station':
      return { title: target.name || t('Crafting Station'), titleIcon: '🔨' };
    default:
      return { title: t('Interact') };
  }
}

// ── Per-type resolvers ───────────────────────────────────────────────────────

function resolveNPCActions(
  target: InteractableTarget,
  context: ActionResolverContext,
): ContextualAction[] {
  const actions: ContextualAction[] = [];

  // Talk is always available for NPCs
  actions.push({
    id: '__talk__',
    icon: '💬',
    ...actionLabels('talk'),
    canPerform: true,
    category: 'social',
  });

  // If inside a business and NPC has business interactions, add a business action
  if (context.isInsideBuilding && context.hasBusinessInteractions) {
    actions.push({
      id: '__business__',
      icon: '🏪',
      label: 'Services',
      labelTranslation: 'Business Services',
      canPerform: true,
      category: 'social',
    });
  }

  // Browse Wares — available for merchant NPCs even outside buildings
  const npcRole = target.npcRole;
  if (npcRole === 'merchant' && !context.hasBusinessInteractions) {
    actions.push({
      id: '__browse_wares__',
      icon: '🛒',
      label: 'Browse Wares',
      labelTranslation: 'Shop',
      canPerform: true,
      category: 'social',
    });
  }

  // Give Gift — physical romance action, available when player has inventory items
  actions.push({
    id: '__give_gift__',
    icon: '🎁',
    ...actionLabels('give_gift'),
    canPerform: context.hasInventoryItems,
    reason: context.hasInventoryItems ? undefined : 'No items to give',
    category: 'social',
  });

  return actions;
}

function resolveBuildingActions(target: InteractableTarget): ContextualAction[] {
  return [{
    id: '__enter_building__',
    icon: '🚪',
    ...actionLabels('enter'),
    description: target.name,
    canPerform: true,
    category: 'navigation',
  }];
}

function resolveObjectActions(target: InteractableTarget): ContextualAction[] {
  const actions: ContextualAction[] = [];

  // Check if it's a book that can be picked up
  if (target.objectRole === 'book' && target.mesh.metadata?.bookData) {
    actions.push({
      id: '__pick_up_book__',
      icon: '📕',
      ...actionLabels('pick_up'),
      canPerform: true,
      category: 'inventory',
    });
  } else if (target.possessable) {
    // Any possessable world item can be picked up
    actions.push({
      id: '__pick_up__',
      icon: '🤲',
      ...actionLabels('pick_up'),
      canPerform: true,
      category: 'inventory',
    });
  }

  // Examine is always available
  actions.push({
    id: '__examine__',
    icon: '🔍',
    ...actionLabels('examine'),
    canPerform: true,
    category: 'examine',
  });

  return actions;
}

function resolveNoticeBoardActions(_target: InteractableTarget): ContextualAction[] {
  return [{
    id: '__read_notice_board__',
    icon: '📋',
    ...actionLabels('read'),
    canPerform: true,
    category: 'examine',
  }];
}

function resolveFurnitureActions(target: InteractableTarget): ContextualAction[] {
  const actions: ContextualAction[] = [];
  const fType = target.furnitureType;

  if (fType === 'seat' || fType === 'bed') {
    actions.push({
      id: '__furniture_sit__',
      icon: fType === 'bed' ? '🛏️' : '🪑',
      ...actionLabels('sit'),
      canPerform: true,
      category: 'physical',
    });
  } else if (fType === 'bookshelf') {
    actions.push({
      id: '__furniture_read__',
      icon: '📚',
      ...actionLabels('read'),
      canPerform: true,
      category: 'examine',
    });
  } else if (fType === 'workstation') {
    actions.push({
      id: '__furniture_use__',
      icon: '🔧',
      ...actionLabels('use'),
      canPerform: true,
      category: 'physical',
    });
  } else {
    // Generic furniture interaction
    actions.push({
      id: '__furniture_use__',
      icon: '✋',
      ...actionLabels('use'),
      canPerform: true,
      category: 'physical',
    });
  }

  return actions;
}

function resolvePhysicalActions(
  target: InteractableTarget,
  context: ActionResolverContext,
): ContextualAction[] {
  if (!context.playerActionSystem) return [];

  // Gather all nearby action hotspot types (not just the targeted one)
  const hotspotTypes = context.nearbyActionHotspotTypes.length > 0
    ? context.nearbyActionHotspotTypes
    : target.actionHotspotType ? [target.actionHotspotType] : [];

  if (hotspotTypes.length === 0) return [];

  const availability = context.playerActionSystem.checkAvailability(
    hotspotTypes as PhysicalActionType[],
  );

  return availability.map((entry) => {
    const labels = actionLabels(entry.definition.type);
    // If no translation was found, fall back to the action system's displayName
    const finalLabels = labels.label !== entry.definition.type
      ? labels
      : { label: entry.definition.displayName, labelTranslation: entry.definition.displayName };

    return {
      id: `__physical_${entry.definition.type}__`,
      icon: PHYSICAL_ACTION_ICONS[entry.definition.type] ?? '⚙️',
      ...finalLabels,
      energyCost: entry.definition.energyCost,
      duration: entry.definition.duration,
      requiredTool: entry.definition.requiredTool,
      canPerform: entry.canPerform,
      reason: entry.reason,
      category: 'physical' as const,
    };
  });
}

function resolveContainerActions(target: InteractableTarget): ContextualAction[] {
  const actions: ContextualAction[] = [];

  actions.push({
    id: '__open_container__',
    icon: target.containerType === 'chest' ? '🗃️' : target.containerType === 'barrel' ? '🛢️' : '📦',
    ...actionLabels('open'),
    description: target.name,
    canPerform: true,
    category: 'inventory',
  });

  return actions;
}

function resolveCraftingStationActions(target: InteractableTarget): ContextualAction[] {
  const stationType = target.craftingStationType ?? 'workbench';
  const stationActionMap: Record<string, { actionId: string; icon: string }> = {
    kitchen_stove: { actionId: 'cooking', icon: '🍳' },
    alchemy_table: { actionId: 'brew', icon: '⚗️' },
    workbench: { actionId: 'crafting', icon: '🔨' },
  };
  const info = stationActionMap[stationType] ?? stationActionMap.workbench;
  const stationLabels = actionLabels(info.actionId);

  return [{
    id: `__craft_at_${stationType}__`,
    icon: info.icon,
    ...stationLabels,
    canPerform: true,
    category: 'physical',
  }];
}
