/**
 * Relationship Tier Definitions
 *
 * Maps numeric relationship strength (-1.0 to 1.0) to named tiers
 * with gameplay effects (price modifiers, quest availability, greeting style).
 */

export interface RelationshipTier {
  id: string;
  label: string;
  minStrength: number;
  maxStrength: number;
  /** Price multiplier for merchant transactions (1.0 = normal) */
  priceMultiplier: number;
  /** Whether the NPC will offer quests at this tier */
  canOfferQuests: boolean;
  /** Whether the NPC will share secrets/rumors */
  canShareSecrets: boolean;
  /** Greeting style hint for conversation system */
  greetingStyle: 'hostile' | 'cold' | 'neutral' | 'warm' | 'enthusiastic';
  /** Conversation prompt context injected into NPC system prompt */
  conversationContext: string;
}

export const RELATIONSHIP_TIERS: RelationshipTier[] = [
  {
    id: 'enemy',
    label: 'Enemy',
    minStrength: -1.0,
    maxStrength: -0.6,
    priceMultiplier: 1.5,
    canOfferQuests: false,
    canShareSecrets: false,
    greetingStyle: 'hostile',
    conversationContext: 'You deeply dislike this person. Be curt, distrustful, and reluctant to help them.',
  },
  {
    id: 'disliked',
    label: 'Disliked',
    minStrength: -0.6,
    maxStrength: -0.3,
    priceMultiplier: 1.25,
    canOfferQuests: false,
    canShareSecrets: false,
    greetingStyle: 'cold',
    conversationContext: 'You do not like this person. Be distant and uncooperative.',
  },
  {
    id: 'unfriendly',
    label: 'Unfriendly',
    minStrength: -0.3,
    maxStrength: -0.1,
    priceMultiplier: 1.1,
    canOfferQuests: false,
    canShareSecrets: false,
    greetingStyle: 'cold',
    conversationContext: 'You are wary of this person. Be polite but guarded.',
  },
  {
    id: 'stranger',
    label: 'Stranger',
    minStrength: -0.1,
    maxStrength: 0.1,
    priceMultiplier: 1.0,
    canOfferQuests: true,
    canShareSecrets: false,
    greetingStyle: 'neutral',
    conversationContext: 'You barely know this person. Be polite and professional.',
  },
  {
    id: 'acquaintance',
    label: 'Acquaintance',
    minStrength: 0.1,
    maxStrength: 0.35,
    priceMultiplier: 1.0,
    canOfferQuests: true,
    canShareSecrets: false,
    greetingStyle: 'neutral',
    conversationContext: 'You recognize this person and have had a few interactions. Be friendly.',
  },
  {
    id: 'friend',
    label: 'Friend',
    minStrength: 0.35,
    maxStrength: 0.65,
    priceMultiplier: 0.9,
    canOfferQuests: true,
    canShareSecrets: true,
    greetingStyle: 'warm',
    conversationContext: 'This person is your friend. Be warm, helpful, and willing to share information.',
  },
  {
    id: 'close_friend',
    label: 'Close Friend',
    minStrength: 0.65,
    maxStrength: 0.85,
    priceMultiplier: 0.8,
    canOfferQuests: true,
    canShareSecrets: true,
    greetingStyle: 'enthusiastic',
    conversationContext: 'This person is a close friend. Be enthusiastic, offer help freely, and share personal stories.',
  },
  {
    id: 'best_friend',
    label: 'Best Friend',
    minStrength: 0.85,
    maxStrength: 1.0,
    priceMultiplier: 0.75,
    canOfferQuests: true,
    canShareSecrets: true,
    greetingStyle: 'enthusiastic',
    conversationContext: 'This person is your best friend. Treat them like family — be open, generous, and deeply loyal.',
  },
];

/** Get the relationship tier for a given strength value. */
export function getRelationshipTier(strength: number): RelationshipTier {
  const clamped = Math.max(-1, Math.min(1, strength));
  for (const tier of RELATIONSHIP_TIERS) {
    if (clamped >= tier.minStrength && clamped <= tier.maxStrength) {
      return tier;
    }
  }
  // Fallback to stranger
  return RELATIONSHIP_TIERS[3];
}

/** Get the tier label for a given strength. */
export function getRelationshipTierLabel(strength: number): string {
  return getRelationshipTier(strength).label;
}

/** Relationship change amounts for common gameplay events. */
export const RELATIONSHIP_DELTAS = {
  /** Completing a quest assigned by the NPC */
  quest_completed: 0.1,
  /** Failing a quest assigned by the NPC */
  quest_failed: -0.05,
  /** Having a normal conversation */
  conversation: 0.02,
  /** Giving a gift */
  gift_given: 0.08,
  /** Delivering an item to the NPC */
  item_delivered: 0.06,
  /** NPC-initiated conversation accepted */
  npc_conversation_accepted: 0.03,
  /** NPC-initiated conversation rejected */
  npc_conversation_rejected: -0.01,
} as const;

export type RelationshipDeltaCause = keyof typeof RELATIONSHIP_DELTAS;
