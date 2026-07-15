/**
 * Hands-free voice controller.
 *
 * Keeps a microphone stream open continuously and uses VoiceActivityDetector
 * to auto-start speech recognition when the user speaks and auto-stop after
 * silence. The recognised transcript is delivered via a callback.
 */

import { VoiceActivityDetector, type VADOptions } from './audio-utils';
import {
  SpeechRecognitionService,
  isSpeechRecognitionSupported,
  serverSideSTT,
} from './speech-recognition';

export interface HandsFreeCallbacks {
  /** Called with final transcript when speech ends. */
  onTranscript: (transcript: string) => void;
  /** Called with partial transcript while speaking (Web Speech API only). */
  onInterimTranscript?: (text: string) => void;
  /** Called each VAD poll with current RMS energy (0-1). */
  onEnergyChange?: (energy: number) => void;
  /** Called when VAD detects speech start (mic goes active). */
  onSpeechStart?: () => void;
  /** Called when VAD detects speech end (mic goes idle). */
  onSpeechEnd?: () => void;
  /** Called on errors. */
  onError?: (error: string) => void;
}

export interface HandsFreeOptions {
  /** BCP-47 language code for speech recognition. Default: 'en-US' */
  lang?: string;
  /** VAD speech threshold. Default: 0.015 */
  speechThreshold?: number;
  /** Seconds of silence before speech-end. Default: 1.5 */
  silenceDuration?: number;
}

/**
 * Controls an always-on microphone with VAD-gated speech recognition.
 *
 * Lifecycle:
 *  1. `start()` — opens mic, starts VAD polling
 *  2. VAD detects speech → starts SpeechRecognitionService
 *  3. VAD detects silence → stops recognition, delivers transcript
 *  4. Returns to listening for next utterance
 *  5. `stop()` — tears everything down
 */
export class HandsFreeController {
  private vad: VoiceActivityDetector | null = null;
  private stream: MediaStream | null = null;
  private speechService: SpeechRecognitionService | null = null;
  private serverSTTHandle: { stop: () => void } | null = null;
  private _serverSTTPromise: Promise<void> | null = null;
  private _active = false;
  private _recognising = false;
  private _interimText = '';
  private _finalText = '';

  private readonly callbacks: HandsFreeCallbacks;
  private readonly lang: string;
  private readonly vadOptions: Pick<VADOptions, 'speechThreshold' | 'silenceDuration'>;

  get isActive(): boolean {
    return this._active;
  }

  get isRecognising(): boolean {
    return this._recognising;
  }

  constructor(callbacks: HandsFreeCallbacks, options: HandsFreeOptions = {}) {
    this.callbacks = callbacks;
    this.lang = options.lang ?? 'en-US';
    this.vadOptions = {
      speechThreshold: options.speechThreshold ?? 0.015,
      silenceDuration: options.silenceDuration ?? 1.5,
    };
  }

  /** Open the microphone and begin VAD monitoring. */
  async start(): Promise<void> {
    if (this._active) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.callbacks.onError?.('Microphone access denied');
      return;
    }

    this._active = true;

    this.vad = new VoiceActivityDetector({
      ...this.vadOptions,
      onSpeechStart: () => this.handleSpeechStart(),
      onSpeechEnd: () => this.handleSpeechEnd(),
      onEnergyChange: (energy) => this.callbacks.onEnergyChange?.(energy),
    });

    this.vad.start(this.stream);
  }

  /** Stop everything and release the microphone. */
  async stop(): Promise<void> {
    this._active = false;

    await this.stopRecognition();

    if (this.vad) {
      this.vad.destroy();
      this.vad = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /** Update the language for subsequent recognition sessions. */
  updateLang(lang: string): void {
    (this as any).lang = lang;
  }

  private _paused = false;

  /** True when listening is temporarily suppressed (e.g. during NPC TTS). */
  get isPaused(): boolean {
    return this._paused;
  }

  /**
   * Temporarily suppress speech detection without releasing the mic.
   * Use this while NPC TTS is playing to avoid picking up its audio.
   */
  pause(): void {
    if (!this._active || this._paused) return;
    this._paused = true;
    // Stop any in-progress recognition
    if (this._recognising) {
      this._recognising = false;
      this.stopRecognition();
      this._interimText = '';
      this._finalText = '';
    }
  }

  /** Resume speech detection after a pause. */
  resume(): void {
    if (!this._active || !this._paused) return;
    this._paused = false;
  }

  // -- Internal handlers ------------------------------------------------

  private handleSpeechStart(): void {
    if (!this._active || this._paused) return;
    this._recognising = true;
    this._interimText = '';
    this._finalText = '';
    this.callbacks.onSpeechStart?.();
    this.startRecognition();
  }

  private async handleSpeechEnd(): Promise<void> {
    if (!this._active || this._paused) return;
    this._recognising = false;
    this.callbacks.onSpeechEnd?.();
    await this.stopRecognition();

    // Deliver whatever transcript we have
    const transcript = (this._finalText || this._interimText).trim();
    if (transcript) {
      this.callbacks.onTranscript(transcript);
    }
    this._interimText = '';
    this._finalText = '';
  }

  private startRecognition(): void {
    if (isSpeechRecognitionSupported()) {
      this.speechService = new SpeechRecognitionService({
        lang: this.lang,
        interimResults: true,
        continuous: true, // let VAD control start/stop
        onInterimResult: (text) => {
          this._interimText = text;
          this.callbacks.onInterimTranscript?.(text);
        },
        onFinalResult: (text) => {
          this._finalText += text;
          this._interimText = '';
        },
        onError: (err) => {
          console.warn('[HandsFree] Speech recognition error:', err);
        },
        onEnd: () => {
          // Web Speech API may auto-stop; that's fine, VAD controls lifecycle
        },
      });
      this.speechService.start();
    } else {
      // Fallback — server-side STT; track the promise so stopRecognition can await it
      this._serverSTTPromise = serverSideSTT(
        (transcript) => {
          if (this._active) this._finalText = transcript;
        },
        (err) => {
          console.error('[HandsFree] Server STT error:', err);
          this.callbacks.onError?.(err);
        },
      ).then((handle) => {
        this.serverSTTHandle = handle;
      }).catch((err) => {
        console.error('[HandsFree] Failed to start server STT:', err);
      });
    }
  }

  private async stopRecognition(): Promise<void> {
    if (this.speechService) {
      this.speechService.stop();
      this.speechService.dispose();
      this.speechService = null;
    }
    // Wait for server STT handle to be ready before stopping
    if (this._serverSTTPromise) {
      await this._serverSTTPromise;
      this._serverSTTPromise = null;
    }
    if (this.serverSTTHandle) {
      this.serverSTTHandle.stop();
      this.serverSTTHandle = null;
    }
  }
}
