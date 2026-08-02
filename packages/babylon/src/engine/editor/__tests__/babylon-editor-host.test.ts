/**
 * The Babylon reference host, exercised end-to-end against a real Babylon scene
 * (US-2 of `101-editor-plugin-core`).
 *
 * `NullEngine` gives a genuine `Scene` with no GL context, so these are not
 * fake-object tests: `TransformNode` parenting, `position`/`rotation`/`scaling`
 * and `metadata` behave exactly as they do in a browser. The last test is the
 * one that matters — a full IR → placement → scene → re-import → scene loop
 * driven by core, with Babylon supplying only the execution.
 */

import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { BindingResolver } from '@insimul/core/editor/binding/resolver';
import { computePlacement, type PlacedNode } from '@insimul/core/editor/scene/placement';
import { applyReimport, computeReimportDiff } from '@insimul/core/editor/reimport/diff';

import {
  BabylonAssetResolver,
  BabylonProgressSink,
  BabylonSceneMutator,
  GENERATED_ROOT_NAME,
  createBabylonEditorHost,
  readStamp,
} from '../babylon-editor-host';

function freshScene(): Scene {
  return new Scene(new NullEngine());
}

function node(entityId: string, over: Partial<PlacedNode> = {}): PlacedNode {
  return {
    entityId,
    kind: 'prop',
    archetype: 'prop.tree',
    assetRef: 'trees/oak.glb',
    bindingSource: 'packs',
    position: { x: 1, y: 2, z: 3 },
    rotationY: 0.5,
    scale: { x: 1, y: 1, z: 1 },
    generated: true,
    ...over,
  };
}

describe('BabylonSceneMutator', () => {
  it('materializes a node under the generated root, stamped and transformed', () => {
    const mutator = new BabylonSceneMutator(freshScene());
    mutator.addNode(node('prop.a'));

    const created = mutator.findByEntityId('prop.a')!;
    expect(created).not.toBeNull();
    expect(created.parent?.name).toBe(GENERATED_ROOT_NAME);
    expect(created.position.asArray()).toEqual([1, 2, 3]);
    expect(created.rotation.asArray()).toEqual([0, 0.5, 0]);
    expect(readStamp(created)).toEqual({
      entityId: 'prop.a',
      kind: 'prop',
      archetype: 'prop.tree',
      bindingSource: 'packs',
      generated: true,
    });
  });

  it('re-applies the fresh transform and binding onto the existing node', () => {
    const mutator = new BabylonSceneMutator(freshScene());
    mutator.addNode(node('prop.a'));
    const before = mutator.findByEntityId('prop.a')!;

    mutator.updateNode(node('prop.a', { position: { x: 9, y: 9, z: 9 }, archetype: 'prop.rock' }));

    // Same node object — an update mutates, it does not replace.
    expect(mutator.findByEntityId('prop.a')).toBe(before);
    expect(before.position.asArray()).toEqual([9, 9, 9]);
    expect(readStamp(before)!.archetype).toBe('prop.rock');
  });

  it('reparents a deprecated node instead of disposing it', () => {
    const scene = freshScene();
    const mutator = new BabylonSceneMutator(scene);
    mutator.addNode(node('prop.gone'));
    const target = mutator.findByEntityId('prop.gone')!;

    mutator.deprecateNode('prop.gone');

    expect(target.isDisposed()).toBe(false);
    expect(target.parent?.name).toBe('Deprecated');
    // …and it is no longer part of the diffable generated set.
    expect(mutator.findByEntityId('prop.gone')).toBeNull();
  });

  it('reads back only the STAMPED direct children — a hand-placed object is invisible', () => {
    const scene = freshScene();
    const mutator = new BabylonSceneMutator(scene);
    mutator.addNode(node('prop.b'));
    mutator.addNode(node('prop.a'));

    const handPlaced = new TransformNode('MyOwnProp', scene);
    handPlaced.parent = mutator.generatedRoot();

    const read = mutator.readSceneNodes();
    expect(read.map((n) => n.entityId)).toEqual(['prop.a', 'prop.b']);
    expect(read[0]).toEqual(node('prop.a'));
  });

  it('preserves unrelated metadata when stamping', () => {
    const scene = freshScene();
    const mutator = new BabylonSceneMutator(scene);
    mutator.addNode(node('prop.a'));
    const target = mutator.findByEntityId('prop.a')!;
    (target.metadata as Record<string, unknown>).myTool = { note: 'keep me' };

    mutator.updateNode(node('prop.a', { position: { x: 0, y: 0, z: 0 } }));

    expect((target.metadata as Record<string, unknown>).myTool).toEqual({ note: 'keep me' });
  });
});

