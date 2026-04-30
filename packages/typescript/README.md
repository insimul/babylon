# @insimul/typescript

JavaScript/TypeScript SDK for the Insimul conversation service. Connect any web game to AI-powered NPC conversations with streaming text, audio, and lip sync.

## Installation

```bash
npm install @insimul/typescript
```

## Quickstart

```typescript
import { InsimulClient, StreamingAudioPlayer } from '@insimul/typescript';

// 1. Create a client
const client = new InsimulClient({
  serverUrl: 'https://your-insimul-server.com',
  worldId: 'world_abc123',
  apiKey: 'your-api-key',
});

// 2. Set up an audio player (optional — for voice output)
const audioPlayer = new StreamingAudioPlayer({ preBufferCount: 2 });

// 3. Register event callbacks
client.on({
  onTextChunk: (chunk) => {
    // Append text to your chat UI (streams token-by-token)
    if (!chunk.isFinal) {
      appendToChat(chunk.text);
    }
  },
  onAudioChunk: (chunk) => {
    // Feed audio to the player for seamless playback
    audioPlayer.pushChunk(chunk);
  },
  onVisemeData: (data) => {
    // Apply viseme weights to your 3D character's face mesh
    applyLipSync(data.visemes);
  },
  onActionTrigger: (action) => {
    // Handle server-triggered game actions
    handleAction(action.actionType, action.targetId);
  },
  onError: (err) => {
    console.error('Conversation error:', err.message);
  },
});

// 4. Start a conversation with an NPC
const sessionId = client.startConversation({
  characterId: 'npc_baker_001',
});

// 5. Send player text
await client.sendText('Hello! What bread do you have today?', 'npc_baker_001');

// 6. End the conversation when done
await client.endConversation();
audioPlayer.dispose();
```

## Voice Input (Microphone)

```typescript
import { MicCapture } from '@insimul/typescript';

const mic = new MicCapture();

mic.setCallbacks({
  onStop: async (audioBlob) => {
    // Send recorded audio to the NPC
    await client.sendAudio(audioBlob, 'npc_baker_001');
  },
});

// Push-to-talk: start on button press
button.onpointerdown = () => mic.startCapture();
button.onpointerup = () => mic.stopCapture();
```

## API Reference

### `InsimulClient`

| Method | Description |
|--------|-------------|
| `new InsimulClient(options)` | Create a client with `serverUrl`, `worldId`, optional `apiKey` |
| `.on(callbacks)` | Register event callbacks (`onTextChunk`, `onAudioChunk`, etc.) |
| `.startConversation(options)` | Start or resume a conversation; returns `sessionId` |
| `.sendText(text, characterId)` | Send text to NPC; responses stream via callbacks |
| `.sendAudio(blob, characterId)` | Send recorded audio; server transcribes + responds |
| `.endConversation()` | End session and clean up |
| `.healthCheck()` | Check if the server is available |
| `.getSessionId()` | Get current session ID |
| `.getState()` | Get current conversation state |

### `StreamingAudioPlayer`

| Method | Description |
|--------|-------------|
| `new StreamingAudioPlayer(options?)` | Create player with optional `preBufferCount` |
| `.setCallbacks(callbacks)` | Register `onStart`, `onChunkPlayed`, `onComplete` |
| `.pushChunk(chunk)` | Feed an audio chunk for playback |
| `.finish()` | Signal end of audio stream |
| `.stop()` | Interrupt playback |
| `.setVolume(0-1)` | Set master volume |
| `.dispose()` | Clean up audio resources |

### `MicCapture`

| Method | Description |
|--------|-------------|
| `new MicCapture(options?)` | Create with optional `mimeType`, `timeSlice` |
| `.setCallbacks(callbacks)` | Register `onStart`, `onStop`, `onDataAvailable`, `onError` |
| `.startCapture()` | Request mic access and start recording |
| `.stopCapture()` | Stop recording (triggers `onStop` with audio blob) |
| `.isRecording()` | Check if currently recording |
| `.dispose()` | Release microphone stream |

## TypeScript

Full TypeScript type definitions are included. All conversation protocol types (`TextChunk`, `AudioChunkOutput`, `FacialData`, `ActionTrigger`, etc.) are exported from the package root.

## License

MIT
