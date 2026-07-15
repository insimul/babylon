/**
 * WorldObjectActionManager
 *
 * Wires the four object-interaction actions (identify_object, examine_object,
 * point_and_name, read_sign) to world objects (meshes + DB items).
 *
 * Responsibilities:
 *  - Finds the nearest interactable world object within range
 *  - Dispatches the correct action based on object type (sign vs regular object)
 *  - Emits typed events on GameEventBus for quest tracking
 *  - Delegates to PointAndNameAction for naming prompts
 *  - Delegates to ObjectIdentificationSystem for identification quests
 *  - Delegates to ReadSignAction helpers for sign reading
 */

import type { GameEventBus } from './GameEventBus';
import { PointAndNameAction, type NameableObject } from './PointAndNameAction';
import { ObjectIdentificationSystem, type IdentificationTarget } from './ObjectIdentificationSystem';
import { executeReadSign, getFluencyTier, type SignData } from './actions/ReadSignAction';
import { getItemTranslation } from '@shared/game-engine/rendering/OnboardingLauncher';

// ── Types ───────────────────────────────────────────────────────────────────

export interface WorldObjectRef {
  /** DB item id */
  id: string;
  /** objectRole from mesh metadata — links mesh to DB item */
  objectRole: string;
  /** Display name */
  name: string;
  /** World position */
  position: { x: number; y: number; z: number };
  /** Language learning translations dict keyed by language */
  translations?: Record<string, {
    targetWord: string;
    pronunciation?: string;
    category?: string;
  }> | null;
  /** Sign data (if this is a readable sign) */
  signData?: SignData;
  /** Whether this object is a sign */
  isSign: boolean;
  /** Item description */
  description?: string;
}

export interface ExamineResult {
  objectRef: WorldObjectRef;
  action: 'examine_object' | 'read_sign';
  displayTitle: string;
  displayDescription: string;
}

export interface WorldObjectActionManagerConfig {
  /** Max distance to interact with objects. Default 5. */
  interactionRange?: number;
  /** Target language for translation lookups. Default 'Spanish'. */
  targetLanguage?: string;
}

// ── Sign detection helpers ──────────────────────────────────────────────────

const SIGN_ROLES = new Set([
  'sign', 'signpost', 'sign_post', 'notice', 'notice_board',
  'billboard', 'plaque', 'marker', 'street_sign', 'shop_sign',
]);

function isSignRole(objectRole: string): boolean {
  const role = objectRole.toLowerCase();
  return SIGN_ROLES.has(role) || role.includes('sign') || role.includes('notice');
}

/** Resolve a flat translation entry from a WorldObjectRef's translations dict. */
function resolveTranslation(
  obj: WorldObjectRef,
  targetLanguage: string,
): { targetWord: string; pronunciation?: string; category?: string } | null {
  return getItemTranslation(obj as any, targetLanguage);
}

// ── Manager ─────────────────────────────────────────────────────────────────

export class WorldObjectActionManager {
  private eventBus: GameEventBus;
  private pointAndName: PointAndNameAction;
  private identification: ObjectIdentificationSystem;

  private objects: Map<string, WorldObjectRef> = new Map();
  private interactionRange: number;
  private targetLanguage: string;

  /** Callback: show a toast/notification */
  private onToast?: (title: string, description: string, duration?: number) => void;
  /** Callback: prompt the player for text input (point-and-name) */
  private onPromptInput?: (prompt: string, objectRef: WorldObjectRef) => void;

