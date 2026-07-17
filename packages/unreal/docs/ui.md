# Insimul default-UI (Unreal) — registry, theme tokens, loading view-model

This is the Unreal leg of the shared default-runtime UI (plan §4.5). It is a
mirror of the same contract the Babylon reference and the Unity/Godot plugins
implement, so the **behavior** and the **design tokens** are pinned by an
engine-neutral corpus under `packages/core/conformance/ui/` — every engine runs
the same cases. Here the runnable proof is the host test
`Source/InsimulRuntime/Tests/test_ui_registry.cpp` (run via
`npm run engines:unreal:ui`).

## The two layers: UE-free core + syntax-gated UE seam

Following the repo convention (see `CLAUDE.md`), all decision logic lives in
UE-free portable cores that host-test on a bare clang toolchain; the UMG /
UObject boundary is a thin layer on top, verified structurally only (a human
builds it in a real editor — `autoMerge` is off).

| Concern | UE-free core (host-tested) | UE seam (syntax-gated) |
| --- | --- | --- |
| Panel registry | `Portable/InsimulUIRegistryModel.{h,cpp}` | `UInsimulUIRegistry` (`Public/InsimulUIRegistry.h`) |
| Loading screen | `Portable/InsimulLoadingViewModel.{h,cpp}` | the loading `UUserWidget` (`InsimulIntroSequence`) |
| Theme tokens | `Portable/InsimulUIThemeTokens.{h,cpp}` | `UInsimulUITheme` (`Public/InsimulUITheme.h`) |

## Panel registry — `InsimulUIRegistryModel` / `UInsimulUIRegistry`

Maps a stable panel **key** to a widget reference, with a creator **override**
layer and **missing-panel diagnostics**.

- **Default map** — `FInsimulUIRegistryModel::DefaultPanelMap()` ships one entry
  per default-UI panel (`loading_screen`, `notifications`, `hud`, `main_menu`,
  `game_menu`, `quest_journal`, `quest_tracker`, `quest_offer`, `inventory`,
  `container`, `merchant`, `dialogue`, `pause_menu`, `save_load`), each mapped to
  a `/Game/UI/WBP_*` asset path. The key list is pinned by
  `conformance/ui/registry-cases.json → panel_keys`.
- **Creator override** — a per-key override always wins over the shipped default.
  `Register(key, ref)` / `ApplyOverrides(map)` add the override layer; at the UE
  seam `UInsimulUIRegistry.Panels` is the editable list (a later entry for a key
  overrides an earlier one), pointed at from `UInsimulSettings.UIRegistry`.
- **Diagnostics** — `SceneRef(key)` records a `missing_panel` diagnostic for an
  unknown key (surfaced via `Diagnostics()` / `HasDiagnostics()`); `PeekRef(key)`
  is a non-mutating peek. `UInsimulUIRegistry::ResolvePanelClass` logs a warning
  so a creator sees exactly which panel is unbound.

### Generated default asset

`templates/scripts/GenerateInsimulContent.py` is the source of the *default*
registry. After creating each `WBP_*` it registers the WBP's generated class
under the spec's `panel_key` into `DA_InsimulUIRegistry`. See that file's
**OUTPUT CONTRACT** docstring. Panels whose widget the generator does not yet
create (US-XU2..XU4 finish them) are absent from the generated asset but present
in `DefaultPanelMap()` as the intended target path.

## Loading view-model — `InsimulLoadingViewModel`

Driven by the runtime boot loop (`world source → save slot → KB → systems init`;
see `Portable/InsimulBootstrap.h`). `Advance(key)` moves through the ordered
weighted phases yielding a **monotonic** progress fraction, a phase label, and a
deterministic per-phase tip. Phases/weights/tips mirror
`conformance/ui/loading-phases.json`; progress at a phase = cumulative weight
through that phase ÷ total weight. Re-entering the current phase (or an earlier
one) never lowers the bar. `IsComplete()` is true at the terminal phase.

## Theme tokens — `InsimulUIThemeTokens` / `UInsimulUITheme`

`Portable/InsimulUIThemeTokens.{h,cpp}` mirrors `conformance/ui/theme-tokens.json`
(the single source of truth); the host test asserts the two agree byte-for-byte.
`UInsimulUITheme` (`DA_InsimulUITheme`, created by the generator) exposes the
tokens as `FLinearColor` / `int` for the widgets to read. A value that diverges
from a token in the JSON is a parity bug — keep them in lockstep.

### Token → Slate mapping

