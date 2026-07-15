/**
 * InteriorItemManager
 *
 * Spawns item props inside building interiors based on world items
 * assigned to that building (via item.metadata.businessId / residenceId).
 * Items are placed at contextually appropriate positions within the room
 * and are interactive (pickable with objectRole metadata).
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { InteriorLayout } from './BuildingInteriorGenerator';

export interface InteriorItemData {
  id: string;
  name: string;
  objectRole?: string | null;
  itemType: string;
  icon?: string | null;
  metadata?: Record<string, any> | null;
  possessable?: boolean | null;
  translations?: any;
}

interface ItemPlacement {
  offsetX: number;
  offsetZ: number;
  height: number;
}

/**
 * Maps business types to item types/roles that should appear in them.
 * Used when items don't have explicit businessId assignments.
 */
const BUSINESS_ITEM_TYPES: Record<string, string[]> = {
  tavern: ['drink', 'food', 'mug', 'bottle', 'ale', 'wine', 'bread'],
  bar: ['drink', 'bottle', 'mug', 'ale', 'wine', 'glass'],
  restaurant: ['food', 'drink', 'plate', 'bowl', 'bread', 'wine'],
  bakery: ['food', 'bread', 'pastry', 'cake', 'flour', 'pie'],
  shop: ['tool', 'material', 'collectible', 'goods', 'wares'],
  grocerystore: ['food', 'fruit', 'vegetable', 'bread', 'cheese', 'produce'],
  grocery: ['food', 'fruit', 'vegetable', 'bread', 'cheese', 'produce'],
  blacksmith: ['weapon', 'armor', 'tool', 'metal', 'sword', 'shield', 'ingot'],
  armory: ['weapon', 'armor', 'sword', 'shield', 'bow'],
  library: ['book', 'scroll', 'tome', 'document', 'manuscript'],
  bookshop: ['book', 'scroll', 'tome', 'document'],
  apothecary: ['potion', 'herb', 'medicine', 'consumable', 'remedy'],
  herbalist: ['herb', 'potion', 'plant', 'medicine', 'consumable'],
  tailor: ['material', 'cloth', 'fabric', 'clothing'],
  jeweler: ['gem', 'ring', 'necklace', 'collectible', 'jewelry'],
  general: ['tool', 'food', 'material', 'consumable', 'goods'],
  inn: ['food', 'drink', 'key', 'bread', 'ale'],
  church: ['book', 'scroll', 'candle', 'document'],
  school: ['book', 'scroll', 'document', 'ink', 'quill'],
  hospital: ['medicine', 'potion', 'herb', 'consumable', 'bandage'],
  residence: ['food', 'drink', 'book', 'tool', 'key'],
};

/**
 * Maps business/building types to placement positions for items within interiors.
 * Positions are relative to the interior center. Items are placed on surfaces
 * (counters, shelves, tables) that match the furniture layout.
 */
