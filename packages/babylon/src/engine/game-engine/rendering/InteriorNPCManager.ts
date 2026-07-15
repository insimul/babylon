/**
 * InteriorNPCManager
 *
 * Manages NPC presence inside building interiors when the player enters.
 * Queries which NPCs should be present (employees, owner, visitors),
 * positions them at role-appropriate furniture, and drives occupation activities.
 */

import { Vector3, Mesh } from '@babylonjs/core';
import type { InteriorLayout, RoomZone } from './BuildingInteriorGenerator';
import type { AnimationState } from './NPCAnimationController';
import {
  getBusinessAnimationCycle,
  selectFromCycle,
  type AnimationCycleEntry,
  type WorkAnimation,
} from './AnimationAssetManager';

/** NPC roles in a building */
export type InteriorNPCRole = 'employee' | 'owner' | 'visitor' | 'patron';

/** NPC data needed for interior placement */
export interface InteriorNPCData {
  id: string;
  mesh: Mesh;
  characterData?: any;
  /** Role of this NPC in the building: employee, owner, visitor, patron */
  role: InteriorNPCRole;
}

/** Positioned NPC inside an interior */
export interface PlacedInteriorNPC {
  npcId: string;
  mesh: Mesh;
  role: InteriorNPCRole;
  /** Position within interior */
  interiorPosition: Vector3;
  /** Saved overworld position to restore on exit */
  savedPosition: Vector3;
  /** Saved visibility state */
  wasEnabled: boolean;
  /** Current animation state */
  animationState: AnimationState;
  /** Character data reference */
  characterData?: any;
  /** Animation cycle for this NPC's role/business */
  animationCycle?: AnimationCycleEntry[];
  /** Timestamp (ms) when the current animation started */
  animationStartTime?: number;
  /** Duration (ms) before switching to next animation in cycle */
  animationDuration?: number;
}

/** Employee entry with optional shift info */
export interface EmployeeEntry {
  id: string;
  shift?: 'day' | 'night';
}

/** Building metadata from BabylonGame.buildingData */
export interface BuildingMetadata {
  buildingId?: string;
  buildingType?: string;
  businessType?: string;
  businessName?: string;
  ownerId?: string | null;
  employees?: Array<string | EmployeeEntry>;
  occupants?: Array<string | { id: string }>;
  residenceId?: string;
  businessId?: string;
}

/** Furniture role assignments for NPC positioning */
interface FurnitureRole {
  name: string;
  /** Offset from interior position */
  offset: Vector3;
  /** Which NPC roles can use this furniture */
  forRoles: Array<InteriorNPCRole>;
  /** Animation to play at this position */
  animation: AnimationState;
  /** Which room zone this furniture belongs to (for multi-room interiors) */
  roomFunction?: string;
}

/** Source of NPC schedule data for dynamic entry/exit */
export interface InteriorScheduleSource {
  /** Returns the building ID an NPC's schedule says they should be at, or null */
  getScheduledBuildingId(npcId: string): string | null;
  /** Returns all NPC IDs tracked by the schedule system */
  getScheduledNPCIds(): string[];
}

/** Callbacks for InteriorNPCManager events */
export interface InteriorNPCCallbacks {
  /** Called when NPC animation should change */
  onAnimationChange?: (npcId: string, state: AnimationState) => void;
  /** Called when NPC should face a direction */
  onFaceDirection?: (npcId: string, targetPosition: Vector3) => void;
  /** Called to show a greeting toast/chat bubble */
  onNPCGreeting?: (npcId: string, greeting: string) => void;
  /** Called to get the current game hour (0-23) */
  getGameHour?: () => number;
  /** Called when an NPC dynamically enters the interior */
  onNPCEnterInterior?: (npcId: string) => void;
  /** Called when an NPC dynamically exits the interior */
  onNPCExitInterior?: (npcId: string) => void;
}

/** Persistent furniture assignment for an NPC in a building */
export interface PersistentNPCAssignment {
  npcId: string;
  role: InteriorNPCRole;
  furnitureName: string;
  furnitureIndex: number;
}

/** Operating hours per business type: [openHour, closeHour] using 24-hour clock */
export const BUSINESS_OPERATING_HOURS: Record<string, { open: number; close: number }> = {
  Bakery:       { open: 6,  close: 18 },
  Bar:          { open: 16, close: 2 },   // crosses midnight
  Restaurant:   { open: 10, close: 22 },
  Shop:         { open: 9,  close: 19 },
  GroceryStore: { open: 7,  close: 21 },
  Hospital:     { open: 0,  close: 24 },  // 24/7
  Church:       { open: 7,  close: 20 },
  School:       { open: 8,  close: 16 },
};

const DEFAULT_OPERATING_HOURS = { open: 7, close: 20 };

/**
 * Check if a business is open at a given hour, handling overnight ranges (e.g. bars).
 */
export function isBusinessOpen(businessType: string | undefined, gameHour: number): boolean {
  const hours = (businessType && BUSINESS_OPERATING_HOURS[businessType]) || DEFAULT_OPERATING_HOURS;
  if (hours.open < hours.close) {
    // Normal range: e.g. 9-19
    return gameHour >= hours.open && gameHour < hours.close;
  }
  // Overnight range: e.g. 16-2 (bar)
  return gameHour >= hours.open || gameHour < hours.close;
}

/**
 * Check if a given hour falls within the day shift (open to midpoint) or night shift (midpoint to close).
 * For 24h businesses, day = 6-18, night = 18-6.
 */
export function isShiftActive(shift: 'day' | 'night', businessType: string | undefined, gameHour: number): boolean {
  const hours = (businessType && BUSINESS_OPERATING_HOURS[businessType]) || DEFAULT_OPERATING_HOURS;

  // 24h businesses split at 6/18
  if (hours.open === 0 && hours.close === 24) {
    return shift === 'day' ? (gameHour >= 6 && gameHour < 18) : (gameHour >= 18 || gameHour < 6);
  }

  // Non-overnight: day shift covers all hours, night shift not applicable
  if (hours.open < hours.close) {
    return shift === 'day';
  }

  // Overnight range (e.g. bar 16-2): day = 16-midpoint, night = midpoint-2
  const midpoint = (hours.open + 24 + hours.close) / 2;
  const normalizedMid = midpoint % 24;
  if (shift === 'day') {
    return gameHour >= hours.open && gameHour < normalizedMid;
  }
  // night shift
  return gameHour >= normalizedMid || gameHour < hours.close;
}

