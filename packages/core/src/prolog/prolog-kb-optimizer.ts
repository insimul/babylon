/**
 * PrologKBOptimizer
 *
 * Wraps a {@link PrologEngine} with three optimizations used by the
 * in-browser game runtime to keep initial load cheap on limited hardware:
 *
 *   1. Lazy shard loading — world facts are grouped by named shard
 *      (e.g. per-settlement) and loaded on demand. Only shards the player
 *      is currently in / adjacent to need to be resident in the KB.
 *   2. Query result caching — frequently-issued queries (e.g. "what actions
 *      are available here?") return cached results until any mutation.
 *   3. Quality-preset budgets — a per-preset cap on total loaded facts,
 *      with automatic eviction of the lowest-priority resident shard when
 *      a new shard would push the KB over budget.
 *
 * Stats ({@link PrologKBStats}) are exposed for the resource profiler
 * (US-001): fact count, rule count, cache hit/miss rates, total query /
 * load time, estimated memory footprint, active/pending shard ids.
 *
 * Correctness notes:
 *   - Cache invalidation is conservative: ANY assert/retract/addRule call
 *     flushes the entire query cache. This avoids having to model the
 *     rule dependency graph at the expense of some cache misses in
 *     mixed read/write workloads. Read-heavy workloads (which dominate
 *     the game runtime) benefit fully.
 */

import {
  type PrologEngine,
  type QueryResult,
  type EngineStats,
} from './prolog-engine';

export type QualityPresetName = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  name: QualityPresetName;
  maxFacts: number;
  queryCacheSize: number;
}

export const QUALITY_PRESETS: Record<QualityPresetName, QualityPreset> = {
  minimal: { name: 'minimal', maxFacts: 2_000, queryCacheSize: 50 },
  low:     { name: 'low',     maxFacts: 5_000, queryCacheSize: 100 },
  medium:  { name: 'medium',  maxFacts: 15_000, queryCacheSize: 200 },
  high:    { name: 'high',    maxFacts: 50_000, queryCacheSize: 500 },
  ultra:   { name: 'ultra',   maxFacts: 200_000, queryCacheSize: 1_000 },
};

export interface FactShard {
  /** Unique shard id (e.g. "settlement:rivendell", "zone:north_hills"). */
  id: string;
  /** Facts to assert when the shard is loaded (no trailing period required). */
  facts: string[];
  /**
   * Lower number = higher priority (kept longer under memory pressure).
   * Default = 100. Essentials like the player's current settlement should
   * use priority 0–10; background / faraway shards should use 500+.
   */
  priority?: number;
  /** Optional human-readable label for debug UIs. */
  label?: string;
}

export interface ShardInfo {
  id: string;
  priority: number;
  label?: string;
  factCount: number;
  loaded: boolean;
  lastLoadedAt?: number;
}

export interface PrologKBStats {
  preset: QualityPresetName;
  factCount: number;
  ruleCount: number;
  dynamicPredicates: string[];
  factBudget: number;
  factBudgetUsedPct: number;
  loadedShardIds: string[];
  pendingShardIds: string[];
  queryCacheSize: number;
  queryCacheCapacity: number;
  queryCacheHits: number;
  queryCacheMisses: number;
  queryCacheHitRate: number;
  totalQueries: number;
  totalQueryTimeMs: number;
  averageQueryTimeMs: number;
  totalShardLoadTimeMs: number;
  estimatedMemoryBytes: number;
  perPredicateCounts: Record<string, number>;
}

interface CacheEntry {
  key: string;
  result: QueryResult;
}

interface ResidentShard extends FactShard {
  priority: number;
  loadedAt: number;
}

export class PrologKBOptimizer {
  private readonly engine: PrologEngine;
  private preset: QualityPreset;

  private readonly shards = new Map<string, FactShard>();
  private readonly residentShards = new Map<string, ResidentShard>();

  /** LRU query cache — Map preserves insertion order; touching re-inserts. */
  private readonly queryCache = new Map<string, CacheEntry>();

  private cacheHits = 0;
  private cacheMisses = 0;
  private totalQueries = 0;
  private totalQueryTimeMs = 0;
  private totalShardLoadTimeMs = 0;

  constructor(engine: PrologEngine, preset: QualityPreset = QUALITY_PRESETS.medium) {
    this.engine = engine;
    this.preset = preset;
  }

  // ── Preset management ────────────────────────────────────────────────────

  getPreset(): QualityPreset {
    return this.preset;
  }

