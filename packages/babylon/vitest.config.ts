import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Scoped vitest config for @insimul/babylon. The verify gate (scripts/ralph/run-all.sh)
// runs `npm test` here per-package. Without a local config, `vitest run` walks up to the
// repo-root vitest.config.ts, whose include globs are rooted at the repo and match
// nothing from this package's cwd — vitest then exits 1 ("No test files found").
//
// The self-referential `@insimul/babylon` alias lets the exports-map guard import the
// package's own subpaths (@insimul/babylon, @insimul/babylon/conversation) exactly as a
// consumer would — the package's exports map has no node_modules symlink to resolve
// through in this workspace, so the alias mirrors it. Mapping to the src DIRECTORY (not
// src/index.ts) makes both the root import and every subpath resolve to its index.ts.
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@insimul/babylon': r('src'),
      // The exports-map guard also asserts the legacy @insimul/typescript shims still
      // point at the moved SDK; alias it so the scoped run resolves without a
      // node_modules symlink (mirrors the root vitest.config.ts).
      '@insimul/typescript': r('../typescript/src'),
      // US-BC2: the save/data/loading suites (SaveFileDataSource-delta,
      // offline-migration, optimization/*) moved here into src/data. They pull
      // @shared/* (save-file, game-engine, prolog, quests, …), @insimul/core, and the
      // legacy @insimul/babylon-game shims — alias all three at the repo root so the
      // scoped run resolves exactly as the root vitest.config.ts does.
      '@shared': r('../../shared'),
      '@insimul/core': r('../core/src'),
      '@insimul/babylon-game': r('../babylon-game/src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
