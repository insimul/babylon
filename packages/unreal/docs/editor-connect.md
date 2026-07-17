# Editor Connect — backend session, transport, and secret storage (US-XE1/US-XE2)

The in-editor panels (World Browser, Generation Console, Conversation Tester)
talk to the Insimul backend v1 API through **one shared session**. This document
records the architecture and — the security-sensitive part — **where the auth
token is stored and why it never lands in version control**.

## Layers

```
InsimulEditor/
  Portable/                         UE-FREE, host-tested (clang, no UBT/engine)
    InsimulV1Operations.{h,cpp}     the {operationId -> method, path} table,
                                    a verbatim mirror of
                                    packages/core/openapi/operations.json
    InsimulEditorSession.{h,cpp}    FEditorSession: base URL + token lifecycle
                                    over injected IEditorTransport / IEditorSecretStore
  Private/Connect/                  UE-COUPLED, syntax-gated only
    InsimulEditorHttpTransport.*    IEditorTransport over FHttpModule
    InsimulEditorSecretStore.*      IEditorSecretStore over GEditorPerProjectIni
    InsimulEditorSessionService.*   process-wide owner of the shared FEditorSession
  Tests/test_editor_session.cpp     host gate (36 cases): operation-table
                                    conformance + full session lifecycle
```

The **pure core** carries no `CoreMinimal.h`, no `FString`/`TArray`, no HTTP — so
the operation table and the entire login → token → authed-call → 401 → re-auth
lifecycle run headless over a mocked transport. Run it with:

```
npm run engines:unreal:connect      # (also part of npm run engines:check)
```

It is the exact mirror of the Unity leg (`EditorSessionTests`) and the Godot leg
(`operations.test.ts` + `insimul_editor_session.gd`), so the three engines'
editor clients can never diverge. The operation table is pinned to
`operations.json`; a spec change that regenerates that file fails the host gate
until this table is updated in lock step.

## Token lifecycle

- **Login(token)** stores the token, then verifies it via `healthCheck`. On a 2xx
  the token is kept and `NeedsReauth` is cleared; on **401/403 the token is
  CLEARED** — an invalid credential is never left persisted.
- **AuthenticatedRequest** attaches `Authorization: Bearer <token>`. A **401/403
  clears the token and raises `NeedsReauth`**, the state the panels observe to
  surface a "re-authenticate" affordance. A successful login clears it again.

## Secret storage — the US-XE1 invariant

**No token is ever serialized into a committed asset or config.**

The split:

| value | where it lives | committed? |
| --- | --- | --- |
| server base URL (non-secret) | `UInsimulSettings::ServerURL` → `Config/DefaultGame.ini` | yes (shared, safe) |
| **auth bearer token (secret)** | `GEditorPerProjectIni` via `GConfig`, section `[Insimul.Editor.Connect]` | **no** |

`GEditorPerProjectIni` resolves to
`Saved/Config/<Platform>/EditorPerProjectUserSettings.ini` — a **per-user, per-
machine** file under `Saved/`, which every Unreal `.gitignore` excludes and which
is never part of the project source or a packaged build. This is the Unreal
equivalent of Unity's `EditorPrefs` and Godot's `EditorSettings` token slot: a
per-user editor store outside the tracked project.

`FInsimulEditorSecretStore` is the **only** writer of the token, and it writes
**only** to `GEditorPerProjectIni`. The token key is scoped by a hash of the
project directory so two projects opened by the same editor user never share a
token. `UInsimulSettings` deliberately holds **no** editor-session token field —
its existing `APIKey` (config = Game) is a separate runtime concern and is not
used by the editor session.

The enforcement point is the seam: `FEditorSession` never persists the token
itself — it hands it to the injected `IEditorSecretStore`. Host tests exercise the
lifecycle through `FInMemorySecretStore`; production swaps in the
`GEditorPerProjectIni`-backed store with no change to the pure logic.

## World Browser (US-XE2)

The first panel on top of the session is the **World Browser** — worlds
list/detail/stats, a snapshot-version compatibility badge, an Import/Sync action
(into the unreal-scene-pcg pipeline, with the dry-run report), and an open-in-web
link. Same split as the session:

