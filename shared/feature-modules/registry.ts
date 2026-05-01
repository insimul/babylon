/**
 * Feature Module Registry
 *
 * Central registry of all available feature modules.
 * Each module self-describes what it contributes (quest objectives,
 * XP events, proficiency dimensions, etc.) so the system can compose
 * them dynamically based on the world's enabled modules.
 */

import type { ModuleId, FeatureModuleDefinition } from './types';

// ---------------------------------------------------------------------------
// Registry storage
// ---------------------------------------------------------------------------

const MODULE_REGISTRY = new Map<ModuleId, FeatureModuleDefinition>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a feature module definition. Throws if the ID is already taken. */
export function registerModule(definition: FeatureModuleDefinition): void {
  if (MODULE_REGISTRY.has(definition.id)) {
    throw new Error(`Feature module "${definition.id}" is already registered.`);
  }
  MODULE_REGISTRY.set(definition.id, definition);
}

/** Retrieve a module definition by ID. Returns undefined if not found. */
export function getModule(id: ModuleId): FeatureModuleDefinition | undefined {
  return MODULE_REGISTRY.get(id);
}

/** Get all registered module definitions. */
export function getAllModules(): FeatureModuleDefinition[] {
  return Array.from(MODULE_REGISTRY.values());
}

/** Check whether a module is registered. */
export function hasModule(id: ModuleId): boolean {
  return MODULE_REGISTRY.has(id);
}

/**
 * Resolve a list of module IDs into their full definitions,
 * including transitive dependencies (topologically sorted).
 * Throws if a required dependency is missing from the registry.
 */
export function resolveModulesWithDependencies(
  ids: ModuleId[],
): FeatureModuleDefinition[] {
  const resolved = new Map<ModuleId, FeatureModuleDefinition>();
  const visiting = new Set<ModuleId>();

  function visit(id: ModuleId): void {
    if (resolved.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected involving module "${id}".`);
    }

    const def = MODULE_REGISTRY.get(id);
    if (!def) {
      throw new Error(`Module "${id}" is not registered but is required as a dependency.`);
    }

    visiting.add(id);
    for (const dep of def.dependencies) {
      visit(dep);
    }
    visiting.delete(id);
    resolved.set(id, def);
  }

  for (const id of ids) {
    visit(id);
  }

  return Array.from(resolved.values());
}

/**
 * Aggregate all quest objective types provided by a set of modules.
 */
export function collectQuestObjectiveTypes(modules: FeatureModuleDefinition[]): string[] {
  return modules.flatMap(m => m.questObjectiveTypes);
}

/**
 * Aggregate all quest reward types provided by a set of modules.
 */
export function collectQuestRewardTypes(modules: FeatureModuleDefinition[]): string[] {
  return modules.flatMap(m => m.questRewardTypes);
}

/**
 * Aggregate all XP event types provided by a set of modules.
 */
export function collectXpEventTypes(modules: FeatureModuleDefinition[]): string[] {
  return modules.flatMap(m => m.xpEventTypes ?? []);
}

/**
 * Aggregate all proficiency dimensions provided by a set of modules.
 */
export function collectProficiencyDimensions(modules: FeatureModuleDefinition[]): string[] {
  return modules.flatMap(m => m.proficiencyDimensions ?? []);
}

/**
 * Aggregate all skill tree condition types provided by a set of modules.
 */
export function collectSkillTreeConditionTypes(modules: FeatureModuleDefinition[]): string[] {
  return modules.flatMap(m => m.skillTreeConditionTypes ?? []);
}

/**
 * Aggregate all GenreFeatures flags activated by a set of modules.
 */
export function collectGenreFeatureFlags(modules: FeatureModuleDefinition[]): string[] {
  return Array.from(new Set(modules.flatMap(m => m.genreFeatureFlags)));
}
