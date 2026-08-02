/**
 * Game Truth Sync
 *
 * Bridges game events to canonical Prolog gameplay predicates (from
 * gameplay-predicates.ts). Subscribes to GameEventBus events and
 * asserts/retracts the corresponding has_item/3, has_equipped/3,
 * health/3, energy/3, at_location/2, etc. facts in real-time.
 *
 * Unlike GamePrologEngine (which tracks quest-centric predicates like
 * has(), collected(), equipped()), GameTruthSync maintains the canonical
 * gameplay-state predicates that action prerequisites reference.
 */

import type { TauPrologEngine } from '../../prolog/tau-engine';
import type { GameEventBus, GameEvent } from './GameEventBus';
import { GAMEPLAY_PREDICATES } from '../../prolog/gameplay-predicates';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Character data shape expected for NPC truth initialization. */
export interface NpcCharacterData {
  id: string;
  occupation?: string;
  currentLocation?: string;
  age?: number;
  birthYear?: number;
  skills?: Record<string, number>;
  personality?: {
    openness?: number;
    conscientiousness?: number;
    extroversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  role?: string;
  availableQuests?: string[];
}

export type { SerializedFact } from '../../prolog/types';
import type { SerializedFact } from '../../prolog/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a Prolog fact string like "has_item(player, sword, 1)." into a
 * SerializedFact. Returns null for unparseable strings.
 */
function parseFactString(factStr: string): SerializedFact | null {
  const trimmed = factStr.trim().replace(/\.\s*$/, '');
  const match = trimmed.match(/^([a-z_]\w*)\((.+)\)$/);
  if (!match) return null;

  const predicate = match[1];
  const argsStr = match[2];

  // Split args on commas at depth 0 (handle nested parens)
  const args: Array<string | number> = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      args.push(parseArg(current.trim()));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    args.push(parseArg(current.trim()));
  }

  return { predicate, args };
}

/** Parse a single Prolog arg: numbers become numbers, atoms stay strings. */
function parseArg(arg: string): string | number {
  // Strip quotes if present
  if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
    return arg.slice(1, -1);
  }
  const num = Number(arg);
  if (!isNaN(num) && arg !== '') return num;
  return arg;
}

