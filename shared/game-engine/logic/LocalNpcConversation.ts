/**
 * LocalNpcConversation — Generate NPC-NPC conversations via LocalAIClient.
 *
 * Builds personality-aware prompts and parses LLM responses into the same
 * ConversationResult shape used by the server-side conversation engine.
 * Falls back to null when local AI is unavailable or generation fails.
 */

import type { ILocalAIProvider } from '@shared/game-engine/types';

/** Relationship change from a conversation. */
export interface RelationshipDelta {
  friendshipChange: number;
  trustChange: number;
  romanceSpark: number;
}

/** Result of an NPC-NPC or player-NPC conversation. */
export interface ConversationResult {
  exchanges: Array<{ speakerId: string; speakerName: string; text: string }>;
  relationshipDelta: RelationshipDelta;
  topic: string;
  languageUsed: string;
}

interface NpcCharacterData {
  id: string;
  firstName: string;
  lastName: string;
  occupation?: string;
  personality?: {
    openness?: number;
    conscientiousness?: number;
    extroversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  relationships?: Record<string, { type?: string; strength?: number; trust?: number }>;
}

/**
 * Build a system prompt describing both NPCs for a conversation.
 */
export function buildNpcConversationPrompt(
  npc1: NpcCharacterData,
  npc2: NpcCharacterData,
  topic?: string,
): string {
  const p1 = npc1.personality ?? {};
  const p2 = npc2.personality ?? {};

  const describePersonality = (name: string, p: typeof p1) =>
    `${name}: openness=${(p.openness ?? 0).toFixed(1)} conscientiousness=${(p.conscientiousness ?? 0).toFixed(1)} extroversion=${(p.extroversion ?? 0).toFixed(1)} agreeableness=${(p.agreeableness ?? 0).toFixed(1)} neuroticism=${(p.neuroticism ?? 0).toFixed(1)}`;

  const rel = npc1.relationships?.[npc2.id];
  const strength = rel?.strength ?? 0;
  const relLabel =
    strength >= 0.6 ? 'close friends' :
    strength >= 0.2 ? 'friendly acquaintances' :
    strength > -0.2 ? 'acquaintances' : 'rivals';

  const topicLine = topic ? `Topic: ${topic}.` : '';

  return [
    `You are simulating a short conversation between two NPCs in a town.`,
    `${npc1.firstName} ${npc1.lastName} (${npc1.occupation ?? 'resident'}) and ${npc2.firstName} ${npc2.lastName} (${npc2.occupation ?? 'resident'}).`,
    describePersonality(npc1.firstName, p1),
    describePersonality(npc2.firstName, p2),
    `They are ${relLabel}. ${topicLine}`,
    `Write 2-4 exchange pairs, alternating speakers. ${npc1.firstName} speaks first.`,
    `Format each line as: "SpeakerFirstName: dialogue text"`,
    `Keep it natural, brief, and personality-driven. No stage directions.`,
  ].filter(Boolean).join('\n');
}

/**
 * Parse LLM output into conversation exchanges.
 */
export function parseNpcConversationResponse(
  text: string,
  npc1: NpcCharacterData,
  npc2: NpcCharacterData,
): ConversationResult['exchanges'] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const exchanges: ConversationResult['exchanges'] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let speakerId: string;
    let speakerName: string;
    let dialogueText: string;

    if (trimmed.startsWith(`${npc1.firstName}:`)) {
      speakerId = npc1.id;
      speakerName = `${npc1.firstName} ${npc1.lastName}`;
      dialogueText = trimmed.slice(npc1.firstName.length + 1).trim();
    } else if (trimmed.startsWith(`${npc2.firstName}:`)) {
      speakerId = npc2.id;
      speakerName = `${npc2.firstName} ${npc2.lastName}`;
      dialogueText = trimmed.slice(npc2.firstName.length + 1).trim();
    } else {
      continue;
    }

    // Strip surrounding quotes
    if (dialogueText.startsWith('"') && dialogueText.endsWith('"')) {
      dialogueText = dialogueText.slice(1, -1);
    }

    if (dialogueText.length > 0) {
      exchanges.push({ speakerId, speakerName, text: dialogueText });
    }
  }

  return exchanges;
}

/**
 * Estimate relationship delta from conversation exchanges.
 */
function estimateRelationshipDelta(
  npc1: NpcCharacterData,
  npc2: NpcCharacterData,
  exchangeCount: number,
  topic?: string,
): ConversationResult['relationshipDelta'] {
  const p1 = npc1.personality ?? {};
  const p2 = npc2.personality ?? {};
  const avgAgree = ((p1.agreeableness ?? 0) + (p2.agreeableness ?? 0)) / 2;

  let friendshipChange = (0.02 + avgAgree * 0.03) * (exchangeCount / 5);
  if (topic === 'rivalry') friendshipChange = -0.03;

  return {
    friendshipChange: Math.max(-0.1, Math.min(0.1, friendshipChange)),
    trustChange: Math.max(-0.05, Math.min(0.05, friendshipChange * 0.5)),
    romanceSpark: topic === 'romance' ? Math.min(0.05, 0.02 + ((p1.openness ?? 0) + (p2.openness ?? 0)) * 0.01) : 0,
  };
}

/**
 * Generate an NPC-NPC conversation using the local AI model.
 * Returns null if local AI is unavailable or generation fails.
 */
export async function generateLocalNpcConversation(
  npc1: NpcCharacterData,
  npc2: NpcCharacterData,
  topic?: string,
  aiProvider?: ILocalAIProvider,
): Promise<ConversationResult | null> {
  if (!aiProvider || !aiProvider.isAvailable()) return null;

  try {
    const systemPrompt = buildNpcConversationPrompt(npc1, npc2, topic);
    const prompt = topic
      ? `Begin a conversation about ${topic}.`
      : 'Begin a casual conversation.';

    const response = await aiProvider.generate(prompt, systemPrompt, {
      temperature: 0.8,
      maxTokens: 512,
    });

    const exchanges = parseNpcConversationResponse(response, npc1, npc2);
    if (exchanges.length < 2) return null;

    const selectedTopic = topic ?? 'casual';
    return {
      exchanges,
      relationshipDelta: estimateRelationshipDelta(npc1, npc2, exchanges.length, selectedTopic),
      topic: selectedTopic,
      languageUsed: 'English',
    };
  } catch {
    return null;
  }
}