describe('BabylonAssetResolver', () => {
  const result = { resolved: true, sourceName: 'packs', key: 'prop.*', entry: null, score: null };
  const resolve = (
    resolver: BabylonAssetResolver,
    entry: { key: string; scene?: string; mesh?: string },
    archetype = 'prop.tree',
  ) => resolver.resolveAssetHandle(entry, archetype, result as never);

  it('joins a relative handle onto the asset base and passes absolutes through', () => {
    const resolver = new BabylonAssetResolver({ assetBaseUrl: '/assets/' });
    expect(resolve(resolver, { key: 'prop.*', scene: 'trees/oak.glb' })).toBe('/assets/trees/oak.glb');
    expect(resolve(resolver, { key: 'prop.*', scene: '/abs/oak.glb' })).toBe('/abs/oak.glb');
    expect(resolve(resolver, { key: 'prop.*', scene: 'https://cdn/oak.glb' })).toBe(
      'https://cdn/oak.glb',
    );
  });

  it('falls back to `mesh`, honours a per-archetype override, and reports no asset as null', () => {
    const resolver = new BabylonAssetResolver({ overrides: { 'prop.rock': 'special/rock.glb' } });
    expect(resolve(resolver, { key: 'prop.*', mesh: 'rock.glb' })).toBe('rock.glb');
    expect(resolve(resolver, { key: 'prop.*', scene: 'oak.glb' }, 'prop.rock')).toBe(
      'special/rock.glb',
    );
    expect(resolve(resolver, { key: 'prop.*' })).toBeNull();
    // The CC0 pack's synthetic handle names no loadable file.
    expect(resolve(resolver, { key: 'prop.*', scene: 'placeholder:prop' })).toBeNull();
  });
});

describe('the full loop: core decides, Babylon executes', () => {
  const resolver = new BindingResolver().addSource({
    name: 'packs',
    priority: 50,
    entries: [
      { key: 'building.*', scene: 'buildings/generic.glb' },
      { key: 'prop.*', scene: 'props/generic.glb' },
    ],
  });

  const ir = {
    meta: { seed: 'loop' },
    entities: {
      buildings: [{ id: 'bld.a', role: 'commercial', position: { x: 4.4, z: 8.6 } }],
      props: [{ id: 'prop.a', kind: 'tree', position: { x: 1, z: 1 } }],
    },
  };

  it('places a world, then reconciles a regeneration without clobbering a hand edit', () => {
    const scene = freshScene();
    const progress = new BabylonProgressSink();
    const host = createBabylonEditorHost(scene, { assetBaseUrl: '/a/', onProgress: undefined });
    const mutator = host.sceneMutator;

    // 1. First import — the scene is empty, so everything is `added`.
    const first = computePlacement(ir, resolver, { assetResolver: host.assetResolver, progress });
    const firstReport = applyReimport([], first.nodes, mutator, progress);
    expect(firstReport.added).toEqual(['bld.a', 'nav.region', 'prop.a']);
    expect(mutator.findByEntityId('bld.a')!.position.asArray()).toEqual([4, 0, 9]);
    expect(readStamp(mutator.findByEntityId('prop.a')!)!.archetype).toBe('prop.tree');
    expect(progress.steps.map((s) => s.phase)).toEqual(['placement', 'reimport']);

    // 2. The creator moves the tree and clears its `generated` flag to keep it.
    const tree = mutator.findByEntityId('prop.a')!;
    tree.position.set(50, 0, 50);
    const stamp = readStamp(tree)!;
    (tree.metadata as Record<string, unknown>).insimul = { ...stamp, generated: false };

    // 3. The world is regenerated: the building moves, the tree is unchanged in
    //    the IR, and a new prop appears.
    const regenerated = computePlacement(
      {
        ...ir,
        entities: {
          buildings: [{ id: 'bld.a', role: 'commercial', position: { x: 20, z: 8.6 } }],
          props: [
            { id: 'prop.a', kind: 'tree', position: { x: 1, z: 1 } },
            { id: 'prop.b', kind: 'rock', position: { x: 2, z: 2 } },
          ],
        },
      },
      resolver,
      { assetResolver: host.assetResolver },
    );

    const report = computeReimportDiff(mutator.readSceneNodes(), regenerated.nodes);
    expect(report.updated).toEqual(['bld.a']);
    expect(report.added).toEqual(['prop.b']);
    expect(report.skipped).toEqual(['prop.a']); // the hand edit
    expect(report.unchanged).toEqual(['nav.region']);

    applyReimport(mutator.readSceneNodes(), regenerated.nodes, mutator);

    // The hand edit survived verbatim; the generated building moved; the new
    // prop exists.
    expect(tree.position.asArray()).toEqual([50, 0, 50]);
    expect(mutator.findByEntityId('bld.a')!.position.asArray()).toEqual([20, 0, 9]);
    expect(mutator.findByEntityId('prop.b')).not.toBeNull();
  });
});
