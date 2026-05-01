/**
 * Tests for SaveConflictResolver — offline save conflict detection and merge.
 *
 * Run with: npx tsx client/src/components/3DGame/SaveConflictResolver.test.ts
 */

import {
  detectConflict,
  mergeStates,
  applyResolution,
  resolveConflict,
  type SaveConflict,
  type ConflictDialogHandler,
} from '/game-engine/logic/SaveConflictResolver';
import type { GameSaveState } from '@shared/game-engine/types';

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

function assertEq(actual: any, expected: any, message: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<GameSaveState> = {}): GameSaveState {
  return {
    version: 2,
    slotIndex: 0,
    savedAt: new Date('2026-03-19T10:00:00Z').toISOString(),
    gameTime: 1000,
    player: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      gold: 100,
      health: 100,
      energy: 80,
      inventory: [],
    },
    npcs: [],
    relationships: {},
    romance: null,
    merchants: [],
    currentZone: { id: 'zone1', name: 'Town Square', type: 'town' },
    questProgress: {},
    ...overrides,
  };
}

function makeConflict(overrides: Partial<SaveConflict> = {}): SaveConflict {
  return {
    localState: makeState(),
    serverState: makeState({ savedAt: new Date('2026-03-19T11:00:00Z').toISOString() }),
    baseState: makeState({ savedAt: new Date('2026-03-19T09:00:00Z').toISOString() }),
    slotIndex: 0,
    worldId: 'w1',
    playthroughId: 'p1',
    ...overrides,
  };
}

// ─── Conflict Detection Tests ───────────────────────────────────────────────

async function testDetectConflict_noServerState() {
  console.log('\n— detectConflict: no server state —');
  const local = makeState();
  assert(detectConflict(local, null, null) === false, 'no conflict when server has no state');
}

async function testDetectConflict_serverMatchesBase() {
  console.log('\n— detectConflict: server matches base —');
  const local = makeState();
  const base = makeState({ savedAt: '2026-03-19T09:00:00.000Z' });
  const server = makeState({ savedAt: '2026-03-19T09:00:00.000Z' });
  assert(detectConflict(local, server, base) === false, 'no conflict when server matches base');
}

async function testDetectConflict_serverDivergedFromBase() {
  console.log('\n— detectConflict: server diverged from base —');
  const local = makeState();
  const base = makeState({ savedAt: '2026-03-19T09:00:00.000Z' });
  const server = makeState({ savedAt: '2026-03-19T10:30:00.000Z' });
  assert(detectConflict(local, server, base) === true, 'conflict when server diverged from base');
}

async function testDetectConflict_noBase_serverNewer() {
  console.log('\n— detectConflict: no base, server is newer —');
  const local = makeState({ savedAt: '2026-03-19T10:00:00.000Z' });
  const server = makeState({ savedAt: '2026-03-19T11:00:00.000Z' });
  assert(detectConflict(local, server, null) === true, 'conflict when server is newer (no base)');
}

async function testDetectConflict_noBase_localNewer() {
  console.log('\n— detectConflict: no base, local is newer —');
  const local = makeState({ savedAt: '2026-03-19T11:00:00.000Z' });
  const server = makeState({ savedAt: '2026-03-19T10:00:00.000Z' });
  assert(detectConflict(local, server, null) === false, 'no conflict when local is newer (no base)');
}

// ─── Merge Tests ────────────────────────────────────────────────────────────

async function testMerge_goldAdditive() {
  console.log('\n— merge: gold additive from base —');
  const base = makeState({ player: { ...makeState().player, gold: 100 } });
  const local = makeState({ player: { ...makeState().player, gold: 150 } }); // +50
  const server = makeState({ player: { ...makeState().player, gold: 130 } }); // +30

  const result = mergeStates(local, server, base);
  // 100 + 50 + 30 = 180
  assertEq(result.resolvedState.player.gold, 180, 'gold is additively merged (100+50+30=180)');
}

async function testMerge_goldNoBase() {
  console.log('\n— merge: gold without base takes higher —');
  const local = makeState({ player: { ...makeState().player, gold: 150 } });
  const server = makeState({ player: { ...makeState().player, gold: 200 } });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.player.gold, 200, 'gold takes higher value when no base');
}

async function testMerge_healthTakesHigher() {
  console.log('\n— merge: health/energy take higher —');
  const local = makeState({ player: { ...makeState().player, health: 80, energy: 90 } });
  const server = makeState({ player: { ...makeState().player, health: 95, energy: 60 } });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.player.health, 95, 'health takes higher (server 95 > local 80)');
  assertEq(result.resolvedState.player.energy, 90, 'energy takes higher (local 90 > server 60)');
}

