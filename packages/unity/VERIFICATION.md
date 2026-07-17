# Insimul Unity Runtime — Human Verification Checklist (US-UC5)

The portable runtime cores (`InsimulWorldSource`, `InsimulSaveSystem`,
`InsimulQuestRuntime`, `InsimulRadiantEngine`, and the `InsimulRuntimeContext`
startup orchestrator) are all **UnityEngine-free** and are proven cross-runtime by
the host harness + the TS drift guards, which run **without** a Unity editor. This
document is the **human pass**: the things only a real Unity editor + play session
can confirm — the structural-gate-only MonoBehaviour seam and the full gameplay
loop end-to-end.

Everything in §1–§2 has an automated proxy that is already green (see the harness
commands in §0 and [MIGRATION.md](./MIGRATION.md)); the human is confirming an
already-proven sequence, not debugging it. `autoMerge` is **off** for this branch
precisely so a human runs this checklist before merge.

## 0. Automated pre-checks (run before the human pass)

These must all be green first — they gate the portable semantics the loop below
exercises.

- [ ] Root type-check: `npm run check` → exit 0.
- [ ] Root tests: `npm test` → all green (codegen drift + save-integrity + quest +
      radiant drift guards that pin the C# output to the TS authority).
- [ ] Native engine gate: `npm run engines:check` → OK. Runs the Unity C#
      structural syntax gate always; on a **.NET SDK box** it also runs the pure
      host harness (`tools/verify-unity/run.sh --pure`, which includes
      `RunBootstrapTests` — the full-loop proof for `InsimulRuntimeContext`) and the
      save-portability cross-check.
- [ ] On a .NET SDK box: `bash tools/verify-unity/run.sh` → all Cases pass
      (`Runtime context / bootstrap (US-UC5, pure)` among them), and the
      `C#-produced envelope validates` cross-check flips from PEND to PASS.

## 1. Build / editor-import gates (Unity editor required)

The UnityEngine-coupled files are structural-gate only and are NOT compiled by the
host harness. Confirm they import + compile in the editor:

- [ ] Open the exported/template project; the editor compiles with **no** errors in
      `templates/scripts/core/InsimulRuntimeBootstrap.cs` and the four Runtime
      cores it drives.
- [ ] The `System.Text.Json` assembly is present under `Runtime/Plugins/` (the
      generated DTOs + save/world cores need it — `JsonUtility` cannot round-trip
      the schema-faithful shapes; see MIGRATION.md).
- [ ] The EditMode test assembly compiles `Tests/Editor/BootstrapTests.cs`; Test
      Runner (EditMode) shows the `BootstrapTests` fixture green.

## 2. Full gameplay loop (Play mode)

Drive the whole loop the way the automated `RunBootstrapTests` host test does, but
in the live editor. Use the golden world (a `worldSnapshot`-bearing save or a
WorldIR export placed at `StreamingAssets/world/world.json`).

### New game on the golden world

- [ ] Add an empty GameObject with `InsimulRuntimeBootstrap`; set
      `worldRelativePath` to the golden world and `saveSlot` to an **empty** slot.
- [ ] Enter Play with no existing save. The log shows
      `Runtime booted (new game): N characters, M quests`.
- [ ] The world source's characters/quests match the golden world (not a hardcoded
      or server list) — `Runtime.World.Characters` / `Runtime.Quests`.

### Accept / offer a radiant quest

- [ ] Call `InsimulRuntimeBootstrap.Instance.RadiantTick(now)` (wire it to the
      quest-board-open / time-tick UI). A radiant-tagged quest is offered
      **deterministically** — re-running Play from the same state offers the same
      quest id/content (seeded RNG, no wall-clock).
- [ ] The generated quest appears in `Runtime.Quests` and fires
      `OnRadiantQuestGenerated`.

### Complete an objective

- [ ] Trigger an objective in-world (talk to the target NPC / satisfy the objective).
      The template `QuestSystem` event feeds a trigger fact into the runtime KB
      (`InsimulRuntimeBootstrap.WireQuestEvents`), then `EvaluateAllQuests` fires
      `OnObjectiveCompleted`, and `OnQuestCompleted` once all objectives are
      satisfied — and a `quest_complete(<id>)` fact is asserted into the KB.

### Save

