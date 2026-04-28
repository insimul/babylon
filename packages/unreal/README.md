# Insimul Plugin for Unreal Engine

Streaming AI NPC conversations with TTS audio, quest management, and crowd character integration. Supports online (Insimul server), offline (local LLM), and browser-based (WebLLM) execution modes.

## Quick Start

1. Copy this `Insimul/` folder into your project's `Plugins/` directory
2. Add to your `.uproject`:
   ```json
   { "Name": "Insimul", "Enabled": true }
   ```
3. Add `"InsimulRuntime"` to your module's `PublicDependencyModuleNames` in `.Build.cs`
4. Add to `Config/DefaultGame.ini`:
   ```ini
   [/Script/InsimulRuntime.InsimulSettings]
   ServerURL=http://localhost:8080
   DefaultWorldID=your-world-id
   bPreferWebSocket=true
   ```
5. Create a Blueprint child of `InsimulDialogueWidget` for your dialogue UI
6. Create a Blueprint child of `InsimulAICharacter` with `DialogueWidgetClass` set
7. Place an `InsimulSpawner` in your level

## Configuration

All settings are in **Project Settings > Plugins > Insimul** (stored in `Config/DefaultGame.ini`).

### Provider Selection

The provider model matches the JavaScript SDK (`@insimul/typescript`): pick a provider for Chat, TTS, and STT independently.

| Setting | Options | Default | Description |
| --- | --- | --- | --- |
| `ChatProvider` | `Server`, `Local` | `Server` | Where LLM inference runs |
| `TTSProvider` | `Server`, `Local`, `None` | `Server` | Where TTS audio is synthesized |
| `STTProvider` | `Server`, `Local`, `None` | `None` | Where player voice is transcribed |

### Server Settings (ChatProvider = Server)

| Setting | Description | Default |
| --- | --- | --- |
| `ServerURL` | Insimul server base URL | `http://localhost:8080` |
| `DefaultWorldID` | World ID for character loading and conversations | `default-world` |
| `APIKey` | Optional authentication key | *(empty)* |
| `bPreferWebSocket` | Use WebSocket streaming (recommended) | `true` |

### Local LLM Settings (ChatProvider = Local)

| Setting | Description | Default |
| --- | --- | --- |
| `LocalLLMServerURL` | Local LLM endpoint (Ollama or llama.cpp) | `http://localhost:11434/api/generate` |
| `LocalLLMModel` | Model name (for Ollama) | `mistral` |
| `WorldDataPath` | Path to exported JSON (relative to `Content/`) | `InsimulData/world_export.json` |
| `MaxTokens` | Max response tokens | `256` |
| `Temperature` | LLM creativity (0.0–2.0) | `0.7` |

### Local TTS Settings (TTSProvider = Local)

| Setting | Description | Default |
| --- | --- | --- |
| `LocalVoiceModel` | Piper/Kokoro voice model name (Runtime TTS plugin) | `en_US-amy-medium` |
| `LocalSpeakerIndex` | Speaker index in multi-speaker models | `0` |

### Common Settings

| Setting | Description | Default |
| --- | --- | --- |
| `LanguageCode` | Default BCP47 language code | `en` |

### World ID Resolution

The world ID determines which characters are loaded and which world context is used for conversations. It resolves in this order:

