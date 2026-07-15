/**
 * AmbientConversationSystem — NPC-to-NPC ambient conversations with
 * language-learning vocabulary injection.
 *
 * NPCs spontaneously converse based on proximity, relationship strength,
 * emotional state, time-of-day, and location context. Conversations include
 * target-language snippets that the player can "overhear" when in range.
 * Overheard vocabulary is tracked for learning metrics via GameEventBus.
 *
 * Integration points:
 *  - GameEventBus: ambient_conversation_started / ended, vocabulary_overheard
 *  - TemporaryStateSystem: emotional modifiers affect conversation likelihood & tone
 *  - VolitionSystem NPCState: personality drives topic selection
 */

import { Vector3, Mesh } from '@babylonjs/core';
import type { GameEventBus } from '../logic/GameEventBus';
import type { StateType } from '../logic/TemporaryStateSystem';

// ── Types ──────────────────────────────────────────────────────────────────

/** Personality traits matching VolitionSystem.NPCState.personality */
export interface Personality {
  openness: number;
  conscientiousness: number;
  extroversion: number;
  agreeableness: number;
  neuroticism: number;
}

/** Relationship data between two NPCs */
export interface RelationshipInfo {
  charge: number;   // -100 (hostile) to +100 (close friends)
  spark: number;    // romantic interest 0-100
  type: string;     // e.g. 'friend', 'rival', 'acquaintance', 'family'
}

/** Minimal NPC record needed by this system */
export interface AmbientNPC {
  id: string;
  name: string;
  mesh: Mesh;
  personality: Personality;
  relationships: Record<string, RelationshipInfo>;
  currentLocation: string;
  temporaryStates: StateType[];
}

/** A single vocabulary item that can be injected into conversation */
export interface VocabularyItem {
  word: string;
  translation: string;
  language: string;
  difficulty: number;  // 1-5
  category: string;    // e.g. 'greetings', 'food', 'directions'
}

/** Conversation topic with template slots */
export interface ConversationTopic {
  id: string;
  name: string;
  /** Locations where this topic is likely (empty = anywhere) */
  locationTags: string[];
  /** Emotional states that boost this topic */
  boostedByStates: StateType[];
  /** Emotional states that suppress this topic */
  suppressedByStates: StateType[];
  /** Minimum relationship charge to use this topic (-100 to 100) */
  minRelationshipCharge: number;
  /** Time-of-day windows where topic is more likely: [startHour, endHour] */
  timeWindows: Array<[number, number]>;
  /** Weight multiplier for topic selection (higher = more likely) */
  baseWeight: number;
}

/** A single line in a conversation, with optional vocabulary slot */
export interface ConversationLine {
  speakerSlot: 'A' | 'B';
  /** Template text — `{vocab}` is replaced with the target-language word,
   *  `{translation}` with the native-language meaning. */
  template: string;
  /** If set, a vocabulary item is injected at this line */
  vocabularySlot: boolean;
  /** Category hint for selecting vocabulary (e.g. 'greetings') */
  vocabularyCategory?: string;
}

/** A full conversation template */
export interface ConversationTemplate {
  id: string;
  topicId: string;
  lines: ConversationLine[];
  /** Number of vocabulary words this template injects (max) */
  maxVocabularySlots: number;
}

/** Runtime state for an active ambient conversation */
export interface ActiveAmbientConversation {
  id: string;
  templateId: string;
  topicId: string;
  participants: [string, string]; // [npcA-id, npcB-id]
  locationId: string;
  startTime: number;
  currentLineIndex: number;
  /** Rendered lines with vocabulary filled in */
  renderedLines: RenderedLine[];
  /** Vocabulary items used in this conversation */
  injectedVocabulary: VocabularyItem[];
  /** Whether the player is currently in overhearing range */
  playerOverhearing: boolean;
  isComplete: boolean;
}

interface RenderedLine {
  speakerId: string;
  text: string;
  vocabularyItem: VocabularyItem | null;
}

// ── Built-in Topics ────────────────────────────────────────────────────────

