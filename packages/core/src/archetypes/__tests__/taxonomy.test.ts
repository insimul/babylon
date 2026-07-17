import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_ROOTS,
  parseArchetypeKey,
  isValidArchetypeKey,
  isValidArchetypePattern,
  isValidTag,
  matchArchetypeKey,
  archetypeSpecificity,
  archetypeAncestors,
} from '../taxonomy';

describe('archetype taxonomy roots', () => {
  it('pins the five roots (doc/impl drift guard)', () => {
    expect([...ARCHETYPE_ROOTS]).toEqual([
      'building',
      'npc',
      'item',
      'prop',
      'terrain',
    ]);
  });
});

describe('parseArchetypeKey', () => {
  it('parses a plain hierarchical key', () => {
    const p = parseArchetypeKey('building.commercial.bakery.medium');
    expect(p).not.toBeNull();
    expect(p!.segments).toEqual(['building', 'commercial', 'bakery', 'medium']);
    expect(p!.isWildcard).toBe(false);
    expect(p!.root).toBe('building');
  });

  it('parses a descendant wildcard', () => {
    const p = parseArchetypeKey('building.commercial.*');
    expect(p!.isWildcard).toBe(true);
    expect(p!.segments).toEqual(['building', 'commercial']);
  });

  it('allows hyphen/underscore inside a segment', () => {
    expect(parseArchetypeKey('prop.street.market-stall')).not.toBeNull();
    expect(parseArchetypeKey('item.tool.fishing_rod')).not.toBeNull();
  });

  it('rejects malformed keys', () => {
    for (const bad of ['', '.building', 'building.', 'a..b', 'Building.X', '1building', '*', 'building..*']) {
      expect(parseArchetypeKey(bad)).toBeNull();
    }
  });
});

describe('validity helpers', () => {
  it('isValidArchetypeKey requires a known root and no wildcard', () => {
    expect(isValidArchetypeKey('npc.merchant.baker')).toBe(true);
    expect(isValidArchetypeKey('building.commercial.*')).toBe(false); // wildcard
    expect(isValidArchetypeKey('vehicle.car')).toBe(false); // unknown root
  });

  it('isValidArchetypePattern accepts wildcard patterns', () => {
    expect(isValidArchetypePattern('building.commercial.*')).toBe(true);
    expect(isValidArchetypePattern('terrain.texture.grass')).toBe(true);
    expect(isValidArchetypePattern('vehicle.*')).toBe(false);
  });

  it('isValidTag matches segment grammar', () => {
    expect(isValidTag('two-story')).toBe(true);
    expect(isValidTag('walkable')).toBe(true);
    expect(isValidTag('Bad Tag')).toBe(false);
  });
});

describe('matchArchetypeKey', () => {
  const key = 'building.commercial.bakery.medium';

  it('exact match', () => {
    expect(matchArchetypeKey(key, key)).toBe(true);
    expect(matchArchetypeKey('building.commercial.bakery.small', key)).toBe(false);
  });

  it('wildcard matches base node and descendants', () => {
    expect(matchArchetypeKey('building.commercial.*', key)).toBe(true);
    expect(matchArchetypeKey('building.commercial.*', 'building.commercial')).toBe(true);
    expect(matchArchetypeKey('building.residential.*', key)).toBe(false);
  });

  it('a plain ancestor is a descendant binding', () => {
    expect(matchArchetypeKey('building', key)).toBe(true);
    expect(matchArchetypeKey('building.commercial', key)).toBe(true);
    // ancestor does NOT match the exact node itself via the descendant rule
    expect(matchArchetypeKey('building.commercial', 'building.commercial')).toBe(true); // exact
    expect(matchArchetypeKey('building.commercial', 'building.residential')).toBe(false);
  });

  it('a query may not be a wildcard', () => {
    expect(matchArchetypeKey('building.*', 'building.*')).toBe(false);
  });
});

describe('archetypeSpecificity (exact beats wildcard beats shallow)', () => {
  const key = 'building.commercial.bakery.medium';

  it('exact outranks wildcard at the same depth', () => {
    const exact = archetypeSpecificity(key, key);
    const wild = archetypeSpecificity('building.commercial.bakery.*', key);
    expect(exact).toBeGreaterThan(wild);
  });

  it('deeper wildcard outranks shallower wildcard', () => {
    const deep = archetypeSpecificity('building.commercial.bakery.*', key);
    const shallow = archetypeSpecificity('building.commercial.*', key);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('non-match is -1', () => {
    expect(archetypeSpecificity('building.residential.*', key)).toBe(-1);
  });
});

describe('archetypeAncestors', () => {
  it('lists ancestors deepest-first', () => {
    expect(archetypeAncestors('building.commercial.bakery.medium')).toEqual([
      'building.commercial.bakery',
      'building.commercial',
      'building',
    ]);
    expect(archetypeAncestors('building')).toEqual([]);
  });
});
