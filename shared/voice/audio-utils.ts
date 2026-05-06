/**
 * Audio utilities for voice chat — silence detection, audio trimming, ready beep, and VAD.
 */

/** Default RMS threshold below which audio is considered silence. */
const DEFAULT_SILENCE_THRESHOLD = 0.01;

/** Window size in samples for windowed silence analysis (50ms at 48kHz). */
const WINDOW_SIZE = 2400;

export interface VADOptions {
  /** RMS energy threshold to consider as speech (0-1). Default: 0.015 */
  speechThreshold?: number;
  /** Seconds of silence before triggering speech end. Default: 1.5 */
  silenceDuration?: number;
  /** How often to sample audio energy in ms. Default: 50 */
  pollIntervalMs?: number;
  /** Called when speech is first detected after silence. */
  onSpeechStart?: () => void;
  /** Called when silence persists for silenceDuration after speech. */
  onSpeechEnd?: () => void;
  /** Called each poll with the current RMS energy level (0-1). */
  onEnergyChange?: (energy: number) => void;
}

/**
 * Voice Activity Detector using Web Audio API AnalyserNode.
 * Monitors a MediaStream for speech start/end events based on RMS energy.
 */
export class VoiceActivityDetector {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private dataArray: Float32Array | null = null;

  private _isSpeaking = false;
  private silenceStartTime: number | null = null;

  private readonly speechThreshold: number;
  private readonly silenceDuration: number;
  private readonly pollIntervalMs: number;
  private readonly onSpeechStart?: () => void;
  private readonly onSpeechEnd?: () => void;
  private readonly onEnergyChange?: (energy: number) => void;

  /** Whether speech is currently detected. */
  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  constructor(options: VADOptions = {}) {
    this.speechThreshold = options.speechThreshold ?? 0.015;
    this.silenceDuration = options.silenceDuration ?? 1.5;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
    this.onSpeechStart = options.onSpeechStart;
    this.onSpeechEnd = options.onSpeechEnd;
    this.onEnergyChange = options.onEnergyChange;
  }

  /**
   * Start monitoring the given MediaStream for voice activity.
   * Call destroy() to stop and release resources.
   */
  start(stream: MediaStream): void {
    this.destroy();

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.sourceNode.connect(this.analyser);

    this.dataArray = new Float32Array(this.analyser.fftSize);
    this._isSpeaking = false;
    this.silenceStartTime = null;

    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  /** Stop monitoring and release all audio resources. */
  destroy(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.analyser = null;
    this.dataArray = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this._isSpeaking = false;
    this.silenceStartTime = null;
  }

  /** Calculate RMS energy from the current analyser data. Exposed for testing. */
  computeRMS(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getFloatTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sumSquares += this.dataArray[i] * this.dataArray[i];
    }
    return Math.sqrt(sumSquares / this.dataArray.length);
  }

  private poll(): void {
    const energy = this.computeRMS();
    this.onEnergyChange?.(energy);

    const now = Date.now();

    if (energy >= this.speechThreshold) {
      // Speech detected
      this.silenceStartTime = null;
      if (!this._isSpeaking) {
        this._isSpeaking = true;
        this.onSpeechStart?.();
      }
    } else {
      // Below threshold — silence
      if (this._isSpeaking) {
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime >= this.silenceDuration * 1000) {
          this._isSpeaking = false;
          this.silenceStartTime = null;
          this.onSpeechEnd?.();
        }
      }
    }
  }
}

/**
 * Compute RMS energy of a Float32Array segment.
 */
export function computeRMS(samples: Float32Array, start = 0, end?: number): number {
  const len = end ?? samples.length;
  if (len - start <= 0) return 0;
  let sum = 0;
  for (let i = start; i < len; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / (len - start));
}

/**
 * Check if an audio blob contains actual speech using windowed RMS analysis.
 * Unlike a simple global RMS check, this uses a sliding window so that
 * a short burst of speech surrounded by silence is still detected.
 *
 * Returns true if the audio is likely silence/noise (no speech detected).
 */
export async function isSilentAudio(audioBlob: Blob, threshold = DEFAULT_SILENCE_THRESHOLD): Promise<boolean> {
  try {
    const audioBuffer = await decodeBlob(audioBlob);
    if (!audioBuffer) return false;
    const samples = audioBuffer.getChannelData(0);
    return !hasVoiceActivity(samples, threshold);
  } catch {
    return false;
  }
}

/**
 * Scan PCM samples with a sliding window and return true if any window
 * exceeds the RMS threshold — i.e. voice activity is present.
 */
