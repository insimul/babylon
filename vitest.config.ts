import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Root vitest config for insimul-runtime (`npm test`). Runs the import-hygiene guard
// (US-RS5) plus the package vitest suites. The `@shared/* -> ./shared/*` and
// `@insimul/*` aliases mirror tsconfig.check.json so tests resolve exactly as the
// standalone typecheck does.
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@shared': r('shared'),
      '@insimul/core': r('packages/core/src'),
      '@insimul/typescript': r('packages/typescript/src/index.ts'),
      '@insimul/babylon-game': r('packages/babylon-game/src'),
    },
  },
  test: {
    include: [
      // The import-hygiene guard.
      'shared/__tests__/import-hygiene.test.ts',
      // Per-package vitest suites (currently only babylon-game ships runnable specs).
      'packages/babylon-game/src/**/*.test.{ts,tsx}',
    ],
    // The four shared/*.test.ts files under shared/prolog and shared/game-engine/logic
    // are legacy tsx harnesses (run via `npx tsx <file>`, no describe/it), NOT vitest
    // suites — excluding them keeps `vitest run` green. Migrate them to vitest to opt in.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'shared/prolog/tau-engine.test.ts',
      'shared/game-engine/logic/VisualVocabularyDetector.test.ts',
      'shared/game-engine/logic/VocabularyCollectionSystem.test.ts',
      'shared/game-engine/logic/SaveConflictResolver.test.ts',
    ],
  },
});
