/**
 * Quest World Object Linker
 *
 * Connects active quests with existing world objects (buildings, locations)
 * by adding quest-related labels and interactivity. When a quest references
 * a building or location, this manager highlights it with a floating quest
 * label and makes it clickable to show quest details.
 */

import {
  AbstractMesh,
  ActionManager,
  Animation,
  Color3,
  DynamicTexture,
  ExecuteCodeAction,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

export interface QuestLinkInfo {
  questId: string;
  questTitle: string;
  objectiveDescription: string;
  objectiveType: string;
}

interface LinkedObject {
  buildingId: string;
  mesh: AbstractMesh;
  labelMesh: Mesh;
  highlightMaterial: StandardMaterial | null;
  originalMaterials: Map<AbstractMesh, any>;
  quests: QuestLinkInfo[];
}

export interface WorldObjectEntry {
  position: Vector3;
  metadata: any;
  mesh: Mesh;
}

export interface QuestData {
  id: string;
  title: string;
  status: string;
  locationId?: string;
  locationName?: string;
  objectives?: Array<{
    type: string;
    description: string;
    completed: boolean;
    locationName?: string;
    npcId?: string;
    npcName?: string;
    itemName?: string;
  }>;
  completionCriteria?: Record<string, any>;
  assignedByCharacterId?: string;
}

export class QuestWorldObjectLinker {
  private scene: Scene;
  private linkedObjects: Map<string, LinkedObject> = new Map();
  private onQuestObjectClicked: ((info: QuestLinkInfo) => void) | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Update links between active quests and world objects.
   * Call this when quests change or after world generation.
   */
  public updateLinks(
    quests: QuestData[],
    buildingData: Map<string, WorldObjectEntry>,
    npcBuildingMap?: Map<string, string> // npcId -> buildingId
  ): void {
    const activeQuests = quests.filter(q => q.status === 'active');

    // Collect which buildings are referenced by which quests
    const buildingQuests = new Map<string, QuestLinkInfo[]>();

    for (const quest of activeQuests) {
      // Match by locationId
      if (quest.locationId && buildingData.has(quest.locationId)) {
        this.addToBuildingQuests(buildingQuests, quest.locationId, {
          questId: quest.id,
          questTitle: quest.title,
          objectiveDescription: quest.objectives?.[0]?.description || quest.title,
          objectiveType: 'location',
        });
      }

      // Match by locationName against building metadata
      if (quest.locationName) {
        buildingData.forEach((entry, buildingId) => {
          if (this.matchesLocationName(quest.locationName!, entry.metadata)) {
            this.addToBuildingQuests(buildingQuests, buildingId, {
              questId: quest.id,
              questTitle: quest.title,
              objectiveDescription: quest.objectives?.[0]?.description || quest.title,
              objectiveType: 'location',
            });
          }
        });
      }

      // Match objectives that reference locations, NPCs, or delivery targets
      if (quest.objectives) {
        for (const obj of quest.objectives) {
          if (obj.completed) continue;

          // Location-based objectives
          if (obj.locationName) {
            buildingData.forEach((entry, buildingId) => {
              if (this.matchesLocationName(obj.locationName!, entry.metadata)) {
                this.addToBuildingQuests(buildingQuests, buildingId, {
                  questId: quest.id,
                  questTitle: quest.title,
                  objectiveDescription: obj.description,
                  objectiveType: obj.type,
                });
              }
            });
          }

          // NPC-based objectives (talk_to, deliver_item, escort)
          if (obj.npcId && npcBuildingMap) {
            const buildingId = npcBuildingMap.get(obj.npcId);
            if (buildingId && buildingData.has(buildingId)) {
              this.addToBuildingQuests(buildingQuests, buildingId, {
                questId: quest.id,
                questTitle: quest.title,
                objectiveDescription: obj.description,
                objectiveType: obj.type,
              });
            }
          }
        }
      }

      // Match completionCriteria references
      if (quest.completionCriteria) {
        const criteria = quest.completionCriteria;
        // deliver_item target NPC
        if (criteria.targetNpcId && npcBuildingMap) {
          const buildingId = npcBuildingMap.get(criteria.targetNpcId);
          if (buildingId && buildingData.has(buildingId)) {
            this.addToBuildingQuests(buildingQuests, buildingId, {
              questId: quest.id,
              questTitle: quest.title,
              objectiveDescription: criteria.description || quest.title,
              objectiveType: criteria.type || 'quest',
            });
          }
        }
        // discover_location
        if (criteria.locationId && buildingData.has(criteria.locationId)) {
          this.addToBuildingQuests(buildingQuests, criteria.locationId, {
            questId: quest.id,
            questTitle: quest.title,
            objectiveDescription: criteria.description || quest.title,
            objectiveType: criteria.type || 'quest',
          });
        }
      }
    }

    // Remove links for buildings no longer referenced
    const toUnlink: string[] = [];
    this.linkedObjects.forEach((_linked, buildingId) => {
      if (!buildingQuests.has(buildingId)) {
        toUnlink.push(buildingId);
      }
    });
    toUnlink.forEach(id => this.removeLink(id));

    // Create/update links
    buildingQuests.forEach((questInfos, buildingId) => {
      const entry = buildingData.get(buildingId);
      if (!entry) return;

      const existing = this.linkedObjects.get(buildingId);
      if (existing) {
        // Update if quest list changed
        if (!this.questListsMatch(existing.quests, questInfos)) {
          this.removeLink(buildingId);
          this.createLink(buildingId, entry.mesh, questInfos);
        }
      } else {
        this.createLink(buildingId, entry.mesh, questInfos);
      }
    });
  }

  private addToBuildingQuests(
    map: Map<string, QuestLinkInfo[]>,
    buildingId: string,
    info: QuestLinkInfo
  ): void {
    const list = map.get(buildingId) || [];
    // Avoid duplicates
    if (!list.some(q => q.questId === info.questId && q.objectiveType === info.objectiveType)) {
      list.push(info);
    }
    map.set(buildingId, list);
  }

  private matchesLocationName(locationName: string, metadata: any): boolean {
    if (!metadata) return false;
    const lower = locationName.toLowerCase();
    const fields = [
      metadata.businessName,
      metadata.businessType,
      metadata.buildingId,
    ];
    return fields.some(f => f && f.toLowerCase().includes(lower));
  }

  private questListsMatch(a: QuestLinkInfo[], b: QuestLinkInfo[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((q, i) => q.questId === b[i].questId && q.objectiveType === b[i].objectiveType);
  }

  /**
   * Create quest label and interactivity on a building
   */
  private createLink(buildingId: string, mesh: AbstractMesh, quests: QuestLinkInfo[]): void {
    const labelMesh = this.createQuestLabel(buildingId, mesh, quests);
    const originalMaterials = this.storeOriginalMaterials(mesh);
    const highlightMaterial = this.createHighlightMaterial(buildingId);

    // Add hover highlight
    if (!mesh.actionManager) {
      mesh.actionManager = new ActionManager(this.scene);
    }

    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        this.applyHighlight(mesh, highlightMaterial, originalMaterials);
      })
    );
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        this.removeHighlight(mesh, originalMaterials);
      })
    );

    // Click to show quest info
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        if (this.onQuestObjectClicked && quests.length > 0) {
          this.onQuestObjectClicked(quests[0]);
        }
      })
    );

    this.linkedObjects.set(buildingId, {
      buildingId,
      mesh,
      labelMesh,
      highlightMaterial,
      originalMaterials,
      quests,
    });
  }

  /**
   * Create a floating quest label above a building
   */
  private createQuestLabel(buildingId: string, mesh: AbstractMesh, quests: QuestLinkInfo[]): Mesh {
    const bounds = mesh.getBoundingInfo();
    const meshHeight = bounds
      ? (bounds.boundingBox.maximumWorld.y - bounds.boundingBox.minimumWorld.y)
      : 4;
    const labelY = meshHeight + 2.0;

    const texW = 512;
    const texH = 96;
    const texture = new DynamicTexture(
      `quest_link_tex_${buildingId}`,
      { width: texW, height: texH },
      this.scene,
      false
    );

    this.renderQuestLabelTexture(texture, quests, texW, texH);

    const planeW = 3.0;
    const planeH = planeW * (texH / texW);
    const plane = MeshBuilder.CreatePlane(
      `quest_link_label_${buildingId}`,
      { width: planeW, height: planeH },
      this.scene
    );

    const mat = new StandardMaterial(`quest_link_mat_${buildingId}`, this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.useAlphaFromDiffuseTexture = true;
    plane.material = mat;

    plane.position = new Vector3(0, labelY, 0);
    plane.parent = mesh;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    // Floating animation
    const floatAnim = new Animation(
      `quest_link_float_${buildingId}`,
      'position.y',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    floatAnim.setKeys([
      { frame: 0, value: labelY },
      { frame: 45, value: labelY + 0.3 },
      { frame: 90, value: labelY },
    ]);
    plane.animations.push(floatAnim);
    this.scene.beginAnimation(plane, 0, 90, true);

    return plane;
  }

  private renderQuestLabelTexture(
    texture: DynamicTexture,
    quests: QuestLinkInfo[],
    w: number,
    h: number
  ): void {
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(40, 20, 60, 0.85)';
    this.roundRect(ctx, 4, 4, w - 8, h - 8, 10);
    ctx.fill();

    // Border - golden quest color
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 4, 4, w - 8, h - 8, 10);
    ctx.stroke();

    // Quest icon and text
    const questCount = quests.length;
    const displayText = questCount === 1
      ? quests[0].questTitle
      : `${questCount} Quests`;

    // Icon
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const icon = this.getObjectiveIcon(quests[0].objectiveType);
    ctx.fillText(`${icon} ${displayText}`, w / 2, h / 2, w - 24);

    texture.update();
    texture.hasAlpha = true;
  }

  private getObjectiveIcon(objectiveType: string): string {
    switch (objectiveType) {
      case 'visit_location':
      case 'reach_location':
      case 'discover_location':
      case 'location':
        return '\u{1F4CD}'; // pin
      case 'talk_to_npc':
      case 'complete_conversation':
        return '\u{1F4AC}'; // speech bubble
      case 'deliver_item':
        return '\u{1F4E6}'; // package
      case 'collect_item':
      case 'collect_items':
        return '\u2728'; // sparkles
      case 'escort_npc':
        return '\u{1F6B6}'; // walking
      default:
        return '\u2694'; // swords
    }
  }

  private createHighlightMaterial(buildingId: string): StandardMaterial {
    const mat = new StandardMaterial(`quest_highlight_${buildingId}`, this.scene);
    mat.emissiveColor = new Color3(0.4, 0.35, 0.1);
    return mat;
  }

  private storeOriginalMaterials(mesh: AbstractMesh): Map<AbstractMesh, any> {
    const map = new Map<AbstractMesh, any>();
    map.set(mesh, mesh.material);
    mesh.getChildMeshes().forEach(child => {
      map.set(child, child.material);
    });
    return map;
  }

  private applyHighlight(
    _mesh: AbstractMesh,
    _highlightMat: StandardMaterial,
    originals: Map<AbstractMesh, any>
  ): void {
    // Add emissive tint without replacing material
    originals.forEach((originalMat) => {
      if (originalMat && originalMat instanceof StandardMaterial) {
        originalMat.emissiveColor = new Color3(0.3, 0.25, 0.05);
      }
    });
  }

  private removeHighlight(
    _mesh: AbstractMesh,
    originals: Map<AbstractMesh, any>
  ): void {
    originals.forEach((originalMat) => {
      if (originalMat && originalMat instanceof StandardMaterial) {
        originalMat.emissiveColor = Color3.Black();
      }
    });
  }

  /**
   * Remove a link from a building
   */
  private removeLink(buildingId: string): void {
    const linked = this.linkedObjects.get(buildingId);
    if (!linked) return;

    // Stop animation and dispose label
    this.scene.stopAnimation(linked.labelMesh);
    linked.labelMesh.dispose();

    // Restore materials
    this.removeHighlight(linked.mesh, linked.originalMaterials);

    // Dispose highlight material
    linked.highlightMaterial?.dispose();

    // Remove action manager actions (we can't selectively remove, so
    // we only clean up if we created the action manager)
    if (linked.mesh.actionManager &&
        linked.mesh.actionManager.actions.length === 3) {
      linked.mesh.actionManager.dispose();
      linked.mesh.actionManager = null as any;
    }

    this.linkedObjects.delete(buildingId);
  }

  /**
   * Remove all links for a specific quest
   */
  public removeQuestLinks(questId: string): void {
    const toRemove: string[] = [];
    this.linkedObjects.forEach((linked, buildingId) => {
      linked.quests = linked.quests.filter(q => q.questId !== questId);
      if (linked.quests.length === 0) {
        toRemove.push(buildingId);
      }
    });
    toRemove.forEach(id => this.removeLink(id));
  }

  /**
   * Get all buildings linked to a specific quest
   */
  public getLinkedBuildings(questId: string): string[] {
    const result: string[] = [];
    this.linkedObjects.forEach((linked, buildingId) => {
      if (linked.quests.some(q => q.questId === questId)) {
        result.push(buildingId);
      }
    });
    return result;
  }

  /**
   * Get quest info for a building
   */
  public getQuestInfoForBuilding(buildingId: string): QuestLinkInfo[] {
    return this.linkedObjects.get(buildingId)?.quests || [];
  }

  /**
   * Check if a building has quest links
   */
  public hasQuestLinks(buildingId: string): boolean {
    return this.linkedObjects.has(buildingId);
  }

  /**
   * Get count of linked objects
   */
  public get linkedCount(): number {
    return this.linkedObjects.size;
  }

  // --- Callbacks ---

  public setOnQuestObjectClicked(cb: (info: QuestLinkInfo) => void): void {
    this.onQuestObjectClicked = cb;
  }

  // --- Helpers ---

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  public dispose(): void {
    const ids = Array.from(this.linkedObjects.keys());
    ids.forEach(id => this.removeLink(id));
    this.linkedObjects.clear();
  }
}
