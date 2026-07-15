/**
 * HardwareDetector — detect hardware capabilities and pick a quality preset.
 *
 * Runs at game startup. Reads from `navigator`, `screen`, and a throwaway WebGL
 * context. The picked preset is persisted in `localStorage`; callers can
 * override manually and we respect that on subsequent sessions.
 *
 * All DOM globals are accessed defensively so the module stays importable in
 * node/tests — pass mock globals via `detectCapabilities({ globals })` to
 * exercise the selection logic without a real browser.
 */

export type QualityPresetName = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type AntiAliasingMode = 'none' | 'fxaa' | 'msaa2x' | 'msaa4x';
export type TerrainDetail = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
export type GpuTier = 'high' | 'medium' | 'low' | 'unknown';

export interface QualityPreset {
  name: QualityPresetName;
  label: string;
  description: string;
  maxNPCCount: number;
  textureResolutionMultiplier: number;
  shadowQuality: ShadowQuality;
  drawDistance: number;
  lodDistances: { near: number; medium: number; far: number };
  terrainDetail: TerrainDetail;
  particleEffects: boolean;
  antiAliasing: AntiAliasingMode;
  postProcessing: boolean;
  resolutionScale: number;
}

export interface HardwareCapabilities {
  deviceMemoryGB: number | null;
  cpuCores: number | null;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  isMobile: boolean;
  webgl2Supported: boolean;
  webglSupported: boolean;
  maxTextureSize: number | null;
  maxViewportDims: [number, number] | null;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  gpuTier: GpuTier;
}

export interface DetectorGlobals {
  navigator?: Navigator & { deviceMemory?: number };
  screen?: Screen;
  window?: Window;
  document?: Document;
  localStorage?: Storage;
}

export interface DetectOptions {
  /** Optional canvas to reuse; otherwise a detached one is created. */
  canvas?: HTMLCanvasElement;
  /** Override globals — primarily for tests. */
  globals?: DetectorGlobals;
}

const STORAGE_KEY = 'insimul:quality-preset';

export const QUALITY_PRESETS: Record<QualityPresetName, QualityPreset> = {
  ultra: {
    name: 'ultra',
    label: 'Ultra',
    description: '8GB+ RAM with a dedicated GPU. Full effects, max draw distance.',
    maxNPCCount: 100,
    textureResolutionMultiplier: 1,
    shadowQuality: 'high',
    drawDistance: 300,
    lodDistances: { near: 40, medium: 120, far: 240 },
    terrainDetail: 'ultra',
    particleEffects: true,
    antiAliasing: 'msaa4x',
    postProcessing: true,
    resolutionScale: 1,
  },
  high: {
    name: 'high',
    label: 'High',
    description: '4GB+ RAM or integrated GPU. Good quality with most effects.',
    maxNPCCount: 60,
    textureResolutionMultiplier: 1,
    shadowQuality: 'medium',
    drawDistance: 200,
    lodDistances: { near: 30, medium: 80, far: 160 },
    terrainDetail: 'high',
    particleEffects: true,
    antiAliasing: 'msaa2x',
    postProcessing: true,
    resolutionScale: 1,
  },
  medium: {
    name: 'medium',
    label: 'Medium',
    description: '2GB+ RAM. Balanced quality and performance.',
    maxNPCCount: 35,
    textureResolutionMultiplier: 0.75,
    shadowQuality: 'low',
    drawDistance: 140,
    lodDistances: { near: 25, medium: 60, far: 120 },
    terrainDetail: 'medium',
    particleEffects: true,
    antiAliasing: 'fxaa',
    postProcessing: false,
    resolutionScale: 1,
  },
  low: {
    name: 'low',
    label: 'Low',
    description: 'Limited RAM or mobile. Reduced effects to keep the frame rate up.',
    maxNPCCount: 15,
    textureResolutionMultiplier: 0.5,
    shadowQuality: 'off',
    drawDistance: 90,
    lodDistances: { near: 20, medium: 45, far: 80 },
    terrainDetail: 'low',
    particleEffects: false,
    antiAliasing: 'fxaa',
    postProcessing: false,
    resolutionScale: 0.85,
  },
  minimal: {
    name: 'minimal',
    label: 'Minimal',
    description: 'Fallback for very limited devices. Only essentials rendered.',
    maxNPCCount: 6,
    textureResolutionMultiplier: 0.25,
    shadowQuality: 'off',
    drawDistance: 60,
    lodDistances: { near: 15, medium: 30, far: 50 },
    terrainDetail: 'minimal',
    particleEffects: false,
    antiAliasing: 'none',
    postProcessing: false,
    resolutionScale: 0.7,
  },
};

