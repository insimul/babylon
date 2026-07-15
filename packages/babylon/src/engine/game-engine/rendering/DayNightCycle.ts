/**
 * DayNightCycle — Drives visual lighting and sky color transitions based on game time.
 *
 * Each frame, reads the fractional hour from GameTimeManager and smoothly
 * interpolates sun direction, light intensities/colors, and sky shader uniforms
 * between defined keyframes.
 */

import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { GameTimeManager } from "../logic/GameTimeManager";

// ── Keyframe definition ─────────────────────────────────────────────────────

export interface LightingKeyframe {
  hour: number; // 0–24 (24 wraps to 0)
  sunAltitude: number; // radians above horizon (negative = below)
  sunAzimuth: number; // radians around Y axis
  sunIntensity: number;
  sunColor: Color3;
  hemiIntensity: number;
  hemiSkyColor: Color3; // hemisphere upper color
  hemiGroundColor: Color3; // hemisphere lower color
  skyZenith: Color3;
  skyHorizon: Color3;
  skyGround: Color3;
  fogDensity: number;
}

// ── Default keyframes ────────────────────────────────────────────────────────

function defaultKeyframes(baseSkyColor: Color3): LightingKeyframe[] {
  return [
    {
      // 0:00 — Midnight
      hour: 0,
      sunAltitude: -0.8,
      sunAzimuth: Math.PI,
      sunIntensity: 0,
      sunColor: new Color3(0.1, 0.1, 0.2),
      hemiIntensity: 0.15,
      hemiSkyColor: new Color3(0.05, 0.05, 0.12),
      hemiGroundColor: new Color3(0.02, 0.02, 0.05),
      skyZenith: new Color3(0.02, 0.02, 0.06),
      skyHorizon: new Color3(0.05, 0.05, 0.1),
      skyGround: new Color3(0.02, 0.02, 0.04),
      fogDensity: 0.003,
    },
    {
      // 5:00 — Pre-dawn
      hour: 5,
      sunAltitude: -0.2,
      sunAzimuth: -Math.PI * 0.75,
      sunIntensity: 0.1,
      sunColor: new Color3(0.4, 0.2, 0.15),
      hemiIntensity: 0.25,
      hemiSkyColor: new Color3(0.15, 0.1, 0.2),
      hemiGroundColor: new Color3(0.05, 0.04, 0.06),
      skyZenith: new Color3(0.08, 0.06, 0.18),
      skyHorizon: new Color3(0.5, 0.25, 0.15),
      skyGround: new Color3(0.1, 0.06, 0.04),
      fogDensity: 0.004,
    },
    {
      // 6:30 — Sunrise
      hour: 6.5,
      sunAltitude: 0.15,
      sunAzimuth: -Math.PI * 0.6,
      sunIntensity: 0.6,
      sunColor: new Color3(1.0, 0.6, 0.3),
      hemiIntensity: 0.45,
      hemiSkyColor: new Color3(0.4, 0.35, 0.5),
      hemiGroundColor: new Color3(0.15, 0.1, 0.08),
      skyZenith: new Color3(0.2, 0.25, 0.55),
      skyHorizon: new Color3(0.85, 0.5, 0.25),
      skyGround: new Color3(0.25, 0.15, 0.08),
      fogDensity: 0.002,
    },
    {
      // 8:00 — Morning
      hour: 8,
      sunAltitude: 0.5,
      sunAzimuth: -Math.PI * 0.45,
      sunIntensity: 0.9,
      sunColor: new Color3(1.0, 0.85, 0.7),
      hemiIntensity: 0.6,
      hemiSkyColor: new Color3(0.5, 0.55, 0.7),
      hemiGroundColor: new Color3(0.2, 0.18, 0.12),
      skyZenith: new Color3(
        baseSkyColor.r * 0.45,
        baseSkyColor.g * 0.5,
        baseSkyColor.b * 0.95,
      ),
      skyHorizon: new Color3(
        Math.min(1, baseSkyColor.r * 1.1 + 0.2),
        Math.min(1, baseSkyColor.g * 1.0 + 0.15),
        Math.min(1, baseSkyColor.b * 0.8 + 0.12),
      ),
      skyGround: new Color3(
        baseSkyColor.r * 0.5 + 0.15,
        baseSkyColor.g * 0.55 + 0.1,
        baseSkyColor.b * 0.4 + 0.08,
      ),
      fogDensity: 0.001,
    },
    {
      // 12:00 — Midday (uses world theme sky color)
      hour: 12,
      sunAltitude: 1.2,
      sunAzimuth: 0,
      sunIntensity: 1.1,
      sunColor: new Color3(1.0, 0.98, 0.92),
      hemiIntensity: 0.7,
      hemiSkyColor: new Color3(0.6, 0.65, 0.8),
      hemiGroundColor: new Color3(0.25, 0.22, 0.15),
      skyZenith: new Color3(
        baseSkyColor.r * 0.5,
        baseSkyColor.g * 0.55,
        baseSkyColor.b * 1.1,
      ),
      skyHorizon: new Color3(
        Math.min(1, baseSkyColor.r * 1.3 + 0.15),
        Math.min(1, baseSkyColor.g * 1.2 + 0.12),
        Math.min(1, baseSkyColor.b * 0.95 + 0.1),
      ),
      skyGround: new Color3(
        baseSkyColor.r * 0.6 + 0.15,
        baseSkyColor.g * 0.65 + 0.1,
        baseSkyColor.b * 0.5 + 0.08,
      ),
      fogDensity: 0.0005,
    },
    {
      // 16:00 — Afternoon
      hour: 16,
      sunAltitude: 0.6,
      sunAzimuth: Math.PI * 0.45,
      sunIntensity: 0.95,
      sunColor: new Color3(1.0, 0.88, 0.72),
      hemiIntensity: 0.6,
      hemiSkyColor: new Color3(0.5, 0.55, 0.7),
      hemiGroundColor: new Color3(0.22, 0.18, 0.12),
      skyZenith: new Color3(
        baseSkyColor.r * 0.45,
        baseSkyColor.g * 0.5,
        baseSkyColor.b * 1.0,
      ),
      skyHorizon: new Color3(
        Math.min(1, baseSkyColor.r * 1.2 + 0.18),
        Math.min(1, baseSkyColor.g * 1.1 + 0.14),
        Math.min(1, baseSkyColor.b * 0.85 + 0.1),
      ),
      skyGround: new Color3(
        baseSkyColor.r * 0.55 + 0.15,
        baseSkyColor.g * 0.6 + 0.1,
        baseSkyColor.b * 0.45 + 0.08,
      ),
      fogDensity: 0.0008,
    },
    {
      // 18:30 — Sunset
      hour: 18.5,
      sunAltitude: 0.1,
      sunAzimuth: Math.PI * 0.65,
      sunIntensity: 0.5,
      sunColor: new Color3(1.0, 0.45, 0.15),
      hemiIntensity: 0.4,
      hemiSkyColor: new Color3(0.35, 0.25, 0.4),
      hemiGroundColor: new Color3(0.12, 0.08, 0.06),
      skyZenith: new Color3(0.15, 0.12, 0.4),
      skyHorizon: new Color3(0.9, 0.4, 0.15),
      skyGround: new Color3(0.2, 0.1, 0.06),
      fogDensity: 0.002,
    },
    {
      // 20:00 — Dusk
      hour: 20,
      sunAltitude: -0.3,
      sunAzimuth: Math.PI * 0.8,
      sunIntensity: 0.05,
      sunColor: new Color3(0.3, 0.15, 0.1),
      hemiIntensity: 0.2,
      hemiSkyColor: new Color3(0.1, 0.08, 0.18),
      hemiGroundColor: new Color3(0.04, 0.03, 0.06),
      skyZenith: new Color3(0.05, 0.04, 0.15),
      skyHorizon: new Color3(0.2, 0.1, 0.12),
      skyGround: new Color3(0.06, 0.04, 0.04),
      fogDensity: 0.003,
    },
  ];
}

