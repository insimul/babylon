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
| `UInsimulPrologSubsystem` | GameInstance subsystem. **Real Prolog** knowledge base (libinsimul, not the legacy substring matcher). Consult/assert/retract/query/snapshot over the game world's logic. See [Prolog subsystem](#prolog-subsystem-real-logic-engine) below. |

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

## Prolog subsystem (real logic engine)

`UInsimulPrologSubsystem` is a **GameInstance subsystem** that owns one real
Prolog knowledge base backed by `libinsimul` (Trealla under the hood). It replaces
the legacy `PrologEngine` substring matcher with a genuine unification engine.
The subsystem is a **thin marshalling layer** — all engine logic lives in the
UE-free `insimul::InsimulKB` core (`Private/Prolog/InsimulKB.h`); the subsystem
only converts between UE reflected types and that core and enforces game-thread
affinity.

### Getting the subsystem

**Blueprint:** `Get Game Instance Subsystem` → class `InsimulPrologSubsystem`.

**C++:**
```cpp
UInsimulPrologSubsystem* Prolog =
    GetGameInstance()->GetSubsystem<UInsimulPrologSubsystem>();
```

The KB is created in `Initialize` and released in `Deinitialize` — one long-lived
KB per GameInstance. Check `IsPrologReady()` before use.

### Blueprint surface

| Function | Kind | Description |
| --- | --- | --- |
| `ConsultWorldData(PrologSource)` → `bool` | Callable | Load a block of Prolog clauses/directives (e.g. the exported world `*.pl`). `false` on syntax error — nothing is loaded then (see `GetLastError`). |
| `AssertFact(Fact)` → `bool` | Callable | Assert one clause as term text **without** a trailing `.` (e.g. `quest(find_sword, active)`). |
| `RetractFact(Fact)` → `bool` | Callable | Retract the first clause unifying with `Fact`. `true` only when a clause was actually removed; a no-match is `false` without setting an error. |
| `QueryFirst(Goal, out Binding)` → `bool` | Callable | First solution of `Goal` into `Binding`. `false` on zero solutions **or** a start error — disambiguate via `GetLastError` (empty vs set). |
| `QueryAll(Goal, out Solutions)` → `bool` | Callable | Every solution of `Goal`. `false` only if the query failed to start; a `true` with an empty array means zero solutions. |
| `SnapshotToString()` → `FString` | Callable | Serialize the KB's dynamic state to a canonical Prolog-text image (for `GameSaveState.prologFacts`). `""` on error. **Clauses only — not `:- op/3` directives.** |
| `RestoreFromString(Image)` → `bool` | Callable | Replace the KB's dynamic state from a snapshot image. `false` on a malformed image (KB unchanged). |
| `GetLastError()` → `FString` | Pure | Message for the last operation, or `""` on success. |
| `IsPrologReady()` → `bool` | Pure | `true` once the KB is created and ready. |
| `GetPrologVersion()` → `FString` | Pure (static) | `libinsimul` version string. |
| `GetBoundValue(Binding, VarName, out Value)` → `bool` | Pure (static) | Look up a named variable in a binding set. |

Goals/facts are term text **without** a trailing `.` (e.g. `parent(tom, X)`).

### Binding types

A solution is an `FInsimulPrologBinding` — an array of `FInsimulPrologVar`
(`Name` + `Value`). `FInsimulPrologValue` is a flattened term:

- `Type` (`EInsimulPrologValueType`: `Atom` / `Int` / `Float` / `List` /
  `Compound` / `Null`)
- `Text` — atom text or a compound's functor
- `IntValue` / `FloatValue` — numeric payloads
- `DisplayString` — the canonical rendered term (always populated)
- `Elements` — rendered list items / compound args

Use the static `GetBoundValue(Binding, "X", ...)` to pull a variable out of a
solution.

### Usage snippet (C++)

```cpp
UInsimulPrologSubsystem* Prolog =
    GetGameInstance()->GetSubsystem<UInsimulPrologSubsystem>();
if (!Prolog || !Prolog->IsPrologReady()) return;

// Load world data + assert a runtime fact.
Prolog->ConsultWorldData(TEXT("parent(tom, bob). parent(bob, ann)."));
Prolog->AssertFact(TEXT("quest(find_sword, active)"));

// Query every solution.
TArray<FInsimulPrologBinding> Solutions;
if (Prolog->QueryAll(TEXT("parent(tom, X)"), Solutions))
{
    for (const FInsimulPrologBinding& Sol : Solutions)
    {
        FInsimulPrologValue X;
        if (UInsimulPrologSubsystem::GetBoundValue(Sol, TEXT("X"), X))
        {
            UE_LOG(LogTemp, Log, TEXT("child = %s"), *X.DisplayString);
        }
    }
}

// Save / load round-trip (GameSaveState.prologFacts).
FString Image = Prolog->SnapshotToString();
// ... later, into a fresh KB ...
Prolog->RestoreFromString(Image);
```

