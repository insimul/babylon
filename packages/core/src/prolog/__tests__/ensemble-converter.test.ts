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
import { validateRuleContent } from '../content-validators';

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

// US-PC2 — rule_type/2 (hard requirement), rule_likelihood/2, category audit,
// and the someone/other-only head-variable edge case (old US-003/US-004).
describe('convertVolitionRule — US-PC2 completeness', () => {
  const base = {
    name: 'Comfort Friend',
    conditions: [{ category: 'status', type: 'sad', first: 'responder' }],
    effects: [{ category: 'status', type: 'comforted', first: 'responder' }],
  };

  it('emits rule_type/2 defaulting to volition', () => {
    const p = convertVolitionRule(base, 'friendship').prologContent!;
    expect(p).toContain('rule_type(comfort_friend, volition).');
  });

  it('honors an explicit rule_type of trigger', () => {
    const p = convertVolitionRule({ ...base, type: 'trigger' }, 'friendship').prologContent!;
    expect(p).toContain('rule_type(comfort_friend, trigger).');
  });

  it('honors an explicit rule_type of volition', () => {
    const p = convertVolitionRule({ ...base, type: 'volition' }, 'friendship').prologContent!;
    expect(p).toContain('rule_type(comfort_friend, volition).');
  });

  it('emits rule_likelihood/2 only when the source carries a likelihood', () => {
    const without = convertVolitionRule(base, 'friendship').prologContent!;
    expect(without).not.toContain('rule_likelihood(');

    const withLk = convertVolitionRule({ ...base, likelihood: 0.7 }, 'friendship').prologContent!;
    expect(withLk).toContain('rule_likelihood(comfort_friend, 0.7).');
  });

  it('clamps out-of-range likelihood into [0.0, 1.0] and drops non-finite values', () => {
    const high = convertVolitionRule({ ...base, likelihood: 1.4 }, 'friendship').prologContent!;
    expect(high).toContain('rule_likelihood(comfort_friend, 1).');
    const low = convertVolitionRule({ ...base, likelihood: -0.3 }, 'friendship').prologContent!;
    expect(low).toContain('rule_likelihood(comfort_friend, 0).');
    const nan = convertVolitionRule({ ...base, likelihood: NaN }, 'friendship').prologContent!;
    expect(nan).not.toContain('rule_likelihood(');
  });

  it('the emitted rule content satisfies validateRuleContent (rule_type present)', () => {
    const p = convertVolitionRule({ ...base, likelihood: 0.5 }, 'friendship').prologContent!;
    const v = validateRuleContent(p);
    expect(v.isValid, v.errors.join('; ')).toBe(true);
  });

  // Category audit (old US-004): matching is case- AND separator-insensitive.
  it('matches categories case-insensitively and across separator spellings', () => {
    const p = convertVolitionRule(
      {
        name: 'jealous',
        conditions: [
          { category: 'Directed Status', type: 'loves', first: 'initiator', second: 'responder' },
          { category: 'directedStatus', type: 'attracted', first: 'responder', second: 'initiator' },
          { category: 'directed_status', type: 'trusts', first: 'initiator', second: 'responder' },
          { category: 'EVENT UNDIRECTED', type: 'met', first: 'initiator', second: 'responder' },
        ],
        effects: [
          { category: 'Directed Status', type: 'jealous', first: 'initiator', second: 'responder' },
        ],
      },
      'romance',
    ).prologContent!;
    // All four spellings resolve to directed_status / event; none dropped as unknown.
    expect(p).toContain('directed_status(X, Y, loves)');
    expect(p).toContain('directed_status(Y, X, attracted)');
    expect(p).toContain('directed_status(X, Y, trusts)');
    expect(p).toContain('event(X, Y, met, _)');
    expect(p).toContain('rule_effect(jealous, add_directed_status(X, Y, jealous))');
  });

  // Old US-003: a rule whose only actor is someone/other still gets a valid,
  // body-bound head variable (not a silently-dropped or defaulted-to-X head).
  it('binds the head variable for a someone-only rule (Z)', () => {
    const p = convertVolitionRule(
      {
        name: 'envy',
        conditions: [{ category: 'trait', type: 'greedy', first: 'someone' }],
        effects: [{ category: 'status', type: 'envious', first: 'someone' }],
      },
      'social',
    ).prologContent!;
    expect(p).toMatch(/rule_applies\(envy, Z, _\)\s*:-/);
    expect(p).toContain('trait(Z, greedy)');
    expect(validateRuleContent(p).isValid).toBe(true);
  });

  it('binds the head variable for an other-only rule (Other)', () => {
    const p = convertVolitionRule(
      {
        name: 'rumor',
        conditions: [{ category: 'status', type: 'gossipy', first: 'other' }],
        effects: [{ category: 'intent', type: 'gossip', first: 'other', weight: 2 }],
      },
      'social',
    ).prologContent!;
    expect(p).toMatch(/rule_applies\(rumor, Other, _\)\s*:-/);
    expect(p).toContain('status(Other, gossipy)');
    expect(validateRuleContent(p).isValid).toBe(true);
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
