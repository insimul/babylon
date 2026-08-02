/**
 * Scene-placement math (US-2 of `101-editor-plugin-core`).
 *
 * Given a World IR and a resolved binding chain, this computes the deterministic
 * **placement manifest**: the ordered set of nodes an editor plugin materializes
 * — terrain chunks, roads, buildings (+ interiors), props and the navigation
 * bake region — each carrying its stable entityId, resolved archetype + asset
 * handle, world transform, and `generated` flag.
 *
 * It is the *decision* half of class (b): core says which node goes where and
 * what it is bound to; the host turns each node into a `GameObject` + prefab, an
 * `AActor` + `ULevelInstance`, a `Node3D` + `PackedScene` or a Babylon
 * `TransformNode` (see `../host-contracts`).
 *
 * Previously implemented three times (Unity `Runtime/Scene/SceneGenerator.cs`,
 * Unreal `Portable/InsimulScenePlacement.cpp`, Godot `gdextension/src/scene_placement.cpp`
 * + its GDScript twin) and zero times in core. The math here is the same math,
 * pinned by `conformance/editor/scene-placement.json`, whose expected manifest is
 * the numeric content of the goldens all three engines already commit.
 *
 * ## Determinism
 *
 * The manifest is a pure function of (IR, resolver). Nodes are emitted in
 * canonical entityId (ordinal) order and every coordinate is quantized to
 * {@link SCENE_COORD_QUANTUM}, so a 32-bit engine float and a 64-bit host double
 * round to the same serialized value. Two runs — or two engines — produce
 * byte-identical output.
 *
 * ## §5.1, settled
 *
 * The analysis found the manifest had forked: Unity/Unreal write the asset
 * handle under `assetRef` and title-case the tier (`Project`, `Placeholder`);
 * Godot writes `scene` and lowercases it. **The canonical form is `assetRef`,
 * with `bindingSource` carrying the resolving tier's `name` verbatim** — two of
 * three legs already write `assetRef`, and a tier name is data (`packs`,
 * `insimul-placeholder`), not an enum, so title-casing it loses information.
 * Renames owed: Godot `scene` → `assetRef` and drop the case-folding; Unity's
 * re-import path must emit the layer name its scene path already emits, not the
 * `BindingSourceKind` enum name.
 */

import { canonicalStringify } from '../../save-export';
import type { AssetResolver, ProgressSink } from '../host-contracts';
import type { BindingResolver } from '../binding/resolver';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Coordinates are rounded to this quantum before serialization so float32 and
 * float64 evaluations of the same placement agree byte-for-byte.
 */
export const SCENE_COORD_QUANTUM = 0.001;

/** Grid snap applied to building footprints. */
export const SCENE_GRID_SIZE = 1.0;

/** `manifestVersion` of the placement-manifest document. */
export const PLACEMENT_MANIFEST_VERSION = 1;

/**
 * Zone-based footprint scaling by building role. Mirrors the runtime
 * `building_placement_system` table; unknown roles (and `residential`) are
 * unscaled.
 */
export const ZONE_SCALE: Readonly<Record<string, number>> = {
  commercial: 1.3,
  downtown: 1.4,
  industrial: 1.2,
  outskirts: 0.9,
};

function zoneScaleForRole(role: string): number {
  return ZONE_SCALE[role] ?? 1.0;
}

// ─── The placement input ─────────────────────────────────────────────────────

/**
 * The placement-relevant projection of an exported World IR.
 *
 * **This is not a second World IR.** It is the subset of the exported world
 * document the placement pass reads, and it is exactly the shape all three
 * engines already parse (`meta.seed`, `geography.terrain`, `geography.roads`,
 * `entities.buildings`, `entities.props`) and pin in their committed golden IR.
 * Every field is optional because a partial world must still place what it has.
 *
 * Relationship to `game-engine/ir-types.ts` `WorldIR`, stated so nobody defines
 * identity twice: `WorldIR` is the full authored contract and is the upstream of
 * this document, but its `RoadIR` and `NatureObjectIR` carry **no stable id**
 * (`RoadIR` is `{fromId, toId, waypoints, …}`), while every node here — and
 * every re-import match key — is keyed on one. Projecting `WorldIR` into this
 * shape therefore requires an id-minting policy, which is the same open question
 * §3 of the analysis raises about KINP CURIEs versus the bare local ids the
 * stamp uses today. That policy is deliberately NOT guessed here; until it is
 * settled the placement input is the exported document, which already carries
 * the ids.
 */