async function testMerge_positionKeepsLocal() {
  console.log('\n— merge: position keeps local —');
  const local = makeState({ player: { ...makeState().player, position: { x: 10, y: 0, z: 20 } } });
  const server = makeState({ player: { ...makeState().player, position: { x: 50, y: 0, z: 50 } } });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.player.position, { x: 10, y: 0, z: 20 }, 'position keeps local');
}

async function testMerge_inventoryUnion() {
  console.log('\n— merge: inventory union —');
  const base = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 1 } as any,
      ],
    },
  });
  const local = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 1 } as any,
        { id: 'potion', name: 'Potion', type: 'consumable', quantity: 3 } as any,
      ],
    },
  });
  const server = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 2 } as any,
        { id: 'shield', name: 'Shield', type: 'armor', quantity: 1 } as any,
      ],
    },
  });

  const result = mergeStates(local, server, base);
  const inv = result.resolvedState.player.inventory;
  assert(inv.some(i => i.id === 'sword'), 'sword present in merged inventory');
  assert(inv.some(i => i.id === 'potion'), 'potion present (local-only item)');
  assert(inv.some(i => i.id === 'shield'), 'shield present (server-only item)');
  const sword = inv.find(i => i.id === 'sword');
  assertEq(sword?.quantity, 2, 'sword quantity takes higher (2 > 1)');
}

async function testMerge_inventoryLocalRemoval() {
  console.log('\n— merge: inventory respects local removal —');
  const base = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 1 } as any,
        { id: 'potion', name: 'Potion', type: 'consumable', quantity: 1 } as any,
      ],
    },
  });
  // Local removed the potion
  const local = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 1 } as any,
      ],
    },
  });
  // Server still has it
  const server = makeState({
    player: {
      ...makeState().player,
      inventory: [
        { id: 'sword', name: 'Sword', type: 'weapon', quantity: 1 } as any,
        { id: 'potion', name: 'Potion', type: 'consumable', quantity: 1 } as any,
      ],
    },
  });

  const result = mergeStates(local, server, base);
  const inv = result.resolvedState.player.inventory;
  assert(inv.some(i => i.id === 'sword'), 'sword still present');
  assert(!inv.some(i => i.id === 'potion'), 'potion removed (local deletion respected)');
}

async function testMerge_gameTimeTakesHigher() {
  console.log('\n— merge: gameTime takes higher —');
  const local = makeState({ gameTime: 2000 });
  const server = makeState({ gameTime: 1500 });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.gameTime, 2000, 'gameTime takes higher value');
}

async function testMerge_questProgressMerge() {
  console.log('\n— merge: quest progress merge —');
  const local = makeState({
    questProgress: {
      q1: { status: 'completed', objectives: [{ id: 'o1', completed: true }] },
      q2: { status: 'active', objectives: [{ id: 'o1', completed: false }] },
      q3: { status: 'active', objectives: [] }, // only in local
    },
  });
  const server = makeState({
    questProgress: {
      q1: { status: 'active', objectives: [{ id: 'o1', completed: false }] },
      q2: { status: 'completed', objectives: [{ id: 'o1', completed: true }] },
      q4: { status: 'active', objectives: [] }, // only in server
    },
  });

  const result = mergeStates(local, server, null);
  const qp = result.resolvedState.questProgress;
  assertEq(qp.q1.status, 'completed', 'q1: local completed > server active');
  assertEq(qp.q2.status, 'completed', 'q2: server completed > local active');
  assert(qp.q3 != null, 'q3: local-only quest preserved');
  assert(qp.q4 != null, 'q4: server-only quest preserved');
}

async function testMerge_relationshipsMerge() {
  console.log('\n— merge: relationships merge —');
  const local = makeState({
    relationships: {
      player: {
        npc1: { type: 'friend', strength: 80 },
        npc2: { type: 'acquaintance', strength: 30 },
      },
    },
  });
  const server = makeState({
    relationships: {
      player: {
        npc1: { type: 'friend', strength: 60 },
        npc3: { type: 'rival', strength: 50 },
      },
    },
  });

  const result = mergeStates(local, server, null);
  const rels = result.resolvedState.relationships;
  assertEq(rels.player.npc1.strength, 80, 'npc1: take higher strength (local 80 > server 60)');
  assert(rels.player.npc2 != null, 'npc2: local-only relationship preserved');
  assert(rels.player.npc3 != null, 'npc3: server-only relationship preserved');
}

async function testMerge_currentZoneKeepsLocal() {
  console.log('\n— merge: currentZone keeps local —');
  const local = makeState({ currentZone: { id: 'z1', name: 'Forest', type: 'wilderness' } });
  const server = makeState({ currentZone: { id: 'z2', name: 'Castle', type: 'dungeon' } });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.currentZone?.id, 'z1', 'currentZone keeps local');
}

