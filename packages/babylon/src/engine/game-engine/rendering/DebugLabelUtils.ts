/**
 * DebugLabelUtils - Creates floating text labels on procedural fallback meshes
 * for visual debugging of asset loading. Labels only appear when debug mode
 * is toggled on via the Game Menu > System > Debug button.
 */

import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

let _debugLabelsEnabled = false;
const _trackedLabels: Mesh[] = [];

/** Toggle debug labels on/off. Shows/hides all existing labels. */
export function setDebugLabelsEnabled(enabled: boolean): void {
  _debugLabelsEnabled = enabled;
  for (const label of _trackedLabels) {
    if (!label.isDisposed()) {
      label.setEnabled(enabled);
    }
  }
}

export function isDebugLabelsEnabled(): boolean {
  return _debugLabelsEnabled;
}

/**
 * Create a floating billboard text label at the bottom exterior of a mesh.
 * The label uses a DynamicTexture on a plane with billboard mode
 * so it always faces the camera.
 *
 * Labels are created but hidden by default; they become visible when
 * debug mode is toggled on via setDebugLabelsEnabled(true).
 *
 * @param scene - BabylonJS scene
 * @param parentMesh - The mesh to attach the label to
 * @param text - Label text to display
 * @param _yOffset - Deprecated, ignored. Labels are now placed at the bottom of the mesh.
 * @returns The label plane mesh, or null on error
 */
export function createDebugLabel(
  scene: Scene,
  parentMesh: AbstractMesh,
  text: string,
  _yOffset?: number
): Mesh | null {
  // Calculate position at bottom exterior of mesh
  const bounds = parentMesh.getBoundingInfo();
  const minY = bounds ? bounds.boundingBox.minimumWorld.y - parentMesh.absolutePosition.y : 0;
  // Place label just below the bottom of the mesh, at eye-readable height
  const labelY = minY + 0.5;

  // Create dynamic texture for text rendering
  const textureWidth = 512;
  const textureHeight = 128;
  const texture = new DynamicTexture(
    `debug_label_tex_${parentMesh.name}`,
    { width: textureWidth, height: textureHeight },
    scene,
    false
  );

  // Draw text on texture using raw canvas context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = texture.getContext() as any as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, textureWidth, textureHeight);

  // Background with slight transparency
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const radius = 12;
  roundRect(ctx, 4, 4, textureWidth - 8, textureHeight - 8, radius);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, textureWidth - 8, textureHeight - 8, radius);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap if needed
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > textureWidth - 40) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 36;
  const startY = (textureHeight - lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, textureWidth / 2, startY + i * lineHeight);
  });

  texture.update();
  texture.hasAlpha = true;

  // Create billboard plane
  const planeWidth = 3;
  const planeHeight = planeWidth * (textureHeight / textureWidth);
  const plane = MeshBuilder.CreatePlane(
    `debug_label_${parentMesh.name}`,
    { width: planeWidth, height: planeHeight },
    scene
  );

  const mat = new StandardMaterial(`debug_label_mat_${parentMesh.name}`, scene);
  mat.diffuseTexture = texture;
  mat.emissiveTexture = texture;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.useAlphaFromDiffuseTexture = true;
  plane.material = mat;

  // Position at the bottom exterior of the parent mesh
  plane.position = new Vector3(0, labelY, 0);
  plane.parent = parentMesh;

  // Billboard mode — always face camera
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

  plane.isPickable = false;
  plane.checkCollisions = false;

  // Start hidden; shown when debug mode is toggled on
  plane.setEnabled(_debugLabelsEnabled);
  _trackedLabels.push(plane);

  return plane;
}

// ─── Debug Hover Tooltip ───────────────────────────────────────────────────

let _hoverTooltipDiv: HTMLDivElement | null = null;
let _hoveredMesh: AbstractMesh | null = null;

/** Create the HTML tooltip element used for debug hover labels. */
export function createDebugHoverTooltip(container: HTMLElement): void {
  if (_hoverTooltipDiv) return;
  const div = document.createElement('div');
  div.style.cssText =
    'position:absolute;pointer-events:none;display:none;z-index:1000;' +
    'background:rgba(0,0,0,0.85);color:#fff;font:bold 13px monospace;' +
    'padding:6px 10px;border-radius:6px;border:1px solid #ffcc00;' +
    'white-space:pre-line;max-width:320px;';
  container.appendChild(div);
  _hoverTooltipDiv = div;
}

/** Show the hover tooltip at cursor position with the given text. */
export function showDebugHoverTooltip(x: number, y: number, text: string): void {
  if (!_hoverTooltipDiv) return;
  _hoverTooltipDiv.textContent = text;
  _hoverTooltipDiv.style.display = 'block';
  _hoverTooltipDiv.style.left = `${x + 16}px`;
  _hoverTooltipDiv.style.top = `${y + 16}px`;
}

/** Hide the hover tooltip. */
export function hideDebugHoverTooltip(): void {
  if (_hoverTooltipDiv) _hoverTooltipDiv.style.display = 'none';
}

