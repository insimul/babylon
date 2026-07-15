/**
 * Quest Object Manager
 *
 * Manages interactive quest objects, NPCs, locations, and objectives in the 3D world.
 * Connects procedurally generated quests with actual game entities.
 */

import { Scene, Mesh, MeshBuilder, Vector3, StandardMaterial, Color3, Color4, Animation, ActionManager, ExecuteCodeAction, ParticleSystem, DynamicTexture } from '@babylonjs/core';
import { MARKER_STYLES } from '../logic/QuestMarkerService';

import * as GUI from '@babylonjs/gui';
import { ProceduralQuestObjects } from './ProceduralQuestObjects';
import { VisualVocabularyDetector, type VocabularyTarget, type IdentificationPrompt, type IdentificationResult } from '../logic/VisualVocabularyDetector';
import { QuestCompletionEngine, type CollectedItemMatch } from '../logic/QuestCompletionEngine';
import type { GameEventBus } from '../logic/GameEventBus';
import { isConversationOnlyQuest } from '@shared/quest-objective-types';

// Quest objective types that can be spawned/tracked in the world
export type QuestObjectiveType =
  // Language learning — conversation
  | 'collect_item'      // Physical object to collect
  | 'visit_location'    // Location marker to visit
  | 'talk_to_npc'       // NPC to talk to
  | 'use_vocabulary'    // Vocabulary words to use in conversation
  | 'collect_vocabulary' // Collect vocabulary words from labeled world objects
  | 'complete_conversation' // Conversation turns to complete
  | 'perform_action'    // Social action to perform
  // RPG
  | 'defeat_enemies'    // Defeat a certain number of enemies
  | 'collect_items'     // Collect items (same as collect_item but plural)
  | 'reach_location'    // Reach a specific location
  | 'discover_location' // Discover/explore a location
  | 'escort_npc'        // Escort NPC to destination
  | 'deliver_item'      // Deliver item to NPC/location
  | 'craft_item'        // Craft specific items
  | 'gain_reputation'    // Gain reputation with faction
  // Language learning — structured exercises
  | 'identify_object'   // Visual vocabulary: identify an object by its target-language name
  | 'follow_directions' // Follow multi-step instructions given in the target language
  | 'find_vocabulary_items' // Scavenger hunt: find objects matching target-language words
  | 'pronunciation_check' // Pronounce phrases aloud and get accuracy feedback
  // Language learning — advanced exercises
  | 'listening_comprehension' // Listen to NPC speech, answer comprehension questions
  | 'translation_challenge'   // Translate text between languages
  | 'navigate_language'       // Navigate the world following target-language directions
  // Language learning — composition
  | 'write_response'          // Write text in target language in response to a prompt
  | 'describe_scene'          // Describe current scene in target language
  // Investigation / narrative
  | 'collect_clue'            // Collect clue items for investigation quests
  | 'read_text'               // Read a specific text/document
  | 'find_text'               // Find a specific text/document
  // Physical / commerce
  | 'physical_action'         // Perform physical action at hotspot (fishing, mining, etc.)
  | 'buy_item';               // Purchase item from merchant

export interface QuestObjective {
  id: string;
  questId: string;
  type: QuestObjectiveType;
  description: string;
  completed: boolean;

  // For collect_item
  itemName?: string;
  itemModel?: string;
  itemCount?: number;
  collectedCount?: number;
  spawnPositions?: Vector3[];

  // For visit_location
  locationName?: string;
  locationPosition?: Vector3;
  locationRadius?: number;
  /** If set, the location is inside this building's interior */
  buildingId?: string;

  // For talk_to_npc
  npcId?: string;
  npcName?: string;
  requiredDialogue?: string[];

  // For vocabulary/conversation
  targetWords?: string[];
  wordsUsed?: string[];
  requiredCount?: number;
  currentCount?: number;

  // For perform_action
  actionId?: string;
  actionName?: string;
  targetNpcId?: string;

  // For defeat_enemies
  enemyType?: string;
  enemiesDefeated?: number;
  enemiesRequired?: number;

  // For craft_item
  craftedItemId?: string;
  craftedCount?: number;

  // For escort/deliver
  escortNpcId?: string;
  destinationPosition?: Vector3;
  arrived?: boolean;
  delivered?: boolean;

  // For reputation
  factionId?: string;
  reputationGained?: number;
  reputationRequired?: number;

  // For language learning exercises
  targetLanguageWord?: string;  // The word in the target language to identify/find
  englishMeaning?: string;      // English translation for hint
  vocabularyList?: { word: string; meaning: string }[];  // For scavenger hunts
  stepsCompleted?: number;      // For follow_directions / navigate_language
  stepsRequired?: number;       // For follow_directions / navigate_language
  directionSteps?: { instruction: string; targetPosition?: Vector3 }[];  // Multi-step directions

  // For listening_comprehension
  listeningStoryNpcId?: string;       // NPC who tells the story
  comprehensionQuestions?: { question: string; correctAnswer: string }[];
  questionsAnswered?: number;
  questionsCorrect?: number;

  // For translation_challenge
  translationPhrases?: { source: string; expected: string; language: string }[];
  translationsCompleted?: number;
  translationsCorrect?: number;

  // For navigate_language
  navigationInstructions?: string;   // Full instruction text in target language
  navigationWaypoints?: { instruction: string; targetPosition?: Vector3 }[];
  waypointsReached?: number;

  // Advanced follow_directions / navigate_language
  timeLimitSeconds?: number;         // Time limit for completing the objective
  startedAt?: number;                // Timestamp when objective was started (ms)
  hintsRequested?: number;           // Number of English hints requested
  showWaypoint?: boolean;            // Whether GPS-style waypoint is shown (only on hint request)

  // For scavenger hunt category rotation
  vocabularyCategory?: string;       // Current category for vocabulary scavenger hunt

  // For write_response / describe_scene
  writingPrompt?: string;            // The composition prompt to display
  writtenResponses?: string[];       // Submitted responses
  minWordCount?: number;             // Minimum word count required per response

  // Declarative completion trigger (from QuestCompletionEngine)
  completionTrigger?: string;
}

export interface Quest {
  id: string;
  worldId: string;
  title: string;
  description: string;
  questType: string;
  difficulty: string;
  status: string;
  objectives: QuestObjective[];
  progress: Record<string, any>;
  completionCriteria: Record<string, any>;
  assignedTo?: string;
  assignedBy?: string;
  assignedByCharacterId?: string;
  conversationOnly?: boolean;
}

interface QuestObject {
  mesh: Mesh;
  label?: GUI.AdvancedDynamicTexture;
  questId: string;
  objectiveId: string;
  type: QuestObjectiveType;
  isCollected: boolean;
}

export class QuestObjectManager {
  private scene: Scene;
  private questObjects: Map<string, QuestObject> = new Map();
  private locationMarkers: Map<string, Mesh> = new Map();
  private activeQuests: Quest[] = [];

  // Quest object model templates loaded from asset collection
  private questModelTemplates: Map<string, Mesh> = new Map();

  // Procedural mesh generator for quest objects
  private proceduralObjects: ProceduralQuestObjects;

  // Visual vocabulary detection
  private visualVocabDetector: VisualVocabularyDetector;

  // Unified completion engine (pure logic, no Babylon deps)
  private completionEngine: QuestCompletionEngine;

  // Event bus for emitting game events
  private eventBus?: GameEventBus;

  // Callbacks
  private onObjectCollected?: (questId: string, objectiveId: string) => void;
  private onLocationVisited?: (questId: string, objectiveId: string) => void;
  private onObjectiveCompleted?: (questId: string, objectiveId: string) => void;
  private onObjectiveProgress?: (questId: string, objectiveId: string, current: number, required: number, objectiveType: string) => void;
  private onQuestItemCollected?: (questId: string, objectiveId: string, itemName: string) => void;
  private onStoryTTS?: (text: string, npcId?: string) => void;
  private onIdentificationPrompt?: (prompt: IdentificationPrompt) => void;
  /** Check whether a world-space XZ point falls inside a building footprint. */
  private isPointInBuilding?: (x: number, z: number) => boolean;
  /** Resolve a location name to a world position (for spawning quest items at named locations) */
  private resolveLocationPosition?: (locationName: string) => Vector3 | null;

  /** Current building the player is inside (null if outside) */
  private currentBuildingId: string | null = null;
  /** Saved overworld positions for markers moved to interior space */
  private savedMarkerPositions: Map<string, Vector3> = new Map();
  /** Ground-level target positions for proximity checking (not raised like the visual marker) */
  private locationGroundPositions: Map<string, Vector3> = new Map();
  /** Toast notification callback */
  private showToast?: (title: string, description?: string) => void;

  constructor(scene: Scene, eventBus?: GameEventBus) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.proceduralObjects = new ProceduralQuestObjects(scene);
    this.completionEngine = new QuestCompletionEngine();

    // Wire engine callbacks back to this manager
    this.completionEngine.setOnObjectiveCompleted((questId, objectiveId) => {
      this.onObjectiveCompleted?.(questId, objectiveId);
    });
    this.completionEngine.setOnObjectiveProgress((questId, objectiveId, current, required, objectiveType) => {
      this.onObjectiveProgress?.(questId, objectiveId, current, required, objectiveType);
    });
    this.completionEngine.setOnQuestCompleted((questId) => {
      this.completeQuest(questId);
    });