async function testMerge_merchantsKeepsLocal() {
  console.log('\n— merge: merchants keeps local —');
  const localMerchants = [{ id: 'm1', inventory: ['item1'] }] as any;
  const serverMerchants = [{ id: 'm1', inventory: ['item2'] }] as any;
  const local = makeState({ merchants: localMerchants });
  const server = makeState({ merchants: serverMerchants });

  const result = mergeStates(local, server, null);
  assertEq(result.resolvedState.merchants, localMerchants, 'merchants keeps local');
}

// ─── Resolution Tests ───────────────────────────────────────────────────────

async function testApplyResolution_keepLocal() {
  console.log('\n— applyResolution: keep_local —');
  const conflict = makeConflict();
  const result = applyResolution(conflict, 'keep_local');
  assertEq(result.resolution, 'keep_local', 'resolution is keep_local');
  assertEq(result.resolvedState.player.gold, conflict.localState.player.gold, 'uses local state values');
}

async function testApplyResolution_keepServer() {
  console.log('\n— applyResolution: keep_server —');
  const conflict = makeConflict({
    serverState: makeState({ player: { ...makeState().player, gold: 999 } }),
  });
  const result = applyResolution(conflict, 'keep_server');
  assertEq(result.resolution, 'keep_server', 'resolution is keep_server');
  assertEq(result.resolvedState.player.gold, 999, 'uses server state values');
}

async function testApplyResolution_merge() {
  console.log('\n— applyResolution: merge —');
  const conflict = makeConflict();
  const result = applyResolution(conflict, 'merge');
  assertEq(result.resolution, 'merge', 'resolution is merge');
  assert(result.fieldSummary.length > 0, 'field summary is populated');
}

async function testResolveConflict_withDialogHandler() {
  console.log('\n— resolveConflict: with dialog handler —');
  const conflict = makeConflict({
    serverState: makeState({ player: { ...makeState().player, gold: 500 } }),
  });
  const handler: ConflictDialogHandler = async () => 'keep_server';
  const result = await resolveConflict(conflict, handler);
  assertEq(result.resolution, 'keep_server', 'uses handler choice');
  assertEq(result.resolvedState.player.gold, 500, 'applied server state');
}

async function testResolveConflict_defaultsToMerge() {
  console.log('\n— resolveConflict: defaults to merge without handler —');
  const conflict = makeConflict();
  const result = await resolveConflict(conflict);
  assertEq(result.resolution, 'merge', 'defaults to merge when no handler');
}

async function testMerge_subsystemLocalChanged() {
  console.log('\n— merge: subsystem takes local when changed from base —');
  const base = makeState({ languageProgress: { score: 10 } });
  const local = makeState({ languageProgress: { score: 25 } });
  const server = makeState({ languageProgress: { score: 15 } });

  const result = mergeStates(local, server, base);
  assertEq(result.resolvedState.languageProgress?.score, 25, 'local subsystem used when changed from base');
}

async function testMerge_subsystemLocalUnchanged() {
  console.log('\n— merge: subsystem takes server when local unchanged from base —');
  const base = makeState({ languageProgress: { score: 10 } });
  const local = makeState({ languageProgress: { score: 10 } });
  const server = makeState({ languageProgress: { score: 20 } });

  const result = mergeStates(local, server, base);
  assertEq(result.resolvedState.languageProgress?.score, 20, 'server subsystem used when local unchanged');
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('SaveConflictResolver Tests\n===========================');

  // Detection
  await testDetectConflict_noServerState();
  await testDetectConflict_serverMatchesBase();
  await testDetectConflict_serverDivergedFromBase();
  await testDetectConflict_noBase_serverNewer();
  await testDetectConflict_noBase_localNewer();

  // Merge
  await testMerge_goldAdditive();
  await testMerge_goldNoBase();
  await testMerge_healthTakesHigher();
  await testMerge_positionKeepsLocal();
  await testMerge_inventoryUnion();
  await testMerge_inventoryLocalRemoval();
  await testMerge_gameTimeTakesHigher();
  await testMerge_questProgressMerge();
  await testMerge_relationshipsMerge();
  await testMerge_currentZoneKeepsLocal();
  await testMerge_merchantsKeepsLocal();
  await testMerge_subsystemLocalChanged();
  await testMerge_subsystemLocalUnchanged();

  // Resolution
  await testApplyResolution_keepLocal();
  await testApplyResolution_keepServer();
  await testApplyResolution_merge();
  await testResolveConflict_withDialogHandler();
  await testResolveConflict_defaultsToMerge();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