| Token (theme-tokens.json)     | Value      | Unreal binding |
| ----------------------------- | ---------- | -------------- |
| `colors.background`           | `#12141c`  | loading-screen backdrop fill |
| `colors.surface`              | `#1b1e2a`  | panel / border-brush background; toast bg |
| `colors.surface_alt`          | `#242838`  | disabled button, progress-bar background |
| `colors.overlay`              | `#0a0b10cc`| modal scrims (dialogue / menus) |
| `colors.border`               | `#333a52`  | border brush color |
| `colors.text_primary`         | `#eef1f8`  | primary label / button `ColorAndOpacity` |
| `colors.text_secondary`       | `#9aa3bd`  | secondary text; loading tip |
| `colors.text_disabled`        | `#5a6076`  | disabled text |
| `colors.accent`               | `#5b8cff`  | button normal; progress-bar fill |
| `colors.accent_hover`         | `#7aa2ff`  | button hovered |
| `colors.accent_pressed`       | `#3f6fe0`  | button pressed |
| `colors.success`              | `#4ecb8d`  | success toast/border |
| `colors.warning`              | `#e6b34d`  | warning toast/border |
| `colors.danger`               | `#e05a6a`  | danger toast/border, save integrity failure |
| `colors.quest`                | `#c9a24b`  | quest markers/highlights |
| `spacing.{xs,sm,md,lg,xl}`    | 4/8/12/16/24 | slot padding, container separation |
| `radius.{sm,md,lg}`           | 4/8/12     | rounded-box corner radii |
| `font_size.{caption,body,title,display}` | 12/16/22/32 | text-block font sizes |

## Tests

`npm run engines:unreal:ui` (`tools/verify-unreal/run-ui-tests.sh`) grep-guards
the cores as UE-free, then compiles + runs `test_ui_registry.cpp` against the
shared corpus: the registry cases (default / override precedence / missing
diagnostics + the real WBP default map), the loading cases (weighted progress,
monotonicity, labels, completion, tips), and the theme-token table. The gate is
also wired into `npm run engines:check` under the Unreal block.

## Quest panels + notifications (US-XU2)

`Portable/InsimulQuestJournalModel.{h,cpp}` is the engine-neutral view-model the
three quest panels share — the JOURNAL (`QuestJournalWidget`: tab filtering +
counts), the TRACKER HUD (`InsimulQuestTrackerWidget`: a bounded set of tracked
active quests, `max_tracked`), and the OFFER dialog (`InsimulQuestOfferPanel`:
accept / decline; radiant `quest_offered` arrivals land here via `Upsert`).
Lifecycle transitions mirror the real `FInsimulQuestSystem` signals: accept
(available→active), complete (active→completed, auto-untracked), upsert (a radiant
arrival appears as available). It mirrors `packages/core/src/ui/quest-journal-model.ts`
and the Godot `quest_journal_model.gd` case-for-case against the shared corpus
`conformance/ui/quest-journal-cases.json`.

**Event-driven (no polling):** every state-changing op emits a `FQuestJournalEvent`
(`Reset`/`QuestAdded`/`QuestUpdated`/`QuestAccepted`/`QuestDeclined`/`QuestCompleted`/
`QuestTracked`/`QuestUntracked`/`FilterChanged`) to registered listeners
synchronously. Read-only ops (`Filtered`/`Counts`/`TrackedIds`) and rejected ops
(accepting a non-available quest, tracking past `max_tracked`) emit **nothing**. The
UE seam `UInsimulQuestJournal` (`Public/InsimulQuestJournal.h`) wraps the portable
model (pimpl) and forwards these events through the `OnQuestJournalChanged` dynamic
multicast delegate, so the UMG widgets rebuild only when the model changes — they
never poll each frame.

`Portable/InsimulNotifications.{h,cpp}` is the transient-toast queue (push / tick
lifetime expiry / dismiss / `kind→color` mapping to the shared theme tokens),
mirroring `notifications.ts` / `insimul_notifications.gd`. It ties into the quest
panels as the "+ notifications" seam: a listener on the quest model `Push`es a toast
on accept / complete / radiant-arrival, and the toast Control ages them on its own
timer — no polling either direction.

### Tests

`npm run engines:unreal:quest-ui` (`tools/verify-unreal/run-quest-ui-tests.sh`)
grep-guards the cores as UE-free, then compiles + runs `test_quest_journal.cpp` (29
assertions): the full quest-journal corpus matrix, the event-driven surface
(mutations push events; read-only/rejected ops are silent), the notifications core,
and the quest-events-drive-toasts integration. Wired into `npm run engines:check`
under the Unreal block.

## Trade panels — inventory / container / merchant (US-XU3)

`Portable/InsimulTradeModel.{h,cpp}` is the engine-neutral view-model the three
trade panels share — the INVENTORY (`InsimulInventoryUI`: `PlayerGold` /
`PlayerItems`), the CONTAINER transfer panel (`TakeFromContainer` / `TakeAll`), and
the MERCHANT/shop panel (`InsimulShopPanel`: `Buy` / `Sell` against `MerchantItems`
/ `MerchantGold`). It mirrors `packages/core/src/ui/trade-model.ts` and the Godot
`trade_model.gd` operation-for-operation against the shared corpus
`conformance/ui/trade-cases.json`.

