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
      // Maps to the src DIRECTORY so both `@insimul/babylon` and every subpath
      // (@insimul/babylon/conversation, …) resolve to their index.ts, mirroring the
      // package's exports map. `@insimul/babylon-game` stays a distinct alias — the
      // matcher only rewrites on an exact hit or a following `/`, so it is unaffected.
      '@insimul/babylon': r('packages/babylon/src'),
      '@insimul/babylon-game': r('packages/babylon-game/src'),
    },
  },
  test: {
    include: [
      // The import-hygiene guard.
      'shared/__tests__/import-hygiene.test.ts',
      // The release-workflow guard (US-PB3): the publish path stays guarded.
      'shared/__tests__/release-workflow.test.ts',
      // Per-package vitest suites.
      'packages/babylon/src/**/*.test.{ts,tsx}',
      'packages/babylon-game/src/**/*.test.{ts,tsx}',
      // @insimul/core vitest suites (US-CE4 schema/drift tests, etc.). The legacy
      // tau-engine.test.ts harness under packages/core/src/prolog is excluded below.
      'packages/core/src/**/*.test.ts',
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
      // Legacy tsx harnesses that moved with the engine (US-BC3: shared/game-engine ->
      // packages/babylon/src/engine/game-engine). They import via a broken `/game-engine/...`
      // absolute path and have no describe/it — keep them excluded from `vitest run`.
      'packages/babylon/src/engine/game-engine/logic/VisualVocabularyDetector.test.ts',
      'packages/babylon/src/engine/game-engine/logic/VocabularyCollectionSystem.test.ts',
      'packages/babylon/src/engine/game-engine/logic/SaveConflictResolver.test.ts',
    ],
  },
});
