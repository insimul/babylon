/**
 * RPG Quest Type
 *
 * Defines traditional RPG quests including combat, collection, exploration,
 * escort missions, delivery tasks, crafting, and social interactions.
 */

import type { QuestTypeDefinition } from './types';

export const rpgQuestType: QuestTypeDefinition = {
  id: 'rpg',
  name: 'RPG Quests',

  questCategories: [
    {
      id: 'combat',
      name: 'Combat',
      icon: '⚔️',
      description: 'Defeat enemies and monsters',
    },
    {
      id: 'collection',
      name: 'Collection',
      icon: '📦',
      description: 'Gather items and resources',
    },
    {
      id: 'exploration',
      name: 'Exploration',
      icon: '🗺️',
      description: 'Discover new locations',
    },
    {
      id: 'escort',
      name: 'Escort',
      icon: '🛡️',
      description: 'Protect NPCs on their journey',
    },
    {
      id: 'delivery',
      name: 'Delivery',
      icon: '📨',
      description: 'Transport items between locations',
    },
    {
      id: 'crafting',
      name: 'Crafting',
      icon: '🔨',
      description: 'Create items and equipment',
    },
    {
      id: 'social',
      name: 'Social',
      icon: '🤝',
      description: 'Interact with NPCs and factions',
    },
  ],

  objectiveTypes: [
    {
      id: 'defeat_enemies',
      name: 'Defeat Enemies',
      trackingLogic: (context) => context.enemiesDefeated || 0,
      completionCheck: (progress) => {
        const defeated = progress.defeated || 0;
        const required = progress.required || 0;
        return defeated >= required;
      },
      visualIndicator: (scene, objective) => {
        // Enemy markers could be added here
        // For now, rely on combat system to show enemies
      },
    },
    {
      id: 'collect_items',
      name: 'Collect Items',
      trackingLogic: (context) => context.itemsCollected || 0,
      completionCheck: (progress) => {
        const collected = progress.collected || 0;
        const required = progress.required || 0;
        return collected >= required;
      },
      visualIndicator: (scene, objective) => {
        // Golden spheres spawned by QuestObjectManager
      },
    },
    {
      id: 'reach_location',
      name: 'Reach Location',
      trackingLogic: (context) => context.playerPosition,
      completionCheck: (progress) => {
        if (!progress.playerPos || !progress.targetPos) return false;

        const dx = progress.playerPos.x - progress.targetPos.x;
        const dy = progress.playerPos.y - progress.targetPos.y;
        const dz = progress.playerPos.z - progress.targetPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return distance < 5;
      },
      visualIndicator: (scene, objective) => {
        // Waypoint beam created by QuestWaypointManager
      },
    },
    {
      id: 'discover_location',
      name: 'Discover Location',
      trackingLogic: (context) => context.locationDiscovered || false,
      completionCheck: (progress) => progress.discovered === true,
      visualIndicator: (scene, objective) => {
        // Question mark or exploration marker
      },
    },
    {
      id: 'talk_to_npc',
      name: 'Talk to NPC',
      trackingLogic: (context) => context.npcTalkedTo || false,
      completionCheck: (progress) => progress.talked === true,
      visualIndicator: (scene, objective) => {
        // Green exclamation mark above NPC
      },
    },
    {
      id: 'escort_npc',
      name: 'Escort NPC',
      trackingLogic: (context) => context.npcArrived || false,
      completionCheck: (progress) => progress.arrived === true,
      visualIndicator: (scene, objective) => {
        // Path indicator and destination marker
      },
    },
    {
      id: 'deliver_item',
      name: 'Deliver Item',
      trackingLogic: (context) => context.itemDelivered || false,
      completionCheck: (progress) => progress.delivered === true,
      visualIndicator: (scene, objective) => {
        // Destination marker
      },
    },
    {
      id: 'craft_item',
      name: 'Craft Item',
      trackingLogic: (context) => context.itemsCrafted || 0,
      completionCheck: (progress) => {
        const crafted = progress.crafted || 0;
        const required = progress.required || 0;
        return crafted >= required;
      },
    },
    {
      id: 'gain_reputation',
      name: 'Gain Reputation',
      trackingLogic: (context) => context.reputationGained || 0,
      completionCheck: (progress) => {
        const gained = progress.gained || 0;
        const required = progress.required || 0;
        return gained >= required;
      },
    },
    {
      id: 'build_friendship',
      name: 'Build Friendship',
      trackingLogic: (context) => context.friendshipInteractions || 0,
      completionCheck: (progress) => {
        const interactions = progress.friendshipInteractions || 0;
        const required = progress.required || 3;
        return interactions >= required;
      },
    },
    {
      id: 'give_gift',
      name: 'Give Gift',
      trackingLogic: (context) => context.giftGiven || false,
      completionCheck: (progress) => progress.giftGiven === true,
    },
  ],

  rewardTypes: ['experience', 'items', 'gold', 'skills', 'reputation', 'unlock'],

  difficultyScaling: {
    easy: {
      xp: 50,
      gold: 100,
      multiplier: 1,
    },
    normal: {
      xp: 100,
      gold: 250,
      multiplier: 1.5,
    },
    hard: {
      xp: 200,
      gold: 500,
      multiplier: 2,
    },
    legendary: {
      xp: 500,
      gold: 1000,
      multiplier: 3,
    },
  },

  generationPrompt: (world) => {
    const setting = world.worldType || 'fantasy';
    const description = world.description || 'An RPG adventure world';

    return `Generate an RPG quest for a ${setting} world.

World Description: ${description}

Create a quest appropriate to the ${setting} setting. The quest should:
- Have an engaging narrative that fits the world's theme and lore
- Include 2-4 objectives from: defeat_enemies, collect_items, reach_location, discover_location, talk_to_npc, escort_npc, deliver_item, craft_item, gain_reputation
- Specify clear targets (enemy types, item names, NPC names, locations)
- Set appropriate difficulty (easy/normal/hard/legendary)
- Provide meaningful rewards (XP, gold, items, skills, reputation, or unlocks)

For medieval-fantasy: Use knights, dragons, magic items, castles
For cyberpunk: Use hackers, corporations, data chips, neon districts
For sci-fi-space: Use aliens, space stations, tech artifacts, planets

Return JSON format:
{
  "title": "Quest title",
  "description": "Engaging narrative description of the quest",
  "category": "combat|collection|exploration|escort|delivery|crafting|social",
  "difficulty": "easy|normal|hard|legendary",
  "objectives": [
    {
      "type": "defeat_enemies",
      "description": "Defeat 5 bandits threatening the village",
      "target": "bandit",
      "required": 5
    },
    {
      "type": "collect_items",
      "description": "Retrieve the stolen amulets",
      "target": "golden_amulet",
      "required": 3,
      "position": { "x": 100, "y": 0, "z": 50 }
    }
  ],
  "rewards": {
    "experience": 200,
    "gold": 500,
    "items": [
      { "itemId": "iron_sword", "quantity": 1, "name": "Iron Sword" }
    ],
    "reputation": { "faction": "village_guard", "amount": 25 }
  }
}`;
  },
};