/** Remove the hover tooltip element entirely. */
export function disposeDebugHoverTooltip(): void {
  if (_hoverTooltipDiv) {
    _hoverTooltipDiv.remove();
    _hoverTooltipDiv = null;
  }
  clearDebugHighlight();
}

/** Apply a grey overlay tint to a mesh (and children) to indicate hover.
 *  Uses per-mesh renderOverlay so shared materials are not affected. */
export function applyDebugHighlight(mesh: AbstractMesh): void {
  if (mesh === _hoveredMesh) return;
  clearDebugHighlight();
  _hoveredMesh = mesh;
  const meshes = [mesh, ...mesh.getChildMeshes()];
  for (const m of meshes) {
    m.renderOverlay = true;
    m.overlayColor = new Color3(0.5, 0.5, 0.5);
    m.overlayAlpha = 0.35;
  }
}

/** Remove the overlay from the currently highlighted mesh. */
export function clearDebugHighlight(): void {
  if (!_hoveredMesh) return;
  const meshes = [_hoveredMesh, ..._hoveredMesh.getChildMeshes()];
  for (const m of meshes) {
    m.renderOverlay = false;
  }
  _hoveredMesh = null;
}

// Mesh name patterns for procedural objects (no metadata)
const _naturePatterns: [RegExp, string | null][] = [
  [/^tree_/i, 'Tree'],
  [/^rock_/i, 'Rock'],
  [/^bush_/i, 'Bush'],
  [/^shrub_/i, 'Shrub'],
  [/^flower_template/i, 'Flowers'],
  [/^grass_template/i, 'Grass'],
  [/^lake_/i, 'Lake'],
  [/^geo_/i, 'Geological Feature'],
  [/^tree_collider/i, 'Tree (collider)'],
  [/^rock_collider/i, 'Rock (collider)'],
  [/^geo_collider/i, 'Geo (collider)'],
  [/^lake_collider/i, 'Lake (collider)'],
  [/^settlement_marker_/i, 'Settlement Marker'],
  [/^settlement_sign/i, 'Settlement Sign'],
  [/^wilderness_/i, 'Wilderness Prop'],
  [/^street_prop_/i, 'Street Furniture'],
  [/^quest_location_/i, 'Quest Location'],
  [/^prop_/i, 'World Prop'],
  [/^road_/i, 'Road'],
  [/^river_/i, 'River'],
  [/^npc_/i, 'NPC'],
  [/^building_/i, 'Building'],
  [/^debug_label_/i, null], // skip debug labels
  [/^chimney_/i, 'Chimney'],
  [/^door_/i, 'Door'],
  [/^roof_/i, 'Roof'],
  [/^window_/i, 'Window'],
  [/^ground$/i, 'Ground / Terrain'],
  [/^sky/i, 'Sky Dome'],
];

/** Derive a friendly type name from the mesh name. */
function classifyMeshName(name: string): string | null {
  for (const [pattern, label] of _naturePatterns) {
    if (pattern.test(name)) return label;
  }
  return null;
}

/** Build a human-readable label from mesh metadata and/or mesh name. */
export function buildDebugLabel(mesh: AbstractMesh): string | null {
  const md = mesh.metadata;
  const parts: string[] = [];

  // Metadata-based identification
  if (md) {
    // Custom debug label set by procedural generators
    if (md.debugLabel) {
      parts.push(md.debugLabel);
    } else if (md.npcId) {
      parts.push(`NPC: ${md.npcId}`);
      if (md.npcRole) parts.push(`Role: ${md.npcRole}`);
    } else if (md.businessId || md.residenceId) {
      if (md.businessName) parts.push(md.businessName);
      if (md.businessType) parts.push(`Type: ${md.businessType}`);
      if (md.residenceId) parts.push(`Residence: ${md.residenceId}`);
      if (md.buildingType) parts.push(`Building: ${md.buildingType}`);
    } else if (md.objectRole) {
      parts.push(`Object: ${md.objectRole}`);
      parts.push(`isPickable: ${mesh.isPickable}`);
    } else if (md.interiorExit) {
      parts.push('Exit Door');
    } else if (md.settlementId) {
      parts.push(`Settlement: ${md.settlementId}`);
    }
  }

  // Always include the mesh name for context
  const name = mesh.name || '';
  if (!name || name.startsWith('__')) return parts.length > 0 ? parts.join('\n') : null;

  // Classify the mesh name into a friendly type
  const classification = classifyMeshName(name);
  if (classification === null && parts.length === 0) {
    // null classification means skip (e.g. debug labels)
    return null;
  }

  // Add mesh name (cleaned up) if not redundant with metadata
  if (parts.length === 0) {
    if (classification) parts.push(classification);
    parts.push(`Mesh: ${name}`);
  } else {
    // Append mesh name for extra context
    parts.push(`Mesh: ${name}`);
  }

  return parts.join('\n');
}

/**
 * Helper to draw a rounded rectangle on a canvas context
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
