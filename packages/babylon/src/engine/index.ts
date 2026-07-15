/**
 * @insimul/babylon/engine — the Babylon web engine.
 *
 * The engine moved out of `shared/game-engine` + `shared/voice` into this package
 * (US-BC3, plan §A1.5); one-line re-export shims remain at every old `@shared/...`
 * path so existing consumers keep resolving.
 *
 * This barrel re-exports the curated game-engine surface (engine-agnostic types,
 * interfaces, IR, asset pipeline, vegetation/building presets, animation registry) —
 * the same set `@shared/game-engine` exposed. The heavier trees (rendering/, logic/,
 * systems/) and the voice layer are deep-import only, to keep this barrel light:
 *   import { ... } from '@insimul/babylon/engine/game-engine/rendering/BabylonGame';
 *   import { ... } from '@insimul/babylon/engine/voice/audio-utils';
 */
export * from './game-engine';
