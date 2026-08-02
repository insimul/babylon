/**
 * US-2 of `101-editor-plugin-core` — the binding resolution chain.
 *
 * The cross-engine behaviour lives in `conformance/editor/binding-resolver.json`
 * (run by `src/conformance/__tests__/editor-corpus.test.ts`). What is here is
 * everything a data-only corpus cannot express: the match primitive's edges, the
 * pack parse/serialize round-trip, and the taxonomy diagnostics that settle §5.3.
 */

import { describe, expect, it } from 'vitest';

import {
  BindingResolver,
  MatchKind,
  allBound,
  compareMatchScore,
  matchArchetype,
  matched,
  parseBindingSource,
  parseBindingSources,
  serializePackSorted,
  validateArchetypeKeys,
  validateBindingSource,
  type BindingSource,
} from '../binding';

const source = (name: string, priority: number, keys: string[]): BindingSource => ({
  name,
  priority,
  entries: keys.map((key) => ({ key, scene: `${name}/${key}` })),
});

describe('matchArchetype', () => {
  it('scores an exact match highest, at full depth', () => {
    expect(matchArchetype('building.residential', 'building.residential')).toEqual({
      kind: MatchKind.Exact,
      matchedSegments: 2,
    });
  });

  it('scores a plain ancestor as a descendant match at the ancestor’s depth', () => {
    expect(matchArchetype('building', 'building.residential.house')).toEqual({
      kind: MatchKind.Descendant,
      matchedSegments: 1,
    });
  });

  it('matches a `prefix.*` wildcard against the base node AND its descendants', () => {
    expect(matchArchetype('building.*', 'building')).toEqual({
      kind: MatchKind.Wildcard,
      matchedSegments: 1,
    });
    expect(matchArchetype('building.*', 'building.residential')).toEqual({
      kind: MatchKind.Wildcard,
      matchedSegments: 1,
    });
  });

  it('treats a bare `*` as a zero-segment match-all', () => {
    // Deliberately accepted even though `isValidArchetypePattern` rejects it —
    // every engine's placeholder tier is exactly this entry.
    expect(matchArchetype('*', 'anything.at.all')).toEqual({
      kind: MatchKind.Wildcard,
      matchedSegments: 0,
    });
  });

  it('does not match a sibling, a prefix that is not a segment boundary, or an empty side', () => {
    expect(matched(matchArchetype('building.res', 'building.residential'))).toBe(false);
    expect(matched(matchArchetype('building.commercial', 'building.residential'))).toBe(false);
    expect(matched(matchArchetype('', 'building'))).toBe(false);
    expect(matched(matchArchetype('building', ''))).toBe(false);
    expect(matched(matchArchetype('.*', 'building'))).toBe(false);
  });

  it('orders by matched segments first, then kind', () => {
    const deepWildcard = matchArchetype('building.residential.*', 'building.residential.house');
    const shallowExact = matchArchetype('building', 'building');
    // 2 matched segments beats 1, even though the shallower one is exact.
    expect(compareMatchScore(deepWildcard, shallowExact)).toBeGreaterThan(0);

    const descendant = matchArchetype('building.residential', 'building.residential.house');
    // Same depth ⇒ kind decides: Descendant (2) over Wildcard (1).
    expect(compareMatchScore(descendant, deepWildcard)).toBeGreaterThan(0);
    expect(compareMatchScore(deepWildcard, deepWildcard)).toBe(0);
  });
});

describe('BindingResolver', () => {
  it('does not sort implicitly — resolution uses the current order', () => {
    const resolver = new BindingResolver()
      .addSource(source('packs', 50, ['building.*']))
      .addSource(source('project', 100, ['building.*']));

    expect(resolver.resolve('building.house').sourceName).toBe('packs');
    resolver.sortSourcesByPriority();
    expect(resolver.resolve('building.house').sourceName).toBe('project');
  });

  it('reports an unresolved query with an empty, non-throwing result', () => {
    const result = new BindingResolver().addSource(source('packs', 50, ['item.*'])).resolve('prop.x');
    expect(result).toEqual({
      resolved: false,
      sourceName: '',
      key: '',
      entry: null,
      score: { kind: MatchKind.None, matchedSegments: 0 },
    });
  });

  it('collects unbound keys distinctly, ascending, ignoring empties', () => {
    const resolver = new BindingResolver().addSource(source('packs', 50, ['building.*']));
    const report = resolver.collectUnbound(['prop.b', 'building.a', 'prop.b', '', 'item.c']);
    expect(report).toEqual({
      requestedCount: 3,
      boundCount: 1,
      missingKeys: ['item.c', 'prop.b'],
    });
    expect(allBound(report)).toBe(false);
    expect(allBound(resolver.collectUnbound(['building.a']))).toBe(true);
  });
});

