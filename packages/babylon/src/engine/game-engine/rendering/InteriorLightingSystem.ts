/**
 * InteriorLightingSystem — Dynamic interior lighting that responds to the DayNightCycle.
 *
 * Manages per-interior lighting with:
 * - Window directional lights (daytime sunlight angled inward)
 * - Candle/lamp point lights (nighttime warm glow near furniture)
 * - Time-of-day transitions (day → dusk/dawn → night)
 * - Business operating-hours supplemental lighting
 * - Residence sleep-state light control
 */

import {
  Color3,
  Vector3,
  PointLight,
  DirectionalLight,
  HemisphericLight,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';

/** Warm candle/lamp color: RGB(255, 200, 120) normalized */
const WARM_LIGHT_COLOR = new Color3(1.0, 0.784, 0.471);

/** Candle/lamp point light settings */
const LAMP_INTENSITY = 0.5;
const LAMP_RANGE = 8;
/** Y offset above furniture surface for lamp placement */
const LAMP_Y_OFFSET = 1.0;

/** Time-of-day boundaries (fractional hours) */
const DAY_START = 6.0;
const DAY_END = 18.0;
const DUSK_END = 20.0;
const DAWN_START = 5.0;

/** Ambient intensity levels */
const DAY_AMBIENT = 0.6;
const NIGHT_AMBIENT = 0.15;

/** Window light intensity at full day */
const WINDOW_LIGHT_INTENSITY = 0.7;

/** Furniture types that get a lamp placed on top */
const LAMP_FURNITURE_TYPES = new Set([
  'table', 'counter', 'workbench', 'desk', 'altar', 'podium',
]);

/** Furniture types that get a wall-mounted candle nearby */
const WALL_FURNITURE_TYPES = new Set([
  'shelf', 'bookshelf', 'cabinet', 'wardrobe',
]);

/** Info about a placed lamp/candle point light */
export interface InteriorLampLight {
  light: PointLight;
  /** World position of this lamp */
  position: Vector3;
}

/** Describes a window's inward light direction */
export interface WindowLightInfo {
  light: DirectionalLight;
  /** Wall the window is on: 'north' | 'south' | 'east' | 'west' */
  wall: string;
}

/** Per-interior lighting state */
export interface InteriorLightingState {
  buildingId: string;
  buildingType: string;
  businessType?: string;
  ambient: HemisphericLight;
  windowLights: WindowLightInfo[];
  lampLights: InteriorLampLight[];
  /** Business operating hours [open, close] in fractional hours; null for residences */
  operatingHours: [number, number] | null;
  /** Whether all residents are sleeping (residences only) */
  residentsAsleep: boolean;
  /** Whether this is a large room (tavern, church, etc.) */
  isLargeRoom: boolean;
}

/** Position info for placing a lamp */
export interface LampPlacement {
  x: number;
  y: number;
  z: number;
  furnitureType: string;
}

/** Configuration for creating interior lights */
export interface InteriorLightingConfig {
  buildingId: string;
  buildingType: string;
  businessType?: string;
  /** Interior position (base offset in scene) */
  position: Vector3;
  width: number;
  depth: number;
  height: number;
  /** Furniture placements where lamps can go: {x, y, z, furnitureType} in world coords */
  lampPlacements: LampPlacement[];
  /** Walls that have windows: subset of ['north', 'south', 'east', 'west'] */
  windowWalls: string[];
  /** Business operating hours [open, close]; null for residences */
  operatingHours?: [number, number] | null;
}

/** Large room building/business types that get 4-8 lights */
const LARGE_ROOM_TYPES = new Set([
  'tavern', 'inn', 'church', 'cathedral', 'temple', 'courthouse',
  'theater', 'hall', 'ballroom', 'warehouse', 'barn', 'market',
  'guild_hall', 'assembly', 'banquet',
]);

/**
 * Compute time-of-day factor: 1.0 = full day, 0.0 = full night,
 * with smooth transitions during dusk/dawn.
 */
export function computeDaylightFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;

  if (h >= DAY_START && h < DAY_END) {
    return 1.0; // Full day
  } else if (h >= DAWN_START && h < DAY_START) {
    // Dawn transition: 5:00-6:00
    return (h - DAWN_START) / (DAY_START - DAWN_START);
  } else if (h >= DAY_END && h < DUSK_END) {
    // Dusk transition: 18:00-20:00
    return 1.0 - (h - DAY_END) / (DUSK_END - DAY_END);
  }
  // Night: 20:00-5:00
  return 0.0;
}

/**
 * Compute night factor (inverse of daylight): 1.0 = full night, 0.0 = full day.
 */
export function computeNightFactor(hour: number): number {
  return 1.0 - computeDaylightFactor(hour);
}

export class InteriorLightingSystem {
  private scene: Scene;
  private interiors: Map<string, InteriorLightingState> = new Map();
  private shadowGenerator: ShadowGenerator | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Optionally attach a shadow generator for lamp soft shadows. */
  setShadowGenerator(generator: ShadowGenerator): void {
    this.shadowGenerator = generator;
  }

