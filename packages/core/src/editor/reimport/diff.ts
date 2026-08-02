/**
 * The re-import diff policy (US-2 of `101-editor-plugin-core`).
 *
 * When a world is regenerated and the scene rebuilt, the editor must reconcile
 * the fresh placement manifest against the scene already on disk **without
 * clobbering the creator's hand edits**. That reconciliation is the hardest and
 * least-shared thing the three editor plugins do — and, per
 * `docs/editor-plugin-core-analysis.md` §4, the one they nevertheless implement
 * identically, because all three hand-ported one policy.
 *
 * Five mutually exclusive classes, keyed on the entity stamp:
 *
 * | class        | condition                                   | action                                |
 * |--------------|---------------------------------------------|---------------------------------------|
 * | `added`      | in NEW, absent from OLD                     | materialize + stamp                   |
 * | `updated`    | in BOTH, old generated, transform/binding ≠ | re-apply fresh transform + binding    |
 * | `unchanged`  | in BOTH, old generated, equivalent          | no-op                                 |
 * | `skipped`    | OLD has `generated === false`               | preserve verbatim, present or absent  |
 * | `deprecated` | OLD generated, absent from NEW              | reparent under `Deprecated`, NEVER delete |
 *
 * An **untagged** object is never in the diff and is never touched — that is how
 * a hand-*placed* object survives. A **tagged** object survives by having its
 * `generated` flag cleared.
 *
 * ## What this policy does not protect, recorded not fixed
 *
 * §4.3 of the analysis sharpened two real gaps: the `generated` flag is opt-out
 * with no per-field ownership (nudge a generated node without clearing the flag
 * and the next import re-applies the manifest transform over the edit), and only
 * the direct children of the generated root are diffed (reorganise generated
 * nodes into your own sub-groups and they drop out of OLD, so the next import
 * re-`added`s them as duplicates). Both are policy, and landing the policy here
 * is what makes them a one-place fix. Changing them is NOT this story — it is a
 * behaviour change that needs a creator-facing design, and doing it silently
 * while consolidating would make three engines disagree with their own goldens.
 *
 * ## Determinism
 *
 * The report is a pure function of (old nodes, new nodes): every id list is
 * ascending and the serialization is canonical, so two runs — or two engines —
 * produce byte-identical reports. The apply pass drives the host mutator in that
 * same canonical order.
 */

import { canonicalStringify } from '../../save-export';
import type { PlacedNode } from '../scene/placement';
import { quantizeSceneCoord } from '../scene/placement';
import type { ProgressSink, SceneMutator } from '../host-contracts';

/** How re-import classifies a single entityId. Mutually exclusive. */
export type DiffAction = 'added' | 'updated' | 'unchanged' | 'skipped' | 'deprecated';

/** The five classes, in report order. */
export const DIFF_ACTIONS: readonly DiffAction[] = [
  'added',
  'updated',
  'unchanged',
  'skipped',
  'deprecated',
];

/** `reportVersion` of the dry-run report document. */
export const DIFF_REPORT_VERSION = 1;

/**
 * The group name generated-but-dropped nodes are reparented under. Shared with
 * every host applier so the human finds them in one place.
 */
export const DEPRECATED_GROUP = 'Deprecated';

/** The dry-run report: one ascending id list per action. */
export interface DiffReport {
  reportVersion: number;
  added: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  deprecated: string[];
}

/** Per-action counts, as the serialized report carries them. */
export type DiffCounts = Record<DiffAction, number>;

/** Count each class of a report. */
export function diffCounts(report: DiffReport): DiffCounts {
  return {
    added: report.added.length,
    updated: report.updated.length,
    unchanged: report.unchanged.length,
    skipped: report.skipped.length,
    deprecated: report.deprecated.length,
  };
}

function vec3EqualQuantized(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): boolean {
  return (
    quantizeSceneCoord(a.x) === quantizeSceneCoord(b.x) &&
    quantizeSceneCoord(a.y) === quantizeSceneCoord(b.y) &&
    quantizeSceneCoord(a.z) === quantizeSceneCoord(b.z)
  );
}

/**
 * Are two nodes equivalent after coordinate quantization — i.e. would an update
 * be a no-op? `entityId` is the match key, NOT part of the equivalence test.
 */
