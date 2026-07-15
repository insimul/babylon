/**
 * US-PC4 — Talk-of-the-Town → Prolog converter, per-shape coverage.
 *
 * Locks in the three ToTT source shapes (JSON-flat, JSON-categorized,
 * Python-class), the source-attribute → predicate mapping, `mapTottRuleType` /
 * `mapTottCategory`, and the canonical rule preamble (rule_type/2 hard
 * requirement, rule_source(.., tott), likelihood only when present). The
 * mass-conversion gate lives in `tott-mass-conversion.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  convertTottSource,
  convertTottRule,
  mapTottCategory,
  mapTottRuleType,
  parseTottPython,
  parseTottPythonCondition,
  parseTottPythonEffect,
  tottVarToProlog,
} from '../tott-converter';
import { resolveTottKind, TOTT_PREDICATE_MAP } from '../tott-predicate-map';
import { validateRuleContent } from '../content-validators';

describe('mapTottRuleType', () => {
  it('maps volition-family labels to volition, everything else to trigger', () => {
    expect(mapTottRuleType('volition')).toBe('volition');
    expect(mapTottRuleType('VolitionRule')).toBe('volition');
    expect(mapTottRuleType('desire')).toBe('volition');
    expect(mapTottRuleType('feature')).toBe('trigger');
    expect(mapTottRuleType('TriggerRule')).toBe('trigger');
    expect(mapTottRuleType(undefined)).toBe('trigger');
  });
});

describe('mapTottCategory', () => {
  it('canonicalizes synonyms and sanitizes to an atom', () => {
    expect(mapTottCategory('social')).toBe('socializing');
    expect(mapTottCategory('Socialize')).toBe('socializing');
    expect(mapTottCategory('romantic')).toBe('romance');
    expect(mapTottCategory('work')).toBe('employment');
    expect(mapTottCategory('Family Drama')).toBe('family_drama');
    expect(mapTottCategory(undefined)).toBe('general');
  });
});

describe('tottVarToProlog', () => {
  it('binds role aliases and PascalCases named tokens', () => {
    expect(tottVarToProlog('x')).toBe('X');
    expect(tottVarToProlog('subject')).toBe('X');
    expect(tottVarToProlog('other')).toBe('Y');
    expect(tottVarToProlog('third')).toBe('Z');
    expect(tottVarToProlog('?best_friend')).toBe('BestFriend');
    expect(tottVarToProlog('Marlow')).toBe('Marlow');
  });
});

describe('predicate map', () => {
  it('registers the Big-Five features as attributes and metrics as networks', () => {
    expect(TOTT_PREDICATE_MAP.extroversion).toBe('attribute');
    expect(TOTT_PREDICATE_MAP.charge).toBe('network');
    expect(TOTT_PREDICATE_MAP.friends).toBe('relationship');
    expect(TOTT_PREDICATE_MAP.loves).toBe('directed_status');
  });

  it('falls back structurally for unknown attributes so no clause is dropped', () => {
    expect(resolveTottKind('extraversion', { hasObject: false, numeric: true })).toBe('attribute');
    expect(resolveTottKind('mystery_metric', { hasObject: true, numeric: true })).toBe('network');
    expect(resolveTottKind('mystery_tie', { hasObject: true, numeric: false })).toBe('directed_status');
    expect(resolveTottKind('mystery_flag', { hasObject: false, numeric: false })).toBe('trait');
  });
});

describe('JSON-flat shape', () => {
  const src = JSON.stringify([
    {
      name: 'extrovert_socializes',
      type: 'volition',
      category: 'social',
      priority: 6,
      likelihood: 0.7,
      conditions: [
        { subject: 'x', attribute: 'extroversion', operator: '>', value: 0.6 },
        { subject: 'x', attribute: 'lonely', value: true },
      ],
      effects: [{ subject: 'x', attribute: 'wants', value: 'socialize', weight: 3 }],
    },
  ]);

  it('emits the canonical tott preamble with volition rule_type', () => {
    const [r] = convertTottSource(src);
    expect(r.skipped).toBe(false);
    const p = r.prologContent!;
    expect(p).toContain('rule_active(extrovert_socializes).');
    expect(p).toContain('rule_type(extrovert_socializes, volition).');
    expect(p).toContain('rule_category(extrovert_socializes, socializing).');
    expect(p).toContain('rule_source(extrovert_socializes, tott).');
    expect(p).toContain('rule_priority(extrovert_socializes, 6).');
    expect(p).toContain('rule_likelihood(extrovert_socializes, 0.7).');
  });

  it('lowers attribute comparisons, moods and a weighted intent', () => {
    const p = convertTottSource(src)[0].prologContent!;
    expect(p).toContain('attribute(X, extroversion, X_extroversion), X_extroversion > 0.6');
    expect(p).toContain('mood(X, lonely)');
    expect(p).toContain('rule_effect(extrovert_socializes, set_intent(X, socialize, _, 3)).');
    expect(validateRuleContent(p).isValid).toBe(true);
  });
});

describe('JSON-categorized shape', () => {
  const src = JSON.stringify({
    friendship: [
      {
        name: 'agreeable_befriends',
        type: 'trigger',
        conditions: [
          { subject: 'x', attribute: 'agreeableness', operator: '>', value: 0.5 },
          { subject: 'x', object: 'y', attribute: 'acquaintances' },
        ],
        effects: [
          { subject: 'x', object: 'y', attribute: 'friends', value: true },
          { subject: 'x', object: 'y', attribute: 'charge', operator: '+', value: 0.2 },
        ],
      },
    ],
  });

  it('inherits the category key and maps network/relationship families', () => {
    const [r] = convertTottSource(src);
    const p = r.prologContent!;
    expect(p).toContain('rule_category(agreeable_befriends, friendship).');
    expect(p).toContain('relationship(X, Y, acquaintances)');
    expect(p).toContain('rule_effect(agreeable_befriends, add_relationship(X, Y, friends)).');
    expect(p).toContain("rule_effect(agreeable_befriends, modify_network(X, Y, charge, '+', 0.2)).");
    expect(validateRuleContent(p).isValid).toBe(true);
  });
});

describe('value:false negates a boolean condition and removes on effect', () => {
  it('emits \\+ for a false condition and remove_ for a false effect', () => {
    const [r] = convertTottSource(
      JSON.stringify([
        {
          name: 'jilted_stops_liking',
          type: 'trigger',
          conditions: [
            { subject: 'x', object: 'y', attribute: 'spark', operator: '>', value: 0.5 },
            { subject: 'x', attribute: 'married', value: false },
          ],
          effects: [{ subject: 'x', object: 'y', attribute: 'likes', value: false }],
        },
      ]),
    );
    const p = r.prologContent!;
    expect(p).toContain('\\+ status(X, married)');
    expect(p).toContain('rule_effect(jilted_stops_liking, remove_directed_status(X, Y, likes)).');
  });
});

describe('Python-class shape', () => {
  const src = `
class RivalsGrowDistant(TriggerRule):
    category = "conflict"
    priority = 7
    def when(self):
        x.charge(y) < 0.2
        not x.friends(y)
    def then(self):
        x.charge(y) -= 0.1
        x.resents(y) = True
        x.add_trait("bitter")
`;

  it('parses class header, sections and metadata', () => {
    const rules = parseTottPython(src);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('rivals_grow_distant');
    expect(rules[0].ruleType).toBe('TriggerRule');
    expect(rules[0].category).toBe('conflict');
    expect(rules[0].priority).toBe(7);
    expect(rules[0].conditions).toHaveLength(2);
    expect(rules[0].effects).toHaveLength(3);
  });

  it('lowers comparisons, negation, adjusts, assignment and add_trait', () => {
    const p = convertTottSource(src)[0].prologContent!;
    expect(p).toContain('rule_type(rivals_grow_distant, trigger).');
    expect(p).toContain('network(X, Y, charge, X_Y_charge), X_Y_charge < 0.2');
    expect(p).toContain('\\+ relationship(X, Y, friends)');
    expect(p).toContain("rule_effect(rivals_grow_distant, modify_network(X, Y, charge, '-', 0.1)).");
    expect(p).toContain('rule_effect(rivals_grow_distant, add_directed_status(X, Y, resents)).');
    expect(p).toContain('rule_effect(rivals_grow_distant, add_trait(X, bitter)).');
    expect(validateRuleContent(p).isValid).toBe(true);
  });
});

describe('Python line parsers', () => {
  it('parses a numeric network condition', () => {
    expect(parseTottPythonCondition('x.charge(y) >= 0.4')).toEqual({
      subject: 'x',
      attribute: 'charge',
      object: 'y',
      operator: '>=',
      value: 0.4,
      negate: false,
    });
  });

  it('parses a wants effect with target and weight', () => {
    expect(parseTottPythonEffect('x.wants("court", y, 5)')).toEqual({
      subject: 'x',
      attribute: 'wants',
      value: 'court',
      object: 'y',
      weight: 5,
    });
  });
});

describe('skip behavior', () => {
  it('skips a rule with no conditions or no effects', () => {
    const noCond = convertTottRule({ name: 'e', conditions: [], effects: [{ subject: 'x', attribute: 'happy', value: true }] });
    expect(noCond.skipped).toBe(true);
    expect(noCond.skipReason).toBe('no conditions');
  });
});