/** Sanitize a string for use as a Prolog atom (lowercase, underscores). */
function sanitize(str: string): string {
  if (!str) return 'unknown';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ─── GameTruthSync ──────────────────────────────────────────────────────────

export class GameTruthSync {
  private engine: TauPrologEngine;
  private eventBus: GameEventBus;
  private unsubscribe: (() => void) | null = null;

  /** Track item quantities for has_item/3 updates. */
  private itemQuantities = new Map<string, number>();
  /** Track currently equipped items by slot for retract-before-assert. */
  private equippedSlots = new Map<string, string>();
  /** Current player location for retract-before-assert. */
  private currentLocation: string | null = null;
  /** Current player location type. */
  private currentLocationType: string | null = null;
  /** Current health (current, max). */
  private currentHealth: { current: number; max: number } = { current: 100, max: 100 };
  /** Current energy (current, max). */
  private currentEnergy: { current: number; max: number } = { current: 100, max: 100 };
  /** Current time of day (hour). */
  private currentHour: number | null = null;
  /** Current day number. */
  private currentDay: number | null = null;
  /** Known vocabulary categories per language. */
  private knownVocabulary = new Map<string, Set<string>>();
  /** Current CEFR language levels: lang → level. */
  private languageLevels = new Map<string, string>();

  // ── NPC Dynamic State ──────────────────────────────────────────────────
  /** NPC current locations: npcId → locationId. */
  private npcLocations = new Map<string, string>();
  /** NPC disposition toward others: "npcId:towardId" → value. */
  private npcDispositions = new Map<string, number>();
  /** NPCs currently flagged as traders. */
  private npcTraders = new Set<string>();
  /** NPC schedule provider callback (set externally). */
  private npcScheduleProvider: ((npcId: string, hour: number) => { locationId?: string; activity?: string } | null) | null = null;
  /** Set of all known NPC IDs (populated during initializeNpcTruths). */
  private knownNpcIds = new Set<string>();

  constructor(eventBus: GameEventBus, engine: TauPrologEngine) {
    this.eventBus = eventBus;
    this.engine = engine;
    this.subscribe();
  }

  // ── Event Subscriptions ─────────────────────────────────────────────────

  private subscribe(): void {
    this.unsubscribe = this.eventBus.onAny((event: GameEvent) => {
      this.handleEvent(event).catch(this.logError);
    });
  }

  private async handleEvent(event: GameEvent): Promise<void> {
    switch (event.type) {
      case 'item_equipped':
        await this.handleEquipped(event);
        break;
      case 'item_unequipped':
        await this.handleUnequipped(event);
        break;
      case 'item_collected':
        await this.handleItemCollected(event);
        break;
      case 'item_dropped':
        await this.handleItemDropped(event);
        break;
      case 'item_purchased':
        await this.handleItemPurchased(event);
        break;
      case 'item_crafted':
        await this.handleItemCrafted(event);
        break;
      // ── Location sync ──
      case 'location_visited':
        await this.handleLocationVisited(event);
        break;
      case 'settlement_entered':
        await this.handleSettlementEntered(event);
        break;
      // ── Time sync ──
      case 'hour_changed':
        await this.handleHourChanged(event);
        break;
      case 'day_changed':
        await this.handleDayChanged(event);
        break;
      // ── Energy deduction from actions ──
      case 'action_executed':
        await this.handleActionExecuted(event);
        break;
      // ── Language & vocabulary sync ──
      case 'vocabulary_used':
        await this.handleVocabularyUsed(event);
        break;
      case 'assessment_completed':
        await this.handleAssessmentCompleted(event);
        break;
      // ── NPC dynamic truth updates ──
      case 'npc_volition_action':
        await this.handleNpcVolitionAction(event);
        break;
      case 'npc_relationship_changed':
        await this.handleNpcRelationshipChanged(event);
        break;
      case 'quest_accepted':
        await this.handleQuestAccepted(event);
        break;
    }
  }

  // ── Equipment Handlers ──────────────────────────────────────────────────

  private async handleEquipped(event: { itemId: string; itemName: string; slot: string }): Promise<void> {
    const slot = sanitize(event.slot);
    const itemId = sanitize(event.itemId);

    // Retract previous item in this slot (if any)
    const prev = this.equippedSlots.get(slot);
    if (prev) {
      try {
        await this.engine.retractFact(`has_equipped(player, ${slot}, ${prev})`);
      } catch { /* may not exist */ }
    }

    // Assert new equipped item
    await this.engine.assertFact(`has_equipped(player, ${slot}, ${itemId})`);
    this.equippedSlots.set(slot, itemId);
  }

  private async handleUnequipped(event: { itemId: string; itemName: string; slot: string }): Promise<void> {
    const slot = sanitize(event.slot);
    const itemId = sanitize(event.itemId);

    try {
      await this.engine.retractFact(`has_equipped(player, ${slot}, ${itemId})`);
    } catch { /* may not exist */ }
    this.equippedSlots.delete(slot);
  }

  // ── Inventory Handlers ──────────────────────────────────────────────────

  private async handleItemCollected(event: { itemId: string; itemName: string; quantity: number }): Promise<void> {
    await this.addItem(sanitize(event.itemName), event.quantity);
  }

  private async handleItemDropped(event: { itemId: string; itemName: string; quantity: number }): Promise<void> {
    await this.removeItem(sanitize(event.itemName), event.quantity);
  }

  private async handleItemPurchased(event: { itemId: string; itemName: string; quantity: number; totalPrice: number; merchantId?: string }): Promise<void> {
    // Add the purchased item
    await this.addItem(sanitize(event.itemName), event.quantity);

    // Deduct gold: retract old, assert new
    await this.modifyGold(-event.totalPrice);

    // Track merchant stock depletion (merchant may run out of items)
    if (event.merchantId) {
      await this.trackMerchantStock(sanitize(event.merchantId));
    }
  }

  private async handleItemCrafted(event: { itemId: string; itemName: string; quantity: number }): Promise<void> {
    await this.addItem(sanitize(event.itemName), event.quantity);
  }

  // ── Item Quantity Helpers ───────────────────────────────────────────────

  private async addItem(itemName: string, quantity: number): Promise<void> {
    const oldQty = this.itemQuantities.get(itemName) || 0;
    const newQty = oldQty + quantity;

    // Retract old has_item if it existed
    if (oldQty > 0) {
      try {
        await this.engine.retractFact(`has_item(player, ${itemName}, ${oldQty})`);
      } catch { /* may not exist */ }
    }

    // Assert updated quantity
    await this.engine.assertFact(`has_item(player, ${itemName}, ${newQty})`);
    this.itemQuantities.set(itemName, newQty);
  }

  private async removeItem(itemName: string, quantity: number): Promise<void> {
    const oldQty = this.itemQuantities.get(itemName) || 0;
    const newQty = Math.max(0, oldQty - quantity);

    // Retract old fact
    if (oldQty > 0) {
      try {
        await this.engine.retractFact(`has_item(player, ${itemName}, ${oldQty})`);
      } catch { /* may not exist */ }
    }

    // Assert new quantity (or remove entirely if 0)
    if (newQty > 0) {
      await this.engine.assertFact(`has_item(player, ${itemName}, ${newQty})`);
    }
    this.itemQuantities.set(itemName, newQty);
  }

  // ── Gold Helper ─────────────────────────────────────────────────────────

  /** Current gold amount tracked locally. */
  private currentGold: number = 0;

  /** Initialize gold tracking (call during game setup). */
  async initializeGold(amount: number): Promise<void> {
    this.currentGold = amount;
    await this.engine.assertFact(`gold(player, ${amount})`);
  }

  private async modifyGold(delta: number): Promise<void> {
    const oldGold = this.currentGold;
    const newGold = Math.max(0, oldGold + delta);

    try {
      await this.engine.retractFact(`gold(player, ${oldGold})`);
    } catch { /* may not exist */ }

    await this.engine.assertFact(`gold(player, ${newGold})`);
    this.currentGold = newGold;
  }

  // ── Location Handlers ────────────────────────────────────────────────────

  private async handleLocationVisited(event: { locationId: string; locationName: string }): Promise<void> {
    const locId = sanitize(event.locationId);
    await this.setLocation(locId);

    // Assert location_discovered so it persists across visits
    await this.engine.assertFact(`location_discovered(${locId})`);
  }

  private async handleSettlementEntered(event: { settlementId: string; settlementName: string }): Promise<void> {
    const locId = sanitize(event.settlementId);
    await this.setLocation(locId);
    // Settlements are always "town" type
    await this.setLocationType('town');
  }

  private async setLocation(locationId: string): Promise<void> {
    // Retract old at_location
    if (this.currentLocation) {
      try {
        await this.engine.retractFact(`at_location(player, ${this.currentLocation})`);
      } catch { /* may not exist */ }
    }
    await this.engine.assertFact(`at_location(player, ${locationId})`);
    this.currentLocation = locationId;
  }

  /** Set or update the player's current location type (forest, mine, water, town, etc.). */
  async setLocationType(locationType: string): Promise<void> {
    const locType = sanitize(locationType);
    if (this.currentLocationType) {
      try {
        await this.engine.retractFact(`at_location_type(player, ${this.currentLocationType})`);
      } catch { /* may not exist */ }
    }
    await this.engine.assertFact(`at_location_type(player, ${locType})`);
    this.currentLocationType = locType;
  }

  /** Initialize player location (call during game setup). */
  async initializeLocation(locationId: string, locationType?: string): Promise<void> {
    await this.setLocation(sanitize(locationId));
    if (locationType) {
      await this.setLocationType(locationType);
    }
  }

  // ── Health & Energy Handlers ────────────────────────────────────────────

  /** Initialize player health (call during game setup). */
  async initializeHealth(current: number, max: number): Promise<void> {
    this.currentHealth = { current, max };
    await this.engine.assertFact(`health(player, ${current}, ${max})`);
  }

  /** Modify player health by a delta (positive = heal, negative = damage). */
  async modifyHealth(delta: number): Promise<void> {
    const { current: oldCurrent, max } = this.currentHealth;
    const newCurrent = Math.max(0, Math.min(max, oldCurrent + delta));

    try {
      await this.engine.retractFact(`health(player, ${oldCurrent}, ${max})`);
    } catch { /* may not exist */ }

    await this.engine.assertFact(`health(player, ${newCurrent}, ${max})`);
    this.currentHealth = { current: newCurrent, max };
  }

  /** Initialize player energy (call during game setup). */
  async initializeEnergy(current: number, max: number): Promise<void> {
    this.currentEnergy = { current, max };
    await this.engine.assertFact(`energy(player, ${current}, ${max})`);
  }

  /** Modify player energy by a delta (positive = restore, negative = cost). */
  async modifyEnergy(delta: number): Promise<void> {
    const { current: oldCurrent, max } = this.currentEnergy;
    const newCurrent = Math.max(0, Math.min(max, oldCurrent + delta));

    try {
      await this.engine.retractFact(`energy(player, ${oldCurrent}, ${max})`);
    } catch { /* may not exist */ }

    await this.engine.assertFact(`energy(player, ${newCurrent}, ${max})`);
    this.currentEnergy = { current: newCurrent, max };
  }

  private async handleActionExecuted(event: { energyCost?: number }): Promise<void> {
    if (event.energyCost && event.energyCost > 0) {
      await this.modifyEnergy(-event.energyCost);
    }
  }

  // ── Time Handlers ───────────────────────────────────────────────────────

  private async handleHourChanged(event: { hour: number; day: number }): Promise<void> {
    // Retract old time_of_day
    if (this.currentHour !== null) {
      try {
        await this.engine.retractFact(`time_of_day(${this.currentHour})`);
      } catch { /* may not exist */ }
    }
    await this.engine.assertFact(`time_of_day(${event.hour})`);
    this.currentHour = event.hour;

    // Update NPC locations and schedules from schedule provider
    await this.updateNpcSchedules(event.hour);
  }

  private async handleDayChanged(event: { day: number; timestep: number }): Promise<void> {
    // Retract old day_number
    if (this.currentDay !== null) {
      try {
        await this.engine.retractFact(`day_number(${this.currentDay})`);
      } catch { /* may not exist */ }
    }
    await this.engine.assertFact(`day_number(${event.day})`);
    this.currentDay = event.day;
  }

  /** Initialize time tracking (call during game setup). */
  async initializeTime(hour: number, day: number): Promise<void> {
    this.currentHour = hour;
    this.currentDay = day;
    await this.engine.assertFact(`time_of_day(${hour})`);
    await this.engine.assertFact(`day_number(${day})`);
  }

  // ── Vocabulary & Language Handlers ──────────────────────────────────────

  private async handleVocabularyUsed(event: { word: string; correct: boolean; category?: string }): Promise<void> {
    if (!event.correct) return; // Only track correctly used vocabulary

    // Use event category if provided, otherwise fall back to 'general'
    const category = event.category || 'general';
    // Assert for all known languages the player speaks
    const langs = Array.from(this.languageLevels.keys());
    for (const lang of langs) {
      if (!this.knownVocabulary.has(lang)) {
        this.knownVocabulary.set(lang, new Set());
      }
      const vocabSet = this.knownVocabulary.get(lang)!;
      if (!vocabSet.has(category)) {
        vocabSet.add(category);
        await this.engine.assertFact(`knows_vocabulary(player, ${lang}, ${category})`);
      }
    }
  }

  private async handleAssessmentCompleted(event: { cefrLevel?: string }): Promise<void> {
    if (!event.cefrLevel) return;

    const newLevel = sanitize(event.cefrLevel);

    // Update all tracked languages to the new CEFR level
    // (Assessment is typically for the target language — update the first non-primary language)
    const entries = Array.from(this.languageLevels.entries());
    for (const [lang, oldLevel] of entries) {
      // Skip primary language (typically the first one set, or 'english')
      if (lang === 'english') continue;

      try {
        await this.engine.retractFact(`speaks_language(player, ${lang}, ${oldLevel})`);
      } catch { /* may not exist */ }
      await this.engine.assertFact(`speaks_language(player, ${lang}, ${newLevel})`);
      this.languageLevels.set(lang, newLevel);
      break; // Only update the target language
    }
  }

  /** Initialize a language the player speaks (call during game setup for each language). */
  async initializeLanguage(language: string, cefrLevel: string): Promise<void> {
    const lang = sanitize(language);
    const level = sanitize(cefrLevel);
    this.languageLevels.set(lang, level);
    await this.engine.assertFact(`speaks_language(player, ${lang}, ${level})`);
  }

  // ── NPC Dynamic Truth Handlers ──────────────────────────────────────────

  /** Movement-related action IDs that imply the NPC changed location. */
  private static readonly NPC_MOVEMENT_ACTIONS = new Set([
    'travel_to_location', 'walk', 'run', 'enter_building',
  ]);

  private async handleNpcVolitionAction(event: {
    npcId: string; actionId: string; targetId?: string;
  }): Promise<void> {
    const npcId = sanitize(event.npcId);

    // If the action implies movement and has a target location, update at_location
    if (GameTruthSync.NPC_MOVEMENT_ACTIONS.has(event.actionId) && event.targetId) {
      await this.setNpcLocation(npcId, sanitize(event.targetId));
    }
  }

  private async handleNpcRelationshipChanged(event: {
    npcId: string; newStrength: number; delta: number;
  }): Promise<void> {
    const npcId = sanitize(event.npcId);
    // npc_disposition tracks NPC disposition toward the player
    const key = `${npcId}:player`;
    const oldValue = this.npcDispositions.get(key);

    if (oldValue !== undefined) {
      try {
        await this.engine.retractFact(`npc_disposition(${npcId}, player, ${oldValue})`);
      } catch { /* may not exist */ }
    }

    await this.engine.assertFact(`npc_disposition(${npcId}, player, ${event.newStrength})`);
    this.npcDispositions.set(key, event.newStrength);
  }

  private async handleQuestAccepted(event: {
    questId: string; assignedByNpcId?: string;
  }): Promise<void> {
    if (!event.assignedByNpcId) return;

    const npcId = sanitize(event.assignedByNpcId);
    const questId = sanitize(event.questId);

    // Retract the quest availability — NPC has given this quest
    try {
      await this.engine.retractFact(`npc_quest_available(${npcId}, ${questId})`);
    } catch { /* may not exist */ }
  }

  /** Set or update an NPC's current location. */
  private async setNpcLocation(npcId: string, locationId: string): Promise<void> {
    const oldLoc = this.npcLocations.get(npcId);
    if (oldLoc) {
      try {
        await this.engine.retractFact(`at_location(${npcId}, ${oldLoc})`);
      } catch { /* may not exist */ }
    }

    await this.engine.assertFact(`at_location(${npcId}, ${locationId})`);
    this.npcLocations.set(npcId, locationId);
  }

  /**
   * Set the schedule provider callback. The NPCScheduleSystem or similar
   * external system calls this to enable hour-based NPC location updates.
   *
   * The callback receives (npcId, hour) and returns the NPC's scheduled
   * location and activity for that hour, or null if no schedule data.
   */
  setNpcScheduleProvider(
    provider: (npcId: string, hour: number) => { locationId?: string; activity?: string } | null,
  ): void {
    this.npcScheduleProvider = provider;
  }

  /** Update all known NPC locations and schedules from the schedule provider. */
  private async updateNpcSchedules(hour: number): Promise<void> {
    if (!this.npcScheduleProvider) return;

    const facts: string[] = [];
    const retractions: string[] = [];

    for (const npcId of Array.from(this.knownNpcIds)) {
      const schedule = this.npcScheduleProvider(npcId, hour);
      if (!schedule) continue;

      // Update NPC location if schedule provides one
      if (schedule.locationId) {
        const locId = sanitize(schedule.locationId);
        const oldLoc = this.npcLocations.get(npcId);
        if (oldLoc && oldLoc !== locId) {
          retractions.push(`at_location(${npcId}, ${oldLoc})`);
        }
        if (oldLoc !== locId) {
          facts.push(`at_location(${npcId}, ${locId})`);
          this.npcLocations.set(npcId, locId);
        }
      }

      // Assert npc_schedule/4: npc_schedule(NpcId, Hour, Location, Activity)
      const activity = sanitize(schedule.activity || 'idle');
      const loc = sanitize(schedule.locationId || this.npcLocations.get(npcId) || 'unknown');
      facts.push(`npc_schedule(${npcId}, ${hour}, ${loc}, ${activity})`);
    }

    // Batch retract old locations, then assert new facts
    for (const r of retractions) {
      try {
        await this.engine.retractFact(r);
      } catch { /* may not exist */ }
    }
    if (facts.length > 0) {
      await this.engine.assertFacts(facts);
    }
  }

  /**
   * Track merchant stock depletion. Called after a purchase from a merchant.
   * Merchants with no remaining stock lose npc_will_trade status.
   */
  private async trackMerchantStock(merchantId: string): Promise<void> {
    // Note: actual stock tracking depends on the merchant inventory system.
    // This provides the retraction mechanism — call depleteMerchantStock()
    // externally when a merchant's inventory is confirmed empty.
    // The event handler ensures the merchant ID is tracked.
    this.npcTraders.add(merchantId);
  }

  /**
   * Mark a merchant NPC as out of stock — retracts npc_will_trade.
   * Call when merchant inventory system confirms empty stock.
   */
  async depleteMerchantStock(npcId: string): Promise<void> {
    const id = sanitize(npcId);
    if (this.npcTraders.has(id)) {
      try {
        await this.engine.retractFact(`npc_will_trade(${id})`);
      } catch { /* may not exist */ }
      this.npcTraders.delete(id);
    }
  }

  /**
   * Restore a merchant NPC's trade status — asserts npc_will_trade.
   * Call when merchant restocks.
   */
  async restoreMerchantStock(npcId: string): Promise<void> {
    const id = sanitize(npcId);
    if (!this.npcTraders.has(id)) {
      await this.engine.assertFact(`npc_will_trade(${id})`);
      this.npcTraders.add(id);
    }
  }

  // ── Serialization ───────────────────────────────────────────────────────

  /**
   * Serialize all gameplay-relevant Prolog facts to a JSON-compatible array.
   * Filters to only predicates defined in GAMEPLAY_PREDICATES so internal
   * Prolog system predicates are excluded.
   */
  serialize(): SerializedFact[] {
    const validNames = new Set(GAMEPLAY_PREDICATES.map(p => p.name));
    const allFacts = this.engine.getAllFacts();
    const results: SerializedFact[] = [];

    for (const factStr of allFacts) {
      const parsed = parseFactString(factStr);
      if (parsed && validNames.has(parsed.predicate)) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Restore previously serialized facts into the Prolog engine and rebuild
   * local state tracking maps. Call on a fresh/cleared GameTruthSync before
   * the game loop starts.
   */
  async restore(facts: SerializedFact[]): Promise<void> {
    // Clear local state tracking
    this.itemQuantities.clear();
    this.equippedSlots.clear();
    this.currentLocation = null;
    this.currentLocationType = null;
    this.currentHealth = { current: 100, max: 100 };
    this.currentEnergy = { current: 100, max: 100 };
    this.currentGold = 0;
    this.currentHour = null;
    this.currentDay = null;
    this.knownVocabulary.clear();
    this.languageLevels.clear();

    // Assert all facts into the engine
    const factStrings = facts.map(f => `${f.predicate}(${f.args.join(', ')})`);
    if (factStrings.length > 0) {
      await this.engine.assertFacts(factStrings);
    }

    // Rebuild local state from the restored facts
    for (const fact of facts) {
      this.rebuildLocalState(fact);
    }
  }

  /** Rebuild a single local state entry from a serialized fact. */
  private rebuildLocalState(fact: SerializedFact): void {
    switch (fact.predicate) {
      case 'has_item':
        if (fact.args.length >= 3) {
          this.itemQuantities.set(String(fact.args[1]), Number(fact.args[2]) || 0);
        }
        break;
      case 'has_equipped':
        if (fact.args.length >= 3) {
          this.equippedSlots.set(String(fact.args[1]), String(fact.args[2]));
        }
        break;
      case 'at_location':
        if (fact.args.length >= 2 && fact.args[0] === 'player') {
          this.currentLocation = String(fact.args[1]);
        }
        break;
      case 'at_location_type':
        if (fact.args.length >= 2 && fact.args[0] === 'player') {
          this.currentLocationType = String(fact.args[1]);
        }
        break;
      case 'health':
        if (fact.args.length >= 3 && fact.args[0] === 'player') {
          this.currentHealth = { current: Number(fact.args[1]), max: Number(fact.args[2]) };
        }
        break;
      case 'energy':
        if (fact.args.length >= 3 && fact.args[0] === 'player') {
          this.currentEnergy = { current: Number(fact.args[1]), max: Number(fact.args[2]) };
        }
        break;
      case 'gold':
        if (fact.args.length >= 2 && fact.args[0] === 'player') {
          this.currentGold = Number(fact.args[1]) || 0;
        }
        break;
      case 'time_of_day':
        if (fact.args.length >= 1) {
          this.currentHour = Number(fact.args[0]);
        }
        break;
      case 'day_number':
        if (fact.args.length >= 1) {
          this.currentDay = Number(fact.args[0]);
        }
        break;
      case 'speaks_language':
        if (fact.args.length >= 3 && fact.args[0] === 'player') {
          this.languageLevels.set(String(fact.args[1]), String(fact.args[2]));
        }
        break;
      case 'knows_vocabulary':
        if (fact.args.length >= 3 && fact.args[0] === 'player') {
          const lang = String(fact.args[1]);
          if (!this.knownVocabulary.has(lang)) {
            this.knownVocabulary.set(lang, new Set());
          }
          this.knownVocabulary.get(lang)!.add(String(fact.args[2]));
        }
        break;
    }
  }

  // ── NPC Truth Initialization ─────────────────────────────────────────────

  private static readonly MERCHANT_OCCUPATIONS = new Set([
    'merchant', 'shopkeeper', 'trader', 'vendor', 'blacksmith',
    'innkeeper', 'baker', 'butcher', 'tailor', 'pharmacist',
    'barkeeper', 'bartender', 'grocer',
  ]);

  private static readonly MERCHANT_ROLES = new Set([
    'merchant', 'blacksmith', 'innkeeper',
  ]);

  /**
   * Initialize Prolog truths for all NPC characters from DB data.
   * Call during game initialization after world data loads.
   *
   * For each NPC, asserts:
   * - person(NpcId)
   * - occupation(NpcId, Occ)
   * - at_location(NpcId, Loc)
   * - age(NpcId, Age)
   * - has_skill(NpcId, Skill, Level) per skill
   * - personality(NpcId, Trait, Value) per Big Five trait
   * - npc_occupation(NpcId, Occ)
   * - npc_will_trade(NpcId) for merchant-type NPCs
   * - npc_quest_available(NpcId, QuestId) per available quest
   * - health(NpcId, 100, 100) and energy(NpcId, 100, 100) defaults
   */
  async initializeNpcTruths(characters: NpcCharacterData[]): Promise<void> {
    const facts: string[] = [];

    for (const npc of characters) {
      const npcId = sanitize(npc.id);

      // Core identity
      facts.push(`person(${npcId})`);

      // Occupation
      const occ = sanitize(npc.occupation || 'unemployed');
      facts.push(`occupation(${npcId}, ${occ})`);
      facts.push(`npc_occupation(${npcId}, ${occ})`);

      // Location
      if (npc.currentLocation) {
        facts.push(`at_location(${npcId}, ${sanitize(npc.currentLocation)})`);
      }

      // Age — compute from birthYear if available, else default to 30
      const age = npc.age ?? (npc.birthYear ? (new Date().getFullYear() - npc.birthYear) : 30);
      facts.push(`age(${npcId}, ${age})`);

      // Skills
      if (npc.skills && typeof npc.skills === 'object') {
        for (const [skill, level] of Object.entries(npc.skills)) {
          if (typeof level === 'number') {
            facts.push(`has_skill(${npcId}, ${sanitize(skill)}, ${level})`);
          }
        }
      }

      // Personality (Big Five)
      if (npc.personality && typeof npc.personality === 'object') {
        const traits = ['openness', 'conscientiousness', 'extroversion', 'agreeableness', 'neuroticism'] as const;
        for (const trait of traits) {
          const value = (npc.personality as Record<string, number>)[trait];
          if (typeof value === 'number') {
            facts.push(`personality(${npcId}, ${trait}, ${value})`);
          }
        }
      }

      // Merchant detection
      const occLower = (npc.occupation || '').toLowerCase();
      const roleLower = (npc.role || '').toLowerCase();
      if (
        GameTruthSync.MERCHANT_OCCUPATIONS.has(occLower) ||
        GameTruthSync.MERCHANT_ROLES.has(roleLower)
      ) {
        facts.push(`npc_will_trade(${npcId})`);
      }

      // Available quests
      if (npc.availableQuests && Array.isArray(npc.availableQuests)) {
        for (const questId of npc.availableQuests) {
          facts.push(`npc_quest_available(${npcId}, ${sanitize(String(questId))})`);
        }
      }

      // Health and energy defaults
      facts.push(`health(${npcId}, 100, 100)`);
      facts.push(`energy(${npcId}, 100, 100)`);
    }

    // Batch assert all NPC facts
    if (facts.length > 0) {
      await this.engine.assertFacts(facts);
    }

    // Populate NPC tracking maps for dynamic updates
    for (const npc of characters) {
      const npcId = sanitize(npc.id);
      this.knownNpcIds.add(npcId);

      if (npc.currentLocation) {
        this.npcLocations.set(npcId, sanitize(npc.currentLocation));
      }

      // Track merchant NPCs in trader set
      const occLower = (npc.occupation || '').toLowerCase();
      const roleLower = (npc.role || '').toLowerCase();
      if (
        GameTruthSync.MERCHANT_OCCUPATIONS.has(occLower) ||
        GameTruthSync.MERCHANT_ROLES.has(roleLower)
      ) {
        this.npcTraders.add(npcId);
      }
    }
  }

  // ── Error Logging ───────────────────────────────────────────────────────

  private logError = (e: unknown): void => {
    console.warn('[GameTruthSync] Error handling event:', e);
  };

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.itemQuantities.clear();
    this.equippedSlots.clear();
    this.currentLocation = null;
    this.currentLocationType = null;
    this.currentHealth = { current: 100, max: 100 };
    this.currentEnergy = { current: 100, max: 100 };
    this.currentHour = null;
    this.currentDay = null;
    this.knownVocabulary.clear();
    this.languageLevels.clear();
    this.npcLocations.clear();
    this.npcDispositions.clear();
    this.npcTraders.clear();
    this.npcScheduleProvider = null;
    this.knownNpcIds.clear();
  }
}
