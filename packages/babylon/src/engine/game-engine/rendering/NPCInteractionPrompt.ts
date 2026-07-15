/**
 * NPC Interaction Prompt
 *
 * Shows contextual interaction prompts when the player looks at an NPC:
 *   - "[G]: Talk to ______" for a single NPC
 *   - "[Y]: Eavesdrop ____ and ______" for two NPCs in conversation
 *
 * Uses a center-screen ray pick each frame to detect which NPC (if any)
 * the camera is pointing at.
 */

import {
  Scene,
  Mesh,
  AbstractMesh,
} from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  TextBlock,
  Rectangle,
} from '@babylonjs/gui';
import type { QuestIndicatorType } from './QuestIndicatorManager';

export interface InteractionPromptNPC {
  id: string;
  name: string;
  mesh: Mesh;
}

export interface ConversationPartnerInfo {
  partnerId: string;
  partnerName: string;
}

export type GetConversationPartnerFn = (npcId: string) => ConversationPartnerInfo | null;

export type GetQuestIndicatorFn = (npcId: string) => QuestIndicatorType;

export class NPCInteractionPrompt {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private container: Rectangle;
  private textBlock: TextBlock;
  private questHintBlock: TextBlock;
  private npcs = new Map<string, InteractionPromptNPC>();
  private getConversationPartner: GetConversationPartnerFn | null = null;
  private getQuestIndicator: GetQuestIndicatorFn | null = null;

  /** Currently targeted NPC id (to avoid re-rendering text every frame) */
  private currentTargetId: string | null = null;
  private currentPromptText: string = '';

  /** Max distance for interaction prompt */
  private maxDistance = 12;

  /** NPC root meshes for fast parent-chain lookup */
  private npcRootMeshes = new Map<AbstractMesh, InteractionPromptNPC>();

  constructor(scene: Scene) {
    this.scene = scene;

    // Create fullscreen GUI
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('npc_interaction_prompt_ui', true, scene);
    this.gui.idealWidth = 1280;

    // Container for prompt
    this.container = new Rectangle('interaction_prompt_container');
    this.container.width = '400px';
    this.container.adaptHeightToChildren = true;
    this.container.cornerRadius = 6;
    this.container.color = 'transparent';
    this.container.background = 'rgba(0, 0, 0, 0.6)';
    this.container.thickness = 0;
    this.container.verticalAlignment = 1; // bottom
    this.container.top = '-120px';
    this.container.paddingTop = '6px';
    this.container.paddingBottom = '6px';
    this.container.paddingLeft = '12px';
    this.container.paddingRight = '12px';
    this.container.isVisible = false;
    this.gui.addControl(this.container);

    // Text block
    this.textBlock = new TextBlock('interaction_prompt_text');
    this.textBlock.color = 'white';
    this.textBlock.fontSize = 16;
    this.textBlock.fontFamily = 'Arial';
    this.textBlock.textWrapping = true;
    this.textBlock.resizeToFit = true;
    this.textBlock.textHorizontalAlignment = 2; // center
    this.container.addControl(this.textBlock);

    // Quest hint text below the main prompt
    this.questHintBlock = new TextBlock('interaction_quest_hint');
    this.questHintBlock.color = '#FFD700';
    this.questHintBlock.fontSize = 13;
    this.questHintBlock.fontFamily = 'Arial';
    this.questHintBlock.fontWeight = 'bold';
    this.questHintBlock.textWrapping = true;
    this.questHintBlock.resizeToFit = true;
    this.questHintBlock.textHorizontalAlignment = 2; // center
    this.questHintBlock.isVisible = false;
    this.container.addControl(this.questHintBlock);
  }

  setConversationPartnerCallback(fn: GetConversationPartnerFn): void {
    this.getConversationPartner = fn;
  }

  setQuestIndicatorCallback(fn: GetQuestIndicatorFn): void {
    this.getQuestIndicator = fn;
  }

  registerNPC(npc: InteractionPromptNPC): void {
    this.npcs.set(npc.id, npc);
    this.npcRootMeshes.set(npc.mesh, npc);
  }

  unregisterNPC(npcId: string): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      this.npcRootMeshes.delete(npc.mesh);
      this.npcs.delete(npcId);
    }
  }

  /**
   * Call from the render loop (throttled).
   * Casts a ray from the center of the screen and resolves which NPC (if any) was hit.
   */
  update(): void {
    const camera = this.scene.activeCamera;
    if (!camera) {
      this.hidePrompt();
      return;
    }

    // Ray from center of viewport
    const engine = this.scene.getEngine();
    const pickResult = this.scene.pick(
      engine.getRenderWidth() / 2,
      engine.getRenderHeight() / 2,
    );

    if (!pickResult?.hit || !pickResult.pickedMesh) {
      this.hidePrompt();
      return;
    }

    if (pickResult.distance > this.maxDistance) {
      this.hidePrompt();
      return;
    }

    // Walk the parent chain to find an NPC root mesh
    const targetNpc = this.findNPCFromMesh(pickResult.pickedMesh);
    if (!targetNpc) {
      this.hidePrompt();
      return;
    }

    // Check if this NPC is in a conversation
    const partner = this.getConversationPartner?.(targetNpc.id);

    let promptText: string;
    if (partner) {
      promptText = `[Y]: Eavesdrop ${targetNpc.name} and ${partner.partnerName}`;
    } else {
      promptText = `[G]: Talk to ${targetNpc.name}`;
    }

    // Determine quest hint for this NPC
    const questIndicator = this.getQuestIndicator?.(targetNpc.id) ?? null;
    this.showPrompt(targetNpc.id, promptText, questIndicator);
  }

  private findNPCFromMesh(mesh: AbstractMesh): InteractionPromptNPC | null {
    // Check the mesh itself and walk up
    let current: AbstractMesh | null = mesh;
    while (current) {
      const npc = this.npcRootMeshes.get(current);
      if (npc) return npc;
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private showPrompt(npcId: string, text: string, questIndicator: QuestIndicatorType): void {
    if (this.currentTargetId === npcId && this.currentPromptText === text) {
      return;
    }
    this.currentTargetId = npcId;
    this.currentPromptText = text;
    this.textBlock.text = text;
    this.container.isVisible = true;

    // Show quest hint below the interaction prompt
    if (questIndicator) {
      const hint = this.getQuestHintText(questIndicator);
      this.questHintBlock.text = hint.text;
      this.questHintBlock.color = hint.color;
      this.questHintBlock.isVisible = true;
    } else {
      this.questHintBlock.isVisible = false;
    }
  }

  private getQuestHintText(type: QuestIndicatorType): { text: string; color: string } {
    switch (type) {
      case 'available':
        return { text: 'Quest Available', color: '#FFD700' };
      case 'objective':
        return { text: 'Quest Objective', color: '#FFD700' };
      case 'in_progress':
        return { text: 'Quest In Progress', color: '#C0C0C0' };
      case 'turn_in':
        return { text: 'Quest Ready to Turn In!', color: '#32CD32' };
      default:
        return { text: '', color: '#FFFFFF' };
    }
  }

  private hidePrompt(): void {
    if (this.currentTargetId === null) return;
    this.currentTargetId = null;
    this.currentPromptText = '';
    this.container.isVisible = false;
    this.questHintBlock.isVisible = false;
  }

  dispose(): void {
    this.gui.dispose();
    this.npcs.clear();
    this.npcRootMeshes.clear();
  }
}
