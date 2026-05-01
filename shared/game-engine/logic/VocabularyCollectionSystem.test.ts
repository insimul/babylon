/**
 * Tests for VocabularyCollectionSystem
 *
 * Run with: npx tsx client/src/components/3DGame/VocabularyCollectionSystem.test.ts
 */

import {
  VocabularyCollectionSystem,
  type VocabObjectTag,
  type VocabQuiz,
  type CollectionResult,
} from '/game-engine/logic/VocabularyCollectionSystem';
import { GameEventBus, type GameEvent } from '/game-engine/logic/GameEventBus';

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

function makeTag(overrides?: Partial<VocabObjectTag>): VocabObjectTag {
  return {
    objectId: 'obj-1',
    targetWord: 'pan',
    englishMeaning: 'bread',
    partOfSpeech: 'noun',
    category: 'food',
    difficulty: 'beginner',
    position: { x: 10, y: 0, z: 10 },
    ...overrides,
  };
}

// --- Tests ---

function testRegisterAndQuery() {
  console.log('\n== Register and query objects ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());

  const ids = sys.getRegisteredObjectIds();
  assertEqual(ids.length, 1, 'Should have 1 registered object');
  assertEqual(ids[0], 'obj-1', 'Object ID matches');

  const tag = sys.getObjectTag('obj-1');
  assert(tag !== null, 'Tag should exist');
  assertEqual(tag!.targetWord, 'pan', 'Target word matches');
  assertEqual(tag!.category, 'food', 'Category matches');

  sys.dispose();
}

function testRegisterMultiple() {
  console.log('\n== Register multiple objects ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObjects([
    makeTag({ objectId: 'o1' }),
    makeTag({ objectId: 'o2' }),
    makeTag({ objectId: 'o3' }),
  ]);

  assertEqual(sys.getRegisteredObjectIds().length, 3, 'Should have 3 objects');
  sys.dispose();
}

