import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type HardwareInfo,
  type PerformanceSettings,
  QUALITY_PRESETS,
  STORAGE_KEY,
  autoSelectPreset,
  clampSettings,
  clearSettings,
  emitSettings,
  isQualityPreset,
  loadSettings,
  parseSettings,
  resolveInitialSettings,
  saveSettings,
  settingsForPreset,
  subscribeSettings,
} from '../optimization/performanceSettings';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    _store: store,
  };
}

function baseHardware(overrides: Partial<HardwareInfo> = {}): HardwareInfo {
  return {
    deviceMemoryGB: null,
    cpuCores: null,
    isMobile: false,
    webgl2: true,
    pixelRatio: 1,
    rendererString: null,
    ...overrides,
  };
}

describe('performanceSettings: preset configs', () => {
  it('exposes all five quality presets', () => {
    expect(QUALITY_PRESETS).toEqual(['minimal', 'low', 'medium', 'high', 'ultra']);
  });

  it('builds a full settings object from any preset', () => {
    for (const p of QUALITY_PRESETS) {
      const s = settingsForPreset(p);
      expect(s.preset).toBe(p);
      expect(s.maxNPCs).toBeGreaterThanOrEqual(0);
      expect(s.drawDistance).toBeGreaterThan(0);
      expect(s.resolutionScale).toBeGreaterThan(0);
    }
  });

  it('presets scale monotonically with quality', () => {
    const minimal = settingsForPreset('minimal');
    const low = settingsForPreset('low');
    const medium = settingsForPreset('medium');
    const high = settingsForPreset('high');
    const ultra = settingsForPreset('ultra');
    expect(minimal.maxNPCs).toBeLessThanOrEqual(low.maxNPCs);
    expect(low.maxNPCs).toBeLessThanOrEqual(medium.maxNPCs);
    expect(medium.maxNPCs).toBeLessThanOrEqual(high.maxNPCs);
    expect(high.maxNPCs).toBeLessThanOrEqual(ultra.maxNPCs);
    expect(minimal.drawDistance).toBeLessThanOrEqual(ultra.drawDistance);
  });

  it('minimal preset disables post-processing and shadows', () => {
    const s = settingsForPreset('minimal');
    expect(s.postProcessing).toBe(false);
    expect(s.shadowQuality).toBe('off');
  });

  it('ultra preset enables all effects', () => {
    const s = settingsForPreset('ultra');
    expect(s.postProcessing).toBe(true);
    expect(s.shadowQuality).toBe('high');
    expect(s.antiAliasing).toBe('msaa');
  });
});

describe('performanceSettings: clamping', () => {
  it('clamps NPC counts and draw distance to sane ranges', () => {
    const clamped = clampSettings({
      ...settingsForPreset('medium'),
      maxNPCs: 99999,
      drawDistance: -50,
      resolutionScale: 5,
    });
    expect(clamped.maxNPCs).toBe(200);
    expect(clamped.drawDistance).toBe(20);
    expect(clamped.resolutionScale).toBe(2);
  });

  it('rounds fractional NPCs to integers', () => {
    const clamped = clampSettings({ ...settingsForPreset('low'), maxNPCs: 15.7 });
    expect(Number.isInteger(clamped.maxNPCs)).toBe(true);
  });
});

describe('performanceSettings: parsing', () => {
  it('rejects non-object payloads', () => {
    expect(parseSettings(null)).toBeNull();
    expect(parseSettings('nope')).toBeNull();
    expect(parseSettings(42)).toBeNull();
  });

  it('rejects payloads with invalid preset', () => {
    expect(parseSettings({ preset: 'extreme' })).toBeNull();
  });

  it('fills missing fields with preset defaults', () => {
    const parsed = parseSettings({ preset: 'high' });
    expect(parsed).toEqual(settingsForPreset('high'));
  });

  it('ignores bad field values and falls back to preset defaults', () => {
    const parsed = parseSettings({
      preset: 'medium',
      maxNPCs: 'banana',
      shadowQuality: 'ultra-insane',
      postProcessing: 'yes',
    });
    expect(parsed?.maxNPCs).toBe(settingsForPreset('medium').maxNPCs);
    expect(parsed?.shadowQuality).toBe(settingsForPreset('medium').shadowQuality);
    expect(parsed?.postProcessing).toBe(settingsForPreset('medium').postProcessing);
  });

  it('preserves valid custom tweaks over preset defaults', () => {
    const parsed = parseSettings({
      preset: 'low',
      maxNPCs: 25,
      postProcessing: true,
    });
    expect(parsed?.maxNPCs).toBe(25);
    expect(parsed?.postProcessing).toBe(true);
  });
});