export const PRESET_ORDER: readonly QualityPresetName[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'ultra',
] as const;

function getGlobals(overrides?: DetectorGlobals): DetectorGlobals {
  // Passing `overrides` (even {}) opts into pure isolation so tests can
  // simulate "nothing available". With no overrides, read the real env.
  if (overrides !== undefined) return overrides;
  const env: DetectorGlobals = {};
  if (typeof navigator !== 'undefined') env.navigator = navigator as DetectorGlobals['navigator'];
  if (typeof screen !== 'undefined') env.screen = screen;
  if (typeof window !== 'undefined') env.window = window;
  if (typeof document !== 'undefined') env.document = document;
  if (typeof localStorage !== 'undefined') env.localStorage = localStorage;
  return env;
}

function detectMobile(nav?: Navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua)) return true;
  const maxTouch = (nav as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  return maxTouch > 1 && /mac/i.test(ua);
}

function readWebGLInfo(
  canvas: HTMLCanvasElement | undefined,
  doc: Document | undefined,
): Pick<
  HardwareCapabilities,
  | 'webgl2Supported'
  | 'webglSupported'
  | 'maxTextureSize'
  | 'maxViewportDims'
  | 'gpuRenderer'
  | 'gpuVendor'
> {
  const fallback = {
    webgl2Supported: false,
    webglSupported: false,
    maxTextureSize: null,
    maxViewportDims: null,
    gpuRenderer: null,
    gpuVendor: null,
  } as const;

  const targetCanvas = canvas ?? doc?.createElement('canvas');
  if (!targetCanvas) return { ...fallback };

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  let webgl2 = false;
  try {
    gl = targetCanvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) webgl2 = true;
  } catch {
    gl = null;
  }
  if (!gl) {
    try {
      gl = (targetCanvas.getContext('webgl') ||
        (targetCanvas as HTMLCanvasElement).getContext(
          'experimental-webgl',
        )) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
  }
  if (!gl) return { ...fallback };

  const maxTextureSize = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number | null) ?? null;
  const viewportParam = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as
    | Int32Array
    | number[]
    | null;
  const maxViewportDims: [number, number] | null =
    viewportParam && viewportParam.length >= 2
      ? [Number(viewportParam[0]), Number(viewportParam[1])]
      : null;

  let gpuRenderer: string | null = null;
  let gpuVendor: string | null = null;
  try {
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    if (debugExt) {
      gpuRenderer =
        (gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) as string | null) ?? null;
      gpuVendor =
        (gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) as string | null) ?? null;
    } else {
      gpuRenderer = (gl.getParameter(gl.RENDERER) as string | null) ?? null;
      gpuVendor = (gl.getParameter(gl.VENDOR) as string | null) ?? null;
    }
  } catch {
    /* ignore; WEBGL_debug_renderer_info may be blocked */
  }

  return {
    webgl2Supported: webgl2,
    webglSupported: true,
    maxTextureSize,
    maxViewportDims,
    gpuRenderer,
    gpuVendor,
  };
}

export function classifyGpu(renderer: string | null): GpuTier {
  if (!renderer) return 'unknown';
  const r = renderer.toLowerCase();

  // Known low-end / integrated / mobile chips first — these substrings can
  // coexist with 'geforce'-style strings on some laptops, so match them
  // before the high-end bucket.
  const lowPatterns = [
    'intel hd',
    'intel(r) hd',
    'intel uhd',
    'intel(r) uhd',
    'mali',
    'adreno',
    'powervr',
    'tegra',
    'swiftshader',
    'llvmpipe',
    'software',
    'microsoft basic',
  ];
  if (lowPatterns.some((p) => r.includes(p))) return 'low';

  const mediumPatterns = [
    'intel iris',
    'intel(r) iris',
    'vega',
    'gtx 9',
    'gtx 10',
    'gtx 16',
    'quadro',
    'apple gpu',
  ];
  if (mediumPatterns.some((p) => r.includes(p))) {
    // Bump dedicated Nvidia 10/16 into high-tier; iris/vega stay medium.
    if (/gtx\s?1[06]/.test(r)) return 'high';
    return 'medium';
  }

  const highPatterns = [
    'rtx',
    'radeon rx',
    'radeon pro',
    'geforce',
    'gtx 20',
    'gtx 30',
    'gtx 40',
    'apple m1',
    'apple m2',
    'apple m3',
    'apple m4',
  ];
  if (highPatterns.some((p) => r.includes(p))) return 'high';

  return 'unknown';
}

