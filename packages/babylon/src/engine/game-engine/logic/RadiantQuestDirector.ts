/**
 * RadiantQuestDirector — Babylon runtime integration for radiant quest
 * generation (plan: docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md §3.3, US-RQ3).
 *
 * Bridges the pure, engine-agnostic {@link generateRadiantQuests} slot-filling
 * engine (packages/core, US-RQ2) to the live in-game Prolog KB owned by
 * {@link GamePrologEngine}. On a trigger (game-time tick, notice-board open,
 * quest completion — the caller decides when to `tick()`, mirroring how
 * DynamicQuestBoard is driven from BabylonGame) it:
 *
 *   1. reads a snapshot of the live KB (`exportKnowledgeBase()` — carries the
 *      consulted radiant template pack, world facts, and the runtime
 *      `radiant_generated`/`radiant_cooldown_until` bookkeeping from prior ticks),
 *   2. runs the pure generator against it,
 *   3. applies the returned facts to the live KB — retracting stale cooldowns
 *      first, then asserting provenance + fresh cooldown via
 *      {@link GamePrologEngine.assertRuntimeFact} so they PERSIST across
 *      save/load, and consulting the generated quest content into the KB,
 *   4. registers each new quest with the quest-tracking path (the Prolog active
 *      set for completion re-evaluation, and the playthrough quest overlay that
 *      the data source / BabylonQuestTracker read),
 *   5. hydrates the quest content into a Quest object and hands it to the caller
 *      via {@link RadiantDirectorHooks.onQuestGenerated} for HUD/registration.
 *
 * SAVE-FILE INVARIANT (insimul-platform/CLAUDE.md): everything this director
 * writes is per-playthrough state. Provenance/cooldown facts flow through
 * `assertRuntimeFact` → `getPlayerFacts()` → `save.currentState.prologFacts`;
 * generated quest content flows through the overlay → `save.currentState.quests`.
 * The director NEVER touches `worldSnapshot` (read-only world-template data).
 */

import type { GamePrologEngine } from './GamePrologEngine';
import type { PlaythroughQuestOverlay } from './PlaythroughQuestOverlay';
import {
  generateRadiantQuests,
  type GeneratedRadiantQuest,
} from '@insimul/core';
import { hydrateQuestFromProlog } from '@shared/prolog/quest-hydrator';

/**
 * A radiant quest generated this tick, ready for the quest system: the raw
 * generator output plus the hydrated Quest object and the persistable snapshot
 * that was written to the overlay.
 */
export interface RadiantQuestResult {
  /** Raw generator output (questId, templateId, questContent, facts). */
  generated: GeneratedRadiantQuest;
  /** Quest object hydrated from `questContent` via the quest-hydrator. */
  quest: any;
}

export interface RadiantDirectorHooks {
  /**
   * The playthrough quest overlay. Each generated quest's snapshot is stored via
   * `overlay.createQuest(...)`, so it lands in `save.currentState.quests`
   * (dynamicQuests) and the data source / BabylonQuestTracker pick it up.
   */
  overlay?: PlaythroughQuestOverlay;
  /**
   * Called once per generated quest after it has been applied to the KB and the
   * overlay. The caller (BabylonGame) uses this to push the hydrated quest into
   * its live quest list, refresh the tracker, and register it with the
   * QuestCompletionEngine — the director stays decoupled from those systems.
   */
  onQuestGenerated?: (quest: any, generated: GeneratedRadiantQuest) => void;
}

export interface RadiantDirectorConfig {
  /** Deterministic seed for the pure generator (Math.random is forbidden). */
  seed: number | string;
  /** Optional cap on quests generated per tick (across all templates). */
  maxQuests?: number;
}

/**
 * The generic completion rule for radiant quests. Unlike authored quests (whose
 * per-quest `quest_complete/2` clause is emitted by quest-converter), radiant
 * quest content carries only `quest/5` + `quest_objective/3` + `quest_reward/3`.
 * This single rule closes the loop for ALL radiant quests: a radiant quest is
 * complete when every one of its objectives is complete. It is scoped by
 * `radiant_generated/3` so it never changes completion semantics for authored
 * quests. `objective_complete/3` is the shared helper-predicate link (defined in
 * helper-predicates.ts for collect/deliver/defeat/… goal shapes).
 */
