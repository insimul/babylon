/**
 * Exploration Discovery System
 *
 * Manages hidden/discoverable locations in the exterior world. When the player
 * enters a previously-undiscovered location's radius (15 m), a discovery
 * notification fires, the location is revealed on the minimap, and investigation
 * points become interactive. Emits `location_discovered` and
 * `investigation_completed` events for quest tracking and awards exploration XP.
 */

import {
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ActionManager,
  ExecuteCodeAction,
  GlowLayer,
} from '@babylonjs/core';
import { GameEventBus } from '../logic/GameEventBus';
import { NotificationStore } from '../logic/NotificationStore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HiddenLocationDef {
  id: string;
  nameFr: string;
  nameEn: string;
  description: string;
  /** World-space position (y is ignored; ground-projected at spawn). */
  position: { x: number; z: number };
  /** Rarity affects XP reward. */
  rarity: 'common' | 'uncommon' | 'rare';
  /** Whether this location is a writer's secret spot (main quest clue). */
  isWriterSecret: boolean;
  /** If set, location only appears when this chapter is active or completed. */
  gateChapterId?: string;
  investigationPoints: InvestigationPointDef[];
}

export interface InvestigationPointDef {
  id: string;
  /** Offset from the parent location position. */
  offset: { x: number; z: number };
  contentType: 'lore' | 'vocabulary' | 'clue';
  /** French text shown to the player. */
  contentFr: string;
  /** English translation / explanation. */
  contentEn: string;
}

export interface DiscoveredLocation {
  id: string;
  nameFr: string;
  nameEn: string;
  discoveredAt: number;
  investigated: Set<string>;
}

