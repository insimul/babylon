/**
 * Customer Service Quest Type
 *
 * Transactional language practice through real-world customer service scenarios.
 * Players visit businesses and interact with NPCs to practice polite complaints,
 * reservations, returns, recommendations, and urgent requests.
 */

import type { QuestTypeDefinition } from './types';

export const customerServiceQuestType: QuestTypeDefinition = {
  id: 'customer-service',
  name: 'Customer Service',

  questCategories: [
    {
      id: 'make_return',
      name: 'Make a Return',
      icon: '🔄',
      description: 'Return a wrong item and request a refund or exchange',
    },
    {
      id: 'file_complaint',
      name: 'File a Complaint',
      icon: '📋',
      description: 'Politely but firmly complain about unsatisfactory service',
    },
    {
      id: 'make_reservation',
      name: 'Make a Reservation',
      icon: '📅',
      description: 'Reserve a room or table for a specific date and time',
    },
    {
      id: 'ask_recommendations',
      name: 'Ask for Recommendations',
      icon: '💬',
      description: 'Ask a shopkeeper for recommendations and describe preferences',
    },
    {
      id: 'urgent_request',
      name: 'Urgent Request',
      icon: '⚡',
      description: 'Communicate urgency appropriately — polite but insistent',
    },
  ],

  objectiveTypes: [
    {
      id: 'request_refund',
      name: 'Request Refund',
      trackingLogic: (context) => ({
        conversationTurns: context.conversationTurns || 0,
        requiredTurns: context.requiredTurns || 3,
        refundRequested: context.refundRequested || false,
      }),
      completionCheck: (progress) => progress.refundRequested === true,
    },
    {
      id: 'explain_problem',
      name: 'Explain Problem',
      trackingLogic: (context) => ({
        vocabularyUsed: context.vocabularyUsage?.length || 0,
        vocabularyRequired: context.vocabularyRequired || 3,
        problemExplained: context.problemExplained || false,
      }),
      completionCheck: (progress) => progress.problemExplained === true,
    },
    {
      id: 'negotiate_resolution',
      name: 'Negotiate Resolution',
      trackingLogic: (context) => ({
        conversationTurns: context.conversationTurns || 0,
        requiredTurns: context.requiredTurns || 4,
        resolutionReached: context.resolutionReached || false,
      }),
      completionCheck: (progress) => progress.resolutionReached === true,
    },
    {
      id: 'reserve_slot',
      name: 'Reserve Slot',
      trackingLogic: (context) => ({
        reservationMade: context.reservationMade || false,
        dateProvided: context.dateProvided || false,
        timeProvided: context.timeProvided || false,
      }),
      completionCheck: (progress) => progress.reservationMade === true,
    },
    {
      id: 'describe_preference',
      name: 'Describe Preference',
      trackingLogic: (context) => ({
        vocabularyUsed: context.vocabularyUsage?.length || 0,
        vocabularyRequired: context.vocabularyRequired || 3,
        preferenceDescribed: context.preferenceDescribed || false,
      }),
      completionCheck: (progress) => progress.preferenceDescribed === true,
    },
    {
      id: 'express_urgency',
      name: 'Express Urgency',
      trackingLogic: (context) => ({
        conversationTurns: context.conversationTurns || 0,
        urgencyExpressed: context.urgencyExpressed || false,
      }),
      completionCheck: (progress) => progress.urgencyExpressed === true,
    },
  ],

  rewardTypes: ['experience', 'fluency', 'reputation'],

  difficultyScaling: {
    beginner: {
      multiplier: 1,
      xp: 25,
      cefrLevel: 'A1',
    },
    intermediate: {
      multiplier: 1.5,
      xp: 50,
      cefrLevel: 'A2',
    },
    advanced: {
      multiplier: 2,
      xp: 80,
      cefrLevel: 'B1',
    },
    expert: {
      multiplier: 3,
      xp: 120,
      cefrLevel: 'B2',
    },
  },

  generationPrompt: (world) => {
    const lang = world.targetLanguage || 'the target language';

    return `Generate a customer service quest for the world "${world.name}".

This quest requires the player to enter a business and complete a transactional conversation in ${lang}.

QUEST CATEGORIES (pick one):
- "make_return": Player bought a wrong item and must return it, explaining the problem and requesting a refund/exchange
- "file_complaint": A service was unsatisfactory; player must politely but firmly complain to the business owner
- "make_reservation": Player contacts an inn or restaurant NPC to reserve a room/table for a specific date and time
- "ask_recommendations": Player enters a shop unsure of what to buy and must ask for recommendations, describe preferences, and decide
- "urgent_request": Player needs something done quickly and must communicate urgency appropriately (polite but insistent)

VOCABULARY FOCUS by category:
- make_return: apology phrases, item descriptions, refund/exchange vocabulary, polite disagreement
- file_complaint: polite complaint language, problem descriptions, resolution requests, formal register
- make_reservation: time/date expressions, numbers, party size, confirmation phrases
- ask_recommendations: preference descriptions, comparison words, decision-making phrases
- urgent_request: urgency expressions, time pressure phrases, polite insistence, escalation vocabulary

CEFR DIFFICULTY SCALING:
- A1 (beginner): Simple phrases, yes/no-level exchanges, 2-3 conversation turns
- A2 (intermediate): Short sentences, basic explanations, 4-5 conversation turns
- B1 (advanced): Paragraph-level explanations, negotiation, 6-8 conversation turns
- B2 (expert): Nuanced complaints, diplomatic language, idiomatic expressions, 8+ turns

OBJECTIVES must use ONLY these types:
- "visit_location": Go to the business
- "talk_to_npc": Talk to the business owner/staff
- "complete_conversation": Complete the full service interaction
- "use_vocabulary": Use specific transactional vocabulary words

Return JSON format:
{
  "title": "Quest title",
  "description": "Narrative description of the customer service scenario",
  "category": "make_return|file_complaint|make_reservation|ask_recommendations|urgent_request",
  "difficulty": "beginner|intermediate|advanced|expert",
  "cefrLevel": "A1|A2|B1|B2",
  "objectives": [
    {
      "type": "visit_location",
      "description": "Visit the business",
      "target": "Business Name",
      "required": 1
    },
    {
      "type": "talk_to_npc",
      "description": "Talk to the shopkeeper",
      "target": "NPC Name",
      "required": 1
    },
    {
      "type": "complete_conversation",
      "description": "Complete the service interaction",
      "required": 1
    },
    {
      "type": "use_vocabulary",
      "description": "Use transactional vocabulary",
      "required": 3
    }
  ],
  "rewards": {
    "experience": 50,
    "fluency": 15,
    "reputation": 5
  }
}`;
  },
};