const RADIANT_COMPLETION_BRIDGE = `
% RadiantQuestDirector: generic completion for generated radiant quests.
quest_complete(Player, QuestId) :-
    radiant_generated(QuestId, _, _),
    \\+ ( quest_objective(QuestId, Idx, _),
         \\+ objective_complete(Player, QuestId, Idx) ).
`;

export class RadiantQuestDirector {
  private bridgeInstalled = false;

  constructor(
    private readonly engine: GamePrologEngine,
    private readonly config: RadiantDirectorConfig,
    private readonly hooks: RadiantDirectorHooks = {},
  ) {}

  /**
   * Run one radiant generation pass against the live KB at game time `now`
   * (whatever timebase the caller uses for cooldowns — e.g. accumulated game
   * seconds). Returns the quests generated and registered this tick (possibly
   * empty when every template is on cooldown, excluded, or unsatisfiable).
   */
  async tick(now: number): Promise<RadiantQuestResult[]> {
    await this.ensureBridge();

    const kb = this.engine.exportKnowledgeBase();
    const { quests } = await generateRadiantQuests(kb, {
      seed: this.config.seed,
      now,
      maxQuests: this.config.maxQuests,
    });

    const results: RadiantQuestResult[] = [];
    for (const generated of quests) {
      await this.applyToKb(generated);
      const quest = this.registerQuest(generated);
      this.hooks.onQuestGenerated?.(quest, generated);
      results.push({ generated, quest });
    }
    return results;
  }

  /**
   * Re-apply radiant quests loaded from a save file into a freshly-initialized
   * engine (reload path). The provenance/cooldown facts are restored separately
   * by `GamePrologEngine.restoreFromSaveState` (they persisted through
   * `prologFacts`); this re-consults the quest content (regenerable, so it is
   * NOT in the fact set) and re-registers each quest for completion tracking.
   */
  async restoreGeneratedQuests(
    saved: Array<{ id: string; content: string; [key: string]: any }>,
  ): Promise<void> {
    await this.ensureBridge();
    for (const q of saved) {
      if (!q?.content) continue;
      await this.engine.consultContent(q.content);
      this.engine.addActiveQuest(q.id);
    }
  }

  /** Consult the radiant completion bridge rule exactly once per director. */
  private async ensureBridge(): Promise<void> {
    if (this.bridgeInstalled) return;
    await this.engine.consultContent(RADIANT_COMPLETION_BRIDGE);
    this.bridgeInstalled = true;
  }

  /** Apply a generated quest's facts + content to the live KB. */
  private async applyToKb(generated: GeneratedRadiantQuest): Promise<void> {
    // Retract stale cooldowns BEFORE asserting the fresh one (the generator
    // emits both so the KB never holds two cooldown facts for one template).
    for (const fact of generated.factsToRetract) {
      await this.engine.retractRuntimeFact(fact);
    }
    // Provenance + cooldown persist across save/load (assertRuntimeFact →
    // playerFacts → save.currentState.prologFacts).
    for (const fact of generated.factsToAssert) {
      await this.engine.assertRuntimeFact(fact, 'radiant');
    }
    // Quest content (quest/5 + objectives + rewards) is regenerable state; it
    // is consulted into the live KB (so completion queries resolve) and persists
    // via the overlay, not the fact set.
    await this.engine.consultContent(generated.questContent);
    this.engine.addActiveQuest(generated.questId);
  }

  /** Hydrate a generated quest and write its snapshot to the overlay. */
  private registerQuest(generated: GeneratedRadiantQuest): any {
    const quest = hydrateQuestFromProlog({
      id: generated.questId,
      content: generated.questContent,
      status: 'available',
      isRadiant: true,
      radiantTemplateId: generated.templateId,
    });
    // Persist into the playthrough overlay → save.currentState.quests. Never the
    // world snapshot.
    this.hooks.overlay?.createQuest(quest);
    return quest;
  }
}
