/**
 * NPC Accessory & Occupation-Visual System
 *
 * Creates procedural accessory meshes (hats, tools, aprons, etc.) and
 * floating name+occupation labels above NPCs for visual role identification.
 *
 * Accessories are simple geometric primitives attached to the NPC root mesh
 * at defined attachment points (head, hand, back, waist). The occupation
 * string is matched to an accessory set via keyword lookup.
 */

import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import type { NPCAppearance, HairStyle, FacialHairStyle } from './NPCAppearanceGenerator';

// ---------- Types ----------

/** Where on the NPC body an accessory attaches */
export type AttachmentPoint = 'head' | 'rightHand' | 'back' | 'waist';

/** Definition of a single procedural accessory */
export interface AccessoryDefinition {
  /** Unique key for caching materials */
  id: string;
  /** Where to attach on the NPC */
  attachPoint: AttachmentPoint;
  /** Primitive shape to create */
  shape: 'cylinder' | 'box' | 'sphere' | 'disc';
  /** Dimensions: meaning depends on shape */
  size: { width: number; height: number; depth: number };
  /** Offset from attachment point */
  offset: Vector3;
  /** Color of the accessory */
  color: Color3;
  /** Optional emissive glow */
  emissive?: Color3;
}

/** A set of accessories for a given occupation category */
export interface AccessorySet {
  /** Display label for the occupation category */
  category: string;
  /** Accessories to attach */
  accessories: AccessoryDefinition[];
  /** Color used for the occupation label text */
  labelColor: Color3;
}

// ---------- Attachment Point Offsets ----------

/** Base Y-offset positions for each attachment point (relative to NPC root) */
const ATTACHMENT_OFFSETS: Record<AttachmentPoint, Vector3> = {
  head: new Vector3(0, 2.1, 0),
  rightHand: new Vector3(0.4, 0.8, 0.3),
  back: new Vector3(0, 1.2, -0.3),
  waist: new Vector3(0, 0.9, 0),
};

// ---------- Accessory Definitions ----------

const CHEF_HAT: AccessoryDefinition = {
  id: 'chef_hat',
  attachPoint: 'head',
  shape: 'cylinder',
  size: { width: 0.25, height: 0.35, depth: 0.25 },
  offset: new Vector3(0, 0.15, 0),
  color: new Color3(0.95, 0.95, 0.95),
};

const GUARD_HELMET: AccessoryDefinition = {
  id: 'guard_helmet',
  attachPoint: 'head',
  shape: 'sphere',
  size: { width: 0.3, height: 0.25, depth: 0.3 },
  offset: new Vector3(0, 0.1, 0),
  color: new Color3(0.5, 0.5, 0.55),
  emissive: new Color3(0.1, 0.1, 0.12),
};

const SWORD: AccessoryDefinition = {
  id: 'sword',
  attachPoint: 'waist',
  shape: 'box',
  size: { width: 0.05, height: 0.6, depth: 0.05 },
  offset: new Vector3(0.35, -0.1, 0),
  color: new Color3(0.6, 0.6, 0.65),
  emissive: new Color3(0.1, 0.1, 0.15),
};

const MERCHANT_SATCHEL: AccessoryDefinition = {
  id: 'merchant_satchel',
  attachPoint: 'waist',
  shape: 'box',
  size: { width: 0.25, height: 0.2, depth: 0.15 },
  offset: new Vector3(-0.3, 0, 0.1),
  color: new Color3(0.55, 0.35, 0.15),
};

const APRON: AccessoryDefinition = {
  id: 'apron',
  attachPoint: 'waist',
  shape: 'box',
  size: { width: 0.35, height: 0.4, depth: 0.05 },
  offset: new Vector3(0, 0.1, 0.2),
  color: new Color3(0.9, 0.85, 0.75),
};

const HAMMER: AccessoryDefinition = {
  id: 'hammer',
  attachPoint: 'rightHand',
  shape: 'box',
  size: { width: 0.08, height: 0.4, depth: 0.08 },
  offset: new Vector3(0, 0, 0),
  color: new Color3(0.45, 0.3, 0.15),
};

