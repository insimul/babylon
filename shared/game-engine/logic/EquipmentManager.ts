/**
 * Equipment Manager
 *
 * Tracks equipped items in weapon/armor/accessory slots and applies
 * stat bonuses from item effects to the CombatSystem player entity.
 */

import type { InventoryItem, EquipmentSlot } from '@shared/game-engine/types';
import type { CombatSystem } from './CombatSystem';

const EQUIPPABLE_TYPES: Record<string, EquipmentSlot> = {
  weapon: 'weapon',
  armor: 'armor',
  tool: 'accessory',
};

const STAT_KEYS = ['attackPower', 'defense', 'dodgeChance'] as const;

export class EquipmentManager {
  private equipped = new Map<EquipmentSlot, InventoryItem | null>([
    ['weapon', null],
    ['armor', null],
    ['accessory', null],
  ]);

  private baseStats: { attackPower: number; defense: number; dodgeChance: number };

  constructor(
    private combatSystem: CombatSystem,
    private playerId: string,
  ) {
    const entity = combatSystem.getEntity(playerId);
    this.baseStats = {
      attackPower: entity?.attackPower ?? 1.0,
      defense: entity?.defense ?? 10,
      dodgeChance: entity?.dodgeChance ?? 0.15,
    };
  }

  /** Determine which slot an item can equip to, or null if not equippable. */
  canEquip(item: InventoryItem): EquipmentSlot | null {
    if (item.equipSlot) return item.equipSlot;
    return EQUIPPABLE_TYPES[item.type] ?? null;
  }

  /** Equip an item. Returns the slot used and any previously equipped item, or null if not equippable. */
  equip(item: InventoryItem): { slot: EquipmentSlot; previousItem: InventoryItem | null } | null {
    const slot = this.canEquip(item);
    if (!slot) return null;

    const previousItem = this.equipped.get(slot) ?? null;
    if (previousItem) {
      previousItem.equipped = false;
    }

    item.equipped = true;
    this.equipped.set(slot, item);
    this.recalculateStats();

    return { slot, previousItem };
  }

  /** Unequip an item from a slot. Returns the removed item or null. */
  unequip(slot: EquipmentSlot): InventoryItem | null {
    const item = this.equipped.get(slot) ?? null;
    if (!item) return null;

    item.equipped = false;
    this.equipped.set(slot, null);
    this.recalculateStats();

    return item;
  }

  /** Find which slot an item is equipped in. */
  findSlot(item: InventoryItem): EquipmentSlot | null {
    for (const [slot, equipped] of Array.from(this.equipped.entries())) {
      if (equipped && equipped.id === item.id) return slot;
    }
    return null;
  }

  getEquipped(slot: EquipmentSlot): InventoryItem | null {
    return this.equipped.get(slot) ?? null;
  }

  getAllEquipped(): Map<EquipmentSlot, InventoryItem | null> {
    return new Map(this.equipped);
  }

  /** Recalculate player combat stats from base + all equipped item effects. */
  private recalculateStats(): void {
    const entity = this.combatSystem.getEntity(this.playerId);
    if (!entity) return;

    const totals = { ...this.baseStats };

    for (const item of Array.from(this.equipped.values())) {
      if (!item?.effects) continue;
      for (const key of STAT_KEYS) {
        if (item.effects[key]) {
          totals[key] += item.effects[key];
        }
      }
    }

    entity.attackPower = Math.max(0.1, totals.attackPower);
    entity.defense = Math.min(100, Math.max(0, totals.defense));
    entity.dodgeChance = Math.min(1, Math.max(0, totals.dodgeChance));
  }
}