export interface PlacementWorldIR {
  meta?: { seed?: string } & Record<string, unknown>;
  geography?: {
    terrain?: PlacementTerrainIR;
    roads?: PlacementRoadIR[];
  } & Record<string, unknown>;
  entities?: {
    buildings?: PlacementBuildingIR[];
    props?: PlacementPropIR[];
  } & Record<string, unknown>;
}

/** A `{x, y, z}` point; absent components are 0. */
export interface PlacementPoint {
  x?: number;
  y?: number;
  z?: number;
}

export interface PlacementTerrainIR {
  /** World extent on the X/Z axes. */
  size?: { x?: number; z?: number };
  /** Edge length of one terrain chunk. */
  chunkSize?: number;
  heightmap?: {
    /** Grid resolution; the `heights` array is `resolution * resolution`, row-major. */
    resolution?: number;
    heights?: number[];
  };
}

export interface PlacementRoadIR {
  id: string;
  /** Archetype override; defaults to `terrain.texture.road`. */
  archetype?: string;
  /** Ordered control points; the node sits at their centroid. */
  points?: PlacementPoint[];
}

export interface PlacementBuildingIR {
  id: string;
  /** Zone role driving both the default archetype and the footprint scale. */
  role?: string;
  /** Archetype override; defaults to `building.<role>`. */
  archetype?: string;
  position?: PlacementPoint;
  /** Y-axis rotation in radians. */
  rotation?: number;
  /** `true` ⇒ emit a separate interior node at the origin (door-warp convention). */
  interior?: boolean;
}

export interface PlacementPropIR {
  id: string;
  /** Prop kind driving the default archetype. */
  kind?: string;
  /** Archetype override; defaults to `prop.<kind>`. */
  archetype?: string;
  position?: PlacementPoint;
  /** Y-axis rotation in radians. */
  rotation?: number;
}

// ─── The placement output ────────────────────────────────────────────────────

/** A concrete `{x, y, z}` with no optional components. */
export interface SceneVec3 {
  x: number;
  y: number;
  z: number;
}

/** The node kinds the placement pass emits. */
export type PlacedNodeKind =
  | 'terrain_chunk'
  | 'road'
  | 'building'
  | 'interior'
  | 'prop'
  | 'nav_region';

/** One node in the placement manifest. */
export interface PlacedNode {
  /** Stable entity id — the re-import match key. */
  entityId: string;
  kind: PlacedNodeKind | string;
  /** Taxonomy key resolved against the binding chain (`''` = no binding). */
  archetype: string;
  /** Resolved asset handle (`''` when unbound). See §5.1 in the module header. */
  assetRef: string;
  /** Name of the tier that resolved it (`''` when unbound). */
  bindingSource: string;
  position: SceneVec3;
  /** Y-axis rotation in radians. */
  rotationY: number;
  scale: SceneVec3;
  /** Every node this pass emits is generated content. */
  generated: boolean;
}

/** The result of a placement pass. */
export interface PlacementResult {
  ok: boolean;
  error: string;
  /** The world seed, carried through for provenance. */
  seed: string;
  /** Canonical order: ascending entityId (ordinal). */
  nodes: PlacedNode[];
}

/** What a placement pass may be handed from the host. */
export interface PlacementOptions {
  /** Absent ⇒ the binding entry's own `scene ?? mesh` is the asset handle. */
  assetResolver?: AssetResolver;
  /** Absent ⇒ core reports nothing. */
  progress?: ProgressSink;
}

// ─── Math ────────────────────────────────────────────────────────────────────