export interface DiscoveryProgress {
  discovered: number;
  total: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DISCOVERY_RADIUS = 15;
const XP_BY_RARITY: Record<string, number> = { common: 10, uncommon: 15, rare: 25 };

// ── Default hidden locations ─────────────────────────────────────────────────

export function getDefaultHiddenLocations(terrainSize: number): HiddenLocationDef[] {
  const half = terrainSize / 2;
  // Spread locations across the exterior world, avoiding the centre (settlement)
  return [
    {
      id: 'hidden_clearing',
      nameFr: 'La Clairière Cachée',
      nameEn: 'The Hidden Clearing',
      description: 'A peaceful clearing hidden among dense trees.',
      position: { x: -half * 0.6, z: half * 0.5 },
      rarity: 'common',
      isWriterSecret: false,
      investigationPoints: [
        { id: 'clearing_wildflowers', offset: { x: 2, z: 1 }, contentType: 'vocabulary', contentFr: 'les fleurs sauvages — wildflowers', contentEn: 'Wildflowers blanket the clearing floor.' },
        { id: 'clearing_stump', offset: { x: -1, z: 3 }, contentType: 'lore', contentFr: 'Un vieux tronc gravé de symboles mystérieux.', contentEn: 'An old stump carved with mysterious symbols.' },
      ],
    },
    {
      id: 'abandoned_cabin',
      nameFr: 'La Cabane Abandonnée',
      nameEn: 'The Abandoned Cabin',
      description: 'A weathered cabin reclaimed by nature.',
      position: { x: half * 0.7, z: half * 0.3 },
      rarity: 'uncommon',
      isWriterSecret: true,
      gateChapterId: 'ch4_hidden_messages',
      investigationPoints: [
        { id: 'cabin_desk', offset: { x: 1, z: 0 }, contentType: 'clue', contentFr: 'Un journal intime ouvert... "Je dois partir avant qu\'ils ne me trouvent."', contentEn: 'An open diary... "I must leave before they find me."' },
        { id: 'cabin_bookshelf', offset: { x: -1, z: 1 }, contentType: 'vocabulary', contentFr: 'la bibliothèque — bookshelf', contentEn: 'A dusty bookshelf with volumes in French.' },
        { id: 'cabin_map', offset: { x: 0, z: -1 }, contentType: 'clue', contentFr: 'Une carte avec trois endroits marqués d\'une croix rouge.', contentEn: 'A map with three locations marked with a red cross.' },
      ],
    },
    {
      id: 'old_well',
      nameFr: 'Le Vieux Puits',
      nameEn: 'The Old Well',
      description: 'A crumbling stone well from a bygone era.',
      position: { x: -half * 0.4, z: -half * 0.6 },
      rarity: 'common',
      isWriterSecret: false,
      investigationPoints: [
        { id: 'well_inscription', offset: { x: 0, z: 1 }, contentType: 'lore', contentFr: 'Une inscription usée : "L\'eau de la vérité coule profondément."', contentEn: 'A worn inscription: "The water of truth runs deep."' },
        { id: 'well_bucket', offset: { x: 1, z: 0 }, contentType: 'vocabulary', contentFr: 'le seau — bucket', contentEn: 'An old wooden bucket hanging by a frayed rope.' },
      ],
    },
    {
      id: 'cave_entrance',
      nameFr: 'L\'Entrée de la Grotte',
      nameEn: 'The Cave Entrance',
      description: 'A dark opening in the hillside, exhaling cool air.',
      position: { x: half * 0.5, z: -half * 0.7 },
      rarity: 'rare',
      isWriterSecret: true,
      gateChapterId: 'ch5_the_truth_emerges',
      investigationPoints: [
        { id: 'cave_markings', offset: { x: 1, z: 1 }, contentType: 'lore', contentFr: 'Des marques de griffes anciennes sur les parois rocheuses.', contentEn: 'Ancient claw marks on the rock walls.' },
        { id: 'cave_notebook', offset: { x: -1, z: 0 }, contentType: 'clue', contentFr: 'Un carnet trempé. La dernière entrée : "La vérité est enterrée ici."', contentEn: 'A soggy notebook. The last entry: "The truth is buried here."' },
        { id: 'cave_crystals', offset: { x: 0, z: -2 }, contentType: 'vocabulary', contentFr: 'les cristaux — crystals', contentEn: 'Glittering crystals embedded in the cave wall.' },
      ],
    },
    {
      id: 'ancient_tree',
      nameFr: 'L\'Arbre Ancien',
      nameEn: 'The Ancient Tree',
      description: 'A massive, gnarled tree that has stood for centuries.',
      position: { x: -half * 0.7, z: -half * 0.2 },
      rarity: 'uncommon',
      isWriterSecret: false,
      investigationPoints: [
        { id: 'tree_carving', offset: { x: 2, z: 0 }, contentType: 'lore', contentFr: 'Des initiales gravées dans l\'écorce : "M.D. + L.R."', contentEn: 'Initials carved into the bark: "M.D. + L.R."' },
        { id: 'tree_hollow', offset: { x: 0, z: 2 }, contentType: 'vocabulary', contentFr: 'le creux — hollow', contentEn: 'A hollow in the trunk, home to small creatures.' },
      ],
    },
    {
      id: 'secret_garden',
      nameFr: 'Le Jardin Secret',
      nameEn: 'The Secret Garden',
      description: 'An overgrown garden surrounded by crumbling walls.',
      position: { x: half * 0.3, z: half * 0.7 },
      rarity: 'rare',
      isWriterSecret: true,
      gateChapterId: 'ch6_the_final_chapter',
      investigationPoints: [
        { id: 'garden_fountain', offset: { x: 0, z: 1 }, contentType: 'vocabulary', contentFr: 'la fontaine — fountain', contentEn: 'A moss-covered fountain, still trickling water.' },
        { id: 'garden_bench', offset: { x: -2, z: 0 }, contentType: 'clue', contentFr: 'Un message gravé sous le banc : "Cherchez là où les mots se taisent."', contentEn: 'A message carved under the bench: "Look where words fall silent."' },
        { id: 'garden_roses', offset: { x: 1, z: -1 }, contentType: 'lore', contentFr: 'Des roses anciennes qui fleurissent malgré l\'abandon.', contentEn: 'Ancient roses blooming despite neglect.' },
      ],
    },
  ];
}

// ── Exploration quests ───────────────────────────────────────────────────────

export interface ExplorationQuest {
  id: string;
  title: string;
  description: string;
  objectives: ExplorationQuestObjective[];
}

export interface ExplorationQuestObjective {
  id: string;
  type: 'discover_locations' | 'investigate_location' | 'find_writer_spot';
  description: string;
  /** For discover_locations: number required. */
  requiredCount?: number;
  /** For investigate_location / find_writer_spot: target location id. */
  targetLocationId?: string;
}

export function getExplorationQuests(): ExplorationQuest[] {
  return [
    {
      id: 'quest_discover_3',
      title: 'Discover 3 hidden locations',
      description: 'Explore the wilderness and discover three hidden locations.',
      objectives: [
        { id: 'obj_discover_3', type: 'discover_locations', description: 'Discover 3 hidden locations', requiredCount: 3 },
      ],
    },
    {
      id: 'quest_investigate_cabin',
      title: 'Investigate the abandoned cabin',
      description: 'Search the abandoned cabin for clues about the missing writer.',
      objectives: [
        { id: 'obj_find_cabin', type: 'discover_locations', description: 'Find the abandoned cabin', requiredCount: 1 },
        { id: 'obj_investigate_cabin', type: 'investigate_location', description: 'Investigate all points in the cabin', targetLocationId: 'abandoned_cabin' },
      ],
    },
    {
      id: 'quest_writer_secrets',
      title: "Find the writer's secret spots",
      description: "Locate the missing writer's hidden locations that contain clues about their disappearance.",
      objectives: [
        { id: 'obj_find_writer_1', type: 'find_writer_spot', description: 'Find a writer\'s secret location', targetLocationId: 'abandoned_cabin' },
        { id: 'obj_find_writer_2', type: 'find_writer_spot', description: 'Find another writer\'s secret location', targetLocationId: 'cave_entrance' },
        { id: 'obj_find_writer_3', type: 'find_writer_spot', description: 'Find the last writer\'s secret location', targetLocationId: 'secret_garden' },
      ],
    },
  ];
}

// ── System ───────────────────────────────────────────────────────────────────

export class ExplorationDiscoverySystem {
  private scene: Scene;
  private eventBus: GameEventBus;
  private locations: HiddenLocationDef[];
  private discovered: Map<string, DiscoveredLocation> = new Map();
  private locationMeshes: Map<string, Mesh> = new Map();
  private investigationMeshes: Map<string, Mesh> = new Map();
  private glowLayer: GlowLayer | null = null;
  private projectToGround: (x: number, z: number) => Vector3;
  private disposed = false;
  /** Chapters the player has unlocked — gated locations only appear when their chapter is here. */
  private activeChapterIds: Set<string> = new Set();

