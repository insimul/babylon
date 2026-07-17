/**
 * US-XC3 — cross-runtime quest / radiant parity (TS side).
 *
 * The Unreal runtime ports quest hydration (quest-hydrator.ts) and a
 * deterministic radiant tick into portable C++ (FInsimulQuestSystem,
 * packages/unreal/.../Portable/InsimulQuestSystem). This drift guard is the TS
 * half of the cross-check: it recomputes the golden `expected` values from the
 * TS semantics authority (via quest-golden-manifest.ts, the same module the
 * `npm run quest-goldens` emitter uses) and asserts they equal the committed
 * corpus. The C++ host harness (tools/verify-unreal/test_quest_system.cpp)
 * independently reproduces the same `expected`, so the two runtimes can never
 * silently disagree on hydrated fields or radiant facts.
 *
 * After changing the hydrator, the radiant algorithm, or a case: run
 * `npm run quest-goldens`, commit the regenerated JSON, and rebuild the C++
 * harness.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  canonicalFactList,
  canonicalizeProjection,
  computeHydrationExpected,
  radiantTick,
  type HydrationInput,
  type RadiantCaseParams,
  type RadiantFact,
} from '../../../scripts/quest-golden-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const questsDir = join(here, '..', '..', '..', 'conformance', 'quests');

interface HydrationCase {
  name: string;
  input: HydrationInput;
  expected: Record<string, unknown>;
}

interface RadiantCase extends RadiantCaseParams {
  name: string;
  expected: RadiantFact[];
}

function load<T>(file: string): { cases: T[] } {
  return JSON.parse(readFileSync(join(questsDir, file), 'utf8')) as { cases: T[] };
}

describe('quest hydration goldens are anchored to the TS hydrator', () => {
  const { cases } = load<HydrationCase>('hydration-cases.json');

  it('ships at least one case', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    '%s: committed expected == hydrateQuestFromProlog projection',
    (_name, c) => {
      const recomputed = computeHydrationExpected(c.input);
      // Compare via the canonical serializer (the C++ CanonicalJson twin), so a
      // key-order or number-format difference would fail exactly as it would on
      // the C++ side.
      expect(canonicalizeProjection(recomputed)).toBe(canonicalizeProjection(c.expected));
    },
  );
});

describe('radiant-tick goldens are anchored to the deterministic distributor', () => {
  const { cases } = load<RadiantCase>('radiant-cases.json');

  it('ships at least one case', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    '%s: committed facts == radiantTick output (order-independent)',
    (_name, c) => {
      const recomputed = radiantTick({
        quests: c.quests,
        maxOffering: c.maxOffering,
        ticks: c.ticks,
      });
      expect(canonicalFactList(recomputed)).toBe(canonicalFactList(c.expected));
    },
  );
});
