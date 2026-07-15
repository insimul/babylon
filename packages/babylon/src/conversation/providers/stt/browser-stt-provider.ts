/**
 * BrowserSTTProvider — speech-to-text via Web Speech API.
 *
 * Uses webkitSpeechRecognition / SpeechRecognition for live transcription.
 * For Blob-based transcription, converts to a live mic replay (limited by browser APIs).
 */

import type { STTProvider, STTProviderCallbacks } from './types.js';

export class BrowserSTTProvider implements STTProvider {
  readonly type = 'browser' as const;

  private callbacks: STTProviderCallbacks = {};
  private recognition: any = null;

  async initialize(): Promise<void> {}

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  isReady(): boolean { return this.isSupported(); }

  setCallbacks(callbacks: STTProviderCallbacks): void { this.callbacks = callbacks; }

  async transcribe(_audioBlob: Blob, _languageCode?: string): Promise<string> {
    // Web Speech API doesn't support Blob input — it only works with live microphone.
    // For Blob transcription, the server STT provider should be used instead.
    console.warn('[BrowserSTT] Web Speech API does not support Blob transcription. Use live transcription or server STT.');
    return '';
  }

  startLiveTranscription(languageCode?: string): void {
    if (!this.isSupported()) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = languageCode || 'en-US';

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }

      this.callbacks.onTranscript?.(transcript, isFinal);
    };

    this.recognition.onerror = (event: any) => {
      this.callbacks.onError?.(new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.start();
  }

  stopLiveTranscription(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  abort(): void {
    this.stopLiveTranscription();
  }

  async dispose(): Promise<void> {
    this.abort();
  }
}
