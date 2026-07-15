/**
 * Standalone (non-React) WebSocket voice chat client for BabylonChatPanel.
 *
 * Opens a WebSocket to `/ws/voice`, streams microphone audio as base64 PCM
 * chunks via an AudioWorklet, receives audio response chunks with a jitter
 * buffer for smooth playback, and shows interim transcripts.
 *
 * Falls back to HTTP-based voice chat when WebSocket connection fails.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type ClientMessage =
  | { type: 'join'; roomId: string; worldId: string; characterId?: string }
  | { type: 'leave' }
  | { type: 'audio'; data: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'ping' };

type ServerMessage =
  | { type: 'joined'; roomId: string; clientId: string; peers: string[] }
  | { type: 'peer_joined'; clientId: string; characterId: string | null }
  | { type: 'peer_left'; clientId: string }
  | { type: 'audio'; fromClientId: string; data: string }
  | { type: 'peer_muted'; clientId: string; muted: boolean }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'transcript'; text: string; isFinal: boolean };

export type VoiceWSState = 'disconnected' | 'connecting' | 'connected' | 'in_room';

export interface VoiceWSCallbacks {
  /** Called when the connection state changes */
  onStateChange?: (state: VoiceWSState) => void;
  /** Called when audio data is received from a peer */
  onAudio?: (fromClientId: string, audioBase64: string) => void;
  /** Called when an interim or final transcript arrives */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Called on errors */
  onError?: (message: string) => void;
  /** Called when the client falls back to HTTP mode */
  onFallbackToHTTP?: () => void;
}

export interface VoiceWSOptions {
  /** Ping interval in ms (default 25000) */
  pingIntervalMs?: number;
  /** Reconnect delay in ms (default 3000) */
  reconnectDelayMs?: number;
  /** Max reconnect attempts before falling back (default 3) */
  maxReconnectAttempts?: number;
  /** Size of jitter buffer in chunks before playback starts (default 2) */
  jitterBufferSize?: number;
}

// ─── PCM AudioWorklet inline processor ──────────────────────────────────────

/**
 * Inline AudioWorklet processor source that converts Float32 audio to
 * 16-bit PCM and posts it to the main thread.
 */
const PCM_WORKLET_SOURCE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0];
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

// ─── Jitter Buffer ──────────────────────────────────────────────────────────

class JitterBuffer {
  private chunks: string[] = [];
  private _playing = false;
  private audioContext: AudioContext | null = null;
  private readonly bufferSize: number;

  constructor(bufferSize = 2) {
    this.bufferSize = bufferSize;
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  private static readonly MAX_BUFFER_SIZE = 50;

  enqueue(audioBase64: string): void {
    // Drop oldest chunks if buffer grows too large (prevents unbounded memory growth)
    if (this.chunks.length >= JitterBuffer.MAX_BUFFER_SIZE) {
      console.warn('[JitterBuffer] Buffer overflow — dropping oldest chunk');
      this.chunks.shift();
    }
    this.chunks.push(audioBase64);
    if (!this._playing && this.chunks.length >= this.bufferSize) {
      this.startPlayback();
    }
  }

  private async startPlayback(): Promise<void> {
    if (this._playing) return;
    this._playing = true;

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    while (this.chunks.length > 0) {
      const chunk = this.chunks.shift()!;
      try {
        const bytes = Uint8Array.from(atob(chunk), c => c.charCodeAt(0));
        const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
        await this.playBuffer(audioBuffer);
      } catch {
        // Skip undecodable chunks
      }
    }

    this._playing = false;
  }

  private playBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext!.destination);
      source.onended = () => resolve();
      source.start();
    });
  }

  flush(): void {
    this.chunks = [];
    this._playing = false;
  }

  destroy(): void {
    this.flush();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }
}

// ─── VoiceWebSocketClient ───────────────────────────────────────────────────

