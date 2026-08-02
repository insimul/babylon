/**
 * US-2 of `101-editor-plugin-core` — the placement math.
 *
 * The golden manifest lives in `conformance/editor/scene-placement.json`; what is
 * here is the quantization/sampling contract underneath it, the host seams
 * (`AssetResolver`, `ProgressSink`), and the degenerate inputs a golden cannot
 * carry.
 */

import { describe, expect, it } from 'vitest';

import { BindingResolver, type BindingEntry } from '../binding';
import {
  SCENE_COORD_QUANTUM,
  collectUsedArchetypes,
  computePlacement,
  parseManifestNodes,
  quantizeSceneCoord,
  sampleTerrainHeight,
  serializePlacementManifest,
  type PlacementWorldIR,
} from '../scene';
import { RecordingProgressSink, type AssetResolver } from '../host-contracts';

const placeholderTier = new BindingResolver().addSource({
  name: 'insimul-placeholder',
  priority: 0,
  entries: [
    { key: 'building.*', scene: 'placeholder:building' },
    { key: 'prop.*', scene: 'placeholder:prop' },
    { key: 'terrain.*', scene: 'placeholder:terrain' },
  ],
});

describe('quantizeSceneCoord', () => {
  it('rounds to the quantum without reintroducing float noise', () => {
    expect(SCENE_COORD_QUANTUM).toBe(0.001);
    // Dividing by the exact inverse (1000) keeps 1.4 on the clean double; the
    // multiply-by-0.001 formulation yields 1.4000000000000001.
    expect(JSON.stringify(quantizeSceneCoord(1.4))).toBe('1.4');
    expect(quantizeSceneCoord(3.1416)).toBe(3.142);
    expect(quantizeSceneCoord(1.9679999)).toBe(1.968);
  });

  it('rounds halves AWAY from zero, matching the engines’ std::round', () => {
    // Math.round would give -0 here (it rounds half toward +∞); C++ gives -0.001.
    expect(quantizeSceneCoord(-0.0005)).toBe(-0.001);
    expect(quantizeSceneCoord(0.0005)).toBe(0.001);
  });

  it('normalizes signed zero and refuses non-finite input', () => {
    expect(Object.is(quantizeSceneCoord(-0), 0)).toBe(true);
    expect(Object.is(quantizeSceneCoord(-0.00001), 0)).toBe(true);
    expect(quantizeSceneCoord(Number.NaN)).toBe(0);
    expect(quantizeSceneCoord(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('sampleTerrainHeight', () => {
  const heights = [0, 0, 0, 0, 4, 0, 0, 0, 0]; // 3×3, a single peak at the centre

  it('interpolates bilinearly over the grid', () => {
    expect(sampleTerrainHeight(heights, 3, 100, 100, 50, 50)).toBe(4);
    expect(sampleTerrainHeight(heights, 3, 100, 100, 25, 25)).toBe(1);
  });

  it('clamps out-of-range world coordinates to the edge instead of extrapolating', () => {
    expect(sampleTerrainHeight(heights, 3, 100, 100, -500, -500)).toBe(0);
    expect(sampleTerrainHeight(heights, 3, 100, 100, 5000, 5000)).toBe(0);
  });

  it('degrades safely: no map, single sample, zero extent', () => {
    expect(sampleTerrainHeight([], 3, 100, 100, 10, 10)).toBe(0);
    expect(sampleTerrainHeight(heights, 0, 100, 100, 10, 10)).toBe(0);
    expect(sampleTerrainHeight([7], 1, 100, 100, 10, 10)).toBe(7);
    expect(sampleTerrainHeight(heights, 3, 0, 0, 10, 10)).toBe(heights[0]);
  });
});

describe('computePlacement', () => {
  it('places nothing but the nav root for an empty world', () => {
    const result = computePlacement({}, placeholderTier);
    expect(result.ok).toBe(true);
    expect(result.seed).toBe('');
    expect(result.nodes.map((n) => n.entityId)).toEqual(['nav.region']);
  });

  it('reports a non-object IR instead of throwing', () => {
    const result = computePlacement(null as unknown as PlacementWorldIR, placeholderTier);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('World IR root is not an object');
    expect(result.nodes).toEqual([]);
  });

  it('snaps building footprints to the grid and scales by zone role', () => {
    const ir: PlacementWorldIR = {
      entities: {
        buildings: [
          { id: 'a', role: 'commercial', position: { x: 10.4, z: 20.6 } },
          { id: 'b', position: { x: 1, z: 1 } }, // no role ⇒ residential, unscaled
        ],
      },
    };
    const nodes = computePlacement(ir, placeholderTier).nodes;
    const a = nodes.find((n) => n.entityId === 'a')!;
    const b = nodes.find((n) => n.entityId === 'b')!;
    expect(a.position).toEqual({ x: 10, y: 0, z: 21 });
    expect(a.scale).toEqual({ x: 1.3, y: 1.3, z: 1.3 });
    expect(a.archetype).toBe('building.commercial');
    expect(b.archetype).toBe('building.residential');
    expect(b.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('emits an interior node only when the building declares one, and never binds it', () => {
    const nodes = computePlacement(
      { entities: { buildings: [{ id: 'a', interior: true }, { id: 'b' }] } },
      placeholderTier,
    ).nodes;
    const interior = nodes.find((n) => n.entityId === 'a.interior')!;
    expect(interior.kind).toBe('interior');
    expect(interior.archetype).toBe('');
    expect(interior.assetRef).toBe('');
    expect(nodes.some((n) => n.entityId === 'b.interior')).toBe(false);
  });

  it('honours an explicit archetype override over the role/kind default', () => {
    const nodes = computePlacement(
      {
        geography: { roads: [{ id: 'r', archetype: 'terrain.texture.gravel' }] },
        entities: {
          buildings: [{ id: 'a', role: 'commercial', archetype: 'building.civic.townhall' }],
          props: [{ id: 'p', kind: 'tree', archetype: 'prop.vegetation.oak' }],
        },
      },
      placeholderTier,
    ).nodes;
    expect(nodes.find((n) => n.entityId === 'a')!.archetype).toBe('building.civic.townhall');
    expect(nodes.find((n) => n.entityId === 'p')!.archetype).toBe('prop.vegetation.oak');
    expect(nodes.find((n) => n.entityId === 'r')!.archetype).toBe('terrain.texture.gravel');
  });

  it('leaves a node unbound rather than dropping it when nothing resolves', () => {
    const empty = new BindingResolver();
    const node = computePlacement({ entities: { props: [{ id: 'p', kind: 'tree' }] } }, empty).nodes.find(
      (n) => n.entityId === 'p',
    )!;
    expect(node.archetype).toBe('prop.tree');
    expect(node.assetRef).toBe('');
    expect(node.bindingSource).toBe('');
  });

  it('emits nodes in ascending entityId order regardless of IR order', () => {
    const nodes = computePlacement(
      { entities: { props: [{ id: 'z' }, { id: 'a' }, { id: 'm' }] } },
      placeholderTier,
    ).nodes;
    expect(nodes.map((n) => n.entityId)).toEqual(['a', 'm', 'nav.region', 'z']);
  });
});

describe('host seams', () => {
  const ir: PlacementWorldIR = { entities: { props: [{ id: 'p', kind: 'tree' }] } };

  it('lets an AssetResolver replace the binding entry’s own handle', () => {
    const seen: Array<[string, string]> = [];
    const resolver: AssetResolver = {
      resolveAssetHandle(entry: BindingEntry, archetype) {
        seen.push([entry.key, archetype]);
        return `unity://guid/${archetype}`;
      },
    };
    const node = computePlacement(ir, placeholderTier, { assetResolver: resolver }).nodes.find(
      (n) => n.entityId === 'p',
    )!;
    expect(node.assetRef).toBe('unity://guid/prop.tree');
    expect(node.bindingSource).toBe('insimul-placeholder');
    expect(seen).toEqual([['prop.*', 'prop.tree']]);
  });

  it('treats a null AssetResolver answer as unbound, keeping the node placed', () => {
    const resolver: AssetResolver = { resolveAssetHandle: () => null };
    const node = computePlacement(ir, placeholderTier, { assetResolver: resolver }).nodes.find(
      (n) => n.entityId === 'p',
    )!;
    expect(node.assetRef).toBe('');
    expect(node.bindingSource).toBe('');
  });

  it('reports progress when a sink is supplied, and is silent when it is not', () => {
    const progress = new RecordingProgressSink();
    computePlacement(ir, placeholderTier, { progress });
    expect(progress.steps).toEqual([
      { phase: 'placement', level: 'info', message: 'placed 2 node(s)', completed: 2, total: 2 },
    ]);
    expect(() => computePlacement(ir, placeholderTier)).not.toThrow();
  });
});

describe('manifest serialization', () => {
  const ir: PlacementWorldIR = {
    meta: { seed: 's' },
    entities: { buildings: [{ id: 'a', rotation: 3.14159, position: { x: 0.00049 } }] },
  };

  it('quantizes on the way out', () => {
    const json = JSON.parse(serializePlacementManifest(computePlacement(ir, placeholderTier)));
    const node = json.nodes.find((n: { entityId: string }) => n.entityId === 'a');
    expect(node.rotationY).toBe(3.142);
    expect(node.position.x).toBe(0);
  });

  it('parses back, defaulting scale and refusing an unidentifiable node', () => {
    expect(parseManifestNodes({ nodes: [{ entityId: 'a' }] })).toEqual({
      ok: true,
      value: [
        {
          entityId: 'a',
          kind: '',
          archetype: '',
          assetRef: '',
          bindingSource: '',
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
          scale: { x: 1, y: 1, z: 1 },
          generated: false,
        },
      ],
    });
    expect(parseManifestNodes(null)).toEqual({ ok: false, error: 'manifest is not an object' });
    expect(parseManifestNodes({})).toEqual({
      ok: false,
      error: 'manifest.nodes missing or not an array',
    });
    expect(parseManifestNodes({ nodes: [1] })).toEqual({
      ok: false,
      error: 'manifest.nodes entry is not an object',
    });
    expect(parseManifestNodes({ nodes: [{ kind: 'prop' }] })).toEqual({
      ok: false,
      error: 'manifest node missing entityId',
    });
  });

  it('collects the distinct archetypes a manifest binds against', () => {
    const nodes = computePlacement(
      { entities: { props: [{ id: 'a', kind: 'tree' }, { id: 'b', kind: 'tree' }, { id: 'c' }] } },
      placeholderTier,
    ).nodes;
    // nav.region carries no archetype and must not appear as an empty key.
    expect(collectUsedArchetypes(nodes)).toEqual(['prop.generic', 'prop.tree']);
  });
});
