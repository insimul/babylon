/**
 * Puzzle Quest Type Definition
 *
 * Defines quest categories, objectives, and rewards specific to puzzle games.
 */

import { QuestTypeDefinition } from './types';

export const puzzleQuestType: QuestTypeDefinition = {
  id: 'puzzle',
  name: 'Puzzle',

  questCategories: [
    { id: 'logic', name: 'Logic', icon: '🧠', description: 'Solve logical challenges' },
    { id: 'spatial', name: 'Spatial', icon: '📐', description: 'Navigate spatial puzzles' },
    { id: 'sequence', name: 'Sequence', icon: '🔢', description: 'Complete patterns and sequences' },
    { id: 'physics', name: 'Physics', icon: '⚙️', description: 'Use physics to solve problems' },
    { id: 'mystery', name: 'Mystery', icon: '🔍', description: 'Uncover hidden clues and solutions' },
  ],

  objectiveTypes: [
    {
      id: 'solve_puzzle',
      name: 'Solve Puzzle',
      trackingLogic: (context) => context.puzzleSolved || false,
      completionCheck: (progress) => progress.puzzleSolved === true,
    },
    {
      id: 'unlock_door',
      name: 'Unlock Door',
      trackingLogic: (context) => context.doorUnlocked || false,
      completionCheck: (progress) => progress.doorUnlocked === true,
    },
    {
      id: 'activate_mechanism',
      name: 'Activate Mechanism',
      trackingLogic: (context) => context.mechanismsActivated || 0,
      completionCheck: (progress) => (progress.mechanismsActivated || 0) >= (progress.required || 1),
    },
    {
      id: 'find_clues',
      name: 'Find Clues',
      trackingLogic: (context) => context.cluesFound || 0,
      completionCheck: (progress) => (progress.cluesFound || 0) >= (progress.required || 1),
    },
    {
      id: 'complete_pattern',
      name: 'Complete Pattern',
      trackingLogic: (context) => context.patternCompleted || false,
      completionCheck: (progress) => progress.patternCompleted === true,
    },
    {
      id: 'reach_location',
      name: 'Reach Location',
      trackingLogic: (context) => context.locationReached || false,
      completionCheck: (progress) => progress.locationReached === true,
    },
    {
      id: 'collect_pieces',
      name: 'Collect Pieces',
      trackingLogic: (context) => context.piecesCollected || 0,
      completionCheck: (progress) => (progress.piecesCollected || 0) >= (progress.required || 1),
    },
    {
      id: 'time_challenge',
      name: 'Time Challenge',
      trackingLogic: (context) => context.completedInTime || false,
      completionCheck: (progress) => progress.completedInTime === true,
    },
  ],

  rewardTypes: ['experience', 'items', 'unlock'],

  difficultyScaling: {
    easy: { xp: 30, multiplier: 0.7 },
    medium: { xp: 60, multiplier: 1.0 },
    hard: { xp: 100, multiplier: 1.5 },
    expert: { xp: 160, multiplier: 2.0 },
  },

  generationPrompt: (world) => `Generate a puzzle quest for the world "${world.name}".
The quest should involve one or more of these puzzle types: logic, spatial, sequence, physics, or mystery.
Available objective types: solve_puzzle, unlock_door, activate_mechanism, find_clues, complete_pattern, reach_location, collect_pieces, time_challenge.
The puzzle should be intellectually engaging and have a clear solution path.
World description: ${world.description || 'A mysterious puzzle world'}`,
};
