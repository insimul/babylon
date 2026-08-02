/**
 * US-CE5 — golden Prolog query corpus runner.
 *
 * Executes every JSON case under `packages/core/conformance/prolog/*.json`
 * against the runtime Prolog engine and asserts the produced solution set
 * equals the case's `expected` (compared as an unordered multiset). These same
 * JSON files are the parity gate libinsimul's C, Rust and wasm harnesses read —
 * see `conformance/README.md` for the case format.
 *
 * ── Amendments (US-3, 91-babylon-prolog-wasm) ───────────────────────────────
 *
 * The corpus was authored against tau-prolog, and is deliberately left
 * UNAMENDED on disk: it is the source copy the native repos vendor
 * byte-identically, so editing a case to please one engine would erase the
 * evidence downstream. One case names a predicate Trealla owns as a builtin.
 * Rather than skip it — a skip is how a corpus quietly shrinks — this runner
 * carries an {@link AMENDMENTS} table, applies the rewrite in memory, and
 * PRINTS an `[AMEND]` line, exactly as libinsimul's three harnesses do
 * (`insimul-native/conformance/WASM_PARITY.md`, "The one amendment").
 *
 * The table cannot rot: every case is run UNAMENDED first, so an amendment
 * that is no longer needed fails as stale, and a case that newly needs one
 * fails as unamended rather than being silently patched.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

/**
 * A documented, printed rewrite applied to ONE case before it is run.
 *
 * Keep in lockstep with the `AMENDMENTS` tables in libinsimul's
 * `tests/conformance.c`, `rust/insimul/tests/conformance.rs` and
 * `tests/wasm_conformance.mjs` — all four legs read the same corpus files and
 * must therefore apply the same rewrites.
 */
interface Amendment {
  /** `<corpus file>::<case name>`. */
  case: string;
  /** Why the corpus text cannot run as written. */
  reason: string;
  /** The in-memory rewrite. Applied to `kb`, `query` and `expected` alike. */
  rewrite: (text: string) => string;
}

const AMENDMENTS: Amendment[] = [
  {
    case: 'assert-retract.json::asserta-prepends',
    reason:
      'The case uses `log/1` as a user dynamic predicate. ISO reserves `log` only as an ' +
      'EVALUABLE FUNCTOR, so tau-prolog (which the corpus was authored against) lets a ' +
      'program define `log/1` as a predicate; Trealla additionally registers the ' +
      'arithmetic/list functors as STATIC BUILTIN predicates, so `asserta(log(0))` raises ' +
      'permission_error(modify, static_procedure, log/1). The case tests asserta-before- ' +
      'assertz ORDERING, not the name, so the predicate is renamed — the same rename ' +
      'libinsimul applies in all three of its harnesses. See D-2 in docs/tau-wasm-parity.md.',
    rewrite: (text) => text.replace(/\blog\(/g, 'entry('),
  },
];

const AMENDMENTS_BY_CASE = new Map(AMENDMENTS.map((a) => [a.case, a]));

/** Apply an amendment to a whole case (kb + query + expected bindings). */
function amend(c: Case, a: Amendment): Case {
  return {
    name: c.name,
    kb: c.kb.map(a.rewrite),
    query: a.rewrite(c.query),
    expected: JSON.parse(a.rewrite(JSON.stringify(c.expected))) as Binding[],
  };
}

function loadCorpus(): Array<{ file: string; data: CaseFile }> {
  return readdirSync(corpusDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as CaseFile,
    }));
}

/** Canonicalize a binding to a stable string (keys sorted) for set comparison. */
function canon(b: Binding): string {
  const keys = Object.keys(b).sort();
  return JSON.stringify(keys.map((k) => [k, b[k]]));
}

/** Compare two solution lists as unordered multisets. */
function sameSolutionSet(actual: Binding[], expected: Binding[]): boolean {
  if (actual.length !== expected.length) return false;
  const a = actual.map(canon).sort();
  const e = expected.map(canon).sort();
  return a.every((v, i) => v === e[i]);
}