const DEFAULT_TOPICS: ConversationTopic[] = [
  {
    id: 'daily_greeting',
    name: 'Daily Greeting',
    locationTags: [],
    boostedByStates: ['excited', 'grateful'],
    suppressedByStates: ['angry', 'fearful', 'grieving'],
    minRelationshipCharge: -20,
    timeWindows: [[6, 12]],
    baseWeight: 1.5,
  },
  {
    id: 'weather_chat',
    name: 'Weather Small Talk',
    locationTags: ['outdoor', 'market', 'square'],
    boostedByStates: [],
    suppressedByStates: ['angry', 'grieving'],
    minRelationshipCharge: -10,
    timeWindows: [],
    baseWeight: 1.0,
  },
  {
    id: 'market_gossip',
    name: 'Market Gossip',
    locationTags: ['market', 'shop', 'tavern'],
    boostedByStates: ['excited', 'suspicious'],
    suppressedByStates: ['fearful'],
    minRelationshipCharge: 10,
    timeWindows: [[8, 18]],
    baseWeight: 1.2,
  },
  {
    id: 'evening_reflection',
    name: 'Evening Reflection',
    locationTags: ['tavern', 'park', 'residential'],
    boostedByStates: ['inspired', 'grateful'],
    suppressedByStates: ['exhausted'],
    minRelationshipCharge: 20,
    timeWindows: [[17, 23]],
    baseWeight: 1.0,
  },
  {
    id: 'work_discussion',
    name: 'Work Discussion',
    locationTags: ['shop', 'workshop', 'farm', 'office'],
    boostedByStates: ['inspired'],
    suppressedByStates: ['exhausted', 'injured'],
    minRelationshipCharge: -5,
    timeWindows: [[8, 17]],
    baseWeight: 1.1,
  },
  {
    id: 'friendly_catch_up',
    name: 'Catching Up',
    locationTags: [],
    boostedByStates: ['excited', 'grateful'],
    suppressedByStates: ['angry', 'fearful'],
    minRelationshipCharge: 30,
    timeWindows: [],
    baseWeight: 1.3,
  },
  {
    id: 'complaint',
    name: 'Shared Complaint',
    locationTags: [],
    boostedByStates: ['angry', 'suspicious'],
    suppressedByStates: ['grateful', 'inspired'],
    minRelationshipCharge: 5,
    timeWindows: [],
    baseWeight: 0.8,
  },
  {
    id: 'food_discussion',
    name: 'Food & Cooking',
    locationTags: ['market', 'tavern', 'kitchen', 'residential'],
    boostedByStates: ['excited', 'inspired'],
    suppressedByStates: ['grieving'],
    minRelationshipCharge: 0,
    timeWindows: [[11, 14], [17, 20]],
    baseWeight: 1.2,
  },
];

// ── Built-in Templates ─────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: ConversationTemplate[] = [
  {
    id: 'greeting_basic',
    topicId: 'daily_greeting',
    maxVocabularySlots: 2,
    lines: [
      { speakerSlot: 'A', template: '{vocab}! How are you this morning?', vocabularySlot: true, vocabularyCategory: 'greetings' },
      { speakerSlot: 'B', template: 'I am doing well, thank you! {vocab}!', vocabularySlot: true, vocabularyCategory: 'greetings' },
      { speakerSlot: 'A', template: 'Beautiful day, isn\'t it?', vocabularySlot: false },
      { speakerSlot: 'B', template: 'It really is. Have a good one!', vocabularySlot: false },
    ],
  },
  {
    id: 'weather_basic',
    topicId: 'weather_chat',
    maxVocabularySlots: 1,
    lines: [
      { speakerSlot: 'A', template: 'Can you believe this weather?', vocabularySlot: false },
      { speakerSlot: 'B', template: 'I know! In my hometown we say {vocab} when it\'s like this.', vocabularySlot: true, vocabularyCategory: 'weather' },
      { speakerSlot: 'A', template: 'Ha! I like that expression.', vocabularySlot: false },
    ],
  },
  {
    id: 'market_gossip_basic',
    topicId: 'market_gossip',
    maxVocabularySlots: 2,
    lines: [
      { speakerSlot: 'A', template: 'Have you seen the new {vocab} at the market?', vocabularySlot: true, vocabularyCategory: 'food' },
      { speakerSlot: 'B', template: 'Yes! The merchant said they came from far away.', vocabularySlot: false },
      { speakerSlot: 'A', template: 'The {vocab} is quite reasonable too.', vocabularySlot: true, vocabularyCategory: 'commerce' },
      { speakerSlot: 'B', template: 'I might pick some up later. Thanks for the tip!', vocabularySlot: false },
    ],
  },
  {
    id: 'evening_reflection_basic',
    topicId: 'evening_reflection',
    maxVocabularySlots: 1,
    lines: [
      { speakerSlot: 'A', template: 'What a long day. Ready to relax?', vocabularySlot: false },
      { speakerSlot: 'B', template: 'Absolutely. As they say, {vocab}.', vocabularySlot: true, vocabularyCategory: 'expressions' },
      { speakerSlot: 'A', template: 'Couldn\'t agree more. Good night!', vocabularySlot: false },
    ],
  },
  {
    id: 'work_discussion_basic',
    topicId: 'work_discussion',
    maxVocabularySlots: 2,
    lines: [
      { speakerSlot: 'A', template: 'How is the {vocab} coming along?', vocabularySlot: true, vocabularyCategory: 'work' },
      { speakerSlot: 'B', template: 'Slowly but surely. I need more supplies.', vocabularySlot: false },
      { speakerSlot: 'A', template: 'Try the {vocab} method. It works much better.', vocabularySlot: true, vocabularyCategory: 'work' },
      { speakerSlot: 'B', template: 'Great idea, I will try that. Thank you!', vocabularySlot: false },
    ],
  },
  {
    id: 'catch_up_basic',
    topicId: 'friendly_catch_up',
    maxVocabularySlots: 2,
    lines: [
      { speakerSlot: 'A', template: 'It\'s been so long! {vocab}! ({translation})', vocabularySlot: true, vocabularyCategory: 'greetings' },
      { speakerSlot: 'B', template: 'I know! How have you been?', vocabularySlot: false },
      { speakerSlot: 'A', template: 'Busy! But I learned something interesting about {vocab}.', vocabularySlot: true, vocabularyCategory: 'culture' },
      { speakerSlot: 'B', template: 'Tell me more next time! I have to run.', vocabularySlot: false },
    ],
  },
  {
    id: 'complaint_basic',
    topicId: 'complaint',
    maxVocabularySlots: 1,
    lines: [
      { speakerSlot: 'A', template: 'Can you believe what happened today?', vocabularySlot: false },
      { speakerSlot: 'B', template: 'No, what?', vocabularySlot: false },
      { speakerSlot: 'A', template: 'Well, as they say: {vocab}. That sums it up.', vocabularySlot: true, vocabularyCategory: 'expressions' },
      { speakerSlot: 'B', template: 'I hear you. Hopefully tomorrow will be better.', vocabularySlot: false },
    ],
  },
  {
    id: 'food_basic',
    topicId: 'food_discussion',
    maxVocabularySlots: 2,
    lines: [
      { speakerSlot: 'A', template: 'Have you tried making {vocab}?', vocabularySlot: true, vocabularyCategory: 'food' },
      { speakerSlot: 'B', template: 'Not yet! Is it difficult?', vocabularySlot: false },
      { speakerSlot: 'A', template: 'Not at all. You just need some {vocab} and patience.', vocabularySlot: true, vocabularyCategory: 'food' },
      { speakerSlot: 'B', template: 'I will have to try that this weekend!', vocabularySlot: false },
    ],
  },
];