const HAMMER_HEAD: AccessoryDefinition = {
  id: 'hammer_head',
  attachPoint: 'rightHand',
  shape: 'box',
  size: { width: 0.15, height: 0.1, depth: 0.08 },
  offset: new Vector3(0, 0.2, 0),
  color: new Color3(0.5, 0.5, 0.55),
};

const BOOK: AccessoryDefinition = {
  id: 'book',
  attachPoint: 'rightHand',
  shape: 'box',
  size: { width: 0.2, height: 0.25, depth: 0.05 },
  offset: new Vector3(0, 0, 0),
  color: new Color3(0.4, 0.2, 0.1),
};

const BACKPACK: AccessoryDefinition = {
  id: 'backpack',
  attachPoint: 'back',
  shape: 'box',
  size: { width: 0.3, height: 0.35, depth: 0.15 },
  offset: new Vector3(0, 0, 0),
  color: new Color3(0.35, 0.25, 0.15),
};

const MEDICAL_BAG: AccessoryDefinition = {
  id: 'medical_bag',
  attachPoint: 'rightHand',
  shape: 'box',
  size: { width: 0.2, height: 0.15, depth: 0.1 },
  offset: new Vector3(0, 0, 0),
  color: new Color3(0.9, 0.9, 0.9),
  emissive: new Color3(0.3, 0.05, 0.05),
};

const SCROLL: AccessoryDefinition = {
  id: 'scroll',
  attachPoint: 'rightHand',
  shape: 'cylinder',
  size: { width: 0.06, height: 0.3, depth: 0.06 },
  offset: new Vector3(0, 0, 0),
  color: new Color3(0.9, 0.85, 0.7),
};

const PICKAXE_HANDLE: AccessoryDefinition = {
  id: 'pickaxe_handle',
  attachPoint: 'back',
  shape: 'box',
  size: { width: 0.05, height: 0.6, depth: 0.05 },
  offset: new Vector3(0.1, 0.1, 0),
  color: new Color3(0.5, 0.35, 0.2),
};

const HOLY_SYMBOL: AccessoryDefinition = {
  id: 'holy_symbol',
  attachPoint: 'waist',
  shape: 'disc',
  size: { width: 0.15, height: 0.15, depth: 0.02 },
  offset: new Vector3(0, 0.2, 0.15),
  color: new Color3(0.85, 0.75, 0.3),
  emissive: new Color3(0.2, 0.18, 0.05),
};

const FARMING_HOE: AccessoryDefinition = {
  id: 'farming_hoe',
  attachPoint: 'back',
  shape: 'box',
  size: { width: 0.04, height: 0.7, depth: 0.04 },
  offset: new Vector3(-0.1, 0, 0),
  color: new Color3(0.45, 0.3, 0.15),
};

// ---------- Occupation → Accessory Set Mapping ----------