/**
 * Run one case on a private engine, then RELEASE it — wasm has no finalizers,
 * and one live KB per case exhausts the module's indirect function table
 * partway through the corpus (see `PrologEngine.destroy`).
 */
async function runCase(c: Case): Promise<Binding[]> {
  const engine: PrologEngine = await createPrologEngine();
  try {
    const consulted = await engine.consult(c.kb.join('\n'));
    if (!consulted.success) {
      throw new Error(`consult failed for "${c.name}": ${consulted.error}`);
    }
    const result = await engine.query(c.query);
    if (!result.success) {
      throw new Error(`query failed for "${c.name}": ${result.error}`);
    }
    return result.bindings;
  } finally {
    engine.destroy?.();
  }
}

/**
 * Run a case, falling back to its listed amendment if — and only if — the case
 * as authored does not run on this engine.
 *
 * Unamended-first is what keeps {@link AMENDMENTS} honest: an entry that is no
 * longer needed reports `stale`, and a case that starts needing one reports
 * `unamended` instead of quietly getting patched.
 */
async function runCaseWithAmendments(
  key: string,
  c: Case,
): Promise<{ actual: Binding[]; expected: Binding[]; amended: boolean; stale: boolean }> {
  const amendment = AMENDMENTS_BY_CASE.get(key);
  try {
    return { actual: await runCase(c), expected: c.expected, amended: false, stale: !!amendment };
  } catch (err) {
    if (!amendment) throw err;
    const patched = amend(c, amendment);
    // eslint-disable-next-line no-console
    console.log(`[AMEND] ${key} — ${String(err).split('\n')[0]}`);
    return {
      actual: await runCase(patched),
      expected: patched.expected,
      amended: true,
      stale: false,
    };
  }
}

const corpus = loadCorpus();

describe('Prolog conformance corpus', () => {
  it('lists an amendment only for cases that still need one', () => {
    // Every amendment names a case that exists. (Whether it is still NEEDED is
    // asserted per case below, where the unamended run happens.)
    const keys = new Set(
      corpus.flatMap(({ file, data }) => data.cases.map((c) => `${file}::${c.name}`)),
    );
    for (const a of AMENDMENTS) {
      expect(keys, `AMENDMENTS names a case that is not in the corpus: ${a.case}`).toContain(a.case);
      expect(a.reason.length, `${a.case} needs a reason`).toBeGreaterThan(80);
    }
    expect(new Set(AMENDMENTS.map((a) => a.case)).size).toBe(AMENDMENTS.length);
  });

  it('loads at least 25 cases across the required semantic areas', () => {
    const total = corpus.reduce((n, { data }) => n + data.cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(25);

    const areas = new Set(corpus.map(({ data }) => data.area));
    for (const required of [
      'unification',
      'backtracking',
      'lists',
      'negation-as-failure',
      'arithmetic',
      'assert-retract',
      'gameplay-predicates',
      'kinp-identity',
      'kinp-equivalence',
      'kinp-worlds',
    ]) {
      expect(areas, `missing area file for "${required}"`).toContain(required);
    }
  });

  for (const { file, data } of corpus) {
    describe(`${file} (${data.area})`, () => {
      it('has a unique name per case', () => {
        const names = data.cases.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
      });

      it.each(data.cases.map((c) => [c.name, c] as const))(
        'case %s',
        async (_name, c) => {
          const key = `${file}::${c.name}`;
          const { actual, expected, stale } = await runCaseWithAmendments(key, c);
          expect(
            stale,
            `AMENDMENTS lists ${key}, but the case now runs as authored — delete the entry ` +
              '(and the matching one in libinsimul\'s harnesses).',
          ).toBe(false);
          expect(
            sameSolutionSet(actual, expected),
            `expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
          ).toBe(true);
        },
      );
    });
  }
});
