/**
 * NPCModularAssembler — Builds NPCs from procedural body-part meshes
 * instead of loading external 3D model files.
 *
 * Assembles head, torso, upper/lower arms, and upper/lower legs as child
 * meshes of a root TransformNode-like Mesh. Body proportions vary by
 * body type (average, athletic, heavy, slim) and are deterministic per
 * character ID via the existing NPCAppearanceGenerator hash system.
 *
 * The assembled mesh integrates with NPCAppearanceGenerator for coloring
 * and with NPCAccessorySystem for attachment points.
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import {
  generateNPCAppearance,
  blendWithRoleTint,
  hashString,
  hashFloat,
  type NPCAppearance,
} from './NPCAppearanceGenerator';

import type { NPCRole } from './NPCModelInstancer';

// --- Body type proportions ---

export type NPCBodyType = 'average' | 'athletic' | 'heavy' | 'slim';

/** Proportions controlling the dimensions of each body part */
export interface BodyProportions {
  headRadius: number;
  torsoWidth: number;
  torsoHeight: number;
  torsoDepth: number;
  armRadius: number;
  upperArmLength: number;
  lowerArmLength: number;
  legRadius: number;
  upperLegLength: number;
  lowerLegLength: number;
}

const BODY_TYPE_PROPORTIONS: Record<NPCBodyType, BodyProportions> = {
  average: {
    headRadius: 0.18,
    torsoWidth: 0.40,
    torsoHeight: 0.55,
    torsoDepth: 0.22,
    armRadius: 0.06,
    upperArmLength: 0.30,
    lowerArmLength: 0.28,
    legRadius: 0.08,
    upperLegLength: 0.35,
    lowerLegLength: 0.35,
  },
  athletic: {
    headRadius: 0.18,
    torsoWidth: 0.46,
    torsoHeight: 0.58,
    torsoDepth: 0.24,
    armRadius: 0.075,
    upperArmLength: 0.32,
    lowerArmLength: 0.30,
    legRadius: 0.09,
    upperLegLength: 0.37,
    lowerLegLength: 0.37,
  },
  heavy: {
    headRadius: 0.19,
    torsoWidth: 0.52,
    torsoHeight: 0.52,
    torsoDepth: 0.30,
    armRadius: 0.08,
    upperArmLength: 0.28,
    lowerArmLength: 0.26,
    legRadius: 0.10,
    upperLegLength: 0.33,
    lowerLegLength: 0.33,
  },
  slim: {
    headRadius: 0.17,
    torsoWidth: 0.34,
    torsoHeight: 0.56,
    torsoDepth: 0.18,
    armRadius: 0.05,
    upperArmLength: 0.30,
    lowerArmLength: 0.28,
    legRadius: 0.065,
    upperLegLength: 0.36,
    lowerLegLength: 0.36,
  },
};

/** Derive body type from character traits (mirrors NPCModelManifest logic) */
export function deriveBodyType(physicalTraits?: string[] | Record<string, any>, occupation?: string): NPCBodyType {
  const traitsArr = Array.isArray(physicalTraits) ? physicalTraits : [];
  const traits = traitsArr.map(t => t.toLowerCase()).join(' ');
  const occ = (occupation || '').toLowerCase();

  if (traits.includes('muscular') || traits.includes('strong') || traits.includes('brawny') ||
      occ.includes('blacksmith') || occ.includes('soldier') || occ.includes('warrior') || occ.includes('guard')) {
    return 'athletic';
  }
  if (traits.includes('heavy') || traits.includes('stout') || traits.includes('large') || traits.includes('portly') ||
      occ.includes('innkeeper') || occ.includes('cook') || occ.includes('brewer')) {
    return 'heavy';
  }
  if (traits.includes('thin') || traits.includes('slender') || traits.includes('lithe') || traits.includes('wiry') ||
      occ.includes('thief') || occ.includes('scout') || occ.includes('scholar') || occ.includes('mage')) {
    return 'slim';
  }
  return 'average';
}

