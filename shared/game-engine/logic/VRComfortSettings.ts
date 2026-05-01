/**
 * VR Comfort Settings
 *
 * Defines locomotion, turning, comfort, and accessibility options for VR mode.
 */

export interface VRComfortSettings {
  locomotionType: 'teleport' | 'smooth' | 'both';
  snapTurnAngle: 15 | 30 | 45 | 90;
  smoothTurnSpeed: number;
  vignetteOnMove: boolean;
  movementSpeed: number;
  standingHeight: number;
}

export const DEFAULT_VR_COMFORT_SETTINGS: VRComfortSettings = {
  locomotionType: 'both',
  snapTurnAngle: 30,
  smoothTurnSpeed: 1.5,
  vignetteOnMove: true,
  movementSpeed: 1.0,
  standingHeight: 1.7,
};

/**
 * VR Accessibility Settings
 *
 * Extended settings for accessibility: seated play, one-handed mode,
 * text sizing, color blindness support, and motion sickness mitigation.
 */

export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface VRAccessibilitySettings {
  // Seated / standing mode
  seatedMode: boolean;
  seatedHeightOffset: number;     // meters added to camera Y in seated mode

  // One-handed mode: remaps all inputs to a single controller
  oneHandedMode: boolean;
  dominantHand: 'left' | 'right';

  // Text and UI sizing
  uiTextScale: number;            // 0.5 – 2.0 multiplier for text in VR panels
  uiPanelScale: number;           // 0.5 – 2.0 multiplier for VR panel size
  highContrastUI: boolean;

  // Color blind support
  colorBlindMode: ColorBlindMode;

  // Motion sickness comfort
  tunnelVignetteIntensity: number; // 0.0 – 1.0, how strong the vignette is
  reduceParticleEffects: boolean;
  staticHorizonLine: boolean;      // fixed reference line to reduce nausea

  // Subtitle / caption
  subtitlesEnabled: boolean;
  subtitleFontSize: number;        // pixels on VR panel texture
}

export const DEFAULT_VR_ACCESSIBILITY_SETTINGS: VRAccessibilitySettings = {
  seatedMode: false,
  seatedHeightOffset: 0.4,
  oneHandedMode: false,
  dominantHand: 'right',
  uiTextScale: 1.0,
  uiPanelScale: 1.0,
  highContrastUI: false,
  colorBlindMode: 'none',
  tunnelVignetteIntensity: 0.5,
  reduceParticleEffects: false,
  staticHorizonLine: false,
  subtitlesEnabled: true,
  subtitleFontSize: 18,
};