export class VoiceWebSocketClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;

  // Audio capture
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private _capturing = false;

  // Playback
  private jitterBuffer: JitterBuffer;

  // State
  private _state: VoiceWSState = 'disconnected';
  private _clientId: string | null = null;
  private _roomId: string | null = null;
  private _muted = false;
  private _fallbackActive = false;

  // Options
  private readonly pingIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;

  // Callbacks
  private callbacks: VoiceWSCallbacks;

  constructor(callbacks: VoiceWSCallbacks = {}, opts: VoiceWSOptions = {}) {
    this.callbacks = callbacks;
    this.pingIntervalMs = opts.pingIntervalMs ?? 25_000;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 3_000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 3;
    this.jitterBuffer = new JitterBuffer(opts.jitterBufferSize ?? 2);
  }

  // ─── Public accessors ──────────────────────────────────────────────

  get state(): VoiceWSState { return this._state; }
  get clientId(): string | null { return this._clientId; }
  get roomId(): string | null { return this._roomId; }
  get muted(): boolean { return this._muted; }
  get isCapturing(): boolean { return this._capturing; }
  get isFallback(): boolean { return this._fallbackActive; }

  // ─── Connection ────────────────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    this._fallbackActive = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/voice`;

    this.setState('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startPing();
    };

    ws.onmessage = (event) => this.handleMessage(event);

    ws.onclose = () => {
      this.stopPing();
      this.setState('disconnected');
      this._clientId = null;
      this._roomId = null;

      if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
      } else if (!this.intentionalClose) {
        // Exhausted reconnect attempts — fall back to HTTP
        this._fallbackActive = true;
        this.callbacks.onFallbackToHTTP?.();
      }
    };

    ws.onerror = () => {
      this.callbacks.onError?.('WebSocket connection error');
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopCapture();
    this.stopPing();
    this.jitterBuffer.flush();
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
    this._clientId = null;
    this._roomId = null;
  }

  // ─── Room ──────────────────────────────────────────────────────────

  joinRoom(roomId: string, worldId: string, characterId?: string): void {
    this.send({ type: 'join', roomId, worldId, characterId });
  }

  leaveRoom(): void {
    this.send({ type: 'leave' });
    this._roomId = null;
    if (this._state === 'in_room') {
      this.setState('connected');
    }
  }

  // ─── Audio capture ─────────────────────────────────────────────────

  /**
   * Start capturing microphone audio and streaming it over WebSocket.
   * Uses an AudioWorklet to convert to 16-bit PCM.
   */
  async startCapture(): Promise<void> {
    if (this._capturing) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Register the PCM worklet processor
      const blob = new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      try {
        await this.audioContext.audioWorklet.addModule(workletUrl);
      } catch (workletErr) {
        URL.revokeObjectURL(workletUrl);
        console.error('[VoiceWSClient] AudioWorklet failed to load (CSP or browser issue):', workletErr);
        this.callbacks?.onError?.('Audio capture unavailable — worklet failed to load');
        this.stopCapture();
        return;
      }
      URL.revokeObjectURL(workletUrl);

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (this._muted || this._state !== 'in_room') return;
        const int16 = new Int16Array(event.data);
        const base64 = this.int16ToBase64(int16);
        this.send({ type: 'audio', data: base64 });
      };

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      this._capturing = true;
    } catch (err) {
      this.callbacks.onError?.(`Microphone access failed: ${err}`);
      this.stopCapture();
    }
  }

  stopCapture(): void {
    this._capturing = false;
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }

  // ─── Mute ──────────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this._muted = muted;
    this.send({ type: 'mute', muted });
  }

  // ─── Send raw audio (for manual/push-to-talk style) ────────────────

  sendAudio(audioBase64: string): void {
    if (!this._muted) {
      this.send({ type: 'audio', data: audioBase64 });
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────

  destroy(): void {
    this.disconnect();
    this.jitterBuffer.destroy();
  }

  // ─── Private ───────────────────────────────────────────────────────

  private setState(state: VoiceWSState): void {
    this._state = state;
    this.callbacks.onStateChange?.(state);
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(event: MessageEvent): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'joined':
        this._clientId = msg.clientId;
        this._roomId = msg.roomId;
        this.setState('in_room');
        break;

      case 'peer_joined':
      case 'peer_left':
      case 'peer_muted':
        // Room events — no UI action needed in this client
        break;

      case 'audio':
        this.jitterBuffer.enqueue(msg.data);
        this.callbacks.onAudio?.(msg.fromClientId, msg.data);
        break;

      case 'transcript':
        this.callbacks.onTranscript?.(msg.text, msg.isFinal);
        break;

      case 'error':
        this.callbacks.onError?.(msg.message);
        break;

      case 'pong':
        break;
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), this.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private int16ToBase64(int16: Int16Array): string {
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
