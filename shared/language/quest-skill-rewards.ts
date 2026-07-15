/**
 * Quest Skill Rewards
 *
 * Computes language skill progression rewards for quest completion.
 * Maps quest difficulty and type to appropriate skill point amounts,
 * and applies rewards to a character's skill record.
 */

/** Difficulty-based multipliers for skill rewards */
const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/** Base skill points awarded per quest type */
const QUEST_TYPE_SKILL_POINTS: Record<string, { skillId: string; name: string; base: number }[]> = {
  conversation: [
    { skillId: 'speaking', name: 'Speaking', base: 2 },
    { skillId: 'listening', name: 'Listening', base: 1 },
  ],
  translation: [
    { skillId: 'reading', name: 'Reading', base: 2 },
    { skillId: 'writing', name: 'Writing', base: 2 },
  ],
  vocabulary: [
    { skillId: 'vocabulary', name: 'Vocabulary', base: 3 },
  ],
  grammar: [
    { skillId: 'grammar', name: 'Grammar', base: 3 },
  ],
  cultural: [
    { skillId: 'cultural_knowledge', name: 'Cultural Knowledge', base: 2 },
    { skillId: 'vocabulary', name: 'Vocabulary', base: 1 },
  ],
  navigation: [
    { skillId: 'listening', name: 'Listening', base: 2 },
    { skillId: 'speaking', name: 'Speaking', base: 1 },
  ],
  follow_instructions: [
    { skillId: 'listening', name: 'Listening', base: 2 },
    { skillId: 'reading', name: 'Reading', base: 1 },
  ],
  emergency: [
    { skillId: 'speaking', name: 'Speaking', base: 2 },
    { skillId: 'vocabulary', name: 'Vocabulary', base: 2 },
    { skillId: 'listening', name: 'Listening', base: 1 },
  ],
};

export interface SkillReward {
  skillId: string;
  name: string;
  level: number;
}

export interface QuestSkillRewardInput {
  questType: string;
  difficulty: string;
  skillRewards?: SkillReward[];
}

/**
 * Compute skill rewards for a completed quest.
 * If the quest has explicit skillRewards, those are used directly.
 * Otherwise, rewards are computed from questType and difficulty.
 */
export function computeSkillRewards(quest: QuestSkillRewardInput): SkillReward[] {
  // Use explicit skill rewards if provided
  if (quest.skillRewards && quest.skillRewards.length > 0) {
    return quest.skillRewards;
  }

  // Compute from quest type and difficulty
  const typeRewards = QUEST_TYPE_SKILL_POINTS[quest.questType];
  if (!typeRewards) return [];

  const multiplier = DIFFICULTY_MULTIPLIERS[quest.difficulty] ?? 1;

  return typeRewards.map(r => ({
    skillId: r.skillId,
    name: r.name,
    level: Math.round(r.base * multiplier),
  }));
}

/**
 * Apply skill rewards to a character's skill record.
 * Returns the updated skills map and a list of what changed.
 */
export function applySkillRewards(
  currentSkills: Record<string, number>,
  rewards: SkillReward[],
): { skills: Record<string, number>; applied: SkillReward[] } {
  const skills = { ...currentSkills };
  const applied: SkillReward[] = [];

  for (const reward of rewards) {
    const prev = skills[reward.skillId] ?? 0;
    skills[reward.skillId] = prev + reward.level;
    applied.push(reward);
  }

  return { skills, applied };
}
