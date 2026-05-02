/**
 * Game Genre Configuration Types
 * 
 * Defines the structure for genre-specific game behavior including
 * camera modes, control schemes, combat styles, and feature flags.
 */

export type CameraMode = 'first_person' | 'third_person' | 'isometric' | 'side_scroll' | 'top_down' | 'fighting';
export type MovementPlane = 'free' | 'xy' | 'xz';
export type ControlScheme = 'wasd_mouse' | 'point_click' | 'controller' | 'touch';
export type CombatStyle = 'melee' | 'ranged' | 'hybrid' | 'none' | 'turn_based';
export type MovementStyle = 'free' | 'grid' | 'platformer' | 'vehicle';
export type UILayout = 'action_rpg' | 'fps' | 'rts' | 'platformer' | 'puzzle' | 'minimal';

export interface GenreFeatures {
  inventory: boolean;
  crafting: boolean;
  dialogue: boolean;
  combat: boolean;
  building: boolean;
  resources: boolean;
  permadeath: boolean;
  quests: boolean;
  experience: boolean;
  skills: boolean;

  // Feature-module flags (Phase 1 abstraction layer)
  knowledgeAcquisition?: boolean;
  proficiencyTracking?: boolean;
  patternRecognition?: boolean;
  assessment?: boolean;
  npcExams?: boolean;
  performanceScoring?: boolean;
  voiceInteraction?: boolean;
  adaptiveDifficulty?: boolean;
  worldLore?: boolean;
  conversationAnalytics?: boolean;
  onboarding?: boolean;
}

export interface GenreConfig {
  id: string;
  name: string;
  description: string;
  
  // Camera and movement
  cameraMode: CameraMode;
  movementPlane: MovementPlane;
  controlScheme: ControlScheme;
  
  // Gameplay style
  combatStyle: CombatStyle;
  movementStyle: MovementStyle;
  uiLayout: UILayout;
  
  // Feature flags
  features: GenreFeatures;
  
  // Quest configuration
  questTypes: string[];  // IDs of quest type definitions to use
  difficultyLevels: string[];
  
  // Default world type for asset collection selection
  defaultWorldType?: string;
  
  // Default settings
  defaultPlayerSpeed: number;
  defaultJumpHeight: number;
  gravityMultiplier: number;
  
  // UI customization
  showMinimap: boolean;
  showHealthBar: boolean;
  showStaminaBar: boolean;
  showAmmoCounter: boolean;
  showCompass: boolean;
}

export interface GenreRegistry {
  [key: string]: GenreConfig;
}