/** Max NPCs to place in an interior for performance */
const MAX_INTERIOR_NPCS = 6;

/** Max patrons (customers) allowed in a business at once */
const MAX_PATRONS_PER_BUSINESS = 4;

/** Visit duration per business type in game-minutes [min, max] */
export const PATRON_VISIT_DURATION: Record<string, { min: number; max: number }> = {
  Bakery:       { min: 30, max: 45 },
  Bar:          { min: 45, max: 90 },
  Restaurant:   { min: 60, max: 90 },
  Shop:         { min: 30, max: 45 },
  GroceryStore: { min: 30, max: 45 },
  Hospital:     { min: 30, max: 60 },
  Church:       { min: 45, max: 90 },
  School:       { min: 45, max: 60 },
};

/** Min/max animation cycle duration in milliseconds (10-30 seconds) */
const ANIM_CYCLE_MIN_MS = 10_000;
const ANIM_CYCLE_MAX_MS = 30_000;

/** Generate a random cycle duration between min and max */
function randomCycleDuration(): number {
  return ANIM_CYCLE_MIN_MS + Math.random() * (ANIM_CYCLE_MAX_MS - ANIM_CYCLE_MIN_MS);
}

/**
 * Resolve animation name to an AnimationState, applying the fallback chain:
 * specific work animation -> 'work' -> 'idle'
 */
export function resolveAnimationState(animation: AnimationState | WorkAnimation): AnimationState {
  const workAnimations: Set<string> = new Set([
    'knead_dough', 'pour', 'hammer', 'chop', 'stir', 'write', 'sweep', 'type',
    'work_sitting', 'work_standing',
  ]);
  if (workAnimations.has(animation)) {
    // Specific work animations map to 'work' AnimationState for the controller
    return 'work';
  }
  return animation as AnimationState;
}

/**
 * Maps business types to furniture role positions within interiors.
 * Offsets are relative to interior center (position).
 */