/**
 * Round a coordinate to {@link SCENE_COORD_QUANTUM}, ties **away from zero**,
 * normalizing signed zero.
 *
 * Two details that are contract, not style:
 *  - divide after rounding by the exact integer inverse (1000), never multiply
 *    by the inexact `0.001` lexeme — dividing keeps the result on the cleanest
 *    nearby double (`1.4` stays `"1.4"` instead of `"1.4000000000000001"`);
 *  - round half away from zero, because the engine legs use C++ `std::round`.
 *    `Math.round` rounds half toward `+∞`, so it disagrees on exact negative
 *    halves (`Math.round(-0.5) === -0` vs `std::round(-0.5) == -1`).
 */
export function quantizeSceneCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const inv = 1 / SCENE_COORD_QUANTUM; // 1000, exactly representable
  const scaled = value * inv;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  const q = rounded / inv;
  return q === 0 ? 0 : q; // normalize -0
}

/**
 * Bilinear height lookup over a row-major heightmap grid
 * (`resolution × resolution`) covering `[0..sizeX] × [0..sizeZ]`. Out-of-range
 * world coordinates clamp to the edge; a degenerate map returns 0.
 */
export function sampleTerrainHeight(
  heights: readonly number[],
  resolution: number,
  sizeX: number,
  sizeZ: number,
  worldX: number,
  worldZ: number,
): number {
  if (resolution < 1 || heights.length === 0) return 0;
  if (resolution === 1) return heights[0];
  if (sizeX <= 0 || sizeZ <= 0) return heights[0];

  let gx = (worldX / sizeX) * (resolution - 1);
  let gz = (worldZ / sizeZ) * (resolution - 1);
  gx = Math.min(Math.max(gx, 0), resolution - 1);
  gz = Math.min(Math.max(gz, 0), resolution - 1);

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, resolution - 1);
  const z1 = Math.min(z0 + 1, resolution - 1);
  const fx = gx - x0;
  const fz = gz - z0;

  const at = (xi: number, zi: number): number => {
    const idx = zi * resolution + xi;
    return idx < heights.length ? heights[idx] : 0;
  };

  const top = at(x0, z0) + (at(x1, z0) - at(x0, z0)) * fx;
  const bot = at(x0, z1) + (at(x1, z1) - at(x0, z1)) * fx;
  return top + (bot - top) * fz;
}

// ─── The placement pass ──────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function point(p: PlacementPoint | undefined): SceneVec3 {
  return { x: num(p?.x), y: num(p?.y), z: num(p?.z) };
}

function ceilDiv(a: number, b: number): number {
  if (b <= 0) return 1;
  return Math.ceil(a / b);
}

function node(entityId: string, kind: string, archetype: string): PlacedNode {
  return {
    entityId,
    kind,
    archetype,
    assetRef: '',
    bindingSource: '',
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    scale: { x: 1, y: 1, z: 1 },
    generated: true,
  };
}

/** Resolve a node's archetype through the chain and fill assetRef/bindingSource. */
function resolveNodeAsset(
  resolver: BindingResolver,
  target: PlacedNode,
  assetResolver?: AssetResolver,
): void {
  if (!target.archetype) return;
  const result = resolver.resolve(target.archetype);
  if (!result.resolved || result.entry === null) return;
  const handle = assetResolver
    ? assetResolver.resolveAssetHandle(result.entry, target.archetype, result)
    : (result.entry.scene ?? result.entry.mesh ?? '');
  if (handle === null || handle === '') return;
  target.assetRef = handle;
  target.bindingSource = result.sourceName;
}

/**
 * Compute the placement manifest from a World IR and a resolver whose tiers are
 * already sorted (`resolver.sortSourcesByPriority()`).
 */