describe('pack parse + canonical serialize', () => {
  it('accepts both the standalone pack shape and the inline matrix-source shape', () => {
    const pack = parseBindingSource({
      format: 'insimul-binding-pack',
      version: 1,
      name: 'packs',
      priority: 50,
      entries: [{ key: 'building.*', scene: 'a' }],
    });
    const inline = parseBindingSource({
      name: 'packs',
      priority: 50,
      entries: [{ key: 'building.*', scene: 'a' }],
    });
    expect(pack.ok && pack.value).toEqual(inline.ok && inline.value);
  });

  it('names what was malformed instead of throwing', () => {
    expect(parseBindingSource(null)).toEqual({
      ok: false,
      error: 'binding source is not an object',
    });
    expect(parseBindingSource({ name: 'packs' })).toEqual({
      ok: false,
      error: "binding source 'packs' has no entries array",
    });
    expect(parseBindingSource({ name: 'packs', entries: [{ scene: 'a' }] })).toEqual({
      ok: false,
      error: "binding entry missing 'key'",
    });
    expect(parseBindingSources({})).toEqual({ ok: false, error: "'sources' is not an array" });
  });

  it('passes foreign transform/sockets fixups through untouched', () => {
    const fixups = { transform: { scale: [1, 2, 3] }, sockets: { hand: 'Bip01' } };
    const parsed = parseBindingSource({
      name: 'packs',
      priority: 50,
      entries: [{ key: 'npc.*', scene: 'a', ...fixups }],
    });
    expect(parsed.ok && parsed.value.entries[0].transform).toEqual(fixups.transform);
    expect(parsed.ok && parsed.value.entries[0].sockets).toEqual(fixups.sockets);
    expect(serializePackSorted((parsed as { value: BindingSource }).value)).toContain('"hand":"Bip01"');
  });

  it('serializes entries key-sorted and minified, omitting absent handles', () => {
    const json = serializePackSorted({
      name: 'packs',
      priority: 50,
      entries: [
        { key: 'prop.*', mesh: 'm' },
        { key: 'building.*', scene: 's' },
      ],
    });
    expect(json).toBe(
      '{"entries":[{"key":"building.*","scene":"s"},{"key":"prop.*","mesh":"m"}],' +
        '"format":"insimul-binding-pack","name":"packs","priority":50,"version":1}',
    );
  });

  it('round-trips: serialize → parse → serialize is a fixed point', () => {
    const original: BindingSource = {
      name: 'packs',
      priority: 50,
      entries: [
        { key: 'terrain.texture.road', scene: 'r' },
        { key: 'building.*', scene: 'b', transform: { yaw: 90 } },
      ],
    };
    const once = serializePackSorted(original);
    const parsed = parseBindingSource(JSON.parse(once));
    expect(parsed.ok).toBe(true);
    expect(serializePackSorted((parsed as { value: BindingSource }).value)).toBe(once);
  });
});

describe('taxonomy validation (§5.3, settled here)', () => {
  it('is silent on a taxonomy-conformant pack', () => {
    expect(
      validateBindingSource(source('packs', 50, ['building.*', 'terrain.texture.road', 'npc'])),
    ).toEqual([]);
  });

  it('flags a key rooted outside the taxonomy as an error', () => {
    // Exactly Godot's `road` / `interior.<role>` finding, now reportable.
    const issues = validateBindingSource(source('godot', 50, ['road.street', 'interior.kitchen']));
    expect(issues.map((i) => [i.code, i.severity, i.key])).toEqual([
      ['unknown-root', 'error', 'road.street'],
      ['unknown-root', 'error', 'interior.kitchen'],
    ]);
    expect(issues[0].message).toContain('building | npc | item | prop | terrain');
  });

  it('warns about the match-all fallback and a shadowed duplicate, but does not reject them', () => {
    const issues = validateBindingSource({
      name: 'placeholder',
      priority: 0,
      entries: [{ key: '*' }, { key: 'prop.*' }, { key: 'prop.*' }],
    });
    expect(issues.map((i) => i.code)).toEqual(['match-all-pattern', 'duplicate-key']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    // The resolver still resolves what it is given — validation never filters.
    const resolver = new BindingResolver().addSource({
      name: 'placeholder',
      priority: 0,
      entries: [{ key: '*', scene: 'cube' }],
    });
    expect(resolver.resolve('anything').entry?.scene).toBe('cube');
  });

  it('flags a malformed key as an error', () => {
    const issues = validateBindingSource(source('packs', 50, ['building..residential']));
    expect(issues.map((i) => i.code)).toEqual(['malformed-key']);
  });

  it('names the non-taxonomy subset of a set of concrete keys, distinct and ascending', () => {
    expect(
      validateArchetypeKeys([
        'building.residential',
        'road',
        'interior.kitchen',
        'road',
        '',
        'terrain.chunk',
      ]),
    ).toEqual(['interior.kitchen', 'road']);
  });
});
