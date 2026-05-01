/**
 * InteractionPromptSystem
 *
 * Unified world-space interaction prompt that appears above interactable
 * objects (NPCs, buildings, signs, objects, notice boards) when the player
 * looks at them. Replaces the old HUD-based NPC interaction prompt.
 *
 * Detection uses a hybrid approach:
 *   1. Center-screen ray pick (precise)
 *   2. Proximity + view-cone fallback (reliable for NPCs whose meshes
 *      may be missed by a single ray)
 *
 * Exposes `getCurrentTarget()` so the G key handler can dispatch to the
 * correct action (talk, enter building, examine, read, etc.).
 */

import {
  Scene,
  Mesh,
  AbstractMesh,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
} from '@babylonjs/core';
import type { QuestIndicatorType } from './QuestIndicatorManager';
import type { CEFRLevel } from '@shared/language/cefr';
import type { UIImmersionMode } from '@shared/language/ui-localization';
import type { TranslationLookupFn } from '@shared/language/action-labels';
import {
  buildTranslatedNPCPrompt,
  buildBilingualBuildingPrompt,
  buildTranslatedPrompt,
  translateQuestHint,
} from '@shared/language/in-world-text';

// ── Public types ──────────────────────────────────────────────────────────

export type FurnitureInteractionType = 'seat' | 'bed' | 'bookshelf' | 'workstation' | 'crafting_station';

export type InteractableType =
  | 'npc'
  | 'building'
  | 'sign'
  | 'object'
  | 'notice_board'
  | 'furniture'
  | 'action_hotspot'
  | 'container'
  | 'crafting_station';

export interface InteractableTarget {
  type: InteractableType;
  id: string;
  name: string;
  mesh: AbstractMesh;
  promptText: string;
  questIndicator?: QuestIndicatorType;
  /** For objects/signs */
  objectRole?: string;
  /** For furniture interactions */
  furnitureType?: FurnitureInteractionType;
  /** For action hotspots */
  actionHotspotType?: string;
  /** For containers */
  containerId?: string;
  containerType?: string;
  /** Whether this object can be picked up by the player */
  possessable?: boolean;
  /** For crafting station interactions */
  craftingStationType?: string;
  /** Bilingual subtitle text (e.g., English name below translated name) */
  subtitleText?: string;
  /** NPC role (merchant, guard, etc.) for action resolution */
  npcRole?: string;
}

export interface RegisteredNPC {
  id: string;
  name: string;
  mesh: Mesh;
}

export interface RegisteredBuilding {
  id: string;
  name: string;
  mesh: Mesh;
  /** Door position in world space — used for proximity detection instead of building center */
  doorPosition?: Vector3;
}

export interface ConversationPartnerInfo {
  partnerId: string;
  partnerName: string;
}

export type GetConversationPartnerFn = (npcId: string) => ConversationPartnerInfo | null;
export type GetQuestIndicatorFn = (npcId: string) => QuestIndicatorType;
export type IsSignObjectFn = (objectRole: string) => boolean;

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_NPC_DISTANCE = 25;
const MAX_BUILDING_DISTANCE = 15;
const MAX_OBJECT_DISTANCE = 8;
const MAX_FURNITURE_DISTANCE = 2.5;
/** View-cone half-angle in degrees for fallback NPC detection */
const CONE_HALF_ANGLE_DEG = 20;
const COS_CONE = Math.cos(CONE_HALF_ANGLE_DEG * Math.PI / 180);

/** Billboard dimensions */
const BILLBOARD_WIDTH = 3.2;
const BILLBOARD_HEIGHT = 0.55;
const TEX_WIDTH = 640;
const TEX_HEIGHT = 96;
const QUEST_TEX_HEIGHT = 56;

// ── System ────────────────────────────────────────────────────────────────

export class InteractionPromptSystem {
  private scene: Scene;

  // World-space billboard
  private billboard: Mesh | null = null;
  private billboardMat: StandardMaterial | null = null;
  private billboardTex: DynamicTexture | null = null;
  private questBillboard: Mesh | null = null;
  private questBillboardMat: StandardMaterial | null = null;
  private questBillboardTex: DynamicTexture | null = null;

