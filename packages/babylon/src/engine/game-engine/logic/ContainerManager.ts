import type { Container, ContainerItem } from '@shared/game-engine/types';
import type { IDataSource } from '@shared/game-engine/data-source';

export interface ContainerState {
  id: string;
  name: string;
  containerType: string;
  capacity: number;
  items: ContainerItem[];
  locked: boolean;
  lockDifficulty?: number;
  keyItemId?: string;
  respawns: boolean;
  respawnTimeMinutes?: number;
  lastOpenedAt?: string;
  businessId?: string;
  residenceId?: string;
  lotId?: string;
}

export class ContainerManager {
  private containers = new Map<string, ContainerState>();
  private worldId: string;
  private dataSource: IDataSource;

  constructor(worldId: string, dataSource: IDataSource) {
    this.worldId = worldId;
    this.dataSource = dataSource;
  }

  async loadContainers(): Promise<void> {
    const raw = await this.dataSource.loadContainers(this.worldId);
    this.containers.clear();
    for (const c of raw) {
      this.containers.set(c.id, this.toState(c));
    }
  }

  async loadContainersForLocation(location: { businessId?: string; residenceId?: string; lotId?: string }): Promise<ContainerState[]> {
    const raw = await this.dataSource.loadContainersByLocation(this.worldId, location);
    const states: ContainerState[] = [];
    for (const c of raw) {
      const state = this.toState(c);
      this.containers.set(c.id, state);
      states.push(state);
    }
    return states;
  }

  getContainer(id: string): ContainerState | undefined {
    return this.containers.get(id);
  }

  getAllContainers(): ContainerState[] {
    return Array.from(this.containers.values());
  }

  getContainersAtLocation(location: { businessId?: string; residenceId?: string; lotId?: string }): ContainerState[] {
    return this.getAllContainers().filter(c => {
      if (location.businessId && c.businessId === location.businessId) return true;
      if (location.residenceId && c.residenceId === location.residenceId) return true;
      if (location.lotId && c.lotId === location.lotId) return true;
      return false;
    });
  }

  isLocked(id: string): boolean {
    return this.containers.get(id)?.locked ?? false;
  }

  canUnlock(id: string, playerItemIds: string[]): boolean {
    const container = this.containers.get(id);
    if (!container || !container.locked) return true;
    if (!container.keyItemId) return false;
    return playerItemIds.includes(container.keyItemId);
  }

  unlock(id: string): boolean {
    const container = this.containers.get(id);
    if (!container || !container.locked) return false;
    container.locked = false;
    return true;
  }

  isFull(id: string): boolean {
    const container = this.containers.get(id);
    if (!container) return true;
    return container.items.length >= container.capacity;
  }

  shouldRespawn(id: string): boolean {
    const container = this.containers.get(id);
    if (!container || !container.respawns || !container.lastOpenedAt || !container.respawnTimeMinutes) {
      return false;
    }
    const elapsed = (Date.now() - new Date(container.lastOpenedAt).getTime()) / 60000;
    return elapsed >= container.respawnTimeMinutes;
  }

  async deposit(containerId: string, itemId: string, itemName: string, quantity = 1): Promise<ContainerState | null> {
    const container = this.containers.get(containerId);
    if (!container || container.locked) return null;

    const result = await this.dataSource.transferContainerItem(containerId, {
      itemId,
      itemName,
      quantity,
      direction: 'deposit',
    });
    if (!result) return null;

    const updated = this.toState(result);
    this.containers.set(containerId, updated);
    return updated;
  }

  async withdraw(containerId: string, itemId: string, quantity = 1): Promise<ContainerState | null> {
    const container = this.containers.get(containerId);
    if (!container || container.locked) return null;

    const result = await this.dataSource.transferContainerItem(containerId, {
      itemId,
      quantity,
      direction: 'withdraw',
    });
    if (!result) return null;

    const updated = this.toState(result);
    this.containers.set(containerId, updated);
    return updated;
  }

  private toState(raw: any): ContainerState {
    return {
      id: raw.id,
      name: raw.name,
      containerType: raw.containerType,
      capacity: raw.capacity ?? 10,
      items: raw.items ?? [],
      locked: raw.locked ?? false,
      lockDifficulty: raw.lockDifficulty ?? undefined,
      keyItemId: raw.keyItemId ?? undefined,
      respawns: raw.respawns ?? false,
      respawnTimeMinutes: raw.respawnTimeMinutes ?? undefined,
      lastOpenedAt: raw.lastOpenedAt ?? undefined,
      businessId: raw.businessId ?? undefined,
      residenceId: raw.residenceId ?? undefined,
      lotId: raw.lotId ?? undefined,
    };
  }
}
