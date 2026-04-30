/**
 * Auto-detection utilities for selecting the best provider
 * based on the current runtime environment.
 */

export type ChatProviderType = 'server' | 'browser' | 'local';
export type TTSProviderType = 'server' | 'browser' | 'local' | 'none';
export type STTProviderType = 'server' | 'browser' | 'local' | 'none';

/** Check if running in Electron with AI available */
export function isElectronAI(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as any).electronAPI?.aiAvailable &&
    (window as any).electronAPI?.aiGenerate
  );
}

/** Check if WebGPU is available (required for WebLLM) */
export function isWebGPUAvailable(): boolean {
  return !!(typeof navigator !== 'undefined' && (navigator as any).gpu);
}

/** Check if Web Speech API is available (for browser STT) */
export function isWebSpeechAvailable(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

/** Check if Kokoro TTS is loaded (from tts.rocks scripts) */
export function isKokoroAvailable(): boolean {
  return !!(typeof window !== 'undefined' && (window as any).TTS?.initKokoro);
}

/**
 * Detect the best chat provider for the current environment.
 * Priority: Electron local > WebGPU browser > server
 */
export function detectBestChatProvider(): ChatProviderType {
  if (isElectronAI()) return 'local';
  if (isWebGPUAvailable()) return 'browser';
  return 'server';
}

/**
 * Detect the best TTS provider to match a chat provider.
 * - server chat → server TTS (audio comes in the chat stream)
 * - browser chat → browser TTS (Kokoro or native speechSynthesis)
 * - local chat → local TTS (Electron Piper)
 */
export function detectBestTTSProvider(chatType: ChatProviderType): TTSProviderType {
  if (chatType === 'server') return 'server';
  if (chatType === 'local' && isElectronAI()) return 'local';
  if (chatType === 'browser') return 'browser';
  return 'none';
}

/**
 * Detect the best STT provider to match a chat provider.
 */
export function detectBestSTTProvider(chatType: ChatProviderType): STTProviderType {
  if (chatType === 'server') return 'server';
  if (chatType === 'local' && isElectronAI()) return 'local';
  if (isWebSpeechAvailable()) return 'browser';
  return 'none';
}
