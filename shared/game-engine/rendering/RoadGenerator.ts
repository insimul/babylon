/**
 * RoadGenerator - Creates road/path meshes between and within settlements.
 * Uses a minimum spanning tree (Kruskal's) to connect settlements efficiently,
 * then generates terrain-following ribbon meshes for each road segment.
 * Also renders intra-settlement street networks with intersections, sidewalks,
 * and street name signs.
 */

import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import type { StreetSegment } from './StreetAlignedPlacement';
import type { StreetNetwork, StreetSegment as StreetSegmentData } from '../types';
import type { StreetNetworkIR } from '../ir-types';

export interface RoadSegment {
  from: Vector3;
  to: Vector3;
  mesh: Mesh;
}

interface SettlementNode {
  id: string;
  position: Vector3;
}

interface Edge {
  fromIdx: number;
  toIdx: number;
  distance: number;
}

/** Stored segment line for point-on-road queries. */
interface StoredSegment {
  ax: number; az: number;
  bx: number; bz: number;
  halfWidth: number;
}

export class RoadGenerator {
  private scene: Scene;
  private roadMeshes: Mesh[] = [];
  private roadWidth: number = 10;
  private sampleInterval: number = 4;
  private yOffset: number = 0.08; // Offset above ground to prevent z-fighting with terrain

  // Road appearance
  private roadColor: Color3 = new Color3(0.40, 0.39, 0.36); // Soft neutral default
  private roadTexture: Texture | null = null;

  /** Flat list of segment lines used for isPointOnRoad queries. */
  private storedSegments: StoredSegment[] = [];

