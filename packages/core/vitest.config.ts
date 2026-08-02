import { defineConfig } from 'vitest/config';

// Scoped vitest config for @insimul/core. The verify gate (scripts/ralph/run-all.sh)
// runs `npm test` here per-package. Without a local config, `vitest run` walks up to the
// repo-root vitest.config.ts, whose include globs are rooted at the repo (shared/,
// packages/...) and match nothing from this package's cwd — vitest then exits 1
// ("No test files found"). This config scopes the run to this package's own specs.
// All core tests use relative imports (core is self-contained by design — US-CE6
// dependency-direction guard), so no @shared/@insimul aliases are needed here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Legacy tsx harnesses (run via `npx tsx <file>`, no describe/it), not vitest
    // suites — mirrors the root vitest.config.ts exclusions. The three
    // game-engine/logic ones arrived with the US-3 runtime move
    // (93-runtime-logic-to-core); they have a broken `/game-engine/...` absolute
    // import, so `vitest run` fails on collection without this.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/prolog/tau-engine.test.ts',
      'src/game-engine/logic/VisualVocabularyDetector.test.ts',
      'src/game-engine/logic/VocabularyCollectionSystem.test.ts',
      'src/game-engine/logic/SaveConflictResolver.test.ts',
    ],
  },
});
