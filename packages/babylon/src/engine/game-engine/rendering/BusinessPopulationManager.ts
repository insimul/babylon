/**
 * BusinessPopulationManager
 *
 * During game loading, assigns NPCs to businesses so the world feels populated.
 * For each open business: places the owner, on-shift employees, and 1-3 random
 * customer NPCs near the business building.
 */

import { Vector3 } from '@babylonjs/core';
import { isBusinessOpen, isShiftActive, BUSINESS_OPERATING_HOURS } from './InteriorNPCManager';

/** Minimal NPC instance data needed for population */
export interface PopulatableNPC {
  mesh: { position: Vector3; };
  characterData?: {
    id?: string;
    personality?: { extroversion?: number };
    [key: string]: any;
  };
  role?: string;
}

/** Building data entry from BabylonGame.buildingData */
export interface BuildingEntry {
  position: Vector3;
  metadata: {
    buildingType?: string;
    businessType?: string;
    businessName?: string;
    businessId?: string;
    settlementId?: string;
    ownerId?: string | null;
    employees?: Array<string | { id: string; shift?: 'day' | 'night' }>;
    [key: string]: any;
  };
}

/** Record of an NPC assigned to a business as a customer */
export interface BusinessCustomerAssignment {
  npcId: string;
  businessId: string;
  position: Vector3;
}

/** Result of populating businesses */
export interface PopulationResult {
  /** Total customers assigned across all businesses */
  totalCustomersAssigned: number;
  /** Map of businessId -> array of customer NPC IDs */
  customersByBusiness: Map<string, string[]>;
}

/** Options for the population manager */
export interface BusinessPopulationOptions {
  /** Min customers per open business (default 1) */
  minCustomers?: number;
  /** Max customers per open business (default 3) */
  maxCustomers?: number;
  /** Current game hour (0-23, default 12) */
  gameHour?: number;
  /** Spread radius for customer spawn positions around business */
  spawnSpread?: number;
  /** Minimum offset from building center */
  spawnMinOffset?: number;
  /** Function to check if a point is inside a building footprint */
  isPointInsideBuilding?: (x: number, z: number) => boolean;
}

const DEFAULT_OPTIONS: Required<BusinessPopulationOptions> = {
  minCustomers: 1,
  maxCustomers: 3,
  gameHour: 12,
  spawnSpread: 14,
  spawnMinOffset: 4,
  isPointInsideBuilding: () => false,
};

