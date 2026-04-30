import type { TTSProvider, TTSProviderCallbacks, TTSVoiceOptions } from './types.js';

/**
 * ServerTTSProvider — marker provider for server-side TTS.
 *
 * When chat provider is 'server', audio arrives inline in the chat stream
 * (SSE/WS audio events). This provider is a no-op marker that tells the
 * InsimulClient orchestrator NOT to synthesize separately.
 */
export class ServerTTSProvider implements TTSProvider {
  readonly type = 'server' as const;

  async initialize(): Promise<void> {}
  isSupported(): boolean { return true; }
  isReady(): boolean { return true; }
  setCallbacks(_callbacks: TTSProviderCallbacks): void {}
  setVoice(_options: TTSVoiceOptions): void {}

  async synthesize(_text: string): Promise<null> {
    // Audio comes from the server chat stream — no separate synthesis needed
    return null;
  }

  abort(): void {}
  async dispose(): Promise<void> {}
}
