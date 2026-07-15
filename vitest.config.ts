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
    // These *.test.ts files are legacy tsx harnesses (run via `npx tsx <file>`, no
    // describe/it), NOT vitest suites — excluding them keeps `vitest run` green.
    // tau-engine.test.ts moved with tau-engine into packages/core/src/prolog (US-CE2);
    // it is not matched by `include` above, but stays listed here to document intent.
    // Migrate one to vitest (import describe/it/expect from 'vitest') to opt it in.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/core/src/prolog/tau-engine.test.ts',
      'shared/game-engine/logic/VisualVocabularyDetector.test.ts',
      'shared/game-engine/logic/VocabularyCollectionSystem.test.ts',
      'shared/game-engine/logic/SaveConflictResolver.test.ts',
    ],
  },
});
