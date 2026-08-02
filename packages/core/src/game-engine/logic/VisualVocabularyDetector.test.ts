/**
 * Tests for VisualVocabularyDetector
 *
 * Run with: npx tsx client/src/components/3DGame/VisualVocabularyDetector.test.ts
 */

import { VisualVocabularyDetector, type VocabularyTarget, type IdentificationPrompt } from '/game-engine/logic/VisualVocabularyDetector';

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

function makeTarget(overrides?: Partial<VocabularyTarget>): VocabularyTarget {
  return {
    id: 'target-1',
    questId: 'quest-1',
    objectiveId: 'obj-1',
    targetWord: 'manzana',
    englishMeaning: 'apple',
    ...overrides,
  };
}

// --- Tests ---

function testRegisterAndRetrieve() {
  console.log('\n== Register and retrieve targets ==');
  const detector = new VisualVocabularyDetector();
  const target = makeTarget();
  detector.registerTarget(target);

  const targets = detector.getQuestTargets('quest-1');
  assertEqual(targets.length, 1, 'Should have 1 target for quest');
  assertEqual(targets[0].targetWord, 'manzana', 'Target word matches');
  assertEqual(detector.getTotalCount('quest-1'), 1, 'Total count is 1');
  assertEqual(detector.getIdentifiedCount('quest-1'), 0, 'Identified count starts at 0');

  detector.dispose();
}

