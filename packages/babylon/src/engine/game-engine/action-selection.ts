/**
 * Probabilistic Action Selection via Softmax
 *
 * Selects NPC actions based on weighted personality scores.
 * Different NPCs choose differently based on their Big Five personality traits.
 * Temperature controls randomness: 0.1 = nearly deterministic, 2.0 = highly random.
 */

export interface ActionCandidate {
  id: string;
  name: string;
  baseWeight: number; // base likelihood (from action definition)
  personalityAffinities: Record<string, number>; // trait -> weight mapping
}

export interface PersonalityProfile {
  openness: number; // -1 to 1
  conscientiousness: number;
  extroversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface SituationalModifiers {
  urgency?: number; // 0-1, higher = more likely to pick aggressive/decisive actions
  socialContext?: number; // 0-1, higher = more social actions preferred
  danger?: number; // 0-1, higher = more cautious/aggressive (depending on personality)
  comfort?: number; // 0-1, higher = more comfortable/relaxed actions
}

export interface SelectionResult {
  selectedAction: ActionCandidate;
  probability: number;
  allProbabilities: Array<{ actionId: string; probability: number }>;
}

/**
 * Compute personality match score for an action candidate.
 * Returns a value roughly in [-1, 1] range.
 */
export function computePersonalityMatch(
  action: ActionCandidate,
  personality: PersonalityProfile,
  modifiers?: SituationalModifiers
): number {
  let score = action.baseWeight;

  // Add personality contribution
  for (const [trait, weight] of Object.entries(action.personalityAffinities)) {
    const traitValue = (personality as any)[trait] || 0;
    score += traitValue * weight;
  }

  // Apply situational modifiers
  if (modifiers) {
    if (modifiers.urgency) score *= (1 + modifiers.urgency * 0.3);
    if (modifiers.socialContext) score *= (1 + modifiers.socialContext * 0.2);
    if (modifiers.danger) {
      // High neuroticism + danger = cautious; low neuroticism + danger = aggressive
      const caution = personality.neuroticism > 0 ? -0.2 : 0.2;
      score *= (1 + modifiers.danger * caution);
    }
  }

  return score;
}

/**
 * Softmax action selection — choose an action probabilistically based on personality weights.
 *
 * @param actions - Available action candidates
 * @param personality - NPC's Big Five personality profile
 * @param temperature - Randomness control (default: 0.7). Lower = more deterministic.
 * @param modifiers - Optional situational modifiers
 * @returns Selected action with probability and full distribution
 */
export function softmaxActionSelection(
  actions: ActionCandidate[],
  personality: PersonalityProfile,
  temperature: number = 0.7,
  modifiers?: SituationalModifiers
): SelectionResult | null {
  if (actions.length === 0) return null;
  if (actions.length === 1) {
    return {
      selectedAction: actions[0],
      probability: 1,
      allProbabilities: [{ actionId: actions[0].id, probability: 1 }],
    };
  }

  // Compute raw scores
  const scores = actions.map(a => computePersonalityMatch(a, personality, modifiers));

  // Apply softmax with temperature
  const probabilities = softmax(scores, temperature);

  // Sample from distribution
  const r = Math.random(); // TODO: accept seeded RNG
  let cumulative = 0;
  let selectedIdx = actions.length - 1; // fallback to last

  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (r <= cumulative) {
      selectedIdx = i;
      break;
    }
  }

  return {
    selectedAction: actions[selectedIdx],
    probability: probabilities[selectedIdx],
    allProbabilities: actions.map((a, i) => ({ actionId: a.id, probability: probabilities[i] })),
  };
}

/**
 * Softmax function with temperature scaling.
 * Converts an array of scores into a probability distribution.
 */
export function softmax(scores: number[], temperature: number = 1.0): number[] {
  if (scores.length === 0) return [];

  // Scale by temperature (avoid division by zero)
  const t = Math.max(0.01, temperature);
  const scaled = scores.map(s => s / t);

  // Numerical stability: subtract max
  const max = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);

  if (sum === 0) {
    // Uniform distribution fallback
    return scores.map(() => 1 / scores.length);
  }

  return exps.map(e => e / sum);
}

/**
 * Get ranked actions for UI display (most likely first).
 * Returns actions sorted by probability with their scores.
 */
export function rankActions(
  actions: ActionCandidate[],
  personality: PersonalityProfile,
  temperature: number = 0.7,
  modifiers?: SituationalModifiers
): Array<{ action: ActionCandidate; probability: number; score: number }> {
  const scores = actions.map(a => ({
    action: a,
    score: computePersonalityMatch(a, personality, modifiers),
  }));

  const probs = softmax(scores.map(s => s.score), temperature);

  return scores
    .map((s, i) => ({ ...s, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);
}

// ============= PREDEFINED PERSONALITY-ACTION MAPPINGS =============

/** Standard personality affinities for common Insimul action types */
export const STANDARD_ACTION_AFFINITIES: Record<string, Record<string, number>> = {
  // Social actions
  greet: { extroversion: 0.4, agreeableness: 0.3 },
  compliment: { agreeableness: 0.5, extroversion: 0.2 },
  gossip: { extroversion: 0.3, agreeableness: -0.3, openness: 0.1 },
  argue: { extroversion: 0.2, agreeableness: -0.5, neuroticism: 0.3 },
  comfort: { agreeableness: 0.6, extroversion: 0.1 },
  apologize: { agreeableness: 0.4, conscientiousness: 0.3 },

  // Physical actions
  fight: { agreeableness: -0.5, extroversion: 0.3, neuroticism: 0.2 },
  flee: { neuroticism: 0.5, agreeableness: 0.2 },
  explore: { openness: 0.6, extroversion: 0.2 },
  rest: { conscientiousness: -0.2, neuroticism: 0.1 },

  // Economic actions
  trade: { conscientiousness: 0.4, agreeableness: 0.1 },
  steal: { agreeableness: -0.6, conscientiousness: -0.4, neuroticism: 0.2 },
  craft: { conscientiousness: 0.5, openness: 0.3 },
  work: { conscientiousness: 0.6 },

  // Romance actions
  flirt: { extroversion: 0.4, openness: 0.3, agreeableness: 0.1 },
  express_love: { agreeableness: 0.4, extroversion: 0.2, openness: 0.3 },

  // Mental actions
  study: { openness: 0.5, conscientiousness: 0.4 },
  meditate: { openness: 0.4, neuroticism: -0.3 },
  plan: { conscientiousness: 0.6, openness: 0.2 },
  read_sign: { openness: 0.4, conscientiousness: 0.3 },
};
