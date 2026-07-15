import type { STTProvider, STTProviderCallbacks } from './types.js';

/** No-op STT provider — speech-to-text disabled. */
export class NoneSTTProvider implements STTProvider {
  readonly type = 'none' as const;

  async initialize(): Promise<void> {}
  isSupported(): boolean { return true; }
  isReady(): boolean { return true; }
  setCallbacks(_callbacks: STTProviderCallbacks): void {}
  async transcribe(_audioBlob: Blob, _languageCode?: string): Promise<string> { return ''; }
  abort(): void {}
  async dispose(): Promise<void> {}
}
