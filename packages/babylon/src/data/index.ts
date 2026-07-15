/**
 * @insimul/babylon/data — the save/data/loading layer for the Babylon web runtime.
 *
 * US-BC2 consolidated the former @insimul/babylon-game package here. This barrel is the
 * React-FREE public surface: the DataSource / save-file / world-state / save-queue
 * classes flat, and the optimization + diagnostics toolkits as namespaces (their modules
 * share symbol names — QualityPreset, QUALITY_PRESETS, estimateMeshBytes, … — so a flat
 * re-export would be ambiguous; deep imports like `@insimul/babylon/data/optimization/
 * StartupOrchestrator` remain the precise path).
 *
 * REACT ENTRY POINTS ARE DEEP-IMPORT ONLY — they are intentionally NOT re-exported here so
 * that importing `@insimul/babylon/data` never requires the optional `react` peer:
 *   - `@insimul/babylon/data/BabylonWorld`                 (BabylonWorld mount)
 *   - `@insimul/babylon/data/optimization/LoadingScreen`   (LoadingScreen)
 *   - `@insimul/babylon/data/ui/SaveMigrationPromptModal`  (migration prompt modal)
 * Import those directly; they — and only they — fail when react is absent.
 */

// Core data / save layer (collision-free, React-free).
export * from './DataSource';
export * from './SaveFileDataSource';
export * from './WorldStateManager';
export * from './SaveQueue';

// Optimization + diagnostics toolkits — namespaced to avoid cross-module name collisions.
export * as performanceSettings from './optimization/performanceSettings';
export * as hardwareDetector from './optimization/HardwareDetector';
export * as gameDataCache from './optimization/GameDataCache';
export * as renderOptimizer from './optimization/RenderOptimizer';
export * as startupOrchestrator from './optimization/StartupOrchestrator';
export * as quickResumeCache from './optimization/QuickResumeCache';
export * as networkMetrics from './optimization/NetworkMetrics';
export * as loadingTips from './optimization/loadingTips';
export * as meshMemoryManager from './optimization/MeshMemoryManager';
export * as startupProfiler from './optimization/StartupProfiler';
export * as assetLoadQueue from './optimization/AssetLoadQueue';
export * as resourceProfiler from './diagnostics/ResourceProfiler';
