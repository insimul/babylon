/**
 * InteriorAtmosphericEffects — Particle-based atmospheric effects for building interiors.
 *
 * Manages per-interior particle systems and flickering lights:
 * - Fireplace/hearth: orange-red flickering point light + fire particles
 * - Kitchen steam: white-gray rising particles near ovens/counters
 * - Forge sparks: orange-yellow particles with lateral scatter near anvils
 * - Candle flicker: point lights with per-frame randomized intensity
 * - Dust motes: slow-moving subtle particles in warehouses, libraries, old buildings
 *
 * All particle systems use Babylon.js ParticleSystem with max 50 particles per emitter.
 * Effects are created when the player enters a building and disposed on exit.
 */

import {
  Color3,
  Color4,
  Vector3,
  PointLight,
  ParticleSystem,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core/scene';
import type { Observer } from '@babylonjs/core/Misc/observable';

/** Furniture placement that can host an atmospheric effect */
export interface EffectPlacement {
  x: number;
  y: number;
  z: number;
  furnitureType: string;
}

/** Configuration for creating atmospheric effects in an interior */
export interface AtmosphericEffectsConfig {
  buildingId: string;
  buildingType: string;
  businessType?: string;
  /** Interior base position */
  position: Vector3;
  width: number;
  depth: number;
  height: number;
  /** Furniture positions that may host effects */
  effectPlacements: EffectPlacement[];
}

/** Per-interior atmospheric state */
interface InteriorEffectsState {
  buildingId: string;
  particleSystems: ParticleSystem[];
  flickerLights: FlickerLight[];
  renderObserver: Observer<Scene> | null;
}

/** A point light with per-frame flicker behavior */
interface FlickerLight {
  light: PointLight;
  baseIntensity: number;
  minIntensity: number;
  maxIntensity: number;
  /** 'sine' for smooth fireplace flicker, 'random' for candle flicker */
  mode: 'sine' | 'random';
  /** Phase offset for sine-based flicker (avoids all fireplaces syncing) */
  phase: number;
}

/** Furniture types that get a fireplace/hearth effect */
const FIREPLACE_TYPES = new Set(['fireplace', 'hearth']);

/** Furniture types that get forge spark effects */
const FORGE_TYPES = new Set(['forge']);

/** Furniture types near which sparks appear */
const ANVIL_TYPES = new Set(['anvil']);

/** Furniture types that get kitchen steam */
const KITCHEN_STEAM_TYPES = new Set(['oven', 'stove']);

/** Furniture types that get candle flicker lights */
const CANDLE_TYPES = new Set(['candle', 'lantern', 'candlestick']);

/** Business types that get kitchen steam on counters */
const KITCHEN_BUSINESS_TYPES = new Set([
  'restaurant', 'bakery', 'brewery', 'bar',
]);

/** Business types that get dust motes */
const DUSTY_BUSINESS_TYPES = new Set([
  'warehouse', 'library', 'bookstore', 'barn', 'lumbermill', 'mine',
]);

/** Building types that get dust motes */
const DUSTY_BUILDING_TYPES = new Set([
  'warehouse', 'library', 'barn',
]);

/** Max particles per emitter for performance */
const MAX_PARTICLES_PER_EMITTER = 50;

/**
 * Determine which atmospheric effects a building should have based on its
 * type, business type, and furniture. Pure function for testability.
 */
export function classifyEffects(
  buildingType: string,
  businessType: string | undefined,
  effectPlacements: EffectPlacement[],
): {
  fireplaces: EffectPlacement[];
  forges: EffectPlacement[];
  anvils: EffectPlacement[];
  kitchenSteam: EffectPlacement[];
  candles: EffectPlacement[];
  hasDustMotes: boolean;
} {
  const bt = (businessType || buildingType || '').toLowerCase();

  const fireplaces: EffectPlacement[] = [];
  const forges: EffectPlacement[] = [];
  const anvils: EffectPlacement[] = [];
  const kitchenSteam: EffectPlacement[] = [];
  const candles: EffectPlacement[] = [];

  for (const p of effectPlacements) {
    const ft = p.furnitureType.toLowerCase();
    if (FIREPLACE_TYPES.has(ft)) {
      fireplaces.push(p);
    } else if (FORGE_TYPES.has(ft)) {
      // In blacksmith interiors, forges get spark effects; elsewhere they act as hearths
      if (bt.includes('blacksmith') || bt.includes('forge') || bt.includes('smithy')) {
        forges.push(p);
      } else {
        // Tavern/residence forges are hearths — treat as fireplace
        fireplaces.push(p);
      }
    } else if (ANVIL_TYPES.has(ft)) {
      anvils.push(p);
    } else if (KITCHEN_STEAM_TYPES.has(ft)) {
      kitchenSteam.push(p);
    } else if (CANDLE_TYPES.has(ft)) {
      candles.push(p);
    }
  }

  // Kitchen businesses also get steam on counter positions
  if (KITCHEN_BUSINESS_TYPES.has(bt) && kitchenSteam.length === 0) {
    // Find a counter to emit steam from
    for (const p of effectPlacements) {
      if (p.furnitureType.toLowerCase() === 'counter') {
        kitchenSteam.push(p);
        break; // One steam source is enough
      }
    }
  }

  // Taverns with no explicit fireplace: add fireplace at first forge
  if ((bt.includes('tavern') || bt.includes('inn')) && fireplaces.length === 0 && forges.length > 0) {
    fireplaces.push(forges.shift()!);
  }

  const hasDustMotes = DUSTY_BUSINESS_TYPES.has(bt) || DUSTY_BUILDING_TYPES.has(bt);

  return { fireplaces, forges, anvils, kitchenSteam, candles, hasDustMotes };
}

export class InteriorAtmosphericEffects {
  private scene: Scene;
  private interiors: Map<string, InteriorEffectsState> = new Map();
  /** Elapsed time accumulator for sine-wave flicker */
  private elapsedTime: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create atmospheric effects for an interior. Call once when the interior is generated.
   */
  createEffects(config: AtmosphericEffectsConfig): void {
    const { buildingId, buildingType, businessType, position, width, depth, height, effectPlacements } = config;

    const classified = classifyEffects(buildingType, businessType, effectPlacements);
    const prefix = `atmos_${buildingId}`;

    const particleSystems: ParticleSystem[] = [];
    const flickerLights: FlickerLight[] = [];

    // --- Fireplace/hearth effects ---
    for (let i = 0; i < classified.fireplaces.length; i++) {
      const fp = classified.fireplaces[i];
      const pos = new Vector3(fp.x, fp.y + 0.3, fp.z);

      // Flickering orange-red point light
      const light = new PointLight(`${prefix}_fire_light_${i}`, pos.clone(), this.scene);
      light.diffuse = new Color3(1.0, 0.4, 0.1);
      light.intensity = 0.8;
      light.range = 6;
      flickerLights.push({
        light,
        baseIntensity: 0.8,
        minIntensity: 0.5,
        maxIntensity: 1.0,
        mode: 'sine',
        phase: i * 1.7, // offset so multiple fireplaces don't sync
      });

      // Fire particles
      const fireParts = new ParticleSystem(`${prefix}_fire_${i}`, 40, this.scene);
      fireParts.emitter = pos;
      fireParts.minEmitBox = new Vector3(-0.3, 0, -0.3);
      fireParts.maxEmitBox = new Vector3(0.3, 0, 0.3);
      fireParts.color1 = new Color4(1.0, 0.6, 0.1, 1.0);
      fireParts.color2 = new Color4(1.0, 0.3, 0.0, 1.0);
      fireParts.colorDead = new Color4(0.3, 0.1, 0.0, 0.0);
      fireParts.minSize = 0.05;
      fireParts.maxSize = 0.15;
      fireParts.minLifeTime = 0.3;
      fireParts.maxLifeTime = 0.5;
      fireParts.emitRate = 30;
      fireParts.direction1 = new Vector3(-0.1, 1.0, -0.1);
      fireParts.direction2 = new Vector3(0.1, 1.5, 0.1);
      fireParts.gravity = new Vector3(0, 0.5, 0);
      fireParts.minEmitPower = 0.3;
      fireParts.maxEmitPower = 0.6;
      fireParts.blendMode = ParticleSystem.BLENDMODE_ADD;
      fireParts.createPointEmitter(new Vector3(0, 1, 0), new Vector3(0, 1.5, 0));
      fireParts.start();
      particleSystems.push(fireParts);
    }

    // --- Kitchen steam ---
    for (let i = 0; i < classified.kitchenSteam.length; i++) {
      const ks = classified.kitchenSteam[i];
      const pos = new Vector3(ks.x, ks.y + 0.5, ks.z);

      const steamParts = new ParticleSystem(`${prefix}_steam_${i}`, 30, this.scene);
      steamParts.emitter = pos;
      steamParts.minEmitBox = new Vector3(-0.4, 0, -0.4);
      steamParts.maxEmitBox = new Vector3(0.4, 0, 0.4);
      steamParts.color1 = new Color4(0.9, 0.9, 0.9, 0.3);
      steamParts.color2 = new Color4(0.7, 0.7, 0.7, 0.2);
      steamParts.colorDead = new Color4(0.8, 0.8, 0.8, 0.0);
      steamParts.minSize = 0.1;
      steamParts.maxSize = 0.3;
      steamParts.minLifeTime = 0.8;
      steamParts.maxLifeTime = 1.5;
      steamParts.emitRate = 15;
      steamParts.direction1 = new Vector3(-0.05, 0.8, -0.05);
      steamParts.direction2 = new Vector3(0.05, 1.2, 0.05);
      steamParts.gravity = new Vector3(0, 0.2, 0);
      steamParts.minEmitPower = 0.1;
      steamParts.maxEmitPower = 0.3;
      steamParts.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      steamParts.start();
      particleSystems.push(steamParts);
    }

    // --- Forge sparks ---
    const sparkSources = [...classified.forges, ...classified.anvils];
    for (let i = 0; i < sparkSources.length; i++) {
      const src = sparkSources[i];
      const pos = new Vector3(src.x, src.y + 0.5, src.z);

      const sparkParts = new ParticleSystem(`${prefix}_spark_${i}`, MAX_PARTICLES_PER_EMITTER, this.scene);
      sparkParts.emitter = pos;
      sparkParts.minEmitBox = new Vector3(-0.2, 0, -0.2);
      sparkParts.maxEmitBox = new Vector3(0.2, 0, 0.2);
      sparkParts.color1 = new Color4(1.0, 0.7, 0.1, 1.0);
      sparkParts.color2 = new Color4(1.0, 0.5, 0.0, 1.0);
      sparkParts.colorDead = new Color4(0.5, 0.2, 0.0, 0.0);
      sparkParts.minSize = 0.02;
      sparkParts.maxSize = 0.06;
      sparkParts.minLifeTime = 0.2;
      sparkParts.maxLifeTime = 0.6;
      sparkParts.emitRate = 25;
      // Random lateral velocity for spark scatter
      sparkParts.direction1 = new Vector3(-1.0, 1.5, -1.0);
      sparkParts.direction2 = new Vector3(1.0, 2.5, 1.0);
      sparkParts.gravity = new Vector3(0, -3.0, 0);
      sparkParts.minEmitPower = 0.5;
      sparkParts.maxEmitPower = 1.5;
      sparkParts.blendMode = ParticleSystem.BLENDMODE_ADD;
      sparkParts.start();
      particleSystems.push(sparkParts);

      // Forge glow light
      if (FORGE_TYPES.has(src.furnitureType.toLowerCase())) {
        const forgeLight = new PointLight(`${prefix}_forge_glow_${i}`, pos.clone(), this.scene);
        forgeLight.diffuse = new Color3(1.0, 0.5, 0.1);
        forgeLight.intensity = 0.6;
        forgeLight.range = 5;
        flickerLights.push({
          light: forgeLight,
          baseIntensity: 0.6,
          minIntensity: 0.4,
          maxIntensity: 0.8,
          mode: 'sine',
          phase: i * 2.3,
        });
      }
    }

    // --- Candle flicker ---
    for (let i = 0; i < classified.candles.length; i++) {
      const c = classified.candles[i];
      const pos = new Vector3(c.x, c.y + 0.3, c.z);

      const candleLight = new PointLight(`${prefix}_candle_${i}`, pos, this.scene);
      candleLight.diffuse = new Color3(1.0, 0.8, 0.5);
      candleLight.intensity = 0.45;
      candleLight.range = 4;
      flickerLights.push({
        light: candleLight,
        baseIntensity: 0.45,
        minIntensity: 0.3,
        maxIntensity: 0.6,
        mode: 'random',
        phase: 0,
      });
    }

    // --- Dust motes ---
    if (classified.hasDustMotes) {
      const centerPos = new Vector3(position.x, position.y + height * 0.5, position.z);
      const dustParts = new ParticleSystem(`${prefix}_dust`, 20, this.scene);
      dustParts.emitter = centerPos;
      dustParts.minEmitBox = new Vector3(-width * 0.4, -height * 0.3, -depth * 0.4);
      dustParts.maxEmitBox = new Vector3(width * 0.4, height * 0.3, depth * 0.4);
      dustParts.color1 = new Color4(0.9, 0.85, 0.7, 0.15);
      dustParts.color2 = new Color4(0.8, 0.75, 0.6, 0.1);
      dustParts.colorDead = new Color4(0.8, 0.8, 0.7, 0.0);
      dustParts.minSize = 0.02;
      dustParts.maxSize = 0.05;
      dustParts.minLifeTime = 3.0;
      dustParts.maxLifeTime = 6.0;
      dustParts.emitRate = 5;
      dustParts.direction1 = new Vector3(-0.02, 0.01, -0.02);
      dustParts.direction2 = new Vector3(0.02, 0.03, 0.02);
      dustParts.gravity = new Vector3(0, -0.01, 0);
      dustParts.minEmitPower = 0.01;
      dustParts.maxEmitPower = 0.03;
      dustParts.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      dustParts.start();
      particleSystems.push(dustParts);
    }

    // --- Per-frame flicker update ---
    let renderObserver: Observer<Scene> | null = null;
    if (flickerLights.length > 0) {
      renderObserver = this.scene.onBeforeRenderObservable.add(() => {
        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        this.elapsedTime += dt;
        this.updateFlickerLights(flickerLights, this.elapsedTime);
      });
    }

    this.interiors.set(buildingId, {
      buildingId,
      particleSystems,
      flickerLights,
      renderObserver,
    });
  }

  /** Update flicker lights for one frame */
  private updateFlickerLights(lights: FlickerLight[], elapsed: number): void {
    for (const fl of lights) {
      if (fl.mode === 'sine') {
        // Sine wave flicker with multiple frequencies for organic look
        const wave = Math.sin(elapsed * 5.0 + fl.phase)
          * 0.3 + Math.sin(elapsed * 13.0 + fl.phase * 2.1) * 0.15;
        const t = (wave + 0.45) / 0.9; // normalize ~0..1
        fl.light.intensity = fl.minIntensity + (fl.maxIntensity - fl.minIntensity) * Math.max(0, Math.min(1, t));
      } else {
        // Random per-frame flicker for candles
        fl.light.intensity = fl.minIntensity + Math.random() * (fl.maxIntensity - fl.minIntensity);
      }
    }
  }

  /** Dispose effects for a single interior */
  disposeInterior(buildingId: string): void {
    const state = this.interiors.get(buildingId);
    if (!state) return;
    this.disposeInteriorState(state);
    this.interiors.delete(buildingId);
  }

  /** Dispose all managed atmospheric effects */
  dispose(): void {
    this.interiors.forEach((_state, id) => {
      this.disposeInteriorState(_state);
    });
    this.interiors.clear();
  }

  private disposeInteriorState(state: InteriorEffectsState): void {
    for (const ps of state.particleSystems) {
      ps.stop();
      ps.dispose();
    }
    for (const fl of state.flickerLights) {
      fl.light.dispose();
    }
    if (state.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(state.renderObserver);
    }
  }
}

/**
 * Extract effect-eligible furniture placements from furniture meshes.
 * Similar to extractLampPlacements but for atmospheric effect sources.
 */
export function extractEffectPlacements(
  furnitureMeshes: Array<{ name: string; position: { x: number; y: number; z: number }; getBoundingInfo?: () => { boundingBox: { maximumWorld: { y: number } } } }>,
): EffectPlacement[] {
  const EFFECT_FURNITURE = new Set([
    'fireplace', 'hearth', 'forge', 'anvil', 'oven', 'stove',
    'candle', 'lantern', 'candlestick', 'counter',
  ]);

  const placements: EffectPlacement[] = [];
  for (const mesh of furnitureMeshes) {
    const nameParts = mesh.name.split('_');
    const furnitureType = nameParts[nameParts.length - 1];
    if (EFFECT_FURNITURE.has(furnitureType)) {
      const pos = mesh.position;
      const bounds = mesh.getBoundingInfo?.();
      const topY = bounds ? bounds.boundingBox.maximumWorld.y : pos.y + 0.5;
      placements.push({
        x: pos.x,
        y: topY,
        z: pos.z,
        furnitureType,
      });
    }
  }
  return placements;
}