> **Thread affinity:** the KB is single-thread-owned. Every call must run on the
> game thread — off-thread calls are logged and ignored (they return `false`/`""`).

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

## Export pipeline: what gets copied and substituted

Everything under `templates/` is a **game-template tree** the Insimul platform export
pipeline (`insimul-platform/scripts/copy-templates.js`, resolved through
`server/services/game-export/template-paths.ts`) copies **verbatim** into a generated
Unreal game project when a creator exports a world for this engine. The platform then
substitutes `{{UPPER_SNAKE_CASE}}` placeholder tokens in the text files with values
derived from the exported world (world name, genre, counts, palette colors,
player/combat tuning, etc.).

- **The contract is machine-checked.** `templates/TEMPLATE_MANIFEST.json` is the
  authoritative list of every file the pipeline copies and the exact set of
  placeholders each file bears. Root `npm run engines:templates` is the drift guard:
  it fails if the manifest and the tree disagree, if a placeholder-bearing file is
  unlisted, or if any template file reaches into another engine package. Regenerate
  after editing templates with `node scripts/engines/validate-templates.mjs --write`.
- **Placeholder syntax:** `{{TOKEN}}` where `TOKEN` is upper snake case (e.g.
  `{{WORLD_NAME}}`, `{{PLAYER_INITIAL_HEALTH}}`, `{{ROAD_COLOR_R}}`). See the
  manifest's top-level `placeholders` array for the full set this package uses. Note
  the `templates/` tree is distinct from the plugin `Source/` module documented above;
  only `templates/` is consumed by the export pipeline.
- **Dependency rule:** template files depend only on (a) this package, (b) generated
  code, and (c) exported world-data JSON — never on `packages/unity` or
  `packages/godot`. The guard enforces the no-cross-engine-reach-in rule.

## Releasing

`node scripts/release/build-plugin-zip.mjs` stages the plugin into `dist/Insimul/`
(the `.uplugin` at the root plus `Source/`, excluding `templates/` and build
intermediates), zips it to `dist/Insimul-<version>.zip` in FAB/Marketplace layout,
and asserts the file set. It does **not** publish. See the repo-root
`docs/RELEASING.md` for the full version-bump + submission flow (`VERSIONS.json` is
the single version source).
## Type provenance

Insimul's C++ types fall into three tiers. **Only the *generated* tier is derived
from the canonical `@insimul/core` schemas** (regenerate with `npm run codegen`
from the `insimul-runtime` root); the others are hand-maintained and stay that way.

| Tier | Files | Source of truth | Editable? |
| --- | --- | --- | --- |
| **Generated** | `Source/InsimulRuntime/Generated/InsimulGenerated.h` — plain `Insimul::Generated` structs (`SaveFile`, `SaveFileEnvelope`, `WorldIr` + nested) with `from_json`/`to_json` | `packages/core/schemas/{save-file,save-envelope,world-ir}.schema.json` | **No** — `npm run codegen`, drift-guarded (`codegen:verify-cpp`) |
| **Hand-written (SDK)** | `Source/InsimulRuntime/Public/InsimulTypes.h` (the reflected `FInsimul*` UStructs Blueprints bind to — proto-derived conversation + provider types), `InsimulWorldExport.h` (the distilled `FInsimulExportedWorld` offline-export shape), and the plugin runtime (components/actors/widgets/subsystems/networking) | Hand-maintained (engine-facing / proto-derived) | **Yes** |
| **Template-legacy** | `templates/source/data/*.h` — ~16 parallel re-declarations (`CharacterData.h`, `QuestData.h`, `SettlementData.h`, …) vendored into exported games | Hand-maintained (drift-prone) | Retired by the per-engine Unreal runtime PRD — **not** this PRD |

**UStruct boundary:** the generated plain structs are the wire/DTO layer; the
hand-written `FInsimul*` UStructs in `InsimulTypes.h` convert at the boundary. See
`Source/InsimulRuntime/Generated/README.md` for the convention.

**Why nothing in the plugin was migrated to `Insimul::Generated`:** no live plugin
type duplicates a generated schema DTO. `FInsimulExportedWorld` is the *distilled
offline export* (`GET /api/conversation/export/{worldId}` → `world_export.json`) —
a flattened dialogue-context shape, **not** the full `WorldIr` — so it stays
hand-written. New save/load or World-IR code should convert through
`Insimul::Generated` at the boundary.
