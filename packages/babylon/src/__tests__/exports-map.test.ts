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