  /**
   * Create lighting for an interior. Call once when the interior is generated.
   * Returns the lighting state for external reference.
   */
  createInteriorLighting(config: InteriorLightingConfig): InteriorLightingState {
    const {
      buildingId, buildingType, businessType,
      position, width, depth, height,
      lampPlacements, windowWalls,
    } = config;

    const prefix = `interior_${buildingId}`;
    const isLargeRoom = this.isLargeRoomType(buildingType, businessType);

    // --- Ambient hemispheric light ---
    const ambient = new HemisphericLight(
      `${prefix}_dyn_ambient`,
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambient.intensity = DAY_AMBIENT;
    ambient.diffuse = new Color3(1, 1, 1);
    ambient.groundColor = new Color3(0.3, 0.25, 0.2);

    // --- Window directional lights ---
    const windowLights: WindowLightInfo[] = [];
    for (const wall of windowWalls) {
      const dir = this.windowDirection(wall);
      const light = new DirectionalLight(
        `${prefix}_window_${wall}`,
        dir,
        this.scene,
      );
      light.intensity = WINDOW_LIGHT_INTENSITY;
      light.diffuse = new Color3(1.0, 0.98, 0.92);
      // Position the light source outside the window
      light.position = this.windowLightPosition(wall, position, width, depth, height);
      windowLights.push({ light, wall });
    }

    // --- Candle/lamp point lights ---
    const maxLamps = isLargeRoom ? 8 : 4;
    const minLamps = isLargeRoom ? 4 : 2;
    const lampCount = Math.min(maxLamps, Math.max(minLamps, lampPlacements.length));

    const lampLights: InteriorLampLight[] = [];
    const placementsToUse = lampPlacements.slice(0, lampCount);

    // If we need more lights than furniture placements, add wall-mounted ones
    const remaining = lampCount - placementsToUse.length;
    if (remaining > 0) {
      const wallPositions = this.generateWallLampPositions(
        position, width, depth, height, remaining, lampLights.length,
      );
      for (const wp of wallPositions) {
        placementsToUse.push({ x: wp.x, y: wp.y, z: wp.z, furnitureType: 'wall_sconce' });
      }
    }

    for (let i = 0; i < placementsToUse.length; i++) {
      const p = placementsToUse[i];
      const lampPos = new Vector3(p.x, p.y + LAMP_Y_OFFSET, p.z);

      const light = new PointLight(
        `${prefix}_lamp_${i}`,
        lampPos,
        this.scene,
      );
      light.diffuse = WARM_LIGHT_COLOR.clone();
      light.intensity = LAMP_INTENSITY;
      light.range = LAMP_RANGE;
      light.setEnabled(false); // Start off; update() will enable as needed

      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(light as any);
      }

      lampLights.push({ light, position: lampPos });
    }

    const state: InteriorLightingState = {
      buildingId,
      buildingType,
      businessType,
      ambient,
      windowLights,
      lampLights,
      operatingHours: config.operatingHours ?? null,
      residentsAsleep: false,
      isLargeRoom,
    };

    this.interiors.set(buildingId, state);
    return state;
  }

  /**
   * Mark whether all residents of a residence are asleep.
   * When asleep, all interior lights turn off.
   */
  setResidentsAsleep(buildingId: string, asleep: boolean): void {
    const state = this.interiors.get(buildingId);
    if (state) {
      state.residentsAsleep = asleep;
    }
  }

  /**
   * Update all interior lighting based on current time of day.
   * Call once per frame from the game loop.
   */
  update(fractionalHour: number): void {
    this.interiors.forEach((state) => {
      this.updateInterior(state, fractionalHour);
    });
  }

  private updateInterior(state: InteriorLightingState, hour: number): void {
    const dayFactor = computeDaylightFactor(hour);
    const nightFactor = 1.0 - dayFactor;
    const isResidence = !state.businessType || state.buildingType.includes('residen');

    // --- Residence sleep override: all lights off ---
    if (isResidence && state.residentsAsleep) {
      state.ambient.intensity = NIGHT_AMBIENT * 0.5;
      for (const wl of state.windowLights) {
        wl.light.intensity = 0;
        wl.light.setEnabled(false);
      }
      for (const ll of state.lampLights) {
        ll.light.setEnabled(false);
      }
      return;
    }

    // --- Business supplemental lighting during operating hours ---
    const businessSupplemental = this.isBusinessOpen(state, hour);

    // --- Ambient light ---
    state.ambient.intensity = DAY_AMBIENT * dayFactor + NIGHT_AMBIENT * nightFactor;
    // Shift ambient color warmer at night
    state.ambient.diffuse = new Color3(
      1.0,
      1.0 - nightFactor * 0.15,
      1.0 - nightFactor * 0.3,
    );

    // --- Window lights: strong during day, fade during dusk/dawn, off at night ---
    for (const wl of state.windowLights) {
      const shouldEnable = dayFactor > 0.01;
      wl.light.setEnabled(shouldEnable);
      if (shouldEnable) {
        wl.light.intensity = WINDOW_LIGHT_INTENSITY * dayFactor;
      }
    }

    // --- Lamp lights: on at night, during dusk/dawn, or when business is open ---
    const lampShouldBeOn = nightFactor > 0.01 || businessSupplemental;
    const lampIntensity = businessSupplemental
      ? Math.max(LAMP_INTENSITY * nightFactor, LAMP_INTENSITY * 0.3) // supplemental minimum
      : LAMP_INTENSITY * nightFactor;

    for (const ll of state.lampLights) {
      ll.light.setEnabled(lampShouldBeOn);
      if (lampShouldBeOn) {
        ll.light.intensity = lampIntensity;
      }
    }
  }

