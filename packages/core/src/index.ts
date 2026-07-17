/**
 * @insimul/core — the engine-agnostic Insimul contract.
 *
 * This package holds the parts of the runtime that native engine plugins
 * (Unreal/Unity/Godot) must consume WITHOUT dragging Babylon.js along: the
 * save-file format and its migrations, world types, the Prolog toolchain
 * (see ./prolog), and (in later core-extraction stories) the IR and
 * quest/data-source types. It depends on NO @babylonjs/*, react, or DOM APIs.
 *
 * Files here are also re-exported from their historical `shared/<name>` paths
 * via one-line shims, so existing `@shared/*` imports and the Babylon export
 * pipeline keep resolving unchanged.
 */

export * from './save-file';
export * from './save-envelope';
export * from './save-export';
export * from './save-extensions';
export * from './save-file-migrations';
export * from './save-file-assessments';
export * from './world-types';
export * from './world-snapshot-version';
export * from './playthrough-overview';
export * from './insimul-version';
export * from './validation-failures';
export * from './asset-types';
// ── Archetype taxonomy (US-UB1) ────────────────────────────────────────────
// The hierarchical dot-path archetype key grammar + matcher the asset binding
// layer resolves against (see docs/archetype-taxonomy.md; C# port in
// packages/unity Runtime/Binding/ArchetypeKey.cs).
export * from './archetypes/taxonomy';
export * from './prolog';

// ── Radiant quest generation (US-RQ2) ──────────────────────────────────────
// Pure, deterministic slot-filling engine over the radiant template vocabulary
// (see prolog/predicate-schema radiant section + docs/radiant-templates.md).
export * from './radiant/radiant-engine';
// Starter template pack (US-RQ5) — genre-neutral base templates + the loader
// convention (canonical data/radiant/base-templates.pl mirrored as a string).
export * from './radiant/base-templates';

// ── Quest contract (US-CE3) ────────────────────────────────────────────────
// Quest-type registry, objective schema/fallbacks, hints, bonus math, branching,
// timed challenges, and the save-file's quest view. NOTE: quest-difficulty(.-
// adjustment) intentionally stay in shared/ — they import language/cefr-adaptation,
// which reaches @shared/game-engine/logic/*, and core must not edge into the
// engine layer (see US-CE2). Move them once cefr-adaptation is decoupled.
export * from './quest-objective-types';
export * from './quest-objective-fallbacks';
export * from './quest-hints';
export * from './quest-bonus-calculator';
export * from './quest-branching';
export * from './timed-challenge';
export * from './quest-types';
export * from './quests/types';

// ── Narrative / relationship / NPC context contract (US-CE3) ───────────────
export * from './narrative-arc-types';
export * from './emotional-tone';
export * from './relationship-tiers';
export * from './npc-awareness-context';

// ── World IR + engine-agnostic data-source interface (US-CE3) ──────────────
export * from './game-engine/ir-types';
export * from './game-engine/data-source';

// ── Conversation proto (US-CE3) ────────────────────────────────────────────
export * from './proto/conversation';

// ── Feature-module registry contract (US-CE3) ──────────────────────────────
export * from './feature-modules/types';
export * from './feature-modules/registry';
export * from './feature-modules/genre-bundles';

// ── Language models consumed by the contract (US-CE3) ──────────────────────
export * from './language/cefr';
export * from './language/mastery';
export * from './language/spaced-repetition';
export * from './language/proficiency-model';
export * from './language/progress';
export * from './language/types';

// Flat-barrel name collisions — both variants stay reachable via their deep
// `@insimul/core/<subpath>` imports; the barrel just picks one canonical each:
//  - `CEFRLevel`: identical union in narrative-arc-types and language/cefr.
//  - `World`: quest-types/types (quest-type-registry world) vs quests/types.
export type { CEFRLevel } from './language/cefr';
export type { World } from './quest-types';

// ── Zod schemas + JSON Schema contract (US-CE4) ────────────────────────────
// Runtime validators for the SaveFile, its export Envelope, and the World IR.
// Emitted JSON Schemas live in packages/core/schemas/ (npm run schemas).
export * from './schemas';

// ── Editor v1 client contract (US-GE1) ─────────────────────────────────────
// The engine-agnostic operation resolver + reference editor session the native
// editor clients (Godot v1_client.gd / insimul_editor_session.gd) mirror.
export * from './editor/operations';
export * from './editor/editor-session';
// US-GE2 — the World Browser + Generation Console dock view-models (list/detail/
// compatibility badge; job lifecycle reducer; polling-fallback poller w/ teardown).
export * from './editor/world-browser';
export * from './editor/generation-console';
export * from './editor/job-poller';
// US-GE3 — the in-editor NPC Conversation Tester view-model (character picker,
// streaming transcript reducer, recorded-reasoning fallback, teardown-safe controller).
// Deep-import-only (`@insimul/core/editor/conversation-tester`): its `ConversationState`
// (reducer accumulator) collides with the proto/conversation `ConversationState` enum
// re-exported above, so it is intentionally left out of the flat barrel — same pattern
// as the collision-avoiding modules noted in CLAUDE.md (core-extraction).

// ── Default-UI view-models (US-GU1) ────────────────────────────────────────
// The engine-agnostic panel registry, loading-screen model, and notification
// queue the native default-UI mirrors (Godot insimul_ui_registry.gd /
// loading_screen_model.gd / insimul_notifications.gd) implement. Shared cases:
// packages/core/conformance/ui/.
export * from './ui/ui-registry';
export * from './ui/loading-screen-model';
export * from './ui/notifications';
