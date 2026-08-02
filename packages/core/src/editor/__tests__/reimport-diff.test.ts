/**
 * US-2 of `101-editor-plugin-core` — the re-import diff policy.
 *
 * The five-way classification over the shared fixture lives in
 * `conformance/editor/reimport.json`. Here: the equivalence axes one at a time,
 * the apply orchestration's ordering and dry-run contract, and — explicitly —
 * the two §4.3 gaps this story consolidates WITHOUT changing, so that a later
 * story fixing them has a test that says what today's behaviour is.
 */

import { describe, expect, it } from 'vitest';

import {
  DEPRECATED_GROUP,
  DIFF_REPORT_VERSION,
  applyReimport,
  computeReimportDiff,
  diffCounts,
  placedNodesEquivalent,
  serializeDiffReport,
} from '../reimport';
import type { PlacedNode } from '../scene';
import { RecordingProgressSink, RecordingSceneMutator } from '../host-contracts';

function node(entityId: string, over: Partial<PlacedNode> = {}): PlacedNode {
  return {
    entityId,
    kind: 'prop',
    archetype: 'prop.tree',
    assetRef: 'placeholder:prop',
    bindingSource: 'insimul-placeholder',
    position: { x: 1, y: 2, z: 3 },
    rotationY: 0,
    scale: { x: 1, y: 1, z: 1 },
    generated: true,
    ...over,
  };
}

describe('placedNodesEquivalent', () => {
  it('ignores the entityId — it is the match key, not part of the comparison', () => {
    expect(placedNodesEquivalent(node('a'), node('b'))).toBe(true);
  });

  it('compares transforms only after quantization', () => {
    expect(placedNodesEquivalent(node('a'), node('a', { position: { x: 1.00004, y: 2, z: 3 } }))).toBe(
      true,
    );
    expect(placedNodesEquivalent(node('a'), node('a', { position: { x: 1.002, y: 2, z: 3 } }))).toBe(
      false,
    );
    expect(placedNodesEquivalent(node('a'), node('a', { rotationY: 0.002 }))).toBe(false);
    expect(placedNodesEquivalent(node('a'), node('a', { scale: { x: 2, y: 1, z: 1 } }))).toBe(false);
  });

  it('compares every identity/binding field', () => {
    for (const over of [
      { kind: 'building' },
      { archetype: 'prop.rock' },
      { assetRef: 'other' },
      { bindingSource: 'project' },
      { generated: false },
    ] as Partial<PlacedNode>[]) {
      expect(placedNodesEquivalent(node('a'), node('a', over)), JSON.stringify(over)).toBe(false);
    }
  });
});

describe('computeReimportDiff', () => {
  it('never touches a hand edit — present in NEW or absent from it', () => {
    const report = computeReimportDiff(
      [node('kept', { generated: false }), node('gone', { generated: false })],
      [node('kept', { position: { x: 99, y: 0, z: 0 } })],
    );
    expect(report.skipped).toEqual(['gone', 'kept']);
    expect(report.updated).toEqual([]);
    expect(report.deprecated).toEqual([]);
  });

  it('deprecates a dropped GENERATED node rather than deleting it', () => {
    const report = computeReimportDiff([node('dropped')], []);
    expect(report.deprecated).toEqual(['dropped']);
    expect(DEPRECATED_GROUP).toBe('Deprecated');
  });

  it('sorts every class ascending and stamps the report version', () => {
    const report = computeReimportDiff([], [node('c'), node('a'), node('b')]);
    expect(report.added).toEqual(['a', 'b', 'c']);
    expect(report.reportVersion).toBe(DIFF_REPORT_VERSION);
    expect(diffCounts(report)).toEqual({
      added: 3,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deprecated: 0,
    });
  });

  it('lets the last occurrence win on a duplicate id (degenerate input)', () => {
    // Two nodes claiming the same id: the later one is what the scene has.
    const report = computeReimportDiff(
      [node('dup', { archetype: 'prop.a' }), node('dup', { archetype: 'prop.b' })],
      [node('dup', { archetype: 'prop.b' })],
    );
    expect(report.unchanged).toEqual(['dup']);
    expect(report.updated).toEqual([]);
  });

  it('is a pure function — the inputs are not mutated', () => {
    const oldNodes = [node('a')];
    const newNodes = [node('a', { position: { x: 9, y: 9, z: 9 } })];
    const snapshot = JSON.stringify([oldNodes, newNodes]);
    computeReimportDiff(oldNodes, newNodes);
    expect(JSON.stringify([oldNodes, newNodes])).toBe(snapshot);
  });
});

