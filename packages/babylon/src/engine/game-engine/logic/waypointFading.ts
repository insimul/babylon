/**
 * Shared waypoint distance-based fading logic.
 *
 * Used by both QuestWaypointManager (3D beams) and DynamicQuestWaypointDirector (compass/HUD).
 * Returns a normalized 0–1 alpha based on distance, which callers scale to their max opacity.
 *
 * Breakpoints:
 *   < 3 units   → 0 (hidden, player has arrived)
 *   3–8 units   → fade in
 *   8–150 units → 1.0 (full visibility)
 *   150–200     → fade out toward distant dim
 *   > 200       → 0.2 (dim but visible)
 */
export function computeWaypointAlpha(distance: number): number {
  if (distance < 3) return 0;
  if (distance < 8) return (distance - 3) / 5;
  if (distance > 200) return 0.2;
  if (distance > 150) return 0.2 + 0.8 * ((200 - distance) / 50);
  return 1.0;
}