  /**
   * Swap to a different quality preset. If the new budget is smaller than
   * the current fact count, the lowest-priority resident shards are
   * evicted until the KB is back under budget.
   */
  async setPreset(preset: QualityPreset): Promise<void> {
    this.preset = preset;
    this.trimQueryCacheToCapacity();
    await this.evictUntilUnderBudget();
  }

  // ── Shard management ─────────────────────────────────────────────────────

  /**
   * Register a shard. Does NOT load it — call {@link loadShard} when the
   * player enters the relevant area.
   */
  registerShard(shard: FactShard): void {
    if (!shard.id) throw new Error('Shard must have an id');
    this.shards.set(shard.id, { ...shard, priority: shard.priority ?? 100 });
  }

  registerShards(shards: FactShard[]): void {
    for (const s of shards) this.registerShard(s);
  }

  /**
   * Load a registered shard's facts into the KB. Returns false if the
   * shard is unknown or if the budget cannot accommodate it even after
   * evicting lower-priority shards.
   */
  async loadShard(id: string): Promise<boolean> {
    const shard = this.shards.get(id);
    if (!shard) return false;
    if (this.residentShards.has(id)) return true;

    const priority = shard.priority ?? 100;
    const incomingCount = shard.facts.length;

    if (!(await this.ensureBudgetFor(incomingCount, priority))) {
      return false;
    }

    const started = now();
    await this.engine.assertFacts(shard.facts);
    this.totalShardLoadTimeMs += now() - started;

    this.residentShards.set(id, {
      ...shard,
      priority,
      loadedAt: Date.now(),
    });
    this.invalidateCache();
    return true;
  }

  /**
   * Load multiple shards in priority order (lowest number first) and stop
   * when the budget is exhausted. Returns the list of shard ids that
   * actually loaded.
   */
  async loadShards(ids: string[]): Promise<string[]> {
    const ordered = [...ids]
      .map((id) => this.shards.get(id))
      .filter((s): s is FactShard => !!s)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    const loaded: string[] = [];
    for (const shard of ordered) {
      if (await this.loadShard(shard.id)) loaded.push(shard.id);
    }
    return loaded;
  }

  /**
   * Retract a shard's facts from the KB. Safe to call on a shard that
   * isn't currently resident (no-op).
   */
  async unloadShard(id: string): Promise<void> {
    const resident = this.residentShards.get(id);
    if (!resident) return;

    for (const fact of resident.facts) {
      await this.engine.retractFact(fact);
    }
    this.residentShards.delete(id);
    this.invalidateCache();
  }

  listShards(): ShardInfo[] {
    return Array.from(this.shards.values()).map((shard) => {
      const resident = this.residentShards.get(shard.id);
      return {
        id: shard.id,
        priority: shard.priority ?? 100,
        label: shard.label,
        factCount: shard.facts.length,
        loaded: !!resident,
        lastLoadedAt: resident?.loadedAt,
      };
    });
  }

  activeShardIds(): string[] {
    return Array.from(this.residentShards.keys());
  }

  pendingShardIds(): string[] {
    return Array.from(this.shards.keys()).filter((id) => !this.residentShards.has(id));
  }

  // ── Query with caching ───────────────────────────────────────────────────

  async query(queryString: string, maxResults: number = 1000): Promise<QueryResult> {
    const key = cacheKey(queryString, maxResults);

    const cached = this.queryCache.get(key);
    if (cached) {
      // LRU touch: re-insert so it moves to the "most recent" end.
      this.queryCache.delete(key);
      this.queryCache.set(key, cached);
      this.cacheHits++;
      this.totalQueries++;
      return cached.result;
    }

    const started = now();
    const result = await this.engine.query(queryString, maxResults);
    const elapsed = now() - started;

    this.cacheMisses++;
    this.totalQueries++;
    this.totalQueryTimeMs += elapsed;

    // Only cache successful results. Errors (inference-limit, parse) should
    // be re-attempted so callers see the real error rather than a stale one.
    if (result.success && !result.error) {
      this.queryCache.set(key, { key, result });
      this.trimQueryCacheToCapacity();
    }

    return result;
  }

  async queryOnce(queryString: string): Promise<boolean> {
    const result = await this.query(queryString, 1);
    return result.success && result.bindings.length > 0;
  }

  // ── Mutations (invalidate cache) ─────────────────────────────────────────

  async assertFact(fact: string): Promise<boolean> {
    const ok = await this.engine.assertFact(fact);
    if (ok) this.invalidateCache();
    return ok;
  }

