/**
 * NPCBusinessInteractionSystem
 *
 * Manages context-aware NPC interactions inside businesses.
 * When the player is inside a business building and near an NPC,
 * this system provides business-specific interaction options:
 * buying, selling, and services (healing, banking, lodging, etc.).
 *
 * Integrates with:
 * - InteriorNPCManager (NPC placement and roles)
 * - BabylonShopPanel (buy/sell UI)
 * - BabylonGame (player stats, gold, energy, health)
 */

import type { PlacedInteriorNPC } from './InteriorNPCManager';

/** A business service that an NPC can provide */
export interface BusinessService {
  id: string;
  name: string;
  description: string;
  /** Gold cost (0 = free) */
  cost: number;
  /** Icon/emoji for display */
  icon: string;
  /** Which NPC roles can offer this service */
  availableToRoles: Array<'owner' | 'employee' | 'visitor' | 'patron'>;
}

/** Result of using a business service */
export interface ServiceResult {
  success: boolean;
  message: string;
  /** Effects applied to the player */
  effects: ServiceEffect[];
}

export interface ServiceEffect {
  type: 'health' | 'energy' | 'gold' | 'status';
  /** Positive = gain, negative = cost */
  amount: number;
  /** For status effects */
  statusName?: string;
  statusDuration?: number;
}

/** Player stats needed for service validation */
export interface PlayerStats {
  gold: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
}

/** Interaction option shown to the player */
export interface BusinessInteraction {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** Whether this opens the shop panel */
  isShopAction: boolean;
  /** Service definition if not a shop action */
  service?: BusinessService;
  /** Whether the player can afford/use this */
  enabled: boolean;
  disabledReason?: string;
}