const OCCUPATION_ACCESSORY_SETS: { keywords: string[]; set: AccessorySet }[] = [
  {
    keywords: ['guard', 'soldier', 'knight', 'militia', 'warrior', 'watch', 'police', 'army'],
    set: {
      category: 'Guard',
      accessories: [GUARD_HELMET, SWORD],
      labelColor: new Color3(0.85, 0.4, 0.35),
    },
  },
  {
    keywords: ['merchant', 'trader', 'vendor', 'shop', 'market', 'seller'],
    set: {
      category: 'Merchant',
      accessories: [MERCHANT_SATCHEL],
      labelColor: new Color3(0.85, 0.75, 0.35),
    },
  },
  {
    keywords: ['baker', 'cook', 'chef', 'pastry'],
    set: {
      category: 'Cook',
      accessories: [CHEF_HAT, APRON],
      labelColor: new Color3(0.9, 0.85, 0.75),
    },
  },
  {
    keywords: ['blacksmith', 'smith', 'forge', 'metalwork'],
    set: {
      category: 'Smith',
      accessories: [HAMMER, HAMMER_HEAD, APRON],
      labelColor: new Color3(0.6, 0.4, 0.2),
    },
  },
  {
    keywords: ['doctor', 'healer', 'physician', 'nurse', 'medic', 'hospital'],
    set: {
      category: 'Healer',
      accessories: [MEDICAL_BAG],
      labelColor: new Color3(0.9, 0.3, 0.3),
    },
  },
  {
    keywords: ['teacher', 'professor', 'scholar', 'scribe', 'librarian', 'tutor'],
    set: {
      category: 'Scholar',
      accessories: [BOOK, SCROLL],
      labelColor: new Color3(0.4, 0.5, 0.8),
    },
  },
  {
    keywords: ['priest', 'clergy', 'monk', 'nun', 'pastor', 'reverend', 'church', 'cleric'],
    set: {
      category: 'Clergy',
      accessories: [HOLY_SYMBOL, BOOK],
      labelColor: new Color3(0.85, 0.75, 0.3),
    },
  },
  {
    keywords: ['farmer', 'rancher', 'agriculture', 'crop', 'harvest'],
    set: {
      category: 'Farmer',
      accessories: [FARMING_HOE],
      labelColor: new Color3(0.45, 0.65, 0.3),
    },
  },
  {
    keywords: ['miner', 'quarry', 'excavat'],
    set: {
      category: 'Miner',
      accessories: [PICKAXE_HANDLE],
      labelColor: new Color3(0.5, 0.45, 0.4),
    },
  },
  {
    keywords: ['carpenter', 'woodwork', 'builder', 'construct'],
    set: {
      category: 'Builder',
      accessories: [HAMMER, HAMMER_HEAD],
      labelColor: new Color3(0.6, 0.45, 0.25),
    },
  },
  {
    keywords: ['bartender', 'innkeeper', 'barkeep', 'tavern'],
    set: {
      category: 'Barkeep',
      accessories: [APRON],
      labelColor: new Color3(0.7, 0.55, 0.3),
    },
  },
  {
    keywords: ['lawyer', 'judge', 'magistrate', 'mayor', 'council', 'govern', 'clerk', 'official'],
    set: {
      category: 'Official',
      accessories: [SCROLL, BOOK],
      labelColor: new Color3(0.5, 0.5, 0.7),
    },
  },
  {
    keywords: ['traveler', 'adventurer', 'explorer', 'ranger', 'scout'],
    set: {
      category: 'Traveler',
      accessories: [BACKPACK],
      labelColor: new Color3(0.5, 0.6, 0.45),
    },
  },
];

/** Default accessory set for occupations that don't match any keyword */
const DEFAULT_ACCESSORY_SET: AccessorySet = {
  category: 'Civilian',
  accessories: [],
  labelColor: new Color3(0.7, 0.7, 0.7),
};

// ---------- Public API ----------

/**
 * Resolve an occupation string to its accessory set.
 */
export function getAccessorySetForOccupation(occupation: string): AccessorySet {
  const lower = occupation.toLowerCase();
  for (const entry of OCCUPATION_ACCESSORY_SETS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.set;
    }
  }
  return DEFAULT_ACCESSORY_SET;
}

// ---------- NPCAccessorySystem ----------

export class NPCAccessorySystem {
  private scene: Scene;
  /** Cached materials keyed by accessory id */
  private materialCache = new Map<string, StandardMaterial>();
  /** All created accessory meshes per NPC, for disposal */
  private npcAccessories = new Map<string, Mesh[]>();
  /** Floating label meshes per NPC */
  private npcLabels = new Map<string, Mesh>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Attach occupation-based accessories and a floating label to an NPC mesh.
   *
   * @param npcId - Unique NPC identifier
   * @param npcRoot - The NPC's root mesh
   * @param npcName - Display name
   * @param occupation - Occupation string (e.g. "Baker", "Town Guard")
   */
  attachAccessories(
    npcId: string,
    npcRoot: Mesh,
    npcName: string,
    occupation: string,
  ): void {
    const set = getAccessorySetForOccupation(occupation);
    const meshes: Mesh[] = [];

    for (const def of set.accessories) {
      const mesh = this.createAccessoryMesh(def, npcRoot);
      if (mesh) {
        meshes.push(mesh);
      }
    }

    this.npcAccessories.set(npcId, meshes);

    // Floating labels removed — interaction prompts now shown only when
    // the player is looking directly at an NPC (see NPCInteractionPrompt).
  }