  constructor(
    scene: Scene,
    eventBus: GameEventBus,
    locations: HiddenLocationDef[],
    projectToGround: (x: number, z: number) => Vector3,
  ) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.locations = locations;
    this.projectToGround = projectToGround;

    this.glowLayer = new GlowLayer('explorationGlow', scene, { blurKernelSize: 32 });
    this.glowLayer.intensity = 0.6;

    this.spawnLocationMarkers();
  }

  /** Update which chapters are active/completed — gated locations become visible. */
  setActiveChapters(chapterIds: string[]): void {
    this.activeChapterIds = new Set(chapterIds);
    this.updateLocationGating();
  }

  private updateLocationGating(): void {
    for (const loc of this.locations) {
      if (!loc.gateChapterId) continue;
      const mesh = this.locationMeshes.get(loc.id);
      if (!mesh) continue;
      const visible = this.activeChapterIds.has(loc.gateChapterId);
      mesh.setEnabled(visible);
      // Also toggle investigation point meshes
      for (const ip of loc.investigationPoints) {
        const ipMesh = this.investigationMeshes.get(ip.id);
        if (ipMesh) ipMesh.setEnabled(visible && this.discovered.has(loc.id));
      }
    }
  }

  // ── Spawning ─────────────────────────────────────────────────────────────

