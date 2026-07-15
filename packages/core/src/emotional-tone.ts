/**
 * Maps NPC emotional tones to SSML prosody parameters for TTS voice modulation.
 * Used by the TTS service to adjust pitch, rate, and volume based on character emotion.
 */

export interface ProsodyParams {
  /** Pitch adjustment (e.g., "+10%", "-5%", "+2st") */
  pitch: string;
  /** Speaking rate adjustment (e.g., "110%", "90%") */
  rate: string;
  /** Volume adjustment (e.g., "+2dB", "-3dB") */
  volume: string;
}

export type EmotionalTone =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'excited'
  | 'calm'
  | 'nervous'
  | 'disgusted'
  | 'surprised'
  | 'neutral';

const PROSODY_MAP: Record<EmotionalTone, ProsodyParams> = {
  happy:     { pitch: '+10%', rate: '105%', volume: '+1dB' },
  sad:       { pitch: '-8%',  rate: '85%',  volume: '-2dB' },
  angry:     { pitch: '+15%', rate: '110%', volume: '+4dB' },
  fearful:   { pitch: '+12%', rate: '115%', volume: '-1dB' },
  excited:   { pitch: '+18%', rate: '120%', volume: '+3dB' },
  calm:      { pitch: '-3%',  rate: '90%',  volume: '-1dB' },
  nervous:   { pitch: '+8%',  rate: '108%', volume: '-2dB' },
  disgusted: { pitch: '-5%',  rate: '95%',  volume: '+2dB' },
  surprised: { pitch: '+20%', rate: '112%', volume: '+2dB' },
  neutral:   { pitch: '+0%',  rate: '100%', volume: '+0dB' },
};

/**
 * Get SSML prosody parameters for a given emotional tone.
 * Returns neutral params for unrecognized tones.
 */
export function getProsodyForEmotion(tone: string | undefined): ProsodyParams {
  if (!tone) return PROSODY_MAP.neutral;
  const normalized = tone.toLowerCase().trim() as EmotionalTone;
  return PROSODY_MAP[normalized] ?? PROSODY_MAP.neutral;
}

/**
 * Check if a tone string is a recognized emotional tone.
 */
export function isValidEmotionalTone(tone: string): tone is EmotionalTone {
  return tone.toLowerCase().trim() in PROSODY_MAP;
}

/**
 * Wrap text in SSML prosody tags based on emotional tone.
 * Returns plain text if tone is neutral or undefined.
 */
export function wrapWithEmotionalProsody(text: string, tone: string | undefined): { ssml: string; isSSML: boolean } {
  if (!tone || tone === 'neutral') {
    return { ssml: text, isSSML: false };
  }

  const params = getProsodyForEmotion(tone);
  if (params === PROSODY_MAP.neutral) {
    return { ssml: text, isSSML: false };
  }

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const ssml = `<speak><prosody pitch="${params.pitch}" rate="${params.rate}" volume="${params.volume}">${escaped}</prosody></speak>`;
  return { ssml, isSSML: true };
}

/** All recognized emotional tones. */
export const EMOTIONAL_TONES: EmotionalTone[] = Object.keys(PROSODY_MAP) as EmotionalTone[];
