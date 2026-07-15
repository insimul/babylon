import { defineConfig } from 'vitest/config';

// Scoped vitest config for @insimul/typescript. The verify gate (scripts/ralph/run-all.sh)
// runs `npm test` here per-package. Without a local config, `vitest run` walks up to the
// repo-root vitest.config.ts, whose include globs point at shared/ and packages/babylon-game
// and match nothing from this package's cwd — vitest then exits 1 ("No test files found").
// This config scopes the run to this package's own specs and passes cleanly until any exist.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
