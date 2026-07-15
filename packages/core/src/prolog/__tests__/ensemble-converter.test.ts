/**
 * US-PC1 — baseline coverage for the canonical Ensemble → Prolog converter.
 *
 * `ensemble-converter.ts` is the CANONICAL Ensemble path (see
 * packages/core/docs/ensemble-converter-decision.md). It had no tests before this
 * story ("find them; extend if thin" → there were zero). This suite locks in the
 * stable entry surface — `convertVolitionRule`, `convertVolitionRuleFile`,
 * `convertEnsembleAction`, `convertActionFile` — that the platform migration-012
 * consumer depends on, so US-PC2's hardening (rule_type/2 + rule_likelihood/2) has a
 * regression net under it.
 *
 * These assertions are deliberately about the STABLE preamble + actor mapping +
 * skip/citation behaviour, not about the rule_type/rule_likelihood gap US-PC2 fills.
 */

import { describe, expect, it } from 'vitest';

import {
  convertActionFile,
  convertEnsembleAction,
  convertVolitionRule,
  convertVolitionRuleFile,
} from '../ensemble-converter';

describe('convertVolitionRule', () => {
  const rule = {
    name: 'Comfort Friend',
    title: 'Comfort a sad friend',
    conditions: [
      { category: 'relationship', type: 'friends', first: 'initiator', second: 'responder' },
      { category: 'status', type: 'sad', first: 'responder' },
    ],
    effects: [
      {
        category: 'network',
        type: 'affinity',
        first: 'initiator',
        second: 'responder',
        operator: '+',
        value: 5,
        weight: 6,
      },
    ],
  };

  it('emits the canonical rule preamble', () => {
    const r = convertVolitionRule(rule, 'friendship');
    expect(r.skipped).toBe(false);
    const p = r.prologContent!;
    expect(p).toContain('rule_active(comfort_friend).');
    expect(p).toContain('rule_category(comfort_friend, friendship).');
    expect(p).toContain('rule_source(comfort_friend, ensemble).');
    // priority derived from the max effect weight (6), clamped to [1,10]
    expect(p).toContain('rule_priority(comfort_friend, 6).');
  });

  it('maps ensemble actors to canonical Prolog variables (initiator→X, responder→Y)', () => {
    const p = convertVolitionRule(rule, 'friendship').prologContent!;
    expect(p).toContain('relationship(X, Y, friends)');
    expect(p).toContain('status(Y, sad)');
    // head is rule_applies/3 over the actor variables
    expect(p).toMatch(/rule_applies\(comfort_friend, X, Y\)\s*:-/);
  });

  it('lowers effects to rule_effect/2 facts', () => {
    const p = convertVolitionRule(rule, 'friendship').prologContent!;
    expect(p).toContain("rule_effect(comfort_friend, modify_network(X, Y, affinity, '+', 5))");
  });

  it('skips rules with no conditions', () => {
    const r = convertVolitionRule({ name: 'empty', conditions: [], effects: rule.effects }, 'x');
    expect(r.skipped).toBe(true);
    expect(r.prologContent).toBeNull();
    expect(r.skipReason).toBe('no conditions');
  });

  it('skips rules with no effects', () => {
    const r = convertVolitionRule({ name: 'empty', conditions: rule.conditions, effects: [] }, 'x');
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('no effects');
  });

  it('threads citations from the citation map by source rule name', () => {
    const citationMap = {
      'Comfort Friend': [{ title: 'VESPACE ref', url: 'http://example.test/ref' }],
    };
    const r = convertVolitionRule(rule, 'friendship', citationMap);
    expect(r.citations).toEqual(citationMap['Comfort Friend']);
  });

  it('negated boolean conditions become \\+ goals', () => {
    const p = convertVolitionRule(
      {
        name: 'lonely',
        conditions: [{ category: 'trait', type: 'shy', first: 'initiator', value: false }],
        effects: rule.effects,
      },
      'x',
    ).prologContent!;
    expect(p).toContain('\\+ trait(X, shy)');
  });
});

describe('convertVolitionRuleFile', () => {
  it('converts every rule in the file, carrying the file category', () => {
    const results = convertVolitionRuleFile({
      fileName: 'friendship.json',
      category: 'friendship',
      rules: [
        {
          name: 'A',
          conditions: [{ category: 'status', type: 'happy', first: 'initiator' }],
          effects: [{ category: 'status', type: 'proud', first: 'initiator' }],
        },
        { name: 'B', conditions: [], effects: [] }, // skipped
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0].skipped).toBe(false);
    expect(results[0].prologContent).toContain('rule_category(a, friendship).');
    expect(results[1].skipped).toBe(true);
  });
});

describe('convertEnsembleAction', () => {
  const action = {
    name: 'flirt',
    displayName: 'Flirt',
    conditions: [{ category: 'attribute', type: 'charisma', first: 'initiator', operator: '>', value: 5 }],
    effects: [
      { category: 'directed status', type: 'attracted', first: 'responder', second: 'initiator' },
    ],
    leadsTo: ['kiss'],
    isAccept: true,
  };

  it('emits the canonical action preamble', () => {
    const p = convertEnsembleAction(action, 'romance').prologContent!;
    expect(p).toContain("action(flirt, 'Flirt', romance, 0).");
    expect(p).toContain('action_source(flirt, ensemble).');
    expect(p).toContain('action_tag(flirt, romance).');
    expect(p).toContain('action_difficulty(flirt, 0.5).');
    expect(p).toContain('action_duration(flirt, 1).');
  });

  it('emits leadsTo transitions and accept/reject markers', () => {
    const p = convertEnsembleAction(action, 'romance').prologContent!;
    expect(p).toContain('action_leads_to(flirt, kiss).');
    expect(p).toContain('action_accept(flirt).');
    const rejected = convertEnsembleAction({ ...action, isAccept: false }, 'romance').prologContent!;
    expect(rejected).toContain('action_reject(flirt).');
  });

  it('builds a can_perform/2 rule from conditions', () => {
    const p = convertEnsembleAction(action, 'romance').prologContent!;
    expect(p).toMatch(/can_perform\(X, flirt\)\s*:-\s*\n\s*person\(X\)/);
    expect(p).toContain('attribute(X, charisma, Charisma_val)');
  });

  it('lowers effects to action_effect/2 facts', () => {
    const p = convertEnsembleAction(action, 'romance').prologContent!;
    expect(p).toContain('action_effect(flirt, add_directed_status(Y, X, attracted))');
  });

  it('unconditional actions still get a can_perform/2 rule', () => {
    const p = convertEnsembleAction({ name: 'wave', conditions: [], effects: [] }, 'social').prologContent!;
    expect(p).toContain('can_perform(X, wave) :- person(X).');
  });
});

describe('convertActionFile', () => {
  it('converts every action carrying the file category', () => {
    const results = convertActionFile({
      category: 'social',
      actions: [
        { name: 'greet', conditions: [], effects: [] },
        { name: 'insult', conditions: [], effects: [], isAccept: false },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0].prologContent).toContain('action(greet,');
    expect(results[1].prologContent).toContain('action_reject(insult).');
  });
});