// ── Default Vocabulary Pool ────────────────────────────────────────────────

const DEFAULT_VOCABULARY: VocabularyItem[] = [
  // Greetings
  { word: 'Bonjour', translation: 'Good morning', language: 'French', difficulty: 1, category: 'greetings' },
  { word: 'Bonsoir', translation: 'Good evening', language: 'French', difficulty: 1, category: 'greetings' },
  { word: 'Salut', translation: 'Hi', language: 'French', difficulty: 1, category: 'greetings' },
  { word: 'Hola', translation: 'Hello', language: 'Spanish', difficulty: 1, category: 'greetings' },
  { word: 'Buenos dias', translation: 'Good morning', language: 'Spanish', difficulty: 1, category: 'greetings' },
  { word: 'Buenas noches', translation: 'Good night', language: 'Spanish', difficulty: 1, category: 'greetings' },
  { word: 'Guten Tag', translation: 'Good day', language: 'German', difficulty: 1, category: 'greetings' },
  { word: 'Konnichiwa', translation: 'Hello', language: 'Japanese', difficulty: 1, category: 'greetings' },
  // Food
  { word: 'pain', translation: 'bread', language: 'French', difficulty: 1, category: 'food' },
  { word: 'fromage', translation: 'cheese', language: 'French', difficulty: 2, category: 'food' },
  { word: 'poisson', translation: 'fish', language: 'French', difficulty: 2, category: 'food' },
  { word: 'manzana', translation: 'apple', language: 'Spanish', difficulty: 1, category: 'food' },
  { word: 'agua', translation: 'water', language: 'Spanish', difficulty: 1, category: 'food' },
  { word: 'Brot', translation: 'bread', language: 'German', difficulty: 1, category: 'food' },
  // Weather
  { word: 'il pleut', translation: 'it\'s raining', language: 'French', difficulty: 2, category: 'weather' },
  { word: 'il fait beau', translation: 'it\'s nice out', language: 'French', difficulty: 2, category: 'weather' },
  { word: 'hace calor', translation: 'it\'s hot', language: 'Spanish', difficulty: 2, category: 'weather' },
  { word: 'hace frio', translation: 'it\'s cold', language: 'Spanish', difficulty: 2, category: 'weather' },
  // Commerce
  { word: 'prix', translation: 'price', language: 'French', difficulty: 2, category: 'commerce' },
  { word: 'marche', translation: 'market', language: 'French', difficulty: 1, category: 'commerce' },
  { word: 'precio', translation: 'price', language: 'Spanish', difficulty: 2, category: 'commerce' },
  { word: 'tienda', translation: 'shop', language: 'Spanish', difficulty: 2, category: 'commerce' },
  // Expressions
  { word: 'c\'est la vie', translation: 'that\'s life', language: 'French', difficulty: 1, category: 'expressions' },
  { word: 'bon courage', translation: 'good luck / hang in there', language: 'French', difficulty: 2, category: 'expressions' },
  { word: 'asi es la vida', translation: 'that\'s life', language: 'Spanish', difficulty: 2, category: 'expressions' },
  { word: 'buen provecho', translation: 'enjoy your meal', language: 'Spanish', difficulty: 2, category: 'expressions' },
  // Work
  { word: 'travail', translation: 'work', language: 'French', difficulty: 2, category: 'work' },
  { word: 'outil', translation: 'tool', language: 'French', difficulty: 3, category: 'work' },
  { word: 'trabajo', translation: 'work', language: 'Spanish', difficulty: 2, category: 'work' },
  { word: 'herramienta', translation: 'tool', language: 'Spanish', difficulty: 3, category: 'work' },
  // Culture
  { word: 'fete', translation: 'festival', language: 'French', difficulty: 2, category: 'culture' },
  { word: 'musique', translation: 'music', language: 'French', difficulty: 1, category: 'culture' },
  { word: 'fiesta', translation: 'party / festival', language: 'Spanish', difficulty: 1, category: 'culture' },
  { word: 'musica', translation: 'music', language: 'Spanish', difficulty: 1, category: 'culture' },
];

