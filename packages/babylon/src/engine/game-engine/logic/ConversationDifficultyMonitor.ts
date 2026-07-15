/**
 * Conversation Difficulty Monitor
 *
 * Tracks player struggle metrics per turn during an active conversation
 * and triggers dynamic scaffolding (NPC simplifies speech) or stretch
 * challenges (NPC increases complexity) in real time.
 *
 * Struggle signals:
 *   - Grammar error rate (>50% corrected patterns)
 *   - Low target-language usage (<20% for 3+ turns)
 *   - Very short responses (1-2 words for 3+ turns)
 *   - Low conversation quality score
 *
 * The monitor maintains a weighted struggle score (0-1). When it
 * exceeds 0.6 for 2+ consecutive turns, a `difficulty_adjustment_needed`
 * event fires requesting scaffolding. When the player excels (<0.2 for
 * 3+ consecutive turns), a stretch challenge is suggested.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface TurnMetrics {
  /** Number of grammar errors flagged this turn */
  grammarErrors: number;
  /** Number of grammar patterns checked this turn */
  grammarPatternsChecked: number;
  /** Number of target-language words the player used */
  targetLanguageWords: number;
  /** Total words the player used */
  totalPlayerWords: number;
  /** Conversation quality score (0-100) for this turn, if available */
  qualityScore?: number;
}

export type ScaffoldingLevel = 'none' | 'scaffolded' | 'stretch';

export interface DifficultyAdjustment {
  /** What kind of adjustment to apply */
  level: ScaffoldingLevel;
  /** Human-readable reason for the adjustment */
  reason: string;
  /** Current struggle score (0-1) */
  struggleScore: number;
  /** How many consecutive turns the threshold has been met */
  consecutiveTurns: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Struggle score above which scaffolding may trigger */
export const SCAFFOLDING_THRESHOLD = 0.6;
/** Consecutive turns above threshold before scaffolding activates */
export const SCAFFOLDING_CONSECUTIVE_TURNS = 2;

/** Struggle score below which stretch challenge may trigger */
export const STRETCH_THRESHOLD = 0.2;
/** Consecutive turns below threshold before stretch activates */
export const STRETCH_CONSECUTIVE_TURNS = 3;

/** Weights for each struggle signal (must sum to 1) */
export const SIGNAL_WEIGHTS = {
  grammarErrorRate: 0.30,
  targetLanguageUsage: 0.30,
  responseLength: 0.20,
  qualityScore: 0.20,
} as const;

/** Response length (word count) thresholds */
const SHORT_RESPONSE_THRESHOLD = 2;
const GOOD_RESPONSE_LENGTH = 8;

/** Target language usage considered "low" */
const LOW_TARGET_LANG_RATIO = 0.20;

// ── Monitor ─────────────────────────────────────────────────────────────────

export class ConversationDifficultyMonitor {
  private turnHistory: number[] = []; // struggle scores per turn
  private _currentLevel: ScaffoldingLevel = 'none';
  private _consecutiveHighStruggle = 0;
  private _consecutiveLowStruggle = 0;
  private _scaffoldingActivations = 0;
  private _stretchActivations = 0;
  private _onAdjustment: ((adj: DifficultyAdjustment) => void) | null = null;

  /** Register a callback for when a difficulty adjustment is needed */
  onAdjustment(cb: (adj: DifficultyAdjustment) => void): void {
    this._onAdjustment = cb;
  }

  /** Current scaffolding level */
  get currentLevel(): ScaffoldingLevel {
    return this._currentLevel;
  }

  /** How many times scaffolding has activated this conversation */
  get scaffoldingActivations(): number {
    return this._scaffoldingActivations;
  }

  /** How many times stretch has activated this conversation */
  get stretchActivations(): number {
    return this._stretchActivations;
  }

  /** Number of turns recorded */
  get turnCount(): number {
    return this.turnHistory.length;
  }

  /** Most recent struggle score, or null if no turns recorded */
  get lastStruggleScore(): number | null {
    return this.turnHistory.length > 0
      ? this.turnHistory[this.turnHistory.length - 1]
      : null;
  }

