/**
 * NPC Awareness Context
 *
 * Defines the game state context that NPCs use to make dialogue and behavior
 * decisions. Includes time of day, weather, active quests, recent events,
 * and player progress — all of which influence how NPCs talk and act.
 */

/** Weather conditions that affect NPC dialogue and behavior */
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'windy';

/** Time period derived from game hour */
export type TimePeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night';

/** A quest the NPC knows about */
export interface NPCAwareQuest {
  questId: string;
  questName: string;
  /** Whether this NPC assigned the quest */
  assignedByThisNPC: boolean;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
}

/** A recent game event NPCs may reference */
export interface RecentGameEvent {
  type: string;
  description: string;
  /** How many game-hours ago this happened */
  hoursAgo: number;
}

/** Full awareness context passed to dialogue/behavior systems */
export interface NPCAwarenessContext {
  /** Current game hour (0-23) */
  gameHour: number;
  /** Derived time period */
  timePeriod: TimePeriod;
  /** Current weather */
  weather: WeatherCondition;
  /** Active quests the NPC knows about */
  quests: NPCAwareQuest[];
  /** Recent events NPCs might reference */
  recentEvents: RecentGameEvent[];
  /** Player's general progress level */
  playerProgress: {
    questsCompleted: number;
    reputation: number;
    isNewToTown: boolean;
  };
  /** Current season if applicable */
  season?: string;
}

/** Derive time period from game hour */
export function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** Get a natural-language description of the time */
export function describeTime(hour: number): string {
  const period = getTimePeriod(hour);
  if (period === 'dawn') return 'early morning, just after sunrise';
  if (period === 'morning') return 'morning';
  if (period === 'afternoon') return 'afternoon';
  if (period === 'evening') return 'evening';
  if (hour >= 21 && hour < 24) return 'late evening';
  return 'the middle of the night';
}

/** Get a natural-language description of the weather */
export function describeWeather(weather: WeatherCondition): string {
  switch (weather) {
    case 'clear': return 'clear and pleasant';
    case 'cloudy': return 'overcast';
    case 'rain': return 'rainy';
    case 'storm': return 'stormy with heavy rain';
    case 'snow': return 'snowing';
    case 'fog': return 'foggy with low visibility';
    case 'windy': return 'windy';
  }
}
