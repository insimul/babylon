# Insimul Unreal Export — Integration Guide

**World:** {{WORLD_NAME}}  ·  **Genre:** {{GENRE_NAME}}  ·  **Insimul runtime:** {{INSIMUL_VERSION}}
**Engine:** Unreal Engine 5.7

This guide explains how the exported project is wired and how to run it in the
three supported execution modes. For asset-wiring details see
`Content/Data/ASSET_SETUP.md`.

---

## 1. First-time setup

From the project root:

- **macOS / Linux:** `chmod +x setup.sh && ./setup.sh` (or double-click `Setup.command` on macOS)
- **Windows:** double-click `setup.bat`

`setup.sh` runs four steps headlessly against your UE 5.7 install:

1. **Build** the `InsimulExport` C++ modules.
2. **CreateLevel** commandlet → generates `Content/Maps/MainWorld` from the JSON
   level descriptor (`Content/Data/LevelDescriptor.json`).
3. **ImportInsimulAssets.py** → imports bundled GLB/FBX/textures/audio under
   `Content/` as UE assets.
4. **GenerateInsimulContent.py** → builds the UI **Widget Blueprints** and imports
   the bundled **fonts** (see §3 and §4 — this step is required for the UI to render).

If the script can't find your engine, set `UE_ENGINE_DIR` and re-run, e.g.
`export UE_ENGINE_DIR="/Users/Shared/Epic Games/UE_5.7"`.

Then open `InsimulExport.uproject`, open `Content/Maps/MainWorld`, and press Play.

---

## 2. Execution modes (AI conversation)

NPC conversation/AI is configured through `UInsimulSettings`
(`Plugins/Insimul/Config/InsimulConfig.ini`, generated for this world). The same
provider model as the `@insimul/sdk` applies — Chat / TTS / STT are independent.

### A. Server mode (default)
Talks to a running Insimul server over REST + WebSocket.

```
ChatProvider=Server
TTSProvider=Server
ServerURL=http://localhost:8080
DefaultWorldID={{WORLD_ID}}
bPreferWebSocket=true
```

Start the server (or point `ServerURL` at a hosted instance), then Play.

### B. Offline mode (local LLM via Ollama)
No server required — runs against a local Ollama (or llama.cpp) endpoint and the
bundled world data.

```
ChatProvider=Local
TTSProvider=Local            ; requires the Fab "Runtime Text To Speech" plugin
LocalLLMServerURL=http://localhost:11434/api/generate
LocalLLMModel=mistral
WorldDataPath=InsimulData/world_export.json
MaxTokens=256
Temperature=0.7
```

Setup: `ollama serve` then `ollama pull mistral`. Character personalities, greetings
and knowledge ("truths") are read from `Content/InsimulData/world_export.json`.

### C. Offline mode (in-process llama.cpp)
As (B) but set `LocalModelPath` to a local `.gguf` and leave `LocalLLMServerURL`
empty. Export with the AI bundle option to ship a model alongside the game.

> Supported local URL formats: Ollama `/api/generate`, Ollama-chat `/api/chat`,
> otherwise a llama.cpp-style completion endpoint.

---

## 3. UI Widget Blueprints (why step 4 matters)

The generated UI is implemented in C++ (`UDialogueWidget`, `UInsimulMinimap`, …).
Those widgets declare their sub-widgets with `meta = (BindWidget[Optional])` and do
all their logic in C++, **binding the sub-widgets by name**. Created against the bare
C++ class they have no widget tree, so every bound pointer is null and the UI renders
an empty root.

`GenerateInsimulContent.py` (setup step 4) creates a Widget Blueprint per C++ widget
under `/Game/UI/WBP_*` whose widget tree contains the correctly-named bound children,
so the bindings resolve. The live widgets (`WBP_Dialogue`, `WBP_Minimap`) are loaded
automatically by the C++ with a fallback to the bare class.

- The generated WBPs are a **functional baseline** (named widgets, default layout).
  Re-skin them in UMG freely — **just keep the bound widget names** or the C++ bindings
  break.
- The remaining WBPs (`WBP_ChatPanel`, `WBP_QuestTracker`, `WBP_QuestOfferPanel`,
  `WBP_GameMenu`, `WBP_DocumentReader`, `WBP_ActionQuickBar`, `WBP_IntroSequence`) are
  authored for you but not auto-instantiated yet — assign them where you add those
  widgets (e.g. a HUD `TSubclassOf` slot).

---

## 4. Fonts (non-Latin target languages)

`Content/Fonts/` ships Noto faces (Latin/Cyrillic/Greek + Arabic/Devanagari/Hebrew/Thai;
CJK when available at export time). Step 4 imports them as `UFont` assets and applies
the preferred face to the generated UI text, so target-language dialogue renders glyphs
instead of tofu boxes. To add scripts not bundled, drop the `.ttf/.otf/.ttc` into
`Content/Fonts/` and re-run `GenerateInsimulContent.py`. Fonts are SIL OFL 1.1
(`Content/Fonts/LICENSE-Noto.txt`).

---

## 5. Lip-sync / face animation (requires character morph targets)

The lip-sync system (`ULipSyncController`) and the plugin's `UInsimulFaceSync` drive
**skeletal-mesh morph targets** — they do not use baked curve or submix assets. For
visible mouth movement your imported character meshes must expose morph targets named
`JawOpen`, `LipsClosed`, `LipsOpen` (or a viseme set mapped via
`UInsimulFaceSync::VisemeToMorphTarget`). Meshes without morph targets fall back to
jaw-bone rotation if a skeleton is present, or no facial motion otherwise. The bundled
modular NPC bodies are static meshes — supply a skeletal mesh with visemes (e.g. a
MetaHuman or ARKit-blendshape character) to enable lip-sync.

---

## 6. Server endpoint contract (Server mode)

| Endpoint | Purpose |
| --- | --- |
| `WS /ws/conversation` | Streaming text + TTS audio + visemes |
| `POST /api/conversations/*` | REST conversation lifecycle |
| `GET /api/worlds/{id}/characters` | Spawn/character roster |
| `GET /api/quests/character/:id`, `/api/quests/player/:name` | Quest data |
| `POST /api/tts`, `POST /api/stt` | Cloud TTS / STT |
| `POST /api/external/telemetry/batch` | Telemetry (auto-wired, optional) |
| `GET /health` | Health check |

---

*Generated for {{WORLD_NAME}} · {{EXPORT_TIMESTAMP}}*
