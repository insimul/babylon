/**
 * Browser Web Speech API wrapper for instant speech-to-text.
 * Falls back to server-side STT (/api/stt) when the API is unavailable.
 */

// Web Speech API type declarations for environments where lib.dom doesn't include them
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string; readonly confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventInit {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface NativeSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventInit) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionOptions {
  /** BCP-47 language code, e.g. "en-US", "es-ES" */
  lang?: string;
  /** Show interim (partial) results as user speaks */
  interimResults?: boolean;
  /** Keep listening after each result (continuous mode) */
  continuous?: boolean;
  /** Called with partial transcript while user is still speaking */
  onInterimResult?: (transcript: string) => void;
  /** Called with final transcript when speech segment ends */
  onFinalResult?: (transcript: string) => void;
  /** Called on any error */
  onError?: (error: string) => void;
  /** Called when recognition starts */
  onStart?: () => void;
  /** Called when recognition ends */
  onEnd?: () => void;
}

/**
 * Check if the browser supports the Web Speech API for recognition.
 */
export function isSpeechRecognitionSupported(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/**
 * Framework-agnostic speech recognition service using the Web Speech API.
 * Can be used directly in Babylon.js panels or wrapped in a React hook.
 */
export class SpeechRecognitionService {
  private recognition: NativeSpeechRecognition | null = null;
  private _isListening = false;
  private options: SpeechRecognitionOptions;

  constructor(options: SpeechRecognitionOptions = {}) {
    this.options = options;
  }

  get isListening(): boolean {
    return this._isListening;
  }

  get isSupported(): boolean {
    return isSpeechRecognitionSupported();
  }

  /** Update options (e.g. language) without recreating the service */
  updateOptions(opts: Partial<SpeechRecognitionOptions>): void {
    this.options = { ...this.options, ...opts };
    if (this.recognition) {
      if (opts.lang !== undefined) this.recognition.lang = opts.lang;
      if (opts.continuous !== undefined) this.recognition.continuous = opts.continuous;
      if (opts.interimResults !== undefined) this.recognition.interimResults = opts.interimResults;
    }
  }

  /**
   * Start listening. Returns immediately; results arrive via callbacks.
   * Throws if Web Speech API is not available.
   */
  start(): void {
    if (this._isListening) return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.options.onError?.('Web Speech API not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognitionCtor() as NativeSpeechRecognition;
    this.recognition.lang = this.options.lang || 'en-US';
    this.recognition.interimResults = this.options.interimResults ?? true;
    this.recognition.continuous = this.options.continuous ?? false;

    this.recognition.onstart = () => {
      this._isListening = true;
      this.options.onStart?.();
    };

    this.recognition.onresult = (event: SpeechRecognitionEventInit) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        this.options.onInterimResult?.(interimTranscript);
      }
      if (finalTranscript) {
        this.options.onFinalResult?.(finalTranscript);
      }
    };

    this.recognition.onerror = (event: { error: string }) => {
      // "no-speech" and "aborted" are not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.options.onError?.(event.error);
    };

    this.recognition.onend = () => {
      this._isListening = false;
      this.options.onEnd?.();
    };

    this.recognition.start();
  }

  /** Stop listening and finalize any pending results. */
  stop(): void {
    if (!this.recognition || !this._isListening) return;
    this.recognition.stop();
  }

  /** Abort listening immediately without finalizing results. */
  abort(): void {
    if (!this.recognition) return;
    this.recognition.abort();
    this._isListening = false;
  }

  /** Clean up resources. */
  dispose(): void {
    this.abort();
    this.recognition = null;
  }
}

/**
 * Check whether we're running inside the Electron standalone export
 * with local AI capabilities (Whisper STT via IPC).
 */
function getElectronSTT(): ((audio: ArrayBuffer, lang?: string) => Promise<{ text: string }>) | null {
  const api = (window as any).electronAPI;
  return api?.aiSTT ?? null;
}

/**
 * STT fallback: tries Electron local Whisper first, then server /api/stt.
 * Used when the Web Speech API is unavailable.
 *
 * Fallback chain:
 *   1. Electron aiSTT (Whisper via IPC) — works offline in standalone export
 *   2. Server /api/stt — works in the Insimul web app
 *   3. Error — no STT available
 */
export async function serverSideSTT(
  onTranscript: (transcript: string) => void,
  onError: (error: string) => void,
  options?: { languageHint?: string },
): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(track => track.stop());
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });

    // Strategy 1: Electron local Whisper STT
    const electronSTT = getElectronSTT();
    if (electronSTT) {
      try {
        const buffer = await audioBlob.arrayBuffer();
        const result = await electronSTT(buffer, options?.languageHint);
        if (result?.text) {
          onTranscript(result.text);
          return;
        }
      } catch {
        // Electron STT failed — fall through to server
      }
    }

    // Strategy 2: Server-side /api/stt
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch('/api/stt', { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error('Server STT failed');
      const data = await response.json();
      onTranscript(data.transcript || data.text || '');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        onError('Speech recognition timed out');
      } else {
        onError(err instanceof Error ? err.message : 'Speech-to-text unavailable. Try typing instead.');
      }
    }
  };

  mediaRecorder.start();

  return {
    stop: () => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    },
  };
}
