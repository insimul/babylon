/**
 * Generic Skill Tree Framework
 *
 * A parameterized skill tree system that can be used for any domain
 * (language learning, combat, crafting, etc.). The type parameter T
 * constrains the condition types available for skill nodes.
 */

export interface SkillCondition<T extends string = string> {
  type: T;
  threshold: number;
}

export interface SkillNode<T extends string = string> {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: number;
  condition: SkillCondition<T>;
  unlocked: boolean;
  progress: number; // 0.0–1.0
}

export interface SkillTier<T extends string = string> {
  tier: number;
  name: string;
  range: [number, number];
  color: string;
  nodes: SkillNode<T>[];
}

export interface SkillTreeState<T extends string = string> {
  nodes: SkillNode<T>[];
}

export interface SkillTreeConfig<T extends string> {
  tiers: SkillTier<T>[];
  /** Maps each condition type to a function that extracts the current value from stats. */
  statResolver: Record<T, (stats: Record<string, number>) => number>;
}

/**
 * Create a fresh skill tree state from a config's tiers (all nodes locked, progress 0).
 */
export function createSkillTreeState<T extends string>(
  config: SkillTreeConfig<T>,
): SkillTreeState<T> {
  return {
    nodes: config.tiers.flatMap(tier => tier.nodes.map(n => ({ ...n }))),
  };
}

/**
 * Update skill node progress based on current stats.
 * Returns the list of nodes that were newly unlocked.
 */
export function updateSkillProgress<T extends string>(
  state: SkillTreeState<T>,
  stats: Record<string, number>,
  config: SkillTreeConfig<T>,
): SkillNode<T>[] {
  const newlyUnlocked: SkillNode<T>[] = [];

  for (const node of state.nodes) {
    if (node.unlocked) continue;

    const resolver = config.statResolver[node.condition.type];
    const current = resolver(stats);
    node.progress = Math.min(1, current / node.condition.threshold);

    if (current >= node.condition.threshold) {
      node.unlocked = true;
      newlyUnlocked.push(node);
    }
  }

  return newlyUnlocked;
}