const INTERIOR_ITEM_PLACEMENTS: Record<string, ItemPlacement[]> = {
  tavern: [
    { offsetX: 0, offsetZ: 2.5, height: 1.3 },       // on bar counter
    { offsetX: -3, offsetZ: -2, height: 0.9 },        // on table
    { offsetX: 3, offsetZ: -2, height: 0.9 },         // on table
    { offsetX: -3, offsetZ: 1, height: 0.9 },         // on table
    { offsetX: 3, offsetZ: 1, height: 0.9 },          // on table
    { offsetX: -7, offsetZ: 6, height: 0 },           // back room near barrel
    { offsetX: 7, offsetZ: 6, height: 0 },            // back room near barrel
    { offsetX: 0, offsetZ: 6, height: 1.1 },          // kitchen prep table
    { offsetX: 4, offsetZ: 0, height: 0 },            // floor common room
    { offsetX: -1, offsetZ: 2.5, height: 1.3 },       // bar counter end
  ],
  bar: [
    { offsetX: 0, offsetZ: 2.5, height: 1.3 },       // on bar counter
    { offsetX: -2, offsetZ: 2.5, height: 1.3 },       // bar counter end
    { offsetX: -3, offsetZ: -2, height: 0.9 },        // on table
    { offsetX: 3, offsetZ: -2, height: 0.9 },         // on table
    { offsetX: -3, offsetZ: 1, height: 0.9 },         // on table
    { offsetX: 3, offsetZ: 1, height: 0.9 },          // on table
    { offsetX: -5, offsetZ: 5, height: 0 },           // near barrel
    { offsetX: 5, offsetZ: 5, height: 0 },            // near barrel
    { offsetX: 0, offsetZ: 5, height: 1.1 },          // back shelf
    { offsetX: 2, offsetZ: 0, height: 0 },            // floor
  ],
  restaurant: [
    { offsetX: -3, offsetZ: -2, height: 0.9 },        // table
    { offsetX: 3, offsetZ: -2, height: 0.9 },         // table
    { offsetX: -3, offsetZ: 1, height: 0.9 },         // table
    { offsetX: 3, offsetZ: 1, height: 0.9 },          // table
    { offsetX: 0, offsetZ: -1, height: 0.9 },         // center table
    { offsetX: 0, offsetZ: 5, height: 1.1 },          // kitchen counter
    { offsetX: -4, offsetZ: 5, height: 0.8 },         // kitchen shelf
    { offsetX: 4, offsetZ: 5, height: 0.8 },          // kitchen shelf
    { offsetX: -2, offsetZ: 5, height: 0 },           // kitchen floor
    { offsetX: 0, offsetZ: 2, height: 1.1 },          // serving counter
    { offsetX: -5, offsetZ: 0, height: 0.8 },         // side shelf
    { offsetX: 5, offsetZ: 0, height: 0.8 },          // side shelf
  ],
  bakery: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // display counter
    { offsetX: -3, offsetZ: -2, height: 1.1 },        // display counter end
    { offsetX: 3, offsetZ: -2, height: 1.1 },         // display counter end
    { offsetX: -5, offsetZ: 0, height: 0.8 },         // shelf
    { offsetX: 5, offsetZ: 0, height: 0.8 },          // shelf
    { offsetX: 0, offsetZ: 4, height: 1.0 },          // prep table
    { offsetX: -3, offsetZ: 4, height: 0.8 },         // storage shelf
    { offsetX: 3, offsetZ: 4, height: 0 },            // flour sack
    { offsetX: -2, offsetZ: 6, height: 0 },           // near oven
    { offsetX: 2, offsetZ: 6, height: 0 },            // near oven
  ],
  shop: [
    { offsetX: 0, offsetZ: -3, height: 1.1 },         // counter
    { offsetX: -5, offsetZ: -1, height: 0.8 },        // shelf
    { offsetX: 5, offsetZ: -1, height: 0.8 },         // shelf
    { offsetX: -5, offsetZ: 1, height: 1.4 },         // upper shelf
    { offsetX: 5, offsetZ: 1, height: 1.4 },          // upper shelf
    { offsetX: 0, offsetZ: -1, height: 1.0 },         // display table
    { offsetX: -2, offsetZ: 5, height: 0 },           // storage crate
    { offsetX: 2, offsetZ: 5, height: 0 },            // storage barrel
    { offsetX: 0, offsetZ: 4, height: 0.8 },          // storage shelf
    { offsetX: -5, offsetZ: 3, height: 0.8 },         // back shelf
    { offsetX: 5, offsetZ: 3, height: 0.8 },          // back shelf
    { offsetX: 0, offsetZ: 0, height: 0.9 },          // center display
  ],
  blacksmith: [
    { offsetX: 0, offsetZ: -1, height: 0.9 },         // anvil
    { offsetX: 0, offsetZ: 2, height: 1.1 },          // workbench
    { offsetX: -6, offsetZ: 0, height: 0.5 },         // tool rack
    { offsetX: 6, offsetZ: 0, height: 0.5 },          // tool rack
    { offsetX: 5, offsetZ: -2, height: 0 },           // near barrel
    { offsetX: -3, offsetZ: -3, height: 0 },          // floor workshop
    { offsetX: -2, offsetZ: 5, height: 0 },           // storage crate
    { offsetX: 2, offsetZ: 5, height: 0 },            // storage barrel
    { offsetX: -4, offsetZ: 3, height: 0.8 },         // weapon rack
    { offsetX: 4, offsetZ: 3, height: 0.8 },          // weapon rack
  ],
  butcher: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // cutting counter
    { offsetX: -3, offsetZ: -2, height: 1.1 },        // display counter
    { offsetX: 3, offsetZ: -2, height: 1.1 },         // display counter
    { offsetX: -5, offsetZ: 1, height: 0.5 },         // tool hook
    { offsetX: 0, offsetZ: 3, height: 1.0 },          // prep table
    { offsetX: -3, offsetZ: 5, height: 0 },           // storage
    { offsetX: 3, offsetZ: 5, height: 0 },            // storage
    { offsetX: 5, offsetZ: 1, height: 0.8 },          // shelf
  ],
  carpenter: [
    { offsetX: 0, offsetZ: 0, height: 1.0 },          // workbench
    { offsetX: -4, offsetZ: -2, height: 0 },          // lumber stack
    { offsetX: 4, offsetZ: -2, height: 0 },           // lumber stack
    { offsetX: -6, offsetZ: 1, height: 0.5 },         // tool rack
    { offsetX: 6, offsetZ: 1, height: 0.5 },          // tool rack
    { offsetX: 0, offsetZ: 4, height: 0 },            // floor
    { offsetX: -3, offsetZ: 5, height: 0 },           // storage
    { offsetX: 3, offsetZ: 5, height: 0 },            // storage
  ],
  tailor: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // display counter
    { offsetX: -3, offsetZ: -1, height: 1.4 },        // mannequin
    { offsetX: 3, offsetZ: -1, height: 1.4 },         // mannequin
    { offsetX: 0, offsetZ: 2, height: 0.9 },          // sewing table
    { offsetX: -4, offsetZ: 3, height: 0.8 },         // fabric shelf
    { offsetX: 4, offsetZ: 3, height: 0.8 },          // fabric shelf
    { offsetX: -2, offsetZ: 5, height: 0 },           // basket
    { offsetX: 2, offsetZ: 5, height: 0 },            // basket
  ],
  bookstore: [
    { offsetX: 0, offsetZ: -2, height: 1.0 },         // front display
    { offsetX: -5, offsetZ: -1, height: 0.8 },        // shelf
    { offsetX: 5, offsetZ: -1, height: 0.8 },         // shelf
    { offsetX: -5, offsetZ: 1, height: 1.4 },         // upper shelf
    { offsetX: 5, offsetZ: 1, height: 1.4 },          // upper shelf
    { offsetX: -5, offsetZ: 3, height: 0.8 },         // back shelf
    { offsetX: 5, offsetZ: 3, height: 0.8 },          // back shelf
    { offsetX: 0, offsetZ: 1, height: 0.9 },          // reading table
    { offsetX: 0, offsetZ: 4, height: 0.85 },         // desk
    { offsetX: -2, offsetZ: 5, height: 0 },           // stack on floor
  ],
  herbshop: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // counter
    { offsetX: -5, offsetZ: 0, height: 0.8 },         // herb shelf
    { offsetX: 5, offsetZ: 0, height: 0.8 },          // herb shelf
    { offsetX: -5, offsetZ: 2, height: 1.4 },         // upper shelf
    { offsetX: 5, offsetZ: 2, height: 1.4 },          // upper shelf
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // mixing table
    { offsetX: -3, offsetZ: 5, height: 0 },           // basket
    { offsetX: 3, offsetZ: 5, height: 0 },            // barrel
  ],
  pharmacy: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // counter
    { offsetX: -5, offsetZ: 0, height: 0.8 },         // shelf
    { offsetX: 5, offsetZ: 0, height: 0.8 },          // shelf
    { offsetX: -5, offsetZ: 2, height: 1.4 },         // upper shelf
    { offsetX: 5, offsetZ: 2, height: 1.4 },          // upper shelf
    { offsetX: 0, offsetZ: 4, height: 0.9 },          // prep table
    { offsetX: -3, offsetZ: 5, height: 0 },           // storage
    { offsetX: 3, offsetZ: 5, height: 0 },            // storage
  ],
  temple: [
    { offsetX: 0, offsetZ: 10, height: 1.3 },         // altar
    { offsetX: -4, offsetZ: 8, height: 0 },           // near altar
    { offsetX: 4, offsetZ: 8, height: 0 },            // near altar
    { offsetX: 0, offsetZ: 0, height: 0 },            // center aisle
    { offsetX: -3, offsetZ: -4, height: 0 },          // near pews
    { offsetX: 3, offsetZ: -4, height: 0 },           // near pews
  ],
  church: [
    { offsetX: 0, offsetZ: 10, height: 1.3 },         // altar
    { offsetX: -4, offsetZ: 8, height: 0 },           // near altar
    { offsetX: 4, offsetZ: 8, height: 0 },            // near altar
    { offsetX: 0, offsetZ: 0, height: 0 },            // center aisle
    { offsetX: -3, offsetZ: -4, height: 0 },          // near pews
    { offsetX: 3, offsetZ: -4, height: 0 },           // near pews
  ],
  school: [
    { offsetX: 0, offsetZ: -1, height: 0.9 },         // teacher desk
    { offsetX: -3, offsetZ: -3, height: 0.7 },        // student desk
    { offsetX: 3, offsetZ: -3, height: 0.7 },         // student desk
    { offsetX: -3, offsetZ: 0, height: 0.7 },         // student desk
    { offsetX: 3, offsetZ: 0, height: 0.7 },          // student desk
    { offsetX: -5, offsetZ: 3, height: 0.8 },         // bookshelf
    { offsetX: 5, offsetZ: 3, height: 0.8 },          // bookshelf
  ],
  guild: [
    { offsetX: 0, offsetZ: -1, height: 0.9 },         // meeting table
    { offsetX: -3, offsetZ: -1, height: 0.9 },        // meeting table
    { offsetX: 3, offsetZ: -1, height: 0.9 },         // meeting table
    { offsetX: 0, offsetZ: 5, height: 0.85 },         // office desk
    { offsetX: -3, offsetZ: 5, height: 0.8 },         // bookshelf
    { offsetX: 3, offsetZ: 5, height: 1.2 },          // bookshelf
  ],
  bank: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // teller counter
    { offsetX: -3, offsetZ: -2, height: 1.1 },        // teller counter
    { offsetX: 3, offsetZ: -2, height: 1.1 },         // teller counter
    { offsetX: 0, offsetZ: 4, height: 0.9 },          // office desk
    { offsetX: -4, offsetZ: 4, height: 0 },           // safe area
  ],
  hotel: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // front desk
    { offsetX: -3, offsetZ: 0, height: 0.9 },         // lobby table
    { offsetX: 3, offsetZ: 0, height: 0.9 },          // lobby table
    { offsetX: -5, offsetZ: 3, height: 0.8 },         // shelf
    { offsetX: 5, offsetZ: 3, height: 0.8 },          // shelf
    { offsetX: 0, offsetZ: 5, height: 0.6 },          // hallway table
    { offsetX: -2, offsetZ: 6, height: 0 },           // storage
    { offsetX: 2, offsetZ: 6, height: 0 },            // storage
  ],
  stables: [
    { offsetX: -3, offsetZ: -2, height: 0 },          // hay bale
    { offsetX: 3, offsetZ: -2, height: 0 },           // hay bale
    { offsetX: -5, offsetZ: 1, height: 0.5 },         // tool hook
    { offsetX: 5, offsetZ: 1, height: 0.5 },          // tool hook
    { offsetX: 0, offsetZ: 4, height: 0 },            // feed trough
    { offsetX: -3, offsetZ: 5, height: 0 },           // barrel
  ],
  residence: [
    { offsetX: 0, offsetZ: -2, height: 0.6 },         // living room table
    { offsetX: -2, offsetZ: -3, height: 0 },          // living room floor
    { offsetX: 3, offsetZ: -3, height: 0 },           // near chest
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // kitchen table
    { offsetX: -3, offsetZ: 3, height: 0 },           // kitchen barrel
    { offsetX: 0, offsetZ: 0, height: 0 },            // center hallway
    { offsetX: -4, offsetZ: -1, height: 0.8 },        // shelf
    { offsetX: 4, offsetZ: -1, height: 0.8 },         // shelf
  ],
  warehouse: [
    { offsetX: -4, offsetZ: -2, height: 0 },          // near crates
    { offsetX: 0, offsetZ: 2, height: 0 },            // near barrels
    { offsetX: 4, offsetZ: 4, height: 0 },            // near crates
    { offsetX: -4, offsetZ: 4, height: 0 },           // near barrels
    { offsetX: 0, offsetZ: -3, height: 0 },           // floor
    { offsetX: -8, offsetZ: 0, height: 0.8 },         // shelf
    { offsetX: -8, offsetZ: 3, height: 1.4 },         // upper shelf
    { offsetX: 4, offsetZ: -4, height: 0 },           // floor
    { offsetX: 0, offsetZ: 0, height: 0 },            // center
  ],
  farm: [
    { offsetX: -3, offsetZ: -2, height: 0 },          // near equipment
    { offsetX: 3, offsetZ: -2, height: 0 },           // near equipment
    { offsetX: -5, offsetZ: 1, height: 0.5 },         // tool rack
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // table
    { offsetX: -3, offsetZ: 5, height: 0 },           // barrel
    { offsetX: 3, offsetZ: 5, height: 0 },            // crate
  ],
  theater: [
    { offsetX: 0, offsetZ: 4, height: 0.5 },          // on stage
    { offsetX: -3, offsetZ: 4, height: 0.5 },         // stage left
    { offsetX: 3, offsetZ: 4, height: 0.5 },          // stage right
    { offsetX: -4, offsetZ: -2, height: 0.8 },        // seating area left
    { offsetX: 4, offsetZ: -2, height: 0.8 },         // seating area right
    { offsetX: 0, offsetZ: -4, height: 0 },           // aisle floor
    { offsetX: -6, offsetZ: 6, height: 0 },           // backstage left
    { offsetX: 6, offsetZ: 6, height: 0 },            // backstage right
  ],
  autorepair: [
    { offsetX: -4, offsetZ: 2, height: 0.9 },         // workbench left
    { offsetX: 4, offsetZ: 2, height: 0.9 },          // workbench right
    { offsetX: -6, offsetZ: -1, height: 1.4 },        // tool shelf
    { offsetX: 6, offsetZ: -1, height: 1.4 },         // tool shelf
    { offsetX: 0, offsetZ: 0, height: 0 },            // garage bay center
    { offsetX: 0, offsetZ: 4, height: 0 },            // garage bay rear
    { offsetX: -3, offsetZ: -5, height: 0.9 },        // office desk
    { offsetX: 3, offsetZ: -5, height: 0.8 },         // office shelf
  ],
  inn: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // front desk
    { offsetX: -3, offsetZ: 0, height: 0.9 },         // lobby table
    { offsetX: 3, offsetZ: 0, height: 0.9 },          // lobby table
    { offsetX: 0, offsetZ: 4, height: 1.1 },          // kitchen counter
    { offsetX: -4, offsetZ: 4, height: 0.8 },         // kitchen shelf
    { offsetX: -2, offsetZ: 6, height: 0 },           // storage barrel
    { offsetX: 2, offsetZ: 6, height: 0 },            // storage crate
    { offsetX: 0, offsetZ: 2, height: 1.3 },          // bar counter
  ],
  library: [
    { offsetX: 0, offsetZ: -2, height: 0.9 },         // reading table
    { offsetX: -5, offsetZ: -1, height: 0.8 },        // bookshelf
    { offsetX: 5, offsetZ: -1, height: 0.8 },         // bookshelf
    { offsetX: -5, offsetZ: 1, height: 1.4 },         // upper shelf
    { offsetX: 5, offsetZ: 1, height: 1.4 },          // upper shelf
    { offsetX: -5, offsetZ: 3, height: 0.8 },         // back shelf
    { offsetX: 5, offsetZ: 3, height: 0.8 },          // back shelf
    { offsetX: 0, offsetZ: 1, height: 0.9 },          // study table
    { offsetX: 0, offsetZ: 4, height: 0.85 },         // librarian desk
    { offsetX: -2, offsetZ: 5, height: 0 },           // book stack on floor
  ],
  clinic: [
    { offsetX: 0, offsetZ: -2, height: 1.1 },         // reception counter
    { offsetX: -3, offsetZ: 0, height: 0.9 },         // exam table
    { offsetX: 3, offsetZ: 0, height: 0.9 },          // exam table
    { offsetX: -5, offsetZ: 2, height: 0.8 },         // medicine shelf
    { offsetX: 5, offsetZ: 2, height: 0.8 },          // medicine shelf
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // work table
    { offsetX: -3, offsetZ: 5, height: 0 },           // storage
    { offsetX: 3, offsetZ: 5, height: 0 },            // storage
  ],
  windmill: [
    { offsetX: 0, offsetZ: 0, height: 0 },            // center floor
    { offsetX: -3, offsetZ: -2, height: 0 },          // grain sack
    { offsetX: 3, offsetZ: -2, height: 0 },           // grain sack
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // work table
    { offsetX: -4, offsetZ: 1, height: 0.5 },         // tool hook
    { offsetX: 4, offsetZ: 1, height: 0.5 },          // tool hook
  ],
  watermill: [
    { offsetX: 0, offsetZ: 0, height: 0 },            // center floor
    { offsetX: -3, offsetZ: -2, height: 0 },          // grain sack
    { offsetX: 3, offsetZ: -2, height: 0 },           // barrel
    { offsetX: 0, offsetZ: 3, height: 0.9 },          // work table
    { offsetX: -5, offsetZ: 1, height: 0.5 },         // tool rack
    { offsetX: 5, offsetZ: 1, height: 0 },            // crate
  ],
  lumbermill: [
    { offsetX: -4, offsetZ: -2, height: 0 },          // lumber stack
    { offsetX: 4, offsetZ: -2, height: 0 },           // lumber stack
    { offsetX: 0, offsetZ: 0, height: 0.9 },          // saw table
    { offsetX: -6, offsetZ: 1, height: 0.5 },         // tool rack
    { offsetX: 6, offsetZ: 1, height: 0.5 },          // tool rack
    { offsetX: 0, offsetZ: 4, height: 0 },            // floor
    { offsetX: -3, offsetZ: 5, height: 0 },           // storage
    { offsetX: 3, offsetZ: 5, height: 0 },            // storage
  ],
  mine: [
    { offsetX: 0, offsetZ: -2, height: 0.9 },         // work table
    { offsetX: -4, offsetZ: -1, height: 0.5 },        // tool rack
    { offsetX: 4, offsetZ: -1, height: 0.5 },         // tool rack
    { offsetX: -3, offsetZ: 2, height: 0 },           // ore pile
    { offsetX: 3, offsetZ: 2, height: 0 },            // ore pile
    { offsetX: 0, offsetZ: 4, height: 0 },            // cart
  ],
  barracks: [
    { offsetX: -3, offsetZ: -3, height: 0.6 },        // bunk area
    { offsetX: 3, offsetZ: -3, height: 0.6 },         // bunk area
    { offsetX: -3, offsetZ: 0, height: 0.6 },         // bunk area
    { offsetX: 3, offsetZ: 0, height: 0.6 },          // bunk area
    { offsetX: 0, offsetZ: 4, height: 0.9 },          // officer desk
    { offsetX: -5, offsetZ: 4, height: 0.8 },         // weapon rack
    { offsetX: 5, offsetZ: 4, height: 0.8 },          // weapon rack
    { offsetX: 0, offsetZ: -1, height: 0 },           // center floor
  ],
  apartmentcomplex: [
    { offsetX: 0, offsetZ: -3, height: 0.6 },         // lobby table
    { offsetX: -3, offsetZ: -3, height: 0 },          // lobby floor
    { offsetX: 3, offsetZ: -3, height: 0 },           // lobby floor
    { offsetX: 0, offsetZ: 0, height: 0 },            // hallway
    { offsetX: -4, offsetZ: 2, height: 0.8 },         // shelf
    { offsetX: 4, offsetZ: 2, height: 0.8 },          // shelf
  ],
};

