/**
 * The Babylon **reference implementation** of the editor host contracts
 * (US-2 of `101-editor-plugin-core`).
 *
 * `@insimul/core/editor` owns the decisions — which node, at which transform,
 * bound to which archetype; which entityIds to add, update and deprecate. This
 * file is the other half for one engine: what a node actually IS, and how a
 * binding entry's handle becomes something the engine can load.
 *
 *  - {@link BabylonSceneMutator} — `SceneMutator` over a Babylon `Scene`. A
 *    placed node is a `TransformNode` under a generated root, carrying the same
 *    five-field entity stamp Unity puts on an `InsimulEntityId` MonoBehaviour,
 *    Unreal on a `UInsimulEntityIdComponent`, and Godot in node metadata.
 *  - {@link BabylonAssetResolver} — `AssetResolver` mapping a binding entry to a
 *    URL, since Babylon loads assets by URL rather than by GUID or soft path.
 *  - {@link BabylonProgressSink} — `ProgressSink` for a dock or a headless run.
 *
 * Two things this is NOT. It is not a plugin: Babylon ships no editor
 * (UNIFICATION_ROADMAP decision 3), so there is no dock, no menu item and no
 * asset pipeline here — this is the piece such a plugin would be built on, which
 * is why it is worth writing now rather than as throwaway scaffolding. And it is
 * not the runtime: nothing in `packages/babylon/src/engine/game-engine/` imports
 * it, so a shipping game never pulls the editor core in through this file.
 */

import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import {
  DEPRECATED_GROUP,
  type AssetResolver,
  type EditorHostAdapter,
  type ProgressSink,
  type ProgressStep,
  type SceneMutator,
} from '@insimul/core/editor/host-contracts';
import type { BindingEntry, ResolveResult } from '@insimul/core/editor/binding/resolver';
import type { PlacedNode } from '@insimul/core/editor/scene/placement';

/** Key under a node's `metadata` where the Insimul entity stamp lives. */
export const INSIMUL_STAMP_KEY = 'insimul';

/** Default name of the `TransformNode` generated content is parented under. */
export const GENERATED_ROOT_NAME = 'InsimulGenerated';

/**
 * The entity stamp, field-for-field the same five the other three engines carry.
 * The *carrier* differs per engine (a MonoBehaviour, a UActorComponent, node
 * metadata, this object); the fields are the shared contract, because they are
 * what the re-import diff reads.
 */
export interface InsimulEntityStamp {
  entityId: string;
  kind: string;
  archetype: string;
  bindingSource: string;
  /**
   * `false` marks a creator's hand edit. Re-import preserves such a node
   * verbatim — see the policy (and its two known gaps) in
   * `@insimul/core/editor/reimport/diff`.
   */
  generated: boolean;
}

/** Read the Insimul stamp off a node, or `null` if it carries none. */
export function readStamp(node: TransformNode): InsimulEntityStamp | null {
  const metadata = node.metadata as Record<string, unknown> | null | undefined;
  const stamp = metadata?.[INSIMUL_STAMP_KEY] as Partial<InsimulEntityStamp> | undefined;
  if (!stamp || typeof stamp.entityId !== 'string' || stamp.entityId === '') return null;
  return {
    entityId: stamp.entityId,
    kind: typeof stamp.kind === 'string' ? stamp.kind : '',
    archetype: typeof stamp.archetype === 'string' ? stamp.archetype : '',
    bindingSource: typeof stamp.bindingSource === 'string' ? stamp.bindingSource : '',
    generated: stamp.generated === true,
  };
}

/** Write the Insimul stamp onto a node, preserving any other metadata. */
export function writeStamp(node: TransformNode, stamp: InsimulEntityStamp): void {
  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  metadata[INSIMUL_STAMP_KEY] = { ...stamp };
  node.metadata = metadata;
}

export interface BabylonSceneMutatorOptions {
  /** Name of the generated root. Created on first use if absent. */
  generatedRootName?: string;
  /** Name of the group deprecated nodes are reparented under. */
  deprecatedGroupName?: string;
}

/**
 * `SceneMutator` over a Babylon `Scene`.
 *
 * Deliberately mirrors the other three appliers, including the two limits §4.3
 * of `docs/editor-plugin-core-analysis.md` records: only the DIRECT children of
 * the generated root are read back into the "old" node set, and a deprecated
 * node is reparented rather than disposed. Diverging here would make Babylon the
 * odd leg out against the shared golden.
 */
export class BabylonSceneMutator implements SceneMutator {
  private readonly scene: Scene;
  private readonly generatedRootName: string;
  private readonly deprecatedGroupName: string;

  constructor(scene: Scene, options: BabylonSceneMutatorOptions = {}) {
    this.scene = scene;
    this.generatedRootName = options.generatedRootName ?? GENERATED_ROOT_NAME;
    this.deprecatedGroupName = options.deprecatedGroupName ?? DEPRECATED_GROUP;
  }

  /** The generated root, created on first use. */
  generatedRoot(): TransformNode {
    return this.findOrCreate(this.generatedRootName, null);
  }

  /** The Deprecated group, created on first use, under the generated root. */
  deprecatedGroup(): TransformNode {
    return this.findOrCreate(this.deprecatedGroupName, this.generatedRoot());
  }

