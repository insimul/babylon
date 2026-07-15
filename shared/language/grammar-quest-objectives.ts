/**
 * Grammar-Focused Quest Objectives
 *
 * Provides grammar pattern analysis for quest objectives, immersive NPC
 * correction formatting, and per-objective grammar tracking. Works with
 * the existing grammar feedback pipeline (GrammarFeedback / GrammarCorrection)
 * and maps grammar quests to canonical objective types (complete_conversation,
 * use_vocabulary) via a grammarFocus flag.
 */

import type { GrammarFeedback, GrammarCorrection } from '@shared/language/progress';

// ── Grammar Focus Types ─────────────────────────────────────────────────────

/** Grammar focus metadata attached to a quest objective. */
export interface GrammarFocusConfig {
  /** The grammar focus area (e.g. 'past_tense', 'question_formation', 'formal_register') */
  grammarFocus: string;
  /** Specific grammar patterns to track (e.g. ['past tense', 'verb conjugation']) */
  grammarPatterns: string[];
  /** Minimum accuracy (0-100) required to complete the objective */
  requiredAccuracy?: number;
  /** Minimum correct uses required */
  requiredCorrectUses?: number;
}

/** Per-objective grammar tracking state. */
export interface ObjectiveGrammarProgress {
  objectiveIndex: number;
  grammarFocus: string;
  patterns: PatternProgress[];
  totalCorrect: number;
  totalErrors: number;
  accuracy: number; // 0-100
  completed: boolean;
}

/** Tracking for a single grammar pattern within an objective. */
export interface PatternProgress {
  pattern: string;
  correctUses: number;
  incorrectUses: number;
  lastFeedback?: string;
  examples: { correct: string[]; incorrect: string[] };
}

// ── Grammar Trigger Analyzer ────────────────────────────────────────────────

/**
 * Analyzes grammar feedback against quest objectives to determine which
 * objectives should receive progress updates.
 *
 * Sends the player's text through the existing grammar feedback pipeline
 * results and matches corrections/successes to grammar-focused objectives.
 */
export class GrammarTriggerAnalyzer {
  private objectiveProgress: Map<number, ObjectiveGrammarProgress> = new Map();

  constructor(
    objectives: Array<{ type: string; grammarFocus?: string; grammarPatterns?: string[]; requiredAccuracy?: number; requiredCorrectUses?: number }>,
  ) {
    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      if (!obj.grammarFocus && !obj.grammarPatterns?.length) continue;

      const patterns = parseGrammarPatterns(obj.grammarPatterns);
      this.objectiveProgress.set(i, {
        objectiveIndex: i,
        grammarFocus: obj.grammarFocus || 'general',
        patterns: patterns.map(p => ({
          pattern: p,
          correctUses: 0,
          incorrectUses: 0,
          examples: { correct: [], incorrect: [] },
        })),
        totalCorrect: 0,
        totalErrors: 0,
        accuracy: 100,
        completed: false,
      });
    }
  }

  /**
   * Process grammar feedback from the pipeline and update per-objective tracking.
   * Returns the indices of objectives that received progress updates.
   */
  processGrammarFeedback(feedback: GrammarFeedback): number[] {
    if (feedback.status === 'no_target_language') return [];

    const updatedIndices: number[] = [];

    this.objectiveProgress.forEach((progress, index) => {
      if (progress.completed) return;

      if (feedback.status === 'correct') {
        progress.totalCorrect++;
        for (const pp of progress.patterns) {
          pp.correctUses++;
        }
        updatedIndices.push(index);
      } else if (feedback.status === 'corrected') {
        for (const error of feedback.errors) {
          const matchingPattern = findMatchingPattern(progress.patterns, error.pattern);
          if (matchingPattern) {
            matchingPattern.incorrectUses++;
            matchingPattern.lastFeedback = error.explanation;
            addExample(matchingPattern.examples.incorrect, error.incorrect);
            progress.totalErrors++;
            updatedIndices.push(index);
          } else {
            // Error doesn't match any tracked pattern — count as general error
            progress.totalErrors++;
            updatedIndices.push(index);
          }
        }
      }

      // Update accuracy
      const total = progress.totalCorrect + progress.totalErrors;
      progress.accuracy = total > 0 ? Math.round((progress.totalCorrect / total) * 100) : 100;
    });

    return updatedIndices.filter((v, i, a) => a.indexOf(v) === i);
  }

  /**
   * Record a correct grammar usage for a specific pattern.
   * Used when the player successfully uses a targeted grammar form.
   */
  recordCorrectUsage(patternName: string, example?: string): number[] {
    const updatedIndices: number[] = [];

    this.objectiveProgress.forEach((progress, index) => {
      if (progress.completed) return;

      const matching = findMatchingPattern(progress.patterns, patternName);
      if (matching) {
        matching.correctUses++;
        if (example) addExample(matching.examples.correct, example);
        progress.totalCorrect++;
        const total = progress.totalCorrect + progress.totalErrors;
        progress.accuracy = total > 0 ? Math.round((progress.totalCorrect / total) * 100) : 100;
        updatedIndices.push(index);
      }
    });

    return updatedIndices;
  }

  /** Get progress for a specific objective. */
  getObjectiveProgress(index: number): ObjectiveGrammarProgress | undefined {
    return this.objectiveProgress.get(index);
  }

  /** Get all objective progress entries. */
  getAllProgress(): ObjectiveGrammarProgress[] {
    return Array.from(this.objectiveProgress.values());
  }

  /**
   * Check if an objective's grammar requirements are met.
   */
  isObjectiveComplete(index: number, requiredAccuracy = 60, requiredCorrectUses = 3): boolean {
    const progress = this.objectiveProgress.get(index);
    if (!progress) return false;

    const total = progress.totalCorrect + progress.totalErrors;
    if (total === 0) return false;

    return progress.accuracy >= requiredAccuracy && progress.totalCorrect >= requiredCorrectUses;
  }
}

