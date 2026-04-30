/**
 * Tests for TauPrologEngine
 *
 * Run with: npx tsx shared/prolog/tau-engine.test.ts
 */

import { TauPrologEngine } from './tau-engine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

async function testBasicFacts() {
  console.log('\n── Basic Facts ──');
  const engine = new TauPrologEngine();

  await engine.assertFact('person(john)');
  await engine.assertFact('person(mary)');
  await engine.assertFact('person(bob)');

  const result = await engine.query('person(X)');
  assert(result.success, 'Query succeeds');
  assert(result.bindings.length === 3, `Found 3 persons (got ${result.bindings.length})`);

  const names = result.bindings.map(b => b.X);
  assert(names.includes('john'), 'Contains john');
  assert(names.includes('mary'), 'Contains mary');
  assert(names.includes('bob'), 'Contains bob');
}

async function testFactsWithArguments() {
  console.log('\n── Facts with Arguments ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts([
    'age(john, 35)',
    'age(mary, 28)',
    'age(bob, 12)',
  ]);

  const result = await engine.query('age(X, A), A > 20');
  assert(result.success, 'Query succeeds');
  assert(result.bindings.length === 2, `Found 2 adults (got ${result.bindings.length})`);
  assert(result.bindings.some(b => b.X === 'john' && b.A === 35), 'John is 35');
  assert(result.bindings.some(b => b.X === 'mary' && b.A === 28), 'Mary is 28');
}

async function testRetract() {
  console.log('\n── Retract ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts(['person(john)', 'person(mary)', 'person(bob)']);

  let result = await engine.query('person(X)');
  assert(result.bindings.length === 3, 'Starts with 3 persons');

  await engine.retractFact('person(bob)');
  result = await engine.query('person(X)');
  assert(result.bindings.length === 2, `After retract: 2 persons (got ${result.bindings.length})`);
  assert(!result.bindings.some(b => b.X === 'bob'), 'Bob is gone');
}

async function testRules() {
  console.log('\n── Rules ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts([
    'person(john)', 'person(mary)', 'person(bob)',
    'age(john, 35)', 'age(mary, 28)', 'age(bob, 12)',
  ]);

  await engine.addRule('adult(X) :- person(X), age(X, A), A >= 18');
  await engine.addRule('child(X) :- person(X), age(X, A), A < 18');

  const adults = await engine.query('adult(X)');
  assert(adults.bindings.length === 2, `Found 2 adults (got ${adults.bindings.length})`);

  const children = await engine.query('child(X)');
  assert(children.bindings.length === 1, `Found 1 child (got ${children.bindings.length})`);
  assert(children.bindings[0].X === 'bob', 'Child is bob');
}

async function testQueryOnce() {
  console.log('\n── Query Once ──');
  const engine = new TauPrologEngine();

  await engine.assertFact('person(john)');

  const exists = await engine.queryOnce('person(john)');
  assert(exists === true, 'person(john) exists');

  const missing = await engine.queryOnce('person(nobody)');
  assert(missing === false, 'person(nobody) does not exist');
}

async function testConsult() {
  console.log('\n── Consult Program ──');
  const engine = new TauPrologEngine();

  await engine.consult(`
    :- dynamic(person/1).
    :- dynamic(age/2).
    :- dynamic(location/2).

    person(john). person(mary).
    age(john, 35). age(mary, 28).
    location(john, tavern). location(mary, market).

    adult(X) :- person(X), age(X, A), A >= 18.
    at_same_place(X, Y) :- location(X, L), location(Y, L), X \\= Y.
  `);

  const adults = await engine.query('adult(X)');
  assert(adults.bindings.length === 2, 'Found 2 adults from consulted program');

  const samePlace = await engine.query('at_same_place(X, Y)');
  assert(samePlace.bindings.length === 0, 'Nobody at same place');

  // Add a fact to put them together
  await engine.assertFact('location(bob, tavern)');
  await engine.assertFact('person(bob)');
  await engine.assertFact('age(bob, 40)');

  const samePlace2 = await engine.query('at_same_place(X, Y)');
  assert(samePlace2.bindings.length === 2, `Two pairs at tavern (got ${samePlace2.bindings.length})`);
}

async function testExportImport() {
  console.log('\n── Export/Import ──');
  const engine1 = new TauPrologEngine();

  await engine1.assertFacts(['person(john)', 'person(mary)', 'age(john, 35)']);
  await engine1.addRule('adult(X) :- person(X), age(X, A), A >= 18');

  const exported = engine1.export();
  assert(exported.includes('person(john).'), 'Export contains fact');
  assert(exported.includes('adult(X)'), 'Export contains rule');
  assert(exported.includes(':- dynamic'), 'Export contains dynamic declarations');

  // Import into a fresh engine
  const engine2 = new TauPrologEngine();
  await engine2.import(exported);

  const result = await engine2.query('person(X)');
  assert(result.bindings.length === 2, `Imported engine has 2 persons (got ${result.bindings.length})`);

  const adults = await engine2.query('adult(X)');
  assert(adults.bindings.length === 1, `Imported engine finds 1 adult (got ${adults.bindings.length})`);
}

