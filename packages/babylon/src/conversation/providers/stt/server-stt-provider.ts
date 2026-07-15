import type { STTProvider, STTProviderCallbacks } from './types.js';

/**
 * ServerSTTProvider — sends audio to the Insimul server for transcription.
 *
 * When using the server chat provider, STT is handled as part of the
 * sendAudio() pipeline (multipart POST to /api/conversation/stream-audio).
 * This provider is used for standalone transcription calls.
 */
export class ServerSTTProvider implements STTProvider {
  readonly type = 'server' as const;

  private serverUrl: string;
  private apiKey?: string;
  private callbacks: STTProviderCallbacks = {};

  constructor(serverUrl: string, apiKey?: string) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
  }

  async initialize(): Promise<void> {}
  isSupported(): boolean { return true; }
  isReady(): boolean { return true; }
  setCallbacks(callbacks: STTProviderCallbacks): void { this.callbacks = callbacks; }

  async transcribe(audioBlob: Blob, languageCode?: string): Promise<string> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (languageCode) formData.append('languageCode', languageCode);

    try {
      const response = await fetch(`${this.serverUrl}/api/stt`, {
        method: 'POST',
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`STT server returned ${response.status}`);
      }

      const result = await response.json();
      const transcript = result.transcript || '';
      this.callbacks.onTranscript?.(transcript, true);
      return transcript;
    } catch (err: any) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      return '';
    }
  }

  abort(): void {}
  async dispose(): Promise<void> {}
}
