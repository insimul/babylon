/**
 * ReadSignAction — handles the "read_sign" action for environmental text interaction.
 *
 * When the player reads a sign, notice, or other environmental text object,
 * this handler resolves the sign's content based on the player's language
 * fluency tier and produces a knowledge effect with the sign text.
 */

import type { Action, ActionContext, ActionResult, ActionEffect } from '../../runtime-types';

/** Data attached to a readable sign or environmental text object. */
export interface SignData {
  signId: string;
  /** Text in the target (learning) language */
  targetText: string;
  /** Text in the player's native language */
  nativeText: string;
  /** Optional category for vocabulary tracking */
  category?: string;
}

export type FluencyTier = 'beginner' | 'intermediate' | 'advanced';

/** Resolve fluency tier from a 0–100 score. */
export function getFluencyTier(fluency: number): FluencyTier {
  if (fluency >= 60) return 'advanced';
  if (fluency >= 30) return 'intermediate';
  return 'beginner';
}

/**
 * Format sign text for display based on the player's fluency tier.
 *
 * - Beginner:      "targetText (nativeText)"
 * - Intermediate:  "targetText"
 * - Advanced:      "targetText"
 */
export function formatSignText(sign: SignData, tier: FluencyTier): string {
  if (tier === 'beginner') {
    return `${sign.targetText} (${sign.nativeText})`;
  }
  return sign.targetText;
}

/**
 * Build the canonical read_sign Action object.
 * Can be used as a base action or merged with world-specific overrides.
 */
export function createReadSignAction(id: string): Action {
  return {
    id,
    worldId: null,
    name: 'Read Sign',
    description: 'Read a nearby sign, notice, or environmental text to learn vocabulary',
    actionType: 'mental',
    category: 'exploration',
    duration: 1,
    difficulty: 0.1,
    energyCost: 0,
    targetType: 'object',
    requiresTarget: true,
    range: 3,
    isAvailable: true,
    cooldown: 0,
    verbPast: 'read the sign',
    verbPresent: 'reading a sign',
    narrativeTemplates: [
      '{actor} reads the sign carefully.',
      '{actor} pauses to read the nearby sign.',
      '{actor} studies the text on the sign.',
    ],
    customData: {},
    tags: ['exploration', 'language-learning', 'environmental'],
    isBase: true,
    content: [
      '% Action: Read Sign',
      '% Read environmental text to learn vocabulary',
      '% Type: mental / exploration',
      '',
      'action(read_sign, \'Read Sign\', mental, 0).',
      'action_difficulty(read_sign, 0.1).',
      'action_duration(read_sign, 1).',
      'action_target_type(read_sign, object).',
      'action_requires_target(read_sign).',
      'action_range(read_sign, 3).',
      '',
      'action_effect(read_sign, add_knowledge(Actor, sign_text)).',
      '',
      '% Can Actor perform this action?',
      'can_perform(Actor, read_sign, Target) :-',
      '    action(read_sign, _, _, EnergyCost),',
      '    energy(Actor, E),',
      '    E >= EnergyCost.',
    ].join('\n'),
  };
}

/**
 * Execute a read_sign action, producing the formatted text and a knowledge effect.
 */
export function executeReadSign(
  action: Action,
  context: ActionContext,
  sign: SignData,
  playerFluency: number,
): ActionResult {
  const tier = getFluencyTier(playerFluency);
  const displayText = formatSignText(sign, tier);

  const effects: ActionEffect[] = [
    {
      type: 'knowledge',
      target: context.actor,
      value: {
        signId: sign.signId,
        targetText: sign.targetText,
        nativeText: sign.nativeText,
        category: sign.category,
      },
      description: `Learned vocabulary from sign: ${sign.targetText}`,
    },
  ];

  return {
    success: true,
    message: `${action.name} performed successfully`,
    effects,
    energyUsed: action.energyCost ?? 0,
    narrativeText: `You read the sign: "${displayText}"`,
  };
}
