/**
 * Keyboard Map — Central catalogue of all keyboard bindings in the 3D game.
 *
 * Movement keys are handled by CharacterController (ActionMap).
 * Game action keys are handled by BabylonGame.handleKeyDown().
 * Camera shortcuts are handled by CameraManager.handleKeyboardShortcut().
 *
 * Use KeyboardEvent.code values (layout-independent physical keys).
 */

// ─── Movement (CharacterController ActionMap) ─────────────────────────────
// These are configured via ActionMap in CharacterController.ts and use
// KeyboardEvent.key (lowercase). Listed here for reference only.
//
//   W / ArrowUp       — Walk forward
//   S / ArrowDown     — Walk backward
//   A / ArrowLeft     — Turn left
//   D / ArrowRight    — Turn right
//   Q                 — Strafe left
//   E                 — Strafe right
//   Space             — Jump
//   Shift             — Sprint (speed modifier)
//   CapsLock          — Toggle sprint

// ─── Game Actions (BabylonGame.handleKeyDown) ─────────────────────────────

/** Interact with nearest NPC (open chat) or end conversation */
export const KEY_NPC_INTERACT = 'KeyG';

/** Enter/exit nearest building */
export const KEY_BUILDING_INTERACT = 'Enter';

/** Attack / respawn */
export const KEY_ATTACK = 'KeyF';

/** Target nearest enemy */
export const KEY_TARGET_ENEMY = 'KeyR';

/** Toggle vocabulary/grammar panel */
export const KEY_VOCABULARY_PANEL = 'KeyV';

/** Toggle conversation history panel */
export const KEY_CONVERSATION_HISTORY = 'KeyH';

/** Toggle skill tree panel */
export const KEY_SKILL_TREE = 'KeyK';

/** Toggle notice board */
export const KEY_NOTICE_BOARD = 'KeyN';

/** Toggle journal / quest log panel */
export const KEY_QUEST_LOG = 'KeyJ';

/** Toggle VR mode */
export const KEY_TOGGLE_VR = 'KeyV'; // Shift+V

/** Toggle full-screen map view */
export const KEY_FULLSCREEN_MAP = 'Tab';

/** Push-to-talk: hold to record speech to NPC */
export const KEY_PUSH_TO_TALK = 'KeyT';

/** Examine nearest object (shows target-language label) */
export const KEY_EXAMINE_OBJECT = 'KeyX';

/** Open/close game menu */
export const KEY_GAME_MENU = 'KeyM';

/** Cycle vehicle (on foot → bicycle → horse → on foot) */
export const KEY_CYCLE_VEHICLE = 'KeyB';

/** Quick save (slot 0) */
export const KEY_QUICK_SAVE = 'F5';

/** Quick load (slot 0) */
export const KEY_QUICK_LOAD = 'F9';

/** Toggle camera viewfinder (photography mode) */
export const KEY_CAMERA_MODE = 'KeyC';

/** Open/close photo book panel */
export const KEY_PHOTO_BOOK = 'KeyP';

/** Open physical action radial menu when near an action hotspot */
export const KEY_PHYSICAL_ACTION = 'KeyQ';

// ─── Time Controls (BabylonGame.handleKeyDown) ─────────────────────────────

/** Pause / resume game time */
export const KEY_TIME_PAUSE = 'Period';

/** Decrease time speed */
export const KEY_TIME_SLOW = 'Comma';

/** Increase time speed */
export const KEY_TIME_FAST = 'Slash';

// ─── Camera (CameraManager.handleKeyboardShortcut) ────────────────────────
// These use KeyboardEvent.key (lowercase). Listed here for reference.
//
//   1                 — First-person camera
//   2                 — Third-person camera
//   3                 — Isometric camera