// ── Configuration ──────────────────────────────────────────────────────────

export interface AmbientConversationConfig {
  /** Radius (world units) in which the player can overhear a conversation */
  overhearingRadius: number;
  /** Radius in which two NPCs can start a conversation with each other */
  npcConversationRadius: number;
  /** Minimum milliseconds between conversations for any given NPC */
  cooldownMs: number;
  /** Milliseconds between checking for new conversation opportunities */
  checkIntervalMs: number;
  /** Maximum simultaneous ambient conversations */
  maxSimultaneous: number;
  /** Milliseconds between each conversation line */
  lineDelayMs: number;
  /** Target language filter (empty = all languages) */
  targetLanguage: string;
  /** Maximum vocabulary difficulty to inject (1-5) */
  maxVocabularyDifficulty: number;
}

const DEFAULT_CONFIG: AmbientConversationConfig = {
  overhearingRadius: 25,
  npcConversationRadius: 8,
  cooldownMs: 45_000,
  checkIntervalMs: 6_000,
  maxSimultaneous: 3,
  lineDelayMs: 3_500,
  targetLanguage: '',
  maxVocabularyDifficulty: 3,
};

// ── System ─────────────────────────────────────────────────────────────────

export class AmbientConversationSystem {
  private config: AmbientConversationConfig;
  private eventBus: GameEventBus;

  // NPC registry
  private npcs: Map<string, AmbientNPC> = new Map();

  // Player tracking
  private playerMesh: Mesh | null = null;

  // Conversation state
  private activeConversations: Map<string, ActiveAmbientConversation> = new Map();
  private cooldowns: Map<string, number> = new Map(); // npcId -> timestamp of last conversation end

  // Vocabulary tracking for learning metrics
  private overheardVocabulary: Map<string, OverheardRecord> = new Map(); // word -> record
  private vocabularyPool: VocabularyItem[] = [...DEFAULT_VOCABULARY];

  // Topics & templates (extensible)
  private topics: ConversationTopic[] = [...DEFAULT_TOPICS];
  private templates: ConversationTemplate[] = [...DEFAULT_TEMPLATES];

  // Timers
  private checkTimer: number | null = null;
  private lineTimers: Map<string, number> = new Map(); // conversationId -> timer

  // Time-of-day provider (hour 0-23)
  private timeOfDayProvider: () => number = () => new Date().getHours();

  // Next conversation id counter
  private nextId: number = 1;

  constructor(eventBus: GameEventBus, config?: Partial<AmbientConversationConfig>) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Register an NPC for ambient conversation participation. */
  registerNPC(npc: AmbientNPC): void {
    this.npcs.set(npc.id, npc);
  }

