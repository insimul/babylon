/**
 * Conversation Analytics Module — Generic Types
 *
 * Abstracts conversation fluency tracking into genre-specific
 * conversation metrics:
 *   - Language: L2 percentage, fluency gain
 *   - RPG: persuasion success, lore discovered, relationship change
 *   - Mystery: clues gathered, contradictions noted
 *   - Social sim: gossip spread, influence gained
 */

// ---------------------------------------------------------------------------
// Conversation record
// ---------------------------------------------------------------------------

export interface ConversationRecord {
  id: string;
  characterId: string;
  characterName: string;
  timestamp: number;
  turns: number;
  /** Words or tokens used in the conversation. */
  tokensUsed: string[];
  /**
   * Genre-specific metrics.
   * Language: { targetLanguagePercentage, fluencyGained, grammarErrorCount }
   * RPG: { persuasionScore, loreDiscovered, relationshipDelta }
   * Mystery: { cluesGathered, contradictionsNoted }
   */
  metrics: Record<string, number>;
  /** Topics discussed. */
  topics?: string[];
}

// ---------------------------------------------------------------------------
// Conversation analysis result
// ---------------------------------------------------------------------------

export interface ConversationAnalysis {
  /** Quality score 0-100. */
  qualityScore: number;
  /** Genre-specific gain/reward metrics. */
  gains: Record<string, number>;
  /** New entries discovered during conversation (knowledge, lore, etc.). */
  discoveries: string[];
  /** Bonus descriptions. */
  bonuses: string[];
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface ConversationAnalyticsConfig {
  /** Metric definitions tracked per conversation. */
  metricDefinitions: ConversationMetricDef[];
}

export interface ConversationMetricDef {
  id: string;
  label: string;
  /** How this metric is computed: 'count', 'percentage', 'delta', 'custom'. */
  computeMethod: string;
}