/** Result of assembling an NPC */
export interface AssembledNPC {
  root: Mesh;
  parts: Map<string, Mesh>;
  appearance: NPCAppearance;
  bodyType: NPCBodyType;
}

// --- Material caching ---

interface CachedMaterials {
  skin: StandardMaterial;
  clothing: StandardMaterial;
  accent: StandardMaterial;
}

// --- Main assembler class ---

export class NPCModularAssembler {
  private scene: Scene;

  /** Shared materials keyed by appearance hash to reduce material count */
  private materialCache: Map<string, CachedMaterials> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Assemble a complete NPC mesh from body parts.
   *
   * @param characterId - Unique character ID (used for deterministic appearance)
   * @param role - NPC role for tint coloring
   * @param bodyType - Body type controlling proportions
   * @returns Assembled NPC with root mesh, part map, and appearance data
   */
  assemble(characterId: string, role: NPCRole, bodyType: NPCBodyType): AssembledNPC {
    const proportions = BODY_TYPE_PROPORTIONS[bodyType];
    const appearance = generateNPCAppearance(characterId, role);
    const materials = this.getOrCreateMaterials(characterId, appearance);
    const parts = new Map<string, Mesh>();

    // Root mesh (invisible container)
    const root = new Mesh(`npc_modular_${characterId}`, this.scene);

    // Compute vertical layout from bottom up
    const lowerLegBottom = 0;
    const kneeY = lowerLegBottom + proportions.lowerLegLength;
    const hipY = kneeY + proportions.upperLegLength;
    const torsoBottomY = hipY;
    const torsoTopY = torsoBottomY + proportions.torsoHeight;
    const shoulderY = torsoTopY;
    const neckY = torsoTopY;
    const headCenterY = neckY + proportions.headRadius * 0.9;

    // Head
    const head = MeshBuilder.CreateSphere(
      `npc_head_${characterId}`,
      { diameter: proportions.headRadius * 2, segments: 8 },
      this.scene
    );
    head.position = new Vector3(0, headCenterY, 0);
    head.material = materials.skin;
    head.parent = root;
    parts.set('head', head);

    // Torso
    const torso = MeshBuilder.CreateBox(
      `npc_torso_${characterId}`,
      {
        width: proportions.torsoWidth,
        height: proportions.torsoHeight,
        depth: proportions.torsoDepth,
      },
      this.scene
    );
    torso.position = new Vector3(0, torsoBottomY + proportions.torsoHeight / 2, 0);
    torso.material = materials.clothing;
    torso.parent = root;
    parts.set('torso', torso);

    // Arms (left and right)
    const armOffsetX = proportions.torsoWidth / 2 + proportions.armRadius;
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1;

      // Upper arm
      const upperArm = MeshBuilder.CreateCylinder(
        `npc_upperArm_${side}_${characterId}`,
        {
          height: proportions.upperArmLength,
          diameter: proportions.armRadius * 2,
          tessellation: 8,
        },
        this.scene
      );
      upperArm.position = new Vector3(
        sign * armOffsetX,
        shoulderY - proportions.upperArmLength / 2,
        0
      );
      upperArm.material = materials.clothing;
      upperArm.parent = root;
      parts.set(`upperArm_${side}`, upperArm);

      // Lower arm (forearm) — skin colored
      const lowerArm = MeshBuilder.CreateCylinder(
        `npc_lowerArm_${side}_${characterId}`,
        {
          height: proportions.lowerArmLength,
          diameter: proportions.armRadius * 1.8,
          tessellation: 8,
        },
        this.scene
      );
      lowerArm.position = new Vector3(
        sign * armOffsetX,
        shoulderY - proportions.upperArmLength - proportions.lowerArmLength / 2,
        0
      );
      lowerArm.material = materials.skin;
      lowerArm.parent = root;
      parts.set(`lowerArm_${side}`, lowerArm);
    }

    // Legs (left and right)
    const legOffsetX = proportions.torsoWidth * 0.25;
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1;