  /** PointLights attached to lamp posts — managed by DayNightCycle for on/off. */
  private streetLights: PointLight[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Register a road mesh. */
  private addRoadMesh(mesh: Mesh): void {
    this.roadMeshes.push(mesh);
  }

  /**
   * Set road width (default 3 units)
   */
  public setRoadWidth(width: number): void {
    this.roadWidth = width;
  }

  /**
   * Set road texture from asset collection
   */
  public setRoadTexture(texture: Texture): void {
    this.roadTexture = texture;
  }

  /**
   * Load a default asphalt texture from polyhaven assets.
   * Called when no world-specific road texture is configured.
   */
  public loadDefaultAsphaltTexture(): void {
    if (this.roadTexture) return; // Already has a texture
    const tex = new Texture(
      'assets/textures/polyhaven/asphalt_04/asphalt_04_diff_1k.jpg',
      this.scene
    );
    tex.uScale = 1;
    tex.vScale = 1;
    this.roadTexture = tex;
  }

  /**
   * Set road color (used when no texture is available)
   */
  public setRoadColor(color: Color3): void {
    this.roadColor = color;
  }

  /**
   * Generate roads between settlements using a minimum spanning tree
   * @param settlements Array of settlement positions with IDs
   * @param sampleHeight Function to get terrain height at (x, z)
   */
  public generateRoads(
    settlements: SettlementNode[],
    sampleHeight: (x: number, z: number) => number
  ): RoadSegment[] {
    if (settlements.length < 2) return [];

    // Build MST using Kruskal's algorithm
    const mstEdges = this.computeMST(settlements);

    const segments: RoadSegment[] = [];

    for (const edge of mstEdges) {
      const from = settlements[edge.fromIdx].position;
      const to = settlements[edge.toIdx].position;
      const segId = `road_${settlements[edge.fromIdx].id}_${settlements[edge.toIdx].id}`;

      const mesh = this.createRoadSegment(segId, from, to, sampleHeight);
      if (mesh) {
        segments.push({ from, to, mesh });
        this.addRoadMesh(mesh);
        this.storedSegments.push({
          ax: from.x, az: from.z, bx: to.x, bz: to.z,
          halfWidth: this.roadWidth / 2,
        });
      }
    }

    // console.log(`[RoadGenerator] Generated ${segments.length} road segments connecting ${settlements.length} settlements`);
    return segments;
  }

  /**
   * Render a complete street network within a settlement.
   * Creates road meshes for each street segment, intersection discs,
   * sidewalk ribbons, and street name signs at key intersections.
   */
  public generateSettlementStreets(
    settlementId: string,
    network: StreetNetwork,
    sampleHeight: (x: number, z: number) => number
  ): void {
    if (!network.segments.length) return;

    const sidewalkColor = new Color3(0.52, 0.51, 0.49); // Concrete sidewalk (softened)
    const intersectionColor = new Color3(0.40, 0.39, 0.37); // Darker pavement (softened)
    const centerLineColor = new Color3(0.58, 0.53, 0.25); // Yellow center stripe (muted)
    const crosswalkColor = new Color3(0.68, 0.68, 0.66); // White crosswalk stripes (muted)
    const sidewalkWidth = 2.0;
    const centerLineWidth = 0.2;
    const curbHeight = 0;

    // Build list of intersection positions for proximity-based detection.
    // This works regardless of whether nodeIds align with waypoints (they don't
    // for server-reconstructed networks where each segment has only 2 nodeIds).
    const intersectionPositions: { x: number; z: number }[] = [];
    for (const node of network.nodes) {
      if (node.intersectionOf.length >= 2) {
        intersectionPositions.push({ x: node.x, z: node.z });
      }
    }

    const isNearIntersection = (wx: number, wz: number, threshold: number = 2.0): boolean => {
      for (const ip of intersectionPositions) {
        const dx = wx - ip.x;
        const dz = wz - ip.z;
        if (dx * dx + dz * dz < threshold * threshold) return true;
      }
      return false;
    };

    // Render each street segment
    for (const seg of network.segments) {
      if (seg.waypoints.length < 2) continue;

      // Road surface
      const mesh = this.createPolylineRoad(
        `street_${seg.id}`, seg.waypoints, sampleHeight, seg.width
      );
      if (mesh) this.addRoadMesh(mesh);

      // Store consecutive waypoint pairs for point-on-road queries
      const halfW = seg.width / 2;
      for (let wi = 0; wi < seg.waypoints.length - 1; wi++) {
        const wa = seg.waypoints[wi];
        const wb = seg.waypoints[wi + 1];
        this.storedSegments.push({
          ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, halfWidth: halfW,
        });
      }

      // Yellow center stripe (dashed)
      const dashes = this.createDashedCenterLine(
        `centerline_${seg.id}`, seg.waypoints, sampleHeight, centerLineWidth, centerLineColor
      );
      for (const dash of dashes) this.addRoadMesh(dash);

      // Sidewalks are now rendered as lot-edge strips (see generateLotSidewalks)
      // rather than street-parallel ribbons, so they don't cross intersections.
    }

    // Crosswalks and corner sidewalk pads at intersections
    for (const node of network.nodes) {
      if (node.intersectionOf.length < 2) continue;

      const meetingWidths = node.intersectionOf
        .map(segId => network.segments.find(s => s.id === segId)?.width ?? 2.5)
        .sort((a, b) => b - a);
      const maxWidth = meetingWidths[0];

      // Crosswalk stripes on each street arriving at this intersection
      for (const segId of node.intersectionOf) {
        const seg = network.segments.find(s => s.id === segId);
        if (!seg) continue;
        const crosswalks = this.createCrosswalk(
          `crosswalk_${node.id}_${segId}`, node, seg, sampleHeight, crosswalkColor
        );
        for (const cw of crosswalks) this.addRoadMesh(cw);
      }

    }

    this.placeStreetSigns(settlementId, network, sampleHeight);
  }

  /**
   * Generate sidewalks along the street-facing border of each lot.
   * The sidewalk sits at the lot boundary where the lot meets the street,
   * not at the building's front door.
   *
   * @param lots Array of building data with position, facing angle, and LOT dimensions
   * @param lotDimensions Map of lot IDs to actual lot width/depth (larger than building)
   * @param sampleHeight Ground height sampler
   */
  public generateLotSidewalks(
    lots: Array<{
      id: string;
      position: { x: number; z: number };
      facingAngle: number;
      lotWidth: number;
      lotDepth: number;
    }>,
    sampleHeight: (x: number, z: number) => number,
  ): void {
    const sidewalkColor = new Color3(0.52, 0.51, 0.49);
    const sw = 1.8; // sidewalk strip width

    // Shared material — zOffset pushes sidewalks closer to camera in depth buffer,
    // winning vs roads (zOffset -2) and ground (no zOffset)
    const mat = new StandardMaterial('sidewalk_lot_mat', this.scene);
    mat.diffuseColor = sidewalkColor;
    mat.specularColor = Color3.Black();
    mat.zOffset = -4;

    for (const lot of lots) {
      if (!lot.lotWidth || !lot.lotDepth) continue;

      const faceX = Math.sin(lot.facingAngle);
      const faceZ = Math.cos(lot.facingAngle);
      // Perpendicular direction (right when facing street)
      const perpX = faceZ;
      const perpZ = -faceX;

      const halfW = lot.lotWidth / 2;
      const halfD = lot.lotDepth / 2;

      // Check each edge: place a sidewalk strip if that edge borders a road.
      // Front is always a street (that's what facingAngle means).
      // Sides and back get sidewalks only if a road runs along them.
      const edges: Array<{
        name: string;
        cx: number; cz: number;       // Edge center
        meshW: number; meshH: number;  // Ground mesh dimensions
        testX: number; testZ: number;  // Point to test for road proximity
        always?: boolean;              // Front edge always gets a sidewalk
      }> = [
        {
          name: 'f',
          cx: lot.position.x + faceX * halfD,
          cz: lot.position.z + faceZ * halfD,
          meshW: lot.lotWidth + sw, meshH: sw,
          testX: lot.position.x + faceX * (halfD + sw),
          testZ: lot.position.z + faceZ * (halfD + sw),
          always: true,
        },
        {
          name: 'l',
          cx: lot.position.x - perpX * halfW,
          cz: lot.position.z - perpZ * halfW,
          meshW: sw, meshH: lot.lotDepth + sw,
          testX: lot.position.x - perpX * (halfW + sw),
          testZ: lot.position.z - perpZ * (halfW + sw),
        },
        {
          name: 'r',
          cx: lot.position.x + perpX * halfW,
          cz: lot.position.z + perpZ * halfW,
          meshW: sw, meshH: lot.lotDepth + sw,
          testX: lot.position.x + perpX * (halfW + sw),
          testZ: lot.position.z + perpZ * (halfW + sw),
        },
        {
          name: 'b',
          cx: lot.position.x - faceX * halfD,
          cz: lot.position.z - faceZ * halfD,
          meshW: lot.lotWidth + sw, meshH: sw,
          testX: lot.position.x - faceX * (halfD + sw),
          testZ: lot.position.z - faceZ * (halfD + sw),
        },
      ];

      for (const edge of edges) {
        // Only place sidewalk if this edge borders a road (or is the front)
        if (!edge.always && !this.isPointOnRoad(edge.testX, edge.testZ, 4)) continue;
        if (edge.meshH < 1 || edge.meshW < 1) continue;

        const mesh = MeshBuilder.CreateGround(
          `sidewalk_${edge.name}_${lot.id}`, { width: edge.meshW, height: edge.meshH }, this.scene
        );
        mesh.position.set(edge.cx, sampleHeight(edge.cx, edge.cz) + 0.12, edge.cz);
        mesh.rotation.y = lot.facingAngle;
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.material = mat;
        this.addRoadMesh(mesh);
      }
    }
  }

  /**
   * Create crosswalk stripes across a street at an intersection node.
   * Stripes run parallel to the road (and sidewalk edge), spaced across
   * the road width — like real painted crosswalks.
   */
  private createCrosswalk(
    id: string,
    node: { x: number; z: number },
    seg: { waypoints: { x: number; z: number }[]; width: number; nodeIds: string[] },
    sampleHeight: (x: number, z: number) => number,
    color: Color3
  ): Mesh[] {
    const meshes: Mesh[] = [];

    // Find which waypoint index corresponds to this node
    let nodeIdx = -1;
    for (let i = 0; i < seg.waypoints.length; i++) {
      const wp = seg.waypoints[i];
      const dx = wp.x - node.x;
      const dz = wp.z - node.z;
      if (dx * dx + dz * dz < 1.0) { nodeIdx = i; break; }
    }
    if (nodeIdx < 0) return meshes;

    // Get street direction at this node (toward adjacent waypoint)
    const neighbors: { dx: number; dz: number }[] = [];
    if (nodeIdx > 0) {
      const prev = seg.waypoints[nodeIdx - 1];
      neighbors.push({ dx: prev.x - node.x, dz: prev.z - node.z });
    }
    if (nodeIdx < seg.waypoints.length - 1) {
      const next = seg.waypoints[nodeIdx + 1];
      neighbors.push({ dx: next.x - node.x, dz: next.z - node.z });
    }

    for (const dir of neighbors) {
      const dirLen = Math.sqrt(dir.dx * dir.dx + dir.dz * dir.dz);
      if (dirLen < 0.001) continue;

      // along = direction of the street, perp = across the street
      const alongX = dir.dx / dirLen;
      const alongZ = dir.dz / dirLen;
      const perpX = -alongZ;
      const perpZ = alongX;

      // Place crosswalk center just outside the intersection pad
      const offset = seg.width / 2 + 1.5;
      const cx = node.x + alongX * offset;
      const cz = node.z + alongZ * offset;

      // Stripes are spaced across the road (perp direction), each stripe
      // runs parallel to the road (along direction) with sidewalk-like width.
      // Dynamically compute count to cover the full road width.
      const stripeW = 0.35;         // Thin stripe (across-road thickness)
      const stripeGap = 0.35;       // Gap between stripes
      const stripeLen = 2.0;        // Length along road — matches sidewalk width
      const stripeCount = Math.max(4, Math.floor(seg.width / (stripeW + stripeGap)));
      const totalAcross = stripeCount * stripeW + (stripeCount - 1) * stripeGap;
      const startPerp = -totalAcross / 2;

      for (let s = 0; s < stripeCount; s++) {
        // Each stripe is offset across the road (perp direction)
        const perpOff = startPerp + s * (stripeW + stripeGap) + stripeW / 2;
        const sx = cx + perpX * perpOff;
        const sz = cz + perpZ * perpOff;
        const y = sampleHeight(sx, sz) + this.yOffset + 0.02;

        const halfLen = stripeLen / 2;  // Half-extent along road
        const halfW = stripeW / 2;      // Half-extent across road

        // Stripe corners: length along road (along), width across road (perp)
        const p1 = new Vector3(sx + alongX * halfLen + perpX * halfW, y, sz + alongZ * halfLen + perpZ * halfW);
        const p2 = new Vector3(sx - alongX * halfLen + perpX * halfW, y, sz - alongZ * halfLen + perpZ * halfW);
        const p3 = new Vector3(sx + alongX * halfLen - perpX * halfW, y, sz + alongZ * halfLen - perpZ * halfW);
        const p4 = new Vector3(sx - alongX * halfLen - perpX * halfW, y, sz - alongZ * halfLen - perpZ * halfW);

        try {
          const stripe = MeshBuilder.CreateRibbon(
            `${id}_${s}_${meshes.length}`,
            { pathArray: [[p1, p2], [p3, p4]], closeArray: false, closePath: false,
              sideOrientation: Mesh.DOUBLESIDE, updatable: false },
            this.scene
          );
          stripe.checkCollisions = false;
          stripe.isPickable = false;

          const mat = new StandardMaterial(`${id}_${s}_${meshes.length}_mat`, this.scene);
          mat.backFaceCulling = false;
          mat.diffuseColor = color;
          mat.emissiveColor = color.scale(0.2);
          mat.specularColor = new Color3(0.05, 0.05, 0.05);
          mat.zOffset = -2;
          stripe.material = mat;
          stripe.alwaysSelectAsActiveMesh = true;
          stripe.freezeWorldMatrix();
          meshes.push(stripe);
        } catch { /* skip */ }
      }
    }

    return meshes;
  }

  /**
   * Create a terrain-following ribbon from an ordered polyline of waypoints.
   */
  private createPolylineRoad(
    id: string,
    waypoints: { x: number; z: number }[],
    sampleHeight: (x: number, z: number) => number,
    width: number,
    colorOverride?: Color3,
    extraYOffset: number = 0
  ): Mesh | null {
    if (waypoints.length < 2) return null;

    const halfWidth = width / 2;
    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < waypoints.length; i++) {
      const curr = waypoints[i];
      // Determine local direction from neighboring waypoints
      let dx: number, dz: number;
      if (i === 0) {
        dx = waypoints[1].x - curr.x;
        dz = waypoints[1].z - curr.z;
      } else if (i === waypoints.length - 1) {
        dx = curr.x - waypoints[i - 1].x;
        dz = curr.z - waypoints[i - 1].z;
      } else {
        dx = waypoints[i + 1].x - waypoints[i - 1].x;
        dz = waypoints[i + 1].z - waypoints[i - 1].z;
      }

      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;

      const perpX = -dz / len;
      const perpZ = dx / len;

      const lx = curr.x + perpX * halfWidth;
      const lz = curr.z + perpZ * halfWidth;
      const rx = curr.x - perpX * halfWidth;
      const rz = curr.z - perpZ * halfWidth;

      // Sample center and both edges, use the max so road clears terrain bumps
      const waypointMaxY = Math.max(sampleHeight(curr.x, curr.z), sampleHeight(lx, lz), sampleHeight(rx, rz)) + this.yOffset + extraYOffset;
      leftPath.push(new Vector3(lx, waypointMaxY, lz));
      rightPath.push(new Vector3(rx, waypointMaxY, rz));

      // Subdivide long spans between waypoints
      if (i < waypoints.length - 1) {
        const next = waypoints[i + 1];
        const spanDx = next.x - curr.x;
        const spanDz = next.z - curr.z;
        const spanLen = Math.sqrt(spanDx * spanDx + spanDz * spanDz);
        const subdivisions = Math.floor(spanLen / this.sampleInterval);

        for (let s = 1; s < subdivisions; s++) {
          const t = s / subdivisions;
          const mx = curr.x + spanDx * t;
          const mz = curr.z + spanDz * t;
          const mlx = mx + perpX * halfWidth;
          const mlz = mz + perpZ * halfWidth;
          const mrx = mx - perpX * halfWidth;
          const mrz = mz - perpZ * halfWidth;

          const spanMaxY = Math.max(sampleHeight(mx, mz), sampleHeight(mlx, mlz), sampleHeight(mrx, mrz)) + this.yOffset + extraYOffset;
          leftPath.push(new Vector3(mlx, spanMaxY, mlz));
          rightPath.push(new Vector3(mrx, spanMaxY, mrz));
        }
      }
    }

    if (leftPath.length < 2) return null;

    try {
      const road = MeshBuilder.CreateRibbon(
        id,
        {
          pathArray: [leftPath, rightPath],
          closeArray: false,
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: false,
        },
        this.scene
      );

      road.checkCollisions = false;
      road.isPickable = false;
      // z-fighting handled via material zOffset below

      const mat = new StandardMaterial(`${id}_mat`, this.scene);
      mat.backFaceCulling = false;
      mat.zOffset = -2;
      mat.specularColor = new Color3(0.05, 0.05, 0.05); // Very low specular — matte surface

      if (colorOverride) {
        mat.diffuseColor = colorOverride;
        mat.emissiveColor = colorOverride.scale(0.15); // Subtle self-illumination for visibility
      } else if (this.roadTexture) {
        const tex = this.roadTexture.clone();
        if (tex) {
          const totalLen = this.polylineLength(waypoints);
          tex.uScale = Math.max(1, Math.round(totalLen / 8));
          tex.vScale = 1;
          mat.diffuseTexture = tex;
          mat.emissiveTexture = tex;
          // Dim the emissive so texture isn't blown out
          mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        }
      } else {
        mat.diffuseColor = this.roadColor;
        mat.emissiveColor = this.roadColor.scale(0.15);
      }

      road.material = mat;
      road.alwaysSelectAsActiveMesh = true;
      road.freezeWorldMatrix();
      return road;
    } catch (err) {
      console.warn(`[RoadGenerator] Failed to create polyline road ${id}:`, err);
      return null;
    }
  }

