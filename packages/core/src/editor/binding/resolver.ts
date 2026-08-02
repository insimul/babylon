/**
 * The asset-binding **resolution chain** (US-2 of `101-editor-plugin-core`).
 *
 * `archetypes/taxonomy.ts` has always owned the match *primitives*
 * (`matchArchetypeKey` / `archetypeSpecificity`). The chain around them — a
 * priority-ordered list of tiers, first-tier-with-any-match wins, most-specific
 * entry within that tier, plus the unbound report — was implemented four times
 * (Unity `Runtime/Binding/BindingResolver.cs`, Unreal
 * `Portable/InsimulBindingResolver.cpp`, Godot `gdextension/src/binding_resolver.cpp`
 * AND its GDScript `@tool` twin) and zero times in core. This is that chain, once.
 *
 * ## The tie-break, settled
 *
 * `docs/editor-plugin-core-analysis.md` §5.4 found two semantics in the field:
 *
 *  - core/Unity: `archetypeSpecificity`'s `exact ? 2N : 2N-1`, under which a
 *    descendant and a wildcard at equal depth **tie**, resolved by an
 *    engine-specific fallback (Unity: ordinal key order);
 *  - Unreal/Godot: matched segment count, then match kind
 *    (`Exact > Descendant > Wildcard`), then first-authored entry.
 *
 * **This module adopts the C++ ordering** and it is now the one contract:
 * `(matchedSegments, kind)` descending, ties keeping the earlier-declared entry.
 * Three reasons, in order of weight: it is total (no unresolved tie, so the
 * result never depends on a per-engine fallback); it is what the only
 * cross-engine fixture in the field — the shared resolver matrix — already pins;
 * and it is what two of the four legs already do. `archetypeSpecificity` keeps
 * its own semantics for its existing callers, but resolution does not use it.
 *
 * ## Match-all, and taxonomy conformance
 *
 * Matching here is **purely structural** and root-agnostic: a bare `*` matches
 * everything (the placeholder tier in every engine's pack uses it, and
 * `isValidArchetypePattern` rejects it), and a key rooted outside
 * {@link ARCHETYPE_ROOTS} still matches. That is deliberate — a resolver that
 * silently dropped a non-taxonomy key would make §5.3's real finding (Godot
 * emits `road.*` / `interior.*` keys) invisible instead of reportable. Taxonomy
 * conformance is a separate, explicit diagnostic: see `validateBindingSource` in
 * `./pack`.
 *
 * Engine-free by construction (pure string + array logic), so the C#/C++/GDScript
 * ports and this module share one algorithm, pinned by
 * `conformance/editor/binding-resolver.json`.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** How an entry key matched a query. Ordered least → most specific. */
export enum MatchKind {
  None = 0,
  /** `*` (match-all) or `prefix.*`. */
  Wildcard = 1,
  /** The query is a strict descendant of the entry key. */
  Descendant = 2,
  /** The query equals the entry key. */
  Exact = 3,
}

/** The specificity of one entry-vs-query match. */
export interface MatchScore {
  kind: MatchKind;
  /** Segments the entry key contributed (`building.residential` ⇒ 2, `*` ⇒ 0). */
  matchedSegments: number;
}

/**
 * One archetype → asset binding.
 *
 * `transform` and `sockets` are carried through as opaque values so the
 * resolution core stays agnostic to their shape and a foreign engine's pack
 * survives an import/export round-trip untouched (the passthrough rule every
 * engine leg already follows).
 */
export interface BindingEntry {
  /** Archetype key or pattern (`building.residential`, `prop.*`, `*`). */
  key: string;
  /** Primary asset handle — a prefab/Blueprint/PackedScene/URL. */
  scene?: string;
  /** Alternative mesh-only handle, used when `scene` is absent. */
  mesh?: string;
  /** Opaque per-entry transform fixups. */
  transform?: unknown;
  /** Opaque per-entry socket definitions. */
  sockets?: unknown;
}

/**
 * A resolution tier: project overrides, an imported pack, or the placeholder
 * pack. Higher `priority` is consulted first.
 */
export interface BindingSource {
  name: string;
  priority: number;
  entries: BindingEntry[];
}

/** The outcome of resolving one archetype key against a chain. */
export interface ResolveResult {
  resolved: boolean;
  /** Name of the tier that won (`''` when unresolved). */
  sourceName: string;
  /** The winning entry's key, for reporting (`''` when unresolved). */
  key: string;
  /** The winning entry (`null` when unresolved). */
  entry: BindingEntry | null;
  /** The winning score, for diagnostics. */
  score: MatchScore;
}

/** A requested-vs-resolved gap report over a set of used archetype keys. */
export interface UnboundReport {
  /** Distinct non-empty keys asked about. */
  requestedCount: number;
  /** How many of those resolved. */
  boundCount: number;
  /** The ones that did not, distinct and ascending (diff-stable). */
  missingKeys: string[];
}

/** No match. */
export const NO_MATCH: MatchScore = { kind: MatchKind.None, matchedSegments: 0 };

