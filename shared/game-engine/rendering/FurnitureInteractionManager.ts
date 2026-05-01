/**
 * FurnitureInteractionManager
 *
 * Handles player interactions with interior furniture: sitting on chairs/stools,
 * sleeping in beds, reading bookshelves for lore, and using workstations.
 * Works with InteractionPromptSystem for proximity prompts and GameEventBus
 * for event emission.
 */

import type { AbstractMesh } from '@babylonjs/core';
import type { GameEventBus } from '../logic/GameEventBus';
import type { GameTimeManager } from '../logic/GameTimeManager';
import type { FurnitureInteractionType, InteractableTarget } from './InteractionPromptSystem';

export interface FurnitureInteractionCallbacks {
  /** Show a toast notification to the player. */
  showToast: (opts: { title: string; description: string; duration?: number; variant?: 'default' | 'destructive' }) => void;
  /** Show a confirmation dialog. Returns true if confirmed. */
  showConfirm: (title: string, message: string) => Promise<boolean>;
  /** Show a lore text popup. */
  showLorePopup: (title: string, content: string) => void;
  /** Lock/unlock player movement. */
  setMovementLocked: (locked: boolean) => void;
  /** Play an animation on the player mesh. */
  playPlayerAnimation?: (animationName: string) => void;
  /** Stop a playing animation on the player mesh. */
  stopPlayerAnimation?: (animationName: string) => void;
  /** Get truths/lore entries from the world knowledge base. */
  getTruths: () => Array<{ id?: string; title: string; content: string }>;
  /** Check if the player owns this building. */
  isPlayerOwnedBuilding?: (buildingId: string) => boolean;
  /** Get the business type of the current building. */
  getCurrentBusinessType?: () => string | null;
  /** Get the current building ID. */
  getCurrentBuildingId?: () => string | null;
}

export class FurnitureInteractionManager {
  private eventBus: GameEventBus | null = null;
  private timeManager: GameTimeManager | null = null;
  private callbacks: FurnitureInteractionCallbacks;
  private _isSeated = false;
  private _seatedMesh: AbstractMesh | null = null;