/**
 * Deterministic-ish random from NPC ID + business ID for consistent customer selection.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export class BusinessPopulationManager {
  private customerAssignments: Map<string, BusinessCustomerAssignment[]> = new Map();
  private assignedCustomerIds: Set<string> = new Set();

  /**
   * Populate businesses with NPCs. Repositions customer NPCs near open businesses.
   *
   * Owners and employees are already positioned near their business by findNPCSpawnPosition,
   * so this method only handles customer assignment and repositioning.
   */
  populate(
    buildingData: Map<string, BuildingEntry>,
    npcMeshes: Map<string, PopulatableNPC>,
    opts?: BusinessPopulationOptions,
  ): PopulationResult {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    this.customerAssignments.clear();
    this.assignedCustomerIds.clear();

    // Collect open businesses grouped by settlement
    const businessesBySettlement = new Map<string, Array<{ id: string; entry: BuildingEntry }>>();
    const allWorkerIds = new Set<string>();

    buildingData.forEach((entry, id) => {
      const meta = entry.metadata;
      if (meta.buildingType !== 'business') return;
      if (!isBusinessOpen(meta.businessType, options.gameHour)) return;

      const settlementId = meta.settlementId || '__global__';
      if (!businessesBySettlement.has(settlementId)) {
        businessesBySettlement.set(settlementId, []);
      }
      businessesBySettlement.get(settlementId)!.push({ id, entry });

      // Track all workers so we don't assign them as customers
      if (meta.ownerId) allWorkerIds.add(meta.ownerId);
      if (meta.employees) {
        for (const emp of meta.employees) {
          allWorkerIds.add(typeof emp === 'string' ? emp : emp.id);
        }
      }
    });

    // Collect available civilian NPCs per settlement (not owners/employees of any business)
    const npcsBySettlement = new Map<string, string[]>();
    // Build a lookup of NPC -> settlement from buildingData (residence or business)
    const npcSettlement = new Map<string, string>();
    buildingData.forEach((entry) => {
      const meta = entry.metadata;
      const sid = meta.settlementId;
      if (!sid) return;
      if (meta.ownerId) npcSettlement.set(meta.ownerId, sid);
      if (meta.employees) {
        for (const emp of meta.employees) {
          npcSettlement.set(typeof emp === 'string' ? emp : emp.id, sid);
        }
      }
      if (Array.isArray(meta.occupants)) {
        for (const occ of meta.occupants as Array<string | { id: string }>) {
          npcSettlement.set(typeof occ === 'string' ? occ : occ.id, sid);
        }
      }
    });

    // Build per-settlement available NPC pools (non-workers only)
    npcMeshes.forEach((_npc, npcId) => {
      if (allWorkerIds.has(npcId)) return;
      const sid = npcSettlement.get(npcId) || '__global__';
      if (!npcsBySettlement.has(sid)) {
        npcsBySettlement.set(sid, []);
      }
      npcsBySettlement.get(sid)!.push(npcId);
    });

    let totalCustomersAssigned = 0;
    const customersByBusiness = new Map<string, string[]>();

    // For each settlement, assign customers to businesses
    businessesBySettlement.forEach((businesses, settlementId) => {
      const availablePool = npcsBySettlement.get(settlementId) || npcsBySettlement.get('__global__') || [];
      if (availablePool.length === 0) return;

      for (const biz of businesses) {
        const numCustomers = options.minCustomers +
          (simpleHash(biz.id) % (options.maxCustomers - options.minCustomers + 1));

        const customers = this.selectCustomers(
          availablePool, biz.id, numCustomers,
        );

        if (customers.length === 0) continue;

        const assignments: BusinessCustomerAssignment[] = [];
        const customerIds: string[] = [];

        for (const customerId of customers) {
          const npc = npcMeshes.get(customerId);
          if (!npc) continue;

          const pos = this.findSpawnNear(
            biz.entry.position, options.spawnSpread, options.spawnMinOffset,
            options.isPointInsideBuilding,
          );
          npc.mesh.position = pos;

          const assignment: BusinessCustomerAssignment = {
            npcId: customerId,
            businessId: biz.id,
            position: pos,
          };
          assignments.push(assignment);
          customerIds.push(customerId);
          this.assignedCustomerIds.add(customerId);
          totalCustomersAssigned++;
        }

        this.customerAssignments.set(biz.id, assignments);
        customersByBusiness.set(biz.id, customerIds);
      }
    });

    return { totalCustomersAssigned, customersByBusiness };
  }

  /**
   * Select customer NPCs from the available pool, avoiding already-assigned NPCs.
   * Uses a hash-based selection for deterministic-ish but varied picks.
   */
  private selectCustomers(
    pool: string[],
    businessId: string,
    count: number,
  ): string[] {
    const unassigned = pool.filter(id => !this.assignedCustomerIds.has(id));
    if (unassigned.length === 0) return [];

    const actual = Math.min(count, unassigned.length);
    const selected: string[] = [];
    const startIdx = simpleHash(businessId) % unassigned.length;

    for (let i = 0; i < actual; i++) {
      const idx = (startIdx + i) % unassigned.length;
      selected.push(unassigned[idx]);
    }

    return selected;
  }

  /** Find a spawn position near a building center, avoiding building interiors. */
  private findSpawnNear(
    center: Vector3,
    spread: number,
    minOffset: number,
    isInsideBuilding: (x: number, z: number) => boolean,
    maxAttempts = 8,
  ): Vector3 {
    for (let i = 0; i < maxAttempts; i++) {
      const rawX = (Math.random() - 0.5) * spread;
      const rawZ = (Math.random() - 0.5) * spread;
      const x = center.x + Math.sign(rawX || 1) * Math.max(Math.abs(rawX), minOffset);
      const z = center.z + Math.sign(rawZ || 1) * Math.max(Math.abs(rawZ), minOffset);
      if (!isInsideBuilding(x, z)) {
        return new Vector3(x, 12, z);
      }
    }
    // Fallback: offset directly in front
    return new Vector3(center.x + minOffset, 12, center.z + minOffset);
  }

  /** Get customer assignments for a specific business. */
  getCustomersForBusiness(businessId: string): BusinessCustomerAssignment[] {
    return this.customerAssignments.get(businessId) || [];
  }

  /** Check if an NPC is assigned as a customer to any business. */
  isCustomer(npcId: string): boolean {
    return this.assignedCustomerIds.has(npcId);
  }

  /** Get all customer assignments. */
  getAllAssignments(): Map<string, BusinessCustomerAssignment[]> {
    return this.customerAssignments;
  }

  /** Clear all assignments (e.g., on time-of-day change). */
  clear(): void {
    this.customerAssignments.clear();
    this.assignedCustomerIds.clear();
  }
}