export function hasVoiceActivity(
  samples: Float32Array,
  threshold = DEFAULT_SILENCE_THRESHOLD,
  windowSize = WINDOW_SIZE,
): boolean {
  if (samples.length === 0) return false;

  const step = Math.max(1, Math.floor(windowSize / 2)); // 50 % overlap
  for (let i = 0; i + windowSize <= samples.length; i += step) {
    if (computeRMS(samples, i, i + windowSize) >= threshold) {
      return true;
    }
  }
  // Check remaining tail samples
  if (samples.length % step !== 0) {
    const tailStart = samples.length - windowSize;
    if (tailStart >= 0 && computeRMS(samples, tailStart, samples.length) >= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Find the sample indices where voice activity begins and ends.
 * Returns [startSample, endSample] or null if the entire buffer is silent.
 */
export function findVoiceBounds(
  samples: Float32Array,
  threshold = DEFAULT_SILENCE_THRESHOLD,
  windowSize = WINDOW_SIZE,
): [number, number] | null {
  if (samples.length === 0) return null;

  const step = Math.max(1, Math.floor(windowSize / 2));
  let firstActive = -1;
  let lastActive = -1;

  for (let i = 0; i + windowSize <= samples.length; i += step) {
    if (computeRMS(samples, i, i + windowSize) >= threshold) {
      if (firstActive === -1) firstActive = i;
      lastActive = i + windowSize;
    }
  }

  if (firstActive === -1) return null;
  return [firstActive, Math.min(lastActive, samples.length)];
}

/**
 * Trim leading and trailing silence from an AudioBuffer.
 * Returns a new AudioBuffer containing only the voiced portion,
 * or null if the entire buffer is silent.
 *
 * A small padding (default 0.05s) is kept before/after the voice bounds
 * to avoid clipping speech onset/offset.
 */
export function trimAudioBuffer(
  audioBuffer: AudioBuffer,
  threshold = DEFAULT_SILENCE_THRESHOLD,
  paddingSeconds = 0.05,
): AudioBuffer | null {
  const samples = audioBuffer.getChannelData(0);
  const bounds = findVoiceBounds(samples, threshold);
  if (!bounds) return null;

  const paddingSamples = Math.floor(paddingSeconds * audioBuffer.sampleRate);
  const start = Math.max(0, bounds[0] - paddingSamples);
  const end = Math.min(samples.length, bounds[1] + paddingSamples);
  const trimmedLength = end - start;

  if (trimmedLength <= 0) return null;

  // Create OfflineAudioContext for the trimmed buffer
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    trimmedLength,
    audioBuffer.sampleRate,
  );
  const trimmed = offlineCtx.createBuffer(
    audioBuffer.numberOfChannels,
    trimmedLength,
    audioBuffer.sampleRate,
  );

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const srcChannel = audioBuffer.getChannelData(ch);
    const dstChannel = trimmed.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      dstChannel[i] = srcChannel[start + i];
    }
  }

  return trimmed;
}

/**
 * Encode an AudioBuffer to a WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;

  // Interleave channels
  const length = buffer.length;
  const interleaved = new Int16Array(length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      interleaved[i * numChannels + ch] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
  }

  const dataSize = interleaved.length * bytesPerSample;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  const output = new Int16Array(arrayBuffer, headerSize);
  output.set(interleaved);

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Decode an audio Blob into an AudioBuffer using the Web Audio API.
 * Returns null on failure.
 */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    try {
      return await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      await audioContext.close();
    }
  } catch {
    return null;
  }
}

/**
 * Process a recorded audio blob: detect silence and trim leading/trailing silence.
 *
 * Returns:
 * - `{ silent: true }` if the recording contains no speech
 * - `{ silent: false, trimmedBlob, durationMs }` with the trimmed audio
 */
export async function processRecordedAudio(
  audioBlob: Blob,
  threshold = DEFAULT_SILENCE_THRESHOLD,
): Promise<{ silent: true } | { silent: false; trimmedBlob: Blob; durationMs: number }> {
  const audioBuffer = await decodeBlob(audioBlob);
  if (!audioBuffer) {
    // Can't decode — pass through original blob
    return { silent: false, trimmedBlob: audioBlob, durationMs: 0 };
  }

  const trimmed = trimAudioBuffer(audioBuffer, threshold);
  if (!trimmed) {
    return { silent: true };
  }

  const durationMs = (trimmed.length / trimmed.sampleRate) * 1000;
  const trimmedBlob = audioBufferToWav(trimmed);
  return { silent: false, trimmedBlob, durationMs };
}

/**
 * Play a short beep to indicate recording readiness.
 */
export function playReadyBeep(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880; // A5
      oscillator.type = 'sine';
      gainNode.gain.value = 0.15;

      // Quick fade out
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);

      oscillator.onended = () => {
        audioContext.close();
        resolve();
      };
    } catch {
      resolve();
    }
  });
}