  // Registered interactables
  private npcs = new Map<string, RegisteredNPC>();
  private npcRootMeshes = new Map<AbstractMesh, RegisteredNPC>();
  private buildings = new Map<string, RegisteredBuilding>();
  private buildingMeshes = new Map<AbstractMesh, RegisteredBuilding>();
  private worldPropMeshes = new Set<Mesh>();
  /** External reference to the game's world prop array (shared, not copied) */
  private worldPropSource: Mesh[] | null = null;
  private noticeBoardMeshes = new Map<AbstractMesh, { id: string; name: string }>();
  private furnitureMeshes = new Map<AbstractMesh, { furnitureType: FurnitureInteractionType; subType: string; buildingId?: string }>();
  private actionHotspotMeshes = new Map<AbstractMesh, { actionType: string; promptText: string; buildingId?: string }>();
  private containerMeshes = new Map<AbstractMesh, { containerId: string; containerType: string; name: string; isLocked?: boolean }>();
  private craftingStationMeshes = new Map<AbstractMesh, { stationType: string; promptText: string; buildingId?: string }>();

  // Callbacks
  private getConversationPartner: GetConversationPartnerFn | null = null;
  private getQuestIndicator: GetQuestIndicatorFn | null = null;
  private isSignObject: IsSignObjectFn | null = null;

  // CEFR-aware translation state
  private _cefrLevel: CEFRLevel = 'A1';
  private _immersionMode: UIImmersionMode = 'auto';
  private _translationLookup: TranslationLookupFn | null = null;

  // State
  private _currentTarget: InteractableTarget | null = null;
  private currentPromptText = '';
  /** Subtitle text rendered below main prompt (e.g., bilingual building name) */
  private currentSubtitleText = '';

  constructor(scene: Scene) {
    this.scene = scene;
    this.createBillboard();
  }

  // ── Callbacks ─────────────────────────────────────────────────────────

  setConversationPartnerCallback(fn: GetConversationPartnerFn): void {
    this.getConversationPartner = fn;
  }

  setQuestIndicatorCallback(fn: GetQuestIndicatorFn): void {
    this.getQuestIndicator = fn;
  }

  setIsSignObjectCallback(fn: IsSignObjectFn): void {
    this.isSignObject = fn;
  }

  /** Update CEFR level for in-world text translation. */
  setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  /** Update immersion mode preference. */
  setImmersionMode(mode: UIImmersionMode): void {
    this._immersionMode = mode;
  }

  /** Set the translation lookup function (from shared translation cache). */
  setTranslationLookup(lookup: TranslationLookupFn): void {
    this._translationLookup = lookup;
  }

  // ── Registration ──────────────────────────────────────────────────────

  registerNPC(npc: RegisteredNPC): void {
    this.npcs.set(npc.id, npc);
    this.npcRootMeshes.set(npc.mesh, npc);
  }