  async assertFacts(facts: string[]): Promise<boolean> {
    const ok = await this.engine.assertFacts(facts);
    if (ok) this.invalidateCache();
    return ok;
  }

  async retractFact(fact: string): Promise<boolean> {
    const ok = await this.engine.retractFact(fact);
    if (ok) this.invalidateCache();
    return ok;
  }

  async addRule(rule: string): Promise<boolean> {
    const ok = await this.engine.addRule(rule);
    if (ok) this.invalidateCache();
    return ok;
  }

  async addRules(rules: string[]): Promise<boolean> {
    const ok = await this.engine.addRules(rules);
    if (ok) this.invalidateCache();
    return ok;
  }

  invalidateCache(): void {
    this.queryCache.clear();
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): PrologKBStats {
    const engineStats: EngineStats = this.engine.getStats();
    const perPredicateCounts = this.computePerPredicateCounts();
    const estimatedMemoryBytes = this.estimateMemoryBytes();

    return {
      preset: this.preset.name,
      factCount: engineStats.factCount,
      ruleCount: engineStats.ruleCount,
      dynamicPredicates: engineStats.dynamicPredicates,
      factBudget: this.preset.maxFacts,
      factBudgetUsedPct:
        this.preset.maxFacts === 0 ? 0 : (engineStats.factCount / this.preset.maxFacts) * 100,
      loadedShardIds: this.activeShardIds(),
      pendingShardIds: this.pendingShardIds(),
      queryCacheSize: this.queryCache.size,
      queryCacheCapacity: this.preset.queryCacheSize,
      queryCacheHits: this.cacheHits,
      queryCacheMisses: this.cacheMisses,
      queryCacheHitRate: this.totalQueries === 0 ? 0 : this.cacheHits / this.totalQueries,
      totalQueries: this.totalQueries,
      totalQueryTimeMs: this.totalQueryTimeMs,
      averageQueryTimeMs:
        this.totalQueries === 0 ? 0 : this.totalQueryTimeMs / this.totalQueries,
      totalShardLoadTimeMs: this.totalShardLoadTimeMs,
      estimatedMemoryBytes,
      perPredicateCounts,
    };
  }

  resetCounters(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalQueries = 0;
    this.totalQueryTimeMs = 0;
    this.totalShardLoadTimeMs = 0;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Evict lowest-priority resident shards (highest priority number) until
   * either the incoming shard fits or no lower-priority shard remains.
   * If the incoming shard itself has the worst priority, refuse the load.
   */
  private async ensureBudgetFor(incomingCount: number, incomingPriority: number): Promise<boolean> {
    const current = this.engine.getStats().factCount;
    if (current + incomingCount <= this.preset.maxFacts) return true;

    const evictable = Array.from(this.residentShards.values())
      .filter((s) => s.priority > incomingPriority)
      .sort((a, b) => b.priority - a.priority);

    for (const shard of evictable) {
      await this.unloadShard(shard.id);
      const after = this.engine.getStats().factCount;
      if (after + incomingCount <= this.preset.maxFacts) return true;
    }

    return this.engine.getStats().factCount + incomingCount <= this.preset.maxFacts;
  }

  private async evictUntilUnderBudget(): Promise<void> {
    let stats = this.engine.getStats();
    if (stats.factCount <= this.preset.maxFacts) return;

    const sorted = Array.from(this.residentShards.values()).sort(
      (a, b) => b.priority - a.priority
    );

    for (const shard of sorted) {
      await this.unloadShard(shard.id);
      stats = this.engine.getStats();
      if (stats.factCount <= this.preset.maxFacts) return;
    }
  }

  private trimQueryCacheToCapacity(): void {
    while (this.queryCache.size > this.preset.queryCacheSize) {
      const oldest = this.queryCache.keys().next().value;
      if (oldest === undefined) break;
      this.queryCache.delete(oldest);
    }
  }

  private computePerPredicateCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const sig of this.engine.getStats().dynamicPredicates) {
      counts[sig] = this.engine.getFactsForPredicate(sig).length;
    }
    return counts;
  }

  private estimateMemoryBytes(): number {
    // Rough estimate: 2 bytes per char (UTF-16) + 32 bytes Set-entry overhead.
    let bytes = 0;
    for (const fact of this.engine.getAllFacts()) {
      bytes += fact.length * 2 + 32;
    }
    for (const rule of this.engine.getAllRules()) {
      bytes += rule.length * 2 + 32;
    }
    return bytes;
  }
}

function cacheKey(goal: string, maxResults: number): string {
  return `${goal.trim().replace(/\.\s*$/, '')}::${maxResults}`;
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
