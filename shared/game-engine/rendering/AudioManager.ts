/**
 * Audio Manager
 *
 * Manages game audio including footsteps, ambient sounds, combat effects,
 * interaction sounds, and background music. Supports loading audio from
 * asset collections or falling back to default sounds.
 */

import { Scene, Sound, Vector3, AbstractMesh, Observer } from '@babylonjs/core';
import type { VisualAsset } from '@shared/schema';

export type AudioRole = 'footstep' | 'ambient' | 'combat' | 'interact' | 'music';

export interface SpatialSoundBinding {
  sound: Sound;
  mesh: AbstractMesh;
  role: AudioRole;
}

export interface AudioConfig {
  footstep?: string;
  ambient?: string;
  combat?: string;
  interact?: string;
  music?: string;
}

interface LoadedSound {
  sound: Sound;
  role: AudioRole;
  assetId?: string;
}

export class AudioManager {
  private scene: Scene;
  private sounds: Map<string, LoadedSound> = new Map();
  private ambientSounds: Sound[] = [];
  private musicTrack: Sound | null = null;
  
  // Volume levels (0-1)
  private masterVolume: number = 1.0;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.5;
  private ambientVolume: number = 0.6;

  // State
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  // VR Spatial Audio
  private isVRMode: boolean = false;
  private spatialBindings: SpatialSoundBinding[] = [];
  private spatialUpdateObserver: Observer<Scene> | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Initialize audio manager with audio config from asset collection
   * @param audioConfig - Map of audio roles to asset IDs
   * @param worldAssets - Array of visual assets from the world
   */
  public async initialize(
    audioConfig: AudioConfig | null,
    worldAssets: VisualAsset[]
  ): Promise<void> {
    if (this.isInitialized) {
      console.warn('[AudioManager] Already initialized');
      return;
    }


    if (audioConfig) {
      await this.loadAudioFromConfig(audioConfig, worldAssets);
    }

    this.isInitialized = true;
  }

  /**
   * Load audio assets from the audio config
   */
  private async loadAudioFromConfig(
    audioConfig: AudioConfig,
    worldAssets: VisualAsset[]
  ): Promise<void> {
    const findAsset = (id: string | undefined): VisualAsset | null => {
      if (!id) return null;
      return worldAssets.find((a) => a.id === id) || null;
    };

    // Load each audio role
    const roles: AudioRole[] = ['footstep', 'ambient', 'combat', 'interact', 'music'];
    
    for (const role of roles) {
      const assetId = audioConfig[role];
      const asset = findAsset(assetId);
      
      if (asset && asset.filePath) {
        try {
          await this.loadSound(role, asset.filePath, assetId);
        } catch (error) {
          console.warn(`[AudioManager] Failed to load ${role} audio:`, error);
        }
      }
    }
  }