    this.visualVocabDetector = new VisualVocabularyDetector(eventBus);
    this.visualVocabDetector.setOnObjectiveCompleted((questId, objectiveId) => {
      this.completionEngine.completeObjective(questId, objectiveId);
    });
  }

  /** Get the underlying completion engine for direct access or testing. */
  public getCompletionEngine(): QuestCompletionEngine {
    return this.completionEngine;
  }

  /**
   * Register a quest object model template for a specific role
   * @param role - The role identifier (e.g., 'collectible', 'marker', 'container')
   * @param mesh - The mesh template to use for this role
   */
  public registerQuestModelTemplate(role: string, mesh: Mesh): void {
    mesh.setEnabled(false);
    this.questModelTemplates.set(role, mesh);
    // console.log(`[QuestObjectManager] Registered quest model template for role: ${role}`);
  }

  /**
   * Hide all template prototype meshes after world generation.
   * Moves them off-screen so disabled PBR templates don't render as artifacts.
   */
  public hidePrototypes(): void {
    this.questModelTemplates.forEach((mesh) => {
      if (mesh && !mesh.isDisposed()) {
        mesh.position.y = -10000;
        mesh.setEnabled(false);
        mesh.isVisible = false;
        mesh.isPickable = false;
        mesh.getChildMeshes().forEach((c) => {
          c.setEnabled(false);
          c.isVisible = false;
          c.isPickable = false;
        });
      }
    });
  }

  /**
   * Get a quest object model template by role
   */
  private getQuestModelTemplate(role: string): Mesh | null {
    return this.questModelTemplates.get(role) || null;
  }

  /**
   * Load and spawn objects for a quest
   */
  public async loadQuest(quest: Quest) {

    // Add to active quests
    this.activeQuests.push(quest);

    // Register with completion engine
    this.completionEngine.addQuest(quest);

    // Parse and spawn objectives from quest data
    const objectives = this.parseQuestObjectives(quest);

    // Conversation-only quests skip physical object spawning entirely —
    // all objectives are completed through NPC dialogue
    const questObjectives = quest.objectives as Array<{ type: string }> | undefined;
    const convOnly = quest.conversationOnly || (questObjectives && isConversationOnlyQuest(questObjectives));
    if (convOnly) {
      // console.log(`[QuestObjectManager] Conversation-only quest "${quest.title}" — skipping physical object spawning`);
      return;
    }

    for (const objective of objectives) {
      await this.spawnObjective(objective);
    }
  }

  /**
   * Parse quest data to extract objectives
   */
  private parseQuestObjectives(quest: Quest): QuestObjective[] {
    const objectives: QuestObjective[] = [];

    // Check completion criteria for collectible items
    if (quest.completionCriteria?.type === 'collect_items') {
      const itemNames = quest.completionCriteria.items || [];
      itemNames.forEach((itemName: string, index: number) => {
        objectives.push({
          id: `${quest.id}_collect_${index}`,
          questId: quest.id,
          type: 'collect_item',
          description: `Collect ${itemName}`,
          completed: false,
          itemName,
          itemCount: 1,
          collectedCount: 0,
          spawnPositions: this.generateSpawnPositions(1)
        });
      });
    }

    // Check for deliver_item objectives
    if (quest.completionCriteria?.type === 'deliver_item') {
      objectives.push({
        id: `${quest.id}_deliver`,
        questId: quest.id,
        type: 'deliver_item',
        description: quest.completionCriteria.description || `Deliver ${quest.completionCriteria.itemName} to ${quest.completionCriteria.targetNpc}`,
        completed: false,
        itemName: quest.completionCriteria.itemName,
        npcId: quest.completionCriteria.targetNpcId,
        npcName: quest.completionCriteria.targetNpc,
        delivered: false,
      });
    }

    // Check for vocabulary objectives
    if (quest.completionCriteria?.type === 'vocabulary_usage') {
      objectives.push({
        id: `${quest.id}_vocab`,
        questId: quest.id,
        type: 'use_vocabulary',
        description: quest.completionCriteria.description || 'Use vocabulary words',
        completed: false,
        targetWords: quest.completionCriteria.targetWords || [],
        wordsUsed: quest.progress?.wordsUsed || [],
        requiredCount: quest.completionCriteria.requiredCount || 10,
        currentCount: quest.progress?.currentCount || 0
      });
    }

    // Check for conversation objectives
    if (quest.completionCriteria?.type === 'conversation_turns') {
      objectives.push({
        id: `${quest.id}_conversation`,
        questId: quest.id,
        type: 'complete_conversation',
        description: quest.completionCriteria.description || 'Complete conversation',
        completed: false,
        targetWords: quest.completionCriteria.keywords || [],
        requiredCount: quest.completionCriteria.requiredTurns || 5,
        currentCount: quest.progress?.turnsCompleted || 0
      });
    }

    // Check for defeat_enemies objectives
    if (quest.completionCriteria?.type === 'defeat_enemies') {
      objectives.push({
        id: `${quest.id}_defeat`,
        questId: quest.id,
        type: 'defeat_enemies',
        description: quest.completionCriteria.description || `Defeat ${quest.completionCriteria.count || 1} ${quest.completionCriteria.enemyType || 'enemies'}`,
        completed: false,
        enemyType: quest.completionCriteria.enemyType,
        enemiesDefeated: 0,
        enemiesRequired: quest.completionCriteria.count || 1,
        spawnPositions: this.generateSpawnPositions(1),
      });
    }

    // Check for craft_item objectives
    if (quest.completionCriteria?.type === 'craft_item') {
      objectives.push({
        id: `${quest.id}_craft`,
        questId: quest.id,
        type: 'craft_item',
        description: quest.completionCriteria.description || `Craft ${quest.completionCriteria.itemName}`,
        completed: false,
        craftedItemId: quest.completionCriteria.itemName,
        craftedCount: 0,
        requiredCount: quest.completionCriteria.count || 1,
      });
    }

    // Check for discover_location objectives
    if (quest.completionCriteria?.type === 'discover_location') {
      objectives.push({
        id: `${quest.id}_discover`,
        questId: quest.id,
        type: 'discover_location',
        description: quest.completionCriteria.description || `Discover ${quest.completionCriteria.locationName}`,
        completed: false,
        locationName: quest.completionCriteria.locationId || quest.completionCriteria.locationName,
      });
    }

    // Check for escort_npc objectives
    if (quest.completionCriteria?.type === 'escort_npc') {
      const destPos = quest.completionCriteria.destinationX !== undefined
        ? new Vector3(quest.completionCriteria.destinationX, 0, quest.completionCriteria.destinationZ)
        : this.generateLocationPosition();
      objectives.push({
        id: `${quest.id}_escort`,
        questId: quest.id,
        type: 'escort_npc',
        description: quest.completionCriteria.description || `Escort ${quest.completionCriteria.npcName} to destination`,
        completed: false,
        escortNpcId: quest.completionCriteria.npcId,
        npcName: quest.completionCriteria.npcName,
        arrived: false,
        destinationPosition: destPos,
        locationRadius: quest.completionCriteria.arrivalRadius || 8,
      });
    }

    // Check for gain_reputation objectives
    if (quest.completionCriteria?.type === 'gain_reputation') {
      objectives.push({
        id: `${quest.id}_reputation`,
        questId: quest.id,
        type: 'gain_reputation',
        description: quest.completionCriteria.description || `Gain reputation with ${quest.completionCriteria.factionId}`,
        completed: false,
        factionId: quest.completionCriteria.factionId,
        reputationGained: 0,
        reputationRequired: quest.completionCriteria.amount || 100,
      });
    }

    // Check for identify_object objectives (visual vocabulary)
    if (quest.completionCriteria?.type === 'identify_object') {
      const items = quest.completionCriteria.objects || [];
      items.forEach((obj: any, index: number) => {
        objectives.push({
          id: `${quest.id}_identify_${index}`,
          questId: quest.id,
          type: 'identify_object',
          description: obj.description || `Find the "${obj.targetWord}"`,
          completed: false,
          targetLanguageWord: obj.targetWord,
          englishMeaning: obj.meaning,
          itemName: obj.meaning, // Use English name for label matching
          spawnPositions: this.generateSpawnPositions(1),
        });
      });
    }

    // Check for follow_directions objectives
    if (quest.completionCriteria?.type === 'follow_directions') {
      const steps = quest.completionCriteria.steps || [];
      objectives.push({
        id: `${quest.id}_directions`,
        questId: quest.id,
        type: 'follow_directions',
        description: quest.completionCriteria.description || 'Follow the directions',
        completed: false,
        stepsCompleted: 0,
        stepsRequired: steps.length || 1,
        directionSteps: steps.map((step: any) => ({
          instruction: step.instruction,
          targetPosition: step.x !== undefined ? new Vector3(step.x, 0, step.z) : this.generateLocationPosition(),
        })),
      });
    }

    // Check for find_vocabulary_items objectives (scavenger hunt)
    if (quest.completionCriteria?.type === 'find_vocabulary_items') {
      const vocabList: { word: string; meaning: string }[] = quest.completionCriteria.vocabularyList || [];
      vocabList.forEach((item, index) => {
        objectives.push({
          id: `${quest.id}_vocab_find_${index}`,
          questId: quest.id,
          type: 'find_vocabulary_items',
          description: `Find: "${item.word}" (${item.meaning})`,
          completed: false,
          targetLanguageWord: item.word,
          englishMeaning: item.meaning,
          itemName: item.meaning,
          spawnPositions: this.generateSpawnPositions(1),
        });
      });
    }

    // Check for listening_comprehension objectives
    if (quest.completionCriteria?.type === 'listening_comprehension') {
      const questions = quest.completionCriteria.questions || [];
      objectives.push({
        id: `${quest.id}_listening`,
        questId: quest.id,
        type: 'listening_comprehension',
        description: quest.completionCriteria.description || 'Listen to the NPC and answer questions',
        completed: false,
        listeningStoryNpcId: quest.completionCriteria.storyNpcId || quest.assignedByCharacterId,
        comprehensionQuestions: questions.map((q: any) => ({
          question: q.question,
          correctAnswer: q.correctAnswer || q.answer,
        })),
        questionsAnswered: 0,
        questionsCorrect: 0,
        requiredCount: questions.length || 3,
        currentCount: 0,
        npcId: quest.completionCriteria.answerNpcId || quest.completionCriteria.storyNpcId,
        npcName: quest.completionCriteria.answerNpcName,
      });
    }

    // Check for translation_challenge objectives
    if (quest.completionCriteria?.type === 'translation_challenge') {
      const phrases = quest.completionCriteria.phrases || [];
      objectives.push({
        id: `${quest.id}_translation`,
        questId: quest.id,
        type: 'translation_challenge',
        description: quest.completionCriteria.description || 'Translate the phrases',
        completed: false,
        translationPhrases: phrases.map((p: any) => ({
          source: p.source || p.text,
          expected: p.expected || p.translation,
          language: p.language || 'target',
        })),
        translationsCompleted: 0,
        translationsCorrect: 0,
        requiredCount: phrases.length || 3,
        currentCount: 0,
      });
    }

    // Check for navigate_language objectives
    if (quest.completionCriteria?.type === 'navigate_language') {
      const waypoints = quest.completionCriteria.waypoints || quest.completionCriteria.steps || [];
      objectives.push({
        id: `${quest.id}_navigate`,
        questId: quest.id,
        type: 'navigate_language',
        description: quest.completionCriteria.description || 'Follow directions in the target language',
        completed: false,
        navigationInstructions: quest.completionCriteria.instructions,
        navigationWaypoints: waypoints.map((wp: any) => ({
          instruction: wp.instruction || wp.direction,
          targetPosition: wp.x !== undefined ? new Vector3(wp.x, 0, wp.z) : this.generateLocationPosition(),
        })),
        waypointsReached: 0,
        stepsCompleted: 0,
        stepsRequired: waypoints.length || 1,
      });
    }

    // Check for NPC talk objectives
    if (quest.assignedByCharacterId) {
      objectives.push({
        id: `${quest.id}_talk_npc`,
        questId: quest.id,
        type: 'talk_to_npc',
        description: `Talk to ${quest.assignedBy}`,
        completed: false,
        npcId: quest.assignedByCharacterId,
        npcName: quest.assignedBy
      });
    }

    // Parse objectives array if it exists
    if (quest.objectives && Array.isArray(quest.objectives)) {
      quest.objectives.forEach((obj: any, index: number) => {
        // Type-based parsing for seed-generated objectives with explicit type fields
        if (obj.type === 'follow_directions' && obj.directionSteps) {
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'follow_directions',
            description: obj.description || 'Follow the directions',
            completed: obj.isCompleted || obj.completed || false,
            stepsCompleted: obj.stepsCompleted || 0,
            stepsRequired: obj.stepsRequired || obj.directionSteps.length,
            directionSteps: obj.directionSteps.map((step: any) => ({
              instruction: step.instruction,
              englishHint: step.englishHint,
              locationName: step.locationName,
              targetPosition: this.toVector3(step.targetPosition || step.locationPosition),
            })),
            completionTrigger: obj.completionTrigger,
          });
          return;
        }
        if (obj.type === 'navigate_language' && obj.navigationWaypoints) {
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'navigate_language',
            description: obj.description || 'Follow directions in the target language',
            completed: obj.isCompleted || obj.completed || false,
            navigationInstructions: obj.navigationInstructions,
            navigationWaypoints: obj.navigationWaypoints.map((wp: any) => ({
              instruction: wp.instruction,
              locationName: wp.locationName,
              targetPosition: this.toVector3(wp.targetPosition || wp.locationPosition),
            })),
            waypointsReached: obj.waypointsReached || 0,
            stepsCompleted: obj.stepsCompleted || 0,
            stepsRequired: obj.stepsRequired || obj.navigationWaypoints.length,
            completionTrigger: obj.completionTrigger,
          });
          return;
        }

        // ── Type-based objective handling (from hydrated Prolog content) ──
        const objType = obj.type || '';
        const objTarget = obj.target || obj.itemName || obj.npcId || obj.npcName || '';

        if (objType === 'collect_item') {
          const itemName = objTarget || `item_${index}`;
          const count = obj.requiredCount || obj.required || 1;
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'collect_item',
            description: obj.description || `Collect ${itemName}`,
            completed: obj.completed || false,
            itemName,
            itemCount: count,
            collectedCount: obj.currentCount || obj.current || 0,
            spawnPositions: obj.spawnPositions || this.generateSpawnPositions(count),
          });
          return;
        }

        if (objType === 'deliver_item') {
          const itemName = obj.item || objTarget || `delivery_${index}`;
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'deliver_item',
            description: obj.description || `Deliver ${itemName}`,
            completed: obj.completed || false,
            itemName,
            itemCount: 1,
            collectedCount: 0,
            spawnPositions: obj.spawnPositions || this.generateSpawnPositions(1),
          });
          return;
        }

        // For other typed objectives, pass through without spawning physical items
        if (objType && objType !== 'objective' && objType !== 'custom') {
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: objType,
            description: obj.description || objType.replace(/_/g, ' '),
            completed: obj.completed || false,
            npcName: obj.npcName || obj.npcId || obj.target,
            npcId: obj.npcId,
            itemName: obj.item || obj.itemName || obj.target,
            locationName: obj.locationName,
            requiredCount: obj.requiredCount || obj.required || 1,
            currentCount: obj.currentCount || obj.current || 0,
            completionTrigger: obj.completionTrigger,
            objectiveLocation: obj.objectiveLocation,
          } as any);
          return;
        }

        // ── Fallback: infer objective type from description ──
        const desc = obj.description?.toLowerCase() || '';

        if (desc.includes('collect') || desc.includes('find') || desc.includes('gather')) {
          const itemMatch = desc.match(/collect|find|gather\s+(?:the\s+)?(\w+)/i);
          const itemName = itemMatch ? itemMatch[1] : `item_${index}`;

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'collect_item',
            description: obj.description,
            completed: obj.isCompleted || false,
            itemName,
            itemCount: 1,
            collectedCount: 0,
            spawnPositions: this.generateSpawnPositions(1)
          });
        } else if (desc.includes('talk') || desc.includes('speak') || desc.includes('conversation')) {
          // NPC conversation objective
          const npcMatch = desc.match(/talk to|speak with|visit\s+(\w+)/i);
          const npcName = npcMatch ? npcMatch[1] : 'NPC';

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'talk_to_npc',
            description: obj.description,
            completed: obj.isCompleted || false,
            npcName
          });
        } else if (desc.includes('go to') || desc.includes('visit') || desc.includes('travel')) {
          // Location visit objective
          const locationMatch = desc.match(/go to|visit|travel to\s+(?:the\s+)?(\w+)/i);
          const locationName = locationMatch ? locationMatch[1] : `location_${index}`;

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'visit_location',
            description: obj.description,
            completed: obj.isCompleted || false,
            locationName,
            locationPosition: this.generateLocationPosition(),
            locationRadius: 5
          });
        } else if (desc.includes('defeat') || desc.includes('kill') || desc.includes('slay') || desc.includes('destroy')) {
          // Enemy defeat objective
          const enemyMatch = desc.match(/defeat|kill|slay|destroy\s+(?:\d+\s+)?(?:the\s+)?(\w+)/i);
          const enemyType = enemyMatch ? enemyMatch[1] : 'enemy';
          const countMatch = desc.match(/(\d+)/);
          const count = countMatch ? parseInt(countMatch[1]) : 1;

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'defeat_enemies',
            description: obj.description,
            completed: obj.isCompleted || false,
            enemyType,
            enemiesDefeated: 0,
            enemiesRequired: count,
          });
        } else if (desc.includes('craft') || desc.includes('create') || desc.includes('build') || desc.includes('forge')) {
          // Crafting objective
          const itemMatch = desc.match(/craft|create|build|forge\s+(?:a\s+|the\s+)?(\w+)/i);
          const itemName = itemMatch ? itemMatch[1] : `item_${index}`;

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'craft_item',
            description: obj.description,
            completed: obj.isCompleted || false,
            craftedItemId: itemName,
            craftedCount: 0,
            requiredCount: 1,
          });
        } else if (desc.includes('deliver') || desc.includes('bring') || desc.includes('give')) {
          // Delivery objective
          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'deliver_item',
            description: obj.description,
            completed: obj.isCompleted || false,
            delivered: false,
          });
        } else if (desc.includes('discover') || desc.includes('explore') || desc.includes('investigate')) {
          // Discovery objective
          const locationMatch = desc.match(/discover|explore|investigate\s+(?:the\s+)?(\w+)/i);
          const locationName = locationMatch ? locationMatch[1] : `location_${index}`;

          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'discover_location',
            description: obj.description,
            completed: obj.isCompleted || false,
            locationName,
          });
        } else if (desc.includes('escort') || desc.includes('protect') || desc.includes('accompany')) {
          // Escort objective
          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'escort_npc',
            description: obj.description,
            completed: obj.isCompleted || false,
            arrived: false,
            destinationPosition: this.generateLocationPosition(),
            locationRadius: 8,
          });
        } else if (desc.includes('identify') || desc.includes('point to') || desc.includes('show me')) {
          // Visual vocabulary / identify object
          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'identify_object',
            description: obj.description,
            completed: obj.isCompleted || false,
            targetLanguageWord: obj.targetWord || obj.vocabularyWords?.[0],
            englishMeaning: obj.meaning,
            spawnPositions: this.generateSpawnPositions(1),
          });
        } else if (desc.includes('follow') && (desc.includes('direction') || desc.includes('instruction') || desc.includes('path'))) {
          // Follow directions
          objectives.push({
            id: `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'follow_directions',
            description: obj.description,
            completed: obj.isCompleted || false,
            stepsCompleted: 0,
            stepsRequired: obj.required || 1,
            locationPosition: this.generateLocationPosition(),
            locationRadius: 5,
          });
        } else if (obj.type === 'gain_reputation') {
          // Reputation gain objective (from seed quests)
          objectives.push({
            id: obj.id || `${quest.id}_obj_${index}`,
            questId: quest.id,
            type: 'gain_reputation',
            description: obj.description,
            completed: obj.isCompleted || obj.completed || false,
            factionId: obj.factionId,
            reputationGained: obj.reputationGained || 0,
            reputationRequired: obj.reputationRequired || 10,
          });
        }
      });
    }

    return objectives;
  }

  /**
   * Spawn a quest objective in the world
   */
  private async spawnObjective(objective: QuestObjective) {
    if (objective.completed) return;

    switch (objective.type) {
      case 'collect_item':
        this.spawnCollectibleItems(objective);
        break;

      case 'visit_location':
        this.spawnLocationMarker(objective);
        break;

      case 'talk_to_npc':
        // NPC objectives don't need spawning, just tracking
        break;

      case 'use_vocabulary':
      case 'complete_conversation':
        // These are tracked through conversation, no physical spawn
        break;

      case 'identify_object':
      case 'find_vocabulary_items':
        // Spawn labeled collectible items with target-language labels
        this.spawnVocabularyItem(objective);
        break;

      case 'follow_directions':
        // Spawn waypoint markers for direction steps
        this.spawnDirectionWaypoints(objective);
        break;

      case 'listening_comprehension':
        // Trigger TTS for the story text when the objective starts
        if (this.onStoryTTS && objective.description) {
          this.onStoryTTS(objective.description, objective.listeningStoryNpcId);
        }
        // console.log(`[QuestObjectManager] listening_comprehension objective: ${objective.description}`);
        break;

      case 'translation_challenge':
        // These are conversation-based, no physical spawn needed
        // console.log(`[QuestObjectManager] ${objective.type} objective: ${objective.description}`);
        break;

      case 'navigate_language':
        // Spawn navigation waypoints (reuses direction waypoint visuals with blue color)
        this.spawnNavigationWaypoints(objective);
        break;

      case 'defeat_enemies':
        // Spawn a red combat zone marker at the enemy location
        this.spawnCombatZoneMarker(objective);
        break;

      case 'escort_npc':
        // Spawn a purple destination marker for the escort target
        this.spawnEscortDestination(objective);
        break;

      case 'collect_clue':
        // Spawn interactable clue object(s) at the objective location
        this.spawnClueItems(objective);
        break;

      case 'read_text':
      case 'find_text':
        // Spawn a readable text/document at the objective location if not already in the world
        this.spawnReadableText(objective);
        break;

      case 'craft_item':
      case 'physical_action':
      case 'buy_item':
        // Spawn a waypoint marker at the relevant location if one is specified
        if (objective.locationName) {
          this.spawnLocationMarker({
            ...objective,
            type: 'visit_location',
            description: objective.description || `Go to ${objective.locationName || 'the location'}`,
          });
        }
        break;
    }
  }

  /**
   * Spawn collectible item objects in the world
   */
  private spawnCollectibleItems(objective: QuestObjective) {
    const positions = objective.spawnPositions || this.generateSpawnPositions(objective.itemCount || 1);

    positions.forEach((position, index) => {
      const itemId = `${objective.id}_item_${index}`;

      // Try to use model template from asset collection, fallback to procedural sphere
      const collectibleTemplate = this.getQuestModelTemplate('collectible');
      let item: Mesh;

      if (collectibleTemplate) {
        // Clone the template (hierarchy-aware for glTF models)
        if (collectibleTemplate.getTotalVertices() === 0 && collectibleTemplate.getChildMeshes().length > 0) {
          const root = collectibleTemplate.instantiateHierarchy(
            null,
            undefined,
            (source, clone) => { clone.name = `${source.name}_quest_${itemId}`; }
          );
          item = (root as Mesh) || MeshBuilder.CreateSphere(`quest_item_${itemId}`, { diameter: 0.8, segments: 16 }, this.scene);
          item.setEnabled(true);
          item.getChildMeshes().forEach(m => m.setEnabled(true));
        } else {
          item = collectibleTemplate.clone(`quest_item_${itemId}`) as Mesh;
          item.setEnabled(true);
        }
        item.position = position;
        // console.log(`[QuestObjectManager] Using collectible model from asset collection`);
      } else {
        // Fallback: Use procedural mesh generator for contextual shape
        const objectType = objective.itemName?.toLowerCase() || 'gem';
        const result = this.proceduralObjects.generate(`item_${itemId}`, { objectType });
        item = result.mesh;
        item.position = position;
      }

      // Create material with quest color (golden yellow)
      const material = new StandardMaterial(`quest_item_mat_${itemId}`, this.scene);
      material.diffuseColor = new Color3(1, 0.84, 0);
      material.emissiveColor = new Color3(0.5, 0.42, 0);
      material.alpha = 0.9;
      item.material = material;

      // Add floating animation
      const floatAnim = new Animation(
        `quest_item_float_${itemId}`,
        'position.y',
        30,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CYCLE
      );

      const baseY = position.y;
      floatAnim.setKeys([
        { frame: 0, value: baseY },
        { frame: 30, value: baseY + 0.3 },
        { frame: 60, value: baseY }
      ]);

      item.animations.push(floatAnim);
      this.scene.beginAnimation(item, 0, 60, true);

      // Add rotation animation
      const rotateAnim = new Animation(
        `quest_item_rotate_${itemId}`,
        'rotation.y',
        30,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CYCLE
      );

      rotateAnim.setKeys([
        { frame: 0, value: 0 },
        { frame: 60, value: Math.PI * 2 }
      ]);

      item.animations.push(rotateAnim);
      this.scene.beginAnimation(item, 0, 60, true);

      // Add collision detection
      item.actionManager = new ActionManager(this.scene);
      item.actionManager.registerAction(
        new ExecuteCodeAction(
          {
            trigger: ActionManager.OnIntersectionEnterTrigger,
            parameter: { usePreciseIntersection: false }
          },
          () => {
            this.collectItem(objective.questId, objective.id, itemId);
          }
        )
      );

      // Create label
      const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI(`quest_item_ui_${itemId}`);
      advancedTexture.idealWidth = 1280;
      const label = new GUI.Rectangle(`quest_item_label_${itemId}`);
      label.width = '150px';
      label.height = '40px';
      label.cornerRadius = 5;
      label.color = 'white';
      label.thickness = 2;
      label.background = 'rgba(0, 0, 0, 0.7)';

      const text = new GUI.TextBlock();
      text.text = `✨ ${objective.itemName || 'Quest Item'}`;
      text.color = '#FFD700';
      text.fontSize = 14;
      label.addControl(text);

      advancedTexture.addControl(label);
      label.linkWithMesh(item);
      label.linkOffsetY = -50;

      // Store quest object
      this.questObjects.set(itemId, {
        mesh: item,
        label: advancedTexture,
        questId: objective.questId,
        objectiveId: objective.id,
        type: 'collect_item',
        isCollected: false
      });
    });
  }

  /**
   * Spawn a location marker for a visit_location / discover_location
   * objective. Uses the same billboard-plane + glyph visual language as
   * the NPC quest indicators (QuestIndicatorManager) so locations and
   * NPCs share one unified marker style.
   *
   * Previously this spawned a 10m cyan cylinder + ground torus ring,
   * which was a different visual language from the NPC markers and
   * frequently obscured the actual location. The new marker sits 3m
   * above `objective.locationPosition`, billboarded, with a red `!`
   * glyph drawn on a 0.8m plane — identical to what floats above an NPC
   * head for `active_objective`. Style comes from MARKER_STYLES so any
   * future retune applies to both surfaces at once.
   *
   * Kept from the old implementation:
   *  - locationGroundPositions tracking for proximity checks
   *  - building-interior hide/show when the objective is inside a
   *    specific building and the player isn't currently in it
   *
   * Dropped:
   *  - The 10m pillar cylinder
   *  - The activation-radius ground ring (could be reintroduced as a
   *    separate "you're close" zone indicator later; not needed for
   *    the marker itself)
   *  - The asset-collection model template fallback (the new marker is
   *    always a canvas-drawn billboard — no 3D asset to swap in)
   */
  private spawnLocationMarker(objective: QuestObjective) {
    if (!objective.locationPosition) return;

    const markerId = objective.id;
    const style = MARKER_STYLES.active_objective;

    // 0.8m plane in world space, 3m above the location anchor.
    const marker = MeshBuilder.CreatePlane(
      `quest_location_${markerId}`,
      { width: 0.8, height: 0.8 },
      this.scene,
    );
    marker.position = objective.locationPosition.clone();
    marker.position.y += 3;
    marker.billboardMode = Mesh.BILLBOARDMODE_ALL;
    marker.metadata = { ...(marker.metadata || {}), debugLabel: 'Quest Location (marker)' };

    // Draw the glyph onto a canvas texture — matches QuestIndicatorManager.
    const textureResolution = 128;
    const tex = new DynamicTexture(
      `quest_location_tex_${markerId}`,
      textureResolution,
      this.scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, textureResolution, textureResolution);
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Red fill → white glyph for contrast. If the style's color ever
    // changes to a lighter hue, swap to a luminance-aware picker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.symbol, 64, 68);
    tex.update();

    const material = new StandardMaterial(`quest_location_mat_${markerId}`, this.scene);
    material.diffuseTexture = tex;
    material.emissiveTexture = tex;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.backFaceCulling = false;
    marker.material = material;

    this.locationMarkers.set(markerId, marker);

    // Ground-level proximity anchor — used by the quest-completion tick
    // to test whether the player is inside the activation zone. Kept
    // separate from the visual marker so the marker can float while the
    // proximity check runs at ground level.
    const groundPos = objective.locationPosition.clone();
    groundPos.y = 0;
    this.locationGroundPositions.set(markerId, groundPos);

    // Hide the marker while the player is outside a building-interior
    // objective's building. Preserved from the pillar implementation.
    if (objective.buildingId && this.currentBuildingId !== objective.buildingId) {
      marker.setEnabled(false);
    }
  }

  /**
   * Spawn a vocabulary-labeled collectible for visual vocab / scavenger hunt quests.
   * Player must click/tap the object and correctly name it in the target language.
   */
  private spawnVocabularyItem(objective: QuestObjective) {
    const positions = objective.spawnPositions || this.generateSpawnPositions(1);
    const word = objective.targetLanguageWord || objective.itemName || '???';
    const meaning = objective.englishMeaning || '';

    // Register with the visual vocabulary detector for answer validation
    const vocabTarget: VocabularyTarget = {
      id: objective.id,
      questId: objective.questId,
      objectiveId: objective.id,
      targetWord: word,
      englishMeaning: meaning,
      acceptedAnswers: objective.targetWords,
      isActivity: false,
    };
    this.visualVocabDetector.registerTarget(vocabTarget);

    positions.forEach((position, index) => {
      const itemId = `${objective.id}_vocabitem_${index}`;

      // Use procedural mesh generator for contextual vocabulary object shape
      const objectType = meaning.toLowerCase() || objective.itemName?.toLowerCase() || 'orb';
      const vocabColor = ProceduralQuestObjects.getColor(meaning.toLowerCase());
      const result = this.proceduralObjects.generate(`vocab_${itemId}`, {
        objectType,
        color: vocabColor,
        label: word,
        interactable: true,
      });
      const item = result.mesh;
      item.position = position;
      item.isPickable = true;

      // Purple-ish material for vocabulary items (distinct from golden quest items)
      const material = new StandardMaterial(`vocab_item_mat_${itemId}`, this.scene);
      material.diffuseColor = new Color3(0.6, 0.3, 0.9);
      material.emissiveColor = new Color3(0.3, 0.15, 0.45);
      material.alpha = 0.9;
      item.material = material;

      // Floating animation
      const floatAnim = new Animation(
        `vocab_float_${itemId}`, 'position.y', 30,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
      );
      const baseY = position.y;
      floatAnim.setKeys([
        { frame: 0, value: baseY },
        { frame: 30, value: baseY + 0.25 },
        { frame: 60, value: baseY }
      ]);
      item.animations.push(floatAnim);
      this.scene.beginAnimation(item, 0, 60, true);

      // Click-to-identify: trigger identification prompt when player clicks/taps
      item.actionManager = new ActionManager(this.scene);
      item.actionManager.registerAction(
        new ExecuteCodeAction(
          ActionManager.OnPickTrigger,
          () => { this.triggerVocabIdentification(objective.id, itemId); }
        )
      );

      // Visual hint label (shows "?" until identified — no answer revealed)
      const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI(`vocab_ui_${itemId}`);
      advancedTexture.idealWidth = 1280;
      const label = new GUI.Rectangle(`vocab_label_${itemId}`);
      label.width = '180px';
      label.height = '50px';
      label.cornerRadius = 8;
      label.color = '#B388FF';
      label.thickness = 2;
      label.background = 'rgba(30, 0, 60, 0.85)';

      const text = new GUI.TextBlock();
      text.text = `📖 ${meaning || '?'}`;
      text.color = '#E1BEE7';
      text.fontSize = 12;
      text.textWrapping = true;
      label.addControl(text);

      advancedTexture.addControl(label);
      label.linkWithMesh(item);
      label.linkOffsetY = -55;

      this.questObjects.set(itemId, {
        mesh: item,
        label: advancedTexture,
        questId: objective.questId,
        objectiveId: objective.id,
        type: objective.type,
        isCollected: false,
      });
    });
  }

  /**
   * Spawn waypoint markers for follow-directions quests.
   * Each direction step gets a beacon the player must reach in order.
   */
  private spawnDirectionWaypoints(objective: QuestObjective) {
    // Start the timer if a time limit is set
    if (objective.timeLimitSeconds && !objective.startedAt) {
      objective.startedAt = Date.now();
    }

    const steps = objective.directionSteps || [];
    if (steps.length === 0 && objective.locationPosition) {
      // Single-step fallback: just one location marker
      this.spawnLocationMarker({
        ...objective,
        type: 'visit_location',
      });
      return;
    }

    // Spawn the first step's waypoint (subsequent ones spawn as the player completes each step)
    const firstStepPos = steps.length > 0 ? (steps[0].targetPosition || (steps[0] as any).locationPosition) : null;
    if (steps.length > 0 && firstStepPos) {
      const markerId = `${objective.id}_step_0`;
      const pos = firstStepPos instanceof Vector3 ? firstStepPos : new Vector3(firstStepPos.x ?? 0, firstStepPos.y ?? 0, firstStepPos.z ?? 0);

      const beacon = MeshBuilder.CreateCylinder(
        `direction_beacon_${markerId}`,
        { height: 8, diameter: 1.5, tessellation: 24 },
        this.scene
      );
      beacon.position = pos.clone();
      beacon.position.y += 4;

      // Green material for direction waypoints
      const material = new StandardMaterial(`direction_mat_${markerId}`, this.scene);
      material.diffuseColor = new Color3(0.2, 0.9, 0.4);
      material.emissiveColor = new Color3(0.1, 0.45, 0.2);
      material.alpha = 0.35;
      beacon.material = material;

      // Pulsing animation
      const pulseAnim = new Animation(
        `direction_pulse_${markerId}`, 'material.alpha', 30,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
      );
      pulseAnim.setKeys([
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 0.2 }
      ]);
      beacon.animations.push(pulseAnim);
      this.scene.beginAnimation(beacon, 0, 60, true);

      this.locationMarkers.set(markerId, beacon);

      // console.log(`[QuestObjectManager] Direction waypoint spawned for step 0: "${step.instruction}"`);
    }
  }

  /**
   * Spawn navigation waypoints for navigate_language objectives (blue beacons)
   */
  private spawnNavigationWaypoints(objective: QuestObjective) {
    const waypoints = objective.navigationWaypoints || [];
    if (waypoints.length === 0) return;

    // Spawn the first waypoint (subsequent ones spawn as player reaches each one)
    const wp = waypoints[0];
    const wpPos = wp.targetPosition || (wp as any).locationPosition;
    if (!wpPos) return;

    const markerId = `${objective.id}_nav_0`;
    const pos = wpPos instanceof Vector3 ? wpPos : new Vector3(wpPos.x ?? 0, wpPos.y ?? 0, wpPos.z ?? 0);
    const beacon = MeshBuilder.CreateCylinder(
      `nav_beacon_${markerId}`,
      { height: 8, diameter: 1.5, tessellation: 24 },
      this.scene
    );
    beacon.position = pos.clone();
    beacon.position.y += 4;

    // Blue material for navigation waypoints
    const material = new StandardMaterial(`nav_mat_${markerId}`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.5, 0.95);
    material.emissiveColor = new Color3(0.1, 0.25, 0.5);
    material.alpha = 0.35;
    beacon.material = material;

    // Pulsing animation
    const pulseAnim = new Animation(
      `nav_pulse_${markerId}`, 'material.alpha', 30,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
    );
    pulseAnim.setKeys([
      { frame: 0, value: 0.2 },
      { frame: 30, value: 0.5 },
      { frame: 60, value: 0.2 }
    ]);
    beacon.animations.push(pulseAnim);
    this.scene.beginAnimation(beacon, 0, 60, true);

    this.locationMarkers.set(markerId, beacon);
    // console.log(`[QuestObjectManager] Navigation waypoint spawned for step 0: "${wp.instruction}"`);
  }

  /**
   * Spawn a red combat zone marker for defeat_enemies objectives.
   * Guides the player to the area where combat-enabled NPCs can be found.
   */
  private spawnCombatZoneMarker(objective: QuestObjective) {
    const position = objective.spawnPositions?.[0] || this.generateSpawnPositions(1)[0];
    const markerId = `${objective.id}_combat`;

    const beacon = MeshBuilder.CreateCylinder(
      `quest_combat_${markerId}`,
      { height: 10, diameter: 3, tessellation: 24 },
      this.scene
    );
    beacon.position = position.clone();
    beacon.position.y += 5;

    const material = new StandardMaterial(`quest_combat_mat_${markerId}`, this.scene);
    material.diffuseColor = new Color3(1, 0, 0);
    material.emissiveColor = new Color3(0.5, 0, 0);
    material.alpha = 0.3;
    beacon.material = material;

    const pulseAnim = new Animation(
      `quest_combat_pulse_${markerId}`, 'material.alpha', 30,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
    );
    pulseAnim.setKeys([
      { frame: 0, value: 0.15 },
      { frame: 30, value: 0.4 },
      { frame: 60, value: 0.15 },
    ]);
    beacon.animations.push(pulseAnim);
    this.scene.beginAnimation(beacon, 0, 60, true);

    this.locationMarkers.set(markerId, beacon);
    // console.log(`[QuestObjectManager] Combat zone marker spawned for defeat_enemies: ${objective.description}`);
  }

  /**
   * Spawn a purple destination marker for escort_npc objectives.
   * The player must bring the escorted NPC to this location.
   */
  private spawnEscortDestination(objective: QuestObjective) {
    if (!objective.destinationPosition) return;

    const markerId = `${objective.id}_escort_dest`;

    const beacon = MeshBuilder.CreateCylinder(
      `quest_escort_${markerId}`,
      { height: 10, diameter: 2.5, tessellation: 24 },
      this.scene
    );
    beacon.position = objective.destinationPosition.clone();
    beacon.position.y += 5;

    const material = new StandardMaterial(`quest_escort_mat_${markerId}`, this.scene);
    material.diffuseColor = new Color3(0.5, 0, 1);
    material.emissiveColor = new Color3(0.25, 0, 0.5);
    material.alpha = 0.35;
    beacon.material = material;

    const pulseAnim = new Animation(
      `quest_escort_pulse_${markerId}`, 'material.alpha', 30,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
    );
    pulseAnim.setKeys([
      { frame: 0, value: 0.2 },
      { frame: 30, value: 0.5 },
      { frame: 60, value: 0.2 },
    ]);
    beacon.animations.push(pulseAnim);
    this.scene.beginAnimation(beacon, 0, 60, true);

    this.locationMarkers.set(markerId, beacon);

    // Emit escort_started event so BabylonGame can set up NPC following behavior
    if (objective.escortNpcId) {
      this.eventBus?.emit({
        type: 'escort_started',
        questId: objective.questId,
        objectiveId: objective.id,
        npcId: objective.escortNpcId,
        npcName: objective.npcName,
        destinationX: objective.destinationPosition.x,
        destinationZ: objective.destinationPosition.z,
      });
    }

    // console.log(`[QuestObjectManager] Escort destination marker spawned for: ${objective.description}`);
  }

  /**
   * Spawn interactable clue objects for collect_clue objectives.
   * Places a glowing scroll/document at the objective's location that emits
   * a clue_discovered event when the player walks near it.
   */
  private spawnClueItems(objective: QuestObjective) {
    const count = objective.requiredCount || objective.itemCount || 1;

    // Resolve spawn positions: explicit > location name lookup > random
    let positions = objective.spawnPositions;
    if (!positions && objective.locationPosition) {
      positions = [objective.locationPosition];
    }
    if (!positions && objective.locationName && this.resolveLocationPosition) {
      const resolved = this.resolveLocationPosition(objective.locationName);
      if (resolved) positions = [resolved];
    }
    if (!positions) {
      positions = this.generateSpawnPositions(count);
    }

    for (let i = 0; i < positions.length; i++) {
      const itemId = `${objective.id}_clue_${i}`;
      const position = positions[i];

      // Create a scroll/document mesh
      const clue = MeshBuilder.CreateBox(
        `quest_clue_${itemId}`,
        { width: 0.4, height: 0.05, depth: 0.6 },
        this.scene
      );
      clue.position = position.clone();
      clue.position.y += 1.2; // Float above ground

      const material = new StandardMaterial(`quest_clue_mat_${itemId}`, this.scene);
      material.diffuseColor = new Color3(0.9, 0.85, 0.6); // Parchment color
      material.emissiveColor = new Color3(0.4, 0.35, 0.2);
      material.alpha = 0.95;
      clue.material = material;

      // Floating + rotation animation
      const floatAnim = new Animation(
        `quest_clue_float_${itemId}`, 'position.y', 30,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
      );
      floatAnim.setKeys([
        { frame: 0, value: position.y + 1.2 },
        { frame: 45, value: position.y + 1.6 },
        { frame: 90, value: position.y + 1.2 },
      ]);
      clue.animations.push(floatAnim);

      const rotAnim = new Animation(
        `quest_clue_rot_${itemId}`, 'rotation.y', 30,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
      );
      rotAnim.setKeys([
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 2 },
      ]);
      clue.animations.push(rotAnim);
      this.scene.beginAnimation(clue, 0, 90, true);

      // Click interaction
      clue.actionManager = new ActionManager(this.scene);
      clue.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.collectClue(objective, clue, itemId, i, count);
        })
      );
      clue.isPickable = true;

      this.locationMarkers.set(itemId, clue);
    }
  }

  /**
   * Handle player collecting a clue item.
   */
  private collectClue(objective: QuestObjective, mesh: Mesh, itemId: string, clueIndex: number, totalClues: number) {
    // Remove the mesh
    this.scene.stopAnimation(mesh);
    mesh.dispose();
    this.locationMarkers.delete(itemId);

    // Emit clue_discovered event
    this.eventBus?.emit({
      type: 'clue_discovered',
      clueId: `${objective.questId}_clue_${clueIndex}`,
      clueCategory: 'physical_evidence',
      clueSource: objective.itemName || objective.description || 'clue',
      clueCount: clueIndex + 1,
      totalClueCount: totalClues,
    });

    this.onQuestItemCollected?.(objective.questId, objective.id, objective.itemName || 'clue');
  }

  /**
   * Spawn a readable text/document at the objective location.
   * For read_text objectives, places a glowing book that the player can interact with.
   * Only spawns if the objective has a location — texts already in the world
   * (via BookSpawnManager/TextSpawner) don't need duplicate spawning.
   */
  private spawnReadableText(objective: QuestObjective) {
    // Resolve position: explicit > location name lookup > skip
    let position = objective.spawnPositions?.[0] || objective.locationPosition || null;
    if (!position && objective.locationName && this.resolveLocationPosition) {
      position = this.resolveLocationPosition(objective.locationName);
    }
    if (!position) return; // No location — text is probably already in the world via BookSpawnManager
    const itemId = `${objective.id}_text_0`;

    // Check if already spawned
    if (this.locationMarkers.has(itemId)) return;

    const book = MeshBuilder.CreateBox(
      `quest_text_${itemId}`,
      { width: 0.3, height: 0.4, depth: 0.05 },
      this.scene
    );
    book.position = position.clone();
    book.position.y += 1.2;

    const material = new StandardMaterial(`quest_text_mat_${itemId}`, this.scene);
    material.diffuseColor = new Color3(0.6, 0.4, 0.2); // Book brown
    material.emissiveColor = new Color3(0.3, 0.2, 0.1);
    book.material = material;

    // Gentle float animation
    const floatAnim = new Animation(
      `quest_text_float_${itemId}`, 'position.y', 30,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
    );
    floatAnim.setKeys([
      { frame: 0, value: position.y + 1.2 },
      { frame: 60, value: position.y + 1.5 },
      { frame: 120, value: position.y + 1.2 },
    ]);
    book.animations.push(floatAnim);
    this.scene.beginAnimation(book, 0, 120, true);

    const textId = objective.itemName || 'quest_text';
    book.actionManager = new ActionManager(this.scene);
    book.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        // Emit text_found then text_read events
        this.eventBus?.emit({
          type: 'text_found',
          textId,
          textName: objective.itemName || objective.description || 'Document',
        });
        this.eventBus?.emit({
          type: 'text_read',
          textId,
        });

        // Remove after reading
        this.scene.stopAnimation(book);
        book.dispose();
        this.locationMarkers.delete(itemId);
        this.onQuestItemCollected?.(objective.questId, objective.id, textId);
      })
    );
    book.isPickable = true;

    this.locationMarkers.set(itemId, book);
  }

  /**
   * Check if an escorted NPC has reached their destination.
   * Called from the game loop alongside other proximity checks.
   * @param getNpcPosition callback to retrieve an NPC mesh position by ID
   */
  public checkEscortProximity(getNpcPosition: (npcId: string) => Vector3 | null): void {
    this.activeQuests.forEach(quest => {
      quest.objectives?.forEach(objective => {
        if (objective.type !== 'escort_npc' || objective.completed || objective.arrived) return;
        if (!objective.escortNpcId || !objective.destinationPosition) return;

        const npcPos = getNpcPosition(objective.escortNpcId);
        if (!npcPos) return;

        const distance = Vector3.Distance(npcPos, objective.destinationPosition);
        const radius = objective.locationRadius || 8;

        if (distance <= radius) {
          // NPC has arrived at the destination
          this.trackArrival(objective.escortNpcId, true, quest.id);

          // Clean up the destination marker
          const markerId = `${objective.id}_escort_dest`;
          const marker = this.locationMarkers.get(markerId);
          if (marker) {
            marker.dispose();
            this.locationMarkers.delete(markerId);
          }

          // Emit escort completion event
          this.eventBus?.emit({
            type: 'escort_completed',
            questId: quest.id,
            objectiveId: objective.id,
            npcId: objective.escortNpcId,
          });
        }
      });
    });
  }

  /**
   * Generate random spawn positions for quest objects
   */
  private generateSpawnPositions(count: number): Vector3[] {
    const positions: Vector3[] = [];
    const radius = 30; // Spawn within 30 units of origin

    for (let i = 0; i < count; i++) {
      // Try up to 8 times to find a position outside buildings
      let x = 0, z = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const distance = 10 + Math.random() * radius;
        x = Math.cos(angle) * distance;
        z = Math.sin(angle) * distance;
        if (!this.isPointInBuilding?.(x, z)) break;
      }
      positions.push(new Vector3(x, 0.5, z));
    }

    return positions;
  }

  /**
   * Generate a location position
   */
  /**
   * Convert a plain {x, y, z} object or Vector3 to a Vector3 instance.
   * Returns a generated random position if input is null/undefined.
   */
  private toVector3(pos: any): Vector3 {
    if (!pos) return this.generateLocationPosition();
    if (pos instanceof Vector3) return pos;
    return new Vector3(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
  }

  private generateLocationPosition(): Vector3 {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 20 + Math.random() * 20;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (!this.isPointInBuilding?.(x, z)) {
        return new Vector3(x, 0, z);
      }
    }
    // Fallback
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 10;
    return new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  }

  /**
   * Handle item collection
   */
  private collectItem(questId: string, objectiveId: string, itemId: string) {
    const questObject = this.questObjects.get(itemId);
    if (!questObject || questObject.isCollected) return;

    questObject.isCollected = true;

    // Play collection animation
    const mesh = questObject.mesh;
    const collectAnim = new Animation(
      'collect_anim',
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    collectAnim.setKeys([
      { frame: 0, value: Vector3.One() },
      { frame: 20, value: new Vector3(1.5, 1.5, 1.5) },
      { frame: 40, value: Vector3.Zero() }
    ]);

    mesh.animations = [collectAnim];
    this.scene.beginAnimation(mesh, 0, 40, false, 2, () => {
      mesh.dispose();
      questObject.label?.dispose();
      this.questObjects.delete(itemId);
    });

    // Notify quest item collected for inventory integration
    const questObj = Array.from(this.questObjects.values()).find(
      q => q.questId === questId && q.objectiveId === objectiveId
    );
    // Find the objective to get the item name
    const quest = this.activeQuests.find(q => q.id === questId);
    const objective = quest?.objectives?.find(o => o.id === objectiveId);
    const itemName = objective?.itemName || 'Quest Item';
    this.onQuestItemCollected?.(questId, objectiveId, itemName);

    // Notify callback
    if (this.onObjectCollected) {
      this.onObjectCollected(questId, objectiveId);
    }
  }

  /**
   * Check if player is near a location marker
   */
  public checkLocationProximity(playerPosition: Vector3): void {
    this.activeQuests.forEach(quest => {
      quest.objectives?.forEach(objective => {
        if (objective.type === 'visit_location' && !objective.completed) {
          const marker = this.locationMarkers.get(objective.id);
          if (!marker || !marker.isEnabled()) return;

          // Use stored ground-level position for proximity (marker visual is raised y+5)
          const groundPos = this.locationGroundPositions.get(objective.id);
          const targetPos = groundPos || marker.position;
          // Compare in XZ plane only to avoid vertical offset issues
          const dx = playerPosition.x - targetPos.x;
          const dz = playerPosition.z - targetPos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          const radius = objective.locationRadius || 8;

          // console.debug(`[QuestObjectManager] Proximity check: objective=${objective.id} distance=${distance.toFixed(1)} radius=${radius}`);

          if (distance <= radius) {
            // console.log(`[QuestObjectManager] Location proximity triggered: objective=${objective.id} quest=${quest.id} distance=${distance.toFixed(1)}`);
            this.visitLocation(quest.id, objective.id, objective.description);
          }
        }
      });
    });
  }

  /**
   * Handle location visit
   */
  private visitLocation(questId: string, objectiveId: string, description?: string) {
    const marker = this.locationMarkers.get(objectiveId);
    if (!marker) return;

    // Play completion particle burst at marker ground position
    const groundPos = this.locationGroundPositions.get(objectiveId) || marker.position;
    this.playLocationCompletionParticles(groundPos);

    // Show toast notification
    const desc = description || 'Visit location';
    this.showToast?.(`Objective completed: ${desc}`);

    // Dispose ground ring if it exists
    const ring = marker.metadata?.groundRing;
    if (ring && !ring.isDisposed()) {
      ring.dispose();
    }

    // Mark as visited (dispose marker)
    marker.dispose();
    this.locationMarkers.delete(objectiveId);
    this.locationGroundPositions.delete(objectiveId);

    // Notify callback
    if (this.onLocationVisited) {
      this.onLocationVisited(questId, objectiveId);
    }

    // Mark objective complete via engine
    this.completionEngine.completeObjective(questId, objectiveId);
  }

  /**
   * Play green sparkle particle burst at a location for objective completion
   */
  private playLocationCompletionParticles(position: Vector3): void {
    try {
      const ps = new ParticleSystem('locationComplete', 100, this.scene);
      ps.createPointEmitter(new Vector3(-2, 1, -2), new Vector3(2, 5, 2));
      ps.emitter = new Vector3(position.x, position.y + 1, position.z);
      ps.minSize = 0.05;
      ps.maxSize = 0.15;
      ps.minLifeTime = 0.8;
      ps.maxLifeTime = 1.5;
      ps.emitRate = 0; // Use manual burst
      ps.gravity = new Vector3(0, -2, 0);
      ps.minEmitPower = 2;
      ps.maxEmitPower = 4;
      // Green sparkle colors
      ps.color1 = new Color4(0.2, 1, 0.4, 1);
      ps.color2 = new Color4(0.4, 1, 0.6, 1);
      ps.colorDead = new Color4(0.1, 0.5, 0.2, 0);
      ps.manualEmitCount = 80;
      ps.start();
      // Auto-dispose after particles fade
      setTimeout(() => { try { ps.dispose(); } catch { /* already disposed */ } }, 2000);
    } catch (err) {
      console.warn('[QuestObjectManager] Failed to play completion particles:', err);
    }
  }

  /**
   * Check if player has reached the current direction step's waypoint.
   * Handles both follow_directions and navigate_language objectives.
   */
  public checkDirectionProximity(playerPosition: Vector3): void {
    this.activeQuests.forEach(quest => {
      quest.objectives?.forEach(objective => {
        if (objective.completed) return;

        if (objective.type === 'follow_directions' && objective.directionSteps) {
          const stepIndex = objective.stepsCompleted || 0;
          if (stepIndex >= objective.directionSteps.length) return;

          const step = objective.directionSteps[stepIndex];
          const stepPos = step.targetPosition || (step as any).locationPosition;
          if (!stepPos) return;

          const target = stepPos;
          const distance = Vector3.Distance(
            playerPosition,
            new Vector3(target.x, target.y ?? playerPosition.y, target.z),
          );
          const radius = (objective as any).stepRadius || 6;

          if (distance <= radius) {
            objective.stepsCompleted = stepIndex + 1;
            const stepsRequired = objective.stepsRequired || objective.directionSteps.length;

            // Remove previous step marker, spawn next one
            this.transitionDirectionMarker(objective, stepIndex);

            // Emit direction_step_completed event
            this.eventBus?.emit({
              type: 'direction_step_completed',
              questId: quest.id,
              objectiveId: objective.id,
              stepIndex,
              stepsCompleted: objective.stepsCompleted,
              stepsRequired,
            });

            // Check if all steps done
            if (objective.stepsCompleted >= stepsRequired) {
              this.completeObjective(quest.id, objective.id);
            }
          }
        }

        if (objective.type === 'navigate_language' && objective.navigationWaypoints) {
          const wpIndex = objective.waypointsReached || 0;
          if (wpIndex >= objective.navigationWaypoints.length) return;

          const waypoint = objective.navigationWaypoints[wpIndex];
          const wpPos = waypoint.targetPosition || (waypoint as any).locationPosition;
          if (!wpPos) return;

          const target = wpPos;
          const distance = Vector3.Distance(
            playerPosition,
            new Vector3(target.x, target.y ?? playerPosition.y, target.z),
          );
          const radius = (objective as any).stepRadius || 6;

          if (distance <= radius) {
            objective.waypointsReached = wpIndex + 1;
            objective.stepsCompleted = objective.waypointsReached;

            this.eventBus?.emit({
              type: 'direction_step_completed',
              questId: quest.id,
              objectiveId: objective.id,
              stepIndex: wpIndex,
              stepsCompleted: objective.waypointsReached,
              stepsRequired: objective.navigationWaypoints.length,
            });

            if (objective.waypointsReached >= objective.navigationWaypoints.length) {
              this.completeObjective(quest.id, objective.id);
            }
          }
        }
      });
    });
  }

  /**
   * Remove the completed direction step marker and spawn the next one.
   */
  private transitionDirectionMarker(objective: QuestObjective, completedIndex: number) {
    // Remove completed step marker
    const prevMarkerId = `${objective.id}_step_${completedIndex}`;
    const prevMarker = this.locationMarkers.get(prevMarkerId);
    if (prevMarker) {
      prevMarker.dispose();
      this.locationMarkers.delete(prevMarkerId);
    }

    // Spawn next step marker if available
    const steps = objective.directionSteps || [];
    const nextIdx = completedIndex + 1;
    if (nextIdx >= steps.length) return;

    const nextStep = steps[nextIdx];
    const nextPos = nextStep.targetPosition || (nextStep as any).locationPosition;
    if (!nextPos) return;

    const markerId = `${objective.id}_step_${nextIdx}`;
    const pos = nextPos instanceof Vector3 ? nextPos : new Vector3(nextPos.x ?? 0, nextPos.y ?? 0, nextPos.z ?? 0);
    const beacon = MeshBuilder.CreateCylinder(
      `direction_beacon_${markerId}`,
      { height: 8, diameter: 1.5, tessellation: 24 },
      this.scene
    );
    beacon.position = pos.clone();
    beacon.position.y += 4;

    const material = new StandardMaterial(`direction_mat_${markerId}`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.9, 0.4);
    material.emissiveColor = new Color3(0.1, 0.45, 0.2);
    material.alpha = 0.35;
    beacon.material = material;

    const pulseAnim = new Animation(
      `direction_pulse_${markerId}`, 'material.alpha', 30,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
    );
    pulseAnim.setKeys([
      { frame: 0, value: 0.2 },
      { frame: 30, value: 0.5 },
      { frame: 60, value: 0.2 }
    ]);
    beacon.animations.push(pulseAnim);
    this.scene.beginAnimation(beacon, 0, 60, true);

    this.locationMarkers.set(markerId, beacon);
  }

  /**
   * Track NPC conversation for quest
   */
  public trackNPCConversation(npcId: string, questId?: string) {
    this.completionEngine.trackNPCConversation(npcId, questId);
  }

  /**
   * Track vocabulary usage for quests.
   * Handles both 'use_vocabulary' and 'collect_vocabulary' objectives.
   * If targetWords is set, only matching words count. Otherwise any unique word counts.
   */
  public trackVocabularyUsage(word: string, questId?: string) {
    this.completionEngine.trackVocabularyUsage(word, questId);
  }

  /**
   * Track conversation turns for quests.
   * Each call represents one conversation exchange (player message + NPC response).
   * If the objective has targetWords, bonus progress is given for matches,
   * but every turn counts toward completion regardless.
   */
  public trackConversationTurn(keywords: string[], questId?: string) {
    this.completionEngine.trackConversationTurn(keywords, questId);
  }

  public trackCollectedItemByName(itemName: string, questId?: string, category?: string): CollectedItemMatch[] {
    return this.completionEngine.trackCollectedItemByName(itemName, questId, category);
  }

  public trackFoodOrdered(itemName: string, merchantId: string, businessType: string, questId?: string) {
    this.completionEngine.trackFoodOrdered(itemName, merchantId, businessType, questId);
  }

  public trackPriceHaggled(itemName: string, merchantId: string, typedWord: string, questId?: string) {
    this.completionEngine.trackPriceHaggled(itemName, merchantId, typedWord, questId);
  }


  /**
   * Track item delivery - when talking to an NPC while holding the quest item
   */
  public trackItemDelivery(npcId: string, playerItemNames: string[]): void {
    this.completionEngine.trackItemDelivery(npcId, playerItemNames);
  }

  /**
   * Track gift given to an NPC
   */
  public trackGiftGiven(npcId: string, itemName: string): void {
    this.completionEngine.trackGiftGiven(npcId, itemName);
  }

  /**
   * Check ownership-based objectives against current inventory
   */
  public checkInventoryObjectives(playerItemNames: string[]): void {
    this.completionEngine.checkInventoryObjectives(playerItemNames);
  }

  /**
   * Complete an objective (delegates to completion engine)
   */
  private completeObjective(questId: string, objectiveId: string) {
    this.completionEngine.completeObjective(questId, objectiveId);
  }

  /**
   * Complete a quest
   */
  private completeQuest(questId: string) {

    // Remove quest objects
    this.cleanupQuest(questId);

    // Remove from active quests and completion engine
    const index = this.activeQuests.findIndex(q => q.id === questId);
    if (index !== -1) {
      this.activeQuests.splice(index, 1);
    }
    this.completionEngine.removeQuest(questId);
  }

  /**
   * Clean up all objects for a quest
   */
  private cleanupQuest(questId: string) {
    // Remove quest objects
    Array.from(this.questObjects.entries()).forEach(([itemId, obj]) => {
      if (obj.questId === questId) {
        obj.mesh.dispose();
        obj.label?.dispose();
        this.questObjects.delete(itemId);
      }
    });

    // Remove location markers
    Array.from(this.locationMarkers.entries()).forEach(([markerId, marker]) => {
      const quest = this.activeQuests.find(q => q.id === questId);
      const objective = quest?.objectives?.find(o => o.id === markerId);
      if (objective) {
        const ring = marker.metadata?.groundRing;
        if (ring && !ring.isDisposed()) ring.dispose();
        marker.dispose();
        this.locationMarkers.delete(markerId);
        this.locationGroundPositions.delete(markerId);
      }
    });

    // Remove visual vocabulary targets
    this.visualVocabDetector.removeQuestTargets(questId);
  }

  /**
   * Set callbacks
   */
  public setOnObjectCollected(callback: (questId: string, objectiveId: string) => void) {
    this.onObjectCollected = callback;
  }

  public setOnQuestItemCollected(callback: (questId: string, objectiveId: string, itemName: string) => void) {
    this.onQuestItemCollected = callback;
  }

  public setOnLocationVisited(callback: (questId: string, objectiveId: string) => void) {
    this.onLocationVisited = callback;
  }

  public setOnObjectiveCompleted(callback: (questId: string, objectiveId: string) => void) {
    this.onObjectiveCompleted = callback;
  }

  public setOnObjectiveProgress(callback: (questId: string, objectiveId: string, current: number, required: number, objectiveType: string) => void) {
    this.onObjectiveProgress = callback;
  }

  /**
   * Set callback for when a listening comprehension story should be spoken via TTS.
   * Called when a listening_comprehension objective is spawned.
   */
  public setOnStoryTTS(callback: (text: string, npcId?: string) => void) {
    this.onStoryTTS = callback;
  }

  /** Register a toast notification callback for objective completion messages. */
  public setShowToast(callback: (title: string, description?: string) => void) {
    this.showToast = callback;
  }

  /** Set a resolver that maps location names to world positions for quest item spawning. */
  public setLocationResolver(resolver: (locationName: string) => Vector3 | null) {
    this.resolveLocationPosition = resolver;
  }

  /** Register a building-check callback so spawned items avoid building interiors. */
  public setPointInBuildingCheck(check: (x: number, z: number) => boolean) {
    this.isPointInBuilding = check;
  }

  /**
   * Notify that the player has entered a building interior.
   * Shows markers targeting this building and repositions them to interior coordinates.
   */
  public onEnterBuilding(buildingId: string, interiorPosition: Vector3): void {
    this.currentBuildingId = buildingId;

    // Hide overworld markers and show interior markers for this building
    this.activeQuests.forEach(quest => {
      quest.objectives?.forEach(objective => {
        if (objective.type !== 'visit_location' || objective.completed) return;
        const marker = this.locationMarkers.get(objective.id);
        if (!marker) return;

        if (objective.buildingId === buildingId) {
          // Save original position and move marker to interior space
          this.savedMarkerPositions.set(objective.id, marker.position.clone());
          marker.position = new Vector3(
            interiorPosition.x + (objective.locationPosition?.x ?? 0),
            interiorPosition.y + 1,
            interiorPosition.z + (objective.locationPosition?.z ?? 0)
          );
          // Update ground position for proximity checking
          this.locationGroundPositions.set(objective.id, new Vector3(
            marker.position.x, 0, marker.position.z
          ));
          marker.setEnabled(true);
          const ring = marker.metadata?.groundRing;
          if (ring) ring.setEnabled(true);
        } else if (!objective.buildingId) {
          // Hide overworld markers while inside
          marker.setEnabled(false);
          const ring = marker.metadata?.groundRing;
          if (ring) ring.setEnabled(false);
        }
      });
    });
  }

  /**
   * Notify that the player has exited a building interior.
   * Restores overworld markers and hides interior markers.
   */
  public onExitBuilding(): void {
    this.activeQuests.forEach(quest => {
      quest.objectives?.forEach(objective => {
        if (objective.type !== 'visit_location' || objective.completed) return;
        const marker = this.locationMarkers.get(objective.id);
        if (!marker) return;

        if (objective.buildingId) {
          // Restore saved position and hide interior markers
          const savedPos = this.savedMarkerPositions.get(objective.id);
          if (savedPos) {
            marker.position = savedPos;
            this.savedMarkerPositions.delete(objective.id);
          }
          // Restore ground position
          if (objective.locationPosition) {
            const gp = objective.locationPosition.clone();
            gp.y = 0;
            this.locationGroundPositions.set(objective.id, gp);
          }
          marker.setEnabled(false);
          const ring = marker.metadata?.groundRing;
          if (ring) ring.setEnabled(false);
        } else {
          // Show overworld markers again
          marker.setEnabled(true);
          const ring = marker.metadata?.groundRing;
          if (ring) ring.setEnabled(true);
        }
      });
    });

    this.currentBuildingId = null;
  }

  /**
   * Set callback for when the player should be prompted to identify a vocabulary object.
   * The UI should display an input field for the player to type the target-language word.
   */
  public setOnIdentificationPrompt(callback: (prompt: IdentificationPrompt) => void) {
    this.onIdentificationPrompt = callback;
    this.visualVocabDetector.setOnIdentificationPrompt(callback);
  }

  /**
   * Trigger vocabulary identification when player clicks/taps a vocab object.
   * Fires the identification prompt callback.
   */
  private triggerVocabIdentification(objectiveId: string, itemId: string): void {
    const progress = this.visualVocabDetector.getProgress(objectiveId);
    if (progress?.identified) return;

    const prompt = this.visualVocabDetector.triggerPrompt(objectiveId);
    if (prompt) {
      // console.log(`[QuestObjectManager] Visual vocabulary prompt triggered for: ${objectiveId}`);
    }
  }

  /**
   * Submit a player's answer for a visual vocabulary identification.
   * Called by the UI after the player types/speaks their answer.
   * On success, plays collection animation and removes the object.
   */
  public submitVocabAnswer(objectiveId: string, playerInput: string): IdentificationResult {
    const result = this.visualVocabDetector.submitAnswer(objectiveId, playerInput);

    if (result.passed) {
      // Find and collect the associated quest object
      Array.from(this.questObjects.entries()).some(([itemId, obj]) => {
        if (obj.objectiveId === objectiveId && !obj.isCollected) {
          this.collectItem(obj.questId, obj.objectiveId, itemId);
          return true;
        }
        return false;
      });
    }

    return result;
  }

  /** Get the visual vocabulary detector for direct access. */
  public getVisualVocabDetector(): VisualVocabularyDetector {
    return this.visualVocabDetector;
  }

  /**
   * Track enemy defeat for combat quests
   */
  public trackEnemyDefeat(enemyType: string, questId?: string) {
    this.completionEngine.trackEnemyDefeat(enemyType, questId);
  }

  /**
   * Track item crafting for crafting quests
   */
  public trackItemCrafted(itemId: string, questId?: string) {
    this.completionEngine.trackItemCrafted(itemId, questId);
  }

  /**
   * Track location visit/discovery for exploration quests.
   * Matches both visit_location and discover_location objectives.
   */
  public trackLocationVisit(locationId: string, locationName: string, questId?: string) {
    this.completionEngine.trackLocationVisit(locationId, locationName, questId);
  }

  /** @deprecated Use trackLocationVisit instead */
  public trackLocationDiscovery(locationId: string, questId?: string) {
    this.completionEngine.trackLocationVisit(locationId, locationId, questId);
  }

  /**
   * Track escort/delivery completion
   */
  public trackArrival(npcOrItemId: string, destinationReached: boolean, questId?: string) {
    this.completionEngine.trackArrival(npcOrItemId, destinationReached, questId);
  }

  /**
   * Track reputation gains
   */
  public trackReputationGain(factionId: string, amount: number, questId?: string) {
    this.completionEngine.trackReputationGain(factionId, amount, questId);
  }

  /**
   * Track a listening comprehension answer.
   * The AI evaluates whether the player's answer demonstrates comprehension.
   * @param isCorrect Whether the AI determined the answer was correct
   */
  public trackListeningAnswer(isCorrect: boolean, questId?: string) {
    this.completionEngine.trackListeningAnswer(isCorrect, questId);
  }

  /**
   * Track a translation challenge attempt.
   * The AI evaluates translation accuracy.
   * @param isCorrect Whether the translation was accepted
   */
  public trackTranslationAttempt(isCorrect: boolean, questId?: string) {
    this.completionEngine.trackTranslationAttempt(isCorrect, questId);
  }

  /**
   * Track navigation waypoint arrival for navigate_language objectives.
   * Called when the player reaches a waypoint position.
   */
  public trackNavigationWaypoint(questId?: string) {
    const result = this.completionEngine.trackNavigationWaypoint(questId);
    if (!result || result.completed) {
      // Remove previous marker if completed
      if (result?.objective) {
        const prevMarkerId = `${result.objective.id}_nav_${result.nextWaypointIndex - 1}`;
        const prevMarker = this.locationMarkers.get(prevMarkerId);
        if (prevMarker) {
          prevMarker.dispose();
          this.locationMarkers.delete(prevMarkerId);
        }
      }
      return;
    }

    const objective = result.objective!;
    const nextIdx = result.nextWaypointIndex;

    // Remove previous waypoint marker
    const prevMarkerId = `${objective.id}_nav_${nextIdx - 1}`;
    const prevMarker = this.locationMarkers.get(prevMarkerId);
    if (prevMarker) {
      prevMarker.dispose();
      this.locationMarkers.delete(prevMarkerId);
    }

    // Spawn next waypoint beacon
    const waypoints = objective.navigationWaypoints || [];
    const nextWpPos = nextIdx < waypoints.length ? (waypoints[nextIdx].targetPosition || (waypoints[nextIdx] as any).locationPosition) : null;
    if (nextIdx < waypoints.length && nextWpPos) {
      const markerId = `${objective.id}_nav_${nextIdx}`;
      const nextPos = nextWpPos instanceof Vector3 ? nextWpPos : new Vector3(nextWpPos.x ?? 0, nextWpPos.y ?? 0, nextWpPos.z ?? 0);
      const beacon = MeshBuilder.CreateCylinder(
        `nav_beacon_${markerId}`,
        { height: 8, diameter: 1.5, tessellation: 24 },
        this.scene
      );
      beacon.position = nextPos.clone();
      beacon.position.y += 4;

      const material = new StandardMaterial(`nav_mat_${markerId}`, this.scene);
      material.diffuseColor = new Color3(0.2, 0.5, 0.95);
      material.emissiveColor = new Color3(0.1, 0.25, 0.5);
      material.alpha = 0.35;
      beacon.material = material;

      const pulseAnim = new Animation(
        `nav_pulse_${markerId}`, 'material.alpha', 30,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE
      );
      pulseAnim.setKeys([
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 0.2 }
      ]);
      beacon.animations.push(pulseAnim);
      this.scene.beginAnimation(beacon, 0, 60, true);

      this.locationMarkers.set(markerId, beacon);
      // console.log(`[QuestObjectManager] Next navigation waypoint: step ${nextIdx} "${wp.instruction}"`);
    }
  }

  /**
   * Check if any timed objectives have expired and mark them failed.
   * Should be called periodically (e.g., each game tick or every few seconds).
   * Returns descriptions of any expired objectives for UI notification.
   */
  public checkTimedObjectives(): string[] {
    return this.completionEngine.checkTimedObjectives();
  }

  /**
   * Get remaining time for a timed objective in seconds, or null if untimed.
   */
  public getObjectiveTimeRemaining(objectiveId: string): number | null {
    return this.completionEngine.getObjectiveTimeRemaining(objectiveId);
  }

  /**
   * Request a GPS-style waypoint hint for a navigate_language or follow_directions objective.
   * Only shows the next waypoint if not already shown. Increments hint counter.
   * Returns the English hint text, or null if no hint available.
   */
  public requestNavigationHint(questId?: string): string | null {
    for (const quest of this.activeQuests) {
      if (questId && quest.id !== questId) continue;

      for (const objective of (quest.objectives || [])) {
        if (objective.completed) continue;
        if (objective.type !== 'navigate_language' && objective.type !== 'follow_directions') continue;

        objective.hintsRequested = (objective.hintsRequested || 0) + 1;
        objective.showWaypoint = true;

        // Return the English meaning of the current step
        const steps = objective.type === 'navigate_language'
          ? objective.navigationWaypoints
          : objective.directionSteps;
        const currentStep = (objective.stepsCompleted || 0);
        if (steps && currentStep < steps.length) {
          return steps[currentStep].instruction;
        }
        return objective.englishMeaning || objective.description;
      }
    }
    return null;
  }

  /**
   * Track pronunciation attempt for pronunciation_check objectives.
   * Called after the player records voice and receives accuracy feedback.
   * @param passed Whether the pronunciation met the accuracy threshold
   * @param score Pronunciation accuracy score (0-100)
   * @param options Optional richer attempt data: per-word scoring, player
   *                input, and the target phrase — used for UI word feedback
   *                and NPC correction/praise text.
   */
  public trackPronunciationAttempt(
    passed: boolean,
    score: number = 0,
    questId?: string,
    phrase?: string,
    options?: import('../logic/QuestCompletionEngine').PronunciationAttemptOptions,
  ) {
    this.completionEngine.trackPronunciationAttempt(passed, questId, score, phrase, options);
  }

  /**
   * Reveal the next hint on a pronunciation-type objective. Returns the hint
   * text or null when no more hints are available. Revealed hints apply a
   * cumulative score penalty on future successful attempts.
   */
  public revealPronunciationHint(questId: string, objectiveId: string): string | null {
    return this.completionEngine.revealHint(questId, objectiveId);
  }

  /**
   * Set the active NPC correction context so subsequent pronunciation
   * attempts can emit tailored correction/praise responses.
   */
  public setCorrectionContext(ctx: import('../logic/pronunciation-helpers').CorrectionContext) {
    this.completionEngine.setCorrectionContext(ctx);
  }

  /** Clear the active NPC correction context (e.g. when dialogue ends). */
  public clearCorrectionContext() {
    this.completionEngine.clearCorrectionContext();
  }

  /** Subscribe to per-attempt pronunciation feedback (praise / correction / retry). */
  public setOnPronunciationFeedback(
    cb: import('../logic/QuestCompletionEngine').PronunciationFeedbackCallback,
  ) {
    this.completionEngine.setOnPronunciationFeedback(cb);
  }

  /** Complete romance_stage_reach objectives when the player's romance reaches the target stage. */
  public trackRomanceStageReach(currentStage: string, questId?: string) {
    this.completionEngine.trackRomanceStageReach(currentStage, questId);
  }

  /** Complete romance_gift objectives when the player gives a gift to a romance target. */
  public trackRomanceGift(npcId: string, questId?: string) {
    this.completionEngine.trackRomanceGift(npcId, questId);
  }

  /**
   * Track conversation turns with topic context for objectives like
   * ask_for_directions, order_food, haggle_price, introduce_self, build_friendship.
   */
  public trackNpcConversationTurn(npcId: string, topicTag?: string, questId?: string) {
    this.completionEngine.trackNpcConversationTurn(npcId, topicTag, questId);
  }

  /**
   * Track writing submissions for write_response and describe_scene objectives.
   */
  public trackWritingSubmission(text: string, wordCount: number, questId?: string) {
    this.completionEngine.trackWritingSubmission(text, wordCount, questId);
  }

  /**
   * Track a detected conversational action for quest objective completion.
   */
  public trackConversationalAction(action: string, npcId: string, topic?: string, questId?: string) {
    this.completionEngine.trackConversationalAction(action, npcId, topic, questId);
  }

  /**
   * Track accumulated conversation turns per NPC for arrival_conversation objectives.
   */
  public trackConversationTurnCounted(npcId: string, totalTurns: number, meaningfulTurns: number, questId?: string) {
    this.completionEngine.trackConversationTurnCounted(npcId, totalTurns, meaningfulTurns, questId);
  }

  /**
   * Track NPC-initiated conversation acceptance for conversation_initiation objectives.
   */
  public trackConversationInitiation(npcId: string, accepted: boolean, responseQuality?: number, questId?: string) {
    this.completionEngine.trackConversationInitiation(npcId, accepted, responseQuality, questId);
  }

  /**
   * Track teaching a vocabulary word to an NPC for teach_vocabulary objectives.
   */
  public trackTeachWord(npcId: string, word: string, questId?: string) {
    this.completionEngine.trackTeachWord(npcId, word, questId);
  }

  /**
   * Track teaching a phrase to an NPC for teach_phrase objectives.
   */
  public trackTeachPhrase(npcId: string, phrase: string, questId?: string) {
    this.completionEngine.trackTeachPhrase(npcId, phrase, questId);
  }

  /**
   * Get the current vocabulary category for a scavenger hunt objective.
   * Categories rotate each time a scavenger hunt quest is completed.
   */
  public static readonly SCAVENGER_CATEGORIES = [
    'food', 'colors', 'animals', 'clothing', 'household',
    'nature', 'body', 'professions', 'transportation', 'weather'
  ];

  /**
   * Get the next scavenger hunt category, rotating through the list.
   * Pass the index of the last completed category (or -1 for first).
   */
  public static getNextScavengerCategory(lastCategoryIndex: number): string {
    const cats = QuestObjectManager.SCAVENGER_CATEGORIES;
    return cats[(lastCategoryIndex + 1) % cats.length];
  }

  /**
   * Get all active quests
   */
  public getActiveQuests(): Quest[] {
    return this.activeQuests;
  }

  /**
   * Get positions of uncollected quest items for minimap markers.
   * Returns items from collect_item, identify_object, and find_vocabulary_items objectives.
   */
  public getCollectibleItemPositions(): Array<{ id: string; questId: string; itemName: string; position: { x: number; z: number } }> {
    const items: Array<{ id: string; questId: string; itemName: string; position: { x: number; z: number } }> = [];
    this.questObjects.forEach((obj, id) => {
      if (obj.isCollected) return;
      if (obj.type !== 'collect_item' && obj.type !== 'identify_object' && obj.type !== 'find_vocabulary_items') return;
      if (!obj.mesh || obj.mesh.isDisposed()) return;
      items.push({
        id,
        questId: obj.questId,
        itemName: obj.mesh.name,
        position: { x: obj.mesh.position.x, z: obj.mesh.position.z }
      });
    });
    return items;
  }

  /**
   * Dispose all quest objects
   */
  public dispose() {
    this.questObjects.forEach(obj => {
      obj.mesh.dispose();
      obj.label?.dispose();
    });
    this.questObjects.clear();

    this.locationMarkers.forEach(marker => marker.dispose());
    this.locationMarkers.clear();

    this.proceduralObjects.dispose();

    this.activeQuests = [];
    this.completionEngine.clear();
    this.visualVocabDetector.dispose();
  }
}
