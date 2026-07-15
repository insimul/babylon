/**
 * Truth → Prolog fact conversion.
 *
 * Mirrors the server-side logic in `server/engines/prolog/prolog-sync.ts`
 * (`syncTruthsToProlog`) but returns Prolog source text so it can be used
 * for live previews in the client editor.
 *
 * The authoritative predicate shape is declared in
 * `shared/prolog/predicate-schema.ts` under the `truth` namespace.
 */

export interface TruthInput {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  entryType?: string | null;
  timestep?: number | null;
  timeYear?: number | null;
  characterId?: string | null;
  relatedLocationIds?: string[] | null;
  importance?: number | null;
  isPublic?: boolean | null;
  tags?: string[] | null;
}

const PLACEHOLDER_ID = 'new_truth';

function sanitizeAtom(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .replace(/_+/g, '_');
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Compile a truth entry into Prolog facts.
 *
 * Returns Prolog source text matching what `PrologSyncService.syncTruthsToProlog`
 * asserts at world sync time. Ownership truths are excluded (those are handled by
 * the ownership sync path on the server).
 *
 * If `id` is missing (e.g. an unsaved draft) a placeholder atom is used so the
 * author can still see the fact shape.
 */
export function truthToPrologFacts(truth: TruthInput): string {
  if (truth.entryType === 'ownership') {
    return '% ownership truths are synced via syncOwnershipToProlog, not truth/3.\n';
  }

  const rawId = (truth.id && truth.id.trim()) || PLACEHOLDER_ID;
  const truthId = sanitizeAtom(rawId);
  const title = escapeString(truth.title ?? '');
  const content = escapeString((truth.content ?? '').substring(0, 500));

  const lines: string[] = [];
  lines.push(`truth(${truthId}, '${title}', '${content}').`);

  if (truth.entryType) {
    lines.push(`truth_type(${truthId}, ${sanitizeAtom(truth.entryType)}).`);
  }
  if (truth.timestep != null && Number.isFinite(truth.timestep)) {
    lines.push(`truth_timestep(${truthId}, ${truth.timestep}).`);
  }
  if (truth.timeYear != null && Number.isFinite(truth.timeYear)) {
    lines.push(`truth_year(${truthId}, ${truth.timeYear}).`);
  }
  if (truth.characterId) {
    lines.push(`truth_character(${truthId}, ${sanitizeAtom(truth.characterId)}).`);
  }
  if (Array.isArray(truth.relatedLocationIds)) {
    for (const locId of truth.relatedLocationIds) {
      if (typeof locId === 'string' && locId) {
        lines.push(`truth_location(${truthId}, ${sanitizeAtom(locId)}).`);
      }
    }
  }
  if (truth.importance != null && Number.isFinite(truth.importance)) {
    lines.push(`truth_importance(${truthId}, ${truth.importance}).`);
  }
  if (truth.isPublic) {
    lines.push(`truth_public(${truthId}).`);
  }
  if (Array.isArray(truth.tags)) {
    for (const tag of truth.tags) {
      if (typeof tag === 'string' && tag) {
        lines.push(`truth_tag(${truthId}, ${sanitizeAtom(tag)}).`);
      }
    }
  }

  return lines.join('\n') + '\n';
}
