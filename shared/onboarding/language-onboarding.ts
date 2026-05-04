/**
 * Language Learning Onboarding Definition
 *
 * 10-step onboarding sequence that interleaves tutorial steps (movement,
 * UI, interaction) with Arrival Encounter assessment sections. Players learn
 * game mechanics while their baseline language proficiency is measured.
 *
 * References ARRIVAL_ENCOUNTER phase IDs from shared/assessment/arrival-encounter.ts.
 */

import type { OnboardingDefinition } from './onboarding-types';

export const LANGUAGE_LEARNING_ONBOARDING: OnboardingDefinition = {
  id: 'language_learning_onboarding',
  name: 'Language Learning Onboarding',
  description:
    'Welcome sequence for language learners arriving in a new city. ' +
    'Teaches core game mechanics while assessing baseline proficiency.',
  genre: 'language_learning',
  estimatedDurationMinutes: 35,

  steps: [
    // Step 1: Narrative intro — sets the scene
    {
      id: 'arrival_cinematic',
      type: 'narrative',
      name: 'Welcome to the City',
      description:
        'A short cinematic introduces the city and establishes why the player is here to learn the language.',
      skippable: true,
      prerequisites: [],
      estimatedDurationSeconds: 60,
      config: {
        narrativeKey: 'arrival_intro',
      },
    },

    // Step 2: Movement tutorial
    {
      id: 'movement_tutorial',
      type: 'movement',
      name: 'Getting Around',
      description:
        'Learn basic movement controls: walk, look around, and interact with objects.',
      skippable: true,
      prerequisites: ['arrival_cinematic'],
      estimatedDurationSeconds: 90,
      config: {
        requiredActions: ['move_forward', 'look_around', 'interact'],
      },
    },

    // Step 3: Assessment — Reading section
    {
      id: 'assessment_reading',
      type: 'assessment',
      name: 'Reading Comprehension',
      description:
        'Read a short passage in the target language and answer comprehension questions. This measures your reading ability.',
      skippable: false,
      prerequisites: ['movement_tutorial'],
      estimatedDurationSeconds: 420,
      externalRef: 'arrival_reading',
      config: {
        assessmentId: 'arrival_encounter',
        phaseId: 'arrival_reading',
      },
    },

    // Step 4: UI tutorial — chat panel & phrase book
    {
      id: 'ui_chat_tutorial',
      type: 'ui',
      name: 'Your Phrase Book',
      description:
        'Learn how to use the chat panel, phrase book, and translation hints during conversations.',
      skippable: true,
      prerequisites: ['assessment_reading'],
      estimatedDurationSeconds: 60,
      config: {
        highlightElements: ['chat_panel', 'phrase_book', 'translation_toggle'],
      },
    },

    // Step 5: Assessment — Writing section
    {
      id: 'assessment_writing',
      type: 'assessment',
      name: 'Writing Assessment',
      description:
        'Respond to writing prompts in the target language. This measures your writing ability.',
      skippable: false,
      prerequisites: ['ui_chat_tutorial'],
      estimatedDurationSeconds: 420,
      externalRef: 'arrival_writing',
      config: {
        assessmentId: 'arrival_encounter',
        phaseId: 'arrival_writing',
      },
    },

    // Step 6: Interaction tutorial — objects & NPCs
    {
      id: 'interaction_tutorial',
      type: 'interaction',
      name: 'Exploring Your Surroundings',
      description:
        'Practice interacting with objects and NPCs: examine signs, pick up items, and ask for help.',
      skippable: true,
      prerequisites: ['assessment_writing'],
      estimatedDurationSeconds: 120,
      config: {
        requiredInteractions: ['examine_sign', 'pick_up_item', 'talk_to_npc'],
      },
    },

    // Step 7: Assessment — Listening section
    {
      id: 'assessment_listening',
      type: 'assessment',
      name: 'Listening Comprehension',
      description:
        'Listen to a passage spoken in the target language and answer comprehension questions.',
      skippable: false,
      prerequisites: ['interaction_tutorial'],
      estimatedDurationSeconds: 420,
      externalRef: 'arrival_listening',
      config: {
        assessmentId: 'arrival_encounter',
        phaseId: 'arrival_listening',
      },
    },

    // Step 8: UI tutorial — quest log & skill tree
    {
      id: 'ui_progress_tutorial',
      type: 'ui',
      name: 'Tracking Your Progress',
      description:
        'Learn how to view your quest log, skill tree, and language proficiency stats.',
      skippable: true,
      prerequisites: ['assessment_listening'],
      estimatedDurationSeconds: 60,
      config: {
        highlightElements: ['quest_log', 'skill_tree', 'proficiency_panel'],
      },
    },

    // Step 9: Assessment — Conversation section (in-game quest)
    {
      id: 'assessment_conversation',
      type: 'assessment',
      name: 'Meeting a Local',
      description:
        'Walk to the marked NPC and have a guided conversation in the target language. Speak naturally — this measures your conversational ability.',
      skippable: false,
      prerequisites: ['ui_progress_tutorial'],
      estimatedDurationSeconds: 600,
      externalRef: 'arrival_conversation',
      config: {
        assessmentId: 'arrival_encounter',
        phaseId: 'arrival_conversation',
      },
    },

    // Step 10: Narrative conclusion — results & next steps
    {
      id: 'onboarding_complete',
      type: 'narrative',
      name: 'Your Adventure Begins',
      description:
        'Review your assessment results, receive your CEFR level, and get your first quest.',
      skippable: false,
      prerequisites: ['assessment_conversation'],
      estimatedDurationSeconds: 90,
      config: {
        narrativeKey: 'onboarding_results',
        showAssessmentResults: true,
        assignFirstQuest: true,
      },
    },
  ],
};

/**
 * Returns the IDs of all assessment steps in the onboarding sequence.
 */
export function getAssessmentStepIds(): string[] {
  return LANGUAGE_LEARNING_ONBOARDING.steps
    .filter(step => step.type === 'assessment')
    .map(step => step.id);
}

/**
 * Returns the IDs of all skippable (tutorial) steps in the onboarding sequence.
 */
export function getSkippableStepIds(): string[] {
  return LANGUAGE_LEARNING_ONBOARDING.steps
    .filter(step => step.skippable)
    .map(step => step.id);
}

/**
 * Maps onboarding assessment step IDs to their referenced ARRIVAL_ENCOUNTER phase IDs.
 */
export function getAssessmentPhaseMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const step of LANGUAGE_LEARNING_ONBOARDING.steps) {
    if (step.type === 'assessment' && step.externalRef) {
      map[step.id] = step.externalRef;
    }
  }
  return map;
}