const BUSINESS_FURNITURE_ROLES: Record<string, FurnitureRole[]> = {
  Bakery: [
    { name: 'counter', offset: new Vector3(0, 0, -2), forRoles: ['owner', 'employee'], animation: 'work', roomFunction: 'shop' },
    { name: 'kitchen', offset: new Vector3(0, 0, 4), forRoles: ['employee'], animation: 'work', roomFunction: 'kitchen' },
    { name: 'display', offset: new Vector3(-3, 0, 0), forRoles: ['employee'], animation: 'idle', roomFunction: 'shop' },
    { name: 'table', offset: new Vector3(3, 0, -3), forRoles: ['visitor'], animation: 'sit', roomFunction: 'shop' },
    // Patron spots — browsing near display
    { name: 'patron_browse1', offset: new Vector3(-2, 0, -1), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_browse2', offset: new Vector3(2, 0, 0), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_browse3', offset: new Vector3(-1, 0, -3), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_counter', offset: new Vector3(1, 0, -2.5), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
  ],
  Bar: [
    { name: 'bar', offset: new Vector3(0, 0, 1.5), forRoles: ['owner', 'employee'], animation: 'work', roomFunction: 'tavern_main' },
    { name: 'kitchen', offset: new Vector3(0, 0, 5), forRoles: ['employee'], animation: 'work', roomFunction: 'tavern_kitchen' },
    { name: 'stool1', offset: new Vector3(-3, 0, -1), forRoles: ['visitor'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'stool2', offset: new Vector3(3, 0, -1), forRoles: ['visitor'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'table', offset: new Vector3(-4, 0, -3), forRoles: ['visitor'], animation: 'sit', roomFunction: 'tavern_main' },
    // Patron spots — sitting at bar/tables, eating
    { name: 'patron_stool1', offset: new Vector3(-1.5, 0, 0), forRoles: ['patron'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'patron_stool2', offset: new Vector3(1.5, 0, 0), forRoles: ['patron'], animation: 'eat', roomFunction: 'tavern_main' },
    { name: 'patron_table1', offset: new Vector3(-3.5, 0, -4), forRoles: ['patron'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'patron_table2', offset: new Vector3(3.5, 0, -4), forRoles: ['patron'], animation: 'eat', roomFunction: 'tavern_main' },
  ],
  Restaurant: [
    { name: 'kitchen', offset: new Vector3(0, 0, 5), forRoles: ['owner', 'employee'], animation: 'work', roomFunction: 'tavern_kitchen' },
    { name: 'table1', offset: new Vector3(-3, 0, -2), forRoles: ['visitor'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'table2', offset: new Vector3(3, 0, -2), forRoles: ['visitor'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'serving', offset: new Vector3(0, 0, 0), forRoles: ['employee'], animation: 'walk', roomFunction: 'tavern_main' },
    // Patron spots — sitting at tables, eating
    { name: 'patron_table1', offset: new Vector3(-3, 0, -4), forRoles: ['patron'], animation: 'eat', roomFunction: 'tavern_main' },
    { name: 'patron_table2', offset: new Vector3(3, 0, -4), forRoles: ['patron'], animation: 'eat', roomFunction: 'tavern_main' },
    { name: 'patron_table3', offset: new Vector3(-1, 0, -1), forRoles: ['patron'], animation: 'sit', roomFunction: 'tavern_main' },
    { name: 'patron_table4', offset: new Vector3(1, 0, -1), forRoles: ['patron'], animation: 'eat', roomFunction: 'tavern_main' },
  ],
  Shop: [
    { name: 'counter', offset: new Vector3(0, 0, -2), forRoles: ['owner', 'employee'], animation: 'idle', roomFunction: 'shop' },
    { name: 'shelf1', offset: new Vector3(-4, 0, 0), forRoles: ['employee'], animation: 'work', roomFunction: 'shop' },
    { name: 'storage', offset: new Vector3(0, 0, 5), forRoles: ['employee'], animation: 'work', roomFunction: 'storage' },
    { name: 'browsing', offset: new Vector3(3, 0, -2), forRoles: ['visitor'], animation: 'idle', roomFunction: 'shop' },
    // Patron spots — standing near shelves, browsing
    { name: 'patron_shelf1', offset: new Vector3(-3, 0, 1), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_shelf2', offset: new Vector3(3, 0, 1), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_browse1', offset: new Vector3(-2, 0, -3), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_counter', offset: new Vector3(1, 0, -2.5), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
  ],
  GroceryStore: [
    { name: 'counter', offset: new Vector3(0, 0, -2), forRoles: ['owner', 'employee'], animation: 'idle', roomFunction: 'shop' },
    { name: 'aisle', offset: new Vector3(-3, 0, 0), forRoles: ['visitor'], animation: 'walk', roomFunction: 'shop' },
    { name: 'storage', offset: new Vector3(0, 0, 5), forRoles: ['employee'], animation: 'work', roomFunction: 'storage' },
    { name: 'shelf', offset: new Vector3(3, 0, 1), forRoles: ['employee'], animation: 'work', roomFunction: 'shop' },
    // Patron spots — browsing aisles
    { name: 'patron_aisle1', offset: new Vector3(-2, 0, 1), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_aisle2', offset: new Vector3(2, 0, -1), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_aisle3', offset: new Vector3(-1, 0, -3), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
    { name: 'patron_counter', offset: new Vector3(1, 0, -2.5), forRoles: ['patron'], animation: 'idle', roomFunction: 'shop' },
  ],
  Hospital: [
    { name: 'desk', offset: new Vector3(0, 0, -2), forRoles: ['owner', 'employee'], animation: 'work' },
    { name: 'bed1', offset: new Vector3(-4, 0, -1), forRoles: ['visitor'], animation: 'idle' },
    { name: 'bed2', offset: new Vector3(4, 0, -1), forRoles: ['visitor'], animation: 'idle' },
    // Patron spots — sitting in waiting area
    { name: 'patron_wait1', offset: new Vector3(-2, 0, -3), forRoles: ['patron'], animation: 'sit' },
    { name: 'patron_wait2', offset: new Vector3(2, 0, -3), forRoles: ['patron'], animation: 'sit' },
  ],
  Church: [
    { name: 'altar', offset: new Vector3(0, 0, 8), forRoles: ['owner', 'employee'], animation: 'talk', roomFunction: 'temple' },
    { name: 'pew1', offset: new Vector3(-3, 0, -2), forRoles: ['visitor'], animation: 'sit', roomFunction: 'temple' },
    { name: 'pew2', offset: new Vector3(3, 0, -2), forRoles: ['visitor'], animation: 'sit', roomFunction: 'temple' },
    // Patron spots — sitting in pews
    { name: 'patron_pew1', offset: new Vector3(-2, 0, 0), forRoles: ['patron'], animation: 'sit', roomFunction: 'temple' },
    { name: 'patron_pew2', offset: new Vector3(2, 0, 0), forRoles: ['patron'], animation: 'sit', roomFunction: 'temple' },
    { name: 'patron_pew3', offset: new Vector3(-3, 0, 2), forRoles: ['patron'], animation: 'sit', roomFunction: 'temple' },
    { name: 'patron_pew4', offset: new Vector3(3, 0, 2), forRoles: ['patron'], animation: 'sit', roomFunction: 'temple' },
  ],
  School: [
    { name: 'desk', offset: new Vector3(0, 0, 4), forRoles: ['owner', 'employee'], animation: 'talk' },
    { name: 'seat1', offset: new Vector3(-3, 0, -2), forRoles: ['visitor'], animation: 'sit' },
    { name: 'seat2', offset: new Vector3(3, 0, -2), forRoles: ['visitor'], animation: 'sit' },
  ],
  // Hotel patron spots
  Hotel: [
    { name: 'desk', offset: new Vector3(0, 0, -2), forRoles: ['owner', 'employee'], animation: 'work' },
    { name: 'lobby1', offset: new Vector3(-3, 0, -1), forRoles: ['patron'], animation: 'sit' },
    { name: 'lobby2', offset: new Vector3(3, 0, -1), forRoles: ['patron'], animation: 'sit' },
    { name: 'lobby3', offset: new Vector3(-2, 0, -3), forRoles: ['patron'], animation: 'sit' },
  ],
};

/** Default furniture roles for unknown business types */
const DEFAULT_FURNITURE_ROLES: FurnitureRole[] = [
  { name: 'center', offset: new Vector3(0, 0, 1), forRoles: ['owner', 'employee'], animation: 'idle' },
  { name: 'corner', offset: new Vector3(-2, 0, -2), forRoles: ['visitor'], animation: 'idle' },
];

/** Residence furniture roles — daytime positions (living room / kitchen) */
const RESIDENCE_FURNITURE_ROLES_DAY: FurnitureRole[] = [
  { name: 'chair', offset: new Vector3(0, 0, -1), forRoles: ['owner', 'visitor'], animation: 'sit', roomFunction: 'living' },
  { name: 'kitchen_table', offset: new Vector3(0, 0, 3), forRoles: ['owner', 'visitor'], animation: 'idle', roomFunction: 'kitchen' },
  { name: 'living_bench', offset: new Vector3(-2, 0, -2), forRoles: ['visitor'], animation: 'sit', roomFunction: 'living' },
  { name: 'cooking', offset: new Vector3(0, 0, 4.5), forRoles: ['owner'], animation: 'work', roomFunction: 'kitchen' },
];

/** Residence furniture roles — nighttime positions (bedroom upstairs if available) */
const RESIDENCE_FURNITURE_ROLES_NIGHT: FurnitureRole[] = [
  { name: 'bed', offset: new Vector3(-2, 0, 2), forRoles: ['owner'], animation: 'sleep', roomFunction: 'bedroom' },
  { name: 'bed2', offset: new Vector3(2, 0, 2), forRoles: ['owner'], animation: 'sleep', roomFunction: 'bedroom' },
  { name: 'chair', offset: new Vector3(0, 0, -1), forRoles: ['visitor'], animation: 'sit', roomFunction: 'living' },
];

/** Greeting templates by business type */
const BUSINESS_GREETINGS: Record<string, string[]> = {
  Bakery: ['Welcome! Fresh bread today.', 'What can I get you?', 'Everything is freshly baked!'],
  Bar: ['What\'ll it be?', 'Welcome, take a seat!', 'Thirsty? We\'ve got plenty.'],
  Restaurant: ['Welcome! Table for one?', 'Come in, come in!', 'Today\'s special is excellent.'],
  Shop: ['Welcome to my shop!', 'Looking for anything special?', 'Browse as long as you like.'],
  GroceryStore: ['Welcome! Need anything?', 'Fresh produce today!', 'Let me know if you need help.'],
  Hospital: ['How can I help you?', 'Please, take a seat.'],
  Church: ['Welcome, traveler.', 'Peace be with you.'],
  School: ['Welcome to class!', 'Please find a seat.'],
};

const DEFAULT_GREETINGS = ['Hello there.', 'Welcome.', 'Can I help you?'];

export class InteriorNPCManager {
  private callbacks: InteriorNPCCallbacks;

  // Currently placed interior NPCs
  private placedNPCs: Map<string, PlacedInteriorNPC> = new Map();
  private activeBuildingId: string | null = null;
  private activeInterior: InteriorLayout | null = null;

  // Stored references for schedule-based updates
  private activeMetadata: BuildingMetadata | null = null;
  private npcSource: (() => Map<string, { mesh: Mesh; characterData?: any }>) | null = null;
  private scheduleSource: InteriorScheduleSource | null = null;
  private playerCharacterId: string | undefined = undefined;

  // Persistent NPC-to-furniture assignments per building (survives clearInterior)
  private persistentAssignments: Map<string, Map<string, PersistentNPCAssignment>> = new Map();

  constructor(callbacks: InteriorNPCCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Set the schedule source for dynamic NPC entry/exit.
   */
  setScheduleSource(source: InteriorScheduleSource): void {
    this.scheduleSource = source;
  }

  /**
   * Set the NPC data source for dynamic additions.
   */
  setNPCSource(source: () => Map<string, { mesh: Mesh; characterData?: any }>): void {
    this.npcSource = source;
  }

  /**
   * Called when player enters a building. Determines which NPCs should appear
   * inside and positions them at role-appropriate furniture.
   *
   * @param buildingId The building being entered
   * @param interior The interior layout
   * @param metadata Building metadata with employees/occupants
   * @param allNPCs Map of all NPC instances (from BabylonGame.npcMeshes)
   * @param playerCharacterId The player's character ID (to compute relationship priority)
   */
  populateInterior(
    buildingId: string,
    interior: InteriorLayout,
    metadata: BuildingMetadata,
    allNPCs: Map<string, { mesh: Mesh; characterData?: any }>,
    playerCharacterId?: string
  ): PlacedInteriorNPC[] {
    // Clean up any previous interior NPCs
    this.clearInterior();

    this.activeBuildingId = buildingId;
    this.activeInterior = interior;
    this.activeMetadata = metadata;
    this.playerCharacterId = playerCharacterId;

    // Determine which NPCs should be inside
    const candidates = this.findCandidateNPCs(metadata, allNPCs, playerCharacterId);

    // Cap at MAX_INTERIOR_NPCS
    const npcsToPlace = candidates.slice(0, MAX_INTERIOR_NPCS);
    // Get furniture roles for this building type
    const furnitureRoles = this.getFurnitureRoles(interior.buildingType, metadata.businessType);
    // Get or create persistent assignments for this building
    if (!this.persistentAssignments.has(buildingId)) {
      this.persistentAssignments.set(buildingId, new Map());
    }
    const buildingAssignments = this.persistentAssignments.get(buildingId)!;

    // Place each NPC at an appropriate position
    const placed: PlacedInteriorNPC[] = [];
    const usedFurniture = new Set<number>();

    // First pass: reserve furniture indices for NPCs with valid cached assignments
    for (const npc of npcsToPlace) {
      const cached = buildingAssignments.get(npc.id);
      if (cached && cached.furnitureIndex >= 0 && cached.furnitureIndex < furnitureRoles.length) {
        usedFurniture.add(cached.furnitureIndex);
      }
    }

    for (const npc of npcsToPlace) {
      let furnitureIdx: number;
      const cached = buildingAssignments.get(npc.id);

      if (cached && cached.furnitureIndex >= 0 && cached.furnitureIndex < furnitureRoles.length
          && !this.isFurnitureConflicted(cached.furnitureIndex, npc.id, npcsToPlace, buildingAssignments)) {
        // Reuse persistent assignment
        furnitureIdx = cached.furnitureIndex;
      } else {
        // Find best furniture role for this NPC
        furnitureIdx = this.findFurnitureForRole(furnitureRoles, npc.role, usedFurniture);
      }

      const furniture = furnitureIdx >= 0 ? furnitureRoles[furnitureIdx] : null;
      if (furnitureIdx >= 0) usedFurniture.add(furnitureIdx);

      // Save the persistent assignment
      if (furniture) {
        buildingAssignments.set(npc.id, {
          npcId: npc.id,
          role: npc.role,
          furnitureName: furniture.name,
          furnitureIndex: furnitureIdx,
        });
      }

      // Calculate position within interior
      const offset = furniture?.offset ?? new Vector3(
        (Math.random() - 0.5) * (interior.width * 0.6),
        0,
        (Math.random() - 0.5) * (interior.depth * 0.6)
      );
      const interiorPos = new Vector3(
        interior.position.x + offset.x,
        interior.position.y + 0.1,
        interior.position.z + offset.z
      );

      // Determine animation: use business-type-specific cycle for work/patron positions
      const baseAnim = furniture?.animation ?? 'idle';
      const useAnimCycle = npc.role === 'patron'
        || baseAnim === 'work'
        || (baseAnim === 'idle' && (npc.role === 'employee' || npc.role === 'owner'));
      const cycle = useAnimCycle
        ? getBusinessAnimationCycle(metadata.businessType, npc.role)
        : undefined;
      const initialAnim = cycle ? selectFromCycle(cycle) : baseAnim;
      const animState = resolveAnimationState(initialAnim);

      // Save NPC state and teleport to interior
      const savedPos = npc.mesh.position.clone();
      const wasEnabled = npc.mesh.isEnabled();

      npc.mesh.position = interiorPos.clone();
      npc.mesh.setEnabled(true);

      const now = Date.now();
      const placedNpc: PlacedInteriorNPC = {
        npcId: npc.id,
        mesh: npc.mesh,
        role: npc.role,
        interiorPosition: interiorPos,
        savedPosition: savedPos,
        wasEnabled,
        animationState: animState,
        characterData: npc.characterData,
        animationCycle: cycle,
        animationStartTime: now,
        animationDuration: cycle ? randomCycleDuration() : undefined,
      };

      this.placedNPCs.set(npc.id, placedNpc);
      placed.push(placedNpc);
      // Set animation
      this.callbacks.onAnimationChange?.(npc.id, animState);

      // Patrons near the counter occasionally face and talk to the owner/employee
      if (npc.role === 'patron' && furniture?.name.includes('counter')) {
        const ownerNpc = placed.find(p => p.role === 'owner' || p.role === 'employee');
        if (ownerNpc) {
          this.callbacks.onFaceDirection?.(npc.id, ownerNpc.interiorPosition);
        } else {
          this.callbacks.onFaceDirection?.(npc.id, interior.doorPosition);
        }
      } else {
        // Face toward door (player entry point)
        this.callbacks.onFaceDirection?.(npc.id, interior.doorPosition);
      }
    }

    // Trigger greetings after a short delay
    this.triggerGreetings(metadata.businessType, interior.buildingType);

    return placed;
  }

  /**
   * Clear all interior NPCs and restore them to overworld positions.
   */
  clearInterior(): void {
    const entries = Array.from(this.placedNPCs.values());
    for (const npc of entries) {
      // Restore overworld position
      npc.mesh.position = npc.savedPosition.clone();
      npc.mesh.setEnabled(npc.wasEnabled);

      // Reset to idle animation
      this.callbacks.onAnimationChange?.(npc.npcId, 'idle');
    }

    this.placedNPCs.clear();
    this.activeBuildingId = null;
    this.activeInterior = null;
    this.activeMetadata = null;
    this.playerCharacterId = undefined;
  }

  /**
   * Get the list of NPCs currently placed in an interior.
   */
  getPlacedNPCs(): PlacedInteriorNPC[] {
    return Array.from(this.placedNPCs.values());
  }

  /**
   * Check if a specific NPC is currently inside an interior.
   */
  isNPCInside(npcId: string): boolean {
    return this.placedNPCs.has(npcId);
  }

  /**
   * Get the active building ID.
   */
  getActiveBuildingId(): string | null {
    return this.activeBuildingId;
  }

  /**
   * Get how many NPCs are currently placed.
   */
  getPlacedCount(): number {
    return this.placedNPCs.size;
  }

  /**
   * Get the number of patrons currently in the interior.
   */
  getPatronCount(): number {
    return Array.from(this.placedNPCs.values()).filter(n => n.role === 'patron').length;
  }

  /**
   * Get a specific placed NPC.
   */
  getPlacedNPC(npcId: string): PlacedInteriorNPC | undefined {
    return this.placedNPCs.get(npcId);
  }

  /**
   * Find candidate NPCs for the interior based on building metadata.
   * Priority: employees first, then owner, then visitors by relationship.
   */
  private findCandidateNPCs(
    metadata: BuildingMetadata,
    allNPCs: Map<string, { mesh: Mesh; characterData?: any }>,
    playerCharacterId?: string
  ): InteriorNPCData[] {
    const candidates: InteriorNPCData[] = [];
    const addedIds = new Set<string>();
    const gameHour = this.callbacks.getGameHour?.() ?? 12;

    // Check if business is currently open based on its type-specific operating hours
    const businessOpen = isBusinessOpen(metadata.businessType, gameHour);

    // Add owner (present when business is open, or always for residences)
    if (metadata.ownerId && allNPCs.has(metadata.ownerId)) {
      const npc = allNPCs.get(metadata.ownerId)!;
      if (businessOpen || metadata.buildingType === 'residence') {
        candidates.push({ id: metadata.ownerId, mesh: npc.mesh, characterData: npc.characterData, role: 'owner' });
        addedIds.add(metadata.ownerId);
      }
    }

    // Add employees whose shift matches the current time (only when business is open)
    // Support both `employees` and `employeeIds` field names (schema uses employeeIds)
    const employeeList = metadata.employees || (metadata as any).employeeIds || [];
    if (employeeList.length > 0 && businessOpen) {
      for (const emp of employeeList) {
        const empId = typeof emp === 'string' ? emp : emp.id;
        const empShift: 'day' | 'night' = (typeof emp === 'object' && emp.shift) || 'day';
        if (addedIds.has(empId) || !allNPCs.has(empId)) {
          continue;
        }
        // Only include employees whose shift is currently active
        if (!isShiftActive(empShift, metadata.businessType, gameHour)) {
          continue;
        }
        const npc = allNPCs.get(empId)!;
        candidates.push({ id: empId, mesh: npc.mesh, characterData: npc.characterData, role: 'employee' });
        addedIds.add(empId);
      }
    }

    // Add occupants for residences — from metadata first
    if (metadata.occupants) {
      for (const occ of metadata.occupants) {
        const occId = typeof occ === 'string' ? occ : occ.id;
        if (addedIds.has(occId) || !allNPCs.has(occId)) {
          continue;
        }
        const npc = allNPCs.get(occId)!;
        candidates.push({ id: occId, mesh: npc.mesh, characterData: npc.characterData, role: 'owner' });
        addedIds.add(occId);
      }
    }

    // Fallback: scan all NPCs for residence match via characterData.currentResidenceId
    if (metadata.buildingType === 'residence' && metadata.residenceId) {
      const residenceId = metadata.residenceId;
      const allEntries = Array.from(allNPCs.entries());
      for (const [npcId, npc] of allEntries) {
        if (addedIds.has(npcId)) continue;
        if (candidates.length >= MAX_INTERIOR_NPCS) break;
        if (npc.characterData?.currentResidenceId === residenceId) {
          candidates.push({ id: npcId, mesh: npc.mesh, characterData: npc.characterData, role: 'owner' });
          addedIds.add(npcId);
        }
      }
    }

    // Add patrons: NPCs visiting businesses as customers (separate from visitors)
    if (metadata.buildingType === 'business' && businessOpen) {
      const patronCandidates: Array<{ id: string; mesh: Mesh; characterData?: any }> = [];
      const entries = Array.from(allNPCs.entries());
      for (const [npcId, npc] of entries) {
        if (addedIds.has(npcId)) continue;
        if (candidates.length + patronCandidates.length >= MAX_INTERIOR_NPCS) break;
        if (patronCandidates.length >= MAX_PATRONS_PER_BUSINESS) break;

        // Patrons are NPCs who decided to visit this business — use extroversion + randomness
        const extroversion = npc.characterData?.personality?.extroversion ?? 0.5;
        if (Math.random() < 0.3 + extroversion * 0.3) {
          patronCandidates.push({ id: npcId, mesh: npc.mesh, characterData: npc.characterData });
        }
      }

      for (const p of patronCandidates) {
        if (candidates.length >= MAX_INTERIOR_NPCS) break;
        candidates.push({ id: p.id, mesh: p.mesh, characterData: p.characterData, role: 'patron' });
        addedIds.add(p.id);
      }
    }

    // Add visitors: other NPCs who might be at this location (friends, acquaintances)
    // Prioritize by relationship strength with player
    const shouldAddVisitors = metadata.buildingType === 'business'
      ? businessOpen
      : metadata.buildingType === 'residence';
    if (shouldAddVisitors) {
      const visitors: Array<{ id: string; mesh: Mesh; characterData?: any; relationshipScore: number }> = [];
      const entries = Array.from(allNPCs.entries());
      for (const [npcId, npc] of entries) {
        if (addedIds.has(npcId)) continue;
        if (candidates.length + visitors.length >= MAX_INTERIOR_NPCS) break;

        // Check if NPC has a relationship with player (higher = priority visitor)
        let relScore = 0;
        if (playerCharacterId && npc.characterData?.relationships) {
          const rel = npc.characterData.relationships[playerCharacterId];
          if (rel) relScore = rel.strength ?? 0;
        }

        // Add visitors based on extroversion — higher chance so interiors feel populated
        const extroversion = npc.characterData?.personality?.extroversion ?? 0.5;
        if (Math.random() < extroversion * 0.4) {
          visitors.push({ id: npcId, mesh: npc.mesh, characterData: npc.characterData, relationshipScore: relScore });
        }
      }

      // Sort visitors by relationship (highest first)
      visitors.sort((a, b) => b.relationshipScore - a.relationshipScore);

      for (const v of visitors) {
        if (candidates.length >= MAX_INTERIOR_NPCS) break;
        candidates.push({ id: v.id, mesh: v.mesh, characterData: v.characterData, role: 'visitor' });
        addedIds.add(v.id);
      }
    }

    // Add NPCs that the schedule system has placed inside this building
    // (they may not be the owner/employees but are scheduled to be here)
    const scheduledNpcIds: string[] = (metadata as any).scheduledNpcIds || [];
    for (const npcId of scheduledNpcIds) {
      if (addedIds.has(npcId) || !allNPCs.has(npcId)) {
        continue;
      }
      if (candidates.length >= MAX_INTERIOR_NPCS) break;
      const npc = allNPCs.get(npcId)!;
      // Determine role: check if they're the owner or an employee
      const isOwner = metadata.ownerId === npcId;
      const isEmployee = employeeList.some((e: any) => (typeof e === 'string' ? e : e.id) === npcId);
      const role: InteriorNPCRole = isOwner ? 'owner' : isEmployee ? 'employee' : 'visitor';
      candidates.push({ id: npcId, mesh: npc.mesh, characterData: npc.characterData, role });
      addedIds.add(npcId);
    }

    return candidates;
  }

  /**
   * Get furniture role positions for a building type.
   * For residences, returns different roles based on time of day.
   */
  private getFurnitureRoles(buildingType: string, businessType?: string): FurnitureRole[] {
    if (buildingType === 'residence') {
      const gameHour = this.callbacks.getGameHour?.() ?? 12;
      const isNight = gameHour >= 21 || gameHour < 6;
      return isNight ? RESIDENCE_FURNITURE_ROLES_NIGHT : RESIDENCE_FURNITURE_ROLES_DAY;
    }
    if (businessType && BUSINESS_FURNITURE_ROLES[businessType]) {
      return BUSINESS_FURNITURE_ROLES[businessType];
    }
    return DEFAULT_FURNITURE_ROLES;
  }

  /**
   * Find the best available furniture position for an NPC role.
   */
  private findFurnitureForRole(
    roles: FurnitureRole[],
    npcRole: InteriorNPCRole,
    usedIndices: Set<number>
  ): number {
    // First try: exact role match on unused furniture
    for (let i = 0; i < roles.length; i++) {
      if (usedIndices.has(i)) continue;
      if (roles[i].forRoles.includes(npcRole)) return i;
    }
    // Fallback: any unused furniture
    for (let i = 0; i < roles.length; i++) {
      if (!usedIndices.has(i)) return i;
    }
    return -1;
  }

  /**
   * Trigger greeting from the first employee/owner NPC.
   */
  private triggerGreetings(businessType?: string, buildingType?: string): void {
    if (!this.callbacks.onNPCGreeting) return;

    // Find the first employee or owner to greet
    const entries = Array.from(this.placedNPCs.values());
    const greeter = entries.find(n => n.role === 'owner' || n.role === 'employee');
    if (!greeter) return;

    const greetings = (businessType && BUSINESS_GREETINGS[businessType])
      ? BUSINESS_GREETINGS[businessType]
      : (buildingType === 'residence' ? ['Make yourself at home.', 'Welcome to my home.'] : DEFAULT_GREETINGS);

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.callbacks.onNPCGreeting(greeter.npcId, greeting);
  }

  /**
   * Update interior NPC presence based on schedule data and business hours.
   * Called each frame while the player is inside a building.
   *
   * - Removes employees/owner when the business closes
   * - Adds NPCs whose schedules say they should be at this building
   * - Removes NPCs whose schedules say they should be elsewhere
   */
  updateFromSchedules(): void {
    if (!this.activeBuildingId || !this.activeInterior) return;

    // Check business hours: remove employees/owner when business closes
    if (this.activeMetadata?.buildingType === 'business') {
      const gameHour = this.callbacks.getGameHour?.() ?? 12;
      const businessOpen = isBusinessOpen(this.activeMetadata.businessType, gameHour);
      if (!businessOpen) {
        // Business closed — remove all non-visitor NPCs
        const placedIds = Array.from(this.placedNPCs.keys());
        for (const npcId of placedIds) {
          const npc = this.placedNPCs.get(npcId);
          if (npc && npc.role !== 'visitor') {
            this.removeNPCFromInterior(npcId);
          }
        }
      }
    }

    if (!this.scheduleSource) return;

    const buildingId = this.activeBuildingId;
    const scheduledIds = this.scheduleSource.getScheduledNPCIds();

    // Check for NPCs that should enter
    for (const npcId of scheduledIds) {
      if (this.placedNPCs.has(npcId)) continue;
      if (this.placedNPCs.size >= MAX_INTERIOR_NPCS) break;

      const scheduledBuilding = this.scheduleSource.getScheduledBuildingId(npcId);
      if (scheduledBuilding !== buildingId) continue;

      this.addNPCToInterior(npcId);
    }

    // Check for NPCs that should exit
    const placedIds = Array.from(this.placedNPCs.keys());
    for (const npcId of placedIds) {
      const scheduledBuilding = this.scheduleSource.getScheduledBuildingId(npcId);
      if (scheduledBuilding === buildingId) continue;

      // NPC's schedule no longer says this building — remove them
      this.removeNPCFromInterior(npcId);
    }
  }

  /**
   * Update animation cycles for all placed NPCs.
   * Call this each frame (or on a timer) while the player is inside a building.
   * When an NPC's current animation duration expires, pick the next animation from their cycle.
   */
  updateAnimationCycles(): void {
    const now = Date.now();
    for (const npc of Array.from(this.placedNPCs.values())) {
      if (!npc.animationCycle || !npc.animationStartTime || !npc.animationDuration) continue;
      if (now - npc.animationStartTime < npc.animationDuration) continue;

      // Patron near counter: occasionally trigger conversation with shop owner
      if (npc.role === 'patron' && this.isNearCounter(npc) && Math.random() < 0.3) {
        npc.animationState = 'talk';
        npc.animationStartTime = now;
        npc.animationDuration = randomCycleDuration();
        this.callbacks.onAnimationChange?.(npc.npcId, 'talk');
        // Make the nearest owner/employee face and respond
        this.triggerCounterConversation(npc);
        continue;
      }

      // Time to switch — pick next animation from cycle
      const nextAnim = selectFromCycle(npc.animationCycle);
      const nextState = resolveAnimationState(nextAnim);

      npc.animationState = nextState;
      npc.animationStartTime = now;
      npc.animationDuration = randomCycleDuration();

      this.callbacks.onAnimationChange?.(npc.npcId, nextState);
    }
  }

  /**
   * Check if a placed NPC is near a counter position (within 2 units).
   */
  private isNearCounter(npc: PlacedInteriorNPC): boolean {
    if (!this.activeInterior || !this.activeMetadata?.businessType) return false;
    const roles = this.getFurnitureRoles(this.activeInterior.buildingType, this.activeMetadata.businessType);
    for (const role of roles) {
      if (!role.name.includes('counter') && !role.name.includes('bar') && !role.name.includes('altar')) continue;
      if (!role.forRoles.includes('owner') && !role.forRoles.includes('employee')) continue;
      const counterPos = new Vector3(
        this.activeInterior.position.x + role.offset.x,
        this.activeInterior.position.y,
        this.activeInterior.position.z + role.offset.z
      );
      const dx = npc.interiorPosition.x - counterPos.x;
      const dz = npc.interiorPosition.z - counterPos.z;
      if (dx * dx + dz * dz < 4) return true; // within 2 units
    }
    return false;
  }

  /**
   * Trigger a brief conversation response from the nearest owner/employee
   * when a patron talks near the counter.
   */
  private triggerCounterConversation(patron: PlacedInteriorNPC): void {
    let nearestStaff: PlacedInteriorNPC | null = null;
    let nearestDist = Infinity;
    for (const npc of Array.from(this.placedNPCs.values())) {
      if (npc.role !== 'owner' && npc.role !== 'employee') continue;
      const dx = npc.interiorPosition.x - patron.interiorPosition.x;
      const dz = npc.interiorPosition.z - patron.interiorPosition.z;
      const dist = dx * dx + dz * dz;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestStaff = npc;
      }
    }
    if (nearestStaff) {
      this.callbacks.onFaceDirection?.(nearestStaff.npcId, patron.interiorPosition);
      this.callbacks.onAnimationChange?.(nearestStaff.npcId, 'talk');
      // Staff will resume their normal cycle on next update
      nearestStaff.animationState = 'talk';
      nearestStaff.animationStartTime = Date.now();
      nearestStaff.animationDuration = randomCycleDuration();
    }
  }

  /**
   * Add a single NPC to the active interior, placing them at available furniture.
   * Uses persistent assignments when available.
   * Returns the placed NPC or null if the NPC couldn't be added.
   */
  addNPCToInterior(npcId: string): PlacedInteriorNPC | null {
    if (!this.activeInterior || !this.activeMetadata || !this.activeBuildingId) return null;
    if (this.placedNPCs.has(npcId)) return this.placedNPCs.get(npcId)!;
    if (this.placedNPCs.size >= MAX_INTERIOR_NPCS) return null;

    // Resolve the NPC mesh
    const allNPCs = this.npcSource?.();
    const npcData = allNPCs?.get(npcId);
    if (!npcData) return null;

    const role = this.resolveNPCRole(npcId, this.activeMetadata);
    const interior = this.activeInterior;
    const buildingId = this.activeBuildingId;

    // Find available furniture, checking persistent assignment first
    const furnitureRoles = this.getFurnitureRoles(interior.buildingType, this.activeMetadata.businessType);
    const usedIndices = this.getUsedFurnitureIndices(furnitureRoles);

    let furnitureIdx: number;
    const buildingAssignments = this.persistentAssignments.get(buildingId);
    const cached = buildingAssignments?.get(npcId);

    if (cached && cached.furnitureIndex >= 0 && cached.furnitureIndex < furnitureRoles.length
        && !usedIndices.has(cached.furnitureIndex)) {
      furnitureIdx = cached.furnitureIndex;
    } else {
      furnitureIdx = this.findFurnitureForRole(furnitureRoles, role, usedIndices);
    }

    const furniture = furnitureIdx >= 0 ? furnitureRoles[furnitureIdx] : null;

    // Save the persistent assignment
    if (furniture && buildingAssignments) {
      buildingAssignments.set(npcId, {
        npcId,
        role,
        furnitureName: furniture.name,
        furnitureIndex: furnitureIdx,
      });
    }

    const offset = furniture?.offset ?? new Vector3(
      (Math.random() - 0.5) * (interior.width * 0.6),
      0,
      (Math.random() - 0.5) * (interior.depth * 0.6)
    );
    const interiorPos = new Vector3(
      interior.position.x + offset.x,
      interior.position.y + 0.1,
      interior.position.z + offset.z
    );
    const baseAnim = furniture?.animation ?? 'idle';
    const useAnimCycle = role === 'patron'
      || baseAnim === 'work'
      || (baseAnim === 'idle' && (role === 'employee' || role === 'owner'));
    const cycle = useAnimCycle
      ? getBusinessAnimationCycle(this.activeMetadata!.businessType, role)
      : undefined;
    const initialAnim = cycle ? selectFromCycle(cycle) : baseAnim;
    const animState = resolveAnimationState(initialAnim);

    const savedPos = npcData.mesh.position.clone();
    const wasEnabled = npcData.mesh.isEnabled();

    npcData.mesh.position = interiorPos.clone();
    npcData.mesh.setEnabled(true);

    const now = Date.now();
    const placedNpc: PlacedInteriorNPC = {
      npcId,
      mesh: npcData.mesh,
      role,
      interiorPosition: interiorPos,
      savedPosition: savedPos,
      wasEnabled,
      animationState: animState,
      characterData: npcData.characterData,
      animationCycle: cycle,
      animationStartTime: now,
      animationDuration: cycle ? randomCycleDuration() : undefined,
    };

    this.placedNPCs.set(npcId, placedNpc);
    this.callbacks.onAnimationChange?.(npcId, animState);
    this.callbacks.onFaceDirection?.(npcId, interior.doorPosition);
    this.callbacks.onNPCEnterInterior?.(npcId);

    return placedNpc;
  }

  /**
   * Remove a single NPC from the interior and restore their overworld state.
   */
  removeNPCFromInterior(npcId: string): boolean {
    const npc = this.placedNPCs.get(npcId);
    if (!npc) return false;

    npc.mesh.position = npc.savedPosition.clone();
    npc.mesh.setEnabled(npc.wasEnabled);
    this.callbacks.onAnimationChange?.(npcId, 'idle');
    this.callbacks.onNPCExitInterior?.(npcId);

    this.placedNPCs.delete(npcId);
    return true;
  }

  /**
   * Determine the role of an NPC in a building based on metadata.
   */
  private resolveNPCRole(npcId: string, metadata: BuildingMetadata): InteriorNPCRole {
    if (metadata.ownerId === npcId) return 'owner';

    if (metadata.employees) {
      for (const emp of metadata.employees) {
        const empId = typeof emp === 'string' ? emp : emp.id;
        if (empId === npcId) return 'employee';
      }
    }

    if (metadata.occupants) {
      for (const occ of metadata.occupants) {
        const occId = typeof occ === 'string' ? occ : occ.id;
        if (occId === npcId) return 'owner';
      }
    }

    // Non-staff NPCs in businesses are patrons (customers), not visitors
    if (metadata.buildingType === 'business') {
      const patronCount = Array.from(this.placedNPCs.values()).filter(n => n.role === 'patron').length;
      if (patronCount < MAX_PATRONS_PER_BUSINESS) return 'patron';
    }

    return 'visitor';
  }

  /**
   * Get the set of furniture indices currently in use by placed NPCs.
   */
  private getUsedFurnitureIndices(furnitureRoles: FurnitureRole[]): Set<number> {
    const used = new Set<number>();
    for (const npc of Array.from(this.placedNPCs.values())) {
      for (let i = 0; i < furnitureRoles.length; i++) {
        const offset = furnitureRoles[i].offset;
        const expectedX = this.activeInterior!.position.x + offset.x;
        const expectedZ = this.activeInterior!.position.z + offset.z;
        if (Math.abs(npc.interiorPosition.x - expectedX) < 0.01 &&
            Math.abs(npc.interiorPosition.z - expectedZ) < 0.01) {
          used.add(i);
          break;
        }
      }
    }
    return used;
  }

  /**
   * Check if a cached furniture index conflicts with another NPC's cached assignment
   * among the current NPCs being placed.
   */
  private isFurnitureConflicted(
    furnitureIndex: number,
    npcId: string,
    npcsToPlace: InteriorNPCData[],
    buildingAssignments: Map<string, PersistentNPCAssignment>
  ): boolean {
    for (const npc of npcsToPlace) {
      if (npc.id === npcId) continue;
      const otherCached = buildingAssignments.get(npc.id);
      if (otherCached && otherCached.furnitureIndex === furnitureIndex) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get persistent assignments for a building.
   */
  getAssignments(buildingId: string): PersistentNPCAssignment[] {
    const assignments = this.persistentAssignments.get(buildingId);
    return assignments ? Array.from(assignments.values()) : [];
  }

  /**
   * Get the persistent assignment for a specific NPC in a building.
   */
  getAssignment(buildingId: string, npcId: string): PersistentNPCAssignment | undefined {
    return this.persistentAssignments.get(buildingId)?.get(npcId);
  }

  /**
   * Clear persistent assignments for a specific building.
   */
  clearAssignments(buildingId: string): void {
    this.persistentAssignments.delete(buildingId);
  }

  /**
   * Clear all persistent assignments.
   */
  clearAllAssignments(): void {
    this.persistentAssignments.clear();
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.clearInterior();
    this.persistentAssignments.clear();
    this.scheduleSource = null;
    this.npcSource = null;
  }
}