  /** Check if a business is within its operating hours */
  private isBusinessOpen(state: InteriorLightingState, hour: number): boolean {
    if (!state.operatingHours) return false;
    const [open, close] = state.operatingHours;
    const h = ((hour % 24) + 24) % 24;
    if (open <= close) {
      return h >= open && h < close;
    }
    // Wraps midnight (e.g., tavern 18:00-2:00)
    return h >= open || h < close;
  }

  /** Direction vector pointing inward from a window wall */
  private windowDirection(wall: string): Vector3 {
    switch (wall) {
      case 'north': return new Vector3(0, -0.5, -1).normalize();
      case 'south': return new Vector3(0, -0.5, 1).normalize();
      case 'east': return new Vector3(-1, -0.5, 0).normalize();
      case 'west': return new Vector3(1, -0.5, 0).normalize();
      default: return new Vector3(0, -1, 0);
    }
  }

  /** Position the window directional light outside the appropriate wall */
  private windowLightPosition(
    wall: string, pos: Vector3, width: number, depth: number, height: number,
  ): Vector3 {
    const midY = pos.y + height * 0.7;
    switch (wall) {
      case 'north': return new Vector3(pos.x, midY, pos.z + depth / 2 + 1);
      case 'south': return new Vector3(pos.x, midY, pos.z - depth / 2 - 1);
      case 'east': return new Vector3(pos.x + width / 2 + 1, midY, pos.z);
      case 'west': return new Vector3(pos.x - width / 2 - 1, midY, pos.z);
      default: return new Vector3(pos.x, midY, pos.z);
    }
  }

  /** Generate positions along interior walls for wall-mounted lamps */
  private generateWallLampPositions(
    pos: Vector3, width: number, depth: number, height: number,
    count: number, existingCount: number,
  ): Vector3[] {
    const positions: Vector3[] = [];
    const wallY = pos.y + height * 0.7;
    const inset = 0.5; // Distance from wall

    // Distribute along walls evenly
    const walls = [
      { x: pos.x - width / 2 + inset, z: pos.z }, // west
      { x: pos.x + width / 2 - inset, z: pos.z }, // east
      { x: pos.x, z: pos.z + depth / 2 - inset }, // north
      { x: pos.x, z: pos.z - depth / 2 + inset }, // south
    ];

    for (let i = 0; i < count && i < walls.length; i++) {
      const w = walls[(i + existingCount) % walls.length];
      positions.push(new Vector3(w.x, wallY, w.z));
    }
    return positions;
  }

  private isLargeRoomType(buildingType: string, businessType?: string): boolean {
    const bt = (businessType || buildingType || '').toLowerCase();
    return LARGE_ROOM_TYPES.has(bt) ||
      bt.includes('tavern') || bt.includes('church') ||
      bt.includes('cathedral') || bt.includes('hall');
  }

  /** Dispose lighting for a single interior */
  disposeInterior(buildingId: string): void {
    const state = this.interiors.get(buildingId);
    if (!state) return;
    state.ambient.dispose();
    for (const wl of state.windowLights) wl.light.dispose();
    for (const ll of state.lampLights) ll.light.dispose();
    this.interiors.delete(buildingId);
  }

  /** Dispose all managed interior lights */
  dispose(): void {
    this.interiors.forEach((state) => {
      state.ambient.dispose();
      state.windowLights.forEach((wl) => wl.light.dispose());
      state.lampLights.forEach((ll) => ll.light.dispose());
    });
    this.interiors.clear();
  }
}

/**
 * Extract lamp placements from furniture meshes in an interior.
 * Scans furniture for table/counter/desk types and returns their positions.
 */
export function extractLampPlacements(
  furnitureSpecs: Array<{ type: string; offsetX: number; offsetZ: number; height: number }>,
  basePosition: Vector3,
): LampPlacement[] {
  const placements: LampPlacement[] = [];
  for (const spec of furnitureSpecs) {
    if (LAMP_FURNITURE_TYPES.has(spec.type) || WALL_FURNITURE_TYPES.has(spec.type)) {
      placements.push({
        x: basePosition.x + spec.offsetX,
        y: basePosition.y + spec.height,
        z: basePosition.z + spec.offsetZ,
        furnitureType: spec.type,
      });
    }
  }
  return placements;
}