  /** Unregister an NPC, ending any active conversation it participates in. */
  unregisterNPC(npcId: string): void {
    this.npcs.delete(npcId);
    this.cooldowns.delete(npcId);
    for (const [convId, conv] of Array.from(this.activeConversations.entries())) {
      if (conv.participants.includes(npcId)) {
        this.endConversation(convId);
      }
    }
  }

  /** Update NPC state (call when personality, relationships, location, or temp states change). */
  updateNPC(npcId: string, updates: Partial<AmbientNPC>): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      Object.assign(npc, updates);
    }
  }

  /** Set the player mesh for overhearing proximity checks. */
  setPlayerMesh(mesh: Mesh): void {
    this.playerMesh = mesh;
  }

  /** Provide a custom time-of-day function (returns hour 0-23). */
  setTimeOfDayProvider(fn: () => number): void {
    this.timeOfDayProvider = fn;
  }

  /** Add vocabulary items to the pool. */
  addVocabulary(items: VocabularyItem[]): void {
    this.vocabularyPool.push(...items);
  }

  /** Replace the entire vocabulary pool. */
  setVocabularyPool(items: VocabularyItem[]): void {
    this.vocabularyPool = items;
  }

  /** Add a custom conversation topic. */
  addTopic(topic: ConversationTopic): void {
    this.topics.push(topic);
  }

  /** Add a custom conversation template. */
  addTemplate(template: ConversationTemplate): void {
    this.templates.push(template);
  }

  /** Update configuration at runtime. */
  updateConfig(partial: Partial<AmbientConversationConfig>): void {
    const restartNeeded = partial.checkIntervalMs !== undefined && this.checkTimer !== null;
    Object.assign(this.config, partial);
    if (restartNeeded) {
      this.stop();
      this.start();
    }
  }

  /** Start the periodic check loop. */
  start(): void {
    if (this.checkTimer !== null) return;
    this.checkTimer = window.setInterval(() => {
      this.tick();
    }, this.config.checkIntervalMs);
  }

  /** Stop the periodic check loop and end all conversations. */
  stop(): void {
    if (this.checkTimer !== null) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    for (const timer of Array.from(this.lineTimers.values())) {
      window.clearTimeout(timer);
    }
    this.lineTimers.clear();
    for (const convId of Array.from(this.activeConversations.keys())) {
      this.endConversation(convId);
    }
  }

  /** Check if an NPC is currently in an ambient conversation. */
  isInConversation(npcId: string): boolean {
    return Array.from(this.activeConversations.values()).some(
      c => c.participants.includes(npcId)
    );
  }

  /** Get the count of active ambient conversations. */
  getActiveCount(): number {
    return this.activeConversations.size;
  }

  /** Get a snapshot of all overheard vocabulary with encounter counts. */
  getOverheardVocabulary(): OverheardRecord[] {
    return Array.from(this.overheardVocabulary.values());
  }

  /** Get overheard vocabulary filtered by language. */
  getOverheardVocabularyByLanguage(language: string): OverheardRecord[] {
    return Array.from(this.overheardVocabulary.values())
      .filter(r => r.language === language);
  }

  /** Dispose all resources. */
  dispose(): void {
    this.stop();
    this.npcs.clear();
    this.cooldowns.clear();
    this.overheardVocabulary.clear();
  }

  /** Serialize state for save/load. */
  serialize(): AmbientConversationSaveData {
    return {
      overheardVocabulary: Array.from(this.overheardVocabulary.entries()),
      cooldowns: Array.from(this.cooldowns.entries()),
      nextId: this.nextId,
    };
  }

  /** Deserialize previously saved state. */
  deserialize(data: AmbientConversationSaveData): void {
    if (data.overheardVocabulary) {
      this.overheardVocabulary = new Map(data.overheardVocabulary);
    }
    if (data.cooldowns) {
      this.cooldowns = new Map(data.cooldowns);
    }
    if (data.nextId) {
      this.nextId = data.nextId;
    }
  }

  // ── Core Loop ───────────────────────────────────────────────────────────

  /** Main tick: update overhearing status and attempt new conversations. */
  private tick(): void {
    this.updateOverhearingStatus();
    this.tryStartConversations();
  }

  /** Update which active conversations the player can overhear. */
  private updateOverhearingStatus(): void {
    if (!this.playerMesh) return;
    const playerPos = this.playerMesh.position;

    for (const conv of Array.from(this.activeConversations.values())) {
      const npcA = this.npcs.get(conv.participants[0]);
      const npcB = this.npcs.get(conv.participants[1]);
      if (!npcA || !npcB) continue;
      const midpoint = Vector3.Center(npcA.mesh.position, npcB.mesh.position);
      const dist = Vector3.Distance(playerPos, midpoint);
      conv.playerOverhearing = dist <= this.config.overhearingRadius;
    }
  }

  /** Attempt to start new conversations between eligible NPC pairs. */
  private tryStartConversations(): void {
    if (this.activeConversations.size >= this.config.maxSimultaneous) return;
    const now = Date.now();
    const hour = this.timeOfDayProvider();

    // Collect available NPCs
    const available: AmbientNPC[] = [];
    for (const npc of Array.from(this.npcs.values())) {
      if (this.isInConversation(npc.id)) continue;
      const lastEnd = this.cooldowns.get(npc.id) || 0;
      if (now - lastEnd < this.config.cooldownMs) continue;
      available.push(npc);
    }
    if (available.length < 2) return;

    // Score all eligible pairs
    const pairs: Array<{ a: AmbientNPC; b: AmbientNPC; score: number }> = [];
    for (let i = 0; i < available.length - 1; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const a = available[i];
        const b = available[j];
        // Proximity check
        const dist = Vector3.Distance(a.mesh.position, b.mesh.position);
        if (dist > this.config.npcConversationRadius) continue;

        const score = this.scorePair(a, b, hour);
        if (score > 0) {
          pairs.push({ a, b, score });
        }
      }
    }

    if (pairs.length === 0) return;

    // Sort by score descending, pick top candidate with random gate
    pairs.sort((x, y) => y.score - x.score);
    for (const pair of pairs) {
      if (this.activeConversations.size >= this.config.maxSimultaneous) break;
      // Probabilistic gate: higher score = higher chance
      const chance = Math.min(0.6, pair.score / 3);
      if (Math.random() < chance) {
        this.startConversation(pair.a, pair.b, hour);
      }
    }
  }

  /** Score how likely two NPCs are to converse right now. */
  private scorePair(a: AmbientNPC, b: AmbientNPC, hour: number): number {
    let score = 0;

    // 1. Relationship strength (friends talk more)
    const relAtoB = a.relationships[b.id];
    const relBtoA = b.relationships[a.id];
    const avgCharge = ((relAtoB?.charge ?? 0) + (relBtoA?.charge ?? 0)) / 2;
    if (avgCharge < -30) return 0; // too hostile
    score += Math.max(0, avgCharge / 50); // 0 to 2

    // 2. Extroversion boost
    const avgExtro = (a.personality.extroversion + b.personality.extroversion) / 2;
    score += avgExtro * 0.8; // 0 to 0.8

    // 3. Agreeableness boost
    const avgAgree = (a.personality.agreeableness + b.personality.agreeableness) / 2;
    score += avgAgree * 0.3;

    // 4. Emotional state modifiers
    const statesA = new Set(a.temporaryStates || []);
    const statesB = new Set(b.temporaryStates || []);
    // Sociable states boost
    const sociableStates: StateType[] = ['excited', 'grateful', 'inspired'];
    for (const s of sociableStates) {
      if (statesA.has(s)) score += 0.4;
      if (statesB.has(s)) score += 0.4;
    }
    // Anti-social states penalize
    const antisocialStates: StateType[] = ['angry', 'fearful', 'grieving', 'exhausted'];
    for (const s of antisocialStates) {
      if (statesA.has(s)) score -= 0.5;
      if (statesB.has(s)) score -= 0.5;
    }

    // 5. Same location bonus
    if (a.currentLocation === b.currentLocation) {
      score += 0.3;
    }

    // 6. Time-of-day sociability curve (peak at noon and early evening)
    if ((hour >= 10 && hour <= 14) || (hour >= 17 && hour <= 20)) {
      score += 0.3;
    } else if (hour < 7 || hour > 22) {
      score -= 0.4; // late night / early morning
    }

    return Math.max(0, score);
  }

  // ── Conversation Lifecycle ──────────────────────────────────────────────

  /** Start a new conversation between two NPCs. */
  private startConversation(npcA: AmbientNPC, npcB: AmbientNPC, hour: number): void {
    const topic = this.selectTopic(npcA, npcB, hour);
    if (!topic) return;

    const template = this.selectTemplate(topic.id);
    if (!template) return;

    const { renderedLines, vocabulary } = this.renderTemplate(template, npcA.id, npcB.id);

    const convId = `ambient_${this.nextId++}`;
    const locationId = npcA.currentLocation || 'unknown';

    const conversation: ActiveAmbientConversation = {
      id: convId,
      templateId: template.id,
      topicId: topic.id,
      participants: [npcA.id, npcB.id],
      locationId,
      startTime: Date.now(),
      currentLineIndex: 0,
      renderedLines,
      injectedVocabulary: vocabulary,
      playerOverhearing: this.isPlayerNear(npcA, npcB),
      isComplete: false,
    };

    this.activeConversations.set(convId, conversation);

    this.eventBus.emit({
      type: 'ambient_conversation_started',
      conversationId: convId,
      participants: [npcA.id, npcB.id],
      locationId,
      topic: topic.name,
    });

    // Begin playing lines
    this.advanceLine(convId);
  }

  /** Advance to the next line of the conversation, scheduling the following line. */
  private advanceLine(convId: string): void {
    const conv = this.activeConversations.get(convId);
    if (!conv || conv.isComplete) return;

    if (conv.currentLineIndex >= conv.renderedLines.length) {
      this.completeConversation(convId);
      return;
    }

    const line = conv.renderedLines[conv.currentLineIndex];

    // If player is overhearing and line has vocabulary, track it
    if (conv.playerOverhearing && line.vocabularyItem) {
      this.recordOverheardVocabulary(line.vocabularyItem, convId, line.speakerId);
    }

    conv.currentLineIndex++;

    // Schedule next line
    if (conv.currentLineIndex < conv.renderedLines.length) {
      const timer = window.setTimeout(() => {
        this.lineTimers.delete(convId);
        this.advanceLine(convId);
      }, this.config.lineDelayMs);
      this.lineTimers.set(convId, timer);
    } else {
      // Schedule completion after last line's display time
      const timer = window.setTimeout(() => {
        this.lineTimers.delete(convId);
        this.completeConversation(convId);
      }, this.config.lineDelayMs);
      this.lineTimers.set(convId, timer);
    }
  }

  /** Mark conversation complete and clean up. */
  private completeConversation(convId: string): void {
    const conv = this.activeConversations.get(convId);
    if (!conv) return;

    conv.isComplete = true;
    const durationMs = Date.now() - conv.startTime;

    this.eventBus.emit({
      type: 'ambient_conversation_ended',
      conversationId: convId,
      participants: conv.participants,
      durationMs,
      vocabularyCount: conv.injectedVocabulary.length,
    });

    // Set cooldowns for participants
    const now = Date.now();
    this.cooldowns.set(conv.participants[0], now);
    this.cooldowns.set(conv.participants[1], now);

    this.activeConversations.delete(convId);
  }

  /** Force-end a conversation (e.g. NPC unregistered). */
  private endConversation(convId: string): void {
    const timer = this.lineTimers.get(convId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.lineTimers.delete(convId);
    }
    this.completeConversation(convId);
  }

  // ── Topic & Template Selection ──────────────────────────────────────────

  /** Select the best topic for a pair given their state and context. */
  private selectTopic(a: AmbientNPC, b: AmbientNPC, hour: number): ConversationTopic | null {
    const avgCharge = ((a.relationships[b.id]?.charge ?? 0) + (b.relationships[a.id]?.charge ?? 0)) / 2;
    const statesA = new Set(a.temporaryStates || []);
    const statesB = new Set(b.temporaryStates || []);
    const location = a.currentLocation.toLowerCase();

    const weighted: Array<{ topic: ConversationTopic; weight: number }> = [];

    for (const topic of this.topics) {
      // Relationship gate
      if (avgCharge < topic.minRelationshipCharge) continue;

      let weight = topic.baseWeight;

      // Location match bonus
      if (topic.locationTags.length > 0) {
        const locationMatch = topic.locationTags.some(tag => location.includes(tag));
        if (locationMatch) {
          weight *= 1.5;
        } else {
          weight *= 0.5;
        }
      }

      // Time-of-day match
      if (topic.timeWindows.length > 0) {
        const timeMatch = topic.timeWindows.some(([start, end]) => hour >= start && hour <= end);
        if (timeMatch) {
          weight *= 1.4;
        } else {
          weight *= 0.6;
        }
      }

      // Emotional state boosts
      for (const s of topic.boostedByStates) {
        if (statesA.has(s) || statesB.has(s)) weight *= 1.3;
      }
      for (const s of topic.suppressedByStates) {
        if (statesA.has(s) || statesB.has(s)) weight *= 0.4;
      }

      if (weight > 0.1) {
        weighted.push({ topic, weight });
      }
    }

    if (weighted.length === 0) return null;

    // Weighted random selection
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.topic;
    }
    return weighted[weighted.length - 1].topic;
  }

  /** Select a random template for the given topic. */
  private selectTemplate(topicId: string): ConversationTemplate | null {
    const matching = this.templates.filter(t => t.topicId === topicId);
    if (matching.length === 0) return null;
    return matching[Math.floor(Math.random() * matching.length)];
  }

  // ── Template Rendering ──────────────────────────────────────────────────

  /** Render a template by filling vocabulary slots and assigning speaker IDs. */
  private renderTemplate(
    template: ConversationTemplate,
    npcAId: string,
    npcBId: string,
  ): { renderedLines: RenderedLine[]; vocabulary: VocabularyItem[] } {
    const usedVocab: VocabularyItem[] = [];
    const renderedLines: RenderedLine[] = [];
    const usedWords = new Set<string>();

    for (const line of template.lines) {
      const speakerId = line.speakerSlot === 'A' ? npcAId : npcBId;

      if (line.vocabularySlot && usedVocab.length < template.maxVocabularySlots) {
        const vocabItem = this.pickVocabulary(line.vocabularyCategory || '', usedWords);
        if (vocabItem) {
          usedWords.add(vocabItem.word);
          usedVocab.push(vocabItem);
          const text = line.template
            .replace('{vocab}', vocabItem.word)
            .replace('{translation}', vocabItem.translation);
          renderedLines.push({ speakerId, text, vocabularyItem: vocabItem });
          continue;
        }
      }

      // No vocabulary injection for this line
      const text = line.template
        .replace('{vocab}', '')
        .replace('{translation}', '')
        .replace(/\s*\(\s*\)/g, '') // clean empty parens
        .replace(/\s{2,}/g, ' ')
        .trim();
      renderedLines.push({ speakerId, text, vocabularyItem: null });
    }

    return { renderedLines, vocabulary: usedVocab };
  }

  /** Pick a vocabulary item from the pool, respecting filters. */
  private pickVocabulary(category: string, excludeWords: Set<string>): VocabularyItem | null {
    let candidates = this.vocabularyPool.filter(v => {
      if (excludeWords.has(v.word)) return false;
      if (v.difficulty > this.config.maxVocabularyDifficulty) return false;
      if (this.config.targetLanguage && v.language !== this.config.targetLanguage) return false;
      if (category && v.category !== category) return false;
      return true;
    });

    // Fallback: relax category constraint
    if (candidates.length === 0 && category) {
      candidates = this.vocabularyPool.filter(v => {
        if (excludeWords.has(v.word)) return false;
        if (v.difficulty > this.config.maxVocabularyDifficulty) return false;
        if (this.config.targetLanguage && v.language !== this.config.targetLanguage) return false;
        return true;
      });
    }

    if (candidates.length === 0) return null;

    // Prefer less-seen vocabulary (spaced repetition effect)
    candidates.sort((a, b) => {
      const countA = this.overheardVocabulary.get(a.word)?.encounterCount ?? 0;
      const countB = this.overheardVocabulary.get(b.word)?.encounterCount ?? 0;
      return countA - countB;
    });

    // Pick from the least-seen third with some randomness
    const sliceEnd = Math.max(1, Math.ceil(candidates.length / 3));
    const pool = candidates.slice(0, sliceEnd);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Vocabulary Tracking ─────────────────────────────────────────────────

  /** Record that the player overheard a vocabulary word. */
  private recordOverheardVocabulary(
    item: VocabularyItem,
    conversationId: string,
    speakerNpcId: string,
  ): void {
    const existing = this.overheardVocabulary.get(item.word);
    if (existing) {
      existing.encounterCount++;
      existing.lastEncountered = Date.now();
    } else {
      this.overheardVocabulary.set(item.word, {
        word: item.word,
        translation: item.translation,
        language: item.language,
        category: item.category,
        difficulty: item.difficulty,
        encounterCount: 1,
        firstEncountered: Date.now(),
        lastEncountered: Date.now(),
      });
    }

    this.eventBus.emit({
      type: 'vocabulary_overheard',
      word: item.word,
      translation: item.translation,
      language: item.language,
      context: `Overheard in ambient NPC conversation`,
      conversationId,
      speakerNpcId,
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Check if the player is near the midpoint of two NPCs. */
  private isPlayerNear(a: AmbientNPC, b: AmbientNPC): boolean {
    if (!this.playerMesh) return false;
    const midpoint = Vector3.Center(a.mesh.position, b.mesh.position);
    return Vector3.Distance(this.playerMesh.position, midpoint) <= this.config.overhearingRadius;
  }
}

// ── Supporting Types ────────────────────────────────────────────────────────

/** Tracking record for a single overheard vocabulary word. */
export interface OverheardRecord {
  word: string;
  translation: string;
  language: string;
  category: string;
  difficulty: number;
  encounterCount: number;
  firstEncountered: number;
  lastEncountered: number;
}

/** Serializable save data. */
export interface AmbientConversationSaveData {
  overheardVocabulary: Array<[string, OverheardRecord]>;
  cooldowns: Array<[string, number]>;
  nextId: number;
}