  /**
   * Create dashed yellow center line segments along a polyline.
   * Produces short ribbon dashes with gaps between them.
   */
  private createDashedCenterLine(
    id: string,
    waypoints: { x: number; z: number }[],
    sampleHeight: (x: number, z: number) => number,
    width: number,
    color: Color3,
    dashLen: number = 2.5,
    gapLen: number = 2.0
  ): Mesh[] {
    const meshes: Mesh[] = [];
    if (waypoints.length < 2) return meshes;

    // Flatten the polyline into evenly-spaced sample points
    const totalLen = this.polylineLength(waypoints);
    if (totalLen < dashLen) return meshes;

    // Walk the polyline, alternating dash / gap
    let dist = 0;
    let drawing = true; // start with a dash
    let dashPoints: { x: number; z: number }[] = [];
    const step = 0.5; // sample resolution

    for (let d = 0; d <= totalLen; d += step) {
      const t = d / totalLen;
      const pt = this.interpolatePolyline(waypoints, t);

      if (drawing) {
        dashPoints.push(pt);
        if (d - dist >= dashLen) {
          // Finish this dash — create a mini ribbon
          if (dashPoints.length >= 2) {
            const mesh = this.createCenterLineMesh(
              `${id}_d${meshes.length}`,
              dashPoints,
              sampleHeight,
              width,
              color
            );
            if (mesh) meshes.push(mesh);
          }
          dashPoints = [];
          dist = d;
          drawing = false;
        }
      } else {
        if (d - dist >= gapLen) {
          dist = d;
          drawing = true;
          dashPoints = [pt];
        }
      }
    }

    // Flush remaining dash
    if (drawing && dashPoints.length >= 2) {
      const mesh = this.createCenterLineMesh(
        `${id}_d${meshes.length}`,
        dashPoints,
        sampleHeight,
        width,
        color
      );
      if (mesh) meshes.push(mesh);
    }

    return meshes;
  }

