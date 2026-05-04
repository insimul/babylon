const { contextBridge, ipcRenderer } = require('electron');

// Track stream listeners for cleanup
let streamListenerId = 0;

// Cache AI availability check (resolved once, reused)
let aiAvailablePromise = null;

contextBridge.exposeInMainWorld('electronAPI', {
  // Read a file relative to dist/ — used by FileDataSource in production builds
  // where fetch() is blocked on the file:// protocol.
  readFile: (relativePath) => ipcRenderer.invoke('read-file', relativePath),

  // --- AI Capabilities ---

  // Returns cached promise resolving to true/false based on AI model load status.
  // contextBridge freezes the exposed object, so this must be a function, not a mutable boolean.
  aiAvailable: () => {
    if (!aiAvailablePromise) {
      aiAvailablePromise = ipcRenderer
        .invoke('ai:status')
        .then((status) => status && status.loaded === true)
        .catch(() => false);
    }
    return aiAvailablePromise;
  },

  // Single completion: returns the full generated text
  aiGenerate: (prompt, options) => ipcRenderer.invoke('ai:generate', prompt, options),

  // Streaming completion: calls onChunk(token) for each token, resolves with full text.
  // Each stream gets a unique ID so multiple concurrent streams don't interfere.
  aiGenerateStream: (prompt, options, onChunk) => {
    const id = ++streamListenerId;
    const channel = `ai:stream-token:${id}`;

    return new Promise((resolve, reject) => {
      const handler = (_event, data) => {
        if (data.done) {
          ipcRenderer.removeListener(channel, handler);
          resolve(data.fullText);
        } else if (data.error) {
          ipcRenderer.removeListener(channel, handler);
          reject(new Error(data.error));
        } else if (onChunk) {
          onChunk(data.token);
        }
      };

      ipcRenderer.on(channel, handler);
      ipcRenderer.invoke('ai:generate-stream', prompt, options, id).catch((err) => {
        ipcRenderer.removeListener(channel, handler);
        reject(err);
      });
    });
  },

  // Text-to-speech via Piper: returns ArrayBuffer of audio data, or null if unavailable
  aiTTS: (text, voice, speed, languageCode) =>
    ipcRenderer.invoke('ai:tts', { text, voice, speed, languageCode }),

  // Speech-to-text: accepts ArrayBuffer of audio, returns { text, language? }
  aiSTT: (audioBuffer, languageHint) =>
    ipcRenderer.invoke('ai:stt', { audio: audioBuffer, languageHint }),

  // AI status: returns { loaded, modelName, gpuLayers, gpuType, ttsAvailable, ... }
  aiStatus: () => ipcRenderer.invoke('ai:status'),
});