1. **Per-component**: `InsimulConversationComponent.Config.WorldID` (if set explicitly on the component)
2. **Per-spawner**: `InsimulSpawner.WorldID` (copied into each spawned NPC's component)
3. **Global default**: `UInsimulSettings::DefaultWorldID` (from `DefaultGame.ini`)

To use a specific world, either:
- Set `DefaultWorldID` in `DefaultGame.ini` for a project-wide default
- Set `WorldID` on individual `InsimulSpawner` actors for per-level control
- Set `Config.WorldID` on a specific `InsimulConversationComponent` for per-NPC control

## Execution Modes

### Server Mode (ChatProvider = Server)

Requires a running Insimul server. Conversations stream via WebSocket (`/ws/conversation`) with REST fallback. The server handles LLM inference (Gemini), TTS, STT, and viseme generation.

```ini
[/Script/InsimulRuntime.InsimulSettings]
ChatProvider=Server
TTSProvider=Server
ServerURL=http://localhost:8080
DefaultWorldID=your-world-id
bPreferWebSocket=true
```

Characters are fetched from the server at `GET /api/worlds/{worldId}/characters`.

### Offline (Local LLM)

Uses exported world data + a local LLM server (Ollama or llama.cpp). No server connection needed at runtime.

**Setup:**

1. Export world data while server is running:
   ```bash
   curl http://localhost:8080/api/conversation/export/YOUR_WORLD_ID > Content/InsimulData/world_export.json
   ```
2. Install Ollama and pull a model:
   ```bash
   brew install ollama
   ollama pull mistral
   ```
3. Configure:
   ```ini
   [/Script/InsimulRuntime.InsimulSettings]
   ChatProvider=Local
   TTSProvider=Local
   LocalLLMServerURL=http://localhost:11434/api/generate
   LocalLLMModel=mistral
   WorldDataPath=InsimulData/world_export.json
   ```

The offline provider builds prompts from the exported `dialogueContexts` (pre-built system prompts with personality, relationships, and knowledge) and calls the local LLM.

For offline TTS, install the **Runtime Text To Speech** plugin from Fab (Piper/Kokoro ONNX voices).

### Supported LLM Server Formats

| URL Pattern | Format | Example |
| --- | --- | --- |
| Contains `/api/generate` | Ollama | `http://localhost:11434/api/generate` |
| Contains `/api/chat` | Ollama chat | `http://localhost:11434/api/chat` |
| Anything else | llama.cpp | `http://localhost:8081/completion` |

## Key Classes

### Components

| Class | Description |
| --- | --- |
| `UInsimulConversationComponent` | Core conversation driver. Attach to any actor. Routes through online (WebSocket/REST) or offline (local LLM) based on settings. Handles NPC-NPC proximity conversations. Delegates: `OnConversationStarted`, `OnUtteranceReceived`, `OnConversationEnded`, `OnAudioChunkReceived`. |
| `UInsimulCharacterMappingComponent` | Maps an Unreal actor to an Insimul character ID. Auto-assigned by the crowd integration subsystem. |
| `UInsimulDebugComponent` | Debug visualization for Insimul characters. |

### Actors

| Class | Description |
| --- | --- |
| `AInsimulAICharacter` | NPC character with `InsimulConversationComponent`, `InteractionSphere` (200u `USphereComponent`), `SpeechAudioComponent` (`UAudioComponent`). Creates dialogue widget on player interaction. Plays TTS audio via `USoundWaveProcedural`. |
| `AInsimulSpawner` | Spawns NPCs at configured or server-fetched locations. Properties: `WorldID`, `bAutoSpawnAI`, `bFetchCharactersFromServer`, `AICharacterClass`, `CharacterSpawnData`. |
| `AInsimulLevelScriptActor` | Level script spawn hook for simple setups. |

### Widgets

| Class | Description |
| --- | --- |
| `UInsimulDialogueWidget` | Abstract base for player dialogue UI. Blueprint-implementable events: `BP_AddUtterance(Speaker, Text)`, `BP_ClearHistory()`. Functions: `SubmitPlayerMessage(Message)`, `CloseDialogue()`. |
| `UInsimulQuestWidget` | Quest list display widget with auto-refresh. |

### Subsystems

| Class | Description |
| --- | --- |
| `UInsimulCharacterMappingSubsystem` | World subsystem. Manages character ID pool. Auto-loads from server (online) or JSON file (offline) at startup. `LoadInsimulCharacters(ServerURL)` / `LoadInsimulCharactersFromFile(FilePath)`. |
| `UInsimulCrowdIntegration` | GameInstance subsystem. Auto-adds `InsimulCharacterMappingComponent` to spawned crowd actors. `EnableAutomaticMapping(bool)`. |
| `UInsimulQuestManager` | GameInstance subsystem. Quest tracking and UI management. |

### Networking

| Class | Description |
| --- | --- |
| `FInsimulWSClient` | WebSocket client for `/ws/conversation`. Streaming text, audio, visemes. |
| `FInsimulRestClient` | REST HTTP fallback for conversation lifecycle, TTS, STT, character CRUD. |
| `FInsimulOfflineProvider` | Local LLM client (Ollama/llama.cpp). Same delegate interface as `FInsimulWSClient`. |

### Data

| Class | Description |
| --- | --- |
| `UInsimulSettings` | Config singleton (`UInsimulSettings::Get()`). Online + offline settings. |
| `FInsimulExportedWorld` | Exported world data: characters + dialogue contexts. |
| `FInsimulDialogueContext` | Per-character: system prompt, greeting, voice, truths. |
| `FInsimulWorldExportLoader` | Loads world data from JSON (single-file or split-file layout). |

## World Export JSON Format

The plugin reads world data in this format (produced by `GET /api/conversation/export/{worldId}`):

```json
{
  "worldName": "My World",
  "worldId": "my-world-id",
  "characters": [
    {
      "characterId": "npc_001",
      "firstName": "Elena",
      "lastName": "Torres",
      "gender": "female",
      "occupation": "Merchant",
      "birthYear": 1988,
      "isAlive": true,
      "openness": 0.7,
      "conscientiousness": 0.8,
      "extroversion": 0.9,
      "agreeableness": 0.7,
      "neuroticism": 0.2
    }
  ],
  "dialogueContexts": [
    {
      "characterId": "npc_001",
      "characterName": "Elena Torres",
      "systemPrompt": "You are Elena Torres, a merchant...",
      "greeting": "Hello! See anything you like?",
      "voice": "Kore",
      "truths": [
        {"title": "Craft", "content": "Elena makes handmade jewelry."}
      ]
    }
  ]
}
```

The `characters` array provides data for the spawner and character mapping. The `dialogueContexts` array provides pre-built prompts for the offline provider. In online mode, the server builds prompts dynamically.

## Conversation Component Settings

Per-component overrides on `InsimulConversationComponent.Config`:

| Property | Description | Default |
| --- | --- | --- |
| `APIBaseUrl` | Server URL override | From `UInsimulSettings::ServerURL` |
| `WorldID` | World ID override | From `UInsimulSettings::DefaultWorldID` |
| `CharacterID` | This NPC's Insimul character ID | *(empty — set by spawner)* |
| `PlayerCharacterID` | Player's character ID | `"player"` |
| `ConversationCheckInterval` | NPC-NPC proximity check interval (seconds) | `5.0` |
| `ConversationRadius` | NPC-NPC conversation trigger distance (units) | `300.0` |

## Interaction

`AInsimulAICharacter` has a `USphereComponent` (`InteractionSphere`, 200 unit radius) that fires `OnPlayerInteract` when a player pawn overlaps. Call `HandlePlayerInteract(Pawn)` to open the dialogue widget and start a conversation.

For games with their own interaction system, bind your interaction event to call `HandlePlayerInteract(Pawn)` on the NPC.

## Server Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/ws/conversation` | WebSocket | Streaming conversations (text + audio + visemes) |
| `/api/conversations/start` | POST | Start conversation (REST fallback) |
| `/api/conversations/{id}/continue` | POST | Get next utterance (REST fallback) |
| `/api/conversations/{id}/end` | POST | End conversation |
| `/api/worlds/{worldId}/characters` | GET | Fetch characters for spawner |
| `/api/conversation/export/{worldId}` | GET | Export world data for offline mode |
| `/health` | GET | Server health check |