export function computePlacement(
  worldIr: PlacementWorldIR,
  resolver: BindingResolver,
  options: PlacementOptions = {},
): PlacementResult {
  const result: PlacementResult = { ok: false, error: '', seed: '', nodes: [] };
  if (typeof worldIr !== 'object' || worldIr === null || Array.isArray(worldIr)) {
    result.error = 'World IR root is not an object';
    return result;
  }
  const { assetResolver, progress } = options;

  result.seed = typeof worldIr.meta?.seed === 'string' ? worldIr.meta.seed : '';

  const geography = worldIr.geography;
  const entities = worldIr.entities;

  // ── Terrain: heightmap + chunk grid ──────────────────────────────────────
  const terrain = geography?.terrain;
  const heights = Array.isArray(terrain?.heightmap?.heights)
    ? terrain!.heightmap!.heights!.map((h) => num(h))
    : [];
  const resolution = Math.trunc(num(terrain?.heightmap?.resolution));
  const sizeX = num(terrain?.size?.x);
  const sizeZ = num(terrain?.size?.z);
  const chunkSize = num(terrain?.chunkSize);

  const heightAt = (wx: number, wz: number): number =>
    sampleTerrainHeight(heights, resolution, sizeX, sizeZ, wx, wz);

  if (sizeX > 0 && sizeZ > 0 && chunkSize > 0) {
    const chunksX = ceilDiv(sizeX, chunkSize);
    const chunksZ = ceilDiv(sizeZ, chunkSize);
    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const chunk = node(`terrain.chunk.${cx}_${cz}`, 'terrain_chunk', 'terrain.chunk');
        const centreX = cx * chunkSize + chunkSize * 0.5;
        const centreZ = cz * chunkSize + chunkSize * 0.5;
        chunk.position = { x: centreX, y: heightAt(centreX, centreZ), z: centreZ };
        resolveNodeAsset(resolver, chunk, assetResolver);
        result.nodes.push(chunk);
      }
    }
  }

  // ── Roads ────────────────────────────────────────────────────────────────
  for (const road of geography?.roads ?? []) {
    if (typeof road !== 'object' || road === null) continue;
    const target = node(
      typeof road.id === 'string' ? road.id : '',
      'road',
      road.archetype || 'terrain.texture.road',
    );
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (const p of road.points ?? []) {
      if (typeof p !== 'object' || p === null) continue;
      const pv = point(p);
      sx += pv.x;
      sz += pv.z;
      count++;
    }
    const cx = count > 0 ? sx / count : 0;
    const cz = count > 0 ? sz / count : 0;
    target.position = { x: cx, y: heightAt(cx, cz), z: cz };
    resolveNodeAsset(resolver, target, assetResolver);
    result.nodes.push(target);
  }

  // ── Buildings (+ interiors) ──────────────────────────────────────────────
  for (const building of entities?.buildings ?? []) {
    if (typeof building !== 'object' || building === null) continue;
    const role = typeof building.role === 'string' && building.role ? building.role : 'residential';
    const target = node(
      typeof building.id === 'string' ? building.id : '',
      'building',
      building.archetype || `building.${role}`,
    );
    const p = point(building.position);
    // Snap the footprint to the placement grid, then sample terrain height.
    const snappedX = Math.round(p.x / SCENE_GRID_SIZE) * SCENE_GRID_SIZE;
    const snappedZ = Math.round(p.z / SCENE_GRID_SIZE) * SCENE_GRID_SIZE;
    target.position = { x: snappedX, y: heightAt(snappedX, snappedZ), z: snappedZ };
    target.rotationY = num(building.rotation);
    const s = zoneScaleForRole(role);
    target.scale = { x: s, y: s, z: s };
    resolveNodeAsset(resolver, target, assetResolver);
    result.nodes.push(target);

    // The interior is a SEPARATE node at the origin (the door-warp convention).
    // There is no `interior` taxonomy root, so it carries no binding archetype.
    if (building.interior === true) {
      result.nodes.push(node(`${target.entityId}.interior`, 'interior', ''));
    }
  }

  // ── Props ────────────────────────────────────────────────────────────────
  for (const prop of entities?.props ?? []) {
    if (typeof prop !== 'object' || prop === null) continue;
    const kind = typeof prop.kind === 'string' && prop.kind ? prop.kind : 'generic';
    const target = node(
      typeof prop.id === 'string' ? prop.id : '',
      'prop',
      prop.archetype || `prop.${kind}`,
    );
    const p = point(prop.position);
    target.position = { x: p.x, y: heightAt(p.x, p.z), z: p.z };
    target.rotationY = num(prop.rotation);
    resolveNodeAsset(resolver, target, assetResolver);
    result.nodes.push(target);
  }

  // ── Navigation bake root (single, no binding) ────────────────────────────
  result.nodes.push(node('nav.region', 'nav_region', ''));

  // Canonical order: stable sort by entityId ascending (ordinal).
  result.nodes.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));

  result.ok = true;
  progress?.report({
    phase: 'placement',
    level: 'info',
    message: `placed ${result.nodes.length} node(s)`,
    completed: result.nodes.length,
    total: result.nodes.length,
  });
  return result;
}

