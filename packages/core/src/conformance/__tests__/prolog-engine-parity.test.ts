/**
 * US-2 (91-babylon-prolog-wasm) — the tau-prolog ⟷ wasm parity diff.
 *
 * `prolog-corpus.test.ts` asks "does the shipping engine agree with `expected`?"
 * This file asks the different and harder question: **do the two engines agree
 * with each other?** Two harnesses can both match `expected` and still disagree
 * on solution ORDER, on error WORDING, or on the shape of an unbound binding —
 * and those are precisely the disagreements insimul/server's CLAUDE.md cites as
 * the reason its test-harness routes were delegated to Node rather than ported
 * to Rust. So the gate here is NOT "both legs passed".
 *
 * Every corpus case is run through BOTH engines in ONE process (which is why
 * US-1 made the engine choice a construction argument rather than a build
 * flag), and each observed difference must appear in {@link DIVERGENCES} with a
 * class:
 *
 *   (a) tau-prolog was wrong, the wasm answer is correct;
 *   (b) both are defensible, the SHAPE differs;
 *   (c) the wasm engine is wrong and libinsimul (tasklist 90) needs fixing.
 *
 * A class-(c) entry FAILS this suite — it blocks the tasklist by construction,
 * rather than by someone remembering to check. An unlisted difference fails as
 * "undocumented", the same shape as `COUPLING_VERDICTS` in
 * `scripts/classify-logic-boundary.mjs`.
 *
 * The narrative, the per-divergence evidence and the browser-caller impact live
 * in `packages/core/docs/tau-wasm-parity.md`. The divergences that do NOT show
 * up on the corpus (they live on error paths, on unbound bindings and on
 * predicate NAMES) are probed directly by `engine-behaviour-parity.test.ts` and
 * `engine-builtin-collisions.test.ts` under `src/prolog/__tests__/` — a corpus
 * is a poor place to hope a shape difference happens to surface.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { createPrologEngine, type PrologEngine } from '../../prolog/prolog-engine';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'prolog');

type Binding = Record<string, string | number | boolean | null>;

interface Case {
  name: string;
  kb: string[];
  query: string;
  expected: Binding[];
}

interface CaseFile {
  area: string;
  description: string;
  cases: Case[];
}

/** What one engine did with one case. */
interface Outcome {
  /** `consult` or `query` reported an error. */
  failed: boolean;
  /** The reported error text, when `failed`. */
  error?: string;
  /** Solutions IN THE ORDER THE ENGINE ENUMERATED THEM. */
  bindings: Binding[];
}

interface ReportRow {
  /** `<corpus file>::<case name>`. */
  key: string;
  tau: Outcome;
  wasm: Outcome;
  /** How the two differ, or `null` when they agree. */
  difference: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// The classification table. One entry per case where the engines differ.
// ────────────────────────────────────────────────────────────────────────────

interface Divergence {
  /** `<corpus file>::<case name>` — the key the harness compares against. */
  case: string;
  /** (a) tau wrong · (b) both defensible, shape differs · (c) wasm wrong ⇒ BLOCKS. */
  class: 'a' | 'b' | 'c';
  /** What differs, and why it is classified that way. */
  verdict: string;
}

/**
 * Observed differences over `conformance/prolog/*.json`.
 *
 * Exactly one case in 76 diverges. Everything else — including the enumeration
 * ORDER of all 21 multi-solution cases — is identical between the two engines.
 */
const DIVERGENCES: Divergence[] = [
  {
    case: 'assert-retract.json::asserta-prepends',
    class: 'b',
    verdict:
      'The case uses `log/1` as a user dynamic predicate. ISO reserves `log` only as an ' +
      'EVALUABLE FUNCTOR, so tau-prolog lets a program define `log/1` as a predicate; ' +
      'Trealla additionally registers the arithmetic/list functors (`log`, `sin`, `max`, ' +
      '`gcd`, `sum_list`, …) as STATIC BUILTIN PREDICATES, so `asserta(log(0))` raises ' +
      'permission_error(modify, static_procedure, log/1). Both positions are defensible — ' +
      'tau follows the letter of ISO, Trealla protects its own builtin table — and neither ' +
      'engine returns a WRONG answer for the semantics the case actually tests (asserta ' +
      'prepends). libinsimul reached the same verdict independently and amends this one ' +
      'case by renaming the predicate (conformance/WASM_PARITY.md, "The one amendment"), ' +
      'so it is not news to tasklist 90 and is not class (c). The cost that DID fall on ' +
      'this repo is `sum_list/2` — see D-1 in docs/tau-wasm-parity.md and the standing ' +
      'guard in src/prolog/__tests__/engine-builtin-collisions.test.ts.',
  },
];

// ────────────────────────────────────────────────────────────────────────────

function loadCorpus(): Array<{ file: string; data: CaseFile }> {
  return readdirSync(corpusDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as CaseFile,
    }));
}