describe('§4.3 — what the policy does NOT protect (recorded, not fixed)', () => {
  it('gap 1: a creator’s nudge to a still-generated node is classified `updated` and overwritten', () => {
    // The `generated` flag is opt-out with no per-field ownership: move a
    // generated node without clearing the flag and the next import re-applies
    // the manifest transform over the edit. Fixing this is a policy CHANGE that
    // needs a creator-facing design — consolidating it here is what makes it a
    // one-place fix later.
    const nudged = node('bld.a', { position: { x: 10.5, y: 0, z: 5 } });
    const fresh = node('bld.a', { position: { x: 10, y: 0, z: 5 } });
    const mutator = new RecordingSceneMutator();
    applyReimport([nudged], [fresh], mutator);
    expect(mutator.calls).toEqual(['update:bld.a']);
    expect(mutator.updated).toEqual(['bld.a']);

    // Clearing `generated` is the only way to keep it — and it also opts the
    // node out of every future fix.
    const optedOut = node('bld.a', { position: { x: 10.5, y: 0, z: 5 }, generated: false });
    const kept = new RecordingSceneMutator();
    applyReimport([optedOut], [fresh], kept);
    expect(kept.calls).toEqual([]);
  });

  it('gap 2: a generated node reorganised out of OLD comes back as a duplicate `added`', () => {
    // Only direct children of the generated root are read into OLD, so a node
    // the creator moved into their own sub-group is simply absent — and the
    // fresh manifest still lists it.
    const oldNodesAfterReorganising: PlacedNode[] = [];
    const report = computeReimportDiff(oldNodesAfterReorganising, [node('prop.moved')]);
    expect(report.added).toEqual(['prop.moved']);
    expect(report.unchanged).toEqual([]);
  });
});

describe('applyReimport', () => {
  const oldNodes = [node('u'), node('d'), node('s', { generated: false })];
  const newNodes = [node('u', { archetype: 'prop.rock' }), node('a'), node('s')];

  it('drives updates, then adds, then deprecations, each ascending', () => {
    const mutator = new RecordingSceneMutator();
    const report = applyReimport(oldNodes, newNodes, mutator);
    expect(mutator.calls).toEqual(['update:u', 'add:a', 'deprecate:d']);
    expect(report.skipped).toEqual(['s']);
  });

  it('hands the mutator the FRESH node, never the stale one', () => {
    const seen: PlacedNode[] = [];
    applyReimport(oldNodes, newNodes, {
      updateNode: (n) => seen.push(n),
      addNode: () => {},
      deprecateNode: () => {},
    });
    expect(seen.map((n) => n.archetype)).toEqual(['prop.rock']);
  });

  it('is a pure dry run with no mutator, and with an explicitly null one', () => {
    const expected = computeReimportDiff(oldNodes, newNodes);
    expect(applyReimport(oldNodes, newNodes)).toEqual(expected);
    expect(applyReimport(oldNodes, newNodes, null)).toEqual(expected);
  });

  it('reports progress differently for a dry run and an applied run', () => {
    const dry = new RecordingProgressSink();
    applyReimport(oldNodes, newNodes, null, dry);
    expect(dry.steps[0].message).toContain('dry run: 1 added, 1 updated');

    const applied = new RecordingProgressSink();
    applyReimport(oldNodes, newNodes, new RecordingSceneMutator(), applied);
    expect(applied.steps[0]).toEqual({
      phase: 'reimport',
      level: 'info',
      message: 'applied 3 scene mutation(s)',
      completed: 3,
      total: 3,
    });
  });
});

describe('serializeDiffReport', () => {
  it('is canonical: key-sorted, minified, and stable across runs', () => {
    const report = computeReimportDiff([node('d')], [node('a')]);
    const json = serializeDiffReport(report);
    expect(json).toBe(
      '{"added":["a"],"counts":{"added":1,"deprecated":1,"skipped":0,"unchanged":0,"updated":0},' +
        '"deprecated":["d"],"reportVersion":1,"skipped":[],"unchanged":[],"updated":[]}',
    );
    expect(serializeDiffReport(computeReimportDiff([node('d')], [node('a')]))).toBe(json);
  });
});