/** Every distinct archetype the manifest binds against, ascending. */
export function collectUsedArchetypes(nodes: readonly PlacedNode[]): string[] {
  const keys = new Set<string>();
  for (const n of nodes) if (n.archetype) keys.add(n.archetype);
  return [...keys].sort();
}

// ─── Serialization ───────────────────────────────────────────────────────────

function quantizedVec3(v: SceneVec3): SceneVec3 {
  return {
    x: quantizeSceneCoord(v.x),
    y: quantizeSceneCoord(v.y),
    z: quantizeSceneCoord(v.z),
  };
}

/** A manifest node with every coordinate quantized — the serialized form. */
export function quantizeNode(n: PlacedNode): PlacedNode {
  return {
    ...n,
    position: quantizedVec3(n.position),
    rotationY: quantizeSceneCoord(n.rotationY),
    scale: quantizedVec3(n.scale),
  };
}

/**
 * Serialize a placement result as the canonical placement-manifest JSON — the
 * artifact compared against the cross-engine golden. Key-sorted, minified,
 * coordinate-quantized; byte-deterministic across runs and engines.
 */
export function serializePlacementManifest(result: PlacementResult): string {
  return canonicalStringify({
    manifestVersion: PLACEMENT_MANIFEST_VERSION,
    seed: result.seed,
    nodeCount: result.nodes.length,
    nodes: result.nodes.map(quantizeNode),
  });
}

/**
 * Parse a placement-manifest document's `nodes` array into {@link PlacedNode}s —
 * how a re-import reads both the previously-written manifest and the freshly
 * computed one. Returns an error naming the first malformed element.
 */
export function parseManifestNodes(
  manifest: unknown,
): { ok: true; value: PlacedNode[] } | { ok: false; error: string } {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return { ok: false, error: 'manifest is not an object' };
  }
  const raw = (manifest as Record<string, unknown>).nodes;
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'manifest.nodes missing or not an array' };
  }

  const out: PlacedNode[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { ok: false, error: 'manifest.nodes entry is not an object' };
    }
    const o = item as Record<string, unknown>;
    const entityId = typeof o.entityId === 'string' ? o.entityId : '';
    if (!entityId) return { ok: false, error: 'manifest node missing entityId' };

    const readVec = (v: unknown, fallback: SceneVec3): SceneVec3 => {
      if (typeof v !== 'object' || v === null) return fallback;
      const r = v as Record<string, unknown>;
      return { x: num(r.x), y: num(r.y), z: num(r.z) };
    };

    out.push({
      entityId,
      kind: typeof o.kind === 'string' ? o.kind : '',
      archetype: typeof o.archetype === 'string' ? o.archetype : '',
      assetRef: typeof o.assetRef === 'string' ? o.assetRef : '',
      bindingSource: typeof o.bindingSource === 'string' ? o.bindingSource : '',
      position: readVec(o.position, { x: 0, y: 0, z: 0 }),
      rotationY: num(o.rotationY),
      scale: o.scale === undefined ? { x: 1, y: 1, z: 1 } : readVec(o.scale, { x: 1, y: 1, z: 1 }),
      generated: o.generated === true,
    });
  }
  return { ok: true, value: out };
}
