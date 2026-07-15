/**
 * @insimul/babylon — the consolidated web/Babylon runtime for Insimul.
 *
 * One runtime package per engine (matching the Unity/Unreal/Godot story). Web
 * creators install exactly one thing. Subpath entry points:
 *
 *   @insimul/babylon/conversation — the conversation SDK: InsimulClient plus
 *                                   pluggable chat/TTS/STT providers and audio utils.
 *   @insimul/babylon/data         — save-file/data/loading layer + BabylonWorld (US-BC2).
 *   @insimul/babylon/engine       — the Babylon engine: rendering/logic/systems (US-BC3).
 *   @insimul/babylon/templates    — game-export shell templates (US-BC2/US-BC4).
 *
 * The root entry re-exports the conversation SDK for convenience; import the
 * subpaths directly for the data/engine/templates layers.
 */
export * from './conversation/index.js';