  unregisterNPC(npcId: string): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      this.npcRootMeshes.delete(npc.mesh);
      this.npcs.delete(npcId);
    }
  }

  registerBuilding(building: RegisteredBuilding): void {
    this.buildings.set(building.id, building);
    this.buildingMeshes.set(building.mesh, building);
  }

  unregisterBuilding(buildingId: string): void {
    const b = this.buildings.get(buildingId);
    if (b) {
      this.buildingMeshes.delete(b.mesh);
      this.buildings.delete(buildingId);
    }
  }

  registerWorldProp(mesh: Mesh): void {
    this.worldPropMeshes.add(mesh);
  }

  unregisterWorldProp(mesh: Mesh): void {
    this.worldPropMeshes.delete(mesh);
  }

  /**
   * Share the game's world prop mesh array so the prompt system can iterate
   * over them without manual per-prop registration.
   */
  setWorldPropSource(source: Mesh[]): void {
    this.worldPropSource = source;
  }

  registerNoticeBoard(mesh: Mesh, id: string, name: string): void {
    this.noticeBoardMeshes.set(mesh, { id, name });
  }

  registerFurniture(mesh: AbstractMesh, furnitureType: FurnitureInteractionType, subType: string, buildingId?: string): void {
    this.furnitureMeshes.set(mesh, { furnitureType, subType, buildingId });
  }

  unregisterFurniture(mesh: AbstractMesh): void {
    this.furnitureMeshes.delete(mesh);
  }

  clearFurniture(): void {
    this.furnitureMeshes.clear();
  }

  registerActionHotspot(mesh: AbstractMesh, actionType: string, promptText: string, buildingId?: string): void {
    this.actionHotspotMeshes.set(mesh, { actionType, promptText, buildingId });
  }

  unregisterActionHotspot(mesh: AbstractMesh): void {
    this.actionHotspotMeshes.delete(mesh);
  }

  clearActionHotspots(): void {
    this.actionHotspotMeshes.clear();
  }

  registerContainer(mesh: AbstractMesh, containerId: string, containerType: string, name: string, isLocked?: boolean): void {
    this.containerMeshes.set(mesh, { containerId, containerType, name, isLocked });
  }

  unregisterContainer(mesh: AbstractMesh): void {
    this.containerMeshes.delete(mesh);
  }

  clearContainers(): void {
    this.containerMeshes.clear();
  }

  registerCraftingStation(mesh: AbstractMesh, stationType: string, promptText: string, buildingId?: string): void {
    this.craftingStationMeshes.set(mesh, { stationType, promptText, buildingId });
  }

  unregisterCraftingStation(mesh: AbstractMesh): void {
    this.craftingStationMeshes.delete(mesh);
  }

  clearCraftingStations(): void {
    this.craftingStationMeshes.clear();
  }

  // ── Query ─────────────────────────────────────────────────────────────

  /** The currently targeted interactable (null if nothing in view). */
  getCurrentTarget(): InteractableTarget | null {
    return this._currentTarget;
  }

  /**
   * Get all unique action hotspot types registered within range of a position.
   * Used by the physical action radial menu to show all available actions.
   */
  getNearbyActionHotspotTypes(playerPos: Vector3, maxDistance = MAX_FURNITURE_DISTANCE): string[] {
    const types: Record<string, boolean> = {};
    this.actionHotspotMeshes.forEach((info, mesh) => {
      if (!mesh.isEnabled() || !mesh.isVisible) return;
      const dist = Vector3.Distance(playerPos, mesh.getAbsolutePosition());
      if (dist <= maxDistance) {
        types[info.actionType] = true;
      }
    });
    return Object.keys(types);
  }

  // ── Main update (call from render loop, throttled) ────────────────────

  update(): void {
    const camera = this.scene.activeCamera;
    if (!camera) {
      this.hidePrompt();
      return;
    }

    // For ArcRotateCamera (third-person), camera.target is the player position.
    // Short-range objects (containers, furniture, props) must measure distance from
    // the player, not the camera — otherwise objects behind the player (closer to
    // the camera) are detected while objects in front are out of range.
    const playerPos: Vector3 = (camera as any).target ?? camera.position;

    let target: InteractableTarget | null = null;

    // 1. Center-screen ray pick
    const engine = this.scene.getEngine();
    const pickResult = this.scene.pick(
      engine.getRenderWidth() / 2,
      engine.getRenderHeight() / 2,
    );

    if (pickResult?.hit && pickResult.pickedMesh) {
      target = this.resolveFromMesh(pickResult.pickedMesh, pickResult.distance, playerPos);
    }

    // 2. Fallback: view-cone proximity (primarily helps NPC detection)
    if (!target) {
      target = this.findConeTarget(camera.position, camera.getForwardRay().direction, playerPos);
    }

    // 3. Last resort: if the PLAYER (not camera) is very close to a building door,
    // always show the building entry prompt. Uses camera.target for ArcRotateCamera
    // (which tracks the player), since camera.position is the orbit point behind them.
    if (!target || target.type === 'npc') {
      const DOOR_CLOSE_RANGE = 5;
      const playerPos = (camera as any).target ?? camera.position;
      const nearestDoorDist = this.findNearestBuildingDoorDist(playerPos);
      if (nearestDoorDist !== null && nearestDoorDist < DOOR_CLOSE_RANGE) {
        const building = this.findNearestBuildingByDoor(playerPos);
        if (building) {
          target = this.buildBuildingTarget(building);
        }
      }
    }

    if (target) {
      this.showPrompt(target);
    } else {
      this.hidePrompt();
    }
  }

  // ── Resolution from a picked mesh ─────────────────────────────────────

  private resolveFromMesh(mesh: AbstractMesh, distance: number, playerPos: Vector3): InteractableTarget | null {
    // NPC (walk parent chain)
    const npc = this.findNPCFromMesh(mesh);
    if (npc && distance <= MAX_NPC_DISTANCE) {
      // Before returning NPC, check if a building door is closer to the PLAYER —
      // the player likely wants to enter the building, not talk to an NPC near the door.
      const nearestDoorDist = this.findNearestBuildingDoorDist(playerPos);
      if (nearestDoorDist !== null && nearestDoorDist < 5) {
        const building = this.findNearestBuildingByDoor(playerPos);
        if (building) return this.buildBuildingTarget(building);
      }
      return this.buildNPCTarget(npc);
    }

    // Building (walk parent chain)
    const building = this.findBuildingFromMesh(mesh);
    if (building && distance <= MAX_BUILDING_DISTANCE) {
      return this.buildBuildingTarget(building);
    }

    // For short-range targets, use distance from the player (not the camera) so
    // that third-person camera offset doesn't cause backwards detection.
    const distFromPlayer = (m: AbstractMesh) =>
      Vector3.Distance(playerPos, m.absolutePosition ?? m.getAbsolutePosition());

    // Notice board (walk parent chain)
    const nb = this.findNoticeBoardFromMesh(mesh);
    if (nb && distFromPlayer(mesh) <= MAX_OBJECT_DISTANCE) {
      return {
        type: 'notice_board',
        id: nb.id,
        name: nb.name,
        mesh,
        promptText: buildTranslatedPrompt('Enter', 'Read', nb.name, this._cefrLevel, this._immersionMode, this._translationLookup ?? undefined),
      };
    }

    // Furniture (walk parent chain)
    const furn = this.findFurnitureFromMesh(mesh);
    if (furn && distFromPlayer(furn.mesh) <= MAX_FURNITURE_DISTANCE) {
      return this.buildFurnitureTarget(furn.mesh, furn.info);
    }

    // Action hotspot (walk parent chain)
    const hotspot = this.findActionHotspotFromMesh(mesh);
    if (hotspot && distFromPlayer(hotspot.mesh) <= MAX_FURNITURE_DISTANCE) {
      return {
        type: 'action_hotspot',
        id: `hotspot_${hotspot.info.actionType}`,
        name: hotspot.info.actionType,
        mesh: hotspot.mesh,
        promptText: hotspot.info.promptText,
        actionHotspotType: hotspot.info.actionType,
      };
    }

    // Container (walk parent chain)
    const container = this.findContainerFromMesh(mesh);
    if (container && distFromPlayer(container.mesh) <= MAX_OBJECT_DISTANCE) {
      return this.buildContainerTarget(container.mesh, container.info);
    }

    // World prop (walk parent chain to find registered prop)
    const prop = this.findWorldPropFromMesh(mesh);
    if (prop && distFromPlayer(prop) <= MAX_OBJECT_DISTANCE) {
      return this.buildPropTarget(prop);
    }

    return null;
  }

  // ── View-cone fallback ────────────────────────────────────────────────

  private findConeTarget(
    cameraPos: Vector3,
    forward: Vector3,
    playerPos: Vector3,
  ): InteractableTarget | null {
    const fwd = forward.normalize();
    let best: InteractableTarget | null = null;
    let bestDist = Infinity;

    // Helper: for short-range targets, use player position for distance AND direction
    // checks so third-person camera offset doesn't cause backwards detection.
    const playerFwd = playerPos.subtract(cameraPos);
    // If camera is essentially at the player (first-person), fall back to camera forward
    const usePlayerFwd = playerFwd.length() > 0.5;
    const playerFwdNorm = usePlayerFwd ? playerFwd.normalize() : fwd;

    // NPCs — use camera position (long range, not affected by offset)
    this.npcs.forEach((npc) => {
      if (!npc.mesh || npc.mesh.isDisposed()) return;
      const toTarget = npc.mesh.position.subtract(cameraPos);
      const dist = toTarget.length();
      if (dist > MAX_NPC_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), fwd);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = this.buildNPCTarget(npc);
      }
    });

    // Buildings — use camera position (long range)
    this.buildings.forEach((building) => {
      if (!building.mesh || building.mesh.isDisposed()) return;
      const targetPos = building.doorPosition ?? building.mesh.position;
      const toTarget = targetPos.subtract(cameraPos);
      const dist = toTarget.length();
      if (dist > MAX_BUILDING_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), fwd);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = this.buildBuildingTarget(building);
      }
    });

    // World props — use player position for distance and direction
    const checkProp = (mesh: Mesh) => {
      if (!mesh || mesh.isDisposed()) return;
      const toTarget = mesh.position.subtract(playerPos);
      const dist = toTarget.length();
      if (dist > MAX_OBJECT_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), playerFwdNorm);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = this.buildPropTarget(mesh);
      }
    };
    this.worldPropMeshes.forEach(checkProp);
    if (this.worldPropSource) {
      for (let i = 0; i < this.worldPropSource.length; i++) {
        checkProp(this.worldPropSource[i]);
      }
    }

    // Notice boards — use player position
    this.noticeBoardMeshes.forEach((nb, mesh) => {
      if (!mesh || (mesh as Mesh).isDisposed?.()) return;
      const toTarget = mesh.absolutePosition.subtract(playerPos);
      const dist = toTarget.length();
      if (dist > MAX_OBJECT_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), playerFwdNorm);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = {
          type: 'notice_board',
          id: nb.id,
          name: nb.name,
          mesh,
          promptText: buildTranslatedPrompt('Enter', 'Read', nb.name, this._cefrLevel, this._immersionMode, this._translationLookup ?? undefined),
        };
      }
    });

    // Furniture — use player position
    this.furnitureMeshes.forEach((info, mesh) => {
      if (!mesh || (mesh as Mesh).isDisposed?.()) return;
      const toTarget = mesh.absolutePosition.subtract(playerPos);
      const dist = toTarget.length();
      if (dist > MAX_FURNITURE_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), playerFwdNorm);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = this.buildFurnitureTarget(mesh, info);
      }
    });

    // Containers — use player position
    this.containerMeshes.forEach((info, mesh) => {
      if (!mesh || (mesh as Mesh).isDisposed?.()) return;
      const toTarget = mesh.absolutePosition.subtract(playerPos);
      const dist = toTarget.length();
      if (dist > MAX_OBJECT_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), playerFwdNorm);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = this.buildContainerTarget(mesh, info);
      }
    });

    // Crafting stations — use player position
    this.craftingStationMeshes.forEach((info, mesh) => {
      if (!mesh || (mesh as Mesh).isDisposed?.()) return;
      const toTarget = mesh.absolutePosition.subtract(playerPos);
      const dist = toTarget.length();
      if (dist > MAX_FURNITURE_DISTANCE || dist >= bestDist) return;
      const dot = Vector3.Dot(toTarget.normalize(), playerFwdNorm);
      if (dot >= COS_CONE) {
        bestDist = dist;
        best = {
          type: 'crafting_station',
          id: `crafting_${info.stationType}`,
          name: info.stationType,
          mesh,
          promptText: info.promptText,
          craftingStationType: info.stationType,
        };
      }
    });

    return best;
  }

  // ── Target builders ───────────────────────────────────────────────────

  private buildNPCTarget(npc: RegisteredNPC): InteractableTarget {
    const questIndicator = this.getQuestIndicator?.(npc.id) ?? null;
    const lookup = this._translationLookup ?? undefined;
    const npcRole = npc.mesh?.metadata?.npcRole as string | undefined;

    return {
      type: 'npc',
      id: npc.id,
      name: npc.name,
      mesh: npc.mesh,
      promptText: buildTranslatedNPCPrompt(
        'Enter', 'Talk to', npc.name,
        this._cefrLevel, this._immersionMode, lookup,
      ),
      questIndicator: questIndicator ?? undefined,
      npcRole,
    };
  }

  /** Find distance to the nearest building door from a position. */
  private findNearestBuildingDoorDist(pos: Vector3): number | null {
    let best: number | null = null;
    this.buildings.forEach((b) => {
      if (!b.doorPosition || !b.mesh || b.mesh.isDisposed()) return;
      const d = Vector3.Distance(pos, b.doorPosition);
      if (best === null || d < best) best = d;
    });
    return best;
  }

  /** Find the nearest building by door distance. */
  private findNearestBuildingByDoor(pos: Vector3): RegisteredBuilding | null {
    let best: RegisteredBuilding | null = null;
    let bestDist = Infinity;
    this.buildings.forEach((b) => {
      if (!b.doorPosition || !b.mesh || b.mesh.isDisposed()) return;
      const d = Vector3.Distance(pos, b.doorPosition);
      if (d < bestDist) { bestDist = d; best = b; }
    });
    return best;
  }

  private buildBuildingTarget(building: RegisteredBuilding): InteractableTarget {
    const lookup = this._translationLookup ?? undefined;
    const { promptText, subtitleText } = buildBilingualBuildingPrompt(
      'Enter', 'Enter', building.name,
      this._cefrLevel, this._immersionMode, lookup,
    );
    return {
      type: 'building',
      id: building.id,
      name: building.name,
      mesh: building.mesh,
      promptText,
      subtitleText,
    };
  }

  private buildPropTarget(mesh: Mesh): InteractableTarget {
    const objectRole: string = (mesh.metadata?.objectRole || mesh.name || '').toLowerCase();
    const isSign = this.isSignObject?.(objectRole) ?? false;
    const prettyName = this.formatObjectName(objectRole);
    const lookup = this._translationLookup ?? undefined;

    if (isSign) {
      return {
        type: 'sign',
        id: objectRole,
        name: prettyName,
        mesh,
        promptText: buildTranslatedPrompt('Enter', 'Read', prettyName, this._cefrLevel, this._immersionMode, lookup),
        objectRole,
      };
    }

    // Book objects show pickup prompt with title
    if (objectRole === 'book' && mesh.metadata?.bookData) {
      const bookTitle = mesh.metadata.bookData.title || 'Book';
      return {
        type: 'object',
        id: mesh.metadata.bookData.textId || objectRole,
        name: bookTitle,
        mesh,
        promptText: buildTranslatedPrompt('G', 'Pick up', `"${bookTitle}"`, this._cefrLevel, this._immersionMode, lookup),
        objectRole: 'book',
        possessable: true,
      };
    }

    const possessable = mesh.metadata?.possessable !== false;

    return {
      type: 'object',
      id: objectRole,
      name: prettyName,
      mesh,
      promptText: possessable
        ? buildTranslatedPrompt('G', 'Pick up', prettyName, this._cefrLevel, this._immersionMode, lookup)
        : buildTranslatedPrompt('Enter', 'Examine', prettyName, this._cefrLevel, this._immersionMode, lookup),
      objectRole,
      possessable,
    };
  }

  private buildFurnitureTarget(
    mesh: AbstractMesh,
    info: { furnitureType: FurnitureInteractionType; subType: string; buildingId?: string },
  ): InteractableTarget {
    const prettyName = this.formatObjectName(info.subType);
    const lookup = this._translationLookup ?? undefined;
    let verb: string;
    switch (info.furnitureType) {
      case 'seat':
        verb = 'Sit on';
        break;
      case 'bed':
        verb = 'Sleep in';
        break;
      case 'bookshelf':
        verb = 'Read';
        break;
      case 'workstation':
        verb = 'Use';
        break;
      default:
        verb = 'Interact with';
    }
    return {
      type: 'furniture',
      id: `furniture_${info.furnitureType}_${mesh.uniqueId}`,
      name: prettyName,
      mesh,
      promptText: buildTranslatedPrompt('Enter', verb, prettyName, this._cefrLevel, this._immersionMode, lookup),
      furnitureType: info.furnitureType,
    };
  }

  private buildContainerTarget(
    mesh: AbstractMesh,
    info: { containerId: string; containerType: string; name: string; isLocked?: boolean },
  ): InteractableTarget {
    const prettyName = this.formatObjectName(info.name || info.containerType);
    const lookup = this._translationLookup ?? undefined;
    const suffix = info.isLocked ? ' (Locked)' : '';
    const promptText = buildTranslatedPrompt('Enter', 'Open', prettyName + suffix, this._cefrLevel, this._immersionMode, lookup);
    return {
      type: 'container',
      id: info.containerId,
      name: prettyName,
      mesh,
      promptText,
      containerId: info.containerId,
      containerType: info.containerType,
    };
  }

  // ── Mesh → interactable lookups ───────────────────────────────────────

  private findNPCFromMesh(mesh: AbstractMesh): RegisteredNPC | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const npc = this.npcRootMeshes.get(current);
      if (npc) return npc;
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findBuildingFromMesh(mesh: AbstractMesh): RegisteredBuilding | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const b = this.buildingMeshes.get(current);
      if (b) return b;
      // Also check metadata
      if (current.metadata?.buildingId) {
        const id = current.metadata.buildingId;
        const found = this.buildings.get(id);
        if (found) return found;
      }
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findNoticeBoardFromMesh(mesh: AbstractMesh): { id: string; name: string } | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const nb = this.noticeBoardMeshes.get(current);
      if (nb) return nb;
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findFurnitureFromMesh(mesh: AbstractMesh): { mesh: AbstractMesh; info: { furnitureType: FurnitureInteractionType; subType: string; buildingId?: string } } | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const info = this.furnitureMeshes.get(current);
      if (info) return { mesh: current, info };
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findActionHotspotFromMesh(mesh: AbstractMesh): { mesh: AbstractMesh; info: { actionType: string; promptText: string; buildingId?: string } } | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const info = this.actionHotspotMeshes.get(current);
      if (info) return { mesh: current, info };
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findContainerFromMesh(mesh: AbstractMesh): { mesh: AbstractMesh; info: { containerId: string; containerType: string; name: string; isLocked?: boolean } } | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      const info = this.containerMeshes.get(current);
      if (info) return { mesh: current, info };
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private findWorldPropFromMesh(mesh: AbstractMesh): Mesh | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      if (this.worldPropMeshes.has(current as Mesh)) return current as Mesh;
      if (this.worldPropSource?.includes(current as Mesh)) return current as Mesh;
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  // ── Billboard creation & rendering ────────────────────────────────────

  private createBillboard(): void {
    // Main prompt billboard
    this.billboard = MeshBuilder.CreatePlane(
      'interaction_prompt_billboard',
      { width: BILLBOARD_WIDTH, height: BILLBOARD_HEIGHT },
      this.scene,
    );
    this.billboard.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.billboard.isPickable = false;
    this.billboard.renderingGroupId = 3;
    this.billboard.isVisible = false;

    this.billboardMat = new StandardMaterial('interaction_prompt_mat', this.scene);
    this.billboardMat.disableLighting = true;
    this.billboardMat.backFaceCulling = false;
    this.billboardMat.useAlphaFromDiffuseTexture = true;
    this.billboard.material = this.billboardMat;

    // Quest hint billboard (below main)
    this.questBillboard = MeshBuilder.CreatePlane(
      'interaction_quest_billboard',
      { width: BILLBOARD_WIDTH * 0.7, height: BILLBOARD_HEIGHT * 0.6 },
      this.scene,
    );
    this.questBillboard.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.questBillboard.isPickable = false;
    this.questBillboard.renderingGroupId = 3;
    this.questBillboard.isVisible = false;

    this.questBillboardMat = new StandardMaterial('interaction_quest_mat', this.scene);
    this.questBillboardMat.disableLighting = true;
    this.questBillboardMat.backFaceCulling = false;
    this.questBillboardMat.useAlphaFromDiffuseTexture = true;
    this.questBillboard.material = this.questBillboardMat;
  }

  private showPrompt(target: InteractableTarget): void {
    if (!this.billboard) return;

    const subtitle = target.subtitleText || '';

    // Update text only if changed
    if (target.promptText !== this.currentPromptText || subtitle !== this.currentSubtitleText) {
      this.currentPromptText = target.promptText;
      this.currentSubtitleText = subtitle;
      this.renderBillboardText(target.promptText, subtitle);
    }

    // Position above the target mesh
    const meshPos = target.mesh.absolutePosition || target.mesh.position;
    const heightOffset = this.getHeightOffset(target.type);
    this.billboard.position.set(meshPos.x, meshPos.y + heightOffset, meshPos.z);
    this.billboard.isVisible = true;

    // Quest hint (NPC only)
    if (this.questBillboard) {
      if (target.questIndicator) {
        const hint = this.getQuestHintText(target.questIndicator);
        this.renderQuestHintText(hint.text, hint.color);
        this.questBillboard.position.set(
          meshPos.x,
          meshPos.y + heightOffset - BILLBOARD_HEIGHT * 0.9,
          meshPos.z,
        );
        this.questBillboard.isVisible = true;
      } else {
        this.questBillboard.isVisible = false;
      }
    }

    this._currentTarget = target;
  }

  private hidePrompt(): void {
    if (this._currentTarget === null && this.currentPromptText === '') return;
    this._currentTarget = null;
    this.currentPromptText = '';
    this.currentSubtitleText = '';
    if (this.billboard) this.billboard.isVisible = false;
    if (this.questBillboard) this.questBillboard.isVisible = false;
  }

  private getHeightOffset(type: InteractableType): number {
    switch (type) {
      case 'npc':
        return 3.0;
      case 'building':
        return 5.0;
      case 'sign':
      case 'notice_board':
        return 3.0;
      case 'object':
        return 2.0;
      case 'furniture':
        return 1.5;
      case 'container':
        return 1.8;
      default:
        return 2.5;
    }
  }

  private renderBillboardText(text: string, subtitle?: string): void {
    if (!this.billboardMat || !this.billboard) return;

    // Dispose old texture
    this.billboardTex?.dispose();

    // If subtitle present, use a taller texture to fit both lines
    const hasSubtitle = !!subtitle;
    const texHeight = hasSubtitle ? TEX_HEIGHT + 32 : TEX_HEIGHT;
    const billboardHeight = hasSubtitle
      ? BILLBOARD_HEIGHT * (texHeight / TEX_HEIGHT)
      : BILLBOARD_HEIGHT;
    this.billboard.scaling.y = billboardHeight / BILLBOARD_HEIGHT;

    // Measure text width using an offscreen canvas to determine required texture size
    const keyMatch = text.match(/^\[([A-Za-z]+)\]:/);
    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d')!;
    let totalTextWidth: number;
    if (keyMatch) {
      mCtx.font = 'bold 34px Arial';
      const keyWidth = mCtx.measureText(keyMatch[0]).width;
      mCtx.font = '32px Arial';
      const actionWidth = mCtx.measureText(text.slice(keyMatch[0].length)).width;
      totalTextWidth = keyWidth + actionWidth;
    } else {
      mCtx.font = '32px Arial';
      totalTextWidth = mCtx.measureText(text).width;
    }

    // Also measure subtitle width if present
    if (hasSubtitle) {
      mCtx.font = '22px Arial';
      const subtitleWidth = mCtx.measureText(subtitle).width;
      totalTextWidth = Math.max(totalTextWidth, subtitleWidth);
    }

    // Size texture to fit text with padding (minimum TEX_WIDTH for short text)
    const padding = 60;
    const texWidth = Math.max(TEX_WIDTH, Math.ceil(totalTextWidth + padding));
    // Scale billboard world-width proportionally
    const billboardWidth = BILLBOARD_WIDTH * (texWidth / TEX_WIDTH);
    this.billboard.scaling.x = billboardWidth / BILLBOARD_WIDTH;

    const tex = new DynamicTexture(
      'interaction_prompt_tex',
      { width: texWidth, height: texHeight },
      this.scene,
    );
    tex.hasAlpha = true;

    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, texWidth, texHeight);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(4, 4, texWidth - 8, texHeight - 8, 14);
    } else {
      ctx.rect(4, 4, texWidth - 8, texHeight - 8);
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(4, 4, texWidth - 8, texHeight - 8, 14);
    } else {
      ctx.rect(4, 4, texWidth - 8, texHeight - 8);
    }
    ctx.stroke();

    // Vertical center: if subtitle, shift main text up
    const mainY = hasSubtitle ? texHeight / 2 - 14 : texHeight / 2;

    // Key highlight — find the bracket portion like "[Enter]:" or "[Y]:"
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (keyMatch) {
      const keyPart = keyMatch[0]; // e.g. "[Enter]:"
      const actionPart = text.slice(keyPart.length); // e.g. " Talk to Maria"

      // Measure widths
      ctx.font = 'bold 34px Arial';
      const keyWidth = ctx.measureText(keyPart).width;
      ctx.font = '32px Arial';
      const actionWidth = ctx.measureText(actionPart).width;
      const totalWidth = keyWidth + actionWidth;
      const startX = (texWidth - totalWidth) / 2;

      // Key part in accent color
      ctx.font = 'bold 34px Arial';
      ctx.fillStyle = '#FFD740';
      ctx.textAlign = 'left';
      ctx.fillText(keyPart, startX, mainY);

      // Action part in white
      ctx.font = '32px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(actionPart, startX + keyWidth, mainY);
    } else {
      ctx.font = '32px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, texWidth / 2, mainY);
    }

    // Render subtitle below main text (smaller, muted color)
    if (hasSubtitle) {
      ctx.font = '22px Arial';
      ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(subtitle, texWidth / 2, mainY + 30);
    }

    tex.update();
    this.billboardMat.diffuseTexture = tex;
    this.billboardMat.emissiveColor = Color3.White();
    this.billboardTex = tex;
  }

  private renderQuestHintText(text: string, color: string): void {
    if (!this.questBillboardMat) return;

    this.questBillboardTex?.dispose();

    const tw = 448;
    const th = QUEST_TEX_HEIGHT;
    const tex = new DynamicTexture('interaction_quest_tex', { width: tw, height: th }, this.scene);
    tex.hasAlpha = true;

    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, tw, th);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(3, 3, tw - 6, th - 6, 10);
    else ctx.rect(3, 3, tw - 6, th - 6);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tw / 2, th / 2);
    tex.update();

    this.questBillboardMat.diffuseTexture = tex;
    this.questBillboardMat.emissiveColor = Color3.White();
    this.questBillboardTex = tex;
  }

  private getQuestHintText(type: QuestIndicatorType): { text: string; color: string } {
    const lookup = this._translationLookup ?? undefined;
    switch (type) {
      case 'available':
        return { text: translateQuestHint('Quest Available', this._cefrLevel, this._immersionMode, lookup), color: '#FFD700' };
      case 'objective':
        return { text: translateQuestHint('Quest Objective', this._cefrLevel, this._immersionMode, lookup), color: '#FFD700' };
      case 'in_progress':
        return { text: translateQuestHint('Quest In Progress', this._cefrLevel, this._immersionMode, lookup), color: '#C0C0C0' };
      case 'turn_in':
        return { text: translateQuestHint('Quest Ready to Turn In!', this._cefrLevel, this._immersionMode, lookup), color: '#32CD32' };
      default:
        return { text: '', color: '#FFFFFF' };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private formatObjectName(objectRole: string): string {
    return objectRole
      .split(/[_\s]+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.billboardTex?.dispose();
    this.questBillboardTex?.dispose();
    this.billboard?.dispose();
    this.questBillboard?.dispose();
    this.billboardMat?.dispose();
    this.questBillboardMat?.dispose();
    this.npcs.clear();
    this.npcRootMeshes.clear();
    this.buildings.clear();
    this.buildingMeshes.clear();
    this.worldPropMeshes.clear();
    this.noticeBoardMeshes.clear();
    this.furnitureMeshes.clear();
    this.actionHotspotMeshes.clear();
    this.containerMeshes.clear();
    this.craftingStationMeshes.clear();
  }
}
