/**
 * Transient-notification (toast) view-model (US-GU1).
 *
 * A pure, timing-driven queue paired with the loading screen as the US-GU1
 * "pattern-proof pair": callers `push()` notifications with a kind (mapped to a
 * token color) and an optional lifetime; `tick(delta)` ages them out. Every native
 * engine's notification center (the Godot `insimul_notifications.gd`, …) mirrors
 * this contract. UI-free, so the logic is testable headless.
 */

export type NotificationKind = 'info' | 'success' | 'warning' | 'danger';

/** Kind -> token color name (see the shared theme tokens). */
export const KIND_COLOR: Readonly<Record<NotificationKind, string>> = {
  info: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/** Default seconds a notification stays visible before `tick` expires it. */
export const DEFAULT_NOTIFICATION_LIFETIME = 4;

export interface NotificationItem {
  readonly id: number;
  readonly text: string;
  readonly kind: NotificationKind;
  remaining: number;
  readonly color: string;
}

export class Notifications {
  private items: NotificationItem[] = [];
  private nextId = 1;

  /** Enqueue a notification. Returns its id (so a caller can `dismiss` it early). */
  push(text: string, kind: NotificationKind = 'info', lifetime = DEFAULT_NOTIFICATION_LIFETIME): number {
    const id = this.nextId++;
    this.items.push({ id, text, kind, remaining: lifetime, color: KIND_COLOR[kind] });
    return id;
  }

  /**
   * Age every notification by `delta` seconds, dropping expired ones. Returns
   * true if the visible set changed (so a view knows to repaint).
   */
  tick(delta: number): boolean {
    if (this.items.length === 0) return false;
    const before = this.items.length;
    this.items = this.items.filter((item) => {
      item.remaining -= delta;
      return item.remaining > 0;
    });
    return this.items.length !== before;
  }

  /** Dismiss a notification by id early. Returns true if one was removed. */
  dismiss(id: number): boolean {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return this.items.length !== before;
  }

  /** Currently visible notifications (oldest first). */
  visible(): readonly NotificationItem[] {
    return this.items;
  }

  count(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
