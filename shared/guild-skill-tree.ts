/**
 * Guild Skill Tree
 *
 * Replaces the generic language skill tree with 5 guild-specific trees.
 * Each guild tree has 4 tiers (matching guild tiers 0-3) with nodes
 * that unlock based on guild quest completion progress.
 *
 * Unlike the old language tree (which auto-unlocked from passive stats),
 * these trees reflect concrete player choices — completing guild quests
 * advances your standing in that guild.
 */

import {
  type SkillNode,
  type SkillTier,
  type SkillTreeState,
  type SkillTreeConfig,
  createSkillTreeState,
  updateSkillProgress as genericUpdateSkillProgress,
} from './skill-tree';
import { GUILD_DEFINITIONS, type GuildId } from './guild-definitions';

// ── Condition types ──────────────────────────────────────────────────────────

/**
 * Guild skill nodes unlock based on quest completion counts within the guild.
 * Each condition type tracks quests completed at a specific tier.
 */
export type GuildConditionType =
  | 'guild_joined'          // completed the tier-0 join quest (threshold: 1)
  | 'tier1_quests'          // quests completed at tier 1
  | 'tier2_quests'          // quests completed at tier 2
  | 'tier3_quests'          // quests completed at tier 3
  | 'total_guild_quests';   // total quests completed in this guild

// ── Stats shape ──────────────────────────────────────────────────────────────

export interface GuildSkillStats {
  guildJoined: number;       // 1 if joined, 0 if not
  tier1Quests: number;       // quests completed at tier 1
  tier2Quests: number;       // quests completed at tier 2
  tier3Quests: number;       // quests completed at tier 3
  totalGuildQuests: number;  // total across all tiers
}

// ── Stat resolver ────────────────────────────────────────────────────────────

const GUILD_STAT_RESOLVER: Record<GuildConditionType, (s: Record<string, number>) => number> = {
  guild_joined:       s => s.guildJoined ?? 0,
  tier1_quests:       s => s.tier1Quests ?? 0,
  tier2_quests:       s => s.tier2Quests ?? 0,
  tier3_quests:       s => s.tier3Quests ?? 0,
  total_guild_quests: s => s.totalGuildQuests ?? 0,
};

// ── Per-guild tier definitions ───────────────────────────────────────────────

function buildGuildTiers(guildId: GuildId): SkillTier<GuildConditionType>[] {
  const def = GUILD_DEFINITIONS[guildId];
  const color = def.color;

  return [
    {
      tier: 0,
      name: 'Apprenti',
      range: [0, 25],
      color,
      nodes: [
        { id: `${guildId}_join`, name: `Rejoindre ${def.nameFr.replace('La Guilde des ', 'les ')}`, description: `Join the ${def.nameEn} and begin your training`, icon: '🏛️', tier: 0, condition: { type: 'guild_joined', threshold: 1 }, unlocked: false, progress: 0 },
      ],
    },
    {
      tier: 1,
      name: 'Compagnon',
      range: [25, 50],
      color,
      nodes: [
        { id: `${guildId}_t1_first`, name: 'First Steps', description: 'Complete your first guild quest', icon: '👣', tier: 1, condition: { type: 'tier1_quests', threshold: 1 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t1_progress`, name: 'Making Progress', description: 'Complete 2 guild quests at this tier', icon: '📈', tier: 1, condition: { type: 'tier1_quests', threshold: 2 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t1_complete`, name: 'Tier Complete', description: 'Complete all starter quests', icon: '✅', tier: 1, condition: { type: 'tier1_quests', threshold: 3 }, unlocked: false, progress: 0 },
      ],
    },
    {
      tier: 2,
      name: 'Maître',
      range: [50, 75],
      color,
      nodes: [
        { id: `${guildId}_t2_first`, name: 'Intermediate Start', description: 'Begin intermediate guild training', icon: '🎯', tier: 2, condition: { type: 'tier2_quests', threshold: 1 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t2_progress`, name: 'Skilled Practitioner', description: 'Complete 2 intermediate quests', icon: '⚡', tier: 2, condition: { type: 'tier2_quests', threshold: 2 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t2_complete`, name: 'Mastery Achieved', description: 'Complete all intermediate quests', icon: '🏆', tier: 2, condition: { type: 'tier2_quests', threshold: 3 }, unlocked: false, progress: 0 },
      ],
    },
    {
      tier: 3,
      name: 'Grand Maître',
      range: [75, 100],
      color,
      nodes: [
        { id: `${guildId}_t3_first`, name: 'Advanced Training', description: 'Begin advanced guild challenges', icon: '🔥', tier: 3, condition: { type: 'tier3_quests', threshold: 1 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t3_complete`, name: 'Grand Master', description: 'Complete all advanced quests', icon: '👑', tier: 3, condition: { type: 'tier3_quests', threshold: 2 }, unlocked: false, progress: 0 },
        { id: `${guildId}_t3_total`, name: 'Guild Champion', description: 'Complete 12+ total guild quests', icon: '💎', tier: 3, condition: { type: 'total_guild_quests', threshold: 12 }, unlocked: false, progress: 0 },
      ],
    },
  ];
}

// ── Guild tree configs ───────────────────────────────────────────────────────

export interface GuildSkillTreeEntry {
  guildId: GuildId;
  config: SkillTreeConfig<GuildConditionType>;
  state: SkillTreeState<GuildConditionType>;
}

function buildGuildConfig(guildId: GuildId): SkillTreeConfig<GuildConditionType> {
  return {
    tiers: buildGuildTiers(guildId),
    statResolver: GUILD_STAT_RESOLVER,
  };
}

/**
 * Create all 5 guild skill trees with fresh state.
 */
export function createGuildSkillTrees(): GuildSkillTreeEntry[] {
  const guildIds: GuildId[] = ['marchands', 'artisans', 'conteurs', 'explorateurs', 'diplomates'];
  return guildIds.map(guildId => {
    const config = buildGuildConfig(guildId);
    return {
      guildId,
      config,
      state: createSkillTreeState(config),
    };
  });
}

/**
 * Update a single guild's skill tree progress.
 * Returns newly unlocked nodes.
 */
export function updateGuildSkillProgress(
  entry: GuildSkillTreeEntry,
  stats: GuildSkillStats,
): SkillNode<GuildConditionType>[] {
  return genericUpdateSkillProgress(
    entry.state,
    stats as unknown as Record<string, number>,
    entry.config,
  );
}

/**
 * Compute guild skill stats from quest data.
 */
export function computeGuildStats(
  guildId: GuildId,
  allQuests: Array<{ guildId?: string; guildTier?: number; status?: string }>,
): GuildSkillStats {
  const guildQuests = allQuests.filter(q => q.guildId === guildId);
  const completed = guildQuests.filter(q => q.status === 'completed');

  return {
    guildJoined: completed.some(q => q.guildTier === 0) ? 1 : 0,
    tier1Quests: completed.filter(q => q.guildTier === 1).length,
    tier2Quests: completed.filter(q => q.guildTier === 2).length,
    tier3Quests: completed.filter(q => q.guildTier === 3).length,
    totalGuildQuests: completed.length,
  };
}
