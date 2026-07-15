import { defineConfig } from 'vite';

// Export-shell Vite config for an exported Insimul game.
//
// NEW CONSOLIDATED LAYOUT (babylon-consolidation, US-BC4)
// ------------------------------------------------------
// After US-BC1..BC3 all web/Babylon runtime source lives in ONE package,
// `@insimul/babylon` (`packages/babylon/src/{conversation,data,engine}`). The old
// import roots (`@shared/game-engine/*`, `@insimul/typescript`, `@insimul/babylon-game`)
// are re-export shims whose relative targets ESCAPE their own directory into
// `packages/babylon/src/...`, so a game that vendors only the old dirs can no longer
// resolve them. The export therefore vendors the consolidated package at
// `src/insimul-babylon` and aliases every moved root DIRECTLY at it (PRD US-BC4 option b),
// bypassing the shims entirely.
//
// The platform export pipeline must vendor:
//   packages/babylon/src       -> <game>/src/insimul-babylon   (NEW — the follow-up diff)
//   packages/core/src          -> <game>/src/insimul-core      (from core-extraction)
//   shared/                    -> <game>/src/shared            (straggler domain layer)
// See insimul-runtime scripts/ralph/progress.txt (US-BC4) for the exact copy-templates.js
// / template-paths.ts diff.
//
// ORDER MATTERS: aliases are matched top-to-bottom, so the specific moved roots
// (`@shared/game-engine`, `@shared/voice`, `@shared/prolog`) precede the generic `@shared`.
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.gltf', '**/*.glb', '**/*.bin', '**/*.babylon'],
  resolve: {
    alias: [
      // moved into @insimul/babylon (the consolidated package, vendored at /src/insimul-babylon)
      { find: '@shared/game-engine', replacement: '/src/insimul-babylon/engine/game-engine' },
      { find: '@shared/voice', replacement: '/src/insimul-babylon/engine/voice' },
      { find: '@insimul/babylon-game', replacement: '/src/insimul-babylon/data' },
      { find: '@insimul/typescript', replacement: '/src/insimul-babylon/conversation' },
      { find: '@insimul/babylon', replacement: '/src/insimul-babylon' },
      // moved into @insimul/core (contract package, vendored at /src/insimul-core)
      { find: '@shared/prolog', replacement: '/src/insimul-core/prolog' },
      { find: '@insimul/core', replacement: '/src/insimul-core' },
      // engine-agnostic straggler domain layer still vendored from shared/
      { find: '@shared', replacement: '/src/shared' },
      // env-provided stubs (unchanged)
      { find: '@sentry/react', replacement: '/src/shared/sentry-stub.ts' },
      { find: '@mlc-ai/web-llm', replacement: '/src/shared/empty-module-stub.ts' },
      // game source
      { find: '@/components/3DGame', replacement: '/src' },
      { find: '@', replacement: '/src' },
    ],
  },
  esbuild: {
    loader: 'ts',
    target: 'esnext',
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        manualChunks: {
          'babylon-core': ['@babylonjs/core'],
          'babylon-gui': ['@babylonjs/gui'],
          'babylon-loaders': ['@babylonjs/loaders'],
          'babylon-materials': ['@babylonjs/materials'],
        },
      },
    },
    copyPublicDir: true,
    assetsDir: 'assets',
  },
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/gui',
      '@babylonjs/loaders',
      '@babylonjs/materials',
    ],
  },
  publicDir: 'public',
});
