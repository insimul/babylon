/**
 * @insimul/core — the engine-agnostic Insimul contract.
 *
 * This package holds the parts of the runtime that native engine plugins
 * (Unreal/Unity/Godot) must consume WITHOUT dragging Babylon.js along: the
 * save-file format and its migrations, world types, the Prolog toolchain
 * (see ./prolog), and (in later core-extraction stories) the IR and
 * quest/data-source types. It depends on NO @babylonjs/*, react, or DOM APIs.
 *
 * Files here are also re-exported from their historical `shared/<name>` paths
 * via one-line shims, so existing `@shared/*` imports and the Babylon export
 * pipeline keep resolving unchanged.
 */

export * from './save-file';
export * from './save-envelope';
export * from './save-export';
export * from './save-extensions';
export * from './save-file-migrations';
export * from './save-file-assessments';
export * from './world-types';
export * from './world-snapshot-version';
export * from './playthrough-overview';
export * from './insimul-version';
export * from './validation-failures';
export * from './asset-types';
export * from './prolog';
