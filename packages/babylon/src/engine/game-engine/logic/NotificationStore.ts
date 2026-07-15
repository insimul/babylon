/**
 * NotificationStore — centralised in-memory notification log.
 *
 * Every subsystem that previously showed a toast now pushes here instead.
 * The collapsed HUD panel shows the most-recent items; the Game Menu
 * "Notifications" tab shows the full history.
 */

export interface GameNotification {
  id: number;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  timestamp: number; // Date.now()
  /** Optional category for filtering in the full Notifications tab */
  category?: "quest" | "system" | "building" | "npc" | "item" | "skill" | "general";
}

type Listener = () => void;

class NotificationStoreImpl {
  private notifications: GameNotification[] = [];
  private idCounter = 0;
  private listeners: Set<Listener> = new Set();

  /** Maximum notifications kept in memory */
  private static readonly MAX_ITEMS = 200;

  /** Push a new notification and notify listeners. */
  push(opts: Omit<GameNotification, "id" | "timestamp">): GameNotification {
    const n: GameNotification = {
      ...opts,
      id: this.idCounter++,
      timestamp: Date.now(),
    };
    this.notifications.push(n);

    // Evict oldest when exceeding cap
    if (this.notifications.length > NotificationStoreImpl.MAX_ITEMS) {
      this.notifications.splice(0, this.notifications.length - NotificationStoreImpl.MAX_ITEMS);
    }

    this.emit();
    return n;
  }

  /** Return the most recent `count` notifications (newest-first). */
  recent(count: number): GameNotification[] {
    const start = Math.max(0, this.notifications.length - count);
    return this.notifications.slice(start).reverse();
  }

  /** Return all notifications (newest-first). */
  all(): GameNotification[] {
    return [...this.notifications].reverse();
  }

  /** Number of stored notifications. */
  get length(): number {
    return this.notifications.length;
  }

  /** Clear all notifications. */
  clear(): void {
    this.notifications = [];
    this.emit();
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

/** Singleton instance shared across the game. */
export const NotificationStore = new NotificationStoreImpl();
