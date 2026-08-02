/**
 * Editor host contracts (US-2 of `101-editor-plugin-core`).
 *
 * The **edit-time** twin of `game-engine/host-contracts.ts`. Same direction:
 * these are the interfaces an engine's editor plugin hands to core so the shared
 * decision logic in `editor/binding`, `editor/scene` and `editor/reimport` can
 * run without knowing which engine it is inside.
 *
 *  - core decides *which node, at which transform, bound to which archetype*,
 *    and *which entityIds to add / update / deprecate*;
 *  - the host decides what a node IS (`GameObject` + prefab / `AActor` +
 *    `ULevelInstance` / `Node3D` + `PackedScene` / a Babylon `TransformNode`),
 *    and how an asset handle becomes a real asset.
 *
 * That is class (b) of `docs/editor-plugin-core-analysis.md` §2 — "decisions
 * shareable, execution not". All three engines had already drawn this line for
 * themselves (Unreal `Source/InsimulEditor/Portable/`, Unity `Runtime/{Binding,
 * Scene}` behind `IReimportSceneMutator`/`ISceneBuilder`, Godot
 * `gdextension/src`); what was missing was one implementation behind it.
 *
 * Rules for anything added here, inherited verbatim from the runtime file:
 *
 *  1. **Narrow to what core actually calls.** {@link SceneMutator} has three
 *     methods because the re-import policy has exactly three mutating actions;
 *     `unchanged` and `skipped` are no-ops *by policy*, so they get no hook.
 *  2. **No engine types, no DOM types** — this file compiles under
 *     `packages/core/tsconfig.json`, which omits the `dom` lib on purpose.
 *  3. **Every hook is optional to supply**, so a plugin can adopt core in
 *     stages: `applyReimport` with no mutator is a pure dry run, and
 *     `computePlacement` with no {@link AssetResolver} falls back to the binding
 *     entry's own handle.
 *
 * **Editor core, not runtime core.** A shipping game embeds the runtime core and
 * not this surface; nothing here may be re-exported from the flat `src/index.ts`
 * barrel (guarded by `__tests__/editor-surface.test.ts`).
 */

import type { BindingEntry, ResolveResult } from './binding/resolver';
import type { PlacedNode } from './scene/placement';

// ─── Scene mutation ──────────────────────────────────────────────────────────

/**
 * The three mutating scene operations re-import drives.
 *
 * Core classifies (old, new) into the five-way report and then calls these in
 * the report's canonical (ascending entityId) order, so two engines applying the
 * same re-import perform the same operations in the same sequence.
 *
 * Engine implementations today: Unity `IReimportSceneMutator` over
 * `GameObject`/`PrefabUtility`, Unreal `IReimportSceneMutator` over
 * `AActor`/`ULevelInstance`, Godot's applier over `Node3D`/`PackedScene`, and
 * the reference `BabylonSceneMutator`
 * (`@insimul/babylon/engine/editor/babylon-scene-mutator`).
 */
export interface SceneMutator {
  /**
   * Re-apply the fresh generated transform + binding onto the node already in
   * the scene. A hand edit (`generated === false`) never reaches here.
   */
  updateNode(fresh: PlacedNode): void;

  /** Materialize a brand-new generated node under the generated root. */
  addNode(fresh: PlacedNode): void;

  /**
   * Reparent an existing generated node under the {@link DEPRECATED_GROUP}
   * group. **Never delete** — the human reviews and removes it.
   */
  deprecateNode(entityId: string): void;
}

/**
 * A {@link SceneMutator} that records the calls it receives, in order, so the
 * apply orchestration is assertable without any engine. The in-memory reference
 * implementation; every engine leg ships its own equivalent for its host gate
 * (Unreal's `FRecordingReimportMutator`, …).
 */
export class RecordingSceneMutator implements SceneMutator {
  /** Every call as `"<action>:<entityId>"`, in the order core made them. */
  readonly calls: string[] = [];
  readonly updated: string[] = [];
  readonly added: string[] = [];
  readonly deprecated: string[] = [];

  updateNode(fresh: PlacedNode): void {
    this.updated.push(fresh.entityId);
    this.calls.push(`update:${fresh.entityId}`);
  }

  addNode(fresh: PlacedNode): void {
    this.added.push(fresh.entityId);
    this.calls.push(`add:${fresh.entityId}`);
  }

  deprecateNode(entityId: string): void {
    this.deprecated.push(entityId);
    this.calls.push(`deprecate:${entityId}`);
  }
}

// ─── Asset resolution ────────────────────────────────────────────────────────

/**
 * Turn a resolved binding entry into an engine-native asset handle.
 *
 * Core resolves an archetype key to a {@link BindingEntry} — that decision is
 * shared. Turning the entry's `scene`/`mesh` string into something the engine
 * can instantiate is not: Unity wants an `AssetDatabase` GUID, Unreal a
 * `.uasset` soft object path, Godot a `res://` path, Babylon a glTF URL.
 *
 * Returning `null` means "this entry names no asset I can use" and leaves the
 * node unbound in the manifest, exactly as an unresolved archetype would — the
 * placement is still emitted so the unbound report can name it.
 */
export interface AssetResolver {
  /**
   * @param entry     the winning binding entry
   * @param archetype the concrete key that was queried (for diagnostics /
   *                  per-key overrides)
   * @param result    the full resolution result, so a host can key off which
   *                  tier won (`result.sourceName`)
   */
  resolveAssetHandle(
    entry: BindingEntry,
    archetype: string,
    result: ResolveResult,
  ): string | null;
}

// ─── Progress reporting ──────────────────────────────────────────────────────

/** Severity of a {@link ProgressSink} message. */
export type ProgressLevel = 'info' | 'warn' | 'error';

/**
 * Where core reports what it is doing during a placement or re-import run.
 *
 * Deliberately not a logger: the editor renders these in a dock (Unity's
 * progress bar, Unreal's Slate notification, Godot's editor toast), and a
 * headless host gate collects them into a list. `total` is absent when core does
 * not know the denominator yet.
 */
export interface ProgressSink {
  report(step: ProgressStep): void;
}

/** One unit of progress. */
export interface ProgressStep {
  /** Short machine-readable phase, e.g. `'placement'`, `'reimport'`. */
  phase: string;
  /** Human-readable one-liner for the dock. */
  message: string;
  level: ProgressLevel;
  /** Completed units so far, when the phase is countable. */
  completed?: number;
  /** Total units, when known. */
  total?: number;
}

/** A {@link ProgressSink} that keeps every step, for host gates and tests. */
export class RecordingProgressSink implements ProgressSink {
  readonly steps: ProgressStep[] = [];

  report(step: ProgressStep): void {
    this.steps.push(step);
  }
}

// ─── The bundle ──────────────────────────────────────────────────────────────

/**
 * Everything an editor plugin can hand core, in one object. Every field is
 * optional with a documented fallback so a plugin can come up in stages — the
 * same staging rule `EngineHostAdapter` follows on the runtime side.
 */
export interface EditorHostAdapter {
  /** Absent ⇒ every re-import is a dry run (report only, nothing mutates). */
  sceneMutator?: SceneMutator;
  /** Absent ⇒ the binding entry's own `scene ?? mesh` string is the handle. */
  assetResolver?: AssetResolver;
  /** Absent ⇒ core reports nothing. */
  progress?: ProgressSink;
}

/** Re-exported so a host implementing `deprecateNode` can name the same group. */
export { DEPRECATED_GROUP } from './reimport/diff';
