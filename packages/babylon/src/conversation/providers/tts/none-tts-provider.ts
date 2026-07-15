import type { TTSProvider, TTSProviderCallbacks, TTSVoiceOptions } from './types.js';

/** No-op TTS provider — TTS disabled. */
export class NoneTTSProvider implements TTSProvider {
  readonly type = 'none' as const;

  async initialize(): Promise<void> {}
  isSupported(): boolean { return true; }
  isReady(): boolean { return true; }
  setCallbacks(_callbacks: TTSProviderCallbacks): void {}
  setVoice(_options: TTSVoiceOptions): void {}
  async synthesize(_text: string): Promise<null> { return null; }
  abort(): void {}
  async dispose(): Promise<void> {}
}
