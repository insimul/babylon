/**
 * STTProvider interface — speech-to-text transcription.
 *
 * Providers: server (Gemini STT), browser (Web Speech API),
 * local (Electron Whisper), or none (disabled).
 */

export interface STTProviderCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
}

export interface STTProvider {
  readonly type: 'server' | 'browser' | 'local' | 'none';

  initialize(): Promise<void>;
  isSupported(): boolean;
  isReady(): boolean;
  setCallbacks(callbacks: STTProviderCallbacks): void;

  /** Transcribe an audio blob. Returns the transcribed text. */
  transcribe(audioBlob: Blob, languageCode?: string): Promise<string>;

  /** Start continuous/live transcription (if supported by the provider). */
  startLiveTranscription?(languageCode?: string): void;

  /** Stop continuous transcription. */
  stopLiveTranscription?(): void;

  abort(): void;
  dispose(): Promise<void>;
}