  /** Create a single center-line dash ribbon. */
  private createCenterLineMesh(
    id: string,
    points: { x: number; z: number }[],
    sampleHeight: (x: number, z: number) => number,
    width: number,
    color: Color3
  ): Mesh | null {
    const halfW = width / 2;
    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      let dx: number, dz: number;
      if (i === 0) {
        dx = points[1].x - curr.x; dz = points[1].z - curr.z;
      } else if (i === points.length - 1) {
        dx = curr.x - points[i - 1].x; dz = curr.z - points[i - 1].z;
      } else {
        dx = points[i + 1].x - points[i - 1].x; dz = points[i + 1].z - points[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      const px = -dz / len, pz = dx / len;

      const y = sampleHeight(curr.x, curr.z) + this.yOffset + 0.02; // Slightly above road surface
      leftPath.push(new Vector3(curr.x + px * halfW, y, curr.z + pz * halfW));
      rightPath.push(new Vector3(curr.x - px * halfW, y, curr.z - pz * halfW));
    }

    if (leftPath.length < 2) return null;

    try {
      const mesh = MeshBuilder.CreateRibbon(id, {
        pathArray: [leftPath, rightPath],
        closeArray: false,
        closePath: false,
        sideOrientation: Mesh.DOUBLESIDE,
        updatable: false,
      }, this.scene);

      mesh.checkCollisions = false;
      mesh.isPickable = false;

      const mat = new StandardMaterial(`${id}_mat`, this.scene);
      mat.backFaceCulling = false;
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.3); // Slightly brighter so stripes are visible
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mat.zOffset = -2;
      mesh.material = mat;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.freezeWorldMatrix();
      return mesh;
    } catch {
      return null;
    }
  }