const corpus = loadCorpus();
const CASE_COUNT = corpus.reduce((n, { data }) => n + data.cases.length, 0);

function canon(b: Binding): string {
  return JSON.stringify(
    Object.keys(b)
      .sort()
      .map((k) => [k, b[k]]),
  );
}

/** Unordered multiset equality — the corpus's own comparison. */
function sameSolutionSet(a: Binding[], b: Binding[]): boolean {
  if (a.length !== b.length) return false;
  const x = a.map(canon).sort();
  const y = b.map(canon).sort();
  return x.every((v, i) => v === y[i]);
}

/** Ordered equality — stricter, and the axis insimul/server flagged. */
function sameSolutionSequence(a: Binding[], b: Binding[]): boolean {
  return JSON.stringify(a.map(canon)) === JSON.stringify(b.map(canon));
}

/**
 * Run one case on a private engine, then RELEASE it.
 *
 * The release is not optional hygiene. wasm has no finalizers, and holding a
 * KB handle per case exhausts the module's indirect function table partway
 * through the corpus (`RuntimeError: table index is out of bounds`) — which is
 * exactly how this harness failed before `PrologEngine.destroy?()` existed. A
 * private engine per case is also what keeps the two legs comparable: neither
 * sees another case's clauses.
 */
async function run(kind: 'tau' | 'wasm', c: Case): Promise<Outcome> {
  const engine: PrologEngine = await createPrologEngine({ kind });
  try {
    const consulted = await engine.consult(c.kb.join('\n'));
    if (!consulted.success) return { failed: true, error: consulted.error, bindings: [] };
    const result = await engine.query(c.query);
    if (!result.success) return { failed: true, error: result.error, bindings: [] };
    return { failed: false, bindings: result.bindings };
  } finally {
    engine.destroy?.();
  }
}

/** Human-readable account of how two outcomes differ, or `null` if they agree. */
function describeDifference(tau: Outcome, wasm: Outcome): string | null {
  if (tau.failed || wasm.failed) {
    // Both refusing is agreement at this granularity; the WORDING axis is
    // probed on its own in `engine-behaviour-parity.test.ts`, where the
    // divergence is unconditional and a corpus case would only sample it.
    if (tau.failed && wasm.failed) return null;
    return tau.failed
      ? `tau errored (${tau.error}); wasm returned ${JSON.stringify(wasm.bindings)}`
      : `wasm errored (${wasm.error}); tau returned ${JSON.stringify(tau.bindings)}`;
  }
  if (!sameSolutionSet(tau.bindings, wasm.bindings)) {
    return (
      `different solution SETS — tau ${JSON.stringify(tau.bindings)} ` +
      `vs wasm ${JSON.stringify(wasm.bindings)}`
    );
  }
  if (!sameSolutionSequence(tau.bindings, wasm.bindings)) {
    return (
      `same set, different ORDER — tau ${JSON.stringify(tau.bindings)} ` +
      `vs wasm ${JSON.stringify(wasm.bindings)}`
    );
  }
  return null;
}

// One shared run: building 152 engines is the expensive part and every
// assertion below reads the same evidence.
const report: ReportRow[] = [];
let tauExecuted = 0;
let wasmExecuted = 0;

beforeAll(async () => {
  for (const { file, data } of corpus) {
    for (const c of data.cases) {
      const tau = await run('tau', c);
      tauExecuted++;
      const wasm = await run('wasm', c);
      wasmExecuted++;
      report.push({
        key: `${file}::${c.name}`,
        tau,
        wasm,
        difference: describeDifference(tau, wasm),
      });
    }
  }
}, 600_000);

