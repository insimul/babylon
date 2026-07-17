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