- [ ] Call `InsimulRuntimeBootstrap.Instance.SaveToSlot()`. A canonical,
      integrity-stamped envelope is written under
      `Application.persistentDataPath/saves/slot-<N>.json`.
- [ ] (Optional, the cross-runtime property, §5.2 B2) Copy that slot to a Babylon
      build (or run the golden Babylon-produced save through this system) and
      confirm it still verifies + loads.

### Reload

- [ ] Stop and re-enter Play with the **same** slot. The log shows
      `Runtime booted (resumed save): …`; `DidResumeSave` is true.
- [ ] Quest + radiant progress is intact: the completed quest stays completed, the
      offered radiant quest is still present (KB facts round-tripped through
      `currentState.prologFacts`).
- [ ] The `worldSnapshot` hash is unchanged across the save/reload boundary (a
      `currentState`-only mutation must never perturb the world hash) — the host
      `CommitToSave_WorldSnapshotHashStable` test asserts this; confirm no
      world-drift warnings in the log.

### Resilience

- [ ] Corrupt the slot file (truncate it) and re-enter Play. The log warns
      `Slot <N> unreadable … — starting a new game` and boots a **new game**
      instead of bricking — matching `Boot_CorruptSave_FallsBackToNewGame`.

## 3. Deliberate deltas vs the Babylon behaviour reference

**Target: zero.** Unity ports the semantics authority (`packages/core`,
TypeScript; the Babylon runtime is the behaviour reference) byte-for-byte where it
matters — the save envelope + integrity, the quest hydration/completion, and the
radiant generation are all pinned by the shared corpora + drift guards the §0
pre-checks run. There are **no intentional observable behaviour deltas** at the
Unity seam. The only non-semantic, seam-level differences (none change
save/quest/world semantics) are:

| Difference | Where | Why it is NOT a semantic delta |
| ---------- | ----- | ------------------------------ |
| Slot timestamps (`createdAt` / `lastSavedAt` / envelope `exportedAt`) use `DateTime.UtcNow` at write time. | `InsimulRuntimeBootstrap` / `PersistentDataSaveStore` | Timestamps are identity metadata; the integrity hash covers the `saveFile` only, and the golden fixtures use fixed timestamps so the byte-pin holds. The host tests pass a fixed `CreatedAt`/`exportedAt`. |
| Serialization uses `System.Text.Json` + a hand-rolled `CanonicalJson` writer, not `JsonUtility`. | save/world cores | Required for schema fidelity (`JsonUtility` drops `Dictionary`/`object[]`); canonical output is byte-identical to the TS authority (proven by the integrity vectors). |
| On boot a resume re-registers every world quest (firing `OnQuestAccepted`) before restoring completion from the KB. | `InsimulRuntimeContext.Rehydrate` | The quest roster is derived from the read-only world source each session (never persisted); completion is restored from `currentState.prologFacts`, so the observable end state matches the Babylon reload. |

Any delta discovered during the human pass that is **not** listed here is a bug —
file it against this story rather than accepting it.

## 4. Binding Editor window (US-UB5, Unity editor required)

The suggestion + taxonomy-grouping logic and the binding-pack round-trip are
UnityEngine-free and host-tested (`tools/verify-unity`, `RunBindingEditorTests`
— suggestion ranking, real/placeholder/unbound status, pack export→import→export
identity, and golden byte-parity). This is the **human pass** for the EditorWindow
seam (structural-gate-only) — the AssetDatabase pickers, thumbnails, and file I/O
only a real editor can exercise.

- [ ] Open **Insimul ▸ Binding Editor**. Click **Load World IR…** and choose the
      golden world's IR JSON. The tree fills with the archetypes the world uses,
      grouped by taxonomy root (`building`, `npc`, `item`, `prop`, `terrain`).
- [ ] With **no** project table, every used archetype shows **amber**
      "(placeholder)" — the bundled pack covers them all. The header reads
      `N / N archetypes bound`.
- [ ] Select a `building.*` row; the **Suggestions** panel ranks project prefabs by
      name/tag match (highest score first) with mini-thumbnails. Click **Use** on a
      custom bakery prefab (or **Bind…** and pick one). The row flips to **green**
      and shows the asset path; a `ProjectBindingTable.asset` is created/updated
      under `Assets/Insimul/` with the entry (sorted).
- [ ] Run **Insimul ▸ Generate Scene From World IR** (or Re-import). The bound
      custom prefab is instantiated at that archetype's placements instead of the
      placeholder primitive — the bind flows through to generation.
