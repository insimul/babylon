/**
 * Player Language State — Prolog-first read helpers.
 *
 * The promotion pipeline (server/services/save-file/promote-phase-results.ts)
 * emits three player-language facts when an assessment completes:
 *   - player_cefr_level(player, Level)          — latest CEFR band
 *   - player_cefr_snapshot(player, Level, Ts)   — historical trajectory
 *   - player_dimension_score(player, Dim, Score) — per-dimension score (0-100)
 *
 * Adapter read-paths (NPC prompt builder, quest difficulty adapter) should
 * source CEFR + weak areas from these facts rather than reading the
 * denormalized `save.currentState.player.cefrLevel` field directly, so all
 * gameplay logic flows through Prolog as the source of truth (see
 * project_cefr_validation_plan.md).
 *
 * Weak dimensions are DERIVED at query time from player_dimension_score
 * facts below a threshold — keeps the promotion pipeline from having to
 * emit a separate weak_area fact per dimension.
 */

import type { SerializedFact } from './types';
import type { CEFRLevel } from '../language/cefr';

const CEFR_LEVELS: readonly CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * Extract the player's current CEFR level from `player_cefr_level/2` facts.
 * Returns null when no such fact is present — caller falls back to save state.
 */
export function extractPlayerCefrFromFacts(
  facts: SerializedFact[] | undefined | null,
): CEFRLevel | null {
  if (!facts?.length) return null;
  const fact = facts.find(f => f.predicate === 'player_cefr_level');
  if (!fact || fact.args.length < 2) return null;
  const raw = String(fact.args[1] ?? '').trim().toUpperCase();
  return (CEFR_LEVELS as readonly string[]).includes(raw) ? (raw as CEFRLevel) : null;
}

/**
 * Extract weak dimensions using a two-tier read path:
 *
 *  1. **Explicit `weak_area(player, Dim)` facts** — emitted by the promotion
 *     pipeline on assessment completion. Preferred when present because they
 *     encode the canonical threshold decision (keeps adapters from each
 *     picking their own threshold).
 *  2. **Derive from `player_dimension_score/3`** — fallback for older saves
 *     written before weak_area emission, or for callers that want a custom
 *     threshold. A dimension is "weak" when its score (0-100) is below
 *     `threshold` (default 60, below B1-equivalent on the grader scale).
 *
 * Returns an array of dimension names (e.g. ['grammar', 'vocabulary']) sorted
 * by severity (lowest score first when derived; order-preserving when using
 * explicit facts), empty when no facts / no weak dims.
 */
export function extractPlayerWeakDimensions(
  facts: SerializedFact[] | undefined | null,
  threshold = 60,
): string[] {
  if (!facts?.length) return [];

  // Tier 1: explicit weak_area facts. Only use them when the caller wants
  // the canonical threshold — a custom threshold forces the derive path so
  // the result respects it.
  if (threshold === 60) {
    const explicit: string[] = [];
    for (const fact of facts) {
      if (fact.predicate !== 'weak_area') continue;
      if (fact.args.length < 2) continue;
      const dim = String(fact.args[1] ?? '').trim();
      if (dim) explicit.push(dim);
    }
    if (explicit.length > 0) return explicit;
  }

  // Tier 2: derive from dimension scores.
  const scored: Array<{ dim: string; score: number }> = [];
  for (const fact of facts) {
    if (fact.predicate !== 'player_dimension_score') continue;
    if (fact.args.length < 3) continue;
    const dim = String(fact.args[1] ?? '').trim();
    const score = Number(fact.args[2]);
    if (!dim || !Number.isFinite(score)) continue;
    if (score < threshold) scored.push({ dim, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map(s => s.dim);
}
