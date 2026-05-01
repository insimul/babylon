/**
 * Business Scavenger Hunt Quest Type
 *
 * Sends players into businesses to find and name items in the target language.
 * Players visit businesses, locate items, and identify them correctly.
 * Business owners provide clues scaled by CEFR level.
 */

import type { QuestTypeDefinition } from './types';

export const businessScavengerHuntQuestType: QuestTypeDefinition = {
  id: 'business-scavenger-hunt',
  name: 'Business Scavenger Hunt',

  questCategories: [
    {
      id: 'item_hunt',
      name: 'Item Hunt',
      icon: '🔍',
      description: 'Find and name specific items across businesses',
    },
    {
      id: 'shop_tour',
      name: 'Shop Tour',
      icon: '🏪',
      description: 'Visit multiple businesses and learn their inventory vocabulary',
    },
    {
      id: 'clue_trail',
      name: 'Clue Trail',
      icon: '🗝️',
      description: 'Follow clues from business owners to find hidden items',
    },
    {
      id: 'timed_hunt',
      name: 'Timed Hunt',
      icon: '⏱️',
      description: 'Find all items before time runs out',
    },
  ],

  objectiveTypes: [
    {
      id: 'visit_business',
      name: 'Visit Business',
      trackingLogic: (context) => context.businessVisited || false,
      completionCheck: (progress) => progress.businessVisited === true,
    },
    {
      id: 'identify_business_item',
      name: 'Identify Business Item',
      trackingLogic: (context) => ({
        identified: context.itemsIdentified || 0,
        required: context.itemsRequired || 1,
      }),
      completionCheck: (progress) => {
        const identified = progress.itemsIdentified || 0;
        const required = progress.itemsRequired || 1;
        return identified >= required;
      },
    },
    {
      id: 'collect_business_item',
      name: 'Collect Business Item',
      trackingLogic: (context) => ({
        collected: context.itemsCollected || 0,
        required: context.required || 1,
      }),
      completionCheck: (progress) => {
        const collected = progress.collected || 0;
        const required = progress.required || 1;
        return collected >= required;
      },
    },
    {
      id: 'get_clue_from_owner',
      name: 'Get Clue from Owner',
      trackingLogic: (context) => context.clueReceived || false,
      completionCheck: (progress) => progress.clueReceived === true,
    },
  ],

  rewardTypes: ['experience', 'fluency', 'items', 'reputation'],

  difficultyScaling: {
    beginner: {
      multiplier: 1,
      xp: 20,
      itemCount: 3,
      cefrLevel: 'A1',
    },
    intermediate: {
      multiplier: 1.5,
      xp: 40,
      itemCount: 5,
      cefrLevel: 'A2',
    },
    advanced: {
      multiplier: 2,
      xp: 70,
      itemCount: 8,
      cefrLevel: 'B1',
    },
    expert: {
      multiplier: 3,
      xp: 100,
      itemCount: 10,
      cefrLevel: 'B2',
    },
  },

  generationPrompt: (world) => {
    const lang = world.targetLanguage || 'the target language';

    return `Generate a business scavenger hunt quest for the world "${world.name}".

This quest sends the player into businesses around town to find and correctly name items in ${lang}.

QUEST STRUCTURE:
- Give the player a list of items to find across different businesses
- Each item must be found at a specific business (bread at the bakery, hammer at the blacksmith, herbs at the healer)
- The player must enter the business, find the item, and name it in ${lang}
- Business owners can provide clues when spoken to

CEFR DIFFICULTY SCALING:
- A1 (beginner): Common everyday objects, picture hints provided, 3-4 items
- A2 (intermediate): Everyday items, text-only clues in ${lang}, 5-6 items
- B1 (advanced): Items described with riddle clues in ${lang}, 7-8 items
- B2 (expert): Idiomatic expressions tied to items, 9-10 items

OBJECTIVES must use ONLY these types:
- "visit_location": Go to a specific business
- "identify_object": Name an item in ${lang}
- "talk_to_npc": Talk to a business owner for clues
- "collect_item": Pick up a quest item

Return JSON format:
{
  "title": "Quest title",
  "description": "Narrative description of the scavenger hunt",
  "category": "item_hunt|shop_tour|clue_trail|timed_hunt",
  "difficulty": "beginner|intermediate|advanced|expert",
  "cefrLevel": "A1|A2|B1|B2",
  "objectives": [
    {
      "type": "visit_location",
      "description": "Visit the bakery",
      "target": "Bakery",
      "required": 1
    },
    {
      "type": "identify_object",
      "description": "Name the bread in ${lang}",
      "target": "bread",
      "required": 1,
      "businessName": "Bakery",
      "targetWord": "the ${lang} word for bread"
    },
    {
      "type": "talk_to_npc",
      "description": "Ask the baker for a clue",
      "target": "Baker Name",
      "required": 1
    }
  ],
  "rewards": {
    "experience": 40,
    "fluency": 10,
    "items": []
  }
}`;
  },
};