  /**
   * Load a sound for a specific role
   */
  private loadSound(role: AudioRole, filePath: string, assetId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = filePath.startsWith('/') ? filePath : '/' + filePath;
      const soundName = `audio_${role}_${assetId || 'default'}`;

      const options: any = {
        loop: role === 'ambient' || role === 'music',
        autoplay: false,
        volume: this.getVolumeForRole(role)
      };

      const sound = new Sound(
        soundName,
        url,
        this.scene,
        () => {
          this.sounds.set(soundName, { sound, role, assetId });
          
          if (role === 'ambient') {
            this.ambientSounds.push(sound);
          } else if (role === 'music') {
            this.musicTrack = sound;
          }
          
          resolve();
        },
        options
      );

      sound.onended = () => {
        if (role !== 'ambient' && role !== 'music') {
          // One-shot sounds can be cleaned up or replayed
        }
      };
    });
  }

  /**
   * Get volume level for a specific role
   */
  private getVolumeForRole(role: AudioRole): number {
    if (this.isMuted) return 0;
    
    const baseVolume = this.masterVolume;
    
    switch (role) {
      case 'footstep':
      case 'combat':
      case 'interact':
        return baseVolume * this.sfxVolume;
      case 'ambient':
        return baseVolume * this.ambientVolume;
      case 'music':
        return baseVolume * this.musicVolume;
      default:
        return baseVolume;
    }
  }

  /**
   * Play a sound by role
   * @param role - The audio role to play
   * @param position - Optional 3D position for spatial audio
   */
  public playSound(role: AudioRole, position?: Vector3): void {
    const soundEntry = Array.from(this.sounds.values()).find(s => s.role === role);
    
    if (!soundEntry) {
      // console.warn(`[AudioManager] No sound loaded for role: ${role}`);
      return;
    }

    const sound = soundEntry.sound;

    if (position) {
      sound.setPosition(position);
      sound.spatialSound = true;
      sound.distanceModel = 'exponential';
      sound.rolloffFactor = 2;
      sound.maxDistance = 50;
    }

    if (!sound.isPlaying) {
      sound.play();
    }
  }

  /**
   * Play a one-shot sound effect (creates a new instance)
   * @param role - The audio role
   * @param position - Optional 3D position
   */
  public playSoundOneShot(role: AudioRole, position?: Vector3): void {
    const soundEntry = Array.from(this.sounds.values()).find(s => s.role === role);
    
    if (!soundEntry) {
      return;
    }

    // Clone the sound for one-shot playback
    const clone = soundEntry.sound.clone();
    if (clone) {
      clone.autoplay = false;
      
      if (position) {
        clone.setPosition(position);
        clone.spatialSound = true;
      }

      clone.onended = () => {
        clone.dispose();
      };

      clone.play();
    }
  }

  /**
   * Play footstep sound
   */
  public playFootstep(position?: Vector3): void {
    this.playSoundOneShot('footstep', position);
  }

  /**
   * Play combat sound
   */
  public playCombatSound(position?: Vector3): void {
    this.playSoundOneShot('combat', position);
  }

  /**
   * Play interaction sound
   */
  public playInteractSound(position?: Vector3): void {
    this.playSoundOneShot('interact', position);
  }

  /**
   * Start ambient audio
   */
  public startAmbient(): void {
    for (const sound of this.ambientSounds) {
      if (!sound.isPlaying) {
        sound.play();
      }
    }
  }

  /**
   * Stop ambient audio
   */
  public stopAmbient(): void {
    for (const sound of this.ambientSounds) {
      if (sound.isPlaying) {
        sound.stop();
      }
    }
  }

  /**
   * Start background music
   */
  public startMusic(): void {
    if (this.musicTrack && !this.musicTrack.isPlaying) {
      this.musicTrack.play();
    }
  }

  /**
   * Stop background music
   */
  public stopMusic(): void {
    if (this.musicTrack && this.musicTrack.isPlaying) {
      this.musicTrack.stop();
    }
  }

  /**
   * Pause all audio
   */
  public pauseAll(): void {
    this.sounds.forEach(({ sound }) => {
      if (sound.isPlaying) {
        sound.pause();
      }
    });
  }

  /**
   * Resume all audio
   */
  public resumeAll(): void {
    this.sounds.forEach(({ sound }) => {
      if (sound.isPaused) {
        sound.play();
      }
    });
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  /**
   * Set SFX volume
   */
  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  /**
   * Set music volume
   */
  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicTrack) {
      this.musicTrack.setVolume(this.getVolumeForRole('music'));
    }
  }

  /**
   * Set ambient volume
   */
  public setAmbientVolume(volume: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, volume));
    for (const sound of this.ambientSounds) {
      sound.setVolume(this.getVolumeForRole('ambient'));
    }
  }

  /**
   * Toggle mute
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.updateAllVolumes();
    return this.isMuted;
  }

  /**
   * Set mute state
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.updateAllVolumes();
  }

  /**
   * Update volumes for all loaded sounds
   */
  private updateAllVolumes(): void {
    this.sounds.forEach(({ sound, role }) => {
      sound.setVolume(this.getVolumeForRole(role));
    });
  }

  /**
   * Load a sound dynamically (e.g., from a quest or event)
   */
  public async loadDynamicSound(
    name: string,
    filePath: string,
    role: AudioRole,
    options?: { loop?: boolean; autoplay?: boolean; volume?: number }
  ): Promise<Sound | null> {
    return new Promise((resolve) => {
      const url = filePath.startsWith('/') ? filePath : '/' + filePath;

      const sound = new Sound(
        name,
        url,
        this.scene,
        () => {
          this.sounds.set(name, { sound, role });
          resolve(sound);
        },
        {
          loop: options?.loop ?? false,
          autoplay: options?.autoplay ?? false,
          volume: options?.volume ?? this.getVolumeForRole(role)
        }
      );
    });
  }

  /**
   * Get audio state for UI
   */
  public getAudioState(): {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
    ambientVolume: number;
    isMuted: boolean;
    isPlaying: { ambient: boolean; music: boolean };
  } {
    return {
      masterVolume: this.masterVolume,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      ambientVolume: this.ambientVolume,
      isMuted: this.isMuted,
      isPlaying: {
        ambient: this.ambientSounds.some(s => s.isPlaying),
        music: this.musicTrack?.isPlaying ?? false
      }
    };
  }

  // -- VR Spatial Audio --

  /**
   * Enable VR spatial audio mode.
   * Starts per-frame position updates for sounds bound to meshes.
   */
  public enableVRSpatialAudio(): void {
    if (this.isVRMode) return;
    this.isVRMode = true;

    // Make all spatial sounds use HRTF-friendly settings
    this.sounds.forEach(({ sound }) => {
      if (sound.spatialSound) {
        sound.distanceModel = 'exponential';
        sound.rolloffFactor = 2;
        sound.maxDistance = 50;
      }
    });

    // Start per-frame position updates for bound sounds
    this.spatialUpdateObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.updateSpatialBindings();
    });

  }

  /**
   * Disable VR spatial audio mode.
   */
  public disableVRSpatialAudio(): void {
    if (!this.isVRMode) return;
    this.isVRMode = false;

    if (this.spatialUpdateObserver) {
      this.scene.onBeforeRenderObservable.remove(this.spatialUpdateObserver);
      this.spatialUpdateObserver = null;
    }

    // Dispose bound sounds
    for (const binding of this.spatialBindings) {
      binding.sound.dispose();
    }
    this.spatialBindings = [];

  }

  /**
   * Bind a sound to a mesh so it follows the mesh's position each frame.
   * Used for NPC voice audio, environment sounds attached to objects, etc.
   */
  public bindSoundToMesh(
    soundName: string,
    mesh: AbstractMesh,
    role: AudioRole = 'interact'
  ): Sound | null {
    const soundEntry = this.sounds.get(soundName);
    if (!soundEntry) return null;

    const sound = soundEntry.sound;
    sound.spatialSound = true;
    sound.distanceModel = 'exponential';
    sound.rolloffFactor = 2;
    sound.maxDistance = 50;
    sound.setPosition(mesh.position);

    this.spatialBindings.push({ sound, mesh, role });
    return sound;
  }

  /**
   * Create and bind a new spatial sound to a mesh.
   * Returns the Sound instance for further control.
   */
  public async createSpatialSound(
    name: string,
    filePath: string,
    mesh: AbstractMesh,
    role: AudioRole = 'interact',
    options?: { loop?: boolean; autoplay?: boolean; volume?: number }
  ): Promise<Sound | null> {
    const sound = await this.loadDynamicSound(name, filePath, role, options);
    if (!sound) return null;

    sound.spatialSound = true;
    sound.distanceModel = 'exponential';
    sound.rolloffFactor = 2;
    sound.maxDistance = 50;
    sound.setPosition(mesh.position);

    this.spatialBindings.push({ sound, mesh, role });
    return sound;
  }

  /**
   * Remove all spatial bindings for a mesh (e.g., when NPC is removed).
   */
  public unbindSoundFromMesh(mesh: AbstractMesh): void {
    this.spatialBindings = this.spatialBindings.filter(b => {
      if (b.mesh === mesh) {
        b.sound.dispose();
        return false;
      }
      return true;
    });
  }

  /**
   * Play a spatial one-shot at a mesh's current position.
   * Useful for combat hit sounds, NPC reactions, etc.
   */
  public playSpatialOneShot(role: AudioRole, mesh: AbstractMesh): void {
    this.playSoundOneShot(role, mesh.position);
  }

  /** Phase 3: Maximum distance for spatial sounds to play (chunk audio culling) */
  private static readonly AUDIO_CULL_DISTANCE = 80;

  /**
   * Phase 3: Set the listener position for distance-based audio culling.
   * Call this from the render loop with the player's position.
   */
  public setListenerPosition(position: Vector3): void {
    this._listenerPosition = position;
  }
  private _listenerPosition: Vector3 | null = null;

  /**
   * Per-frame update: sync sound positions to their bound meshes.
   * Phase 3: Also pauses sounds beyond AUDIO_CULL_DISTANCE.
   */
  private updateSpatialBindings(): void {
    const listener = this._listenerPosition;

    for (const binding of this.spatialBindings) {
      if (binding.mesh.isDisposed()) {
        binding.sound.dispose();
        continue;
      }
      binding.sound.setPosition(binding.mesh.position);

      // Phase 3: Distance-based audio culling
      if (listener && binding.sound.spatialSound) {
        const dist = Vector3.Distance(listener, binding.mesh.position);
        if (dist > AudioManager.AUDIO_CULL_DISTANCE) {
          if (binding.sound.isPlaying) binding.sound.pause();
        }
      }
    }

    // Clean up disposed meshes
    this.spatialBindings = this.spatialBindings.filter(
      b => !b.mesh.isDisposed()
    );
  }

  /**
   * Dispose of all audio resources
   */
  public dispose(): void {

    this.disableVRSpatialAudio();

    this.sounds.forEach(({ sound }) => {
      sound.dispose();
    });
    this.sounds.clear();
    this.ambientSounds = [];
    this.musicTrack = null;
    this.isInitialized = false;
  }
}