async function testClear() {
  console.log('\n── Clear ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts(['person(john)', 'person(mary)']);
  let stats = engine.getStats();
  assert(stats.factCount === 2, 'Has 2 facts');

  await engine.clear();
  stats = engine.getStats();
  assert(stats.factCount === 0, 'After clear: 0 facts');
  assert(stats.ruleCount === 0, 'After clear: 0 rules');
}

async function testStats() {
  console.log('\n── Stats ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts(['person(john)', 'person(mary)', 'age(john, 35)']);
  await engine.addRule('adult(X) :- person(X), age(X, A), A >= 18');

  const stats = engine.getStats();
  assert(stats.factCount === 3, `3 facts (got ${stats.factCount})`);
  assert(stats.ruleCount === 1, `1 rule (got ${stats.ruleCount})`);
  assert(stats.dynamicPredicates.includes('person/1'), 'Tracks person/1');
  assert(stats.dynamicPredicates.includes('age/2'), 'Tracks age/2');
}

async function testComplexPredicates() {
  console.log('\n── Complex Predicates (Game-like) ──');
  const engine = new TauPrologEngine();

  // Simulate a game world knowledge base
  await engine.assertFacts([
    'person(aragorn)', 'person(gandalf)', 'person(frodo)',
    'age(aragorn, 87)', 'age(gandalf, 2000)', 'age(frodo, 50)',
    'occupation(aragorn, ranger)', 'occupation(gandalf, wizard)', 'occupation(frodo, adventurer)',
    'at_location(aragorn, rivendell)', 'at_location(gandalf, rivendell)', 'at_location(frodo, shire)',
    'friend_of(aragorn, gandalf)', 'friend_of(frodo, gandalf)',
    'has_item(aragorn, sword)', 'has_item(frodo, ring)',
  ]);

  await engine.addRules([
    'friends(X, Y) :- friend_of(X, Y)',
    'friends(X, Y) :- friend_of(Y, X)',
    'at_same_location(X, Y) :- at_location(X, L), at_location(Y, L), X \\= Y',
    'can_interact(X, Y) :- at_same_location(X, Y)',
    'armed(X) :- has_item(X, sword)',
  ]);

  const friends = await engine.query('friends(aragorn, X)');
  assert(friends.bindings.length === 1, `Aragorn has 1 friend (got ${friends.bindings.length})`);
  assert(friends.bindings[0].X === 'gandalf', 'Friend is gandalf');

  const interact = await engine.query('can_interact(X, Y)');
  assert(interact.bindings.length === 2, `2 interaction pairs (got ${interact.bindings.length})`);

  const armed = await engine.query('armed(X)');
  assert(armed.bindings.length === 1, 'Only aragorn is armed');
  assert(armed.bindings[0].X === 'aragorn', 'Armed person is aragorn');
}

async function testFindall() {
  console.log('\n── Findall ──');
  const engine = new TauPrologEngine();

  await engine.assertFacts(['person(john)', 'person(mary)', 'person(bob)']);

  const result = await engine.query('findall(X, person(X), L)');
  assert(result.success, 'findall succeeds');
  assert(result.bindings.length === 1, 'One result binding');
}

async function testBulkPerformance() {
  console.log('\n── Bulk Performance ──');
  const engine = new TauPrologEngine();

  const facts: string[] = [];
  for (let i = 0; i < 500; i++) {
    facts.push(`person(npc_${i})`);
    facts.push(`age(npc_${i}, ${20 + (i % 60)})`);
  }

  const start = Date.now();
  await engine.assertFacts(facts);
  const assertTime = Date.now() - start;
  console.log(`    Assert 1000 facts: ${assertTime}ms`);
  assert(assertTime < 5000, `Bulk assert under 5s (took ${assertTime}ms)`);

  const queryStart = Date.now();
  const result = await engine.query('person(X)', 100);
  const queryTime = Date.now() - queryStart;
  console.log(`    Query 100 results: ${queryTime}ms`);
  assert(queryTime < 2000, `Query under 2s (took ${queryTime}ms)`);
  assert(result.bindings.length === 100, `Got 100 results (got ${result.bindings.length})`);

  const stats = engine.getStats();
  assert(stats.factCount === 1000, `1000 facts stored (got ${stats.factCount})`);
}

// ── Run all tests ──

async function main() {
  console.log('TauPrologEngine Test Suite');
  console.log('='.repeat(50));

  await testBasicFacts();
  await testFactsWithArguments();
  await testRetract();
  await testRules();
  await testQueryOnce();
  await testConsult();
  await testExportImport();
  await testClear();
  await testStats();
  await testComplexPredicates();
  await testFindall();
  await testBulkPerformance();

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
