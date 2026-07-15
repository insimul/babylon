/**
 * Short lore / tip strings displayed during the loading screen so players
 * know the game has not frozen. Kept as a plain array so it can be localized
 * (via i18n) later if needed.
 */
export const LOADING_TIPS: string[] = [
  'Villagers remember who they spoke to. Be kind — they gossip.',
  'Shopkeepers restock overnight. Visit at dawn for the best deals.',
  'Every settlement has its own language customs. Listen before you speak.',
  'Quests adapt to the choices you make. There is no single right path.',
  'Weather and time of day change what NPCs do. Come back later.',
  'Examine strangers to learn a new word.',
  'Relationships shift: today\'s stranger can become tomorrow\'s ally.',
  'The world keeps simulating while you sleep. Resting passes time.',
  'Quietly observing a conversation sometimes teaches more than joining it.',
  'Your save file is the whole world — back it up before big experiments.',
];

export function pickTip(tips: string[] = LOADING_TIPS, index: number): string {
  if (tips.length === 0) return '';
  const i = ((index % tips.length) + tips.length) % tips.length;
  return tips[i];
}
