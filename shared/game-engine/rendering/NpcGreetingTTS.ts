/**
 * NpcGreetingTTS — Generate and speak an NPC greeting via LLM + TTS.
 *
 * Pipeline: LLM (FLASH tier, 50 tokens, 3s timeout) → TTS → StreamingAudioPlayer.
 * Falls back to a hardcoded target-language greeting on LLM failure.
 * Silently skips if TTS fails.
 */

import { Vector3 } from '@babylonjs/core';
import { StreamingAudioPlayer } from './StreamingAudioPlayer';
import type { StreamingAudioChunk } from './StreamingAudioPlayer';
import { GREETINGS } from '@shared/language/utils';
import { getLanguageBCP47 } from '@shared/language/language-utils';

// ── Types ───────────────────────────────────────────────────────────────

/** Personality traits (Big Five, 0-1 scale) */
export interface GreetingPersonality {
  openness?: number;
  conscientiousness?: number;
  extroversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}

/** NPC data needed for greeting generation */
export interface GreetingNPC {
  id: string;
  name: string;
  gender?: string;
  age?: number;
  occupation?: string;
  personality?: GreetingPersonality;
  meshPosition: Vector3;
}

/** World/environment context for the greeting */
export interface GreetingWorldData {
  targetLanguage: string;
  timeOfDay?: string;
  serverUrl?: string;
}

/** Options for generateAndSpeakGreeting */
export interface GreetingOptions {
  /** AbortSignal to cancel the LLM call and stop audio playback */
  signal?: AbortSignal;
  /** Voice name override (otherwise auto-assigned from gender/age/personality) */
  voiceName?: string;
}

/** Result from a greeting attempt */
export interface GreetingResult {
  /** The greeting text that was spoken (or attempted) */
  text: string;
  /** Whether the LLM fallback was used */
  usedFallback: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Pick a random fallback greeting for the target language. */
function getFallbackGreeting(targetLanguage: string): string {
  const greetings = GREETINGS[targetLanguage] || GREETINGS['English'] || ['Hello!'];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/** Map time-of-day hour to a human-readable period. */
function describeTimeOfDay(timeOfDay?: string): string {
  if (!timeOfDay) return 'daytime';
  // Accept raw hour numbers or descriptive strings
  const hour = parseInt(timeOfDay, 10);
  if (isNaN(hour)) return timeOfDay;
  if (hour < 6) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ── Voice profile assignment (client-side, matching server logic) ──────

interface VoiceSelection {
  voiceName: string;
  gender: string;
}

const VOICE_MAP: Record<string, string> = {
  'f-young': 'Aoede',
  'f-mid': 'Kore',
  'f-senior': 'Leda',
  'm-young': 'Zephyr',
  'm-mid': 'Puck',
  'm-senior': 'Orus',
};

export function selectVoice(npc: GreetingNPC, voiceOverride?: string): VoiceSelection {
  const gender = (npc.gender || 'male').toLowerCase();
  const genderKey = gender === 'female' ? 'f' : 'm';

  if (voiceOverride) {
    return { voiceName: voiceOverride, gender };
  }

  let ageKey = 'mid';
  if (npc.age !== undefined) {
    if (npc.age < 25) ageKey = 'young';
    else if (npc.age >= 55) ageKey = 'senior';
  }

  const voiceName = VOICE_MAP[`${genderKey}-${ageKey}`] || (gender === 'female' ? 'Kore' : 'Puck');
  return { voiceName, gender };
}

// ── Main function ───────────────────────────────────────────────────────

/**
 * Generate a short NPC greeting via LLM and play it via TTS.
 *
 * @returns Promise that resolves with the greeting result when audio finishes,
 *          or rejects if aborted via the signal.
 */
export async function generateAndSpeakGreeting(
  npc: GreetingNPC,
  worldData: GreetingWorldData,
  options: GreetingOptions = {},
): Promise<GreetingResult> {
  const { signal, voiceName: voiceOverride } = options;
  const serverUrl = worldData.serverUrl || '';

  // Abort early if already cancelled
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  // ── Step 1: Generate greeting text via LLM (3s timeout) ─────────────

  let greetingText: string;
  let usedFallback = false;

  try {
    const llmAbort = new AbortController();
    // Link parent signal
    const onParentAbort = () => llmAbort.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    // 3-second timeout
    const timeoutId = setTimeout(() => llmAbort.abort(), 3000);

    const res = await fetch(`${serverUrl}/api/npc-greeting/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npcName: npc.name,
        personality: npc.personality,
        occupation: npc.occupation,
        timeOfDay: describeTimeOfDay(worldData.timeOfDay),
        targetLanguage: worldData.targetLanguage,
      }),
      signal: llmAbort.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    if (res.ok) {
      const data = await res.json();
      if (data.greeting && !data.fallback) {
        greetingText = data.greeting;
      } else {
        greetingText = getFallbackGreeting(worldData.targetLanguage);
        usedFallback = true;
      }
    } else {
      greetingText = getFallbackGreeting(worldData.targetLanguage);
      usedFallback = true;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    // LLM timeout or network error — use fallback
    greetingText = getFallbackGreeting(worldData.targetLanguage);
    usedFallback = true;
  }

  // ── Step 2: Synthesize speech via TTS ───────────────────────────────

  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  const voice = selectVoice(npc, voiceOverride);
  const langCode = getLanguageBCP47(worldData.targetLanguage);

  let audioBuffer: ArrayBuffer | null = null;
  try {
    const ttsRes = await fetch(`${serverUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: greetingText,
        voice: voice.voiceName,
        gender: voice.gender,
        encoding: 'MP3',
        targetLanguage: langCode,
      }),
      signal,
    });

    if (ttsRes.ok) {
      audioBuffer = await ttsRes.arrayBuffer();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    // TTS failure — silently skip audio
  }

  // If TTS failed, silently skip (no fallback to speech bubble)
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    return { text: greetingText, usedFallback };
  }

  // ── Step 3: Play audio via StreamingAudioPlayer ─────────────────────

  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  const player = new StreamingAudioPlayer({
    preBufferCount: 1,
    npcPosition: npc.meshPosition,
    maxDistance: 50,
  });

  return new Promise<GreetingResult>((resolve, reject) => {
    const cleanup = () => {
      player.stop();
      player.dispose();
    };

    // Wire abort signal to stop playback
    if (signal) {
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    player.setCallbacks({
      onComplete: () => {
        player.dispose();
        resolve({ text: greetingText, usedFallback });
      },
    });

    // Push the entire audio buffer as a single PCM chunk
    const chunk: StreamingAudioChunk = {
      data: new Uint8Array(audioBuffer!),
      encoding: 1, // PCM (server returns raw PCM from Gemini TTS)
      sampleRate: 24000,
      durationMs: 0,
    };

    player.pushChunk(chunk);
    player.finish();
  });
}
