/**
 * Default-UI panel registry view-model (US-GU1).
 *
 * The engine-agnostic, UI-free heart of the default-runtime UI registry: it maps a
 * stable panel KEY to an opaque scene reference, with a creator OVERRIDE layer that
 * always wins over the shipped default, plus missing-panel diagnostics. Every
 * native engine's registry (the Godot `insimul_ui_registry.gd`, and the
 * Unity/Unreal equivalents) mirrors this contract; the shared behavior cases live
 * in `packages/core/conformance/ui/registry-cases.json` so every engine runs the
 * SAME cases. Scene refs are opaque strings here (a `res://` path in Godot, a
 * prefab/widget id elsewhere), so the registry stays testable as pure data.
 */

/** A missing-panel / unloadable-scene diagnostic surfaced to the creator. */
export interface UiDiagnostic {
  readonly kind: 'missing_panel' | 'missing_scene' | 'bad_scene';
  readonly key: string;
  readonly message: string;
}

/** A map of panel key -> opaque scene reference. */
export type PanelMap = Readonly<Record<string, string>>;

/**
 * Panel registry with a default layer, a creator-override layer (override wins),
 * and accumulated diagnostics. Pure data — resolution never touches a filesystem.
 */
export class UiRegistry {
  private readonly defaults: Map<string, string>;
  private readonly overrides = new Map<string, string>();
  private readonly diags: UiDiagnostic[] = [];

  constructor(defaults: PanelMap = {}) {
    this.defaults = new Map(Object.entries(defaults));
  }

  /** Apply a creator-override map (key -> scene ref). Later calls win. */
  applyOverrides(overrides: PanelMap): void {
    for (const [key, ref] of Object.entries(overrides)) {
      this.overrides.set(key, ref);
    }
  }

  /** Register / override a single panel's scene ref. */
  register(key: string, sceneRef: string): void {
    this.overrides.set(key, sceneRef);
  }

  /** True if `key` resolves to a default or an override. */
  has(key: string): boolean {
    return this.overrides.has(key) || this.defaults.has(key);
  }

  /** True if `key` is currently served by a creator override, not the default. */
  isOverridden(key: string): boolean {
    return this.overrides.has(key);
  }

  /**
   * The scene reference for `key` (override wins over default). Returns `''` and
   * records a `missing_panel` diagnostic when the key is unknown.
   */
  sceneRef(key: string): string {
    const override = this.overrides.get(key);
    if (override !== undefined) return override;
    const fallback = this.defaults.get(key);
    if (fallback !== undefined) return fallback;
    this.diags.push({
      kind: 'missing_panel',
      key,
      message: `no panel registered for key '${key}'`,
    });
    return '';
  }

  /** All panel keys resolvable (defaults + overrides), sorted. */
  keys(): string[] {
    return [...new Set([...this.defaults.keys(), ...this.overrides.keys()])].sort();
  }

  /** Diagnostics accumulated by `sceneRef` — a "why is this panel blank" log. */
  diagnostics(): readonly UiDiagnostic[] {
    return this.diags;
  }

  hasDiagnostics(): boolean {
    return this.diags.length > 0;
  }

  clearDiagnostics(): void {
    this.diags.length = 0;
  }
}