// ── Interpolation helpers ────────────────────────────────────────────────────

function lerpColor3(a: Color3, b: Color3, t: number): Color3 {
  return new Color3(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Find the two keyframes that bracket `hour` and return them with interpolation t. */
export function findKeyframePair(
  keyframes: LightingKeyframe[],
  hour: number,
): { a: LightingKeyframe; b: LightingKeyframe; t: number } {
  const h = ((hour % 24) + 24) % 24; // normalize to [0, 24)

  // Keyframes are sorted by hour. Find the pair that brackets h.
  for (let i = 0; i < keyframes.length; i++) {
    const next = (i + 1) % keyframes.length;
    const aHour = keyframes[i].hour;
    let bHour = keyframes[next].hour;

    // Handle wrap-around (last keyframe → first keyframe spans midnight)
    if (bHour <= aHour) bHour += 24;

    let testH = h;
    if (testH < aHour) testH += 24;

    if (testH >= aHour && testH < bHour) {
      const span = bHour - aHour;
      const t = span > 0 ? (testH - aHour) / span : 0;
      return { a: keyframes[i], b: keyframes[next], t };
    }
  }

  // Fallback (shouldn't happen with valid keyframes)
  return { a: keyframes[0], b: keyframes[0], t: 0 };
}

/** Interpolate all lighting properties between two keyframes. */
export function interpolateKeyframes(
  a: LightingKeyframe,
  b: LightingKeyframe,
  t: number,
): LightingKeyframe {
  return {
    hour: lerp(a.hour, b.hour, t),
    sunAltitude: lerp(a.sunAltitude, b.sunAltitude, t),
    sunAzimuth: lerp(a.sunAzimuth, b.sunAzimuth, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunColor: lerpColor3(a.sunColor, b.sunColor, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    hemiSkyColor: lerpColor3(a.hemiSkyColor, b.hemiSkyColor, t),
    hemiGroundColor: lerpColor3(a.hemiGroundColor, b.hemiGroundColor, t),
    skyZenith: lerpColor3(a.skyZenith, b.skyZenith, t),
    skyHorizon: lerpColor3(a.skyHorizon, b.skyHorizon, t),
    skyGround: lerpColor3(a.skyGround, b.skyGround, t),
    fogDensity: lerp(a.fogDensity, b.fogDensity, t),
  };
}

// ── DayNightCycle class ──────────────────────────────────────────────────────

export interface DayNightCycleOptions {
  scene: Scene;
  timeManager: GameTimeManager;
  baseSkyColor: Color3;
}

export class DayNightCycle {
  private scene: Scene;
  private timeManager: GameTimeManager;
  private keyframes: LightingKeyframe[];

  private sun: DirectionalLight | null = null;
  private hemiLight: HemisphericLight | null = null;
  private skyMat: ShaderMaterial | null = null;

  /** Street lamp PointLights — faded on/off with time of day. */
  private streetLights: PointLight[] = [];
  private streetLightBaseIntensity: number = 0.8;
  /** Hours when street lights transition on/off. */
  private static readonly LIGHTS_ON_START = 18.0;  // Begin turning on at 6pm
  private static readonly LIGHTS_ON_FULL = 19.5;   // Fully on by 7:30pm
  private static readonly LIGHTS_OFF_START = 5.5;   // Begin turning off at 5:30am
  private static readonly LIGHTS_OFF_FULL = 7.0;    // Fully off by 7am

  constructor(options: DayNightCycleOptions) {
    this.scene = options.scene;
    this.timeManager = options.timeManager;
    this.keyframes = defaultKeyframes(options.baseSkyColor);

    // Resolve scene lights and sky material
    this.sun = this.scene.getLightByName("sun") as DirectionalLight | null;
    this.hemiLight = this.scene.getLightByName("hemi-light") as HemisphericLight | null;
    const skyDome = this.scene.getMeshByName("sky-dome");
    if (skyDome?.material) {
      this.skyMat = skyDome.material as ShaderMaterial;
    }
  }

  /**
   * Register street lamp PointLights so the cycle can fade them on at dusk / off at dawn.
   * Can be called multiple times (e.g. per settlement) — lights accumulate.
   */
  addStreetLights(lights: PointLight[]): void {
    for (const l of lights) {
      this.streetLightBaseIntensity = l.intensity; // capture authored intensity
      this.streetLights.push(l);
    }
  }

  /** Call once per frame from the render/update loop. */
  update(): void {
    const hour = this.timeManager.fractionalHour;
    const { a, b, t } = findKeyframePair(this.keyframes, hour);
    const kf = interpolateKeyframes(a, b, t);

    this.applySun(kf);
    this.applyHemiLight(kf);
    this.applySky(kf);
    this.applyFog(kf);
    this.applySceneClearColor(kf);
    this.applyStreetLights(hour);
  }

  private applySun(kf: LightingKeyframe): void {
    if (!this.sun) return;

    // Convert altitude + azimuth to direction vector (pointing FROM sun TO scene)
    const cosAlt = Math.cos(kf.sunAltitude);
    const dir = new Vector3(
      cosAlt * Math.sin(kf.sunAzimuth),
      -Math.sin(kf.sunAltitude),
      cosAlt * Math.cos(kf.sunAzimuth),
    );
    this.sun.direction = dir;
    this.sun.intensity = kf.sunIntensity;
    this.sun.diffuse = kf.sunColor;
  }

  private applyHemiLight(kf: LightingKeyframe): void {
    if (!this.hemiLight) return;
    this.hemiLight.intensity = kf.hemiIntensity;
    this.hemiLight.diffuse = kf.hemiSkyColor;
    this.hemiLight.groundColor = kf.hemiGroundColor;
  }

  private applySky(kf: LightingKeyframe): void {
    if (!this.skyMat) return;
    this.skyMat.setColor3("zenithColor", kf.skyZenith);
    this.skyMat.setColor3("horizonColor", kf.skyHorizon);
    this.skyMat.setColor3("groundColor", kf.skyGround);
  }

  private applyFog(kf: LightingKeyframe): void {
    this.scene.fogDensity = kf.fogDensity;
  }

  private applySceneClearColor(kf: LightingKeyframe): void {
    // Match clear color to horizon for seamless background
    this.scene.clearColor.r = kf.skyHorizon.r;
    this.scene.clearColor.g = kf.skyHorizon.g;
    this.scene.clearColor.b = kf.skyHorizon.b;
  }

  /**
   * Smoothly fade street lights on at dusk and off at dawn.
   * Also updates the globe emissive material to glow when the light is on.
   */
  private applyStreetLights(hour: number): void {
    if (this.streetLights.length === 0) return;

    // Compute brightness factor: 0 = off (daytime), 1 = full (nighttime)
    let factor = 0;
    const { LIGHTS_ON_START, LIGHTS_ON_FULL, LIGHTS_OFF_START, LIGHTS_OFF_FULL } = DayNightCycle;

    if (hour >= LIGHTS_ON_FULL || hour < LIGHTS_OFF_START) {
      // Full night
      factor = 1;
    } else if (hour >= LIGHTS_ON_START && hour < LIGHTS_ON_FULL) {
      // Dusk transition — fade on
      factor = (hour - LIGHTS_ON_START) / (LIGHTS_ON_FULL - LIGHTS_ON_START);
    } else if (hour >= LIGHTS_OFF_START && hour < LIGHTS_OFF_FULL) {
      // Dawn transition — fade off
      factor = 1 - (hour - LIGHTS_OFF_START) / (LIGHTS_OFF_FULL - LIGHTS_OFF_START);
    }
    // else: daytime, factor stays 0

    const shouldBeOn = factor > 0.01;
    const intensity = this.streetLightBaseIntensity * factor;

    for (const light of this.streetLights) {
      if (light.isEnabled() !== shouldBeOn) {
        light.setEnabled(shouldBeOn);
      }
      if (shouldBeOn) {
        light.intensity = intensity;
      }

      // Update globe emissive glow to match light state
      const globeMesh = this.scene.getMeshByName(light.name.replace('_light', '_globe'));
      if (globeMesh?.material) {
        const mat = globeMesh.material as StandardMaterial;
        if (mat.emissiveColor) {
          const warmColor = light.diffuse;
          mat.emissiveColor.r = warmColor.r * factor * 0.8;
          mat.emissiveColor.g = warmColor.g * factor * 0.8;
          mat.emissiveColor.b = warmColor.b * factor * 0.8;
        }
      }
    }
  }

  dispose(): void {
    this.sun = null;
    this.hemiLight = null;
    this.skyMat = null;
    this.streetLights = [];
  }
}
