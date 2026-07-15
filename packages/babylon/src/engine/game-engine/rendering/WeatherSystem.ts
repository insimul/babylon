/**
 * WeatherSystem — Manages rain, clouds, fog, and atmospheric effects.
 *
 * Integrates with GameTimeManager for time-of-day-aware weather and
 * the sky dome shader for atmospheric color shifts during weather events.
 */

import {
  Color3,
  Color4,
  MeshBuilder,
  Mesh,
  ParticleSystem,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

// ── Weather types ───────────────────────────────────────────────────────────

export type WeatherType = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'storm';

export interface WeatherState {
  type: WeatherType;
  intensity: number;       // 0-1, affects particle count, fog density, etc.
  windSpeed: number;       // 0-1, affects rain angle and cloud movement
  windDirection: number;   // radians
  fogDensity: number;      // 0-1
  cloudCoverage: number;   // 0-1
}

export interface WeatherSystemOptions {
  /** Auto-transition between weather states over time. Default true. */
  autoTransition?: boolean;
  /** Minimum seconds between weather changes. Default 120. */
  minTransitionInterval?: number;
  /** Maximum seconds between weather changes. Default 300. */
  maxTransitionInterval?: number;
}

// ── Cloud layer config ──────────────────────────────────────────────────────

const CLOUD_LAYER_Y = 80;
const CLOUD_LAYER_RADIUS = 200;
const MAX_CLOUDS = 12;

// ── Rain config ─────────────────────────────────────────────────────────────

const RAIN_EMITTER_HEIGHT = 60;
const MAX_RAIN_RATE = 2000;
const RAIN_LIFETIME_MIN = 0.8;
const RAIN_LIFETIME_MAX = 1.5;

// ── Weather transition weights ──────────────────────────────────────────────

const WEATHER_TRANSITIONS: Record<WeatherType, Partial<Record<WeatherType, number>>> = {
  clear:    { clear: 3, cloudy: 2 },
  cloudy:   { clear: 2, cloudy: 2, overcast: 2, rain: 1 },
  overcast: { cloudy: 2, overcast: 2, rain: 2 },
  rain:     { overcast: 2, rain: 2, storm: 1 },
  storm:    { rain: 3, overcast: 1 },
};

const WEATHER_DEFAULTS: Record<WeatherType, Omit<WeatherState, 'type'>> = {
  clear:    { intensity: 0, windSpeed: 0.1, windDirection: 0, fogDensity: 0, cloudCoverage: 0.1 },
  cloudy:   { intensity: 0, windSpeed: 0.2, windDirection: 0, fogDensity: 0.05, cloudCoverage: 0.4 },
  overcast: { intensity: 0, windSpeed: 0.3, windDirection: 0, fogDensity: 0.15, cloudCoverage: 0.7 },
  rain:     { intensity: 0.5, windSpeed: 0.4, windDirection: 0, fogDensity: 0.25, cloudCoverage: 0.8 },
  storm:    { intensity: 1.0, windSpeed: 0.8, windDirection: 0, fogDensity: 0.4, cloudCoverage: 1.0 },
};

// ── WeatherSystem ───────────────────────────────────────────────────────────

export class WeatherSystem {
  private scene: Scene;
  private options: Required<WeatherSystemOptions>;

  // State
  private _current: WeatherState;
  private _target: WeatherState;
  private _transitionProgress: number = 1; // 1 = fully at target
  private _transitionDuration: number = 10; // seconds to blend
  private _nextChangeTimer: number = 0;
  private _elapsedSinceChange: number = 0;

  // Visual elements
  private cloudMeshes: Mesh[] = [];
  private cloudMaterial: StandardMaterial | null = null;
  private rainParticles: ParticleSystem | null = null;
  private _playerPosition: Vector3 = Vector3.Zero();

  // Fog state
  private _originalFogEnabled: boolean = false;
  private _disposed: boolean = false;

  constructor(scene: Scene, options: WeatherSystemOptions = {}) {
    this.scene = scene;
    this.options = {
      autoTransition: options.autoTransition ?? true,
      minTransitionInterval: options.minTransitionInterval ?? 120,
      maxTransitionInterval: options.maxTransitionInterval ?? 300,
    };

    const initial: WeatherType = 'clear';
    this._current = { type: initial, ...WEATHER_DEFAULTS[initial] };
    this._target = { ...this._current };
    this._nextChangeTimer = this.randomInterval();

    this._originalFogEnabled = scene.fogEnabled;

    this.createClouds();
    this.createRainParticles();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  get currentWeather(): WeatherState {
    return { ...this._current };
  }

  get weatherType(): WeatherType {
    return this._current.type;
  }

  /** Force a specific weather state (bypasses auto-transition timer). */
  setWeather(type: WeatherType, transitionSeconds: number = 10): void {
    const defaults = WEATHER_DEFAULTS[type];
    this._target = {
      type,
      ...defaults,
      windDirection: Math.random() * Math.PI * 2,
    };
    this._transitionProgress = 0;
    this._transitionDuration = Math.max(0.1, transitionSeconds);
    this._elapsedSinceChange = 0;
    this._nextChangeTimer = this.randomInterval();
  }

  /** Update player position so rain follows the camera. */
  setPlayerPosition(pos: Vector3): void {
    this._playerPosition.copyFrom(pos);
  }

  /** Call every frame with delta time in milliseconds. */
  update(deltaMs: number): void {
    if (this._disposed) return;
    const dt = deltaMs / 1000;

    // Auto-transition timer
    if (this.options.autoTransition && this._transitionProgress >= 1) {
      this._elapsedSinceChange += dt;
      if (this._elapsedSinceChange >= this._nextChangeTimer) {
        this.transitionToRandom();
      }
    }

    // Blend current → target
    if (this._transitionProgress < 1) {
      this._transitionProgress = Math.min(1, this._transitionProgress + dt / this._transitionDuration);
      const t = smoothstep(this._transitionProgress);
      this._current = lerpWeatherState(this._current, this._target, t);
      if (this._transitionProgress >= 1) {
        this._current.type = this._target.type;
      }
    }

    this.updateClouds(dt);
    this.updateRain();
    this.updateFog();
    this.updateLighting();
  }

  /** Get sky color multiplier based on current weather (darken sky for storms). */
  getSkyDarkening(): number {
    // 1.0 = no darkening (clear), 0.4 = maximum darkening (storm)
    return 1.0 - this._current.cloudCoverage * 0.6;
  }

  /** Get a fog color tinted by weather. */
  getFogColor(): Color3 {
    const gray = 0.7 - this._current.cloudCoverage * 0.3;
    return new Color3(gray, gray, gray + 0.02);
  }

  dispose(): void {
    this._disposed = true;
    this.rainParticles?.dispose();
    this.rainParticles = null;
    for (const cloud of this.cloudMeshes) {
      cloud.dispose();
    }
    this.cloudMeshes = [];
    this.cloudMaterial?.dispose();
    this.cloudMaterial = null;

    // Restore fog state
    this.scene.fogEnabled = this._originalFogEnabled;
  }

  // ── Cloud creation & update ─────────────────────────────────────────────

  private createClouds(): void {
    this.cloudMaterial = new StandardMaterial("cloud-mat", this.scene);
    this.cloudMaterial.diffuseColor = new Color3(0.95, 0.95, 0.97);
    this.cloudMaterial.emissiveColor = new Color3(0.6, 0.6, 0.65);
    this.cloudMaterial.specularColor = Color3.Black();
    this.cloudMaterial.alpha = 0.7;
    this.cloudMaterial.backFaceCulling = false;

    for (let i = 0; i < MAX_CLOUDS; i++) {
      const scaleX = 15 + Math.random() * 30;
      const scaleZ = 10 + Math.random() * 20;
      const cloud = MeshBuilder.CreatePlane(`cloud-${i}`, {
        width: scaleX,
        height: scaleZ,
      }, this.scene);

      cloud.rotation.x = Math.PI / 2; // face down
      cloud.material = this.cloudMaterial;
      cloud.isPickable = false;
      cloud.checkCollisions = false;

      // Random position in cloud layer
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * CLOUD_LAYER_RADIUS;
      cloud.position = new Vector3(
        Math.cos(angle) * radius,
        CLOUD_LAYER_Y + Math.random() * 10,
        Math.sin(angle) * radius,
      );

      // Store drift speed in metadata
      cloud.metadata = {
        driftSpeed: 2 + Math.random() * 4,
        baseAlpha: 0.5 + Math.random() * 0.3,
      };

      this.cloudMeshes.push(cloud);
    }
  }

  private updateClouds(dt: number): void {
    const windX = Math.cos(this._current.windDirection) * this._current.windSpeed;
    const windZ = Math.sin(this._current.windDirection) * this._current.windSpeed;
    const targetAlpha = Math.min(0.85, this._current.cloudCoverage * 0.9);

    for (const cloud of this.cloudMeshes) {
      const meta = cloud.metadata as { driftSpeed: number; baseAlpha: number };

      // Drift clouds with wind
      cloud.position.x += windX * meta.driftSpeed * dt;
      cloud.position.z += windZ * meta.driftSpeed * dt;

      // Wrap clouds that drift too far
      const distSq = cloud.position.x * cloud.position.x + cloud.position.z * cloud.position.z;
      if (distSq > CLOUD_LAYER_RADIUS * CLOUD_LAYER_RADIUS * 1.5) {
        const angle = Math.random() * Math.PI * 2;
        cloud.position.x = Math.cos(angle) * CLOUD_LAYER_RADIUS * 0.5;
        cloud.position.z = Math.sin(angle) * CLOUD_LAYER_RADIUS * 0.5;
      }

      // Adjust cloud visibility based on coverage
      cloud.visibility = targetAlpha * meta.baseAlpha;
    }

    // Cloud material color: darken for storms
    if (this.cloudMaterial) {
      const brightness = 0.95 - this._current.intensity * 0.35;
      this.cloudMaterial.diffuseColor.r = brightness;
      this.cloudMaterial.diffuseColor.g = brightness;
      this.cloudMaterial.diffuseColor.b = brightness + 0.02;
      this.cloudMaterial.emissiveColor.r = brightness * 0.6;
      this.cloudMaterial.emissiveColor.g = brightness * 0.6;
      this.cloudMaterial.emissiveColor.b = brightness * 0.65;
    }
  }

  // ── Rain particles ──────────────────────────────────────────────────────

  private createRainParticles(): void {
    this.rainParticles = new ParticleSystem("rain", MAX_RAIN_RATE, this.scene);

    // Use a simple white pixel texture for rain streaks
    this.rainParticles.createPointEmitter(
      new Vector3(-0.5, -1, -0.5),
      new Vector3(0.5, -1, 0.5),
    );

    // Rain appearance
    this.rainParticles.color1 = new Color4(0.7, 0.75, 0.85, 0.6);
    this.rainParticles.color2 = new Color4(0.6, 0.65, 0.8, 0.4);
    this.rainParticles.colorDead = new Color4(0.5, 0.55, 0.65, 0);

    this.rainParticles.minSize = 0.02;
    this.rainParticles.maxSize = 0.06;

    // Stretch particles vertically for rain streak look
    this.rainParticles.minScaleX = 0.02;
    this.rainParticles.maxScaleX = 0.04;
    this.rainParticles.minScaleY = 0.8;
    this.rainParticles.maxScaleY = 1.5;

    this.rainParticles.minLifeTime = RAIN_LIFETIME_MIN;
    this.rainParticles.maxLifeTime = RAIN_LIFETIME_MAX;

    this.rainParticles.emitRate = 0; // Start with no rain
    this.rainParticles.gravity = new Vector3(0, -30, 0);

    // Spread rain over area around player
    this.rainParticles.minEmitBox = new Vector3(-30, 0, -30);
    this.rainParticles.maxEmitBox = new Vector3(30, 0, 30);

    this.rainParticles.emitter = new Vector3(0, RAIN_EMITTER_HEIGHT, 0);

    this.rainParticles.start();
  }

  private updateRain(): void {
    if (!this.rainParticles) return;

    const isRaining = this._current.type === 'rain' || this._current.type === 'storm';
    const targetRate = isRaining ? this._current.intensity * MAX_RAIN_RATE : 0;

    // Smoothly adjust emit rate
    const currentRate = this.rainParticles.emitRate;
    this.rainParticles.emitRate = currentRate + (targetRate - currentRate) * 0.05;

    // Wind affects rain direction
    const windInfluence = this._current.windSpeed * 15;
    this.rainParticles.gravity.x = Math.cos(this._current.windDirection) * windInfluence;
    this.rainParticles.gravity.z = Math.sin(this._current.windDirection) * windInfluence;

    // Follow player position
    (this.rainParticles.emitter as Vector3).x = this._playerPosition.x;
    (this.rainParticles.emitter as Vector3).z = this._playerPosition.z;

    // Storm: bigger, faster drops
    if (this._current.type === 'storm') {
      this.rainParticles.gravity.y = -45;
      this.rainParticles.maxScaleY = 2.0;
    } else {
      this.rainParticles.gravity.y = -30;
      this.rainParticles.maxScaleY = 1.5;
    }
  }

  // ── Fog ─────────────────────────────────────────────────────────────────

  private updateFog(): void {
    if (this._current.fogDensity > 0.01) {
      this.scene.fogEnabled = true;
      this.scene.fogMode = Scene.FOGMODE_EXP2;
      this.scene.fogDensity = this._current.fogDensity * 0.008;
      const fogColor = this.getFogColor();
      this.scene.fogColor = fogColor;
    } else {
      this.scene.fogEnabled = false;
    }
  }

  // ── Lighting adjustments ────────────────────────────────────────────────

  private updateLighting(): void {
    // Find the sun directional light if it exists
    const sun = this.scene.getLightByName("sun");
    const hemi = this.scene.getLightByName("hemi-light");

    const darkening = this.getSkyDarkening();

    if (sun) {
      sun.intensity = 1.1 * darkening;
    }
    if (hemi) {
      hemi.intensity = 0.7 * darkening;
    }
  }

  // ── Auto-transition logic ───────────────────────────────────────────────

  private transitionToRandom(): void {
    const transitions = WEATHER_TRANSITIONS[this._current.type];
    const next = weightedRandom(transitions);
    this.setWeather(next, 8 + Math.random() * 12);
  }

  private randomInterval(): number {
    const { minTransitionInterval, maxTransitionInterval } = this.options;
    return minTransitionInterval + Math.random() * (maxTransitionInterval - minTransitionInterval);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpWeatherState(a: WeatherState, b: WeatherState, t: number): WeatherState {
  return {
    type: t < 0.5 ? a.type : b.type,
    intensity: a.intensity + (b.intensity - a.intensity) * t,
    windSpeed: a.windSpeed + (b.windSpeed - a.windSpeed) * t,
    windDirection: lerpAngle(a.windDirection, b.windDirection, t),
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
    cloudCoverage: a.cloudCoverage + (b.cloudCoverage - a.cloudCoverage) * t,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  // Normalize delta to [-PI, PI]
  delta = delta - Math.floor((delta + Math.PI) / (Math.PI * 2)) * Math.PI * 2;
  return a + delta * t;
}

function weightedRandom(weights: Partial<Record<WeatherType, number>>): WeatherType {
  const entries = Object.entries(weights) as [WeatherType, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [type, weight] of entries) {
    r -= weight;
    if (r <= 0) return type;
  }
  return entries[0][0];
}

// Export helpers for testing
export { smoothstep, lerpWeatherState, lerpAngle, weightedRandom, WEATHER_DEFAULTS, WEATHER_TRANSITIONS };