export function placedNodesEquivalent(a: PlacedNode, b: PlacedNode): boolean {
  if (a.kind !== b.kind) return false;
  if (a.archetype !== b.archetype) return false;
  if (a.assetRef !== b.assetRef) return false;
  if (a.bindingSource !== b.bindingSource) return false;
  if (a.generated !== b.generated) return false;
  if (!vec3EqualQuantized(a.position, b.position)) return false;
  if (!vec3EqualQuantized(a.scale, b.scale)) return false;
  if (quantizeSceneCoord(a.rotationY) !== quantizeSceneCoord(b.rotationY)) return false;
  return true;
}

function indexById(nodes: readonly PlacedNode[]): Map<string, PlacedNode> {
  // Last occurrence wins on a duplicate id (degenerate input), matching every
  // engine leg's map-assignment loop.
  const byId = new Map<string, PlacedNode>();
  for (const n of nodes) byId.set(n.entityId, n);
  return byId;
}

/**
 * Classify every entityId across the old + new node sets. Matched by entityId;
 * pure and deterministic (every id list ascending, ordinal).
 */
export function computeReimportDiff(
  oldNodes: readonly PlacedNode[],
  newNodes: readonly PlacedNode[],
): DiffReport {
  const report: DiffReport = {
    reportVersion: DIFF_REPORT_VERSION,
    added: [],
    updated: [],
    unchanged: [],
    skipped: [],
    deprecated: [],
  };

  const oldById = indexById(oldNodes);
  const newById = indexById(newNodes);

  // NEW-manifest pass: added / skipped (hand edit) / updated / unchanged.
  for (const fresh of newNodes) {
    const existing = oldById.get(fresh.entityId);
    if (existing === undefined) {
      report.added.push(fresh.entityId);
      continue;
    }
    if (!existing.generated) {
      // Hand edit: preserve verbatim, even though the new manifest lists it.
      report.skipped.push(fresh.entityId);
      continue;
    }
    if (placedNodesEquivalent(existing, fresh)) report.unchanged.push(fresh.entityId);
    else report.updated.push(fresh.entityId);
  }

  // OLD-manifest pass for ids absent from NEW: deprecated (generated) or skipped
  // (hand edit kept as-is).
  for (const existing of oldNodes) {
    if (newById.has(existing.entityId)) continue; // handled above
    if (existing.generated) report.deprecated.push(existing.entityId);
    else report.skipped.push(existing.entityId);
  }

  const ascending = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const action of DIFF_ACTIONS) report[action].sort(ascending);
  return report;
}

/**
 * Serialize a report as canonical JSON — the dry-run artifact compared against
 * the cross-engine golden. Key-sorted, minified, deterministic.
 */
export function serializeDiffReport(report: DiffReport): string {
  return canonicalStringify({
    reportVersion: report.reportVersion,
    added: report.added,
    updated: report.updated,
    unchanged: report.unchanged,
    skipped: report.skipped,
    deprecated: report.deprecated,
    counts: diffCounts(report),
  });
}

/**
 * Classify (old, new) and drive `mutator` per the policy, returning the report
 * that was applied. **No mutator ⇒ a pure dry run** (report only), which is how
 * the editor renders a preview before the human confirms.
 *
 * Actions run in the report's canonical (ascending id) order, updates before
 * adds before deprecations; `unchanged` and `skipped` are no-ops by policy, so
 * they have no hook to call.
 */
export function applyReimport(
  oldNodes: readonly PlacedNode[],
  newNodes: readonly PlacedNode[],
  mutator?: SceneMutator | null,
  progress?: ProgressSink,
): DiffReport {
  const report = computeReimportDiff(oldNodes, newNodes);
  const counts = diffCounts(report);

  if (!mutator) {
    progress?.report({
      phase: 'reimport',
      level: 'info',
      message:
        `dry run: ${counts.added} added, ${counts.updated} updated, ` +
        `${counts.unchanged} unchanged, ${counts.skipped} skipped, ` +
        `${counts.deprecated} deprecated`,
    });
    return report;
  }

  const freshById = indexById(newNodes);
  let completed = 0;
  const total = counts.updated + counts.added + counts.deprecated;

  for (const id of report.updated) {
    const fresh = freshById.get(id);
    if (fresh !== undefined) mutator.updateNode(fresh);
    completed++;
  }
  for (const id of report.added) {
    const fresh = freshById.get(id);
    if (fresh !== undefined) mutator.addNode(fresh);
    completed++;
  }
  for (const id of report.deprecated) {
    mutator.deprecateNode(id);
    completed++;
  }

  progress?.report({
    phase: 'reimport',
    level: 'info',
    message: `applied ${completed} scene mutation(s)`,
    completed,
    total,
  });
  return report;
}
