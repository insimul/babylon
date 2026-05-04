import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.gltf', '**/*.glb', '**/*.bin', '**/*.babylon'],
  resolve: {
    alias: {
      '@/components/3DGame': '/src',
      '@': '/src',
      '@shared': '/src/shared',
      '@insimul/typescript': '/src/insimul-sdk',
    },
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