describe('performanceSettings: storage', () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it('returns null when no stored settings exist', () => {
    expect(loadSettings(storage)).toBeNull();
  });

  it('saves and loads settings through the given storage', () => {
    const s = settingsForPreset('high');
    saveSettings(s, storage);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadSettings(storage)).toEqual(s);
  });

  it('loadSettings returns null on corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{not-json');
    expect(loadSettings(storage)).toBeNull();
  });

  it('loadSettings returns null when stored preset is unknown', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'galactic' }));
    expect(loadSettings(storage)).toBeNull();
  });

  it('clearSettings removes stored data', () => {
    saveSettings(settingsForPreset('ultra'), storage);
    clearSettings(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadSettings(storage)).toBeNull();
  });

  it('clamps on save so corrupt input cannot persist extreme values', () => {
    const bad: PerformanceSettings = {
      ...settingsForPreset('low'),
      maxNPCs: -50,
      drawDistance: 9000,
      resolutionScale: 10,
    };
    saveSettings(bad, storage);
    const loaded = loadSettings(storage);
    expect(loaded?.maxNPCs).toBeGreaterThanOrEqual(0);
    expect(loaded?.drawDistance).toBeLessThanOrEqual(500);
    expect(loaded?.resolutionScale).toBeLessThanOrEqual(2);
  });
});

describe('performanceSettings: hardware auto-selection', () => {
  it('picks minimal for memory-constrained mobile', () => {
    expect(autoSelectPreset(baseHardware({ isMobile: true, deviceMemoryGB: 1 }))).toBe('minimal');
  });

  it('picks low for capable mobile', () => {
    expect(autoSelectPreset(baseHardware({ isMobile: true, deviceMemoryGB: 4 }))).toBe('low');
  });

  it('picks ultra for high-end desktop', () => {
    expect(autoSelectPreset(baseHardware({ deviceMemoryGB: 16, cpuCores: 16 }))).toBe('ultra');
  });

  it('picks high for mid desktop', () => {
    expect(autoSelectPreset(baseHardware({ deviceMemoryGB: 4, cpuCores: 4 }))).toBe('high');
  });

  it('picks low for <2GB desktop', () => {
    expect(autoSelectPreset(baseHardware({ deviceMemoryGB: 1, cpuCores: 2 }))).toBe('low');
  });

  it('falls back to core count when deviceMemory is unknown', () => {
    expect(autoSelectPreset(baseHardware({ deviceMemoryGB: null, cpuCores: 8 }))).toBe('high');
    expect(autoSelectPreset(baseHardware({ deviceMemoryGB: null, cpuCores: 2 }))).toBe('low');
  });
});

describe('performanceSettings: isQualityPreset', () => {
  it('accepts known presets and rejects unknown strings', () => {
    expect(isQualityPreset('ultra')).toBe(true);
    expect(isQualityPreset('extreme')).toBe(false);
    expect(isQualityPreset(42)).toBe(false);
  });
});

describe('performanceSettings: listener bus', () => {
  it('notifies subscribers on emit and stops after unsubscribe', () => {
    const spy = vi.fn();
    const unsubscribe = subscribeSettings(spy);
    const s = settingsForPreset('high');
    emitSettings(s);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(s);
    unsubscribe();
    emitSettings(s);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps other listeners running when one throws', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const u1 = subscribeSettings(bad);
    const u2 = subscribeSettings(good);
    emitSettings(settingsForPreset('medium'));
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    u1();
    u2();
    errSpy.mockRestore();
  });
});

describe('performanceSettings: resolveInitialSettings', () => {
  it('returns auto-selected settings when there is nothing stored', () => {
    const res = resolveInitialSettings();
    expect(res.settings.preset).toBeDefined();
    // No localStorage in node env → autoSelected should be true.
    expect(res.autoSelected).toBe(true);
  });
});