**Backed exclusively by save.currentState (the state-location invariant):** the
model holds a POINTER to the caller's `FTradeState` (the live currentState slice:
`player.gold`/`player.inventory`, `containers.containers[id].items`,
`npcs.merchantStates[id].{goldReserve,items}`) and keeps NO private item store.
Every read returns the live arrays and every mutation touches only the attached
state, so a snapshot at any moment is the whole truth. Conservation is a hard
invariant of every op: items MOVE between stacks (never created/destroyed) and a
merchant trade conserves gold (`player.gold + merchant.goldReserve` constant across
buy/sell). Failure reasons are machine-readable (`no_container` / `not_present` /
`out_of_stock` / `insufficient_gold` / `insufficient_items` /
`merchant_cannot_afford` / `bad_qty` / `no_merchant`).

The UE seam `UInsimulTradePanel` (`Public/InsimulTradePanel.h`) wraps the portable
model (pimpl over `FTradeState` + `FInsimulTradeModel`), marshalling
`FString`/`FInsimulTradeItem`/`FInsimulTradeResult` at the Blueprint boundary. The
save shell hydrates its `FTradeState` from `save.currentState`, so buy/sell/transfer
land in the one place the save serializes.

### Tests

`npm run engines:unreal:trade` (`tools/verify-unreal/run-trade-ui-tests.sh`)
grep-guards the core as UE-free, then compiles + runs `test_trade.cpp` (15
assertions): the full trade corpus matrix (take / take_all / buy / sell, with final
quantities + gold + failure reasons) and the state-location invariant (reads return
the live currentState arrays, two models never share, every op conserves the item /
gold census, a detached model fails safely). Wired into `npm run engines:check`
under the Unreal block.

## Dialogue panel + pause/main menu + save/load (US-XU4)

The last three default-UI cores mirror the shared corpora case-for-case (Babylon /
Unity / Godot / Unreal); all decision logic is UE-free and host-tested, with a thin
UObject seam on top.

### Dialogue / chat (`InsimulChatModel` → `UInsimulChatPanel`)

`Portable/InsimulChatModel.{h,cpp}` is the streaming conversation view-model. A
player line opens a turn + an empty in-flight NPC bubble; response CHUNKS accumulate
into that bubble (`StreamingText()` is the live-render source); the stream may
TRIGGER actions the panel asserts into the KB (`FactToAssert`); `CompleteTurn()`
(optionally with an authoritative full text that overrides the chunks) or
`FailTurn(error)` closes it. A second `BeginUserTurn` while streaming is rejected. A
failed turn renders an `[Error: …]` bubble and is DROPPED from history. `LastNpcText()`
(the last settled, non-error NPC line) feeds TTS + the `InsimulFaceSync` lip-sync
hook. `History()` projects the settled transcript into the
`save.conversations` (`ConversationSummary.recentTurns`) shape. Shared cases:
`chat-cases.json`. The UE seam `UInsimulChatPanel` marshals the transcript /
actions and broadcasts `OnChatChanged` after every mutation (the no-poll UMG seam).

### Pause / ESC menu (`InsimulPauseMenuModel` → `UInsimulPauseMenu`)

`Portable/InsimulPauseMenuModel.{h,cpp}` gates the unified in-game menu's tabs by the
feature modules the active genre bundle enabled (from the IR feature-modules
registry). Core tabs (`resume`/`journal`/`inventory`/`map`/`settings`/`save`) are
ungated; learning/progression tabs (`character`/`vocabulary`/`skills`/`analytics`/
`assessment`) gate on a module, and a custom tab may AND-gate on several. `OpenMenu`
falls back to the first visible tab (opening to a hidden tab is coerced),
`SetActive` rejects hidden tabs, and `Toggle` flips open/closed. Shared cases:
`pause-menu-cases.json`. The `UInsimulPauseMenu` seam builds its tab bar from
`VisibleTabs()`; the UUserWidget owns the actual pause + input capture.

### Save / load slots (`InsimulSaveSlotModel` → `UInsimulSaveSlotPanel`)

`Portable/InsimulSaveSlotModel.{h,cpp}` renders each codec-reported slot OUTCOME
(empty / ok+summary / `invalid_format` / `missing_save_file` / `integrity_mismatch`,
from the portable save system's canonical-JSON + SHA-256 chain) into a row
(status / title / message / can_load / can_save). A healthy slot's title is
`Name · Lv N · Location`; a corrupted slot cannot load but can be overwritten, and
its MESSAGE is the cross-engine contract — e.g. an integrity mismatch on a tampered
save always reads "Save file integrity check failed — file may be corrupted or
tampered." `HasAnyLoadable()` gates the main-menu Continue button. Shared cases:
`save-slot-cases.json`. The `UInsimulSaveSlotPanel` seam feeds the rows to the
save/load screen.

### Tests

`npm run engines:unreal:dialogue-ui`
(`tools/verify-unreal/run-dialogue-ui-tests.sh`) grep-guards all three cores as
UE-free, then compiles + runs `test_dialogue_ui.cpp` (24 assertions): the full
`chat-cases.json` streaming/action/history matrix, the `pause-menu-cases.json`
tab-gating + open/active reducer, the `save-slot-cases.json` row rendering incl. the
corrupted-envelope messaging, plus a handful of edge-behaviour unit assertions.
Wired into `npm run engines:check` under the Unreal block.