/** Default placements when building type is not recognized. */
const DEFAULT_ITEM_PLACEMENTS: ItemPlacement[] = [
  { offsetX: 0, offsetZ: 0, height: 0 },
  { offsetX: 2, offsetZ: 2, height: 0 },
  { offsetX: -2, offsetZ: 2, height: 0 },
  { offsetX: 2, offsetZ: -2, height: 0 },
];

/** Maps item types to fallback colors for procedural meshes. */
const ITEM_TYPE_COLORS: Record<string, Color3> = {
  food: new Color3(0.7, 0.5, 0.2),
  drink: new Color3(0.3, 0.4, 0.7),
  weapon: new Color3(0.5, 0.5, 0.55),
  armor: new Color3(0.45, 0.4, 0.35),
  tool: new Color3(0.4, 0.35, 0.3),
  material: new Color3(0.5, 0.45, 0.35),
  consumable: new Color3(0.6, 0.3, 0.3),
  collectible: new Color3(0.6, 0.55, 0.3),
  key: new Color3(0.7, 0.65, 0.2),
  quest: new Color3(0.3, 0.6, 0.7),
  book: new Color3(0.5, 0.25, 0.2),
};

const DEFAULT_ITEM_COLOR = new Color3(0.5, 0.45, 0.4);

export class InteriorItemManager {
  private scene: Scene;
  private spawnedMeshes: Mesh[] = [];
  private objectModelTemplates: Map<string, Mesh>;
  private objectModelOriginalHeights: Map<string, number>;
  private objectModelScaleHints: Map<string, number>;

