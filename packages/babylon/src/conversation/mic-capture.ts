/**
 * Microphone Capture Utilities
 *
 * Wraps the browser MediaStream API for recording player speech.
 * Outputs WebM/Opus blobs suitable for sending to the Insimul conversation
 * service via InsimulClient.sendAudio().
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface MicCaptureOptions {
  /** Audio MIME type (default: "audio/webm;codecs=opus") */
  mimeType?: string;
  /** Time slice in ms for ondataavailable (default: 250) */
  timeSlice?: number;
}

export interface MicCaptureCallbacks {
  /** Called when recording starts successfully */
  onStart?: () => void;
  /** Called when recording stops */
  onStop?: (audioBlob: Blob) => void;
  /** Called on each data chunk during recording */
  onDataAvailable?: (chunk: Blob) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

// ── MicCapture ──────────────────────────────────────────────────────────────

export class MicCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private callbacks: MicCaptureCallbacks = {};
  private mimeType: string;
  private timeSlice: number;

  constructor(options: MicCaptureOptions = {}) {
    this.mimeType = options.mimeType ?? 'audio/webm;codecs=opus';
    this.timeSlice = options.timeSlice ?? 250;
  }

  /** Register capture callbacks */
  public setCallbacks(callbacks: MicCaptureCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Request microphone access and start recording */
  public async startCapture(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Fall back to supported MIME types
      const mime = MediaRecorder.isTypeSupported(this.mimeType)
        ? this.mimeType
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: mime || undefined,
      });

      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
          this.callbacks.onDataAvailable?.(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mime || 'audio/webm' });
        this.callbacks.onStop?.(blob);
        this.chunks = [];
      };

      this.mediaRecorder.onerror = () => {
        this.callbacks.onError?.(new Error('MediaRecorder error'));
      };

      this.mediaRecorder.start(this.timeSlice);
      this.callbacks.onStart?.();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
    }
  }

  /** Stop recording and return the captured audio blob */
  public stopCapture(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /** Whether the microphone is currently recording */
  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /** Release the microphone stream */
  public dispose(): void {
    this.stopCapture();
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
  }
}
