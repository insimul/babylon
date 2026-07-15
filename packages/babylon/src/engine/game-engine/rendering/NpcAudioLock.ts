/**
 * NpcAudioLock — shared one-at-a-time audio gating for NPC speech.
 * Only one NPC audio source (greeting or ambient conversation) plays at a time.
 */
export class NpcAudioLock {
  private _owner: string | null = null;

  /** Acquire the lock. Returns true only if not currently locked. */
  acquire(owner: string): boolean {
    if (this._owner !== null) {
      return false;
    }
    this._owner = owner;
    return true;
  }

  /** Release the lock only if the caller matches the current owner. */
  release(owner: string): void {
    if (this._owner === owner) {
      this._owner = null;
    }
  }

  /** Returns true if the lock is currently held. */
  isLocked(): boolean {
    return this._owner !== null;
  }

  /** Unconditionally releases the lock (for player-initiated chat taking priority). */
  forceRelease(): void {
    this._owner = null;
  }

  /** Returns the current owner string, or null if unlocked. */
  get currentOwner(): string | null {
    return this._owner;
  }
}
