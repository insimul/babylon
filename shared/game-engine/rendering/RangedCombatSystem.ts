/**
 * Ranged Combat System
 *
 * Extends the base combat system with projectile-based attacks,
 * weapon types, ammo management, and raycast hit detection.
 * Used by: Shooter, Hybrid combat genres
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Ray } from '@babylonjs/core';
import { CombatSystem, CombatEntity, DamageResult } from './CombatSystem';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'bow' | 'magic_staff';

export interface WeaponConfig {
  id: WeaponType;
  name: string;
  damage: number;
  range: number;
  fireRate: number;        // Shots per second
  magazineSize: number;
  reloadTime: number;      // ms
  projectileSpeed: number; // units/sec, 0 = hitscan
  spread: number;          // radians, 0 = perfect accuracy
  pelletsPerShot: number;  // >1 for shotgun
}

export const WEAPON_CONFIGS: Record<WeaponType, WeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    damage: 15,
    range: 25,
    fireRate: 3,
    magazineSize: 12,
    reloadTime: 1500,
    projectileSpeed: 0, // hitscan
    spread: 0.02,
    pelletsPerShot: 1,
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    damage: 30,
    range: 50,
    fireRate: 1.5,
    magazineSize: 8,
    reloadTime: 2500,
    projectileSpeed: 0, // hitscan
    spread: 0.005,
    pelletsPerShot: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 8,
    range: 12,
    fireRate: 1,
    magazineSize: 6,
    reloadTime: 3000,
    projectileSpeed: 0, // hitscan
    spread: 0.15,
    pelletsPerShot: 8,
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    damage: 25,
    range: 35,
    fireRate: 0.8,
    magazineSize: 1,
    reloadTime: 800,
    projectileSpeed: 40, // projectile
    spread: 0.01,
    pelletsPerShot: 1,
  },
  magic_staff: {
    id: 'magic_staff',
    name: 'Magic Staff',
    damage: 20,
    range: 30,
    fireRate: 2,
    magazineSize: 5,
    reloadTime: 2000,
    projectileSpeed: 25, // projectile
    spread: 0.03,
    pelletsPerShot: 1,
  },
};

interface ActiveProjectile {
  mesh: Mesh;
  direction: Vector3;
  speed: number;
  damage: number;
  ownerId: string;
  range: number;
  distanceTraveled: number;
}

export class RangedCombatSystem {
  private scene: Scene;
  private baseCombat: CombatSystem;
  
  // Weapon state
  private currentWeapon: WeaponConfig;
  private ammoInMagazine: number;
  private totalAmmo: Map<WeaponType, number> = new Map();
  private isReloading: boolean = false;
  private lastFireTime: number = 0;
  
  // Projectiles
  private activeProjectiles: ActiveProjectile[] = [];
  private projectileMaterial: StandardMaterial | null = null;
  
  // Callbacks
  private onAmmoChanged: ((current: number, max: number, total: number) => void) | null = null;
  private onReloadStart: (() => void) | null = null;
  private onReloadEnd: (() => void) | null = null;
  private onWeaponFired: ((weapon: WeaponType) => void) | null = null;
  private onHit: ((result: DamageResult) => void) | null = null;

  constructor(scene: Scene, baseCombat: CombatSystem) {
    this.scene = scene;
    this.baseCombat = baseCombat;
    
    // Default weapon
    this.currentWeapon = WEAPON_CONFIGS.pistol;
    this.ammoInMagazine = this.currentWeapon.magazineSize;
    
    // Initialize ammo reserves
    this.totalAmmo.set('pistol', 120);
    this.totalAmmo.set('rifle', 40);
    this.totalAmmo.set('shotgun', 30);
    this.totalAmmo.set('bow', 30);
    this.totalAmmo.set('magic_staff', 25);
    
    // Create projectile material
    this.projectileMaterial = new StandardMaterial('projectile_mat', scene);
    this.projectileMaterial.emissiveColor = new Color3(1, 0.8, 0);
    this.projectileMaterial.disableLighting = true;
  }

  /**
   * Switch to a different weapon
   */
  public switchWeapon(weaponType: WeaponType): void {
    if (this.isReloading) return;
    
    this.currentWeapon = WEAPON_CONFIGS[weaponType];
    this.ammoInMagazine = Math.min(
      this.currentWeapon.magazineSize,
      this.totalAmmo.get(weaponType) || 0
    );
    
    this.notifyAmmoChanged();
  }

  /**
   * Get current weapon info
   */
  public getCurrentWeapon(): WeaponConfig {
    return this.currentWeapon;
  }

  /**
   * Get ammo info
   */
  public getAmmoInfo(): { current: number; max: number; total: number } {
    return {
      current: this.ammoInMagazine,
      max: this.currentWeapon.magazineSize,
      total: this.totalAmmo.get(this.currentWeapon.id) || 0,
    };
  }

  /**
   * Fire the current weapon from a position in a direction
   */
  public fire(origin: Vector3, direction: Vector3, ownerId: string): DamageResult[] {
    const now = Date.now();
    const fireCooldown = 1000 / this.currentWeapon.fireRate;
    
    if (now - this.lastFireTime < fireCooldown) return [];
    if (this.isReloading) return [];
    if (this.ammoInMagazine <= 0) {
      this.reload();
      return [];
    }
    
    this.lastFireTime = now;
    this.ammoInMagazine--;
    this.notifyAmmoChanged();
    this.onWeaponFired?.(this.currentWeapon.id);
    
    const results: DamageResult[] = [];
    
    for (let i = 0; i < this.currentWeapon.pelletsPerShot; i++) {
      // Apply spread
      const spreadDir = this.applySpread(direction, this.currentWeapon.spread);
      
      if (this.currentWeapon.projectileSpeed > 0) {
        // Spawn projectile
        this.spawnProjectile(origin, spreadDir, ownerId);
      } else {
        // Hitscan - immediate raycast
        const result = this.hitscanAttack(origin, spreadDir, ownerId);
        if (result) results.push(result);
      }
    }
    
    // Auto-reload if empty
    if (this.ammoInMagazine <= 0) {
      this.reload();
    }
    
    return results;
  }

  /**
   * Reload current weapon
   */
  public reload(): void {
    if (this.isReloading) return;
    if (this.ammoInMagazine >= this.currentWeapon.magazineSize) return;
    
    const reserve = this.totalAmmo.get(this.currentWeapon.id) || 0;
    if (reserve <= 0) return;
    
    this.isReloading = true;
    this.onReloadStart?.();
    
    setTimeout(() => {
      const needed = this.currentWeapon.magazineSize - this.ammoInMagazine;
      const available = this.totalAmmo.get(this.currentWeapon.id) || 0;
      const toLoad = Math.min(needed, available);
      
      this.ammoInMagazine += toLoad;
      this.totalAmmo.set(this.currentWeapon.id, available - toLoad);
      
      this.isReloading = false;
      this.onReloadEnd?.();
      this.notifyAmmoChanged();
    }, this.currentWeapon.reloadTime);
  }

  /**
   * Add ammo to reserves
   */
  public addAmmo(weaponType: WeaponType, amount: number): void {
    const current = this.totalAmmo.get(weaponType) || 0;
    this.totalAmmo.set(weaponType, current + amount);
    
    if (weaponType === this.currentWeapon.id) {
      this.notifyAmmoChanged();
    }
  }

  /**
   * Hitscan attack - immediate raycast
   */
  private hitscanAttack(origin: Vector3, direction: Vector3, ownerId: string): DamageResult | null {
    const ray = new Ray(origin, direction, this.currentWeapon.range);
    const hit = this.scene.pickWithRay(ray, (mesh) => {
      // Skip the attacker's own mesh
      const entity = this.findEntityByMesh(mesh as Mesh);
      return entity !== null && entity.id !== ownerId;
    });
    
    if (hit?.pickedMesh) {
      const entity = this.findEntityByMesh(hit.pickedMesh as Mesh);
      if (entity && entity.isAlive) {
        return this.applyRangedDamage(ownerId, entity.id);
      }
    }
    
    return null;
  }

  /**
   * Spawn a projectile mesh
   */
  private spawnProjectile(origin: Vector3, direction: Vector3, ownerId: string): void {
    const projectile = MeshBuilder.CreateSphere(
      `projectile_${Date.now()}`,
      { diameter: 0.2 },
      this.scene
    );
    projectile.position = origin.clone();
    if (this.projectileMaterial) {
      projectile.material = this.projectileMaterial;
    }
    
    this.activeProjectiles.push({
      mesh: projectile,
      direction: direction.normalize(),
      speed: this.currentWeapon.projectileSpeed,
      damage: this.currentWeapon.damage,
      ownerId,
      range: this.currentWeapon.range,
      distanceTraveled: 0,
    });
  }

  /**
   * Update projectiles each frame - call from render loop
   */
  public update(deltaTime: number): void {
    const toRemove: number[] = [];
    
    for (let i = 0; i < this.activeProjectiles.length; i++) {
      const proj = this.activeProjectiles[i];
      const moveDistance = proj.speed * deltaTime;
      
      // Move projectile
      const movement = proj.direction.scale(moveDistance);
      proj.mesh.position.addInPlace(movement);
      proj.distanceTraveled += moveDistance;
      
      // Check if out of range
      if (proj.distanceTraveled >= proj.range) {
        toRemove.push(i);
        continue;
      }
      
      // Check collision with entities
      const hitEntity = this.checkProjectileCollision(proj);
      if (hitEntity) {
        this.applyRangedDamage(proj.ownerId, hitEntity.id);
        toRemove.push(i);
      }
    }
    
    // Remove expired/hit projectiles (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      this.activeProjectiles[idx].mesh.dispose();
      this.activeProjectiles.splice(idx, 1);
    }
  }

  /**
   * Check if a projectile has hit an entity
   */
  private checkProjectileCollision(proj: ActiveProjectile): CombatEntity | null {
    const entities = this.baseCombat.getAllEntities();
    
    for (const entity of entities) {
      if (entity.id === proj.ownerId) continue;
      if (!entity.isAlive || !entity.mesh) continue;
      
      const distance = Vector3.Distance(proj.mesh.position, entity.mesh.position);
      if (distance < 1.5) { // collision radius
        return entity;
      }
    }
    
    return null;
  }

  /**
   * Apply ranged damage through the base combat system
   */
  private applyRangedDamage(attackerId: string, targetId: string): DamageResult | null {
    const result = this.baseCombat.attack(attackerId, targetId);
    if (result) {
      this.onHit?.(result);
    }
    return result;
  }

  /**
   * Apply spread to a direction vector
   */
  private applySpread(direction: Vector3, spreadAngle: number): Vector3 {
    if (spreadAngle <= 0) return direction.clone();
    
    const theta = (Math.random() - 0.5) * 2 * spreadAngle;
    const phi = (Math.random() - 0.5) * 2 * spreadAngle;
    
    const result = direction.clone();
    result.x += Math.sin(theta);
    result.y += Math.sin(phi);
    result.normalize();
    
    return result;
  }

  /**
   * Find entity by mesh reference
   */
  private findEntityByMesh(mesh: Mesh): CombatEntity | null {
    const entities = this.baseCombat.getAllEntities();
    for (const entity of entities) {
      if (entity.mesh === mesh || entity.mesh?.name === mesh.name) {
        return entity;
      }
    }
    return null;
  }

  /**
   * Notify ammo change callback
   */
  private notifyAmmoChanged(): void {
    this.onAmmoChanged?.(
      this.ammoInMagazine,
      this.currentWeapon.magazineSize,
      this.totalAmmo.get(this.currentWeapon.id) || 0
    );
  }

  // Callback setters
  public setOnAmmoChanged(cb: (current: number, max: number, total: number) => void): void {
    this.onAmmoChanged = cb;
  }
  public setOnReloadStart(cb: () => void): void { this.onReloadStart = cb; }
  public setOnReloadEnd(cb: () => void): void { this.onReloadEnd = cb; }
  public setOnWeaponFired(cb: (weapon: WeaponType) => void): void { this.onWeaponFired = cb; }
  public setOnHit(cb: (result: DamageResult) => void): void { this.onHit = cb; }

  /**
   * Dispose all projectiles and materials
   */
  public dispose(): void {
    for (const proj of this.activeProjectiles) {
      proj.mesh.dispose();
    }
    this.activeProjectiles = [];
    this.projectileMaterial?.dispose();
    this.projectileMaterial = null;
  }
}