// ── Immersive NPC Correction Formatting ─────────────────────────────────────

/**
 * Format grammar corrections as immersive NPC dialogue that doesn't break
 * the narrative flow. The NPC naturally weaves corrections into conversation.
 */
export function formatImmersiveCorrection(correction: GrammarCorrection): string {
  const templates = IMMERSIVE_CORRECTION_TEMPLATES;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template
    .replace('{{corrected}}', correction.corrected)
    .replace('{{explanation}}', correction.explanation);
}

/**
 * Format multiple corrections into a single immersive NPC response.
 * Groups corrections naturally so the NPC doesn't repeat correction phrases.
 */
export function formatImmersiveCorrections(corrections: GrammarCorrection[]): string {
  if (corrections.length === 0) return '';
  if (corrections.length === 1) return formatImmersiveCorrection(corrections[0]);

  const parts: string[] = [];

  // First correction gets a full template
  parts.push(formatImmersiveCorrection(corrections[0]));

  // Additional corrections use shorter follow-up forms
  for (let i = 1; i < corrections.length; i++) {
    const followUp = FOLLOW_UP_TEMPLATES[i % FOLLOW_UP_TEMPLATES.length];
    parts.push(
      followUp
        .replace('{{corrected}}', corrections[i].corrected)
        .replace('{{explanation}}', corrections[i].explanation),
    );
  }

  return parts.join(' ');
}

/**
 * Build a grammar-aware NPC response prompt addition.
 * Instructs the AI to weave corrections naturally into dialogue.
 */
export function buildGrammarCorrectionPrompt(grammarFocus: string, patterns: string[]): string {
  return `GRAMMAR FOCUS: This quest practices "${grammarFocus}".
Target patterns: ${patterns.join(', ')}.

When the player makes grammar errors in these patterns, correct them NATURALLY within your character's dialogue:
- Rephrase what they said correctly: "Ah, you mean [correct form]? Yes, that's right!"
- Model the correct form in your response without being pedantic
- Acknowledge correct usage with encouragement woven into the conversation
- Do NOT break character or use metalinguistic terms like "conjugation" or "grammar"
- Keep corrections brief and conversational`;
}

// ── Correction Templates ────────────────────────────────────────────────────

const IMMERSIVE_CORRECTION_TEMPLATES = [
  'Ah, you mean "{{corrected}}"? Yes, exactly!',
  'I think you meant "{{corrected}}" — {{explanation}}.',
  '"{{corrected}}" — yes, that\'s the way to say it!',
  'Oh, "{{corrected}}"! {{explanation}}.',
  'Right, "{{corrected}}" is how we say that here.',
];

const FOLLOW_UP_TEMPLATES = [
  'And "{{corrected}}" — {{explanation}}.',
  'Also, we say "{{corrected}}" here.',
  'Oh, and "{{corrected}}" is the right form.',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse grammar patterns from string or string array. */
function parseGrammarPatterns(patterns?: string[] | string): string[] {
  if (!patterns) return ['general'];
  if (typeof patterns === 'string') {
    return patterns.split(',').map(p => p.trim()).filter(Boolean);
  }
  return patterns.length > 0 ? patterns : ['general'];
}

/** Find a pattern that matches the given name (case-insensitive, partial match). */
function findMatchingPattern(patterns: PatternProgress[], errorPattern: string): PatternProgress | undefined {
  const lower = errorPattern.toLowerCase();
  // Exact match first
  const exact = patterns.find(p => p.pattern.toLowerCase() === lower);
  if (exact) return exact;
  // Partial match (e.g. "past tense" matches "past tense conjugation")
  return patterns.find(p =>
    lower.includes(p.pattern.toLowerCase()) || p.pattern.toLowerCase().includes(lower),
  );
}

/** Add an example to a capped array (max 5 examples). */
function addExample(arr: string[], example: string): void {
  if (arr.length >= 5) arr.shift();
  arr.push(example);
}

/**
 * Extract grammar focus config from a quest objective's extra fields.
 * Normalizes the various ways grammar focus can be specified.
 */
export function extractGrammarFocus(objective: Record<string, any>): GrammarFocusConfig | null {
  const grammarFocus = objective.grammarFocus;
  const grammarPatterns = objective.grammarPatterns;

  if (!grammarFocus && !grammarPatterns) return null;

  return {
    grammarFocus: grammarFocus || 'general',
    grammarPatterns: parseGrammarPatterns(grammarPatterns),
    requiredAccuracy: objective.requiredAccuracy,
    requiredCorrectUses: objective.requiredCorrectUses,
  };
}

/**
 * Check if a quest objective has grammar focus.
 */
export function isGrammarFocusedObjective(objective: Record<string, any>): boolean {
  return !!(objective.grammarFocus || objective.grammarPatterns);
}
