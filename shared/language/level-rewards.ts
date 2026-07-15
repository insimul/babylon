/**
 * Level-Up Rewards
 *
 * Defines tangible rewards granted when a player levels up.
 * Each level can grant inventory slot increases, merchant discounts,
 * conversation topic unlocks, and quest tier unlocks.
 */

export interface LevelReward {
  type: 'inventory_slots' | 'merchant_discount' | 'conversation_topic' | 'quest_tier' | 'skill_points';
  value: number | string;
  label: string;
}

/**
 * Get rewards for reaching a specific level.
 * Returns an empty array if no special rewards at that level.
 */
export function getRewardsForLevel(level: number): LevelReward[] {
  const rewards: LevelReward[] = [];

  // Inventory slot increase every 3 levels
  if (level % 3 === 0) {
    rewards.push({
      type: 'inventory_slots',
      value: 2,
      label: `+2 inventory slots`,
    });
  }

  // Merchant discount every 5 levels (cumulative 2% per tier)
  if (level % 5 === 0) {
    const discountPct = Math.floor(level / 5) * 2;
    rewards.push({
      type: 'merchant_discount',
      value: discountPct,
      label: `${discountPct}% merchant discount`,
    });
  }

  // Skill points on every level-up
  const skillPoints = level <= 5 ? 1 : level <= 10 ? 2 : level <= 15 ? 3 : 4;
  rewards.push({
    type: 'skill_points',
    value: skillPoints,
    label: `+${skillPoints} skill points`,
  });

  // Tier milestone rewards
  switch (level) {
    case 5:
      rewards.push({ type: 'conversation_topic', value: 'daily_life', label: 'Topic unlocked: Daily Life' });
      rewards.push({ type: 'quest_tier', value: 'elementary', label: 'Elementary quests unlocked' });
      break;
    case 10:
      rewards.push({ type: 'conversation_topic', value: 'culture', label: 'Topic unlocked: Culture' });
      rewards.push({ type: 'quest_tier', value: 'intermediate', label: 'Intermediate quests unlocked' });
      break;
    case 15:
      rewards.push({ type: 'conversation_topic', value: 'abstract', label: 'Topic unlocked: Abstract Ideas' });
      rewards.push({ type: 'quest_tier', value: 'advanced', label: 'Advanced quests unlocked' });
      break;
    case 20:
      rewards.push({ type: 'conversation_topic', value: 'mastery', label: 'Topic unlocked: Mastery Discussions' });
      rewards.push({ type: 'quest_tier', value: 'native', label: 'Native-level quests unlocked' });
      break;
  }

  return rewards;
}

/**
 * Calculate cumulative inventory slot bonus for a given level.
 */
export function getInventorySlotBonus(level: number): number {
  return Math.floor(level / 3) * 2;
}

/**
 * Calculate cumulative merchant discount percentage for a given level.
 */
export function getMerchantDiscount(level: number): number {
  return Math.floor(level / 5) * 2;
}