```
InsimulEditor/
  Portable/                              UE-FREE, host-tested
    InsimulWorldBrowserModel.{h,cpp}     FWorldBrowserModel: parse listWorlds /
                                         getWorldDetail, list+detail+selection
                                         reducer, compatibility badge, open-in-web
                                         URL, Import/Sync orchestration over the two
                                         injected seams (ISceneImportPipeline +
                                         IImportedWorldRegistry)
  Private/Connect/                       UE-COUPLED, syntax-gated only
    InsimulImportedWorldRegistry.*       IImportedWorldRegistry over GEditorPerProjectIni
    InsimulSceneImportPipeline.*         ISceneImportPipeline -> UInsimulReimport
                                         (US-XG2 placement + US-XG4 re-import diff)
  Tests/test_world_browser.cpp           host gate (27 cases): parsing, list load
                                         (incl. 401 re-auth), detail merge, selection
                                         reducer, badge, open-in-web, import wiring
```

Run it with `npm run engines:unreal:world-browser` (also part of
`npm run engines:check`). It is the case-for-case mirror of the Unity leg
(`WorldBrowserTests`) and the core `world-browser.test.ts`.

**Compatibility badge = imported snapshot version vs the world's current snapshot
version.** The per-project record of "which snapshot of world X is imported here"
is per-USER state, so it lives in `GEditorPerProjectIni` exactly like the token
(section `[Insimul.Editor.ImportedWorlds]`, keys scoped by a hash of the project
directory) — **never** an asset and never `UInsimulSettings`. Two editor users on
the same checkout track their own imports. `NotImported → UpToDate →
UpdateAvailable (stale) → Ahead` is derived purely from that record vs the world's
`snapshotVersion`; a successful **Sync/Apply** writes the world's snapshot version
back so the badge flips to **Up to date**.

**Import/Sync is the local scene pipeline, not a server mutation.** The model
fetches the world IR export (`importWorld`), then hands it to
`FInsimulSceneImportPipeline`, which delegates to `UInsimulReimport::DryRun/Apply`
(the US-XG2 placement + US-XG4 conservative re-import diff). A dry run only
previews the `+added / ~updated / -deprecated (… unchanged, … hand-edited)`
counts; an apply mutates the scene under one Undo group (hand edits preserved,
dropped generated nodes reparented under **Deprecated**, never deleted). When no
level is open the pipeline reports **unavailable** and the Import action is
disabled — no backend call is made.

## Generation Console (US-XE3)

The Generation Console invokes a backend generator (settlement regenerate /
character batch / quest generation) against the connected world as a **job**, then
tracks its progress live and, on success, offers a "Sync IR now…" affordance that
re-runs the World Browser import path against the freshly-generated world.

```
InsimulEditor/
  Portable/                              UE-FREE, host-tested
    InsimulGenerationConsoleModel.{h,cpp}  FGenerationConsoleModel: start body,
                                         status/event/diff parsing, the job
                                         lifecycle reducer (Idle → Starting →
                                         Queued → Running → Completed/Failed/
                                         Canceled) drained from an injected
                                         IJobStream in Pump()
    InsimulJobPoller.{h,cpp}             FJobPoller (the host-testable timer
                                         abstraction over IScheduler + a fetch
                                         seam) + FPollingJobStream (the poller
                                         buffering events as an IJobStream)
  Private/Connect/                       UE-COUPLED, syntax-gated only
    InsimulHttpJobStream.*               FInsimulTimerScheduler (FTimerManager),
                                         FInsimulHttpJobStream(Factory) (one
                                         getGenerationJob poll per interval via
                                         FHttpModule through the shared session)
  Tests/test_generation_console.cpp      host gate (36 cases): body+parsing, the
                                         lifecycle over a scripted stream, start
                                         guards (401 re-auth / no world / stream
                                         unavailable / refused-while-active),
                                         cancel/dispose/reset, and the FJobPoller
                                         leak-free teardown + cap + end-to-end
```

Run it with `npm run engines:unreal:generation` (also part of `npm run
engines:check`). It is the case-for-case mirror of the Unity leg
(`GenerationConsoleTests`) and the core `generation-console.test.ts` /
`job-poller.test.ts`.

**Streaming choice = POLLING (not edit-mode SSE).** The `startGenerationJob` call
returns a job id; progress is then delivered by **polling** `getGenerationJob` on
an interval, NOT by holding an SSE (`streamGenerationJob`) response open in the
editor. Edit-mode SSE would need a streaming HTTP response re-established after
every domain reload (Hot Reload / Live Coding recompile, or a PIE enter tears down
module state) — brittle and easy to leak. A poll survives a reload because the
window simply re-opens the stream for the same job id when the tab is
reconstructed. This matches the Unity/Godot decision so the three consoles stay in
lockstep. (`streamGenerationJob` remains in the operation table as the documented
fallback transport — the WS/SSE client — but is not the edit-mode default.)

