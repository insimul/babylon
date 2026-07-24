/**
 * US-3 — the TypeScript half of the §5 world model: minting canon /
 * playthrough worlds, the `@world(W)` context argument, and its TSV /
 * grounding-pack round-trip.
 *
 * The Prolog half (inheritance, overrides) is `world-inheritance.test.ts`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CONSENSUS_REALITY_WORLD,
  formatCurie,
  insimulEntityId,
  insimulWorldId,
  mongoIdOf,
  worldOfEntity,
} from '../kinp';
import {
  PLAYTHROUGH_SEPARATOR,
  WORLD_CONTEXT_FUNCTOR,
  canonWorldId,
  canonWorldOf,
  holdsGoal,
  insimulWorldChain,
  isPlaythroughWorld,
  parsePlaythroughWorld,
  parseWorldContextCell,
  parseWorldContextTerm,
  playthroughWorldId,
  worldChainFacts,
  worldContextCell,
  worldContextTerm,
  worldFacts,
} from '../worlds';

describe('canon and playthrough worlds (§5)', () => {
  it('mints editor canon as insimul:world:<w>', () => {
    expect(formatCurie(canonWorldId('alderforest'))).toBe('insimul:world:alderforest');
    expect(canonWorldId('alderforest')).toEqual(insimulWorldId('alderforest'));
  });

  it('mints a playthrough as insimul:world:<w>#save-<id>, percent-encoded (§3.1)', () => {
    const play = playthroughWorldId('alderforest', '7f');
    expect(formatCurie(play)).toBe('insimul:world:alderforest%23save-7f');
    // §5 spells the separator literally; §3.1's charset requires the encoding,
    // and sanitization is lossless, so §5's spelling is what comes back.
    expect(mongoIdOf(play)).toBe(`alderforest${PLAYTHROUGH_SEPARATOR}7f`);
  });

  it('splits a playthrough back into its canon world and save id', () => {
    const play = playthroughWorldId('66f0c1a2b3c4d5e6f7081920', 'save-7f');
    const parsed = parsePlaythroughWorld(play);
    expect(parsed).toEqual({
      canon: canonWorldId('66f0c1a2b3c4d5e6f7081920'),
      worldMongoId: '66f0c1a2b3c4d5e6f7081920',
      saveId: 'save-7f',
    });
    expect(isPlaythroughWorld(play)).toBe(true);
    expect(canonWorldOf(play)).toEqual(canonWorldId('66f0c1a2b3c4d5e6f7081920'));
  });

  it('leaves a canon world alone', () => {
    const canon = canonWorldId('alderforest');
    expect(parsePlaythroughWorld(canon)).toBeNull();
    expect(isPlaythroughWorld(canon)).toBe(false);
    expect(canonWorldOf(canon)).toEqual(canon);
    expect(isPlaythroughWorld(CONSENSUS_REALITY_WORLD)).toBe(false);
  });

  it('round-trips ids that need escaping on both sides of the separator', () => {
    const play = playthroughWorldId('Alder Forest', 'Save #7');
    const parsed = parsePlaythroughWorld(play);
    expect(parsed?.worldMongoId).toBe('Alder Forest');
    expect(parsed?.saveId).toBe('Save #7');
  });

  it('refuses an empty save id', () => {
    expect(() => playthroughWorldId('alderforest', '')).toThrow(/empty save id/);
  });
});

describe('the world chain (§5)', () => {
  it('declares consensus-reality ← canon ← playthrough when the fiction opts in', () => {
    const chain = insimulWorldChain('alderforest', { saveId: '7f', inheritsConsensusReality: true });
    expect(chain.declarations.map((d) => formatCurie(d.world))).toEqual([
      'pinakes:world:consensus-reality',
      'insimul:world:alderforest',
      'insimul:world:alderforest%23save-7f',
    ]);
    expect(chain.declarations[1].parent).toEqual(CONSENSUS_REALITY_WORLD);
    expect(chain.declarations[2].parent).toEqual(chain.canon);
  });

  it('does not inherit consensus reality by default (§5: MAY, per-world policy)', () => {
    const chain = insimulWorldChain('alderforest', { saveId: '7f' });
    expect(chain.declarations.map((d) => formatCurie(d.world))).toEqual([
      'insimul:world:alderforest',
      'insimul:world:alderforest%23save-7f',
    ]);
    expect(chain.declarations[0].parent).toBeNull();
  });

  it('declares canon alone when no playthrough has been forked', () => {
    const chain = insimulWorldChain('alderforest');
    expect(chain.playthrough).toBeNull();
    expect(chain.declarations).toHaveLength(1);
  });

  it('marks only the playthrough edge identity-inheriting (§4.5 input)', () => {
    const chain = insimulWorldChain('alderforest', { saveId: '7f', inheritsConsensusReality: true });
    const facts = worldChainFacts(chain.declarations);
    expect(facts.filter((f) => f.startsWith('world_inherits_identity'))).toEqual([
      "world_inherits_identity(id(world, insimul, 'alderforest%23save-7f')).",
    ]);
  });

  it('emits ground facts and no curie/2 (that is identity-facts.ts’s job)', () => {
    const facts = worldFacts({
      world: canonWorldId('alderforest'),
      parent: CONSENSUS_REALITY_WORLD,
      role: 'canon',
    });
    expect(facts).toEqual([
      'world_declared(id(world, insimul, alderforest)).',
      'world_role(id(world, insimul, alderforest), canon).',
      "world_parent(id(world, insimul, alderforest), id(world, pinakes, 'consensus-reality')).",
    ]);
    expect(facts.some((f) => f.startsWith('curie('))).toBe(false);
  });
});

describe('the @world(W) context argument (§11 decision 3)', () => {
  const canon = canonWorldId('alderforest');
  const play = playthroughWorldId('alderforest', '7f');

  it('renders the quoted-atom functor', () => {
    expect(WORLD_CONTEXT_FUNCTOR).toBe('@world');
    expect(worldContextTerm(canon)).toBe("'@world'(id(world, insimul, alderforest))");
    expect(worldContextTerm(play)).toBe("'@world'(id(world, insimul, 'alderforest%23save-7f'))");
  });

  it('round-trips term → world → term', () => {
    for (const world of [canon, play, CONSENSUS_REALITY_WORLD]) {
      expect(parseWorldContextTerm(worldContextTerm(world))).toEqual(world);
    }
  });

  it('round-trips through a flat TSV / grounding-pack cell (§3.2)', () => {
    for (const world of [canon, play, CONSENSUS_REALITY_WORLD]) {
      const cell = worldContextCell(world);
      expect(cell).not.toContain('\t');
      expect(cell).toBe(formatCurie(world));
      expect(parseWorldContextCell(cell)).toEqual(world);
      expect(worldContextTerm(parseWorldContextCell(cell))).toBe(worldContextTerm(world));
    }
  });

  it('rejects a context argument that is not a world', () => {
    expect(() => parseWorldContextTerm("'@world'(id(ent, insimul, npc))")).toThrow(/not a world/);
    expect(() => parseWorldContextTerm('world(alderforest)')).toThrow(/not a '@world'\/1 term/);
    expect(() => parseWorldContextCell('insimul:ent:npc')).toThrow(/not a world CURIE/);
  });

  it('builds a world-relative goal with unbound columns', () => {
    expect(holdsGoal(insimulEntityId('npc-renaud', 'alderforest'), 'P', 'O', play)).toBe(
      "holds(id(ent, 'insimul:world:alderforest', 'npc-renaud'), P, O, " +
        "'@world'(id(world, insimul, 'alderforest%23save-7f')))",
    );
  });
});

/**
 * AC 3 — the mechanism introduces no storage assumptions. A playthrough is a
 * *world identifier*; core neither reads nor writes save-file state, and no
 * entity is scoped by a playthrough id. (Enforcing the equivalent split in
 * platform storage is 82-kinp-identity-platform's story.)
 */
describe('no storage assumptions', () => {
  const identityDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sources = readdirSync(identityDir)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, text: readFileSync(join(identityDir, file), 'utf8') }));

  it('imports no save-file or filesystem module', () => {
    for (const { file, text } of sources) {
      const specifiers = Array.from(text.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/save-file|save_file|node:fs|fs\/promises/);
      }
    }
  });

  it('mentions no playthroughId anywhere in the identity surface', () => {
    for (const { file, text } of sources) {
      expect(text.toLowerCase(), `${file} mentions a playthroughId`).not.toContain('playthroughid');
    }
  });

  it('scopes entities by world, never by playthrough', () => {
    // An entity identifier carries its (canon) world and nothing save-shaped:
    // forking a playthrough does not re-mint the NPC.
    const npc = insimulEntityId('npc-renaud', 'alderforest');
    expect(worldOfEntity(npc)).toEqual(canonWorldId('alderforest'));
    expect(formatCurie(npc)).not.toContain('save');
    // …and the minting helper has no playthrough parameter to pass one through.
    expect(insimulEntityId).toHaveLength(2);
  });
});