  private spawnLocationMarkers(): void {
    for (const loc of this.locations) {
      const groundPos = this.projectToGround(loc.position.x, loc.position.z);

      // Translucent pillar of light visible from a distance
      const pillar = MeshBuilder.CreateCylinder(`discovery_${loc.id}`, {
        height: 8,
        diameterTop: 0.3,
        diameterBottom: 1.5,
        tessellation: 12,
      }, this.scene);
      pillar.position = new Vector3(groundPos.x, groundPos.y + 4, groundPos.z);
      const mat = new StandardMaterial(`mat_discovery_${loc.id}`, this.scene);
      mat.diffuseColor = loc.rarity === 'rare' ? new Color3(0.9, 0.7, 0.2) :
                          loc.rarity === 'uncommon' ? new Color3(0.3, 0.7, 0.9) :
                          new Color3(0.4, 0.9, 0.4);
      mat.alpha = 0.35;
      mat.emissiveColor = mat.diffuseColor.scale(0.5);
      pillar.material = mat;
      pillar.isPickable = false;

      if (this.glowLayer) {
        this.glowLayer.addIncludedOnlyMesh(pillar);
      }

      this.locationMeshes.set(loc.id, pillar);

      // Hide gated locations until their chapter is active
      if (loc.gateChapterId && !this.activeChapterIds.has(loc.gateChapterId)) {
        pillar.setEnabled(false);
      }
    }
  }