  constructor(eventBus: GameEventBus, config?: WorldObjectActionManagerConfig) {
    this.eventBus = eventBus;
    this.interactionRange = config?.interactionRange ?? 5;
    this.targetLanguage = config?.targetLanguage ?? 'Spanish';

    this.pointAndName = new PointAndNameAction(eventBus);
    this.identification = new ObjectIdentificationSystem(eventBus);

    // Wire PointAndNameAction callbacks
    this.pointAndName.setOnPrompt((obj, attemptsLeft) => {
      this.onPromptInput?.(
        `Name this object in the target language (${attemptsLeft} attempts left):`,
        this.objects.get(obj.objectId) ?? { id: obj.objectId, objectRole: '', name: obj.englishMeaning, position: obj.position, isSign: false },
      );
    });

    this.pointAndName.setOnResult((result) => {
      if (result.correct) {
        this.onToast?.('Correct!', `${result.expectedWord} = ${result.englishMeaning} (+${result.xpAwarded} XP)`, 2500);
      } else {
        this.onToast?.('Try again', `That's not quite right. Expected: ${result.expectedWord}`, 2000);
      }
    });

    this.pointAndName.setOnReveal((obj) => {
      this.onToast?.('Answer revealed', `The word is: ${obj.targetWord} (${obj.englishMeaning})`, 3000);
    });

    // Wire ObjectIdentificationSystem callbacks
    this.identification.setOnObjectiveCompleted((questId, objectiveId) => {
      // Identification quests are tracked via event bus — the QuestCompletionEngine handles the rest
    });
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  setOnToast(cb: (title: string, description: string, duration?: number) => void): void {
    this.onToast = cb;
  }

  setOnPromptInput(cb: (prompt: string, objectRef: WorldObjectRef) => void): void {
    this.onPromptInput = cb;
  }

  // ── Object registration ───────────────────────────────────────────────────

  /**
   * Register world objects from DB items and mesh positions.
   * Call this after world items and meshes are loaded.
   */
  registerObjects(
    worldItems: Array<{
      id: string;
      objectRole?: string;
      name?: string;
      description?: string;
      translations?: WorldObjectRef['translations'];
      signData?: SignData;
    }>,
    meshPositions: Map<string, { x: number; y: number; z: number }>,
  ): void {
    this.objects.clear();

    for (const item of worldItems) {
      if (!item.objectRole) continue;

      const role = item.objectRole.toLowerCase();
      const position = meshPositions.get(role) ?? { x: 0, y: 0, z: 0 };
      const isSign = isSignRole(role) || !!item.signData;

      const ref: WorldObjectRef = {
        id: item.id,
        objectRole: role,
        name: item.name ?? role,
        position,
        translations: item.translations,
        signData: item.signData,
        isSign,
        description: item.description,
      };

      this.objects.set(role, ref);

      // Register with PointAndNameAction if it has language data
      const resolved = resolveTranslation(ref, this.targetLanguage);
      if (resolved?.targetWord) {
        this.pointAndName.registerObject({
          objectId: role,
          targetWord: resolved.targetWord,
          englishMeaning: item.name ?? role,
          category: resolved.category ?? 'general',
          difficulty: 'beginner',
          position,
        });
      }
    }
  }

  /**
   * Register identification targets from quest objectives.
   */
  registerIdentificationTargets(targets: IdentificationTarget[]): void {
    for (const target of targets) {
      this.identification.registerTarget(target);
    }
  }

  removeIdentificationTargets(questId: string): void {
    this.identification.removeQuestTargets(questId);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Find the nearest world object within interaction range of a position.
   */
  findNearestObject(playerPos: { x: number; z: number }): WorldObjectRef | null {
    let nearest: WorldObjectRef | null = null;
    let nearestDist = Infinity;

    for (const ref of Array.from(this.objects.values())) {
      const dx = playerPos.x - ref.position.x;
      const dz = playerPos.z - ref.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= this.interactionRange && dist < nearestDist) {
        nearest = ref;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  /**
   * Examine the nearest object. For signs, triggers read_sign. For other
   * objects, triggers examine_object. Emits the appropriate event.
   */
  examineNearest(
    playerPos: { x: number; z: number },
    isLanguageWorld: boolean,
    playerFluency?: number,
  ): ExamineResult | null {
    const obj = this.findNearestObject(playerPos);
    if (!obj) return null;

    if (obj.isSign) {
      return this.readSign(obj, isLanguageWorld, playerFluency ?? 0);
    }

    return this.examineObject(obj, isLanguageWorld);
  }

  /**
   * Execute examine_object on a specific world object.
   */
  examineObject(obj: WorldObjectRef, isLanguageWorld: boolean): ExamineResult {
    const langData = resolveTranslation(obj, this.targetLanguage);

    let displayTitle: string;
    let displayDescription: string;

    if (isLanguageWorld && langData?.targetWord) {
      const pronunciation = langData.pronunciation ? ` [${langData.pronunciation}]` : '';
      displayTitle = langData.targetWord;
      displayDescription = `${obj.name}${pronunciation}`;
    } else {
      displayTitle = obj.name;
      displayDescription = obj.description ?? 'You examine the object closely.';
    }

    this.eventBus.emit({
      type: 'object_examined',
      objectId: obj.id,
      objectName: obj.name,
      targetWord: langData?.targetWord ?? '',
      targetLanguage: this.targetLanguage,
      pronunciation: langData?.pronunciation,
      category: langData?.category,
    });

    return { objectRef: obj, action: 'examine_object', displayTitle, displayDescription };
  }

  /**
   * Execute read_sign on a sign object.
   */
  readSign(obj: WorldObjectRef, isLanguageWorld: boolean, playerFluency: number): ExamineResult {
    const langData = resolveTranslation(obj, this.targetLanguage);
    const signData: SignData = obj.signData ?? {
      signId: obj.id,
      targetText: langData?.targetWord ?? obj.name,
      nativeText: obj.name,
      category: langData?.category,
    };

    let displayTitle: string;
    let displayDescription: string;

    if (isLanguageWorld && signData.targetText) {
      const tier = getFluencyTier(playerFluency);
      if (tier === 'beginner') {
        displayTitle = signData.targetText;
        displayDescription = `(${signData.nativeText})`;
      } else {
        displayTitle = signData.targetText;
        displayDescription = obj.description ?? 'You read the sign.';
      }
    } else {
      displayTitle = obj.name;
      displayDescription = obj.description ?? 'You read the sign.';
    }

    this.eventBus.emit({
      type: 'sign_read',
      signId: signData.signId,
      objectId: obj.id,
      targetText: signData.targetText,
      nativeText: signData.nativeText,
      category: signData.category,
    });

    // Also emit object_examined for general tracking
    this.eventBus.emit({
      type: 'object_examined',
      objectId: obj.id,
      objectName: obj.name,
      targetWord: signData.targetText,
      targetLanguage: this.targetLanguage,
      pronunciation: langData?.pronunciation,
      category: signData.category,
    });

    return { objectRef: obj, action: 'read_sign', displayTitle, displayDescription };
  }

  /**
   * Trigger identify_object: prompt the player to identify an object.
   * Used by quest objectives of type identify_object.
   */
  identifyObject(targetId: string): boolean {
    const prompt = this.identification.triggerPrompt(targetId);
    if (!prompt) return false;

    const obj = this.objects.get(targetId);
    if (obj) {
      this.onToast?.(prompt.promptText, prompt.hint ?? '', 5000);
    }
    return true;
  }

  /**
   * Submit an identification answer.
   */
  submitIdentification(targetId: string, playerInput: string): { passed: boolean; feedback: string } {
    const result = this.identification.submitAnswer(targetId, playerInput);

    if (result.passed) {
      const obj = this.objects.get(targetId);
      this.eventBus.emit({
        type: 'object_identified',
        objectId: targetId,
        objectName: obj?.name ?? targetId,
        targetWord: result.bestMatch,
        category: obj ? resolveTranslation(obj, this.targetLanguage)?.category : undefined,
      });
    }

    return { passed: result.passed, feedback: result.feedback };
  }

  /**
   * Trigger point_and_name: prompt the player to name an object.
   */
  pointAndNameObject(objectRole: string): boolean {
    return this.pointAndName.pointAt(objectRole);
  }

  /**
   * Submit a point-and-name answer.
   */
  submitPointAndName(objectRole: string, playerInput: string): { correct: boolean; feedback: string } | null {
    const result = this.pointAndName.submitName(objectRole, playerInput);
    if (!result) return null;

    if (result.correct) {
      this.eventBus.emit({
        type: 'object_identified',
        objectId: objectRole,
        objectName: result.englishMeaning,
        targetWord: result.expectedWord,
        category: result.category,
      });
    }

    return {
      correct: result.correct,
      feedback: result.correct
        ? `Correct! ${result.expectedWord} = ${result.englishMeaning}`
        : `Try again. (${result.attempts} attempt${result.attempts !== 1 ? 's' : ''})`,
    };
  }

  /**
   * Get objects in range for point-and-name.
   */
  getNameableObjectsInRange(playerPos: { x: number; y: number; z: number }): string[] {
    return this.pointAndName.getObjectsInRange(playerPos);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * Check whether an objectRole corresponds to a sign/readable object.
   */
  isSignObject(objectRole: string): boolean {
    const ref = this.objects.get(objectRole);
    if (ref) return ref.isSign;
    return isSignRole(objectRole);
  }

  getObject(objectRole: string): WorldObjectRef | null {
    return this.objects.get(objectRole) ?? null;
  }

  getObjectCount(): number {
    return this.objects.size;
  }

  getSignCount(): number {
    let count = 0;
    for (const obj of Array.from(this.objects.values())) {
      if (obj.isSign) count++;
    }
    return count;
  }

  getPointAndNameAction(): PointAndNameAction {
    return this.pointAndName;
  }

  getIdentificationSystem(): ObjectIdentificationSystem {
    return this.identification;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.objects.clear();
    this.pointAndName.dispose();
    this.identification.dispose();
    this.onToast = undefined;
    this.onPromptInput = undefined;
  }
}
