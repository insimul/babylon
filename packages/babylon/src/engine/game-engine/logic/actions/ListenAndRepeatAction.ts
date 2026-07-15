/**
 * ListenAndRepeatAction — handles the "listen_and_repeat" action for
 * pronunciation practice during NPC conversations.
 *
 * Flow:
 *   1. NPC speaks a phrase in the target language (via TTS)
 *   2. Player listens, then repeats the phrase (via STT or text input)
 *   3. Pronunciation is scored against the expected phrase
 *   4. XP and feedback are returned as action effects
 */

import type { Action, ActionContext, ActionResult, ActionEffect } from '@shared/game-engine/types';
import { scorePronunciation, type PronunciationResult } from '@shared/language/pronunciation-scoring';

/** Phrase data provided by the NPC for the player to repeat. */
export interface ListenAndRepeatPhrase {
  phraseId: string;
  /** The phrase in the target language the NPC speaks */
  targetPhrase: string;
  /** Optional translation in the player's native language */
  nativeTranslation?: string;
  /** The language code of the target phrase */
  language: string;
  /** NPC who spoke the phrase */
  npcId: string;
  npcName: string;
}

/** Result of a listen-and-repeat attempt. */
export interface ListenAndRepeatResult {
  pronunciation: PronunciationResult;
  xpAwarded: number;
  passed: boolean;
}

const BASE_XP = 4;
const PASS_THRESHOLD = 60;

/**
 * Build the canonical listen_and_repeat Action object.
 */
export function createListenAndRepeatAction(id: string): Action {
  return {
    id,
    worldId: null,
    name: 'Listen and Repeat',
    description: 'Listen to an NPC phrase and repeat it back for pronunciation practice',
    actionType: 'language',
    category: 'language-learning',
    duration: 1,
    difficulty: 0.4,
    energyCost: 0,
    targetType: 'other',
    requiresTarget: true,
    range: 5,
    isAvailable: true,
    cooldown: 0,
    verbPast: 'listened and repeated',
    verbPresent: 'listens and repeats',
    narrativeTemplates: [
      '{actor} listens carefully and repeats the phrase.',
      '{actor} practices pronunciation with {target}.',
      '{actor} echoes the phrase back to {target}.',
    ],
    customData: {},
    tags: ['language-learning', 'pronunciation', 'listening'],
    isBase: true,
    content: [
      '% Action: Listen and Repeat',
      '% Listen to NPC phrase and repeat for pronunciation practice',
      '% Type: language / language-learning',
      '',
      'action(listen_and_repeat, \'Listen and Repeat\', language, 0).',
      'action_difficulty(listen_and_repeat, 0.4).',
      'action_duration(listen_and_repeat, 1).',
      'action_target_type(listen_and_repeat, other).',
      'action_requires_target(listen_and_repeat).',
      'action_range(listen_and_repeat, 5).',
      '',
      'action_effect(listen_and_repeat, evaluate_pronunciation(Actor, Phrase)).',
      'action_effect(listen_and_repeat, add_xp(Actor, language, 4)).',
      '',
      '% Can Actor perform this action?',
      'can_perform(Actor, listen_and_repeat, Target) :-',
      '    is_npc(Target),',
      '    in_conversation(Actor, Target).',
    ].join('\n'),
  };
}

/**
 * Calculate XP awarded based on pronunciation score.
 * Full XP at 90+, scaled down linearly to 1 XP at threshold.
 */
export function calculateXp(score: number): number {
  if (score >= 90) return BASE_XP;
  if (score < PASS_THRESHOLD) return 1;
  // Linear scale from 1 to BASE_XP between threshold and 90
  const ratio = (score - PASS_THRESHOLD) / (90 - PASS_THRESHOLD);
  return Math.round(1 + ratio * (BASE_XP - 1));
}

/**
 * Execute a listen_and_repeat action, scoring the player's spoken phrase
 * against the expected NPC phrase.
 */
export function executeListenAndRepeat(
  action: Action,
  context: ActionContext,
  phrase: ListenAndRepeatPhrase,
  playerSpoken: string,
): ActionResult {
  const pronunciation = scorePronunciation(phrase.targetPhrase, playerSpoken);
  const passed = pronunciation.overallScore >= PASS_THRESHOLD;
  const xpAwarded = calculateXp(pronunciation.overallScore);

  const effects: ActionEffect[] = [
    {
      type: 'knowledge',
      target: context.actor,
      value: {
        phraseId: phrase.phraseId,
        targetPhrase: phrase.targetPhrase,
        nativeTranslation: phrase.nativeTranslation,
        language: phrase.language,
        score: pronunciation.overallScore,
        passed,
        wordResults: pronunciation.wordResults,
      },
      description: `Pronunciation practice: "${phrase.targetPhrase}" — ${pronunciation.overallScore}%`,
    },
    {
      type: 'event',
      target: context.actor,
      value: {
        verb: 'listen_and_repeat',
        npcId: phrase.npcId,
        targetPhrase: phrase.targetPhrase,
        playerPhrase: playerSpoken,
        matchScore: pronunciation.overallScore,
      },
      description: `Listened and repeated phrase with ${phrase.npcName}`,
    },
  ];

  // Award XP as an attribute effect
  if (xpAwarded > 0) {
    effects.push({
      type: 'attribute',
      target: context.actor,
      value: { skill: 'language', xp: xpAwarded },
      description: `+${xpAwarded} language XP`,
    });
  }

  const narrativeText = passed
    ? `You repeated "${phrase.targetPhrase}" — ${pronunciation.feedback}`
    : `You tried to repeat "${phrase.targetPhrase}" — ${pronunciation.feedback}`;

  return {
    success: true,
    message: passed ? 'Good pronunciation!' : 'Keep practicing!',
    effects,
    energyUsed: action.energyCost ?? 0,
    narrativeText,
  };
}