  /**
   * Attach procedural hair and facial hair meshes based on NPC appearance.
   */
  attachHair(
    npcId: string,
    npcRoot: Mesh,
    appearance: NPCAppearance,
  ): void {
    const meshes: Mesh[] = [];
    const existing = this.npcAccessories.get(npcId) || [];

    // Hair
    const hairMesh = this.createHairMesh(npcId, npcRoot, appearance.hairStyle, appearance.hairColor);
    if (hairMesh) meshes.push(hairMesh);

    // Facial hair
    const facialMesh = this.createFacialHairMesh(npcId, npcRoot, appearance.facialHairStyle, appearance.hairColor);
    if (facialMesh) meshes.push(facialMesh);

    this.npcAccessories.set(npcId, [...existing, ...meshes]);
  }

  /**
   * Create a procedural hair mesh for the given style.
   */
  private createHairMesh(npcId: string, parent: Mesh, style: HairStyle, color: Color3): Mesh | null {
    if (style === 'bald') return null;

    const headPos = ATTACHMENT_OFFSETS.head;
    const mat = this.getOrCreateHairMaterial(`hair_${colorKey(color)}`, color);
    let mesh: Mesh;

    switch (style) {
      case 'short': {
        mesh = MeshBuilder.CreateSphere(
          `hair_${npcId}`,
          { diameterX: 0.38, diameterY: 0.22, diameterZ: 0.38, segments: 8 },
          this.scene,
        );
        mesh.position = headPos.add(new Vector3(0, 0.12, -0.02));
        break;
      }
      case 'medium': {
        mesh = MeshBuilder.CreateSphere(
          `hair_${npcId}`,
          { diameterX: 0.42, diameterY: 0.28, diameterZ: 0.44, segments: 8 },
          this.scene,
        );
        mesh.position = headPos.add(new Vector3(0, 0.1, -0.04));
        break;
      }
      case 'long': {
        // Top cap + back drape
        const top = MeshBuilder.CreateSphere(
          `hair_top_${npcId}`,
          { diameterX: 0.42, diameterY: 0.26, diameterZ: 0.44, segments: 8 },
          this.scene,
        );
        top.position = headPos.add(new Vector3(0, 0.1, -0.04));
        top.material = mat;
        top.parent = parent;
        top.isPickable = false;

        const drape = MeshBuilder.CreateBox(
          `hair_drape_${npcId}`,
          { width: 0.36, height: 0.5, depth: 0.12 },
          this.scene,
        );
        drape.position = headPos.add(new Vector3(0, -0.18, -0.16));
        drape.material = mat;
        drape.parent = parent;
        drape.isPickable = false;

        // Return top as primary, add drape to accessories manually
        const existing = this.npcAccessories.get(npcId) || [];
        this.npcAccessories.set(npcId, [...existing, drape]);
        mesh = top;
        break;
      }
      case 'ponytail': {
        const cap = MeshBuilder.CreateSphere(
          `hair_cap_${npcId}`,
          { diameterX: 0.38, diameterY: 0.22, diameterZ: 0.38, segments: 8 },
          this.scene,
        );
        cap.position = headPos.add(new Vector3(0, 0.12, -0.02));
        cap.material = mat;
        cap.parent = parent;
        cap.isPickable = false;

        const tail = MeshBuilder.CreateCylinder(
          `hair_tail_${npcId}`,
          { diameter: 0.1, height: 0.4, tessellation: 6 },
          this.scene,
        );
        tail.position = headPos.add(new Vector3(0, -0.1, -0.2));
        tail.material = mat;
        tail.parent = parent;
        tail.isPickable = false;

        const existing2 = this.npcAccessories.get(npcId) || [];
        this.npcAccessories.set(npcId, [...existing2, tail]);
        mesh = cap;
        break;
      }
      case 'mohawk': {
        mesh = MeshBuilder.CreateBox(
          `hair_${npcId}`,
          { width: 0.08, height: 0.2, depth: 0.35 },
          this.scene,
        );
        mesh.position = headPos.add(new Vector3(0, 0.18, -0.02));
        break;
      }
      default:
        return null;
    }

    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }

  /**
   * Create a procedural facial hair mesh for the given style.
   */
  private createFacialHairMesh(npcId: string, parent: Mesh, style: FacialHairStyle, color: Color3): Mesh | null {
    if (style === 'none') return null;

    const chinPos = ATTACHMENT_OFFSETS.head.add(new Vector3(0, -0.22, 0.12));
    // Darken hair color slightly for facial hair
    const facialColor = new Color3(color.r * 0.85, color.g * 0.85, color.b * 0.85);
    const mat = this.getOrCreateHairMaterial(`facial_${colorKey(facialColor)}`, facialColor);
    let mesh: Mesh;

    switch (style) {
      case 'stubble': {
        mesh = MeshBuilder.CreateBox(
          `facial_${npcId}`,
          { width: 0.22, height: 0.06, depth: 0.08 },
          this.scene,
        );
        mesh.position = chinPos;
        break;
      }
      case 'beard': {
        mesh = MeshBuilder.CreateSphere(
          `facial_${npcId}`,
          { diameterX: 0.26, diameterY: 0.18, diameterZ: 0.14, segments: 6 },
          this.scene,
        );
        mesh.position = chinPos.add(new Vector3(0, -0.02, 0));
        break;
      }
      case 'longBeard': {
        mesh = MeshBuilder.CreateBox(
          `facial_${npcId}`,
          { width: 0.22, height: 0.3, depth: 0.1 },
          this.scene,
        );
        mesh.position = chinPos.add(new Vector3(0, -0.1, 0));
        break;
      }
      case 'mustache': {
        mesh = MeshBuilder.CreateBox(
          `facial_${npcId}`,
          { width: 0.18, height: 0.04, depth: 0.06 },
          this.scene,
        );
        mesh.position = chinPos.add(new Vector3(0, 0.1, 0.02));
        break;
      }
      case 'goatee': {
        mesh = MeshBuilder.CreateCylinder(
          `facial_${npcId}`,
          { diameterTop: 0.12, diameterBottom: 0.06, height: 0.14, tessellation: 6 },
          this.scene,
        );
        mesh.position = chinPos.add(new Vector3(0, -0.04, 0));
        break;
      }
      default:
        return null;
    }

    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }

