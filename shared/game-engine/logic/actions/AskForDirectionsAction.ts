/**
 * AskForDirectionsAction — handles the "ask_for_directions" action.
 *
 * When the player asks an NPC for directions, the system finds reachable
 * locations via pathfinding and generates target-language direction
 * instructions based on player fluency.
 */

import type { Action, ActionContext, ActionResult, ActionEffect } from '@shared/game-engine/types';
import {
  generateDirectionSteps,
  type DirectionStep,
  type DirectionQuestConfig,
  type LocationInfo as DirectionLocationInfo,
  type Position,
} from '../../../quests/quest-generator.js';

export type FluencyTier = 'beginner' | 'intermediate' | 'advanced';

/** Resolve fluency tier from a 0–100 score. */
export function getFluencyTier(fluency: number): FluencyTier {
  if (fluency >= 60) return 'advanced';
  if (fluency >= 30) return 'intermediate';
  return 'beginner';
}

/** Info about a location known to the pathfinding system. */
export interface KnownLocation {
  id: string;
  name: string;
  position: Position;
  type: string;
}

/** Parameters needed to execute the ask_for_directions action. */
export interface AskForDirectionsParams {
  /** Player's current position */
  playerPosition: Position;
  /** NPC's current position (used as direction origin) */
  npcPosition: Position;
  /** Locations reachable from the NPC's position */
  nearbyLocations: KnownLocation[];
  /** Target language for direction instructions */
  targetLanguage: string;
  /** Player's fluency score (0–100) in the target language */
  playerFluency: number;
  /** Optional: specific destination the player asked about */
  requestedDestination?: string;
}

/** Result of the direction generation. */
export interface DirectionsResult {
  /** The destination location */
  destination: KnownLocation;
  /** Step-by-step directions in the target language */
  steps: DirectionStep[];
  /** Fluency tier used for difficulty */
  fluencyTier: FluencyTier;
}

/**
 * Build the canonical ask_for_directions Action object.
 */
export function createAskForDirectionsAction(id: string): Action {
  return {
    id,
    worldId: null,
    name: 'Ask for Directions',
    description: 'Ask a nearby NPC for directions to a location in the target language',
    actionType: 'social',
    category: 'exploration',
    duration: 2,
    difficulty: 0.2,
    energyCost: 0,
    targetType: 'npc',
    requiresTarget: true,
    range: 5,
    isAvailable: true,
    cooldown: 5,
    verbPast: 'asked for directions',
    verbPresent: 'asking for directions',
    narrativeTemplates: [
      '{actor} asks {target} for directions.',
      '{actor} stops {target} to ask for directions.',
      '{actor} politely asks {target} how to get somewhere.',
    ],
    customData: {},
    tags: ['exploration', 'language-learning', 'social', 'navigation'],
    isBase: true,
    content: [
      '% Action: Ask for Directions',
      '% Ask an NPC for directions to practice navigation vocabulary',
      '% Type: social / exploration',
      '',
      'action(ask_for_directions, \'Ask for Directions\', social, 0).',
      'action_difficulty(ask_for_directions, 0.2).',
      'action_duration(ask_for_directions, 2).',
      'action_target_type(ask_for_directions, npc).',
      'action_requires_target(ask_for_directions).',
      'action_range(ask_for_directions, 5).',
      'action_cooldown(ask_for_directions, 5).',
      '',
      'action_effect(ask_for_directions, add_knowledge(Actor, directions)).',
      '',
      '% Can Actor perform this action?',
      'can_perform(Actor, ask_for_directions, Target) :-',
      '    is_npc(Target),',
      '    nearby(Actor, Target, 5).',
    ].join('\n'),
  };
}

/**
 * Pick the best destination from available locations.
 * If the player requested a specific place, try to match it by name.
 * Otherwise pick a random location that isn't too close.
 */
export function selectDestination(
  params: AskForDirectionsParams,
): KnownLocation | null {
  const { nearbyLocations, requestedDestination } = params;

  if (nearbyLocations.length === 0) return null;

  // If the player asked for a specific destination, fuzzy-match by name
  if (requestedDestination) {
    const query = requestedDestination.toLowerCase();
    const match = nearbyLocations.find(
      loc => loc.name.toLowerCase().includes(query) || query.includes(loc.name.toLowerCase()),
    );
    if (match) return match;
  }

  // Pick a random location from the available ones
  return nearbyLocations[Math.floor(Math.random() * nearbyLocations.length)];
}

/**
 * Generate directions from the NPC to the destination.
 */
export function generateDirections(
  params: AskForDirectionsParams,
  destination: KnownLocation,
): DirectionsResult {
  const tier = getFluencyTier(params.playerFluency);

  const directionLocations: DirectionLocationInfo[] = params.nearbyLocations.map(loc => ({
    name: loc.name,
    position: loc.position,
  }));

  const config: DirectionQuestConfig = {
    stepCount: 3,
    startPosition: params.npcPosition,
    locations: directionLocations.filter(loc => loc.name !== destination.name),
    targetLanguage: params.targetLanguage,
    difficulty: tier,
  };

  // Generate intermediate steps, then add the final destination
  const intermediateSteps = generateDirectionSteps(config);

  // Always include a final step pointing to the actual destination
  const finalStep: DirectionStep = {
    instruction: `${destination.name}`,
    englishHint: `Arrive at ${destination.name}`,
    targetPosition: destination.position,
    radius: tier === 'beginner' ? 8 : tier === 'intermediate' ? 6 : 4,
  };

  // Use intermediate steps if they exist, otherwise just the final destination
  const steps = intermediateSteps.length > 0
    ? [...intermediateSteps, finalStep]
    : [finalStep];

  return { destination, steps, fluencyTier: tier };
}

/**
 * Format direction steps for display in the chat panel.
 */
export function formatDirectionsForDisplay(result: DirectionsResult): string {
  const { destination, steps, fluencyTier } = result;
  const lines: string[] = [];

  lines.push(`Directions to ${destination.name}:`);
  lines.push('');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (fluencyTier === 'beginner') {
      lines.push(`${i + 1}. ${step.instruction} (${step.englishHint})`);
    } else {
      lines.push(`${i + 1}. ${step.instruction}`);
    }
  }

  return lines.join('\n');
}

/**
 * Execute the ask_for_directions action.
 */
export function executeAskForDirections(
  action: Action,
  context: ActionContext,
  params: AskForDirectionsParams,
): ActionResult {
  const destination = selectDestination(params);

  if (!destination) {
    return {
      success: false,
      message: 'The NPC doesn\'t know of any nearby locations to give directions to.',
      effects: [],
      energyUsed: 0,
      narrativeText: 'The NPC shrugs — they don\'t know any nearby places.',
    };
  }

  const result = generateDirections(params, destination);
  const displayText = formatDirectionsForDisplay(result);

  const effects: ActionEffect[] = [
    {
      type: 'knowledge',
      target: context.actor,
      value: {
        destinationId: destination.id,
        destinationName: destination.name,
        steps: result.steps,
        fluencyTier: result.fluencyTier,
        targetLanguage: params.targetLanguage,
      },
      description: `Learned directions to ${destination.name}`,
    },
  ];

  return {
    success: true,
    message: `${action.name} performed successfully`,
    effects,
    energyUsed: action.energyCost ?? 0,
    narrativeText: displayText,
  };
}