- [ ] **Export Pack…** writes a `binding-pack.json`. Open it: keys are sorted,
      minified canonical JSON. **Import Pack…** it back into a fresh project table
      and confirm the entries are identical (the round-trip the host test pins).
- [ ] Bind a **non-leaf** key (e.g. `building` via **+desc**) and confirm every
      `building.*` descendant with no more-specific entry now resolves to that
      prefab (descendant matching in the resolver), while a more specific
      `building.commercial.bakery.medium` entry still wins for that key.

## 5. World Browser — connect + browse + import (US-UE2, Unity editor + backend required)

The World Browser's parsing, selection, compatibility-badge, and import
orchestration all live in the UnityEngine-free `InsimulWorldBrowserModel`, unit-
tested headless over a RoutingTransport + fake registry/pipeline
(`WorldBrowserTests`, EditMode). This is the **human pass** for the two
UnityEditor-coupled seams that only a real editor + backend can exercise: the
`UnityWebRequestEditorTransport` HTTP path and the `UnitySceneImportPipeline`
bridge into the US-UB3/US-UB4 scene generation + re-import diff. A running backend
(`InsimulConnectionSettings.ServerUrl`) with at least one world on the account is
required.

- [ ] In **Project Settings ▸ Insimul**, set the server URL and authenticate
      (world API key or user login). Open **Insimul ▸ World Browser** and click
      **Refresh worlds**. The account's worlds list, each showing name, genre
      bundle, `snapshot vN`, and NPC / Settlement / Quest counts.
- [ ] Every never-imported world shows the **Not imported** badge. Expand one and
      confirm the counts match the world's detail on the web.
- [ ] Click **Open in web** — the browser opens `…/worlds/<id>` for that world.
- [ ] Click **Preview Sync (dry run)**. A report line appears
      (`+A / ~U / -D (… unchanged, … hand-edited)`) and the scene is **NOT**
      mutated (no `GeneratedWorld` changes, no new objects).
- [ ] Click **Sync IR now…**, confirm the dialog. The scene's `GeneratedWorld`
      tree updates per the re-import policy (generated nodes added/updated,
      hand-edited nodes untouched, dropped nodes moved to the **Deprecated** group,
      never deleted — the US-UB4 behaviour). The badge flips to **Up to date
      (vN)**.
- [ ] Regenerate/advance the world on the backend so its snapshot version bumps,
      **Refresh worlds** again, and confirm the badge now reads **Update available
      (imported vN → vM)** — the stale-version detection.
- [ ] Let the token expire (or revoke it) and Refresh: the window shows the
      **Session expired — re-authenticate** warning (the `NeedsReauth` state), and
      re-authenticating in Project Settings restores the list on the next Refresh.

## 6. Generation Console — jobs with live progress (US-UE3, Unity editor + backend required)

The console's whole job lifecycle (start → queued → progress → complete/failed →
sync prompt), the entity-count diff parsing, cancellation, and premature-close
handling live in the UnityEngine-free `InsimulGenerationConsoleModel`, unit-tested
headless over a RoutingTransport + a scripted `FakeJobStream`
(`GenerationConsoleTests`, EditMode). Progress is delivered by **POLLING** the
`getGenerationJob` status endpoint (not edit-mode SSE) — a poll survives a domain
reload; see the model header for the rationale. This is the **human pass** for the
UnityEditor-coupled seam only a real editor + backend can exercise: the
`UnityWebRequestJobPollStream` HTTP poll driven off `EditorApplication.update`, and
the domain-reload safety of the window's OnEnable/OnDisable pump wiring. A running
backend with generation-job support and at least one world on the account is
required.

- [ ] With the session authenticated (Project Settings ▸ Insimul), open **Insimul ▸
      Generation Console**. Enter a **World id** (copy it from the World Browser),
      pick a **Generator** (Regenerate settlements / Generate characters / Generate
      quests), and click **Run**.
- [ ] The **Status** advances Queued → Running with a live **progress bar** and a
      phase label, without freezing the editor (the poll runs off
      `EditorApplication.update`, one non-blocking request at a time).
- [ ] On completion the status reads **Completed** and the results line shows the
      entity diff (`+A added / ~U updated / -R removed`), and a **Sync IR now…**
      button appears.
