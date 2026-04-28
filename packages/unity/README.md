# Insimul Unity Plugin

Connect your Unity NPCs to the Insimul real-time conversation service with streaming text, audio, and lip-sync support.

**Supported Unity versions:** 2022.3 LTS+

## Installation

### Via Unity Package Manager (UPM)

1. Open **Window > Package Manager**
2. Click **+ > Add package from disk...**
3. Navigate to this folder and select `package.json`

Or add to your `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.insimul.sdk": "file:../../packages/unity"
  }
}
```

## Quick Start

### 1. Add InsimulManager to your scene

1. Create an empty GameObject named `InsimulManager`
2. Add the **Insimul Manager** component
3. Configure:
   - **Server URL**: Your Insimul server (e.g. `http://localhost:3000`)
   - **API Key**: Your authentication key
   - **World ID**: The world to connect to
   - **Language Code**: Default language (e.g. `en-US`, `fr-FR`)

### 2. Add InsimulNPC to your characters

1. Select your NPC GameObject
2. Add the **Insimul NPC** component
3. Set the **Character ID** to match the Insimul character

### 3. Start a conversation from script

```csharp
using Insimul;
using UnityEngine;

public class NPCInteraction : MonoBehaviour
{
    private InsimulNPC _npc;

    void Start()
    {
        _npc = GetComponent<InsimulNPC>();
        _npc.onTextReceived.AddListener(OnText);
        _npc.onError.AddListener(OnError);
    }

    public void TalkToNPC(string playerMessage)
    {
        if (!_npc.IsConversationActive)
            _npc.StartConversation();

        _npc.SendText(playerMessage);
    }

    private void OnText(InsimulTextChunk chunk)
    {
        Debug.Log($"NPC says: {chunk.text} (final: {chunk.isFinal})");
    }

    private void OnError(string error)
    {
        Debug.LogError($"Conversation error: {error}");
    }
}
```

## Components

### InsimulManager

Singleton that manages the server connection. One per scene (persists across scene loads by default).

| Property | Description |
|----------|-------------|
| Server URL | Insimul conversation server endpoint |
| API Key | Authentication key |
| World ID | Target world for conversations |
| Language Code | Default language code |
| Persist Across Scenes | Keep manager alive on scene load |

### InsimulNPC

Attach to any GameObject to enable conversation. Manages session lifecycle and event dispatch.

**Methods:**
- `StartConversation()` — Begin a new conversation session
- `SendText(string text)` — Send player text input
- `SendAudio(byte[] audioData)` — Send recorded audio
- `EndConversation()` — End the current session

**Events (UnityEvent):**
- `onTextReceived` — Streaming text chunks from NPC
- `onAudioReceived` — TTS audio chunks
- `onFacialDataReceived` — Viseme data for lip sync
- `onActionTriggered` — NPC action triggers
- `onTranscriptReceived` — STT transcription of player speech
- `onConversationStarted` / `onConversationEnded` — Lifecycle events
- `onError` — Error messages

### InsimulAudioPlayer

Streams TTS audio chunks to an AudioSource with pre-buffering and spatial audio support.

| Property | Description |
|----------|-------------|
| Pre Buffer Count | Chunks to buffer before playback (default: 3) |
| Audio Source | Target AudioSource (auto-detected) |
| Spatial Audio | Enable 3D distance attenuation |
| Max Distance | Maximum audible range |

### InsimulLipSync

Applies viseme weights to SkinnedMeshRenderer blend shapes. Uses Oculus OVR 15-viseme format.

| Property | Description |
|----------|-------------|
| Target Renderer | SkinnedMeshRenderer (auto-detected) |
| Blend Shape Prefix | Prefix for viseme shapes (default: `viseme_`) |
| Interpolation Speed | Blend smoothing (1-30) |
| Max Weight | Maximum blend shape weight (0-100) |

**Blend shape naming:** The component looks for shapes named `{prefix}{viseme}` (e.g. `viseme_sil`, `viseme_PP`, `viseme_aa`). Shapes without prefix are also matched.

### InsimulMicrophone

Wraps Unity's Microphone class for push-to-talk audio capture.

```csharp
var mic = GetComponent<InsimulMicrophone>();
mic.StartCapture();
// ... player holds talk button ...
byte[] audio = mic.StopCapture();
npc.SendAudio(audio);
```

## Audio + Lip Sync Integration

Wire up audio and lip sync by connecting events:

```csharp
var npc = GetComponent<InsimulNPC>();
var audioPlayer = GetComponent<InsimulAudioPlayer>();
var lipSync = GetComponent<InsimulLipSync>();

npc.onAudioReceived.AddListener(chunk => audioPlayer.PushChunk(chunk));
npc.onFacialDataReceived.AddListener(data => lipSync.PushFacialData(data));

// Stop lip sync when audio ends
audioPlayer.OnPlaybackCompleted += () => lipSync.Stop();
```

## Sample Scene

Import the **Basic Conversation** sample from Package Manager for a minimal working example.

## Architecture

The plugin communicates via HTTP/SSE (Server-Sent Events) with the Insimul server — no native gRPC dependency required. This ensures compatibility across all Unity build targets including WebGL.

```
Player Input → InsimulNPC.SendText()
  → InsimulHttpClient (HTTP POST)
    → Insimul Server
      → SSE Response Stream
        → OnTextChunk → UI
        → OnAudioChunk → InsimulAudioPlayer → AudioSource
        → OnFacialData → InsimulLipSync → SkinnedMeshRenderer
```

## License

MIT
