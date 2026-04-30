/**
 * Export Validation for Prolog Knowledge Bases
 *
 * Validates that a generated Prolog knowledge base is syntactically correct
 * and structurally sound before including it in a game export.
 */

import { TauPrologEngine } from './tau-engine';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    factCount: number;
    ruleCount: number;
    predicateCount: number;
  };
}

/**
 * Validate a Prolog knowledge base string intended for game export.
 *
 * Checks:
 *   1. Syntax — can tau-prolog parse the program?
 *   2. Duplicate dynamic declarations
 *   3. Presence of person/1 facts (structural sanity check)
 *   4. Collects stats (fact count, rule count, predicate count)
 *
 * @param prologContent - The full Prolog program string to validate
 * @returns ValidationResult with errors, warnings, and stats
 */
export async function validateExportKnowledgeBase(prologContent: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Syntax check — can tau-prolog parse it?
  const engine = new TauPrologEngine();
  const consultResult = await engine.consult(prologContent);
  if (!consultResult.success) {
    errors.push(`Syntax error: ${consultResult.error}`);
    // Estimate stats from text even though parsing failed, so the log is useful
    const lines = prologContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('%'));
    const factEstimate = lines.filter(l => /^[a-z_]\w*\(.*\)\.\s*$/.test(l.trim())).length;
    const ruleEstimate = lines.filter(l => l.includes(':-')).length;
    return {
      valid: false,
      errors,
      warnings,
      stats: { factCount: factEstimate, ruleCount: ruleEstimate, predicateCount: 0 },
    };
  }

  // 2. Check for duplicate dynamic declarations
  const dynamicDecls = prologContent.match(/:- dynamic\([^)]+\)\./g) || [];
  const declMap = new Map<string, number>();
  for (const decl of dynamicDecls) {
    declMap.set(decl, (declMap.get(decl) || 0) + 1);
  }
  declMap.forEach((count, decl) => {
    if (count > 1) {
      warnings.push(`Duplicate dynamic declaration (${count}x): ${decl}`);
    }
  });

  // 3. Check for person/1 facts (basic structural sanity)
  const hasPeople = await engine.queryOnce('person(_)');
  if (!hasPeople) {
    warnings.push('No person/1 facts found in knowledge base');
  }

  // 4. Collect stats
  const stats = engine.getStats();

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      factCount: stats.factCount,
      ruleCount: stats.ruleCount,
      predicateCount: stats.dynamicPredicates.length,
    },
  };
}