  /**
   * Get or create a cached hair material by color key.
   */
  private getOrCreateHairMaterial(key: string, color: Color3): StandardMaterial {
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const mat = new StandardMaterial(`hair_mat_${key}`, this.scene);
    mat.diffuseColor = color;
    mat.specularPower = 40;
    mat.backFaceCulling = false;

    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * Create a single procedural accessory mesh and parent it to the NPC.
   */
  private createAccessoryMesh(def: AccessoryDefinition, parent: Mesh): Mesh | null {
    const baseOffset = ATTACHMENT_OFFSETS[def.attachPoint];
    const finalPos = baseOffset.add(def.offset);
    let mesh: Mesh;

    const meshName = `acc_${def.id}_${parent.name}`;

    switch (def.shape) {
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder(
          meshName,
          { diameter: def.size.width, height: def.size.height, tessellation: 8 },
          this.scene,
        );
        break;
      case 'box':
        mesh = MeshBuilder.CreateBox(
          meshName,
          { width: def.size.width, height: def.size.height, depth: def.size.depth },
          this.scene,
        );
        break;
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(
          meshName,
          { diameterX: def.size.width, diameterY: def.size.height, diameterZ: def.size.depth, segments: 8 },
          this.scene,
        );
        break;
      case 'disc':
        mesh = MeshBuilder.CreateDisc(
          meshName,
          { radius: def.size.width / 2, tessellation: 12 },
          this.scene,
        );
        break;
      default:
        return null;
    }

    mesh.parent = parent;
    mesh.position = finalPos;
    mesh.isPickable = false;

    // Apply material (cached)
    mesh.material = this.getOrCreateMaterial(def);

    return mesh;
  }

  /**
   * Get or create a cached StandardMaterial for an accessory definition.
   */
  private getOrCreateMaterial(def: AccessoryDefinition): StandardMaterial {
    const cached = this.materialCache.get(def.id);
    if (cached) return cached;

    const mat = new StandardMaterial(`acc_mat_${def.id}`, this.scene);
    mat.diffuseColor = def.color;
    if (def.emissive) {
      mat.emissiveColor = def.emissive;
    }
    mat.backFaceCulling = false;

    this.materialCache.set(def.id, mat);
    return mat;
  }

  /**
   * Create a floating billboard label above the NPC showing name + occupation.
   */
  private createFloatingLabel(
    npcId: string,
    parent: Mesh,
    name: string,
    occupation: string,
    labelColor: Color3,
  ): Mesh | null {
    const labelText = occupation ? `${name}\n${occupation}` : name;
    const planeWidth = 2.5;
    const planeHeight = 0.7;
    const textureWidth = 256;
    const textureHeight = 72;

    const plane = MeshBuilder.CreatePlane(
      `npc_label_${npcId}`,
      { width: planeWidth, height: planeHeight },
      this.scene,
    );
    plane.parent = parent;
    plane.position = new Vector3(0, 2.8, 0);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    // DynamicTexture for text rendering
    const texture = new DynamicTexture(
      `npc_label_tex_${npcId}`,
      { width: textureWidth, height: textureHeight },
      this.scene,
      false,
    );

    // Cast to CanvasRenderingContext2D — Babylon's ICanvasRenderingContext
    // is a subset but the underlying object is a real 2D context at runtime.
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, textureWidth, textureHeight);

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, 2, 2, textureWidth - 4, textureHeight - 4, 6);

    // Name line
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (occupation) {
      ctx.fillText(truncateText(ctx, name, textureWidth - 16), textureWidth / 2, 22);
      // Occupation line in label color
      const r = Math.round(labelColor.r * 255);
      const g = Math.round(labelColor.g * 255);
      const b = Math.round(labelColor.b * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.font = '14px Arial';
      ctx.fillText(truncateText(ctx, occupation, textureWidth - 16), textureWidth / 2, 50);
    } else {
      ctx.fillText(truncateText(ctx, name, textureWidth - 16), textureWidth / 2, textureHeight / 2);
    }

    texture.update();

    const mat = new StandardMaterial(`npc_label_mat_${npcId}`, this.scene);
    mat.diffuseTexture = texture;
    mat.opacityTexture = texture;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.useAlphaFromDiffuseTexture = true;
    plane.material = mat;

    return plane;
  }

  /**
   * Show or hide accessories and label for an NPC (e.g. for LOD transitions).
   */
  setVisible(npcId: string, visible: boolean): void {
    const accessories = this.npcAccessories.get(npcId);
    if (accessories) {
      for (const mesh of accessories) {
        mesh.setEnabled(visible);
      }
    }
    const label = this.npcLabels.get(npcId);
    if (label) {
      label.setEnabled(visible);
    }
  }

  /**
   * Remove all accessories and label for a specific NPC.
   */
  removeNPC(npcId: string): void {
    const accessories = this.npcAccessories.get(npcId);
    if (accessories) {
      for (const mesh of accessories) {
        mesh.dispose();
      }
      this.npcAccessories.delete(npcId);
    }
    const label = this.npcLabels.get(npcId);
    if (label) {
      label.dispose();
      this.npcLabels.delete(npcId);
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const npcId of Array.from(this.npcAccessories.keys())) {
      this.removeNPC(npcId);
    }
    for (const mat of Array.from(this.materialCache.values())) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}

// ---------- Canvas Helpers ----------

/** Draw a rounded rectangle and fill it. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/** Create a short cache key from a Color3. */
function colorKey(c: Color3): string {
  return `${c.r.toFixed(2)}_${c.g.toFixed(2)}_${c.b.toFixed(2)}`;
}

/** Truncate text to fit within maxWidth, appending "…" if needed. */
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}