  /**
   * The stamped DIRECT children of the generated root, as the `old` side of a
   * re-import diff. Unstamped children are skipped entirely — that is how a
   * hand-*placed* object survives, in every engine.
   */
  readSceneNodes(): PlacedNode[] {
    const out: PlacedNode[] = [];
    for (const child of this.generatedRoot().getChildren(undefined, true)) {
      if (!(child instanceof TransformNode)) continue;
      const stamp = readStamp(child);
      if (stamp === null) continue;
      out.push({
        ...stamp,
        assetRef: (child.metadata as Record<string, unknown> | undefined)?.assetRef as string ?? '',
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        rotationY: child.rotation.y,
        scale: { x: child.scaling.x, y: child.scaling.y, z: child.scaling.z },
      });
    }
    out.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
    return out;
  }

  /** Find a stamped node by entityId among the generated root's direct children. */
  findByEntityId(entityId: string): TransformNode | null {
    for (const child of this.generatedRoot().getChildren(undefined, true)) {
      if (child instanceof TransformNode && readStamp(child)?.entityId === entityId) return child;
    }
    return null;
  }

  updateNode(fresh: PlacedNode): void {
    const existing = this.findByEntityId(fresh.entityId);
    // A node core classified `updated` is in both manifests by definition; if the
    // scene has drifted from the manifest it was diffed against, materialize it
    // rather than silently dropping the update.
    if (existing === null) {
      this.addNode(fresh);
      return;
    }
    this.applyNode(existing, fresh);
  }

  addNode(fresh: PlacedNode): void {
    const node = new TransformNode(fresh.entityId, this.scene);
    node.parent = this.generatedRoot();
    this.applyNode(node, fresh);
  }

  deprecateNode(entityId: string): void {
    const existing = this.findByEntityId(entityId);
    // Never delete — the human reviews the Deprecated group and removes it.
    if (existing !== null) existing.parent = this.deprecatedGroup();
  }

  private applyNode(node: TransformNode, fresh: PlacedNode): void {
    node.position.set(fresh.position.x, fresh.position.y, fresh.position.z);
    node.rotation.set(0, fresh.rotationY, 0);
    node.scaling.set(fresh.scale.x, fresh.scale.y, fresh.scale.z);
    writeStamp(node, {
      entityId: fresh.entityId,
      kind: fresh.kind,
      archetype: fresh.archetype,
      bindingSource: fresh.bindingSource,
      generated: fresh.generated,
    });
    const metadata = node.metadata as Record<string, unknown>;
    metadata.assetRef = fresh.assetRef;
  }

  private findOrCreate(name: string, parent: TransformNode | null): TransformNode {
    for (const node of this.scene.transformNodes) {
      if (node.name === name && node.parent === parent) return node;
    }
    const created = new TransformNode(name, this.scene);
    created.parent = parent;
    return created;
  }
}

export interface BabylonAssetResolverOptions {
  /** Prefix joined onto a relative handle, e.g. `'/assets/'`. */
  assetBaseUrl?: string;
  /**
   * Per-archetype overrides consulted before the binding entry. The escape hatch
   * a project needs when one key must load a different asset than its pack says.
   */
  overrides?: Readonly<Record<string, string>>;
}

/**
 * `AssetResolver` for Babylon: a binding entry's handle becomes a URL.
 *
 * Absolute handles (`http(s)://`, `data:`, `/…`) are passed through untouched;
 * a relative one is joined onto `assetBaseUrl`. A `placeholder:` handle — the
 * synthetic id the bundled CC0 pack mints, which names no file — resolves to
 * `null`, i.e. "no asset I can load", leaving the node placed but unbound so the
 * unbound report can name it.
 */
export class BabylonAssetResolver implements AssetResolver {
  private readonly assetBaseUrl: string;
  private readonly overrides: Readonly<Record<string, string>>;

  constructor(options: BabylonAssetResolverOptions = {}) {
    this.assetBaseUrl = options.assetBaseUrl ?? '';
    this.overrides = options.overrides ?? {};
  }

  resolveAssetHandle(entry: BindingEntry, archetype: string, _result: ResolveResult): string | null {
    const override = this.overrides[archetype];
    const handle = override ?? entry.scene ?? entry.mesh ?? '';
    if (!handle) return null;
    if (handle.startsWith('placeholder:')) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(handle)) return handle;
    return this.assetBaseUrl + handle;
  }
}

/**
 * `ProgressSink` that keeps every step and, optionally, forwards it — what a
 * dock wires its progress bar to, and what a headless run asserts against.
 */
export class BabylonProgressSink implements ProgressSink {
  readonly steps: ProgressStep[] = [];

  constructor(private readonly onProgress?: (step: ProgressStep) => void) {}

  report(step: ProgressStep): void {
    this.steps.push(step);
    this.onProgress?.(step);
  }
}

export interface BabylonEditorHostOptions
  extends BabylonSceneMutatorOptions,
    BabylonAssetResolverOptions {
  onProgress?: (step: ProgressStep) => void;
}

/** The three references bundled as the `EditorHostAdapter` core accepts. */
export function createBabylonEditorHost(
  scene: Scene,
  options: BabylonEditorHostOptions = {},
): EditorHostAdapter & { sceneMutator: BabylonSceneMutator } {
  return {
    sceneMutator: new BabylonSceneMutator(scene, options),
    assetResolver: new BabylonAssetResolver(options),
    progress: new BabylonProgressSink(options.onProgress),
  };
}
