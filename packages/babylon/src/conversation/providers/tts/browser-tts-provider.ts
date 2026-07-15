/**
 * BrowserTTSProvider — in-browser text-to-speech via Kokoro (tts.rocks)
 * with browser native speechSynthesis as fallback.
 *
 * Voice selection is gender-aware and language-aware.
 * Ported from BrowserAIClient.ts synthesizeSpeech() + voice mapping.
 */

import type { TTSProvider, TTSProviderCallbacks, TTSVoiceOptions } from './types.js';
import type { AudioChunkOutput, AudioEncoding } from '../../types.js';

// ── Kokoro voice mapping ────────────────────────────────────────────────

const KOKORO_VOICES: Record<string, { female: string; male: string }> = {
  'en':    { female: 'af_heart',    male: 'am_adam' },
  'en-US': { female: 'af_heart',    male: 'am_adam' },
  'en-GB': { female: 'bf_emma',     male: 'bm_george' },
  'fr':    { female: 'ff_siwis',    male: 'ff_siwis' },
  'fr-FR': { female: 'ff_siwis',    male: 'ff_siwis' },
  'it':    { female: 'if_sara',     male: 'im_nicola' },
  'it-IT': { female: 'if_sara',     male: 'im_nicola' },
  'ja':    { female: 'jf_alpha',    male: 'jm_kumo' },
  'ja-JP': { female: 'jf_alpha',    male: 'jm_kumo' },
  'zh':    { female: 'zf_xiaobei',  male: 'zm_yunxi' },
  'zh-CN': { female: 'zf_xiaobei',  male: 'zm_yunxi' },
};

function selectKokoroVoice(gender?: string, language?: string): string {
  const lang = language || 'en';
  const voices = KOKORO_VOICES[lang] || KOKORO_VOICES[lang.split('-')[0]] || KOKORO_VOICES['en'];
  return (gender || '').toLowerCase() === 'female' ? voices.female : voices.male;
}

// ── Kokoro globals (loaded from tts.rocks scripts) ──────────────────────

declare global {
  interface Window {
    TTS?: {
      TTSProvider?: string;
      kokoroLoaded?: boolean;
      rate?: number;
      pitch?: number;
      initKokoro?: () => Promise<void>;
      kokoroTTS?: (text: string) => Promise<ArrayBuffer | null>;
      kokoroVoice?: string;
    };
  }
}

// ── Provider ────────────────────────────────────────────────────────────

export class BrowserTTSProvider implements TTSProvider {
  readonly type = 'browser' as const;

  private callbacks: TTSProviderCallbacks = {};
  private gender = '';
  private language = 'en';
  private voiceId?: string;

  async initialize(): Promise<void> {
    // Kokoro initializes lazily on first synthesize() call
  }

  isSupported(): boolean {
    // Kokoro or native speechSynthesis
    return typeof window !== 'undefined' && (
      !!(window as any).TTS?.initKokoro ||
      'speechSynthesis' in window
    );
  }

  isReady(): boolean { return true; }

  setCallbacks(callbacks: TTSProviderCallbacks): void { this.callbacks = callbacks; }

  setVoice(options: TTSVoiceOptions): void {
    if (options.gender) this.gender = options.gender;
    if (options.language) this.language = options.language;
    if (options.voiceId) this.voiceId = options.voiceId;
  }

  async synthesize(text: string): Promise<ArrayBuffer | null> {
    const voice = this.voiceId || selectKokoroVoice(this.gender, this.language);

    // Try Kokoro TTS
    if (typeof window !== 'undefined' && window.TTS) {
      try {
        window.TTS.kokoroVoice = voice;

        if (!window.TTS.kokoroLoaded && window.TTS.initKokoro) {
          window.TTS.TTSProvider = 'kokoro';
          await window.TTS.initKokoro();
        }

        if (window.TTS.kokoroTTS) {
          this.callbacks.onStart?.();
          const audioBuffer = await window.TTS.kokoroTTS(text);
          if (audioBuffer) {
            this.callbacks.onAudioChunk?.({
              data: new Uint8Array(audioBuffer),
              encoding: 1 as AudioEncoding, // PCM
              sampleRate: 24000,
              durationMs: 0,
            });
          }
          this.callbacks.onComplete?.();
          return audioBuffer;
        }
      } catch (err: any) {
        console.warn('[BrowserTTS] Kokoro failed:', err.message);
      }
    }

    // Fallback: browser native Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return new Promise<null>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;

        const lang = this.language || 'en';
        utterance.lang = lang.includes('-') ? lang : `${lang}-${lang.toUpperCase()}`;

        // Try to match voice for gender + language
        const voices = speechSynthesis.getVoices();
        const langPrefix = lang.split('-')[0];
        const isFemale = this.gender.toLowerCase() === 'female';
        const langVoices = voices.filter(v => v.lang.startsWith(langPrefix));
        if (langVoices.length > 0) {
          const genderMatch = langVoices.find(v => {
            const n = v.name.toLowerCase();
            return isFemale
              ? n.includes('female') || n.includes('samantha') || n.includes('victoria')
              : n.includes('male') || n.includes('daniel') || n.includes('thomas');
          });
          utterance.voice = genderMatch || langVoices[0];
        }

        this.callbacks.onStart?.();
        utterance.onend = () => { this.callbacks.onComplete?.(); resolve(null); };
        utterance.onerror = () => { resolve(null); };
        speechSynthesis.speak(utterance);
      });
    }

    return null;
  }

  abort(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  async dispose(): Promise<void> {
    this.abort();
  }

  /** Get the Kokoro voice mapping table */
  static getVoiceMap(): Record<string, { female: string; male: string }> {
    return { ...KOKORO_VOICES };
  }
}