function testRemoveObject() {
  console.log('\n== Remove object ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  assertEqual(sys.getRegisteredObjectIds().length, 1, 'Has 1 object');

  sys.removeObject('obj-1');
  assertEqual(sys.getRegisteredObjectIds().length, 0, 'Has 0 after removal');
  assert(sys.getObjectTag('obj-1') === null, 'Tag is null after removal');

  sys.dispose();
}

function testProximityDetection() {
  console.log('\n== Proximity detection ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag({ objectId: 'near', position: { x: 3, y: 0, z: 3 } }));
  sys.registerObject(makeTag({ objectId: 'far', position: { x: 100, y: 0, z: 100 } }));

  const inRange = sys.getObjectsInRange({ x: 0, y: 0, z: 0 }, 5);
  assertEqual(inRange.length, 1, 'Only 1 object in range');
  assertEqual(inRange[0], 'near', 'Near object is in range');

  sys.dispose();
}

function testProximityExcludesCollected() {
  console.log('\n== Proximity excludes collected objects ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag({ objectId: 'o1', position: { x: 1, y: 0, z: 1 } }));
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  // Collect it
  sys.submitAnswer('o1', 'bread');

  const inRange = sys.getObjectsInRange({ x: 0, y: 0, z: 0 }, 5);
  assertEqual(inRange.length, 0, 'Collected object not in range');

  sys.dispose();
}

function testGenerateQuiz() {
  console.log('\n== Generate quiz ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  const quiz = sys.generateQuiz('obj-1');
  assert(quiz !== null, 'Quiz should be generated');
  assertEqual(quiz!.objectId, 'obj-1', 'Quiz objectId matches');
  assertEqual(quiz!.targetWord, 'pan', 'Quiz target word matches');
  assertEqual(quiz!.prompt, 'What does "pan" mean?', 'Quiz prompt is correct');

  // Check options
  assert(quiz!.options.length >= 2, 'Quiz has at least 2 options');
  const correctOptions = quiz!.options.filter(o => o.isCorrect);
  assertEqual(correctOptions.length, 1, 'Exactly 1 correct option');
  assertEqual(correctOptions[0].text, 'bread', 'Correct option is the English meaning');

  sys.dispose();
}

function testGenerateQuizNullForCollected() {
  console.log('\n== Quiz returns null for collected object ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  sys.submitAnswer('obj-1', 'bread');
  const quiz = sys.generateQuiz('obj-1');
  assert(quiz === null, 'Quiz should be null for collected object');

  sys.dispose();
}

function testGenerateQuizNullForUnknown() {
  console.log('\n== Quiz returns null for unknown object ==');
  const sys = new VocabularyCollectionSystem();
  const quiz = sys.generateQuiz('nonexistent');
  assert(quiz === null, 'Quiz should be null for unknown object');
  sys.dispose();
}

function testCorrectAnswer() {
  console.log('\n== Correct answer collects word ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  const result = sys.submitAnswer('obj-1', 'bread');
  assert(result.correct, 'Answer should be correct');
  assertEqual(result.targetWord, 'pan', 'Result target word');
  assertEqual(result.englishMeaning, 'bread', 'Result English meaning');
  assertEqual(result.xpAwarded, 3, 'Should award 3 XP');
  assert(!result.alreadyCollected, 'Not already collected');
  assert(sys.isCollected('obj-1'), 'Object is now collected');
  assertEqual(sys.getCollectedCount(), 1, 'Collected count is 1');

  sys.dispose();
}

function testIncorrectAnswer() {
  console.log('\n== Incorrect answer does not collect ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());

  const result = sys.submitAnswer('obj-1', 'water');
  assert(!result.correct, 'Answer should be incorrect');
  assertEqual(result.xpAwarded, 0, 'No XP for wrong answer');
  assert(!sys.isCollected('obj-1'), 'Object is not collected');
  assertEqual(sys.getCollectedCount(), 0, 'Collected count is 0');

  sys.dispose();
}

function testDuplicateCollectionPrevented() {
  console.log('\n== Duplicate collection prevented ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  sys.submitAnswer('obj-1', 'bread');
  const result2 = sys.submitAnswer('obj-1', 'bread');

  assert(result2.correct, 'Still correct');
  assert(result2.alreadyCollected, 'Marked as already collected');
  assertEqual(result2.xpAwarded, 0, 'No XP for duplicate');
  assertEqual(sys.getCollectedCount(), 1, 'Collected count stays 1');

  sys.dispose();
}

function testUnknownObjectAnswer() {
  console.log('\n== Answer for unknown object ==');
  const sys = new VocabularyCollectionSystem();
  const result = sys.submitAnswer('nonexistent', 'test');
  assert(!result.correct, 'Should not be correct');
  assertEqual(result.targetWord, '', 'Empty target word');
  sys.dispose();
}

function testInteractTriggersCallback() {
  console.log('\n== Interact triggers quiz callback ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  let receivedQuiz: VocabQuiz | null = null;
  sys.setOnQuizPrompt((quiz) => {
    receivedQuiz = quiz;
  });

  const quiz = sys.interact('obj-1');
  assert(quiz !== null, 'Interact returns quiz');
  assert(receivedQuiz !== null, 'Callback received quiz');
  assertEqual(receivedQuiz!.objectId, 'obj-1', 'Callback quiz has correct objectId');

  sys.dispose();
}

function testInteractReturnsNullForCollected() {
  console.log('\n== Interact returns null for collected ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk']);

  sys.submitAnswer('obj-1', 'bread');
  const quiz = sys.interact('obj-1');
  assert(quiz === null, 'Should return null for collected object');

  sys.dispose();
}

function testWordCollectedCallback() {
  console.log('\n== Word collected callback fires ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());

  let collectedResult: CollectionResult | null = null;
  sys.setOnWordCollected((result) => {
    collectedResult = result;
  });

  sys.submitAnswer('obj-1', 'bread');
  assert(collectedResult !== null, 'Callback should fire on correct answer');
  assertEqual(collectedResult!.targetWord, 'pan', 'Callback has correct target word');
  assertEqual(collectedResult!.xpAwarded, 3, 'Callback has correct XP');

  sys.dispose();
}

function testWordCollectedCallbackNotOnWrong() {
  console.log('\n== Word collected callback does not fire on wrong answer ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());

  let callbackFired = false;
  sys.setOnWordCollected(() => {
    callbackFired = true;
  });

  sys.submitAnswer('obj-1', 'wrong');
  assert(!callbackFired, 'Callback should not fire on wrong answer');

  sys.dispose();
}

function testEventBusEmitsOnCorrect() {
  console.log('\n== EventBus emits events on correct answer ==');
  const eventBus = new GameEventBus();
  const sys = new VocabularyCollectionSystem(eventBus);
  sys.registerObject(makeTag());

  const events: GameEvent[] = [];
  eventBus.onAny((event) => events.push(event));

  sys.submitAnswer('obj-1', 'bread');

  const vocabEvent = events.find(e => e.type === 'vocabulary_used');
  assert(vocabEvent !== undefined, 'vocabulary_used event emitted');
  assert(
    vocabEvent !== undefined && vocabEvent.type === 'vocabulary_used' && vocabEvent.correct === true,
    'vocabulary_used event has correct=true',
  );

  const itemEvent = events.find(e => e.type === 'item_collected');
  assert(itemEvent !== undefined, 'item_collected event emitted');
  assert(
    itemEvent !== undefined && itemEvent.type === 'item_collected' && itemEvent.itemName === 'pan',
    'item_collected event has correct itemName',
  );

  eventBus.dispose();
  sys.dispose();
}

function testEventBusEmitsOnIncorrect() {
  console.log('\n== EventBus emits vocabulary_used on wrong answer ==');
  const eventBus = new GameEventBus();
  const sys = new VocabularyCollectionSystem(eventBus);
  sys.registerObject(makeTag());

  const events: GameEvent[] = [];
  eventBus.onAny((event) => events.push(event));

  sys.submitAnswer('obj-1', 'wrong');

  const vocabEvent = events.find(e => e.type === 'vocabulary_used');
  assert(vocabEvent !== undefined, 'vocabulary_used event emitted on wrong');
  assert(
    vocabEvent !== undefined && vocabEvent.type === 'vocabulary_used' && vocabEvent.correct === false,
    'vocabulary_used event has correct=false',
  );

  const itemEvent = events.find(e => e.type === 'item_collected');
  assert(itemEvent === undefined, 'item_collected should NOT be emitted on wrong');

  eventBus.dispose();
  sys.dispose();
}

function testUncollectedIds() {
  console.log('\n== Uncollected IDs ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObjects([
    makeTag({ objectId: 'o1' }),
    makeTag({ objectId: 'o2', englishMeaning: 'water', targetWord: 'agua' }),
    makeTag({ objectId: 'o3', englishMeaning: 'milk', targetWord: 'leche' }),
  ]);
  sys.seedDistractors('food', ['cheese', 'fish', 'meat']);

  assertEqual(sys.getUncollectedIds().length, 3, '3 uncollected initially');

  sys.submitAnswer('o1', 'bread');
  assertEqual(sys.getUncollectedIds().length, 2, '2 uncollected after collecting 1');
  assert(!sys.getUncollectedIds().includes('o1'), 'Collected ID not in uncollected list');
  assert(sys.getUncollectedIds().includes('o2'), 'Uncollected ID still in list');

  sys.dispose();
}

function testCollectedIds() {
  console.log('\n== Collected IDs ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObjects([
    makeTag({ objectId: 'o1' }),
    makeTag({ objectId: 'o2', englishMeaning: 'water', targetWord: 'agua' }),
  ]);

  assertEqual(sys.getCollectedIds().length, 0, '0 collected initially');

  sys.submitAnswer('o1', 'bread');
  const collected = sys.getCollectedIds();
  assertEqual(collected.length, 1, '1 collected after correct answer');
  assertEqual(collected[0], 'o1', 'Collected ID matches');

  sys.dispose();
}

function testSeedDistractors() {
  console.log('\n== Seed distractors for quiz variety ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese', 'milk', 'fish', 'meat']);
  sys.seedDistractors('nature', ['tree', 'river', 'mountain']);

  const quiz = sys.generateQuiz('obj-1');
  assert(quiz !== null, 'Quiz generated with distractors');
  // Should have 4 options (1 correct + 3 distractors)
  assertEqual(quiz!.options.length, 4, 'Quiz has 4 options');

  // Verify all distractor options are not the correct answer
  const wrongOptions = quiz!.options.filter(o => !o.isCorrect);
  assertEqual(wrongOptions.length, 3, '3 wrong options');
  for (const opt of wrongOptions) {
    assert(opt.text !== 'bread', `Distractor "${opt.text}" is not the correct answer`);
  }

  sys.dispose();
}

function testQuizWithFewDistractors() {
  console.log('\n== Quiz with few distractors ==');
  const sys = new VocabularyCollectionSystem();
  // Only 1 distractor available (from the registered object itself: 'bread')
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water']);

  const quiz = sys.generateQuiz('obj-1');
  assert(quiz !== null, 'Quiz generated even with few distractors');
  // Should have at least 2 options (correct + 1 distractor)
  assert(quiz!.options.length >= 2, 'At least 2 options with limited distractors');

  sys.dispose();
}

function testDispose() {
  console.log('\n== Dispose clears all state ==');
  const sys = new VocabularyCollectionSystem();
  sys.registerObject(makeTag());
  sys.seedDistractors('food', ['water', 'cheese']);
  sys.submitAnswer('obj-1', 'bread');

  sys.dispose();

  assertEqual(sys.getRegisteredObjectIds().length, 0, 'No registered objects');
  assertEqual(sys.getCollectedCount(), 0, 'No collected objects');

  sys.dispose();
}

function testCrossCategoryDistractors() {
  console.log('\n== Cross-category distractors used as fallback ==');
  const sys = new VocabularyCollectionSystem();
  // Register object in 'colors' category with no same-category distractors
  sys.registerObject(makeTag({
    objectId: 'color-1',
    targetWord: 'rojo',
    englishMeaning: 'red',
    category: 'colors',
    difficulty: 'beginner',
  }));
  // Only seed distractors in different category
  sys.seedDistractors('food', ['bread', 'water', 'cheese', 'milk']);

  const quiz = sys.generateQuiz('color-1');
  assert(quiz !== null, 'Quiz generated with cross-category distractors');
  assert(quiz!.options.length >= 2, 'Has multiple options from cross-category pool');

  sys.dispose();
}

// --- Run all tests ---

console.log('=== VocabularyCollectionSystem Tests ===');

testRegisterAndQuery();
testRegisterMultiple();
testRemoveObject();
testProximityDetection();
testProximityExcludesCollected();
testGenerateQuiz();
testGenerateQuizNullForCollected();
testGenerateQuizNullForUnknown();
testCorrectAnswer();
testIncorrectAnswer();
testDuplicateCollectionPrevented();
testUnknownObjectAnswer();
testInteractTriggersCallback();
testInteractReturnsNullForCollected();
testWordCollectedCallback();
testWordCollectedCallbackNotOnWrong();
testEventBusEmitsOnCorrect();
testEventBusEmitsOnIncorrect();
testUncollectedIds();
testCollectedIds();
testSeedDistractors();
testQuizWithFewDistractors();
testDispose();
testCrossCategoryDistractors();

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) {
  process.exit(1);
}
