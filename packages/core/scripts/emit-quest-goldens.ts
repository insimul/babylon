/**
 * CLI: regenerate the `expected` values in packages/core/conformance/quests/
 * *.json from the TS quest semantics (quest-golden-manifest.ts).
 * Run via `npm run quest-goldens` (vite-node). Idempotent — the drift-guard
 * test fails if the committed files differ from what this produces.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeHydrationExpected,
  radiantTick,
  type HydrationInput,
  type RadiantCaseParams,
} from './quest-golden-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const questsDir = join(here, '..', 'conformance', 'quests');

function emit(file: string, fill: (data: any) => void): void {
  const path = join(questsDir, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  fill(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`emitted ${file} (${data.cases.length} cases)`);
}

emit('hydration-cases.json', (data) => {
  for (const c of data.cases) {
    c.expected = computeHydrationExpected(c.input as HydrationInput);
  }
});

emit('radiant-cases.json', (data) => {
  for (const c of data.cases) {
    const params: RadiantCaseParams = {
      quests: c.quests,
      maxOffering: c.maxOffering,
      ticks: c.ticks,
    };
    c.expected = radiantTick(params);
  }
});
