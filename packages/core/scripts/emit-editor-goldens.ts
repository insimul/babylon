/**
 * CLI: regenerate the derived `expected*` values in
 * packages/core/conformance/editor/*.json from the editor core.
 * Run via `npm run editor-goldens` (vite-node). Idempotent — the corpus runner
 * (src/conformance/__tests__/editor-corpus.test.ts) fails if the committed files
 * differ from what this produces.
 *
 * Only the DERIVED halves are rewritten: the placement manifest, its unbound
 * report and its non-taxonomy key list for `scene-placement.json`, and the
 * canonical report string + mutator call order for `reimport.json`. The inputs
 * (the golden IR, the binding tiers, the old/new manifests) and the hand-written
 * per-class id lists are authored, never generated — otherwise the corpus would
 * only prove the code agrees with itself.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BindingResolver, parseBindingSources, validateArchetypeKeys } from '../src/editor/binding';
import {
  collectUsedArchetypes,
  computePlacement,
  parseManifestNodes,
  quantizeNode,
} from '../src/editor/scene';
import { applyReimport, serializeDiffReport } from '../src/editor/reimport';
import { RecordingSceneMutator } from '../src/editor/host-contracts';

const here = dirname(fileURLToPath(import.meta.url));
const editorDir = join(here, '..', 'conformance', 'editor');

function load(file: string): any {
  return JSON.parse(readFileSync(join(editorDir, file), 'utf8'));
}

function save(file: string, data: unknown): void {
  writeFileSync(join(editorDir, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`emitted ${file}`);
}

function buildResolver(sources: unknown): BindingResolver {
  const parsed = parseBindingSources(sources);
  if (!parsed.ok) throw new Error(parsed.error);
  const resolver = new BindingResolver();
  for (const source of parsed.value) resolver.addSource(source);
  return resolver.sortSourcesByPriority();
}

// ── scene-placement.json ────────────────────────────────────────────────────
{
  const data = load('scene-placement.json');
  const resolver = buildResolver(data.sources);
  const result = computePlacement(data.ir, resolver);
  if (!result.ok) throw new Error(`placement failed: ${result.error}`);

  const used = collectUsedArchetypes(result.nodes);
  data.expected = {
    manifestVersion: 1,
    seed: result.seed,
    nodeCount: result.nodes.length,
    nodes: result.nodes.map(quantizeNode),
  };
  data.expectedUnbound = resolver.collectUnbound(used);
  data.expectedNonTaxonomyKeys = validateArchetypeKeys(used);
  save('scene-placement.json', data);
}

// ── reimport.json ───────────────────────────────────────────────────────────
{
  const data = load('reimport.json');
  const oldNodes = parseManifestNodes(data.oldManifest);
  const newNodes = parseManifestNodes(data.newManifest);
  if (!oldNodes.ok) throw new Error(`old manifest: ${oldNodes.error}`);
  if (!newNodes.ok) throw new Error(`new manifest: ${newNodes.error}`);

  const mutator = new RecordingSceneMutator();
  const report = applyReimport(oldNodes.value, newNodes.value, mutator);
  data.expectedCanonicalReport = serializeDiffReport(report);
  data.expectedMutatorCalls = mutator.calls;
  save('reimport.json', data);
}