  constructor(callbacks: FurnitureInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  setEventBus(bus: GameEventBus): void {
    this.eventBus = bus;
  }

  setTimeManager(manager: GameTimeManager): void {
    this.timeManager = manager;
  }

  get isSeated(): boolean {
    return this._isSeated;
  }

  /**
   * Handle an interaction with a furniture target from InteractionPromptSystem.
   * Returns true if the interaction was handled.
   */
  async handleInteraction(target: InteractableTarget): Promise<boolean> {
    if (target.type !== 'furniture' || !target.furnitureType) return false;

    // If seated, any interaction stands the player up first
    if (this._isSeated) {
      this.standUp();
      return true;
    }

    switch (target.furnitureType) {
      case 'seat':
        this.handleSeat(target);
        return true;
      case 'bed':
        await this.handleBed(target);
        return true;
      case 'bookshelf':
        this.handleBookshelf(target);
        return true;
      case 'workstation':
        this.handleWorkstation(target);
        return true;
      default:
        return false;
    }
  }

  /**
   * If seated, stand up. Called when player clicks again or moves.
   */
  standUp(): void {
    if (!this._isSeated) return;
    this._isSeated = false;
    const buildingId = this.callbacks.getCurrentBuildingId?.() ?? undefined;
    this.callbacks.setMovementLocked(false);
    this.callbacks.stopPlayerAnimation?.('sit');
    this.callbacks.showToast({
      title: 'Stood Up',
      description: 'You stand up.',
      duration: 1000,
    });
    this.eventBus?.emit({
      type: 'furniture_stood',
      furnitureType: this._seatedMesh?.metadata?.furnitureSubType ?? 'chair',
      buildingId,
    });
    this._seatedMesh = null;
  }

  private handleSeat(target: InteractableTarget): void {
    this._isSeated = true;
    this._seatedMesh = target.mesh;
    const buildingId = this.callbacks.getCurrentBuildingId?.() ?? undefined;
    this.callbacks.setMovementLocked(true);
    this.callbacks.playPlayerAnimation?.('sit');
    this.callbacks.showToast({
      title: 'Sitting',
      description: `You sit on the ${target.name.toLowerCase()}. Click again to stand.`,
      duration: 2000,
    });
    this.eventBus?.emit({
      type: 'furniture_sat',
      furnitureType: target.mesh.metadata?.furnitureSubType ?? 'chair',
      buildingId,
    });
  }

  private async handleBed(target: InteractableTarget): Promise<void> {
    if (!this.timeManager) {
      this.callbacks.showToast({
        title: 'Cannot Sleep',
        description: 'Time system not available.',
        duration: 1500,
        variant: 'destructive',
      });
      return;
    }

    const hour = this.timeManager.hour;
    const isNightTime = hour >= 20 || hour < 5;

    if (!isNightTime) {
      this.callbacks.showToast({
        title: 'Not Tired',
        description: 'You can only sleep at night (after 8 PM).',
        duration: 2000,
      });
      return;
    }

    const confirmed = await this.callbacks.showConfirm(
      'Sleep',
      'Sleep until morning? (Time will advance to 7:00 AM)',
    );

    if (!confirmed) return;

    // Calculate hours until 7 AM
    const hoursToSleep = hour >= 20 ? (24 - hour) + 7 : 7 - hour;
    const buildingId = this.callbacks.getCurrentBuildingId?.() ?? undefined;

    this.callbacks.setMovementLocked(true);
    this.callbacks.showToast({
      title: 'Sleeping...',
      description: `Sleeping for ${hoursToSleep} hours until morning.`,
      duration: 2000,
    });

    this.timeManager.advanceHours(hoursToSleep);

    this.callbacks.setMovementLocked(false);
    this.callbacks.showToast({
      title: 'Good Morning',
      description: 'You wake up feeling rested.',
      duration: 2000,
    });

    this.eventBus?.emit({
      type: 'furniture_slept',
      hoursSlept: hoursToSleep,
      buildingId,
    });
  }

  private handleBookshelf(target: InteractableTarget): void {
    const truths = this.callbacks.getTruths();
    if (truths.length === 0) {
      this.callbacks.showToast({
        title: 'Empty Shelf',
        description: 'The bookshelf contains nothing of interest.',
        duration: 1500,
      });
      return;
    }

    const entry = truths[Math.floor(Math.random() * truths.length)];
    const buildingId = this.callbacks.getCurrentBuildingId?.() ?? undefined;

    this.callbacks.showLorePopup(entry.title, entry.content);

    this.eventBus?.emit({
      type: 'furniture_read_lore',
      truthId: entry.id,
      truthTitle: entry.title,
      buildingId,
    });
  }

  private handleWorkstation(target: InteractableTarget): void {
    const buildingId = this.callbacks.getCurrentBuildingId?.();
    const businessType = this.callbacks.getCurrentBusinessType?.();

    if (!buildingId || !businessType) {
      this.callbacks.showToast({
        title: 'Cannot Work',
        description: 'This workstation is not in a business you can use.',
        duration: 1500,
      });
      return;
    }

    const isOwned = this.callbacks.isPlayerOwnedBuilding?.(buildingId) ?? false;
    if (!isOwned) {
      this.callbacks.showToast({
        title: 'Not Your Business',
        description: 'You need to own this business to work here.',
        duration: 2000,
      });
      return;
    }

    this.callbacks.showToast({
      title: 'Working',
      description: `You work at the ${target.name.toLowerCase()}.`,
      duration: 2000,
    });

    this.eventBus?.emit({
      type: 'furniture_worked',
      buildingId,
      businessType,
    });
  }

  dispose(): void {
    if (this._isSeated) {
      this.standUp();
    }
    this.eventBus = null;
    this.timeManager = null;
    this._seatedMesh = null;
  }
}
