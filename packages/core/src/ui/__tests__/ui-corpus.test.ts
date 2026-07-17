/**
 * US-GU1 — default-UI shared-corpus runner.
 *
 * Executes the engine-neutral UI cases under
 * `packages/core/conformance/ui/{registry-cases,loading-phases}.json` against the
 * TS view-models (`UiRegistry`, `LoadingScreenModel`) that the Godot
 * `insimul_ui_registry.gd` / `loading_screen_model.gd` mirror. These same JSON
 * files are what the Godot headless test (`ui_registry_test.gd`) runs, so the two
 * legs can never disagree on the contract. Also validates the shared token set
 * (`theme-tokens.json`) is well-formed — it is the source of truth every engine's
 * theme maps.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { UiRegistry } from '../ui-registry';
import { LoadingScreenModel, type LoadingPhase } from '../loading-screen-model';
import { Notifications } from '../notifications';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'ui');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as T;
}

interface RegistryCase {
  name: string;
  defaults: Record<string, string>;
  overrides: Record<string, string>;
  resolve: string;
  expected_scene: string;
  expected_missing: boolean;
  expected_overridden: boolean;
}

interface LoadingStep {
  advance: string;
  expected_progress: number;
  expected_label: string;
  expected_complete: boolean;
}

interface LoadingCase {
  name: string;
  steps: LoadingStep[];
}

describe('ui registry — shared cases', () => {
  const doc = load<{ panel_keys: string[]; cases: RegistryCase[] }>('registry-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const reg = new UiRegistry(c.defaults);
      reg.applyOverrides(c.overrides);
      expect(reg.sceneRef(c.resolve)).toBe(c.expected_scene);
      expect(reg.has(c.resolve)).toBe(!c.expected_missing);
      expect(reg.isOverridden(c.resolve)).toBe(c.expected_overridden);
      // A missing key must produce a diagnostic; a hit must not.
      expect(reg.hasDiagnostics()).toBe(c.expected_missing);
    });
  }

  it('exposes the full canonical panel-key list', () => {
    expect(doc.panel_keys).toContain('quest_journal');
    expect(doc.panel_keys).toContain('dialogue');
    expect(doc.panel_keys.length).toBeGreaterThanOrEqual(12);
  });
});

describe('loading-screen model — shared cases', () => {
  const doc = load<{ phases: LoadingPhase[]; tips: string[]; cases: LoadingCase[] }>('loading-phases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const model = new LoadingScreenModel(doc.phases, doc.tips);
      for (const step of c.steps) {
        model.advance(step.advance);
        expect(model.progress()).toBeCloseTo(step.expected_progress, 5);
        expect(model.label()).toBe(step.expected_label);
        expect(model.isComplete()).toBe(step.expected_complete);
      }
    });
  }
});

describe('notifications — the pattern-proof pair', () => {
  it('pushes, expires by lifetime, and dismisses by id', () => {
    const notes = new Notifications();
    const a = notes.push('hello', 'info', 3);
    notes.push('saved', 'success', 1);
    expect(notes.count()).toBe(2);
    // tick past the shorter lifetime — one expires.
    expect(notes.tick(1.5)).toBe(true);
    expect(notes.count()).toBe(1);
    // dismiss the remaining by id.
    expect(notes.dismiss(a)).toBe(true);
    expect(notes.count()).toBe(0);
  });
});

describe('theme tokens — shared source of truth', () => {
  const tokens = load<{
    colors: Record<string, string>;
    spacing: Record<string, number>;
    radius: Record<string, number>;
    font_size: Record<string, number>;
  }>('theme-tokens.json');

  it('defines the semantic color roles the theme binds', () => {
    for (const role of ['background', 'surface', 'text_primary', 'accent', 'danger']) {
      expect(tokens.colors[role]).toMatch(/^#[0-9a-f]{6,8}$/i);
    }
  });

  it('defines numeric spacing / radius / font-size scales', () => {
    expect(tokens.spacing.md).toBeGreaterThan(0);
    expect(tokens.radius.md).toBeGreaterThan(0);
    expect(tokens.font_size.body).toBeGreaterThan(0);
  });
});
