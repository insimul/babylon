/**
 * Mastery Level Type
 *
 * Vocabulary mastery progression states. Used by SRS scheduling,
 * vocabulary tracking, and proficiency assessment. Lives in runtime
 * shared so both the in-game runtime and authoring-side knowledge
 * tracking can reference the same canonical type.
 */

export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'mastered';

export const MASTERY_LEVELS: MasteryLevel[] = ['new', 'learning', 'familiar', 'mastered'];