  /** Interpolate a point along a polyline at parameter t in [0,1]. */
  private interpolatePolyline(
    waypoints: { x: number; z: number }[],
    t: number
  ): { x: number; z: number } {
    if (waypoints.length < 2 || t <= 0) return waypoints[0];
    if (t >= 1) return waypoints[waypoints.length - 1];

    const totalLen = this.polylineLength(waypoints);
    const targetDist = t * totalLen;
    let accumulated = 0;

    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dz = waypoints[i].z - waypoints[i - 1].z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (accumulated + segLen >= targetDist) {
        const segT = segLen > 0 ? (targetDist - accumulated) / segLen : 0;
        return {
          x: waypoints[i - 1].x + dx * segT,
          z: waypoints[i - 1].z + dz * segT,
        };
      }
      accumulated += segLen;
    }
    return waypoints[waypoints.length - 1];
  }

  /**
   * Offset a polyline laterally by `offset` units (positive = left, negative = right).
   */
  private offsetPolyline(
    waypoints: { x: number; z: number }[],
    offset: number
  ): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const curr = waypoints[i];
      let dx: number, dz: number;
      if (i === 0) {
        dx = waypoints[1].x - curr.x;
        dz = waypoints[1].z - curr.z;
      } else if (i === waypoints.length - 1) {
        dx = curr.x - waypoints[i - 1].x;
        dz = curr.z - waypoints[i - 1].z;
      } else {
        dx = waypoints[i + 1].x - waypoints[i - 1].x;
        dz = waypoints[i + 1].z - waypoints[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) {
        result.push({ x: curr.x, z: curr.z });
        continue;
      }
      const perpX = -dz / len;
      const perpZ = dx / len;
      result.push({ x: curr.x + perpX * offset, z: curr.z + perpZ * offset });
    }
    return result;
  }

  /**
   * Place street name signs at intersections where 2+ named streets meet.
   */
  private placeStreetSigns(
    settlementId: string,
    network: StreetNetwork,
    sampleHeight: (x: number, z: number) => number
  ): void {
    const placedNames = new Set<string>();

    for (const node of network.nodes) {
      if (node.intersectionOf.length < 2) continue;

      // Pick first street at this intersection that hasn't had a sign yet
      const seg = network.segments.find(
        s => node.intersectionOf.includes(s.id) && !placedNames.has(s.name)
      );
      if (!seg) continue;
      placedNames.add(seg.name);

      // Compute corner offset using segment directions at this intersection
      const cornerOffset = this.computeCornerOffset(node, network);

      const signX = node.x + cornerOffset.x;
      const signZ = node.z + cornerOffset.z;
      const y = sampleHeight(signX, signZ) + this.yOffset;
      // Get the street direction so the sign can be oriented parallel to the street
      const segDir = this.segmentDirectionAtNode(seg as any, node);
      const signMesh = this.createStreetSign(
        `sign_${settlementId}_${node.id}`,
        seg.name,
        new Vector3(signX, y + 2.5, signZ),
        segDir
      );
      if (signMesh) this.addRoadMesh(signMesh);
    }
  }

  /**
   * Compute an offset from the intersection center to a corner position,
   * using the perpendiculars of the meeting street segments.
   */
  private computeCornerOffset(
    node: { x: number; z: number; intersectionOf: string[] },
    network: StreetNetwork
  ): { x: number; z: number } {
    const margin = 0.5; // extra clearance beyond road edge

    // Get up to 2 segments at this intersection
    const segs = network.segments.filter(s => node.intersectionOf.includes(s.id));
    if (segs.length < 2) {
      // Fallback: single segment, offset perpendicular to it
      const s = segs[0];
      const dir = this.segmentDirectionAtNode(s, node);
      const hw = (s.width || this.roadWidth) / 2 + margin;
      return { x: -dir.z * hw, z: dir.x * hw };
    }

    const s1 = segs[0];
    const s2 = segs[1];
    const d1 = this.segmentDirectionAtNode(s1, node);
    const d2 = this.segmentDirectionAtNode(s2, node);
    const hw1 = (s1.width || this.roadWidth) / 2 + margin;
    const hw2 = (s2.width || this.roadWidth) / 2 + margin;

    // Perpendiculars (rotated 90° clockwise): (dx,dz) → (dz, -dx)
    // We pick the corner where both perpendiculars point "outward"
    // by using a consistent rotation direction
    const perp1x = d1.z;
    const perp1z = -d1.x;
    const perp2x = d2.z;
    const perp2z = -d2.x;

    return {
      x: perp1x * hw1 + perp2x * hw2,
      z: perp1z * hw1 + perp2z * hw2
    };
  }

  /**
   * Get the normalized direction vector of a segment going away from a node.
   */
  private segmentDirectionAtNode(
    seg: { waypoints: { x: number; z: number }[]; nodeIds: string[] },
    node: { x: number; z: number }
  ): { x: number; z: number } {
    const wp = seg.waypoints;
    if (wp.length < 2) return { x: 1, z: 0 };

    // Determine which end of the segment is closest to the node
    const dFirst = (wp[0].x - node.x) ** 2 + (wp[0].z - node.z) ** 2;
    const dLast = (wp[wp.length - 1].x - node.x) ** 2 + (wp[wp.length - 1].z - node.z) ** 2;

    let dx: number, dz: number;
    if (dFirst <= dLast) {
      // Node is near the start — direction goes from start toward next point
      dx = wp[1].x - wp[0].x;
      dz = wp[1].z - wp[0].z;
    } else {
      // Node is near the end — direction goes from end toward previous point
      dx = wp[wp.length - 2].x - wp[wp.length - 1].x;
      dz = wp[wp.length - 2].z - wp[wp.length - 1].z;
    }

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return { x: 1, z: 0 };
    return { x: dx / len, z: dz / len };
  }

  /**
   * Create a simple street name sign (pole + text plane).
   */
  private createStreetSign(
    id: string,
    name: string,
    position: Vector3,
    streetDir?: { x: number; z: number }
  ): Mesh | null {
    try {
      // Pole
      const pole = MeshBuilder.CreateCylinder(
        `${id}_pole`,
        { height: 2.5, diameter: 0.1, tessellation: 6 },
        this.scene
      );
      pole.position = position.clone();
      pole.position.y -= 1.25;
      pole.isPickable = false;
      pole.checkCollisions = false;

      const poleMat = new StandardMaterial(`${id}_pole_mat`, this.scene);
      poleMat.disableLighting = true;
      poleMat.emissiveColor = new Color3(0.3, 0.3, 0.3);
      pole.material = poleMat;

      // Sign plane — double-sided, oriented parallel to the street
      const sign = MeshBuilder.CreatePlane(
        `${id}_face`,
        { width: 2.0, height: 0.5, sideOrientation: Mesh.DOUBLESIDE },
        this.scene
      );
      sign.isPickable = false;
      sign.checkCollisions = false;

      // Orient the sign parallel to the street direction (readable from both sides)
      if (streetDir) {
        sign.rotation.y = Math.atan2(streetDir.x, streetDir.z);
      }

      const tex = new DynamicTexture(`${id}_tex`, { width: 256, height: 64 }, this.scene, false);
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      ctx.fillStyle = '#2a5e2a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 128, 32);
      tex.update();

      const signMat = new StandardMaterial(`${id}_face_mat`, this.scene);
      signMat.disableLighting = true;
      signMat.emissiveTexture = tex;
      signMat.backFaceCulling = false;
      sign.material = signMat;

      // Parent sign to pole
      sign.parent = pole;
      sign.position = new Vector3(0, 1.25, 0);

      pole.alwaysSelectAsActiveMesh = true;

      return pole;
    } catch (err) {
      console.warn(`[RoadGenerator] Failed to create street sign ${id}:`, err);
      return null;
    }
  }

  /** Calculate total length of a polyline */
  private polylineLength(waypoints: { x: number; z: number }[]): number {
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dz = waypoints[i].z - waypoints[i - 1].z;
      total += Math.sqrt(dx * dx + dz * dz);
    }
    return total;
  }

  /**
   * Generate roads along a street network (from StreetAlignedPlacement).
   * Main streets get standard width; side streets are narrower.
   */
  public generateSettlementStreetNetwork(
    settlementId: string,
    streets: StreetSegment[],
    sampleHeight: (x: number, z: number) => number,
  ): void {
    for (const street of streets) {
      const segId = `road_street_${settlementId}_${street.id}`;
      const width = street.isMainStreet ? this.roadWidth : this.roadWidth * 0.6;
      const mesh = this.createRoadSegment(segId, street.from, street.to, sampleHeight, width);
      if (mesh) {
        this.addRoadMesh(mesh);
        this.storedSegments.push({
          ax: street.from.x, az: street.from.z,
          bx: street.to.x, bz: street.to.z,
          halfWidth: width / 2,
        });
      }
    }
  }

  // Width by street type (world units)
  private static readonly STREET_WIDTHS: Record<string, number> = {
    boulevard: 6,
    avenue: 5,
    main_road: 4,
    highway: 4,
    residential: 3,
    lane: 2,
    alley: 1.5,
  };

  // Colors by street type — softer, lower-contrast palette (used only when no texture)
  private static readonly STREET_COLORS: Record<string, Color3> = {
    boulevard: new Color3(0.38, 0.37, 0.35),   // Soft dark paved
    avenue: new Color3(0.40, 0.39, 0.37),       // Soft paved
    main_road: new Color3(0.38, 0.37, 0.35),   // Soft dark paved
    highway: new Color3(0.36, 0.36, 0.38),     // Soft asphalt
    residential: new Color3(0.42, 0.40, 0.37), // Soft packed earth
    lane: new Color3(0.44, 0.42, 0.39),        // Soft dirt lane
    alley: new Color3(0.46, 0.44, 0.41),       // Soft dirt alley
  };

  /**
   * Generate intra-settlement road meshes from a StreetNetworkIR graph.
   * Each edge becomes a terrain-following ribbon mesh with width/color based on street type.
   */
  public generateStreetNetworkRoads(
    network: StreetNetworkIR,
    sampleHeight: (x: number, z: number) => number
  ): Mesh[] {
    const meshes: Mesh[] = [];

    // Build node lookup for resolving edge endpoints
    const nodeMap = new Map<string, { x: number; z: number; elevation: number }>();
    for (const node of network.nodes) {
      nodeMap.set(node.id, node.position as any);
    }

    for (const edge of network.edges) {
      const fromNode = nodeMap.get(edge.fromNodeId);
      const toNode = nodeMap.get(edge.toNodeId);
      if (!fromNode || !toNode) continue;

      // Use waypoints if available, otherwise straight line between nodes
      const waypoints = edge.waypoints && edge.waypoints.length >= 2
        ? edge.waypoints
        : [
            { x: fromNode.x, y: 0, z: fromNode.z },
            { x: toNode.x, y: 0, z: toNode.z },
          ];

      const width = RoadGenerator.STREET_WIDTHS[edge.streetType] ?? 3;
      const color = RoadGenerator.STREET_COLORS[edge.streetType] ?? this.roadColor;

      const mesh = this.createStreetEdgeMesh(edge.id, waypoints, width, color, sampleHeight);
      if (mesh) {
        meshes.push(mesh);
        this.addRoadMesh(mesh);

        // Store waypoint pairs for point-on-road collision queries
        const halfW = width / 2;
        for (let wi = 0; wi < waypoints.length - 1; wi++) {
          const wa = waypoints[wi];
          const wb = waypoints[wi + 1];
          this.storedSegments.push({
            ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, halfWidth: halfW,
          });
        }
      }
    }

    // console.log(
    //   `[RoadGenerator] Generated ${meshes.length} street meshes from street network (${network.edges.length} edges)`
    // );
    return meshes;
  }

  /**
   * Create a ribbon mesh along a sequence of waypoints with the given width and color.
   */
  private createStreetEdgeMesh(
    id: string,
    waypoints: { x: number; y: number; z: number }[],
    width: number,
    color: Color3,
    sampleHeight: (x: number, z: number) => number
  ): Mesh | null {
    if (waypoints.length < 2) return null;

    const halfWidth = width / 2;
    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Compute tangent direction at this waypoint
      let dx: number, dz: number;
      if (i === 0) {
        dx = waypoints[1].x - wp.x;
        dz = waypoints[1].z - wp.z;
      } else if (i === waypoints.length - 1) {
        dx = wp.x - waypoints[i - 1].x;
        dz = wp.z - waypoints[i - 1].z;
      } else {
        dx = waypoints[i + 1].x - waypoints[i - 1].x;
        dz = waypoints[i + 1].z - waypoints[i - 1].z;
      }

      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;

      // Perpendicular in XZ plane
      const perpX = -dz / len;
      const perpZ = dx / len;

      const lx = wp.x + perpX * halfWidth;
      const lz = wp.z + perpZ * halfWidth;
      const rx = wp.x - perpX * halfWidth;
      const rz = wp.z - perpZ * halfWidth;

      const ly = sampleHeight(lx, lz) + this.yOffset;
      const ry = sampleHeight(rx, rz) + this.yOffset;

      leftPath.push(new Vector3(lx, ly, lz));
      rightPath.push(new Vector3(rx, ry, rz));
    }

    if (leftPath.length < 2) return null;

    try {
      const road = MeshBuilder.CreateRibbon(
        `street_${id}`,
        {
          pathArray: [leftPath, rightPath],
          closeArray: false,
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: false,
        },
        this.scene
      );

      road.checkCollisions = false;
      road.isPickable = false;

      const mat = new StandardMaterial(`street_${id}_mat`, this.scene);
      mat.backFaceCulling = false;
      mat.zOffset = -2;
      mat.specularColor = new Color3(0.05, 0.05, 0.05);

      if (this.roadTexture) {
        const tex = this.roadTexture.clone();
        if (tex) {
          // Estimate total length for texture scaling
          let totalLen = 0;
          for (let i = 1; i < waypoints.length; i++) {
            const dx = waypoints[i].x - waypoints[i - 1].x;
            const dz = waypoints[i].z - waypoints[i - 1].z;
            totalLen += Math.sqrt(dx * dx + dz * dz);
          }
          tex.uScale = Math.max(1, Math.round(totalLen / 8));
          tex.vScale = 1;
          mat.diffuseTexture = tex;
          mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        }
      } else {
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.15);
      }

      road.material = mat;
      road.alwaysSelectAsActiveMesh = true;
      road.freezeWorldMatrix();

      return road;
    } catch (err) {
      console.warn(`[RoadGenerator] Failed to create street mesh ${id}:`, err);
      return null;
    }
  }

  /**
   * Kruskal's MST algorithm with union-find
   */
  private computeMST(settlements: SettlementNode[]): Edge[] {
    const n = settlements.length;

    // Build all edges with distances
    const edges: Edge[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = settlements[i].position.x - settlements[j].position.x;
        const dz = settlements[i].position.z - settlements[j].position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        edges.push({ fromIdx: i, toIdx: j, distance });
      }
    }

    // Sort by distance
    edges.sort((a, b) => a.distance - b.distance);

    // Union-Find
    const parent = Array.from({ length: n }, (_, i) => i);
    const rank = new Array(n).fill(0);

    const find = (x: number): number => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };

    const union = (a: number, b: number): boolean => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra]++;
      }
      return true;
    };

    const mstEdges: Edge[] = [];
    for (const edge of edges) {
      if (union(edge.fromIdx, edge.toIdx)) {
        mstEdges.push(edge);
        if (mstEdges.length === n - 1) break;
      }
    }

    return mstEdges;
  }

  /**
   * Create a single road segment mesh as a terrain-following ribbon
   */
  private createRoadSegment(
    id: string,
    from: Vector3,
    to: Vector3,
    sampleHeight: (x: number, z: number) => number,
    widthOverride?: number
  ): Mesh | null {
    const width = widthOverride ?? this.roadWidth;
    const halfWidth = width / 2;

    // Calculate direction and perpendicular
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    if (length < 1) return null; // Too short

    // Unit direction and perpendicular vectors (in XZ plane)
    const dirX = dx / length;
    const dirZ = dz / length;
    const perpX = -dirZ; // Perpendicular in XZ
    const perpZ = dirX;

    // Sample points along the road at regular intervals
    const numSamples = Math.max(2, Math.ceil(length / this.sampleInterval));
    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const cx = from.x + dx * t;
      const cz = from.z + dz * t;

      // Left and right edge positions
      const lx = cx + perpX * halfWidth;
      const lz = cz + perpZ * halfWidth;
      const rx = cx - perpX * halfWidth;
      const rz = cz - perpZ * halfWidth;

      // Sample terrain height at center and both edges, use the max so the
      // road surface always clears any terrain bumps across the full width
      const centerY = sampleHeight(cx, cz);
      const leftY = sampleHeight(lx, lz);
      const rightY = sampleHeight(rx, rz);
      const maxY = Math.max(centerY, leftY, rightY) + this.yOffset;

      leftPath.push(new Vector3(lx, maxY, lz));
      rightPath.push(new Vector3(rx, maxY, rz));
    }

    try {
      const road = MeshBuilder.CreateRibbon(
        id,
        {
          pathArray: [leftPath, rightPath],
          closeArray: false,
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: false,
        },
        this.scene
      );

      road.checkCollisions = false;
      road.isPickable = false;
      // z-fighting handled via material zOffset below

      const mat = new StandardMaterial(`${id}_mat`, this.scene);
      mat.backFaceCulling = false;
      mat.zOffset = -2;
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      if (this.roadTexture) {
        const tex = this.roadTexture.clone();
        if (tex) {
          tex.uScale = Math.max(1, Math.round(length / 8));
          tex.vScale = 1;
          mat.diffuseTexture = tex;
          mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        }
      } else {
        mat.diffuseColor = this.roadColor;
        mat.emissiveColor = this.roadColor.scale(0.15);
      }
      road.material = mat;
      road.alwaysSelectAsActiveMesh = true;
      road.freezeWorldMatrix();

      return road;
    } catch (err) {
      console.warn(`[RoadGenerator] Failed to create road segment ${id}:`, err);
      return null;
    }
  }

  /**
   * Get all road meshes (for minimap or other systems)
   */
  public getRoadMeshes(): Mesh[] {
    return [...this.roadMeshes];
  }

  /**
   * Check whether a world-space point falls on or near any road/street surface.
   * Uses stored segment lines and a perpendicular distance test.
   * @param margin Extra clearance beyond the road edge (default 2 units for sidewalk)
   */
  public isPointOnRoad(x: number, z: number, margin: number = 2): boolean {
    for (const seg of this.storedSegments) {
      const dx = seg.bx - seg.ax;
      const dz = seg.bz - seg.az;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.001) continue;
      // Project point onto segment line, clamped to [0, 1]
      const t = Math.max(0, Math.min(1,
        ((x - seg.ax) * dx + (z - seg.az) * dz) / lenSq
      ));
      const px = seg.ax + t * dx;
      const pz = seg.az + t * dz;
      const dist = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
      if (dist < seg.halfWidth + margin) return true;
    }
    return false;
  }

  /**
   * Generate short perpendicular walkway paths from each building's front door
   * straight to the nearest sidewalk edge.
   */
  public generateBuildingWalkways(
    buildings: { position: Vector3; rotation: number; depth: number; width: number }[],
    network: StreetNetwork,
    sampleHeight: (x: number, z: number) => number
  ): void {
    const walkwayColor = new Color3(0.55, 0.54, 0.52); // Softened walkway
    const walkwayWidth = 1.2;
    const curbHeight = 0;

    // Pre-compute street segment lines for perpendicular projection
    const streetLines: { ax: number; az: number; bx: number; bz: number; width: number }[] = [];
    for (const seg of network.segments) {
      for (let i = 0; i < seg.waypoints.length - 1; i++) {
        streetLines.push({
          ax: seg.waypoints[i].x, az: seg.waypoints[i].z,
          bx: seg.waypoints[i + 1].x, bz: seg.waypoints[i + 1].z,
          width: seg.width,
        });
      }
    }

    for (let bi = 0; bi < buildings.length; bi++) {
      const b = buildings[bi];
      // Door at front face center
      const cos = Math.cos(b.rotation);
      const sin = Math.sin(b.rotation);
      const doorLocalZ = b.depth / 2 + 0.3;
      const doorX = b.position.x + sin * doorLocalZ;
      const doorZ = b.position.z + cos * doorLocalZ;

      // Find the nearest street segment by perpendicular projection of the door point
      let bestDistSq = Infinity;
      let bestFootX = 0, bestFootZ = 0;
      let bestStreetWidth = 12;

      for (const line of streetLines) {
        const segDx = line.bx - line.ax;
        const segDz = line.bz - line.az;
        const segLenSq = segDx * segDx + segDz * segDz;
        if (segLenSq < 0.01) continue;

        // Project door onto the segment line, clamped to [0,1]
        let t = ((doorX - line.ax) * segDx + (doorZ - line.az) * segDz) / segLenSq;
        t = Math.max(0, Math.min(1, t));

        const footX = line.ax + t * segDx;
        const footZ = line.az + t * segDz;
        const dx = doorX - footX;
        const dz = doorZ - footZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestFootX = footX;
          bestFootZ = footZ;
          bestStreetWidth = line.width;
        }
      }

      if (bestDistSq > 900) continue; // Too far (> 30 units)

      // The walkway goes from the door perpendicular to the sidewalk edge.
      // The sidewalk edge is at streetHalfWidth + sidewalkWidth from the centerline.
      // We draw from door to the sidewalk inner edge (streetHalfWidth from centerline).
      const dist = Math.sqrt(bestDistSq);
      const sidewalkEdgeDist = bestStreetWidth / 2 + 2.0; // outer edge of sidewalk
      if (dist < sidewalkEdgeDist + 0.5) continue; // Already at the sidewalk

      // Direction from street center toward door
      const toDoorX = doorX - bestFootX;
      const toDoorZ = doorZ - bestFootZ;
      const toDoorLen = Math.sqrt(toDoorX * toDoorX + toDoorZ * toDoorZ);
      if (toDoorLen < 0.01) continue;
      const udx = toDoorX / toDoorLen;
      const udz = toDoorZ / toDoorLen;

      // Walkway from sidewalk outer edge to the door
      const sidewalkX = bestFootX + udx * sidewalkEdgeDist;
      const sidewalkZ = bestFootZ + udz * sidewalkEdgeDist;

      const walkwayPts = [
        { x: doorX, z: doorZ },
        { x: sidewalkX, z: sidewalkZ },
      ];

      // Create a height sampler that ramps from the building's base Y at the
      // door to the normal terrain height at the sidewalk, so the walkway
      // meets the door threshold flush instead of floating above it.
      const walkwayLen = Math.sqrt(
        (sidewalkX - doorX) ** 2 + (sidewalkZ - doorZ) ** 2
      );
      const buildingBaseY = b.position.y - this.yOffset; // cancel the yOffset added later
      const walkwaySampleHeight = (x: number, z: number): number => {
        if (walkwayLen < 0.01) return sampleHeight(x, z);
        const dx = x - doorX;
        const dz = z - doorZ;
        // Project onto door→sidewalk direction to get 0..1 parameter
        const t = Math.max(0, Math.min(1,
          (dx * (sidewalkX - doorX) + dz * (sidewalkZ - doorZ)) / (walkwayLen * walkwayLen)
        ));
        const terrainY = sampleHeight(x, z);
        // t=0 at door (use building base), t=1 at sidewalk (use terrain)
        return buildingBaseY * (1 - t) + terrainY * t;
      };

      const mesh = this.createPolylineRoad(
        `walkway_${bi}`, walkwayPts, walkwaySampleHeight, walkwayWidth, walkwayColor, curbHeight
      );
      if (mesh) {
        this.addRoadMesh(mesh);
      }
    }
  }

  /** Get all street light PointLights for DayNightCycle management. */
  public getStreetLights(): PointLight[] {
    return this.streetLights;
  }

  /**
   * Place lamp posts at regular intervals along both sidewalks of each street segment.
   * Each lamp post consists of a pole, lamp globe mesh, and a PointLight.
   * Lights start disabled — DayNightCycle turns them on at night.
   */
  public placeLampPosts(
    settlementId: string,
    network: StreetNetwork,
    sampleHeight: (x: number, z: number) => number
  ): PointLight[] {
    const newLights: PointLight[] = [];
    const spacing = 25; // World units between lamp posts
    const poleHeight = 4.0;
    const poleDiameter = 0.15;
    const globeRadius = 0.3;
    const sidewalkWidth = 2.0;
    const lightRange = 18;
    const lightIntensity = 0.8;
    const warmColor = new Color3(1.0, 0.85, 0.55); // Warm sodium-vapor color

    let lampCount = 0;

    for (const seg of network.segments) {
      if (seg.waypoints.length < 2) continue;

      const totalLen = this.polylineLength(seg.waypoints);
      if (totalLen < spacing * 0.6) continue; // Skip very short segments

      const halfStreet = seg.width / 2;
      const lampOffset = halfStreet + sidewalkWidth * 0.5; // Center of sidewalk

      // Number of lamp posts along this segment (both sides)
      const count = Math.max(1, Math.floor(totalLen / spacing));

      for (let i = 0; i <= count; i++) {
        const t = count > 0 ? i / count : 0.5;
        // Skip very start/end to avoid clustering at intersections
        if (t < 0.08 || t > 0.92) continue;

        const center = this.interpolatePolyline(seg.waypoints, t);

        // Get local direction for perpendicular offset
        const tPrev = Math.max(0, t - 0.01);
        const tNext = Math.min(1, t + 0.01);
        const pPrev = this.interpolatePolyline(seg.waypoints, tPrev);
        const pNext = this.interpolatePolyline(seg.waypoints, tNext);
        const dx = pNext.x - pPrev.x;
        const dz = pNext.z - pPrev.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) continue;
        const perpX = -dz / len;
        const perpZ = dx / len;

        // Place on alternating sides: even index = left, odd = right
        const side = i % 2 === 0 ? 1 : -1;
        const lampX = center.x + perpX * lampOffset * side;
        const lampZ = center.z + perpZ * lampOffset * side;

        // Skip if the lamp center point is near any OTHER street segment's path —
        // that means it's at or near an intersection.
        const intersectionRadius = halfStreet + sidewalkWidth;
        const isAtIntersection = network.segments.some(other => {
          if (other.id === seg.id) return false;
          // Check distance from lamp center to each line segment of the other street
          for (let wi = 0; wi < other.waypoints.length - 1; wi++) {
            const ax = other.waypoints[wi].x, az = other.waypoints[wi].z;
            const bx = other.waypoints[wi + 1].x, bz = other.waypoints[wi + 1].z;
            // Point-to-line-segment distance
            const abx = bx - ax, abz = bz - az;
            const abLenSq = abx * abx + abz * abz;
            if (abLenSq < 0.001) continue;
            const apx = center.x - ax, apz = center.z - az;
            const proj = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
            const closestX = ax + proj * abx, closestZ = az + proj * abz;
            const distSq = (center.x - closestX) ** 2 + (center.z - closestZ) ** 2;
            if (distSq < intersectionRadius * intersectionRadius) return true;
          }
          return false;
        });
        if (isAtIntersection) continue;

        const baseY = sampleHeight(lampX, lampZ) + this.yOffset;

        const lampId = `lamp_${settlementId}_${seg.id}_${i}`;

        // Pole
        const pole = MeshBuilder.CreateCylinder(
          `${lampId}_pole`,
          { height: poleHeight, diameter: poleDiameter, tessellation: 6 },
          this.scene
        );
        pole.position = new Vector3(lampX, baseY + poleHeight / 2, lampZ);
        pole.isPickable = false;
        pole.checkCollisions = false;

        const poleMat = new StandardMaterial(`${lampId}_pole_mat`, this.scene);
        poleMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        poleMat.specularColor = new Color3(0.1, 0.1, 0.1);
        pole.material = poleMat;

        // Arm and globe extend INWARD toward the street (opposite of `side`)
        // so they never clip into buildings on the outer edge of the sidewalk.
        const inward = -side;

        // Lamp arm (small horizontal cylinder from pole top to globe)
        const arm = MeshBuilder.CreateCylinder(
          `${lampId}_arm`,
          { height: 0.6, diameter: 0.08, tessellation: 6 },
          this.scene
        );
        arm.rotation.z = Math.PI / 2; // Horizontal
        arm.position = new Vector3(lampX + perpX * 0.3 * inward, baseY + poleHeight - 0.1, lampZ + perpZ * 0.3 * inward);
        arm.isPickable = false;
        arm.checkCollisions = false;
        arm.material = poleMat;

        // Globe
        const globe = MeshBuilder.CreateSphere(
          `${lampId}_globe`,
          { diameter: globeRadius * 2, segments: 8 },
          this.scene
        );
        const globeX = lampX + perpX * 0.5 * inward;
        const globeZ = lampZ + perpZ * 0.5 * inward;
        globe.position = new Vector3(globeX, baseY + poleHeight - 0.15, globeZ);
        globe.isPickable = false;
        globe.checkCollisions = false;

        const globeMat = new StandardMaterial(`${lampId}_globe_mat`, this.scene);
        globeMat.diffuseColor = warmColor;
        globeMat.emissiveColor = warmColor.scale(0.3);
        globeMat.specularColor = Color3.Black();
        globeMat.alpha = 0.9;
        globe.material = globeMat;

        // PointLight — starts disabled, DayNightCycle will manage it
        const light = new PointLight(
          `${lampId}_light`,
          new Vector3(globeX, baseY + poleHeight - 0.3, globeZ),
          this.scene
        );
        light.diffuse = warmColor;
        light.specular = warmColor.scale(0.3);
        light.intensity = lightIntensity;
        light.range = lightRange;
        light.setEnabled(false); // Off by default — DayNightCycle turns on at night

        // Parent arm and globe to pole for cleanup
        arm.parent = pole;
        arm.position = new Vector3(perpX * 0.3 * inward, poleHeight / 2 - 0.1, perpZ * 0.3 * inward);
        globe.parent = pole;
        globe.position = new Vector3(perpX * 0.5 * inward, poleHeight / 2 - 0.15, perpZ * 0.5 * inward);

        pole.alwaysSelectAsActiveMesh = true;
        pole.freezeWorldMatrix();

        this.addRoadMesh(pole);
        this.streetLights.push(light);
        newLights.push(light);
        lampCount++;
      }
    }

    // console.log(`[RoadGenerator] Placed ${lampCount} lamp posts for settlement ${settlementId}`);
    return newLights;
  }

  /**
   * Dispose all road meshes
   */
  public dispose(): void {
    for (const mesh of this.roadMeshes) {
      mesh.dispose();
    }
    for (const light of this.streetLights) {
      light.dispose();
    }
    this.roadMeshes = [];
    this.streetLights = [];
    this.roadTexture = null;
  }
}