  private spawnInvestigationPoints(loc: HiddenLocationDef): void {
    const basePos = this.projectToGround(loc.position.x, loc.position.z);

    for (const ip of loc.investigationPoints) {
      const pos = this.projectToGround(
        basePos.x + ip.offset.x,
        basePos.z + ip.offset.z,
      );

      const orb = MeshBuilder.CreateSphere(`investigation_${ip.id}`, {
        diameter: 0.6,
        segments: 8,
      }, this.scene);
      orb.position = new Vector3(pos.x, pos.y + 0.8, pos.z);
      const mat = new StandardMaterial(`mat_inv_${ip.id}`, this.scene);
      mat.emissiveColor = ip.contentType === 'clue' ? new Color3(1, 0.3, 0.3) :
                          ip.contentType === 'vocabulary' ? new Color3(0.3, 0.8, 1) :
                          new Color3(1, 0.9, 0.4);
      mat.alpha = 0.8;
      orb.material = mat;

      if (this.glowLayer) {
        this.glowLayer.addIncludedOnlyMesh(orb);
      }

      // Click interaction
      orb.actionManager = new ActionManager(this.scene);
      orb.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.investigatePoint(loc, ip);
        }),
      );

      this.investigationMeshes.set(ip.id, orb);
    }
  }

  // ── Discovery check (called from update loop) ────────────────────────────

  checkPlayerProximity(playerPosition: Vector3): void {
    if (this.disposed) return;

    for (const loc of this.locations) {
      if (this.discovered.has(loc.id)) continue;
      // Skip gated locations whose chapter hasn't been reached
      if (loc.gateChapterId && !this.activeChapterIds.has(loc.gateChapterId)) continue;

      const groundPos = this.projectToGround(loc.position.x, loc.position.z);
      const dx = playerPosition.x - groundPos.x;
      const dz = playerPosition.z - groundPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq <= DISCOVERY_RADIUS * DISCOVERY_RADIUS) {
        this.discoverLocation(loc);
      }
    }
  }

  private discoverLocation(loc: HiddenLocationDef): void {
    if (this.discovered.has(loc.id)) return;

    this.discovered.set(loc.id, {
      id: loc.id,
      nameFr: loc.nameFr,
      nameEn: loc.nameEn,
      discoveredAt: Date.now(),
      investigated: new Set(),
    });

    // Remove the pillar beacon
    const pillar = this.locationMeshes.get(loc.id);
    if (pillar) {
      pillar.dispose();
      this.locationMeshes.delete(loc.id);
    }

    // Spawn investigation points
    this.spawnInvestigationPoints(loc);

    // Notification
    NotificationStore.push({
      title: `New location discovered: ${loc.nameFr}`,
      description: `(${loc.nameEn}) — ${loc.description}`,
      icon: '🗺️',
      color: loc.rarity === 'rare' ? '#FFD700' : loc.rarity === 'uncommon' ? '#4FC3F7' : '#81C784',
      category: 'system',
    });

    // Emit events
    this.eventBus.emit({
      type: 'location_discovered',
      locationId: loc.id,
      locationName: loc.nameFr,
      isWriterSecret: loc.isWriterSecret,
    });

    // Award XP
    const xp = XP_BY_RARITY[loc.rarity] ?? 10;
    this.eventBus.emit({
      type: 'xp_gained',
      amount: xp,
      reason: `Discovered ${loc.nameFr}`,
      newTotal: 0, // actual total tracked by gamification tracker
      level: 0,
    });
  }

  private investigatePoint(loc: HiddenLocationDef, ip: InvestigationPointDef): void {
    const disc = this.discovered.get(loc.id);
    if (!disc || disc.investigated.has(ip.id)) return;

    disc.investigated.add(ip.id);

    // Remove the orb
    const orb = this.investigationMeshes.get(ip.id);
    if (orb) {
      orb.dispose();
      this.investigationMeshes.delete(ip.id);
    }

    // Notification with content
    NotificationStore.push({
      title: ip.contentType === 'clue' ? 'Clue found!' :
             ip.contentType === 'vocabulary' ? 'New vocabulary!' : 'Lore discovered!',
      description: `${ip.contentFr}\n${ip.contentEn}`,
      icon: ip.contentType === 'clue' ? '🔍' : ip.contentType === 'vocabulary' ? '📖' : '📜',
      color: ip.contentType === 'clue' ? '#EF5350' : ip.contentType === 'vocabulary' ? '#29B6F6' : '#FDD835',
      category: 'item',
    });

    // Emit investigation event
    this.eventBus.emit({
      type: 'investigation_completed',
      locationId: loc.id,
      locationName: loc.nameFr,
      investigationPointId: ip.id,
      contentType: ip.contentType,
      content: ip.contentFr,
    });

    // Small XP for investigating
    this.eventBus.emit({
      type: 'xp_gained',
      amount: 5,
      reason: `Investigated point at ${loc.nameFr}`,
      newTotal: 0,
      level: 0,
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getProgress(): DiscoveryProgress {
    return { discovered: this.discovered.size, total: this.locations.length };
  }

  getDiscoveredLocations(): DiscoveredLocation[] {
    return Array.from(this.discovered.values());
  }

  isDiscovered(locationId: string): boolean {
    return this.discovered.has(locationId);
  }

  getLocationDefs(): HiddenLocationDef[] {
    return this.locations;
  }

  /** Returns minimap marker data for discovered locations. */
  getMinimapMarkers(): Array<{ id: string; position: Vector3; label: string; color: string }> {
    const markers: Array<{ id: string; position: Vector3; label: string; color: string }> = [];
    for (const loc of this.locations) {
      if (!this.discovered.has(loc.id)) continue;
      const groundPos = this.projectToGround(loc.position.x, loc.position.z);
      const def = this.locations.find((l) => l.id === loc.id);
      const color = def?.rarity === 'rare' ? '#FFD700' : def?.rarity === 'uncommon' ? '#4FC3F7' : '#81C784';
      markers.push({
        id: `discovery_${loc.id}`,
        position: new Vector3(groundPos.x, groundPos.y, groundPos.z),
        label: `${loc.nameFr} (${loc.nameEn})`,
        color,
      });
    }
    return markers;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.disposed = true;
    this.locationMeshes.forEach((m) => m.dispose());
    this.locationMeshes.clear();
    this.investigationMeshes.forEach((m) => m.dispose());
    this.investigationMeshes.clear();
    this.glowLayer?.dispose();
    this.glowLayer = null;
  }
}