function testExactMatchPasses() {
  console.log('\n== Exact match passes ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  const result = detector.submitAnswer('target-1', 'manzana');
  assert(result.passed, 'Exact match should pass');
  assertEqual(result.score, 100, 'Exact match score is 100');
  assert(result.objectiveCompleted, 'Objective should be completed');
  assertEqual(detector.getIdentifiedCount('quest-1'), 1, 'Identified count is 1');

  detector.dispose();
}

function testCaseInsensitive() {
  console.log('\n== Case insensitive matching ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  const result = detector.submitAnswer('target-1', 'MANZANA');
  assert(result.passed, 'Uppercase should still pass');
  assert(result.score >= 90, 'Score should be high');

  detector.dispose();
}

function testAccentInsensitive() {
  console.log('\n== Accent insensitive matching ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget({ targetWord: 'café' }));

  const result = detector.submitAnswer('target-1', 'cafe');
  assert(result.passed, 'Without accent should still pass');
  assert(result.score >= 90, 'Score should be high');

  detector.dispose();
}

function testCloseAnswerPasses() {
  console.log('\n== Close answer with minor typo passes ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  // 1 character off in a 7-character word = ~85% score
  const result = detector.submitAnswer('target-1', 'manzano');
  assert(result.passed, 'Close typo should pass');
  assert(result.score >= 45, `Score should be above threshold (got ${result.score})`);

  detector.dispose();
}

function testWrongAnswerFails() {
  console.log('\n== Wrong answer fails ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  const result = detector.submitAnswer('target-1', 'perro');
  assert(!result.passed, 'Completely wrong answer should fail');
  assert(!result.objectiveCompleted, 'Objective should not be completed');
  assertEqual(detector.getIdentifiedCount('quest-1'), 0, 'Identified count still 0');

  detector.dispose();
}

function testHintAfterFailedAttempts() {
  console.log('\n== Hint shown after 2 failed attempts ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  detector.submitAnswer('target-1', 'wrong1');
  const result2 = detector.submitAnswer('target-1', 'wrong2');

  assert(result2.feedback.includes('apple'), 'Feedback should include English hint after 2 attempts');

  detector.dispose();
}

function testAlternateAnswersAccepted() {
  console.log('\n== Alternate accepted answers ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget({
    targetWord: 'rojo',
    acceptedAnswers: ['colorado'],
  }));

  const result = detector.submitAnswer('target-1', 'colorado');
  assert(result.passed, 'Alternate answer should pass');

  detector.dispose();
}

function testAlreadyIdentifiedReturnsEarly() {
  console.log('\n== Already identified returns early ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  detector.submitAnswer('target-1', 'manzana');
  const result = detector.submitAnswer('target-1', 'manzana');
  assert(result.passed, 'Should still return passed');
  assert(result.objectiveCompleted, 'Should still show completed');
  assertEqual(result.feedback, 'Already identified.', 'Should say already identified');

  detector.dispose();
}

function testQuestCompletionCheck() {
  console.log('\n== Quest completion check ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget({ id: 'target-1', objectiveId: 'obj-1', targetWord: 'manzana' }));
  detector.registerTarget(makeTarget({ id: 'target-2', objectiveId: 'obj-2', targetWord: 'naranja', englishMeaning: 'orange' }));

  assert(!detector.isQuestComplete('quest-1'), 'Quest not complete initially');
  detector.submitAnswer('target-1', 'manzana');
  assert(!detector.isQuestComplete('quest-1'), 'Quest not complete after 1 of 2');
  detector.submitAnswer('target-2', 'naranja');
  assert(detector.isQuestComplete('quest-1'), 'Quest complete after all targets identified');

  detector.dispose();
}

function testTriggerPromptCallback() {
  console.log('\n== Trigger prompt fires callback ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  let promptReceived: IdentificationPrompt | null = null;
  detector.setOnIdentificationPrompt((prompt) => {
    promptReceived = prompt;
  });

  detector.triggerPrompt('target-1');
  assert(promptReceived !== null, 'Prompt callback should have fired');
  assertEqual(promptReceived!.questId, 'quest-1', 'Prompt has correct questId');
  assert(!promptReceived!.isActivity, 'Should not be an activity prompt');

  detector.dispose();
}

function testActivityPrompt() {
  console.log('\n== Activity (verb/adverb) prompt ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget({
    targetWord: 'correr',
    englishMeaning: 'to run',
    isActivity: true,
    activityNpcId: 'npc-1',
  }));

  const prompt = detector.triggerPrompt('target-1');
  assert(prompt !== null, 'Prompt should be returned');
  assert(prompt!.isActivity, 'Should be an activity prompt');
  assert(prompt!.promptText.includes('doing'), 'Activity prompt asks what person is doing');

  detector.dispose();
}

function testCompletionCallback() {
  console.log('\n== Completion callback fires on correct answer ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  let completedQuestId: string | null = null;
  let completedObjectiveId: string | null = null;
  detector.setOnObjectiveCompleted((questId, objectiveId) => {
    completedQuestId = questId;
    completedObjectiveId = objectiveId;
  });

  detector.submitAnswer('target-1', 'manzana');
  assertEqual(completedQuestId, 'quest-1', 'Completion callback has correct questId');
  assertEqual(completedObjectiveId, 'obj-1', 'Completion callback has correct objectiveId');

  detector.dispose();
}

function testRemoveTarget() {
  console.log('\n== Remove target ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());
  assertEqual(detector.getTotalCount('quest-1'), 1, 'Has 1 target');

  detector.removeTarget('target-1');
  assertEqual(detector.getTotalCount('quest-1'), 0, 'Has 0 targets after removal');

  detector.dispose();
}

function testRemoveQuestTargets() {
  console.log('\n== Remove all quest targets ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget({ id: 't1' }));
  detector.registerTarget(makeTarget({ id: 't2' }));
  detector.registerTarget(makeTarget({ id: 't3', questId: 'other-quest' }));
  assertEqual(detector.getTotalCount('quest-1'), 2, 'Has 2 targets for quest-1');

  detector.removeQuestTargets('quest-1');
  assertEqual(detector.getTotalCount('quest-1'), 0, 'Has 0 targets for quest-1 after removal');
  assertEqual(detector.getTotalCount('other-quest'), 1, 'Other quest targets unaffected');

  detector.dispose();
}

function testNoPromptForIdentifiedTarget() {
  console.log('\n== No prompt for already identified target ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  detector.submitAnswer('target-1', 'manzana');
  const prompt = detector.triggerPrompt('target-1');
  assert(prompt === null, 'Should not prompt for already identified target');

  detector.dispose();
}

function testNonexistentTarget() {
  console.log('\n== Nonexistent target returns gracefully ==');
  const detector = new VisualVocabularyDetector();

  const result = detector.submitAnswer('nonexistent', 'test');
  assert(!result.passed, 'Should not pass');
  assertEqual(result.feedback, 'Target not found.', 'Should return not found feedback');

  const prompt = detector.triggerPrompt('nonexistent');
  assert(prompt === null, 'Should return null prompt');

  detector.dispose();
}

function testProgressTracking() {
  console.log('\n== Progress tracking ==');
  const detector = new VisualVocabularyDetector();
  detector.registerTarget(makeTarget());

  let progress = detector.getProgress('target-1');
  assertEqual(progress!.attempts, 0, 'Starts with 0 attempts');
  assert(!progress!.identified, 'Not identified initially');

  detector.submitAnswer('target-1', 'wrong');
  progress = detector.getProgress('target-1');
  assertEqual(progress!.attempts, 1, '1 attempt after wrong answer');
  assert(!progress!.identified, 'Still not identified');

  detector.submitAnswer('target-1', 'manzana');
  progress = detector.getProgress('target-1');
  assertEqual(progress!.attempts, 2, '2 total attempts');
  assert(progress!.identified, 'Now identified');
  assert(progress!.bestScore >= 90, 'Best score is high');

  detector.dispose();
}

// --- Run all tests ---

console.log('=== VisualVocabularyDetector Tests ===');

testRegisterAndRetrieve();
testExactMatchPasses();
testCaseInsensitive();
testAccentInsensitive();
testCloseAnswerPasses();
testWrongAnswerFails();
testHintAfterFailedAttempts();
testAlternateAnswersAccepted();
testAlreadyIdentifiedReturnsEarly();
testQuestCompletionCheck();
testTriggerPromptCallback();
testActivityPrompt();
testCompletionCallback();
testRemoveTarget();
testRemoveQuestTargets();
testNoPromptForIdentifiedTarget();
testNonexistentTarget();
testProgressTracking();

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) {
  process.exit(1);
}