**No leaked tickers after shutdown.** All the timer/request ownership lives in the
UE-free, host-tested `FJobPoller`: exactly one poll is in flight at a time (the
next is scheduled only after the current returns), and `Dispose()` clears any
pending timer **and** flips a disposed flag so a fetch callback that returns *after*
teardown is dropped — no `OnUpdate`, no next poll. So the window's teardown (on a
domain reload / editor shutdown) or `Cancel()` disposes the stream (→ the poller),
and nothing runs afterward — no orphaned ticker, no zombie request. The production
`FInsimulTimerScheduler` backs `IScheduler` with `FTimerManager` (`ClearTimer`
cancels the pending fire); the leak-free property is proven host-side over a fake
clock (`test_generation_console.cpp`, the `job poller` block).

**Sync-now.** A completed job sets `OffersSync()` + exposes the entity-count diff
(`Result()`: added / updated / removed). The window turns that into a "Sync IR
now…" button that re-runs the World Browser's `ApplyImport` for the same world —
the generation happened server-side, so the local scene picks up the new world IR
through the same US-XG2/US-XG4 re-import pipeline. The v1 API has no cancel
endpoint, so `Cancel()` is client-side only: it stops the editor tracking the job
(disposing the poll loop); the server job may still finish.

## Conversation Tester (US-XE4)

The Conversation Tester lets a creator **talk to any character of the connected
world from the editor**: it loads the world's characters (via `getWorldDetail`)
into a picker, streams each turn's reply from the conversation SDK's
`streamConversation` (`/api/conversation/stream`) SSE endpoint, and keeps the
exchange in an inspectable transcript (**You** / **NPC** lines).

```
InsimulEditor/
  Portable/                              UE-FREE, host-tested
    InsimulConversationTesterModel.{h,cpp}  FConversationTesterModel: the per-turn
                                         state machine (Idle → Sending → Streaming →
                                         Idle/Error), character-list + SSE parsing,
                                         send guards, and the multi-turn transcript
                                         over one session id, drained from an injected
                                         IConversationStream in Pump()
  Private/Connect/                       UE-COUPLED, syntax-gated only
    InsimulHttpConversationStream.*      FInsimulHttpConversationClient +
                                         FInsimulHttpConversationStream: one
                                         non-blocking streamConversation POST via
                                         FHttpModule through the shared session,
                                         buffering the parsed SSE events; disposal
                                         aborts the in-flight request
  Tests/test_conversation_tester.cpp     host gate (30 cases): parsing, character load
                                         (incl. 401 re-auth), send guards, the turn
                                         lifecycle over a scripted stream, multi-turn
                                         session sharing, character-switch reset, and
                                         dispose-on-teardown
```

Run it with `npm run engines:unreal:conversation` (also part of
`npm run engines:check`). It is the case-for-case mirror of the Unity leg
(`ConversationTesterTests`) and the core `conversation-tester.ts`.

**Edit-mode constraint — text streaming works in edit mode; audio does not.** The
production stream drives **one non-blocking `FHttpModule` POST** and parses the same
`data: {json}` SSE the runtime conversation client emits, buffering the events for
the model to drain in `Pump()` — no running game world (no PIE) is required for the
**text** transcript. Audio **playback** and lip sync are **not** available in the
tester: they need the runtime audio components (`AInsimulAICharacter`'s
`SpeechAudioComponent` / procedural sound wave). The tester reports how many TTS
audio chunks a reply returned (`AudioChunkCount()`) but never plays them; drive a
Play-mode scene with the runtime `InsimulConversationComponent` to hear audio.

**Reply streaming bypasses `AuthenticatedRequest`.** Character load goes through the
shared session's `AuthenticatedRequest` (so a 401/403 clears the token + arms
`NeedsReauth`), but the reply stream issues its POST directly (like the Generation
Console poll). So a 401 **mid-stream** is a conversation **error**, not an immediate
session re-auth; the next `AuthenticatedRequest` (e.g. a World Browser refresh)
re-arms `NeedsReauth`.

**Domain-reload safety.** The window subscribes a tick (→ `model.Pump()` each frame)
and calls `model.Dispose()` when the tab is torn down. `Dispose()` releases the
stream; the production `FInsimulHttpConversationStream`'s destructor flips a shared
"alive" flag (so a completion callback that fires after teardown is dropped) **and**
cancels the in-flight `FHttpModule` request — the same zombie-response guard the
Generation Console's poller gives, so no orphaned request survives a recompile /
Live Coding pass / entering Play mode. Switching characters starts a fresh
conversation (new session id, cleared transcript); the two turns of a conversation
share one session id.
