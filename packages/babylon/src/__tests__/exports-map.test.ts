/**
 * US-BC1 — Exports-map guard for @insimul/babylon.
 *
 * The consolidation gives web creators ONE package with well-known subpath entry
 * points. This test imports each declared subpath the way a consumer would (via the
 * `@insimul/babylon` specifier, resolved through the alias that mirrors the package's
 * exports map) and asserts the public surface is actually reachable there. If a future
 * story moves a file without updating the exports map / barrel, this fails.
 *
 * Subpaths land incrementally: conversation (US-BC1), then data (US-BC2), engine
 * (US-BC3), templates (US-BC2/US-BC4). Extend the assertions as each arrives.
 */
import { describe, it, expect } from 'vitest';

describe('@insimul/babylon exports map', () => {
  it('root entry re-exports the conversation SDK', async () => {
    const root = await import('@insimul/babylon');
    expect(typeof root.InsimulClient).toBe('function');
    expect(typeof root.StreamingAudioPlayer).toBe('function');
  });

  it('./conversation subpath carries the conversation SDK', async () => {
    const convo = await import('@insimul/babylon/conversation');
    expect(typeof convo.InsimulClient).toBe('function');
    expect(typeof convo.MicCapture).toBe('function');
    expect(typeof convo.detectBestChatProvider).toBe('function');
    // Providers are constructible classes.
    expect(typeof convo.ServerChatProvider).toBe('function');
    expect(typeof convo.NoneTTSProvider).toBe('function');
  });

  it('deep ./conversation/* subpaths resolve (exports-map glob)', async () => {
    const detect = await import('@insimul/babylon/conversation/detect.js');
    expect(typeof detect.isWebGPUAvailable).toBe('function');
    const player = await import('@insimul/babylon/conversation/audio/streaming-audio-player.js');
    expect(typeof player.StreamingAudioPlayer).toBe('function');
  });

  it('./data subpath carries the save/data/loading layer (US-BC2)', async () => {
    const data = await import('@insimul/babylon/data');
    // Core data/save runtime values are flat on the barrel. (`DataSource` itself is a
    // type-only interface — the concrete impls are ApiDataSource/FileDataSource and the
    // factory is createDataSource.)
    expect(typeof data.ApiDataSource).toBe('function');
    expect(typeof data.createDataSource).toBe('function');
    expect(typeof data.SaveFileDataSource).toBe('function');
    expect(typeof data.WorldStateManager).toBe('function');
    expect(typeof data.SaveQueue).toBe('function');
    // Optimization/diagnostics toolkits are namespaced (they share symbol names).
    expect(typeof data.startupOrchestrator.StartupOrchestrator).toBe('function');
    expect(typeof data.resourceProfiler.ResourceProfiler).toBe('function');
  });

  it('deep ./data/* subpaths resolve (exports-map glob)', async () => {
    const sf = await import('@insimul/babylon/data/SaveFileDataSource.js');
    expect(typeof sf.SaveFileDataSource).toBe('function');
    const orch = await import('@insimul/babylon/data/optimization/StartupOrchestrator.js');
    expect(typeof orch.StartupOrchestrator).toBe('function');
    const rp = await import('@insimul/babylon/data/diagnostics/ResourceProfiler.js');
    expect(typeof rp.ResourceProfiler).toBe('function');
  });

  it('./data barrel is React-free — the React entry points are deep-import only (US-BC2)', async () => {
    // Importing the barrel must NOT require the optional `react` peer, so the
    // React-touching entry points (BabylonWorld, LoadingScreen, the migration modal)
    // are intentionally absent from it — reach them via their deep subpaths.
    const data = await import('@insimul/babylon/data');
    expect('BabylonWorld' in data).toBe(false);
    expect('LoadingScreen' in data).toBe(false);
  });
});

describe('legacy @insimul/typescript shims still resolve to the moved SDK', () => {
  it('the old package index re-exports the same InsimulClient', async () => {
    const [shim, convo] = await Promise.all([
      import('@insimul/typescript'),
      import('@insimul/babylon/conversation'),
    ]);
    expect(shim.InsimulClient).toBe(convo.InsimulClient);
    expect(shim.StreamingAudioPlayer).toBe(convo.StreamingAudioPlayer);
  });
});

describe('legacy @insimul/babylon-game shims still resolve to the moved data layer (US-BC2)', () => {
  it('subpath shims re-export the same classes now living in @insimul/babylon/data', async () => {
    const [sfShim, wsmShim, rpShim, data] = await Promise.all([
      import('@insimul/babylon-game/SaveFileDataSource'),
      import('@insimul/babylon-game/WorldStateManager'),
      import('@insimul/babylon-game/diagnostics/ResourceProfiler'),
      import('@insimul/babylon/data'),
    ]);
    expect(sfShim.SaveFileDataSource).toBe(data.SaveFileDataSource);
    expect(wsmShim.WorldStateManager).toBe(data.WorldStateManager);
    // Namespaced on the barrel, flat on the deep module — identity holds through both.
    expect(rpShim.ResourceProfiler).toBe(data.resourceProfiler.ResourceProfiler);
  });
});