/** An unresolved {@link ResolveResult}. */
export const UNRESOLVED: ResolveResult = {
  resolved: false,
  sourceName: '',
  key: '',
  entry: null,
  score: NO_MATCH,
};

// ─── Matching ────────────────────────────────────────────────────────────────

/** Dot-separated segment count of a non-empty key (`a.b.c` ⇒ 3, `''` ⇒ 0). */
function segmentCount(key: string): number {
  if (key.length === 0) return 0;
  let n = 1;
  for (const c of key) if (c === '.') n++;
  return n;
}

/**
 * Score how `entryKey` matches `query`.
 *
 * - `*` — match-all wildcard, 0 matched segments (always the least specific).
 * - `prefix.*` — matches `prefix` itself and any descendant.
 * - exact — `query === entryKey`.
 * - descendant — `query` starts with `entryKey + '.'` (a binding on `building`
 *   covers `building.residential.house`).
 *
 * `kind === MatchKind.None` means no match.
 */
export function matchArchetype(entryKey: string, query: string): MatchScore {
  if (!entryKey || !query) return NO_MATCH;

  if (entryKey === '*') {
    return { kind: MatchKind.Wildcard, matchedSegments: 0 };
  }

  if (entryKey.endsWith('.*')) {
    const prefix = entryKey.slice(0, -2);
    if (!prefix) return NO_MATCH;
    if (query === prefix || query.startsWith(prefix + '.')) {
      return { kind: MatchKind.Wildcard, matchedSegments: segmentCount(prefix) };
    }
    return NO_MATCH;
  }

  if (query === entryKey) {
    return { kind: MatchKind.Exact, matchedSegments: segmentCount(entryKey) };
  }

  if (query.startsWith(entryKey + '.')) {
    return { kind: MatchKind.Descendant, matchedSegments: segmentCount(entryKey) };
  }

  return NO_MATCH;
}

/** Did this score match at all? */
export function matched(score: MatchScore): boolean {
  return score.kind !== MatchKind.None;
}

/**
 * `> 0` if `a` is strictly more specific than `b`, `< 0` if less, `0` if equal.
 * Matched segments first, then match kind — the settled ordering (see the module
 * header).
 */
export function compareMatchScore(a: MatchScore, b: MatchScore): number {
  if (a.matchedSegments !== b.matchedSegments) {
    return a.matchedSegments < b.matchedSegments ? -1 : 1;
  }
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return 0;
}

// ─── The chain ───────────────────────────────────────────────────────────────

/**
 * A priority-ordered fallback chain of binding tiers.
 *
 * Resolution is a FALLBACK, not a merge: the first source (in current order)
 * with ANY match wins outright, and within it the most specific entry is chosen.
 * A `building.*` entry in a project override therefore beats an exact match in a
 * pack — which is the point of an override.
 *
 * `resolve()` does NOT sort implicitly; call {@link sortSourcesByPriority} once
 * after adding the tiers (every engine leg has the same explicit split, so the
 * caller controls when the cost is paid).
 */
export class BindingResolver {
  private readonly sourceList: BindingSource[] = [];

  /** The tiers, in current (resolution) order. */
  get sources(): readonly BindingSource[] {
    return this.sourceList;
  }

  addSource(source: BindingSource): this {
    this.sourceList.push(source);
    return this;
  }

  /**
   * Stable sort by `priority` descending — the project → packs → placeholder
   * fallback order. Equal priorities keep insertion order.
   */
  sortSourcesByPriority(): this {
    // Array.prototype.sort is required to be stable (ES2019+), matching the
    // engines' std::stable_sort.
    this.sourceList.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /** Resolve one archetype key against the chain. */
  resolve(query: string): ResolveResult {
    for (const source of this.sourceList) {
      let best: BindingEntry | null = null;
      let bestScore: MatchScore = NO_MATCH;
      for (const entry of source.entries) {
        const score = matchArchetype(entry.key, query);
        if (!matched(score)) continue;
        // Ties keep the earlier-declared entry: `> 0` only, never `>= 0`.
        if (best === null || compareMatchScore(score, bestScore) > 0) {
          best = entry;
          bestScore = score;
        }
      }
      if (best !== null) {
        return {
          resolved: true,
          sourceName: source.name,
          key: best.key,
          entry: best,
          score: bestScore,
        };
      }
    }
    return UNRESOLVED;
  }

  /**
   * Which of `usedKeys` resolve to nothing in any tier. Distinct + ascending so
   * the report is diff-stable; empty keys are ignored.
   */
  collectUnbound(usedKeys: readonly string[]): UnboundReport {
    const seen = new Set<string>();
    const missing = new Set<string>();
    let requestedCount = 0;
    let boundCount = 0;
    for (const key of usedKeys) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      requestedCount++;
      if (this.resolve(key).resolved) boundCount++;
      else missing.add(key);
    }
    return {
      requestedCount,
      boundCount,
      missingKeys: [...missing].sort(),
    };
  }
}

/** Is every requested key bound? */
export function allBound(report: UnboundReport): boolean {
  return report.missingKeys.length === 0;
}
