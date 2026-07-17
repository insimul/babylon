/**
 * Pause / ESC-menu tab-gating view-model (US-GU3).
 *
 * The engine-agnostic heart of the unified pause menu: an ordered set of tabs, each
 * optionally GATED by the feature modules the active genre bundle enabled (see
 * `feature-modules/genre-bundles`). A tab with no `requires` is always shown; a tab
 * that requires module(s) is shown only when every required module is enabled. This
 * is what "module-bundle-gated tabs" means — an RPG bundle hides the language
 * Vocabulary/Analytics tabs, a language-learning bundle shows them.
 *
 * The Godot `pause_menu_model.gd` mirrors this contract; the shared cases live in
 * `packages/core/conformance/ui/pause-menu-cases.json`. The Control (`pause_menu.gd`)
 * owns `get_tree().paused` + input; the visible-tab / active-tab logic lives here.
 */

import type { ModuleId } from '../feature-modules/types';

export interface MenuTabDef {
  readonly key: string;
  readonly label: string;
  /** Module(s) that must ALL be enabled for this tab to show. Omit = always shown. */
  readonly requires?: ModuleId | readonly ModuleId[];
}

/**
 * Default pause-menu tabs. Core tabs (resume/journal/inventory/map/settings/save)
 * are ungated; the learning/progression tabs gate on their module.
 */
export const DEFAULT_MENU_TABS: readonly MenuTabDef[] = [
  { key: 'resume', label: 'Resume' },
  { key: 'journal', label: 'Journal' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'map', label: 'Map' },
  { key: 'character', label: 'Character', requires: 'proficiency' },
  { key: 'vocabulary', label: 'Vocabulary', requires: 'knowledge-acquisition' },
  { key: 'skills', label: 'Skills', requires: 'skill-tree' },
  { key: 'analytics', label: 'Analytics', requires: 'conversation-analytics' },
  { key: 'assessment', label: 'Assessment', requires: 'assessment' },
  { key: 'settings', label: 'Settings' },
  { key: 'save', label: 'Save / Load' },
];

function required(tab: MenuTabDef): readonly ModuleId[] {
  if (!tab.requires) return [];
  return Array.isArray(tab.requires) ? tab.requires : [tab.requires as ModuleId];
}

export class PauseMenuModel {
  private readonly tabs: readonly MenuTabDef[];
  private readonly enabled: Set<string>;
  private open = false;
  private active = '';

  constructor(
    enabledModules: Iterable<string> = [],
    tabs: readonly MenuTabDef[] = DEFAULT_MENU_TABS,
  ) {
    this.enabled = new Set(enabledModules);
    this.tabs = tabs.length > 0 ? tabs : DEFAULT_MENU_TABS;
  }

  /** True when every module a tab requires is enabled (ungated tabs always pass). */
  private gated(tab: MenuTabDef): boolean {
    return required(tab).every((m) => this.enabled.has(m));
  }

  /** Tabs visible under the current module set, in declaration order. */
  visibleTabs(): MenuTabDef[] {
    return this.tabs.filter((t) => this.gated(t)).map((t) => ({ ...t }));
  }

  visibleKeys(): string[] {
    return this.tabs.filter((t) => this.gated(t)).map((t) => t.key);
  }

  isVisible(key: string): boolean {
    const tab = this.tabs.find((t) => t.key === key);
    return !!tab && this.gated(tab);
  }

  // ── Open / active-tab state ───────────────────────────────────────────────

  /** Open the menu, optionally to a tab (falls back to the first visible tab). */
  openMenu(tab?: string): void {
    this.open = true;
    if (tab && this.isVisible(tab)) {
      this.active = tab;
    } else if (!this.isVisible(this.active)) {
      this.active = this.visibleKeys()[0] ?? '';
    }
  }

  closeMenu(): void {
    this.open = false;
  }

  toggle(): void {
    if (this.open) this.closeMenu();
    else this.openMenu();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Switch tabs. Rejected (returns false) for a hidden/unknown tab. */
  setActive(key: string): boolean {
    if (!this.isVisible(key)) return false;
    this.active = key;
    return true;
  }

  activeTab(): string {
    return this.active;
  }
}