- [ ] Click **Sync IR now…** — the **World Browser** opens so the generated changes
      can be pulled in through the same (dry-run-then-apply) import path §5 covers.
- [ ] Start another job and click **Cancel** mid-run: the status reads **Canceled**,
      the progress stops updating, and no further polling occurs (the server job may
      still finish — that is expected; the editor just stops tracking it).
- [ ] **Domain-reload safety:** start a job, then force a recompile (edit any script)
      or **enter Play mode** while it is Running. Confirm the editor does not throw,
      the console does not keep polling a dead job after the reload (no repeated
      network activity in the Profiler / no orphaned update loop), and re-opening the
      window starts clean. This exercises the OnDisable → `EditorApplication.update -=`
      + `model.Dispose()` (stream abort) path.
- [ ] Run a job, then let the token expire / revoke it: the poll surfaces the failure
      as **Job failed: session expired (401)**, and the next World Browser refresh
      shows the **Session expired — re-authenticate** warning.

## 7. Conversation Tester — talk to an NPC in the editor (US-UE4, Unity editor + backend required)

The whole turn lifecycle (send → stream reply chunks → complete/error), the
character-list + SSE parsing, and the multi-turn transcript over one session id live
in the UnityEngine-free `InsimulConversationTesterModel`, unit-tested headless over a
RoutingTransport + a scripted `FakeConversationStream` (`ConversationTesterTests`,
EditMode). This is the **human pass** for the UnityEditor-coupled seam only a real
editor + backend can exercise: the `UnityWebRequestConversationStream` SSE POST driven
off `EditorApplication.update`, and the OnEnable/OnDisable pump wiring. A running
backend with the conversation service and at least one world with characters on the
account is required. **Text streaming works in edit mode; audio playback + lip sync do
not (Play mode only) — see the README ▸ Conversation Tester window mode constraint.**

- [ ] With the session authenticated (Project Settings ▸ Insimul), open **Insimul ▸
      Conversation Tester**. Enter a **World id** (copy it from the World Browser) and
      click **Load characters** — the **Character** picker fills with the world's NPCs.
- [ ] Pick a character, type a message, and click **Send**: the **Transcript** shows a
      **You** line immediately, then an **NPC** line as the reply streams in, without
      freezing the editor (the request runs off `EditorApplication.update`).
- [ ] Send a **second** turn to the same character and confirm the reply is coherent
      in context (the two turns share one conversation session) and both exchanges
      remain in the transcript.
- [ ] If the world's characters have TTS enabled, confirm the **TTS audio: N chunk(s)
      returned (not played in edit mode)** line appears — audio is not played here by
      design.
- [ ] Switch to a **different** character in the picker: the transcript clears (a fresh
      conversation), and the next turn starts a new session.
- [ ] **Domain-reload safety:** send a turn, then force a recompile (edit any script)
      or **enter Play mode** while it is streaming. Confirm the editor does not throw,
      no request keeps running after the reload, and re-opening the window starts clean
      (the OnDisable → `EditorApplication.update -=` + `model.Dispose()` abort path).
- [ ] Let the token expire / revoke it and send: the reply surfaces as a
      **Conversation error: session expired (401)**, and the next World Browser refresh
      shows the **Session expired — re-authenticate** warning.

## 8. Quest journal / tracker / offer panels (US-UU2, Unity editor + Play mode)

The journal filtering + counts, the bounded tracker set + objective ticks, and the
offer accept/decline transitions are UnityEngine-free and host-tested
(`tools/verify-unity`, `RunQuestJournalTests` against the shared corpus
`packages/core/conformance/ui/quest-journal-cases.json`, and `RunQuestFeedTests`
which drives the real `InsimulQuestRuntime` end-to-end — accept, objective ticks,
completion/auto-untrack, radiant arrival — proving the panels update on the runtime
signals, **not** by per-frame polling). This is the **human pass** for the UGUI seam
a real editor + Play mode exercises (the `InsimulQuestJournal` / `InsimulQuestTracker`
/ `InsimulQuestOfferPanel` MonoBehaviours resolving through the `InsimulUIManager`
registry). A world with at least one active quest and a radiant template pack is
required.