export function detectCapabilities(opts: DetectOptions = {}): HardwareCapabilities {
  const env = getGlobals(opts.globals);
  const nav = env.navigator;
  const scr = env.screen;
  const win = env.window;

  const deviceMemoryGB =
    typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0
      ? nav.deviceMemory
      : null;
  const cpuCores =
    typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
      ? nav.hardwareConcurrency
      : null;

  const screenWidth = scr?.width ?? 0;
  const screenHeight = scr?.height ?? 0;
  const devicePixelRatio =
    typeof win?.devicePixelRatio === 'number' && win.devicePixelRatio > 0
      ? win.devicePixelRatio
      : 1;

  const gl = readWebGLInfo(opts.canvas, env.document);
  const isMobile = detectMobile(nav);
  const gpuTier = classifyGpu(gl.gpuRenderer);

  return {
    deviceMemoryGB,
    cpuCores,
    screenWidth,
    screenHeight,
    devicePixelRatio,
    isMobile,
    ...gl,
    gpuTier,
  };
}

export function autoSelectPreset(caps: HardwareCapabilities): QualityPresetName {
  if (!caps.webglSupported) return 'minimal';

  if (caps.isMobile) {
    if (caps.deviceMemoryGB && caps.deviceMemoryGB >= 6 && caps.gpuTier !== 'low') {
      return 'medium';
    }
    if ((caps.deviceMemoryGB ?? 0) >= 2) return 'low';
    return 'minimal';
  }

  const mem = caps.deviceMemoryGB;
  const cores = caps.cpuCores ?? 0;
  const tier = caps.gpuTier;

  if (tier === 'low') {
    if (mem != null && mem < 2) return 'minimal';
    return 'low';
  }

  if (mem != null) {
    if (mem >= 8 && tier === 'high' && cores >= 6) return 'ultra';
    if (mem >= 4) return tier === 'high' ? 'high' : 'medium';
    if (mem >= 2) return 'medium';
    return 'low';
  }

  // Memory not reported (Firefox/Safari): lean on GPU + cores.
  if (tier === 'high' && cores >= 8) return 'ultra';
  if (tier === 'high') return 'high';
  if (tier === 'medium') return 'medium';
  if (cores >= 4) return 'medium';
  return 'low';
}

export function getStoredPreset(globals?: DetectorGlobals): QualityPresetName | null {
  const ls = getGlobals(globals).localStorage;
  if (!ls) return null;
  try {
    const value = ls.getItem(STORAGE_KEY);
    if (!value) return null;
    if ((PRESET_ORDER as readonly string[]).includes(value)) {
      return value as QualityPresetName;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredPreset(
  name: QualityPresetName | null,
  globals?: DetectorGlobals,
): void {
  const ls = getGlobals(globals).localStorage;
  if (!ls) return;
  try {
    if (name === null) {
      ls.removeItem(STORAGE_KEY);
      return;
    }
    ls.setItem(STORAGE_KEY, name);
  } catch {
    /* quota or disabled — best-effort */
  }
}

export interface ResolvedPreset {
  name: QualityPresetName;
  preset: QualityPreset;
  auto: QualityPresetName;
  source: 'stored' | 'auto';
  capabilities: HardwareCapabilities;
}

/**
 * End-to-end: detect hardware, honor any stored override, otherwise auto-pick.
 */
export function resolveQualityPreset(opts: DetectOptions = {}): ResolvedPreset {
  const capabilities = detectCapabilities(opts);
  const auto = autoSelectPreset(capabilities);
  const stored = getStoredPreset(opts.globals);
  const name = stored ?? auto;
  return {
    name,
    preset: QUALITY_PRESETS[name],
    auto,
    source: stored ? 'stored' : 'auto',
    capabilities,
  };
}

export const STORAGE_KEY_FOR_TEST = STORAGE_KEY;
