/**
 * Per-Predicate Migrator Registry
 *
 * When the Prolog predicate signature schema changes between Insimul builds
 * (e.g. `skill/2` becomes `skill/3` with an added level argument), existing
 * saves contain `prologFacts` using the old signature. Restoring those facts
 * verbatim would either fail to unify or — worse — silently mis-match.
 *
 * This module supplies a central registry of named migrators and a
 * `migratePrologFacts()` helper that rewrites facts from their snapshot-era
 * signature to the current runtime schema. Facts whose signatures still match
 * the current schema pass through untouched. Facts whose predicate/arity has
 * been removed or renamed with no matching migrator are logged and dropped.
 *
 * Registry keys use the format `oldName/oldArity->newName/newArity`. Adding a
 * new migration:
 *
 *   predicateMigrations['old_name/2->new_name/3'] = {
 *     toName: 'new_name',
 *     toArity: 3,
 *     description: 'Rename old_name/2 to new_name/3; default third arg to 0.',
 *     migrate: (args) => [args[0], args[1], 0],
 *   };
 *
 * Return `null` from `migrate()` to drop a fact based on its arguments.
 */

export type PredicateArg = string | number;

export interface PredicateFact {
  predicate: string;
  args: PredicateArg[];
}

/**
 * Shape of an individual entry in the schema snapshot produced by US-002's
 * `buildPredicateSchemaSnapshot()` helper. Only `name` and `arity` are
 * consulted here, so additional metadata (kind, helpers, etc.) is tolerated.
 */
export interface PredicateSchemaSignature {
  name: string;
  arity: number;
  kind?: 'builtin' | 'dynamic' | 'helper';
}

export interface PredicateMigration {
  /** Predicate name after migration. */
  toName: string;
  /** Predicate arity after migration (must equal the length of the returned args). */
  toArity: number;
  /** Human-readable description surfaced in logs and admin tooling. */
  description?: string;
  /**
   * Rewrite the old-signature arguments into the new signature. Return `null`
   * to drop the fact (e.g., legacy data that cannot be reconstructed).
   */
  migrate: (args: PredicateArg[]) => PredicateArg[] | null;
}

export type PredicateMigrationRegistry = Record<string, PredicateMigration>;

/**
 * Seeded migrations. Add new entries here when a predicate's signature
 * changes in a way that would otherwise invalidate saved facts.
 */
export const predicateMigrations: PredicateMigrationRegistry = {
  'skill/2->skill/3': {
    toName: 'skill',
    toArity: 3,
    description: 'Default new skill level to 1 when upgrading from skill/2.',
    migrate: (args) => {
      if (args.length !== 2) return null;
      return [args[0], args[1], 1];
    },
  },
};

export type DroppedFactReason =
  | 'no-migrator'
  | 'migrator-returned-null'
  | 'migrator-arity-mismatch'
  | 'target-missing-from-schema';

export interface DroppedFact {
  fact: PredicateFact;
  reason: DroppedFactReason;
  note?: string;
}

export interface MigratedFactRecord {
  from: PredicateFact;
  to: PredicateFact;
  migrationKey: string;
}

export interface MigratePrologFactsResult {
  facts: PredicateFact[];
  dropped: DroppedFact[];
  migrated: MigratedFactRecord[];
}

export interface MigratePrologFactsOptions {
  registry?: PredicateMigrationRegistry;
  logger?: (message: string) => void;
}

/**
 * Rewrite saved `prologFacts` through the migrator registry.
 *
 * - If the fact's `predicate/arity` is in the current schema → pass through.
 * - Otherwise look up a migrator whose source matches the fact's signature.
 *   - If the migrator returns a new args array, emit the rewritten fact.
 *   - If the migrator returns `null`, drop the fact.
 * - If no migrator matches, the fact is dropped and logged.
 *
 * `schemaFromSnapshot` is accepted for diagnostic parity with the stored
 * WorldSnapshot schema (US-002). It is used only for richer logging today
 * but is part of the API so callers never have to fetch it again if future
 * migrations need to reason about the exact schema in effect at save time.
 */
export function migratePrologFacts(
  facts: PredicateFact[],
  schemaFromSnapshot: PredicateSchemaSignature[],
  currentSchema: PredicateSchemaSignature[],
  options: MigratePrologFactsOptions = {},
): MigratePrologFactsResult {
  const registry = options.registry ?? predicateMigrations;
  const log = options.logger ?? ((msg) => console.warn(msg));
  const currentIndex = indexSchema(currentSchema);
  const snapshotIndex = indexSchema(schemaFromSnapshot);

  const output: PredicateFact[] = [];
  const dropped: DroppedFact[] = [];
  const migrated: MigratedFactRecord[] = [];

  for (const fact of facts) {
    const sig = signatureOf(fact);

    if (currentIndex.has(sig)) {
      output.push(fact);
      continue;
    }

    const match = findMigration(registry, sig);
    if (!match) {
      const wasKnown = snapshotIndex.has(sig);
      const note = wasKnown
        ? 'predicate removed or renamed since save creation'
        : 'predicate not recognized in snapshot or current schema';
      log(`[predicate-migrations] Dropped fact (no migrator): ${formatFact(fact)} — ${note}`);
      dropped.push({ fact, reason: 'no-migrator', note });
      continue;
    }

    const targetSig = `${match.migration.toName}/${match.migration.toArity}`;
    if (!currentIndex.has(targetSig)) {
      log(
        `[predicate-migrations] Dropped fact (migrator target missing): ${formatFact(fact)} → ${targetSig}`,
      );
      dropped.push({
        fact,
        reason: 'target-missing-from-schema',
        note: `target ${targetSig} not in current schema`,
      });
      continue;
    }

    const newArgs = match.migration.migrate(fact.args);
    if (newArgs === null) {
      log(`[predicate-migrations] Dropped fact (migrator returned null): ${formatFact(fact)}`);
      dropped.push({ fact, reason: 'migrator-returned-null' });
      continue;
    }

    if (newArgs.length !== match.migration.toArity) {
      log(
        `[predicate-migrations] Dropped fact (arity mismatch): ${formatFact(fact)} → ` +
          `${match.migration.toName}/${newArgs.length}, expected /${match.migration.toArity}`,
      );
      dropped.push({
        fact,
        reason: 'migrator-arity-mismatch',
        note: `returned ${newArgs.length} args, expected ${match.migration.toArity}`,
      });
      continue;
    }

    const newFact: PredicateFact = { predicate: match.migration.toName, args: newArgs };
    output.push(newFact);
    migrated.push({ from: fact, to: newFact, migrationKey: match.key });
  }

  return { facts: output, dropped, migrated };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function indexSchema(schema: PredicateSchemaSignature[]): Set<string> {
  const set = new Set<string>();
  for (const entry of schema) {
    set.add(`${entry.name}/${entry.arity}`);
  }
  return set;
}

function signatureOf(fact: PredicateFact): string {
  return `${fact.predicate}/${fact.args.length}`;
}

function formatFact(fact: PredicateFact): string {
  const args = fact.args
    .map((a) => (typeof a === 'string' ? `'${a}'` : String(a)))
    .join(', ');
  return `${fact.predicate}(${args})`;
}

function findMigration(
  registry: PredicateMigrationRegistry,
  sourceSig: string,
): { key: string; migration: PredicateMigration } | null {
  for (const [key, migration] of Object.entries(registry)) {
    const arrowIdx = key.indexOf('->');
    if (arrowIdx < 0) continue;
    const from = key.slice(0, arrowIdx);
    if (from !== sourceSig) continue;
    return { key, migration };
  }
  return null;
}
