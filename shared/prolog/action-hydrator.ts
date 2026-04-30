/**
 * Action Hydrator — Populates action fields from Prolog content
 *
 * The action's `content` field (Prolog source) is the single source of truth.
 * This module parses the Prolog predicates and populates the structured fields
 * that the game engine reads (energyCost, emitsEvent, category, etc.).
 *
 * Call `hydrateActionFromProlog(action)` on any action object to ensure its
 * fields reflect the Prolog content.
 */

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Populate an action object's fields from its Prolog `content`.
 * Mutates the action in-place and returns it.
 * If `content` is empty/null, the action is returned unchanged.
 */
export function hydrateActionFromProlog(action: any): any {
  const content = action?.content;
  if (!content || typeof content !== 'string') return action;

  // Parse the main action/4 fact: action(Id, 'Name', Type, EnergyCost).
  const mainMatch = content.match(
    /action\(\s*(\w+)\s*,\s*'((?:[^'\\\\]|\\\\.)*)'\s*,\s*(\w+)\s*,\s*(\d+(?:\.\d+)?)\s*\)/
  );
  if (mainMatch) {
    action.name = action.name || mainMatch[2].replace(/\\'/g, "'");
    action.actionType = mainMatch[3];
    action.energyCost = parseFloat(mainMatch[4]);
  }

  // action_difficulty(Id, N).
  const diffMatch = content.match(/action_difficulty\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  if (diffMatch) action.difficulty = parseFloat(diffMatch[1]);

  // action_duration(Id, N).
  const durMatch = content.match(/action_duration\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  if (durMatch) action.duration = parseFloat(durMatch[1]);

  // action_category(Id, Cat).
  const catMatch = content.match(/action_category\(\s*\w+\s*,\s*(\w+)\s*\)/);
  if (catMatch) action.category = catMatch[1];

  // action_parent(Id, ParentId).
  const parentMatch = content.match(/action_parent\(\s*\w+\s*,\s*(\w+)\s*\)/);
  if (parentMatch) action.parentAction = parentMatch[1];

  // action_target_type(Id, Type).
  const targetMatch = content.match(/action_target_type\(\s*\w+\s*,\s*(\w+)\s*\)/);
  if (targetMatch) action.targetType = targetMatch[1];

  // action_requires_target(Id).
  action.requiresTarget = /action_requires_target\(\s*\w+\s*\)/.test(content);

  // action_range(Id, N).
  const rangeMatch = content.match(/action_range\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (rangeMatch) action.range = parseInt(rangeMatch[1]);

  // action_cooldown(Id, N).
  const cdMatch = content.match(/action_cooldown\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (cdMatch) action.cooldown = parseInt(cdMatch[1]);

  // action_emits_event(Id, 'Event').
  const eventMatch = content.match(/action_emits_event\(\s*\w+\s*,\s*'((?:[^'\\\\]|\\\\.)*)'\s*\)/);
  if (eventMatch) action.emitsEvent = eventMatch[1].replace(/\\'/g, "'");

  // action_activity(Id, Verb).
  const activityMatch = content.match(/action_activity\(\s*\w+\s*,\s*(\w+)\s*\)/);
  if (activityMatch) action.gameActivityVerb = activityMatch[1];

  // action_completes_objective(Id, Type).
  const objMatch = content.match(/action_completes_objective\(\s*\w+\s*,\s*(\w+)\s*\)/);
  if (objMatch) action.completesObjectiveType = objMatch[1];

  // action_verb(Id, past, 'Word').
  const pastMatch = content.match(/action_verb\(\s*\w+\s*,\s*past\s*,\s*'((?:[^'\\\\]|\\\\.)*)'\s*\)/);
  if (pastMatch) action.verbPast = pastMatch[1].replace(/\\'/g, "'");

  // action_verb(Id, present, 'Word').
  const presentMatch = content.match(/action_verb\(\s*\w+\s*,\s*present\s*,\s*'((?:[^'\\\\]|\\\\.)*)'\s*\)/);
  if (presentMatch) action.verbPresent = presentMatch[1].replace(/\\'/g, "'");

  // isActive: if content exists, the action is active
  if (action.isActive === undefined) action.isActive = true;

  return action;
}

/**
 * Hydrate an array of actions from their Prolog content.
 * Convenience wrapper for bulk loading.
 */
export function hydrateActionsFromProlog(actions: any[]): any[] {
  return actions.map(a => hydrateActionFromProlog(a));
}