  constructor(
    scene: Scene,
    objectModelTemplates: Map<string, Mesh>,
    objectModelOriginalHeights: Map<string, number>,
    objectModelScaleHints?: Map<string, number>,
  ) {
    this.scene = scene;
    this.objectModelTemplates = objectModelTemplates;
    this.objectModelOriginalHeights = objectModelOriginalHeights;
    this.objectModelScaleHints = objectModelScaleHints || new Map();
  }

  /**
   * Spawn item props for a building interior.
   * Filters worldItems by buildingId (matching businessId or residenceId in metadata),
   * then creates meshes at appropriate positions within the interior.
   */
  public spawnItems(
    buildingId: string,
    interior: InteriorLayout,
    worldItems: InteriorItemData[],
  ): Mesh[] {
    this.clearItems();

    const items = this.getItemsForBuilding(
      buildingId, worldItems,
      interior.businessType || interior.buildingType,
    );
    if (items.length === 0) return [];

    const placements = this.getPlacementsForType(
      interior.businessType || interior.buildingType,
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const placement = placements[i % placements.length];

      const mesh = this.createItemMesh(item, i, interior, placement);
      if (mesh) {
        this.spawnedMeshes.push(mesh);
      }
    }

    return [...this.spawnedMeshes];
  }

  /** Remove all spawned interior item meshes. */
  public clearItems(): void {
    for (const mesh of this.spawnedMeshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
    this.spawnedMeshes = [];
  }

  /** Get currently spawned meshes. */
  public getSpawnedMeshes(): Mesh[] {
    return [...this.spawnedMeshes];
  }

  /**
   * Filter world items to those that belong in the given building.
   * First checks explicit assignment (businessId/residenceId), then falls
   * back to matching item types against the business type so buildings
   * are populated even without pre-assigned item→building relationships.
   */
  public getItemsForBuilding(
    buildingId: string,
    worldItems: InteriorItemData[],
    businessType?: string,
  ): InteriorItemData[] {
    // 1. Explicitly assigned items always included
    const explicit = worldItems.filter((item) => {
      const meta = item.metadata;
      if (!meta) return false;
      return meta.businessId === buildingId || meta.residenceId === buildingId;
    });
    if (explicit.length > 0) {
      console.log(`[InteriorItems] ${buildingId}: ${explicit.length} explicitly assigned items`);
      return explicit;
    }

    // 2. Match items by type/role to business type
    if (!businessType) {
      console.log(`[InteriorItems] ${buildingId}: no businessType provided, skipping type matching`);
      return [];
    }
    const bt = businessType.toLowerCase();
    const matchingTypes = BUSINESS_ITEM_TYPES[bt];
    if (!matchingTypes) {
      console.log(`[InteriorItems] ${buildingId}: businessType="${bt}" not found in BUSINESS_ITEM_TYPES (keys: ${Object.keys(BUSINESS_ITEM_TYPES).join(', ')})`);
      return [];
    }

    const candidates = worldItems.filter((item) => {
      const type = (item.itemType || '').toLowerCase();
      const role = (item.objectRole || '').toLowerCase();
      return matchingTypes.some(t => type.includes(t) || role.includes(t));
    });
    console.log(`[InteriorItems] ${buildingId}: bt="${bt}", matchingTypes=[${matchingTypes.join(',')}], worldItems=${worldItems.length}, candidates=${candidates.length}`);

    // Deterministic selection: use buildingId hash to pick a stable subset
    // so the same building always shows the same items across visits
    const maxItems = 6;
    if (candidates.length <= maxItems) return candidates;
    const hash = this.hashString(buildingId);
    const selected: InteriorItemData[] = [];
    for (let i = 0; i < maxItems; i++) {
      const idx = (hash + i * 7) % candidates.length;
      if (!selected.includes(candidates[idx])) {
        selected.push(candidates[idx]);
      }
    }
    return selected;
  }

  /** Simple string hash for deterministic item selection. */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /** Get placement positions for a building/business type. */
  private getPlacementsForType(buildingType: string): ItemPlacement[] {
    const bt = (buildingType || '').toLowerCase();

    for (const [key, placements] of Object.entries(INTERIOR_ITEM_PLACEMENTS)) {
      if (bt.includes(key)) return placements;
    }
    return DEFAULT_ITEM_PLACEMENTS;
  }

  /** Create a 3D mesh for an item at the given placement within the interior. */
  private createItemMesh(
    item: InteriorItemData,
    index: number,
    interior: InteriorLayout,
    placement: ItemPlacement,
  ): Mesh | null {
    const meshName = `interior_item_${interior.buildingId}_${index}_${item.id}`;

    // Try to use an asset model template via objectRole
    let mesh = this.tryCreateFromTemplate(item, meshName);

    // Fallback to a procedural box
    if (!mesh) {
      mesh = this.createProceduralItemMesh(item, meshName);
    }

    if (!mesh) return null;

    // Position within interior
    mesh.position = new Vector3(
      interior.position.x + placement.offsetX,
      interior.position.y + placement.height,
      interior.position.z + placement.offsetZ,
    );

    // Make interactive
    mesh.isPickable = true;
    mesh.metadata = {
      objectRole: item.objectRole || item.itemType,
      itemId: item.id,
      interiorItem: true,
      possessable: item.possessable !== false,
    };

    // Propagate metadata to child meshes (for glTF hierarchies)
    mesh.getChildMeshes().forEach((child) => {
      child.isPickable = true;
      child.metadata = {
        ...(child.metadata || {}),
        objectRole: item.objectRole || item.itemType,
        itemId: item.id,
        interiorItem: true,
      };
    });

    // Use a single collision box instead of per-mesh collisions to prevent characters getting stuck
    this.wrapWithCollisionBox(mesh);

    return mesh;
  }

  /** Try to clone a mesh from objectModelTemplates using the item's objectRole. */
  private tryCreateFromTemplate(
    item: InteriorItemData,
    meshName: string,
  ): Mesh | null {
    if (!item.objectRole) return null;

    const template = this.objectModelTemplates.get(item.objectRole);
    if (!template) return null;

    // If the template lives in a different scene (e.g. overworld) than our
    // target scene (interior), cloning would place geometry in the wrong scene.
    // Fall back to procedural geometry in that case.
    if (template.getScene() !== this.scene) return null;

    let cloned: Mesh | null = null;

    // glTF root nodes may have 0 vertices — use instantiateHierarchy
    if (
      template.getTotalVertices() === 0 &&
      template.getChildMeshes().length > 0
    ) {
      const root = template.instantiateHierarchy(null, undefined, (source, clone) => {
        clone.name = `${source.name}_${meshName}`;
      });
      if (root) {
        root.setEnabled(true);
        root.getChildMeshes().forEach((m) => m.setEnabled(true));
        cloned = root as Mesh;
      }
    } else {
      cloned = template.clone(meshName, null, false, false) as Mesh;
    }

    if (cloned) {
      cloned.setEnabled(true);
      // Use stored scaleHint if available; fall back to target/originalH
      const scaleHint = this.objectModelScaleHints.get(item.objectRole!);
      let scale: number;
      if (scaleHint != null && scaleHint > 0) {
        scale = scaleHint;
      } else {
        const targetSize = 0.4;
        const origH = this.objectModelOriginalHeights.get(item.objectRole!) || 1;
        scale = targetSize / origH;
      }
      cloned.scaling = new Vector3(scale, scale, scale);
    }

    return cloned;
  }

  /** Create a simple procedural box mesh as fallback for items without objectRole models. */
  private createProceduralItemMesh(
    item: InteriorItemData,
    meshName: string,
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(
      meshName,
      { width: 0.3, height: 0.3, depth: 0.3 },
      this.scene,
    );
    const mat = new StandardMaterial(`${meshName}_mat`, this.scene);
    mat.diffuseColor = ITEM_TYPE_COLORS[item.itemType] || DEFAULT_ITEM_COLOR;
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    mesh.material = mat;
    return mesh;
  }

  /**
   * Wrap a mesh hierarchy with a single invisible collision box.
   * Prevents characters from getting trapped between overlapping collision surfaces.
   */
  private wrapWithCollisionBox(prop: Mesh, margin: number = 0.15): void {
    prop.refreshBoundingInfo(false, false);
    prop.computeWorldMatrix(true);

    const children = prop.getChildMeshes(false);
    if (children.length === 0 && prop.getTotalVertices() === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const allMeshes = prop.getTotalVertices() > 0 ? [prop, ...children] : children;
    for (const m of allMeshes) {
      (m as Mesh).refreshBoundingInfo(false, false);
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      const wMin = bi.boundingBox.minimumWorld;
      const wMax = bi.boundingBox.maximumWorld;
      if (wMin.x < minX) minX = wMin.x;
      if (wMin.y < minY) minY = wMin.y;
      if (wMin.z < minZ) minZ = wMin.z;
      if (wMax.x > maxX) maxX = wMax.x;
      if (wMax.y > maxY) maxY = wMax.y;
      if (wMax.z > maxZ) maxZ = wMax.z;
    }

    if (!isFinite(minX) || !isFinite(maxX)) return;

    const width = (maxX - minX) + margin * 2;
    const height = (maxY - minY) + margin * 2;
    const depth = (maxZ - minZ) + margin * 2;
    if (width < 0.1 && depth < 0.1) return;

    const collider = MeshBuilder.CreateBox(
      `${prop.name}_collider`,
      { width, height, depth },
      this.scene
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    collider.parent = prop;
    const invPropWorld = prop.getWorldMatrix().clone().invert();
    collider.position = Vector3.TransformCoordinates(
      new Vector3(centerX, centerY, centerZ),
      invPropWorld
    );

    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = true;

    prop.checkCollisions = false;
    for (const child of children) {
      (child as Mesh).checkCollisions = false;
    }
  }

  public dispose(): void {
    this.clearItems();
  }
}