- [ ] Enter Play mode with a world loaded. Open the **Quest Journal** panel (via the
      pause menu's Quests tab / the panel key `quest_journal`). The active quests are
      listed, and the **All / Active / Completed / Available** tabs partition the set
      with correct count badges.
- [ ] Click a quest's **Track** toggle. It appears in the on-screen **Quest Tracker**
      HUD immediately (no visible delay / no flicker) with a ★ marker in the journal.
      Track past the cap (default 3) — the extra track is refused and the HUD stays
      bounded.
- [ ] Progress an objective in-world (e.g. talk to the target NPC / visit the target
      location). The tracker's objective tick (**(1/2)** → **(2/2)**) advances the
      moment the quest system fires, without opening/closing the panel to refresh.
- [ ] Complete the final objective: the quest moves to the **Completed** tab, drops
      out of the tracker HUD automatically, and a completion notification toast shows.
- [ ] Talk to a quest giver (or wait for a radiant tick) so an offer appears. The
      **Quest Offer** dialog shows the title + description with **Accept / Decline**.
      **Accept** → the quest shows as **Active** in the journal (and is trackable);
      **Decline** → the offer is dismissed and does not appear in any tab.
- [ ] Confirm a **radiant** arrival shows under the **Available** tab flagged as
      radiant, and accepting it behaves identically to a hand-authored quest.
- [ ] **No-polling check:** with the panels open and idle (no quest transitions), the
      Profiler shows the quest panels doing no per-frame list rebuilds — repaints
      happen only on the `InsimulQuestFeed.Changed` signal.

## 9. Inventory / container transfer / merchant panels (US-UU3, Unity editor + Play mode)

All stack math — inventory grouping, container take / take-all, merchant buy / sell
with gold + stock bounds and stack splitting — lives in the UnityEngine-free
`InsimulTradeModel`, host-tested (`tools/verify-unity`, `RunTradeTests` against the
shared corpus `packages/core/conformance/ui/trade-cases.json`, plus stack-splitting,
gold-bounds/conservation, the **state-location invariant** — every read is the live
`save.currentState` reference, the model keeps no private store — and a **save
serialize → load round-trip**). The model mutates `currentState` in place
(`player.gold`/`player.inventory`, `containers.containers[id].items`,
`npcs.merchantStates[id].{goldReserve,items}`); items **move** between stacks and a
merchant trade **conserves gold** (player + merchant total constant). This is the
**human pass** for the UGUI seam (`InsimulInventoryPanel` / `InsimulContainerPanel` /
`InsimulMerchantPanel`, resolving through the `InsimulUIManager` registry keys
`inventory` / `container` / `merchant`). A world with a lootable container and an
NPC merchant is required.

- [ ] Enter Play mode with a world loaded. Open the **Inventory** panel (`inventory`).
      Items are listed grouped by category with rarity tint and equip-slot markers;
      the counts match the player's `currentState.player.inventory`.
- [ ] Open a **container** (`container`). Its stacks show on the left, the
      player inventory on the right. **Take** a partial stack (e.g. 7 of 20) — the
      taken amount lands in inventory and the **remainder stays** in the container.
      **Take All** empties the container into the inventory.
- [ ] Talk to a **merchant** (`merchant`). Merchant stock + your inventory show
      side by side with per-item prices and both gold totals. **Buy** an affordable
      item: your gold drops by price×qty, the merchant's gold rises by the same, and
      the item moves to your inventory (stacking onto an existing stack).
- [ ] Attempt to **buy** something you can't afford / that's out of stock — the trade
      is refused with no gold or item change. **Sell** an item back: gold flows from
      the merchant to you; selling when the merchant can't afford it is refused.
- [ ] **Persistence check:** after a few trades, **save**, quit to menu, and
      **Continue**. Gold totals, inventory stacks, container contents, and merchant
      stock are exactly as you left them (no item created or lost across the save).

## 10. Dialogue panel — streaming SDK, actions, history (US-UU4, Unity editor + Play mode)

The transcript / streaming / action / history contract lives in the UnityEngine-free
`InsimulChatModel`, host-tested (`tools/verify-unity`, `RunChatTests` against the
shared corpus `packages/core/conformance/ui/chat-cases.json`, plus chunk-assembly /
interruption / error-recovery, **action triggers through the real KB path**
(`InsimulQuestRuntime.AssertClause` → `HasFact`), and a **history round-trip** into
`save.conversations` through a save serialize → load). A player line opens a turn,
response chunks accumulate into the in-flight NPC bubble, a stream error renders an
error bubble and **drops** that turn from history, and `complete` settles it. This is
the **human pass** for the UGUI seam (`InsimulChatPanel`, resolving through the
`InsimulUIManager` registry key `dialogue`) plus the engine-coupled hooks that can only be
seen live: streaming text, TTS playback, and `InsimulLipSync` visemes fed from the
settled NPC line. A world with a talkable NPC and the conversation SDK configured is
required.

- [ ] Enter Play mode with a world loaded. Talk to an NPC — the **dialogue** panel
      opens with the NPC's name in the header and its greeting (if any) as the first
      bubble.
- [ ] Type a message and send. The NPC reply **streams in token-by-token** into a
      single growing bubble (not one bubble per chunk); the input is disabled until
      the turn completes.
- [ ] On completion, **TTS speaks** the settled line and the speaker's **lip-sync**
      visemes track it. Sending a second line while the NPC is still streaming is
      **ignored** (no interleaved turn).
- [ ] Trigger a **dialogue action** (e.g. the NPC gives an item). The corresponding
      Prolog fact is asserted into the KB — verify the downstream effect (inventory /
      quest objective) reflects it.
- [ ] Force a **stream error** (disconnect the SDK mid-reply). An **error bubble**
      appears, the turn is **not** counted, and a fresh message afterwards streams
      normally (recovery).
- [ ] **Persistence check:** after a conversation, **save**, quit, and **Continue**
      (or inspect the save). The exchange is in `save.conversations` as a
      ConversationSummary (`recentTurns` role/content + `totalTurnCount`); in-flight /
      errored turns are excluded.

## 11. Unified pause menu + main menu + save/load (US-UU5, Unity editor + Play mode)

The GameMenuSystem equivalent. Tab-gating lives in the UnityEngine-free
`InsimulPauseMenuModel` (module-bundle-gated tabs — ungated core tabs
resume/journal/inventory/map/settings/save always show; character/vocabulary/skills/
analytics/assessment gate on their feature module, driven off the IR's genre bundle via
`ForGenre`), host-tested (`tools/verify-unity`, `RunPauseMenuTests` against the shared
corpus `packages/core/conformance/ui/pause-menu-cases.json` + rpg/strategy/
language-learning genre fixtures showing **different** tab sets). The save/load slot
projection lives in the UnityEngine-free `InsimulSaveSlotModel` (outcome → row: empty /
ok-with-summary / corrupted-with-messaging; `HasAnyLoadable` gates main-menu Continue),
host-tested (`RunSaveSlotTests` against `save-slot-cases.json` + a **ClassifyEnvelope**
path over the real SHA-256 integrity chain — a tampered envelope renders "Corrupted
Save … integrity check failed" and cannot be loaded). This is the **human pass** for the
UGUI seams (`InsimulPauseMenu` resolving through registry keys `pause_menu`/`game_menu`,
`InsimulMainMenu` → `main_menu`, `InsimulSaveLoadPanel` → `save_load`) plus the
engine-coupled bits only seen live: `Time.timeScale` pausing, cursor capture, ESC toggle.

- [ ] Press **ESC** in Play mode. The pause overlay opens, the game **pauses**
      (`Time.timeScale = 0`), the cursor unlocks, and the first visible tab is active.
      Press ESC again — it closes and the game resumes.
- [ ] Load a world whose genre bundle is **rpg**: the menu shows Character / Vocabulary /
      Skills / Analytics but **not** Assessment. Load a **strategy** bundle: only
      Character shows among the gated tabs. Load a **language-learning** bundle: every
      gated tab (incl. Assessment) shows.
- [ ] Open the **Save / Load** panel. Each slot renders its status: an **empty** slot
      ("Empty Slot", Load disabled), a **healthy** slot (`Name · Lv N · Location`, "Saved
      <time>", Load enabled), and a **corrupted** slot ("Corrupted Save" + the integrity
      message, Load disabled but Save/overwrite enabled).
- [ ] From the **main menu**, with no save present, **Continue** and **Load** are
      disabled. After saving at least once, both enable (`HasAnyLoadable`).
- [ ] **Full loop:** main menu → **New Game** → play → ESC → **Save** to a slot → **Quit**
      to the main menu → **Continue**. The world + quest/inventory/conversation state
      restore from the slot. Corrupt the save file on disk, reopen Save/Load — the slot
      shows **Corrupted Save** with the integrity-failure message and cannot be loaded.
