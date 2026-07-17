/**
 * US-XC3 — shared golden logic for the quest / radiant conformance corpus.
 *
 * Single source of truth (like schema-manifest.ts) imported by BOTH the CLI
 * emitter (emit-quest-goldens.ts) and the drift-guard test
 * (src/conformance/__tests__/quest-goldens-crosscheck.test.ts) so they can
 * never disagree on how the golden expected values are derived from the TS
 * semantics authority.
 *
 *   - Quest hydration: `hydrateQuestFromProlog` (prolog/quest-hydrator.ts) is
 *     the authority. `projectHydratedQuest` reduces a hydrated quest to the
 *     stable, present-only subset the portable C++ port (FInsimulQuestSystem,
 *     packages/unreal/.../Portable/InsimulQuestSystem) reproduces byte-for-byte.
 *   - Radiant tick: a deterministic distributor of procedurally-generated side
 *     quests tagged 'radiant' (the runtime twin of GameQuestManager
 *     .distributeRadiantQuests). Defined here so the TS reference and the C++
 *     port assert against the same golden facts.
 *
 * The corpus JSON (conformance/quests/*.json) stores `input`/params + emitted
 * `expected`; run `npm run quest-goldens` after changing this file or the
 * hydrator, then commit the regenerated JSON (the drift guard fails otherwise).
 */

import { canonicalJSONStringify } from '../src/save-envelope';
import { hydrateQuestFromProlog } from '../src/prolog/quest-hydrator';

// ── Quest hydration projection ─────────────────────────────────────────────

/** A hydration corpus case: the quest seed (content + optional runtime fields). */
export interface HydrationInput {
  content: string;
  status?: string;
}

/**
 * Reduce a fully-hydrated quest to the present-only subset the C++ port emits.
 * Fields are omitted (never null) when absent so the canonical bytes are the
 * same on both sides — the portable serializer and JSON.stringify both drop
 * undefined, and we deliberately avoid the always-null noise fields
 * (questChainId / parentQuestId) the hydrator back-fills.
 */
export function projectHydratedQuest(q: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined && v !== null) out[k] = v;
  };
  put('title', q.title);
  put('questType', q.questType);
  put('difficulty', q.difficulty);
  put('status', q.status);
  put('targetLanguage', q.targetLanguage);
  put('assignedTo', q.assignedTo);
  put('assignedBy', q.assignedBy);
  put('experienceReward', q.experienceReward);
  if (Array.isArray(q.tags) && q.tags.length > 0) out.tags = q.tags;
  if (Array.isArray(q.prerequisiteQuestIds) && q.prerequisiteQuestIds.length > 0) {
    out.prerequisiteQuestIds = q.prerequisiteQuestIds;
  }
  if (q.completionCriteria) out.completionCriteria = q.completionCriteria;
  if (Array.isArray(q.objectives) && q.objectives.length > 0) {
    out.objectives = q.objectives.map((o: any) => {
      const obj: Record<string, unknown> = {
        id: o.id,
        type: o.type,
        description: o.description,
        requiredCount: o.requiredCount,
      };
      if (o.target !== undefined && o.target !== null) obj.target = o.target;
      if (o.npcId !== undefined && o.npcId !== null) obj.npcId = o.npcId;
      return obj;
    });
  }
  return out;
}

/** Hydrate a seed and project it — the emitted golden for one hydration case. */
export function computeHydrationExpected(input: HydrationInput): Record<string, unknown> {
  // hydrateQuestFromProlog mutates in place; clone so the corpus input is pure.
  const seed: any = { content: input.content };
  if (input.status !== undefined) seed.status = input.status;
  return projectHydratedQuest(hydrateQuestFromProlog(seed));
}

// ── Radiant tick (deterministic side-quest distribution) ───────────────────

export interface RadiantQuestSpec {
  id: string;
  tags?: string[];
  status?: string;
}

export interface RadiantFact {
  predicate: string;
  args: Array<string | number>;
}

export interface RadiantCaseParams {
  quests: RadiantQuestSpec[];
  maxOffering: number;
  ticks: number;
}

/**
 * Deterministic radiant distributor. Each tick, the still-available radiant
 * quests (tag 'radiant', status 'available', not yet offered) are considered in
 * ascending id order and the first `maxOffering` are offered — asserting a
 * `quest_offered(questId, tick)` ground fact and marking the quest offered so it
 * is not re-offered on a later tick. No RNG: same input + tick count => same
 * facts, so the offering is byte-reproducible across runtimes.
 */
export function radiantTick(params: RadiantCaseParams): RadiantFact[] {
  const { quests, maxOffering, ticks } = params;
  const offered = new Set<string>();
  const facts: RadiantFact[] = [];
  for (let t = 0; t < ticks; t++) {
    const candidates = quests
      .filter(
        (q) =>
          Array.isArray(q.tags) &&
          q.tags.includes('radiant') &&
          q.status === 'available' &&
          !offered.has(q.id),
      )
      .map((q) => q.id)
      .sort();
    for (const id of candidates.slice(0, Math.max(0, maxOffering))) {
      offered.add(id);
      facts.push({ predicate: 'quest_offered', args: [id, t] });
    }
  }
  return facts;
}

/** Canonical string for one ground fact: `predicate(arg0,arg1)`. */
export function canonicalFact(f: RadiantFact): string {
  return `${f.predicate}(${f.args.join(',')})`;
}

/** Canonical, order-independent serialization of a fact multiset. */
export function canonicalFactList(facts: RadiantFact[]): string {
  return facts.map(canonicalFact).slice().sort().join('\n');
}

// ── Canonical comparison (shared with the C++ side via CanonicalJsonStringify) ─

/** Canonicalize a projection object exactly as the portable serializer does. */
export function canonicalizeProjection(obj: unknown): string {
  return canonicalJSONStringify(obj);
}