/** Service definitions per business type */
const BUSINESS_SERVICES: Record<string, BusinessService[]> = {
  Hospital: [
    {
      id: 'heal',
      name: 'Heal Wounds',
      description: 'Restore health to full',
      cost: 25,
      icon: '\u2764\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
    {
      id: 'cure_status',
      name: 'Cure Ailments',
      description: 'Remove negative status effects',
      cost: 40,
      icon: '\uD83D\uDC8A',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  DentalOffice: [
    {
      id: 'heal',
      name: 'Dental Care',
      description: 'Restore some health',
      cost: 15,
      icon: '\uD83E\uDEB7',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  OptometryOffice: [
    {
      id: 'heal',
      name: 'Eye Care',
      description: 'Restore some health',
      cost: 15,
      icon: '\uD83D\uDC41\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Bank: [
    {
      id: 'deposit',
      name: 'Deposit Gold',
      description: 'Store gold safely (earn 5% interest)',
      cost: 0,
      icon: '\uD83C\uDFE6',
      availableToRoles: ['owner', 'employee'],
    },
    {
      id: 'withdraw',
      name: 'Withdraw Gold',
      description: 'Retrieve stored gold',
      cost: 0,
      icon: '\uD83D\uDCB0',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Hotel: [
    {
      id: 'rest',
      name: 'Rest',
      description: 'Sleep to restore energy and health',
      cost: 20,
      icon: '\uD83D\uDECF\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Church: [
    {
      id: 'blessing',
      name: 'Receive Blessing',
      description: 'Temporary boost to energy recovery',
      cost: 0,
      icon: '\u2728',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  School: [
    {
      id: 'study',
      name: 'Study',
      description: 'Learn and gain experience',
      cost: 10,
      icon: '\uD83D\uDCDA',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  University: [
    {
      id: 'study',
      name: 'Attend Lecture',
      description: 'Learn advanced topics',
      cost: 25,
      icon: '\uD83C\uDF93',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  TattoParlor: [
    {
      id: 'tattoo',
      name: 'Get a Tattoo',
      description: 'Cosmetic mark of distinction',
      cost: 30,
      icon: '\uD83D\uDC89',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Pharmacy: [
    {
      id: 'heal',
      name: 'Buy Medicine',
      description: 'Restore some health',
      cost: 15,
      icon: '\uD83D\uDC8A',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Restaurant: [
    {
      id: 'eat_meal',
      name: 'Order a Meal',
      description: 'Restore energy with a cooked meal',
      cost: 10,
      icon: '\uD83C\uDF7D\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Bar: [
    {
      id: 'buy_drink',
      name: 'Order a Drink',
      description: 'Restore a bit of energy',
      cost: 5,
      icon: '\uD83C\uDF7A',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  LawFirm: [
    {
      id: 'legal_counsel',
      name: 'Legal Counsel',
      description: 'Get advice on local laws and regulations',
      cost: 30,
      icon: '\u2696\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Barbershop: [
    {
      id: 'haircut',
      name: 'Get a Haircut',
      description: 'A fresh cut to boost your confidence',
      cost: 10,
      icon: '\u2702\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Bathhouse: [
    {
      id: 'bathe',
      name: 'Take a Bath',
      description: 'Relax and restore energy',
      cost: 15,
      icon: '\uD83D\uDEC1',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Carpenter: [
    {
      id: 'repair',
      name: 'Repair Equipment',
      description: 'Fix damaged tools and gear',
      cost: 20,
      icon: '\uD83D\uDD28',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Stables: [
    {
      id: 'stable_horse',
      name: 'Stable a Horse',
      description: 'Rest and feed your mount',
      cost: 15,
      icon: '\uD83D\uDC0E',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Clinic: [
    {
      id: 'heal',
      name: 'Medical Treatment',
      description: 'Restore health with basic care',
      cost: 15,
      icon: '\uD83E\uDE7A',
      availableToRoles: ['owner', 'employee'],
    },
    {
      id: 'cure_status',
      name: 'Treat Ailments',
      description: 'Remove minor negative effects',
      cost: 25,
      icon: '\uD83D\uDC8A',
      availableToRoles: ['owner', 'employee'],
    },
  ],
  Blacksmith: [
    {
      id: 'repair',
      name: 'Repair Weapons & Armor',
      description: 'Restore damaged equipment',
      cost: 20,
      icon: '\u2694\uFE0F',
      availableToRoles: ['owner', 'employee'],
    },
  ],
};

/** Business types that support buying/selling via the shop panel */
const MERCANTILE_BUSINESS_TYPES = new Set([
  'Shop',
  'GroceryStore',
  'Bakery',
  'Bar',
  'Restaurant',
  'Farm',
  'Brewery',
  'JewelryStore',
  'Pharmacy',
  'FishMarket',
  'Warehouse',
  'Hotel',
  'Hospital',
  'Blacksmith',
  'Tailor',
  'Butcher',
  'BookStore',
  'HerbShop',
  'PawnShop',
  'Carpenter',
]);

/** NPC proximity threshold for interaction (distance units) */
const INTERACTION_PROXIMITY = 5;

export class NPCBusinessInteractionSystem {
  /**
   * Get available business interactions for an NPC inside a building.
   *
   * @param npc The placed interior NPC
   * @param businessType The type of business the player is inside
   * @param playerStats Current player stats for validation
   * @param playerPosition Player position {x, z} for proximity check
   * @returns List of available interactions
   */
  getInteractionsForNPC(
    npc: PlacedInteriorNPC,
    businessType: string | undefined,
    playerStats: PlayerStats,
    playerPosition?: { x: number; z: number }
  ): BusinessInteraction[] {
    if (!businessType) return [];

    // Check proximity if position provided
    if (playerPosition && npc.interiorPosition) {
      const dx = playerPosition.x - npc.interiorPosition.x;
      const dz = playerPosition.z - npc.interiorPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > INTERACTION_PROXIMITY) return [];
    }

    const interactions: BusinessInteraction[] = [];

    // Add chat option (always available for any NPC)
    interactions.push({
      id: '__chat__',
      label: 'Talk',
      description: 'Start a conversation',
      icon: '\uD83D\uDCAC',
      isShopAction: false,
      enabled: true,
    });

    // Add shop action for mercantile businesses with owner/employee NPCs
    if (MERCANTILE_BUSINESS_TYPES.has(businessType) && (npc.role === 'owner' || npc.role === 'employee')) {
      interactions.push({
        id: '__browse_wares__',
        label: 'Browse Wares',
        description: 'Buy and sell items',
        icon: '\uD83D\uDED2',
        isShopAction: true,
        enabled: true,
      });
    }

    // Add business-specific services
    const services = BUSINESS_SERVICES[businessType];
    if (services) {
      for (const service of services) {
        if (!service.availableToRoles.includes(npc.role)) continue;

        const { enabled, reason } = this.validateService(service, playerStats);
        interactions.push({
          id: service.id,
          label: service.name,
          description: service.description,
          icon: service.icon,
          isShopAction: false,
          service,
          enabled,
          disabledReason: reason,
        });
      }
    }

    return interactions;
  }

  /**
   * Execute a business service and return the result.
   */
  executeService(
    service: BusinessService,
    playerStats: PlayerStats
  ): ServiceResult {
    const { enabled, reason } = this.validateService(service, playerStats);
    if (!enabled) {
      return { success: false, message: reason || 'Cannot use this service', effects: [] };
    }

    const effects: ServiceEffect[] = [];

    // Deduct cost
    if (service.cost > 0) {
      effects.push({ type: 'gold', amount: -service.cost });
    }

    // Apply service-specific effects
    switch (service.id) {
      case 'heal': {
        const healAmount = playerStats.maxHealth - playerStats.health;
        if (healAmount > 0) {
          effects.push({ type: 'health', amount: healAmount });
        }
        return { success: true, message: `Healed to full health! (-${service.cost}g)`, effects };
      }

      case 'cure_status':
        effects.push({ type: 'status', amount: 0, statusName: 'cured' });
        return { success: true, message: `Ailments cured! (-${service.cost}g)`, effects };

      case 'rest': {
        const energyRestore = playerStats.maxEnergy - playerStats.energy;
        const healthRestore = Math.floor((playerStats.maxHealth - playerStats.health) * 0.5);
        if (energyRestore > 0) effects.push({ type: 'energy', amount: energyRestore });
        if (healthRestore > 0) effects.push({ type: 'health', amount: healthRestore });
        return { success: true, message: `Well rested! Energy restored. (-${service.cost}g)`, effects };
      }

      case 'blessing':
        effects.push({ type: 'energy', amount: 20 });
        effects.push({ type: 'status', amount: 0, statusName: 'blessed', statusDuration: 300 });
        return { success: true, message: 'You feel blessed. Energy slightly restored.', effects };

      case 'eat_meal':
        effects.push({ type: 'energy', amount: 40 });
        return { success: true, message: `Delicious meal! Energy restored. (-${service.cost}g)`, effects };

      case 'buy_drink':
        effects.push({ type: 'energy', amount: 15 });
        return { success: true, message: `Refreshing drink! (-${service.cost}g)`, effects };

      case 'study':
        effects.push({ type: 'energy', amount: -10 });
        effects.push({ type: 'status', amount: 0, statusName: 'studied', statusDuration: 600 });
        return { success: true, message: `Productive study session! (-${service.cost}g)`, effects };

      case 'tattoo':
        effects.push({ type: 'health', amount: -5 });
        effects.push({ type: 'status', amount: 0, statusName: 'tattooed' });
        return { success: true, message: `Nice new tattoo! (-${service.cost}g)`, effects };

      case 'legal_counsel':
        effects.push({ type: 'status', amount: 0, statusName: 'legally_advised', statusDuration: 600 });
        return { success: true, message: `Good legal advice received. (-${service.cost}g)`, effects };

      case 'deposit':
        return { success: true, message: 'Gold deposited safely.', effects: [] };

      case 'withdraw':
        return { success: true, message: 'Gold withdrawn.', effects: [] };

      default:
        return { success: true, message: `${service.name} completed. (-${service.cost}g)`, effects };
    }
  }

  /**
   * Check if a player can use a given service.
   */
  private validateService(
    service: BusinessService,
    playerStats: PlayerStats
  ): { enabled: boolean; reason?: string } {
    if (service.cost > 0 && playerStats.gold < service.cost) {
      return { enabled: false, reason: `Not enough gold (need ${service.cost}g, have ${playerStats.gold}g)` };
    }

    // Service-specific validations
    switch (service.id) {
      case 'heal':
        if (playerStats.health >= playerStats.maxHealth) {
          return { enabled: false, reason: 'Already at full health' };
        }
        break;
      case 'rest':
        if (playerStats.energy >= playerStats.maxEnergy && playerStats.health >= playerStats.maxHealth) {
          return { enabled: false, reason: 'Already fully rested' };
        }
        break;
    }

    return { enabled: true };
  }

  /**
   * Get all service definitions for a given business type.
   */
  getServicesForBusinessType(businessType: string): BusinessService[] {
    return BUSINESS_SERVICES[businessType] || [];
  }

  /**
   * Check if a business type supports buying/selling.
   */
  isMercantileBusiness(businessType: string): boolean {
    return MERCANTILE_BUSINESS_TYPES.has(businessType);
  }

  /**
   * Find the nearest interactable NPC from placed interior NPCs.
   */
  findNearestInteractableNPC(
    placedNPCs: PlacedInteriorNPC[],
    playerPosition: { x: number; z: number }
  ): PlacedInteriorNPC | null {
    let nearest: PlacedInteriorNPC | null = null;
    let nearestDist = INTERACTION_PROXIMITY;

    for (const npc of placedNPCs) {
      const dx = playerPosition.x - npc.interiorPosition.x;
      const dz = playerPosition.z - npc.interiorPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = npc;
      }
    }

    return nearest;
  }
}
