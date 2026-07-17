/**
 * Loading-screen view-model (US-GU1).
 *
 * The engine-agnostic heart of the startup loading screen. The boot loop (world
 * source -> save slot -> KB -> systems init) advances this model through an ordered
 * set of weighted phases; the model turns the current phase into a MONOTONIC
 * progress fraction in [0, 1], a human label, and a deterministic per-phase tip.
 * Every native engine's loading screen (the Godot `loading_screen_model.gd`, and
 * the Unity/Unreal equivalents) mirrors this contract; the shared cases live in
 * `packages/core/conformance/ui/loading-phases.json`.
 *
 * The progress rule IS the contract: progress at a phase = cumulative weight
 * through that phase / total weight. Re-entering a phase (or an earlier one) never
 * lowers the bar.
 */

export interface LoadingPhase {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
}

/** Default phase table — mirrors `loading-phases.json` -> `phases`. */
export const DEFAULT_LOADING_PHASES: readonly LoadingPhase[] = [
  { key: 'init', label: 'Starting up…', weight: 1 },
  { key: 'world', label: 'Loading world…', weight: 3 },
  { key: 'save', label: 'Restoring save…', weight: 2 },
  { key: 'kb', label: 'Building knowledge base…', weight: 2 },
  { key: 'systems', label: 'Initializing systems…', weight: 1 },
  { key: 'ready', label: 'Ready', weight: 1 },
];

/** Default deterministic tip pool — mirrors `loading-phases.json` -> `tips`. */
export const DEFAULT_LOADING_TIPS: readonly string[] = [
  'Talk to villagers to uncover radiant quests.',
  'Every conversation is generated live — no two runs are alike.',
  'Check the quest journal (J) to track objectives.',
  'Your progress autosaves to the active slot.',
];

export class LoadingScreenModel {
  private readonly phases: readonly LoadingPhase[];
  private readonly tips: readonly string[];
  private readonly totalWeight: number;
  private currentKey = '';
  private progressValue = 0;

  constructor(
    phases: readonly LoadingPhase[] = DEFAULT_LOADING_PHASES,
    tips: readonly string[] = DEFAULT_LOADING_TIPS,
  ) {
    this.phases = phases.length > 0 ? phases : DEFAULT_LOADING_PHASES;
    this.tips = tips.length > 0 ? tips : DEFAULT_LOADING_TIPS;
    this.totalWeight = Math.max(
      1,
      this.phases.reduce((sum, p) => sum + p.weight, 0),
    );
  }

  /**
   * Advance to a named phase. Progress is clamped monotonic — re-entering the
   * current phase, or a phase earlier in the order, never lowers the bar.
   */
  advance(key: string): void {
    const idx = this.indexOf(key);
    if (idx < 0) return;
    this.currentKey = key;
    let cumulative = 0;
    for (let i = 0; i <= idx; i++) cumulative += this.phases[i].weight;
    this.progressValue = Math.max(this.progressValue, cumulative / this.totalWeight);
  }

  progress(): number {
    return this.progressValue;
  }

  label(): string {
    const idx = this.indexOf(this.currentKey);
    return idx < 0 ? '' : this.phases[idx].label;
  }

  /** Deterministic per-phase tip (index by phase position, wrapping the pool). */
  tip(): string {
    const idx = this.indexOf(this.currentKey);
    if (idx < 0 || this.tips.length === 0) return '';
    return this.tips[idx % this.tips.length];
  }

  currentPhase(): string {
    return this.currentKey;
  }

  /** True once the final (terminal) phase has been reached. */
  isComplete(): boolean {
    if (this.phases.length === 0) return false;
    return this.currentKey === this.phases[this.phases.length - 1].key;
  }

  reset(): void {
    this.currentKey = '';
    this.progressValue = 0;
  }

  private indexOf(key: string): number {
    return this.phases.findIndex((p) => p.key === key);
  }
}
