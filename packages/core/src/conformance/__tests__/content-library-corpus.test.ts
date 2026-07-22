/**
 * US-CL2 — content-library (world artifact) conformance corpus runner.
 *
 * Validates every fixture under `packages/core/conformance/content-library/*.json`
 * against the US-CL1 `contentLibrarySchema`. These JSON files are the shared
 * golden every per-engine importer (TS, and the future native/Unity/Unreal/Godot
 * legs) validates against, so the assertions here are the *importer* contract,
 * not just the schema's:
 *
 *  - the fixture parses, and parsing is **lossless** — `.passthrough()` means an
 *    importer sees every authored field, including ones the schema hasn't
 *    tightened yet;
 *  - ids are unique within each section, so an importer may key on them;
 *  - every cross-reference (`assignedBy`, `prerequisiteQuestIds`, `mayorId`,
 *    `homeTownId`) is a **library-scoped** id that resolves inside the same
 *    library — an importer never needs a world/db lookup to link the graph;
 *  - the optional `prologFacts` KB slice uses only predicate-schema-registered
 *    predicates, so it stays world- and engine-portable.
 *
 * The corpus as a whole must populate all five entity kinds (`riverside-starter`
 * does) while still proving the empty-section discipline (`minimal`).
 *
 * See `conformance/README.md` (§ "Content-library fixture format").
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validatePrologFact } from '../../prolog/prolog-fact-validator';
import { getCurrentPredicateSchema } from '../../prolog/prolog-schema-diff';
import {
  CONTENT_LIBRARY_CONTRACT_VERSION,
  contentLibrarySchema,
  type ContentLibrarySchema,
} from '../../schemas/content-library.schema';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'content-library');

/** The five REQUIRED section headers, in contract order. */
const SECTIONS = ['items', 'quests', 'characters', 'towns', 'narratives'] as const;
type Section = (typeof SECTIONS)[number];

/** name/arity signatures a fixture's `prologFacts` are validated against. */
const KNOWN_SIGNATURES = new Set(
  getCurrentPredicateSchema().map((e) => `${e.name}/${e.arity}`),
);

interface Fixture {
  file: string;
  raw: unknown;
}

function loadCorpus(): Fixture[] {
  return readdirSync(corpusDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      raw: JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as unknown,
    }));
}

/** Ids declared by a section, in file order. */
function idsOf(library: ContentLibrarySchema, section: Section): string[] {
  return (library[section] as Array<{ id: string }>).map((e) => e.id);
}

const corpus = loadCorpus();
/** Every fixture, pre-parsed — the parse itself is asserted below. */
const parsed = corpus.map((f) => ({
  file: f.file,
  raw: f.raw,
  library: contentLibrarySchema.parse(f.raw),
}));

describe('Content-library conformance corpus', () => {
  it('loads the required fixtures', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(2);
    const files = corpus.map((f) => f.file);
    // `minimal` pins the empty-section discipline; `riverside-starter` is the
    // full-coverage golden importers link their entity graph against.
    expect(files).toContain('minimal.json');
    expect(files).toContain('riverside-starter.json');
  });

  it('has a globally unique libraryId per fixture', () => {
    const ids = parsed.map((p) => p.library.manifest.libraryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every entity kind across the corpus', () => {
    for (const section of SECTIONS) {
      const total = parsed.reduce((n, p) => n + p.library[section].length, 0);
      expect(total, `no fixture populates "${section}"`).toBeGreaterThan(0);
    }
  });

  it('still exercises the empty-section discipline', () => {
    const minimal = parsed.find((p) => p.file === 'minimal.json')!.library;
    for (const section of SECTIONS) {
      expect(minimal[section]).toEqual([]);
    }
  });

  for (const { file, raw, library } of parsed) {
    describe(file, () => {
      it('parses against contentLibrarySchema', () => {
        expect(contentLibrarySchema.safeParse(raw).success).toBe(true);
      });

      it('parses losslessly (passthrough keeps unrecognised authored fields)', () => {
        expect(library).toEqual(raw);
      });

      it('declares the current contract version and a positive library revision', () => {
        expect(library.manifest.contractVersion).toBe(CONTENT_LIBRARY_CONTRACT_VERSION);
        expect(library.manifest.version).toBeGreaterThan(0);
        expect(library.manifest.provenance.license.length).toBeGreaterThan(0);
      });

      it('has unique ids within each section', () => {
        for (const section of SECTIONS) {
          const ids = idsOf(library, section);
          expect(new Set(ids).size, `duplicate id in "${section}"`).toBe(ids.length);
        }
      });

      it('resolves every cross-reference against a library-scoped id', () => {
        const characterIds = new Set(idsOf(library, 'characters'));
        const questIds = new Set(idsOf(library, 'quests'));
        const townIds = new Set(idsOf(library, 'towns'));

        for (const quest of library.quests) {
          if (quest.assignedBy != null) {
            expect(characterIds, `quest ${quest.id}.assignedBy`).toContain(quest.assignedBy);
          }
          for (const prereq of quest.prerequisiteQuestIds ?? []) {
            expect(questIds, `quest ${quest.id}.prerequisiteQuestIds`).toContain(prereq);
          }
        }
        for (const character of library.characters) {
          if (character.homeTownId != null) {
            expect(townIds, `character ${character.id}.homeTownId`).toContain(
              character.homeTownId,
            );
          }
        }
        for (const town of library.towns) {
          if (town.mayorId != null) {
            expect(characterIds, `town ${town.id}.mayorId`).toContain(town.mayorId);
          }
        }
      });

      it('carries only schema-registered predicates in prologFacts', () => {
        for (const fact of library.prologFacts ?? []) {
          const res = validatePrologFact(fact, KNOWN_SIGNATURES);
          expect(
            res.valid,
            `fact "${fact}" rejected — ${res.valid ? '' : res.reason}`,
          ).toBe(true);
        }
      });
    });
  }
});