      // Upper leg
      const upperLeg = MeshBuilder.CreateCylinder(
        `npc_upperLeg_${side}_${characterId}`,
        {
          height: proportions.upperLegLength,
          diameter: proportions.legRadius * 2,
          tessellation: 8,
        },
        this.scene
      );
      upperLeg.position = new Vector3(
        sign * legOffsetX,
        hipY - proportions.upperLegLength / 2,
        0
      );
      upperLeg.material = materials.accent;
      upperLeg.parent = root;
      parts.set(`upperLeg_${side}`, upperLeg);

      // Lower leg
      const lowerLeg = MeshBuilder.CreateCylinder(
        `npc_lowerLeg_${side}_${characterId}`,
        {
          height: proportions.lowerLegLength,
          diameter: proportions.legRadius * 1.8,
          tessellation: 8,
        },
        this.scene
      );
      lowerLeg.position = new Vector3(
        sign * legOffsetX,
        kneeY - proportions.lowerLegLength / 2,
        0
      );
      lowerLeg.material = materials.accent;
      lowerLeg.parent = root;
      parts.set(`lowerLeg_${side}`, lowerLeg);
    }

    // Apply appearance scale
    root.scaling = appearance.scale;

    // Mark all parts as non-pickable (interaction goes through root)
    parts.forEach((part) => {
      part.isPickable = false;
    });
    root.isPickable = true;

    return { root, parts, appearance, bodyType };
  }

  /**
   * Compute the total height of an assembled NPC (before scale).
   */
  static computeHeight(bodyType: NPCBodyType): number {
    const p = BODY_TYPE_PROPORTIONS[bodyType];
    return p.lowerLegLength + p.upperLegLength + p.torsoHeight + p.headRadius * 2 * 0.9;
  }

  /**
   * Get the body proportions for a given body type.
   */
  static getProportions(bodyType: NPCBodyType): Readonly<BodyProportions> {
    return BODY_TYPE_PROPORTIONS[bodyType];
  }

  /**
   * Dispose all cached materials.
   */
  dispose(): void {
    this.materialCache.forEach((mats) => {
      mats.skin.dispose();
      mats.clothing.dispose();
      mats.accent.dispose();
    });
    this.materialCache.clear();
  }

  // --- Internal ---

  private getOrCreateMaterials(characterId: string, appearance: NPCAppearance): CachedMaterials {
    // Use a key derived from the appearance colors so characters with
    // identical appearances share materials
    const colorKey = [
      appearance.skinColor.r.toFixed(3),
      appearance.skinColor.g.toFixed(3),
      appearance.clothingColor.r.toFixed(3),
      appearance.clothingColor.g.toFixed(3),
      appearance.accentColor.r.toFixed(3),
      appearance.accentColor.g.toFixed(3),
      appearance.roleTint.r.toFixed(3),
    ].join('_');

    const cached = this.materialCache.get(colorKey);
    if (cached) return cached;

    const skin = new StandardMaterial(`npc_skin_${characterId}`, this.scene);
    skin.diffuseColor = blendWithRoleTint(appearance.skinColor, appearance);
    skin.specularPower = appearance.roughness * 100;
    if (appearance.emissiveIntensity > 0) {
      skin.emissiveColor = skin.diffuseColor.scale(appearance.emissiveIntensity);
    }

    const clothing = new StandardMaterial(`npc_clothing_${characterId}`, this.scene);
    clothing.diffuseColor = blendWithRoleTint(appearance.clothingColor, appearance);
    clothing.specularPower = appearance.roughness * 100;
    if (appearance.emissiveIntensity > 0) {
      clothing.emissiveColor = clothing.diffuseColor.scale(appearance.emissiveIntensity);
    }

    const accent = new StandardMaterial(`npc_accent_${characterId}`, this.scene);
    accent.diffuseColor = blendWithRoleTint(appearance.accentColor, appearance);
    accent.specularPower = appearance.roughness * 100;
    if (appearance.emissiveIntensity > 0) {
      accent.emissiveColor = accent.diffuseColor.scale(appearance.emissiveIntensity);
    }

    const mats: CachedMaterials = { skin, clothing, accent };
    this.materialCache.set(colorKey, mats);
    return mats;
  }
}
