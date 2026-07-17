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

## Export pipeline: what gets copied and substituted

Everything under [`templates/`](templates/) is a **game-template tree** the Insimul
platform export pipeline (`insimul-platform/scripts/copy-templates.js`, resolved
through `server/services/game-export/template-paths.ts`) copies **verbatim** into a
generated Unity game project when a creator exports a world for this engine. The
platform then substitutes `{{UPPER_SNAKE_CASE}}` placeholder tokens in the text files
with values derived from the exported world (world name, genre, counts, palette
colors, player/combat tuning, etc.).

- **The contract is machine-checked.** [`templates/TEMPLATE_MANIFEST.json`](templates/TEMPLATE_MANIFEST.json)
  is the authoritative list of every file the pipeline copies and the exact set of
  placeholders each file bears. Root `npm run engines:templates` is the drift guard:
  it fails if the manifest and the tree disagree, if a placeholder-bearing file is
  unlisted, or if any template file reaches into another engine package. Regenerate
  after editing templates with
  `node scripts/engines/validate-templates.mjs --write`.
- **Placeholder syntax:** `{{TOKEN}}` where `TOKEN` is upper snake case (e.g.
  `{{WORLD_NAME}}`, `{{PLAYER_INITIAL_HEALTH}}`, `{{ROAD_COLOR_R}}`). See the
  manifest's top-level `placeholders` array for the full set this package uses.
- **Dependency rule:** template files depend only on (a) this package, (b) generated
  code, and (c) exported world-data JSON — never on `packages/unreal` or
  `packages/godot`. The guard enforces the no-cross-engine-reach-in rule.

## Releasing

`npm run --workspace=com.insimul.sdk release:dry-run` (or `node
scripts/release/pack-upm.mjs`) builds the UPM tarball into `dist/` via `npm pack`
and asserts its layout — SDK sources only, no `templates/` tree — then prints an
OpenUPM readiness checklist. It does **not** publish. See the repo-root
`docs/RELEASING.md` for the full version-bump + publish flow (`VERSIONS.json` is
the single version source).
## Native library (libinsimul)

The real Prolog engine (`Runtime/Prolog/InsimulProlog.cs`) P/Invokes the native
**libinsimul** library. Those binaries are **fetched, not committed** — see
`Runtime/Plugins/README.md` for the full layout and import-settings table.

### Fetch the binaries

```bash
packages/unity/scripts/fetch-native.sh                       # ../insimul-native/dist
packages/unity/scripts/fetch-native.sh --dist /path/to/dist  # explicit dist root
packages/unity/scripts/fetch-native.sh --url  https://…/dist.tar.gz
```

The script drops each platform's library into `Runtime/Plugins/{macOS,Windows/*,
Linux/*}/`, `lipo`-combines the two macOS slices into one universal2 dylib, and
cross-checks the fetched `VERSION` against the wrapper's expected ABI (warning
loudly on drift).

### Per-platform import settings

`.meta` files can't be hand-authored for fetched binaries, so
`Editor/InsimulNativeImporter.cs` (an `AssetPostprocessor`) derives the
`PluginImporter` platform/CPU/editor flags from each binary's folder on import.
Re-apply manually with **Insimul > Reimport Native Plugins**.

| Folder                | Platform             | CPU                    | Editor |
|-----------------------|----------------------|------------------------|--------|
| `macOS/`              | Standalone macOS     | x64+ARM64 (universal2) | ✔ on macOS |
| `Windows/x86_64/`     | Standalone Windows64 | x86_64                 | ✔ on Windows |
| `Windows/arm64/`      | Standalone Windows64 | ARM64                  | — |
| `Linux/x86_64/`       | Standalone Linux64   | x86_64                 | ✔ on Linux |
| `Linux/arm64/`        | Standalone Linux64   | ARM64                  | — |

### Version handshake

`InsimulProlog.ExpectedNativeSemver` records the ABI this wrapper was built
against. Call `InsimulProlog.VerifyNativeVersion()` once at startup — it throws
`InsimulPrologException` on a MAJOR.MINOR mismatch (a differing PATCH is
compatible), so a stale or wrong native binary fails loudly instead of silently
corrupting marshaling.

### IL2CPP

The C ABI is **poll-only** (no callbacks), so the wrapper is IL2CPP-safe with no
`[MonoPInvokeCallback]`. Keep the `DllImport` base name `insimul` a compile-time
constant. `System.Text.Json.dll` (+ transitive deps) must be present in a
`Plugins/` folder for the asmdef to compile and for IL2CPP to link it — a human
drop-in, not fetched by the script. See `Runtime/Plugins/README.md` for details.

## Native Prolog conformance tests

The SDK ships a real Prolog engine (`Runtime/Prolog/InsimulProlog.cs`, backed by
the native `libinsimul` library — see `Runtime/Plugins/README.md`). Its behaviour
is pinned by a language-neutral golden corpus at
`packages/core/conformance/prolog/*.json` (41 cases across unification,
backtracking, lists, negation, arithmetic, assert/retract, and gameplay
predicates). The **same JSON** is the cross-engine parity gate for the TypeScript
`tau-prolog` engine, so any divergence is caught here rather than in gameplay.

Two harnesses run the identical loading + comparison logic
(`Tests/Editor/ConformanceCorpus.cs`, compared as an **unordered multiset** per
`conformance/README.md`):

- **Host / CI (authoritative):** `tools/verify-unity/run.sh` builds `libinsimul`,
  puts it on the loader path, and runs all corpus cases under `dotnet` — no Unity
  editor required.
- **In-editor (EditMode):** the `Insimul.Tests.Editor` assembly
  (`Tests/Editor/`) exposes each case as an NUnit test via **Window > General >
  Test Runner > EditMode**. Requirements to run in-editor:
  1. The native library present under `Runtime/Plugins/…` (`scripts/fetch-native.sh`).
  2. `System.Text.Json.dll` (+ transitive deps) dropped into a `Plugins/` folder —
     the same DLL the runtime asmdef needs (see `Runtime/Prolog/CLAUDE.md`).
  3. The corpus reachable on disk. When the package is installed outside the
     monorepo, point `INSIMUL_CONFORMANCE_DIR` at the conformance root; otherwise
     the corpus test reports *Inconclusive* (ignored) rather than failing.

**Radiant conformance is skipped** in both harnesses: the native ABI
(`insimul-native/include/insimul.h`) exposes no radiant tick yet. This is tracked
as an explicitly-ignored test (`RadiantConformance_SkippedUntilNativeTick`) and a
`SKIP` line in the host harness; enable it when the libinsimul radiant story lands
a tick entry point.

## License

MIT
