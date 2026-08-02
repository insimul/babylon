/**
 * US-2 of `101-editor-plugin-core` — the editor conformance corpus runner.
 *
 * `packages/core/conformance/` had **no editor area**, which is why binding,
 * placement and re-import had already drifted across the three engine plugins
 * with nothing to catch it (`docs/editor-plugin-core-analysis.md` §5). This is
 * that gate: three data-only fixtures a future C harness or a native plugin can
 * read verbatim, and the TS runner that proves this implementation satisfies
 * them.
 *
 *  - `binding-resolver.json` — the resolution chain, including the settled
 *    tie-break (§5.4). Its default sources + first nine cases are the shared
 *    resolver matrix Unreal and Godot already vendor.
 *  - `scene-placement.json` — the placement math, whose expected manifest is
 *    numerically identical to the goldens Unity/Unreal/Godot each commit, plus
 *    the settled serialized shape (§5.1).
 *  - `reimport.json` — the five-way diff policy, whose canonical report is
 *    byte-identical to the `golden-diff-report.json` all three legs commit, plus
 *    the apply order over a host mutator.
 *
 * Format documented in `conformance/README.md` (§ "Editor fixture format").
 * Regenerate the derived `expected*` values with `npm run editor-goldens`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BindingResolver,
  parseBindingSources,
  validateArchetypeKeys,
  type BindingSource,
} from '../../editor/binding';
import {
  collectUsedArchetypes,
  computePlacement,
  parseManifestNodes,
  quantizeNode,
  serializePlacementManifest,
} from '../../editor/scene';
import {
  applyReimport,
  computeReimportDiff,
  serializeDiffReport,
  type DiffReport,
} from '../../editor/reimport';
import { RecordingSceneMutator } from '../../editor/host-contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = join(HERE, '..', '..', '..', 'conformance', 'editor');

function load(file: string): any {
  return JSON.parse(readFileSync(join(EDITOR_DIR, file), 'utf8'));
}

function buildResolver(sources: unknown): BindingResolver {
  const parsed = parseBindingSources(sources);
  expect(parsed.ok, parsed.ok ? '' : (parsed as { error: string }).error).toBe(true);
  const resolver = new BindingResolver();
  for (const source of (parsed as { value: BindingSource[] }).value) resolver.addSource(source);
  return resolver.sortSourcesByPriority();
}

// ─── binding-resolver.json ───────────────────────────────────────────────────

describe('conformance/editor/binding-resolver.json', () => {
  const corpus = load('binding-resolver.json');

  it('has the cases it claims', () => {
    expect(corpus.area).toBe('editor-binding');
    // Guards the guard: an empty corpus would make every it.each below vacuous.
    expect(corpus.cases.length).toBeGreaterThanOrEqual(15);
    expect(corpus.unboundCases.length).toBeGreaterThanOrEqual(2);
  });

  it.each(corpus.cases.map((c: any) => [c.name, c]))('%s', (_name: string, testCase: any) => {
    const resolver = buildResolver(testCase.sources ?? corpus.sources);
    const result = resolver.resolve(testCase.query);

    if (testCase.expect === null) {
      expect(result.resolved).toBe(false);
      expect(result.entry).toBeNull();
      return;
    }

    expect(result.resolved).toBe(true);
    expect(result.sourceName).toBe(testCase.expect.source);
    expect(result.key).toBe(testCase.expect.key);
    if (testCase.expect.assetRef !== undefined) {
      expect(result.entry?.scene ?? result.entry?.mesh ?? '').toBe(testCase.expect.assetRef);
    }
  });

  it.each(corpus.unboundCases.map((c: any) => [c.name, c]))(
    'unbound: %s',
    (_name: string, testCase: any) => {
      const resolver = buildResolver(testCase.sources ?? corpus.sources);
      expect(resolver.collectUnbound(testCase.usedKeys)).toEqual(testCase.expect);
    },
  );
});

// ─── scene-placement.json ────────────────────────────────────────────────────

describe('conformance/editor/scene-placement.json', () => {
  const corpus = load('scene-placement.json');
  const resolver = buildResolver(corpus.sources);
  const result = computePlacement(corpus.ir, resolver);

  it('computes the golden placement manifest', () => {
    expect(result.ok, result.error).toBe(true);
    expect(result.seed).toBe(corpus.expected.seed);
    expect(result.nodes.length).toBe(corpus.expected.nodeCount);
    expect(result.nodes.map(quantizeNode)).toEqual(corpus.expected.nodes);
  });

  it('serializes canonically and stays stable across runs', () => {
    const once = serializePlacementManifest(result);
    const twice = serializePlacementManifest(computePlacement(corpus.ir, resolver));
    expect(once).toBe(twice);
    // The canonical form is what the goldens are compared as: key-sorted JSON of
    // exactly the expected document.
    expect(JSON.parse(once)).toEqual(corpus.expected);
  });

  it('round-trips through the manifest parser', () => {
    const parsed = parseManifestNodes(JSON.parse(serializePlacementManifest(result)));
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    expect(parsed.ok && parsed.value).toEqual(corpus.expected.nodes);
  });

  it('binds every archetype it emits, and emits only taxonomy-conformant keys', () => {
    const used = collectUsedArchetypes(result.nodes);
    expect(used.length).toBeGreaterThan(0);
    expect(resolver.collectUnbound(used)).toEqual(corpus.expectedUnbound);
    // §5.3: Godot's `road` / `interior.<role>` keys would show up here.
    expect(validateArchetypeKeys(used)).toEqual(corpus.expectedNonTaxonomyKeys);
  });
});

// ─── reimport.json ───────────────────────────────────────────────────────────

describe('conformance/editor/reimport.json', () => {
  const corpus = load('reimport.json');

  const parseNodes = (manifest: unknown) => {
    const parsed = parseManifestNodes(manifest);
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    return (parsed as { value: ReturnType<typeof quantizeNode>[] }).value;
  };

  const oldNodes = parseNodes(corpus.oldManifest);
  const newNodes = parseNodes(corpus.newManifest);

  it('classifies every id into the five-way report', () => {
    const report = computeReimportDiff(oldNodes, newNodes);
    expect(report).toEqual(corpus.expectedReport as DiffReport);
  });

  it('serializes the canonical report the three engines commit', () => {
    expect(serializeDiffReport(computeReimportDiff(oldNodes, newNodes))).toBe(
      corpus.expectedCanonicalReport,
    );
  });

  it('drives the host mutator in canonical order — and only for mutating classes', () => {
    const mutator = new RecordingSceneMutator();
    applyReimport(oldNodes, newNodes, mutator);
    expect(mutator.calls).toEqual(corpus.expectedMutatorCalls);
    // The hand edits (skipped) and the equivalent node (unchanged) are never
    // touched: nothing in the call list mentions them.
    for (const untouched of [...corpus.expectedReport.skipped, ...corpus.expectedReport.unchanged]) {
      expect(mutator.calls.join('|')).not.toContain(untouched);
    }
  });

  it('is a pure dry run with no mutator', () => {
    expect(applyReimport(oldNodes, newNodes)).toEqual(corpus.expectedReport as DiffReport);
  });
});