  /**
   * Record metrics for a completed turn and evaluate whether
   * scaffolding or stretch adjustment is needed.
   */
  recordTurn(metrics: TurnMetrics): DifficultyAdjustment | null {
    const score = this.computeStruggleScore(metrics);
    this.turnHistory.push(score);

    // Update consecutive counters
    if (score >= SCAFFOLDING_THRESHOLD) {
      this._consecutiveHighStruggle++;
      this._consecutiveLowStruggle = 0;
    } else if (score <= STRETCH_THRESHOLD) {
      this._consecutiveLowStruggle++;
      this._consecutiveHighStruggle = 0;
    } else {
      this._consecutiveHighStruggle = 0;
      this._consecutiveLowStruggle = 0;
    }

    // Check for scaffolding activation
    if (
      this._consecutiveHighStruggle >= SCAFFOLDING_CONSECUTIVE_TURNS &&
      this._currentLevel !== 'scaffolded'
    ) {
      this._currentLevel = 'scaffolded';
      this._scaffoldingActivations++;
      const adj: DifficultyAdjustment = {
        level: 'scaffolded',
        reason: this.buildScaffoldingReason(metrics, score),
        struggleScore: score,
        consecutiveTurns: this._consecutiveHighStruggle,
      };
      this._onAdjustment?.(adj);
      return adj;
    }

    // Check for stretch activation
    if (
      this._consecutiveLowStruggle >= STRETCH_CONSECUTIVE_TURNS &&
      this._currentLevel !== 'stretch'
    ) {
      this._currentLevel = 'stretch';
      this._stretchActivations++;
      const adj: DifficultyAdjustment = {
        level: 'stretch',
        reason: 'Player is performing exceptionally well — increasing complexity.',
        struggleScore: score,
        consecutiveTurns: this._consecutiveLowStruggle,
      };
      this._onAdjustment?.(adj);
      return adj;
    }

    // Check for de-escalation: if scaffolded and no longer struggling, return to none
    if (this._currentLevel === 'scaffolded' && score < SCAFFOLDING_THRESHOLD) {
      // Only de-escalate after 2 consecutive non-struggle turns
      if (this._consecutiveHighStruggle === 0 && this.turnHistory.length >= 2) {
        const prev = this.turnHistory[this.turnHistory.length - 2];
        if (prev < SCAFFOLDING_THRESHOLD) {
          this._currentLevel = 'none';
          const adj: DifficultyAdjustment = {
            level: 'none',
            reason: 'Player is recovering — returning to normal difficulty.',
            struggleScore: score,
            consecutiveTurns: 0,
          };
          this._onAdjustment?.(adj);
          return adj;
        }
      }
    }

    // Check for de-escalation from stretch
    if (this._currentLevel === 'stretch' && score > STRETCH_THRESHOLD) {
      if (this._consecutiveLowStruggle === 0 && this.turnHistory.length >= 2) {
        const prev = this.turnHistory[this.turnHistory.length - 2];
        if (prev > STRETCH_THRESHOLD) {
          this._currentLevel = 'none';
          const adj: DifficultyAdjustment = {
            level: 'none',
            reason: 'Returning to standard difficulty after stretch challenge.',
            struggleScore: score,
            consecutiveTurns: 0,
          };
          this._onAdjustment?.(adj);
          return adj;
        }
      }
    }

    return null;
  }

  /**
   * Compute a weighted struggle score from turn metrics.
   * Returns 0 (no struggle) to 1 (maximum struggle).
   */
  computeStruggleScore(metrics: TurnMetrics): number {
    // 1. Grammar error rate signal (0 = no errors, 1 = all errors)
    const grammarSignal = metrics.grammarPatternsChecked > 0
      ? metrics.grammarErrors / metrics.grammarPatternsChecked
      : 0;

    // 2. Target language usage signal (inverted: low usage = high struggle)
    const targetLangRatio = metrics.totalPlayerWords > 0
      ? metrics.targetLanguageWords / metrics.totalPlayerWords
      : 0;
    // Map: 0% usage → 1.0 struggle, ≥50% usage → 0.0
    const targetLangSignal = Math.max(0, Math.min(1, 1 - targetLangRatio / 0.5));

    // 3. Response length signal (very short = high struggle)
    const lengthSignal = metrics.totalPlayerWords <= SHORT_RESPONSE_THRESHOLD
      ? 1.0
      : metrics.totalPlayerWords >= GOOD_RESPONSE_LENGTH
        ? 0.0
        : 1 - (metrics.totalPlayerWords - SHORT_RESPONSE_THRESHOLD) /
              (GOOD_RESPONSE_LENGTH - SHORT_RESPONSE_THRESHOLD);

    // 4. Quality score signal (inverted: low quality = high struggle)
    const qualitySignal = metrics.qualityScore !== undefined
      ? Math.max(0, Math.min(1, 1 - metrics.qualityScore / 100))
      : 0; // neutral if no quality score available

    // Weighted combination
    const raw =
      SIGNAL_WEIGHTS.grammarErrorRate * grammarSignal +
      SIGNAL_WEIGHTS.targetLanguageUsage * targetLangSignal +
      SIGNAL_WEIGHTS.responseLength * lengthSignal +
      SIGNAL_WEIGHTS.qualityScore * qualitySignal;

    return Math.max(0, Math.min(1, raw));
  }

  /** Reset all state — call between conversations */
  reset(): void {
    this.turnHistory = [];
    this._currentLevel = 'none';
    this._consecutiveHighStruggle = 0;
    this._consecutiveLowStruggle = 0;
    this._scaffoldingActivations = 0;
    this._stretchActivations = 0;
  }

  private buildScaffoldingReason(metrics: TurnMetrics, score: number): string {
    const reasons: string[] = [];
    if (metrics.grammarPatternsChecked > 0) {
      const rate = metrics.grammarErrors / metrics.grammarPatternsChecked;
      if (rate > 0.5) reasons.push('high grammar error rate');
    }
    if (metrics.totalPlayerWords > 0) {
      const ratio = metrics.targetLanguageWords / metrics.totalPlayerWords;
      if (ratio < LOW_TARGET_LANG_RATIO) reasons.push('low target language usage');
    }
    if (metrics.totalPlayerWords <= SHORT_RESPONSE_THRESHOLD) {
      reasons.push('very short responses');
    }
    if (metrics.qualityScore !== undefined && metrics.qualityScore < 30) {
      reasons.push('low conversation quality');
    }

    return reasons.length > 0
      ? `Player is struggling: ${reasons.join(', ')}. Activating scaffolding.`
      : `Struggle score ${score.toFixed(2)} exceeded threshold. Activating scaffolding.`;
  }
}
