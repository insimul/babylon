export type QualityPreset = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type TextureQuality = 'low' | 'medium' | 'high';
export type AntiAliasingMode = 'off' | 'fxaa' | 'msaa';

export interface PerformanceSettings {
  preset: QualityPreset;
  maxNPCs: number;
  drawDistance: number;
  shadowQuality: ShadowQuality;
  textureQuality: TextureQuality;
  resolutionScale: number;
  antiAliasing: AntiAliasingMode;
  postProcessing: boolean;
}

export interface HardwareInfo {
  deviceMemoryGB: number | null;
  cpuCores: number | null;
  isMobile: boolean;
  webgl2: boolean;
  pixelRatio: number;
  rendererString: string | null;
}

export const QUALITY_PRESETS: QualityPreset[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

export const PRESET_DESCRIPTIONS: Record<QualityPreset, string> = {
  minimal: 'Smallest footprint. Use this if the game is unplayable at Low.',
  low: 'Runs on <2GB RAM or mobile. Reduced NPCs, no shadows, low textures.',
  medium: '2GB+ RAM. Balanced NPC density and shadow quality.',
  high: '4GB+ RAM, integrated GPU. Full NPCs, medium shadows, AA enabled.',
  ultra: '8GB+ RAM, dedicated GPU. All effects enabled.',
};

export const PRESET_CONFIGS: Record<QualityPreset, Omit<PerformanceSettings, 'preset'>> = {
  minimal: {
    maxNPCs: 8,
    drawDistance: 40,
    shadowQuality: 'off',
    textureQuality: 'low',
    resolutionScale: 0.5,
    antiAliasing: 'off',
    postProcessing: false,
  },
  low: {
    maxNPCs: 15,
    drawDistance: 60,
    shadowQuality: 'off',
    textureQuality: 'low',
    resolutionScale: 0.75,
    antiAliasing: 'off',
    postProcessing: false,
  },
  medium: {
    maxNPCs: 30,
    drawDistance: 100,
    shadowQuality: 'low',
    textureQuality: 'medium',
    resolutionScale: 1.0,
    antiAliasing: 'fxaa',
    postProcessing: false,
  },
  high: {
    maxNPCs: 60,
    drawDistance: 150,
    shadowQuality: 'medium',
    textureQuality: 'high',
    resolutionScale: 1.0,
    antiAliasing: 'fxaa',
    postProcessing: true,
  },
  ultra: {
    maxNPCs: 100,
    drawDistance: 250,
    shadowQuality: 'high',
    textureQuality: 'high',
    resolutionScale: 1.0,
    antiAliasing: 'msaa',
    postProcessing: true,
  },
};

export const STORAGE_KEY = 'insimul_performance_settings';

export function settingsForPreset(preset: QualityPreset): PerformanceSettings {
  return { preset, ...PRESET_CONFIGS[preset] };
}

export function clampSettings(s: PerformanceSettings): PerformanceSettings {
  return {
    ...s,
    maxNPCs: Math.max(0, Math.min(200, Math.round(s.maxNPCs))),
    drawDistance: Math.max(20, Math.min(500, Math.round(s.drawDistance))),
    resolutionScale: Math.max(0.25, Math.min(2.0, Number(s.resolutionScale.toFixed(2)))),
  };
}

export function isQualityPreset(v: unknown): v is QualityPreset {
  return typeof v === 'string' && (QUALITY_PRESETS as string[]).includes(v);
}

function isShadowQuality(v: unknown): v is ShadowQuality {
  return v === 'off' || v === 'low' || v === 'medium' || v === 'high';
}

function isTextureQuality(v: unknown): v is TextureQuality {
  return v === 'low' || v === 'medium' || v === 'high';
}

function isAAMode(v: unknown): v is AntiAliasingMode {
  return v === 'off' || v === 'fxaa' || v === 'msaa';
}

export function parseSettings(raw: unknown): PerformanceSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isQualityPreset(o.preset)) return null;
  const defaults = settingsForPreset(o.preset);
  const merged: PerformanceSettings = {
    preset: o.preset,
    maxNPCs: typeof o.maxNPCs === 'number' && Number.isFinite(o.maxNPCs) ? o.maxNPCs : defaults.maxNPCs,
    drawDistance:
      typeof o.drawDistance === 'number' && Number.isFinite(o.drawDistance) ? o.drawDistance : defaults.drawDistance,
    shadowQuality: isShadowQuality(o.shadowQuality) ? o.shadowQuality : defaults.shadowQuality,
    textureQuality: isTextureQuality(o.textureQuality) ? o.textureQuality : defaults.textureQuality,
    resolutionScale:
      typeof o.resolutionScale === 'number' && Number.isFinite(o.resolutionScale)
        ? o.resolutionScale
        : defaults.resolutionScale,
    antiAliasing: isAAMode(o.antiAliasing) ? o.antiAliasing : defaults.antiAliasing,
    postProcessing: typeof o.postProcessing === 'boolean' ? o.postProcessing : defaults.postProcessing,
  };
  return clampSettings(merged);
}

export function detectHardware(): HardwareInfo {
  if (typeof navigator === 'undefined') {
    return {
      deviceMemoryGB: null,
      cpuCores: null,
      isMobile: false,
      webgl2: false,
      pixelRatio: 1,
      rendererString: null,
    };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent ?? '');

  let webgl2 = false;
  let rendererString: string | null = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
      if (gl) {
        webgl2 = true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          rendererString = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cpuCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    isMobile,
    webgl2,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    rendererString,
  };
}

export function autoSelectPreset(hw: HardwareInfo): QualityPreset {
  if (hw.isMobile) {
    if ((hw.deviceMemoryGB ?? 0) >= 4) return 'low';
    return 'minimal';
  }
  const ram = hw.deviceMemoryGB;
  const cores = hw.cpuCores ?? 0;
  if (ram == null) {
    // Unknown RAM — use core count as a rough signal.
    if (cores >= 8) return 'high';
    if (cores >= 4) return 'medium';
    return 'low';
  }
  if (ram >= 8 && cores >= 8) return 'ultra';
  if (ram >= 4) return 'high';
  if (ram >= 2) return 'medium';
  return 'low';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // ignore
  }
  return null;
}

export function loadSettings(storage: StorageLike | null = getStorage()): PerformanceSettings | null {
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSettings(settings: PerformanceSettings, storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(clampSettings(settings)));
}

export function clearSettings(storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

export type SettingsListener = (settings: PerformanceSettings) => void;

const listeners = new Set<SettingsListener>();

export function subscribeSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSettings(settings: PerformanceSettings): void {
  listeners.forEach((l) => {
    try {
      l(settings);
    } catch (err) {
      console.error('[PerformanceSettings] listener error', err);
    }
  });
}

export function resolveInitialSettings(): { settings: PerformanceSettings; autoSelected: boolean; hardware: HardwareInfo } {
  const hardware = detectHardware();
  const stored = loadSettings();
  if (stored) {
    return { settings: stored, autoSelected: false, hardware };
  }
  const preset = autoSelectPreset(hardware);
  return { settings: settingsForPreset(preset), autoSelected: true, hardware };
}