describe('tau ⟷ wasm parity over the Prolog conformance corpus', () => {
  it('executes a non-zero and EQUAL number of cases on both engines', () => {
    // A harness that runs nothing must fail, not pass.
    expect(CASE_COUNT).toBeGreaterThan(0);
    expect(corpus.length).toBeGreaterThan(0);
    expect(tauExecuted).toBe(CASE_COUNT);
    expect(wasmExecuted).toBe(CASE_COUNT);
    expect(tauExecuted).toBe(wasmExecuted);
    expect(report).toHaveLength(CASE_COUNT);

    // …and both legs must really have SOLVED things, not merely not crashed.
    expect(report.filter((r) => !r.tau.failed).length).toBeGreaterThan(CASE_COUNT - 5);
    expect(report.filter((r) => !r.wasm.failed).length).toBeGreaterThan(CASE_COUNT - 5);
    expect(report.filter((r) => r.tau.bindings.length > 0).length).toBeGreaterThan(40);
    expect(report.filter((r) => r.wasm.bindings.length > 0).length).toBeGreaterThan(40);
  });

  it('names every case where the engines differ, and each one is classified', () => {
    const differing = report.filter((r) => r.difference !== null);
    const listed = new Map(DIVERGENCES.map((d) => [d.case, d]));

    // The report, in full — the deliverable is the NAMES, not a pass count.
    const rendered = differing
      .map((r) => {
        const d = listed.get(r.key);
        return `  ${r.key}\n    difference: ${r.difference}\n    class: ${d ? d.class : 'UNCLASSIFIED'}`;
      })
      .join('\n');

    const undocumented = differing.filter((r) => !listed.has(r.key)).map((r) => r.key);
    expect(
      undocumented,
      'UNDOCUMENTED engine divergence(s). Add an entry to DIVERGENCES with a class and a ' +
        `verdict, and a row in docs/tau-wasm-parity.md.\nFull report:\n${rendered}`,
    ).toEqual([]);

    const stale = DIVERGENCES.map((d) => d.case).filter(
      (key) => !differing.some((r) => r.key === key),
    );
    expect(
      stale,
      `DIVERGENCES lists case(s) that no longer differ — delete them.\nFull report:\n${rendered}`,
    ).toEqual([]);

    expect(differing).toHaveLength(DIVERGENCES.length);
  });

  it('blocks the tasklist on any class-(c) divergence', () => {
    const blocking = DIVERGENCES.filter((d) => d.class === 'c').map(
      (d) => `${d.case}: ${d.verdict}`,
    );
    expect(
      blocking,
      'class (c) means the WASM engine is wrong — libinsimul (tasklist 90) must fix it ' +
        'before US-3 makes wasm the default. This suite fails while any such entry stands.',
    ).toEqual([]);
  });

  it('gives every classification a real verdict', () => {
    for (const d of DIVERGENCES) {
      expect(['a', 'b', 'c']).toContain(d.class);
      expect(d.verdict.length, `${d.case} needs a verdict`).toBeGreaterThan(80);
      expect(d.case).toMatch(/^[\w.-]+\.json::.+$/);
    }
    // Duplicate keys would let one entry silently cover two divergences.
    expect(new Set(DIVERGENCES.map((d) => d.case)).size).toBe(DIVERGENCES.length);
  });

  it('finds NO solution-order divergence on any multi-solution case', () => {
    // One of the two disagreements insimul/server cites for delegating its
    // harness routes to Node. It does not reproduce here.
    const multi = report.filter((r) => !r.tau.failed && r.tau.bindings.length > 1);
    // Non-vacuity: were the corpus to lose its multi-solution cases, this check
    // would pass by examining nothing.
    expect(multi.length).toBeGreaterThanOrEqual(15);

    const reordered = multi
      .filter((r) => !r.wasm.failed)
      .filter((r) => !sameSolutionSequence(r.tau.bindings, r.wasm.bindings))
      .map((r) => `${r.key}: tau ${JSON.stringify(r.tau.bindings)} vs wasm ${JSON.stringify(r.wasm.bindings)}`);
    expect(
      reordered,
      'Solution ORDER diverged. Record it in docs/tau-wasm-parity.md and in DIVERGENCES: ' +
        'the corpus compares solutions as an unordered multiset, so a native engine may ' +
        'enumerate in any order — but a browser caller that reads bindings[0] cannot.',
    ).toEqual([]);
  });
});
