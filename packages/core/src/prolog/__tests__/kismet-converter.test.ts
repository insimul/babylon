/**
 * US-PC3 — Kismet DSL → Prolog converter, per-dialect coverage.
 *
 * Locks in the three Kismet dialects (trait / pattern / volition), `?Var →
 * PascalCase` variable preservation, and the canonical rule preamble
 * (rule_type/2 hard requirement, rule_source(.., kismet), likelihood only when
 * present). The mass-conversion gate lives in `kismet-mass-conversion.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  convertKismetRule,
  convertKismetSource,
  kismetVarToProlog,
  parseKismetSource,
} from '../kismet-converter';
import { validateRuleContent } from '../content-validators';

describe('kismetVarToProlog — ?Var → PascalCase', () => {
  it('maps single-letter and multi-word variables', () => {
    expect(kismetVarToProlog('?x')).toBe('X');
    expect(kismetVarToProlog('?y')).toBe('Y');
    expect(kismetVarToProlog('?best_friend')).toBe('BestFriend');
    expect(kismetVarToProlog('?loverA')).toBe('LoverA');
    expect(kismetVarToProlog('?mutual')).toBe('Mutual');
  });

  it('returns null for a non-variable token', () => {
    expect(kismetVarToProlog('modest')).toBeNull();
    expect(kismetVarToProlog('?')).toBeNull();
  });
});

describe('trait dialect', () => {
  const src = `
trait rule modest_stays_humble {
  category: personality
  priority: 4
  when:
    ?x trait modest
    ?x not trait vain
  then:
    ?x +status humble
}`;

  it('emits the canonical kismet preamble with rule_type trigger', () => {
    const [r] = convertKismetSource(src);
    expect(r.skipped).toBe(false);
    const p = r.prologContent!;
    expect(p).toContain('rule_active(modest_stays_humble).');
    expect(p).toContain('rule_type(modest_stays_humble, trigger).');
    expect(p).toContain('rule_category(modest_stays_humble, personality).');
    expect(p).toContain('rule_source(modest_stays_humble, kismet).');
    expect(p).toContain('rule_priority(modest_stays_humble, 4).');
  });

  it('preserves ?Var bindings and negation in the body and effects', () => {
    const p = convertKismetSource(src)[0].prologContent!;
    expect(p).toContain('trait(X, modest)');
    expect(p).toContain('\\+ trait(X, vain)');
    expect(p).toMatch(/rule_applies\(modest_stays_humble, X, _\)\s*:-/);
    expect(p).toContain('rule_effect(modest_stays_humble, add_status(X, humble)).');
  });

  it('lowers attribute comparisons and network deltas', () => {
    const p = convertKismetSource(`
trait rule x {
  when:
    ?x attr charisma > 6
    ?a rel friends ?b
  then:
    ?a net affinity + 2 ?b
    ?x attr confidence - 1
}`)[0].prologContent!;
    expect(p).toContain('attribute(X, charisma, X_charisma), X_charisma > 6');
    expect(p).toContain('relationship(A, B, friends)');
    expect(p).toContain("rule_effect(x, modify_network(A, B, affinity, '+', 2)).");
    expect(p).toContain("rule_effect(x, modify_attribute(X, confidence, '-', 1)).");
  });
});

describe('pattern dialect', () => {
  const src = `
pattern rule love_triangle {
  category: romance
  when:
    ?x loves ?y
    ?y loves ?z
    not ?y loves ?x
  then:
    ?x jealous_of ?z
}`;

  it('maps infix verbs to relationship / directed_status by the verb table', () => {
    const p = convertKismetSource(src)[0].prologContent!;
    expect(p).toContain('directed_status(X, Y, loves)');
    expect(p).toContain('directed_status(Y, Z, loves)');
    expect(p).toContain('\\+ directed_status(Y, X, loves)');
    // rule_applies head uses the first two distinct actors in appearance order.
    expect(p).toMatch(/rule_applies\(love_triangle, X, Y\)\s*:-/);
    expect(p).toContain('rule_effect(love_triangle, add_directed_status(X, Z, jealous_of)).');
  });

  it('routes symmetric verbs to relationship and negated effects to remove_', () => {
    const p = convertKismetSource(`
pattern rule feud {
  when:
    ?x friends ?y
    ?z hates ?y
  then:
    not ?x friends ?z
    ?x distrusts ?z
}`)[0].prologContent!;
    expect(p).toContain('relationship(X, Y, friends)');
    expect(p).toContain('directed_status(Z, Y, hates)');
    expect(p).toContain('rule_effect(feud, remove_relationship(X, Z, friends)).');
    expect(p).toContain('rule_effect(feud, add_directed_status(X, Z, distrusts)).');
  });
});

describe('volition dialect', () => {
  const src = `
volition rule flirt_with_crush {
  category: romance
  priority: 5
  likelihood: 0.8
  when:
    ?x dstatus attracted_to ?y
    ?x not trait shy
  then:
    ?x wants flirt ?y weight 3
}`;

  it('emits rule_type volition and a weighted set_intent effect', () => {
    const p = convertKismetSource(src)[0].prologContent!;
    expect(p).toContain('rule_type(flirt_with_crush, volition).');
    expect(p).toContain('rule_likelihood(flirt_with_crush, 0.8).');
    expect(p).toContain('directed_status(X, Y, attracted_to)');
    expect(p).toContain('\\+ trait(X, shy)');
    expect(p).toContain('rule_effect(flirt_with_crush, set_intent(X, flirt, Y, 3)).');
  });

  it('defaults a target-less intent to _ and weight 1', () => {
    const p = convertKismetSource(`
volition rule seek_comfort {
  when:
    ?x mood lonely
  then:
    ?x wants socialize
}`)[0].prologContent!;
    expect(p).toContain('rule_effect(seek_comfort, set_intent(X, socialize, _, 1)).');
  });
});

describe('likelihood + priority normalization', () => {
  it('emits rule_likelihood only when present and clamps to [0,1]', () => {
    const without = convertKismetSource(`
trait rule a {
  when:
    ?x trait kind
  then:
    ?x +status warm
}`)[0].prologContent!;
    expect(without).not.toContain('rule_likelihood(');

    const clamped = convertKismetSource(`
trait rule b {
  likelihood: 1.5
  when:
    ?x trait kind
  then:
    ?x +status warm
}`)[0].prologContent!;
    expect(clamped).toContain('rule_likelihood(b, 1).');
  });

  it('defaults and clamps priority into [1,10]', () => {
    const def = convertKismetSource(`
trait rule c {
  when:
    ?x trait kind
  then:
    ?x +status warm
}`)[0].prologContent!;
    expect(def).toContain('rule_priority(c, 5).');

    const high = convertKismetSource(`
trait rule d {
  priority: 99
  when:
    ?x trait kind
  then:
    ?x +status warm
}`)[0].prologContent!;
    expect(high).toContain('rule_priority(d, 10).');
  });
});

describe('parseKismetSource + skip behavior', () => {
  it('parses multiple blocks of mixed dialects', () => {
    const rules = parseKismetSource(`
trait rule one {
  when:
    ?x trait kind
  then:
    ?x +status warm
}
pattern rule two {
  when:
    ?x loves ?y
  then:
    ?x likes ?y
}`);
    expect(rules).toHaveLength(2);
    expect(rules[0].dialect).toBe('trait');
    expect(rules[1].dialect).toBe('pattern');
  });

  it('skips a rule with no conditions or no effects', () => {
    const noCond = convertKismetRule({
      dialect: 'trait',
      name: 'empty',
      whenLines: [],
      thenLines: ['?x +status warm'],
    });
    expect(noCond.skipped).toBe(true);
    expect(noCond.skipReason).toBe('no conditions');
  });

  it('every converted dialect satisfies validateRuleContent', () => {
    for (const src of [
      'trait rule a {\n when:\n ?x trait kind\n then:\n ?x +status warm\n}',
      'pattern rule b {\n when:\n ?x loves ?y\n then:\n ?x likes ?y\n}',
      'volition rule c {\n when:\n ?x mood lonely\n then:\n ?x wants socialize\n}',
    ]) {
      const r = convertKismetSource(src)[0];
      const v = validateRuleContent(r.prologContent!);
      expect(v.isValid, `${r.name}: ${v.errors.join('; ')}`).toBe(true);
    }
  });
});
