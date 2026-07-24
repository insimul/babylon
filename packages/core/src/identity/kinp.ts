/**
 * KINP — Koine Identity & Namespace Protocol, core surface (US-1).
 *
 * Implements the identifier grammar of `koine/specs/identity.md` (spec 0.2.1)
 * for `@insimul/core`:
 *
 *   - canonical IRI    `https://id.koine.example/<kind>/<namespace>/<local-id>`  (§3.1)
 *   - compact CURIE    `<namespace>:<kind>:<local-id>`                            (§3.2)
 *   - Prolog term      `id(Kind, Namespace, LocalId)`                             (§3.3)
 *   - prefix registry  `<namespace>` → minting authority + IRI root               (§3.4)
 *
 * **Prolog stays canonical.** The three forms above are interchangeable views of
 * the same identifier; `id/3` is the one the Prolog KB (and the future native
 * `libinsimul`) reasons over. Nothing here derives identity from an entity's
 * attributes (§0 axiom 1) and nothing requires an authority round-trip to mint
 * (§6) — a local id is minted from the producer's own id space.
 *
 * Insimul binding (adoption map, §10):
 *
 *   | Insimul thing            | CURIE                                  |
 *   |--------------------------|----------------------------------------|
 *   | a world                  | `insimul:world:<w>`                    |
 *   | a global entity          | `insimul:ent:<id>`                     |
 *   | an entity inside world w | `insimul:world:<w>:ent:<id>`           |
 *   | a provisional local      | `insimul:local:<id>`                   |
 *
 * A world-scoped entity uses its world's CURIE **as its namespace** (§3.4), so
 * the world an entity belongs to is recoverable from the identifier alone — that
 * is what lets the §4.3 firewall and the §5 world model work off `id/3` terms
 * without a side table.
 *
 * The per-predicate map from Insimul's Mongo `_id` atoms onto these CURIEs lives
 * in `../prolog/predicate-schema` (`buildPredicateIdMap`); the Prolog-side
 * accessors live in `./identity-predicates`.
 */

/** Spec revision this module implements (`koine/specs/identity.md`). */
export const KINP_SPEC_VERSION = '0.2.1';

/**
 * Ecosystem identity domain (§3.1). Placeholder until the production root is
 * chosen — CURIEs, not IRIs, are what Insimul stores, so a root change does not
 * rewrite any Prolog fact.
 */
export const KINP_IRI_ROOT = 'https://id.koine.example';

/** The six identifiable kinds (§3.1). */
export type KinpKind = 'ent' | 'claim' | 'asset' | 'world' | 'agent' | 'src';

export const KINP_KINDS: readonly KinpKind[] = ['ent', 'claim', 'asset', 'world', 'agent', 'src'];

/** A KINP identifier in its structural (Prolog `id/3`) form. */
export interface KinpId {
  kind: KinpKind;
  /** Minting authority, or a world CURIE for world-scoped entities (§3.4). */
  namespace: string;
  /** Opaque within the namespace; `[a-z0-9][a-z0-9._-]*` (§3.1). */
  localId: string;
}

export interface KinpNamespaceEntry {
  /** Human name of the minting authority. */
  authority: string;
  /** IRI root the namespace's identifiers resolve against. */
  iriRoot: string;
  /** True for authorities outside the Koine ecosystem (anchoring only, §4.4). */
  external?: boolean;
  note?: string;
}

/**
 * Prefix registry (§3.4). New namespaces are added by PR to the spec's table;
 * this mirror is the machine-readable copy core reasons with.
 */
export const KINP_NAMESPACE_REGISTRY: Readonly<Record<string, KinpNamespaceEntry>> = {
  pinakes: {
    authority: 'Pinakes',
    iriRoot: KINP_IRI_ROOT,
    note: 'Canonical authority for real-world entities (§6, §11 decision 1).',
  },
  insimul: {
    authority: 'Insimul',
    iriRoot: KINP_IRI_ROOT,
    note: 'Worlds are namespaced further: entities inside world w use `insimul:world:<w>`.',
  },
  analyzer: { authority: 'Analyzer', iriRoot: KINP_IRI_ROOT },
  composer: { authority: 'Composer', iriRoot: KINP_IRI_ROOT },
  orchestrator: { authority: 'Orchestrator', iriRoot: KINP_IRI_ROOT },
  wikidata: {
    authority: 'Wikidata',
    iriRoot: 'https://www.wikidata.org/entity',
    external: true,
    note: 'Primary real-world anchor (§4.4).',
  },
  musicbrainz: {
    authority: 'MusicBrainz',
    iriRoot: 'https://musicbrainz.org',
    external: true,
  },
  geonames: {
    authority: 'GeoNames',
    iriRoot: 'https://sws.geonames.org',
    external: true,
  },
};

/** Insimul's own namespace segment. */
export const INSIMUL_NAMESPACE = 'insimul';

/** Pinakes — the canonical authority for real-world entities (§6, §11 decision 1). */
export const PINAKES_NAMESPACE = 'pinakes';

// ─── Local-id sanitization (lossless) ───────────────────────────────────────
//
// A Mongo `_id` is an arbitrary string (ObjectId hex in practice, but authored
// content uses slugs). §3.1 restricts a local id to `[a-z0-9][a-z0-9._-]*`,
// "percent-encode anything else". Percent-encoding is reversible, so the whole
// Mongo `_id` ⇄ CURIE ⇄ `id/3` chain is lossless — `unsanitizeLocalId` recovers
// the original byte-for-byte. Hex ObjectIds pass through untouched.

/** Characters a local id may contain verbatim (§3.1). */
const LOCAL_ID_PASSTHROUGH = /[a-z0-9._-]/;
/** A local id must start with an alphanumeric (§3.1). */
const LOCAL_ID_HEAD = /[a-z0-9]/;
/**
 * Prefix stamped on a local id whose first character had to be escaped. A
 * NON-guarded encoding can never start with it (the encoder guards that case
 * too), so decoding is unambiguous.
 */
const LOCAL_ID_GUARD = 'x-';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function percentEncodeChar(ch: string): string {
  let out = '';
  for (const byte of utf8Encoder.encode(ch)) {
    out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

function encodeLocalIdBody(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += LOCAL_ID_PASSTHROUGH.test(ch) ? ch : percentEncodeChar(ch);
  }
  return out;
}

/**
 * Encode an arbitrary source id (a Mongo `_id`, an authored slug) as a KINP
 * local id. Lossless — see `unsanitizeLocalId`.
 */
export function sanitizeLocalId(raw: string): string {
  if (!raw) throw new Error('sanitizeLocalId: empty id');
  const body = encodeLocalIdBody(raw);
  if (LOCAL_ID_HEAD.test(body[0]) && !body.startsWith(LOCAL_ID_GUARD)) return body;
  const [first, ...rest] = Array.from(raw);
  return LOCAL_ID_GUARD + percentEncodeChar(first) + encodeLocalIdBody(rest.join(''));
}

/** Inverse of `sanitizeLocalId`. */
export function unsanitizeLocalId(local: string): string {
  const body = local.startsWith(LOCAL_ID_GUARD) ? local.slice(LOCAL_ID_GUARD.length) : local;
  const bytes: number[] = [];
  let out = '';
  const flush = () => {
    if (bytes.length === 0) return;
    out += utf8Decoder.decode(new Uint8Array(bytes));
    bytes.length = 0;
  };
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(body.slice(i + 1, i + 3))) {
      bytes.push(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    flush();
    out += body[i];
  }
  flush();
  return out;
}

/**
 * True when `s` satisfies the §3.1 local-id grammar: `[a-z0-9][a-z0-9._-]*`
 * with anything else percent-encoded (uppercase hex, as `sanitizeLocalId`
 * emits).
 */
export function isValidLocalId(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]|%[0-9A-F]{2})*$/.test(s);
}

// ─── CURIE / IRI / Prolog term forms ────────────────────────────────────────

/** Render `<namespace>:<kind>:<local-id>` (§3.2). */
export function formatCurie(id: KinpId): string {
  return `${id.namespace}:${id.kind}:${id.localId}`;
}

/**
 * Parse a CURIE. The namespace may itself contain `:` (a world-scoped entity's
 * namespace is a world CURIE, §3.4), so parsing anchors on the *last two*
 * segments: `<…namespace…>:<kind>:<local-id>`. Unambiguous because a local id
 * never contains `:` and the kind comes from a closed set.
 */
export function parseCurie(curie: string): KinpId {
  const parts = curie.split(':');
  if (parts.length < 3) throw new Error(`parseCurie: not a CURIE: "${curie}"`);
  const localId = parts[parts.length - 1];
  const kind = parts[parts.length - 2] as KinpKind;
  const namespace = parts.slice(0, -2).join(':');
  if (!KINP_KINDS.includes(kind)) throw new Error(`parseCurie: unknown kind "${kind}" in "${curie}"`);
  if (!namespace) throw new Error(`parseCurie: empty namespace in "${curie}"`);
  if (!localId) throw new Error(`parseCurie: empty local id in "${curie}"`);
  return { kind, namespace, localId };
}

/** Quote an atom for Prolog source when it is not an unquoted-atom token. */
export function prologAtom(value: string): string {
  if (/^[a-z][a-zA-Z0-9_]*$/.test(value)) return value;
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Render the canonical Prolog term `id(Kind, Namespace, LocalId)` (§3.3). */
export function formatIdTerm(id: KinpId): string {
  return `id(${id.kind}, ${prologAtom(id.namespace)}, ${prologAtom(id.localId)})`;
}

/** Parse the Prolog term form produced by `formatIdTerm`. */
export function parseIdTerm(term: string): KinpId {
  const m = /^\s*id\s*\(([^]*)\)\s*$/.exec(term);
  if (!m) throw new Error(`parseIdTerm: not an id/3 term: "${term}"`);
  const args = splitTermArgs(m[1]);
  if (args.length !== 3) throw new Error(`parseIdTerm: expected 3 arguments in "${term}"`);
  const [kindArg, nsArg, localArg] = args.map(unquoteAtom);
  if (!KINP_KINDS.includes(kindArg as KinpKind)) {
    throw new Error(`parseIdTerm: unknown kind "${kindArg}" in "${term}"`);
  }
  return { kind: kindArg as KinpKind, namespace: nsArg, localId: localArg };
}

/** Split top-level `,`-separated arguments, respecting quotes and nesting. */
function splitTermArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quoted) {
      if (c === '\\') {
        current += c + (inner[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === "'") quoted = false;
      current += c;
      continue;
    }
    if (c === "'") {
      quoted = true;
      current += c;
    } else if (c === '(' || c === '[') {
      depth++;
      current += c;
    } else if (c === ')' || c === ']') {
      depth--;
      current += c;
    } else if (c === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  args.push(current);
  return args.map((a) => a.trim());
}

function unquoteAtom(arg: string): string {
  if (arg.startsWith("'") && arg.endsWith("'") && arg.length >= 2) {
    return arg.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return arg;
}

/** Expand to the canonical IRI form (§3.1). */
export function toIri(id: KinpId): string {
  const root = KINP_NAMESPACE_REGISTRY[rootNamespace(id.namespace)]?.iriRoot ?? KINP_IRI_ROOT;
  return `${root}/${id.kind}/${id.namespace}/${id.localId}`;
}

/** Inverse of `toIri` for identifiers minted against a Koine IRI root. */
export function fromIri(iri: string): KinpId {
  const root = Object.values(KINP_NAMESPACE_REGISTRY)
    .map((e) => e.iriRoot)
    .concat(KINP_IRI_ROOT)
    .filter((r) => iri.startsWith(`${r}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!root) throw new Error(`fromIri: unregistered IRI root in "${iri}"`);
  const rest = iri.slice(root.length + 1).split('/');
  if (rest.length < 3) throw new Error(`fromIri: malformed identifier IRI "${iri}"`);
  const kind = rest[0] as KinpKind;
  if (!KINP_KINDS.includes(kind)) throw new Error(`fromIri: unknown kind "${kind}" in "${iri}"`);
  const localId = rest[rest.length - 1];
  const namespace = rest.slice(1, -1).join('/');
  return { kind, namespace, localId };
}

/** The registry key of a (possibly world-scoped) namespace: `insimul:world:w` → `insimul`. */
export function rootNamespace(namespace: string): string {
  return namespace.split(':')[0];
}

/** True when the namespace names a registered minting authority (§3.4). */
export function isRegisteredNamespace(namespace: string): boolean {
  const root = rootNamespace(namespace);
  return root in KINP_NAMESPACE_REGISTRY || isProvisionalNamespace(namespace);
}

/** `<ns>:local` — a provisional, pre-reconciliation namespace (§3.4, §6). */
export function isProvisionalNamespace(namespace: string): boolean {
  return namespace.split(':')[1] === 'local';
}

export function idEquals(a: KinpId, b: KinpId): boolean {
  return a.kind === b.kind && a.namespace === b.namespace && a.localId === b.localId;
}

// ─── Insimul bindings ───────────────────────────────────────────────────────

/** `insimul:world:<w>` — the identifier of an Insimul world (§5). */
export function insimulWorldId(worldMongoId: string): KinpId {
  return { kind: 'world', namespace: INSIMUL_NAMESPACE, localId: sanitizeLocalId(worldMongoId) };
}

/**
 * The namespace entities inside world `w` are minted under (§3.4) — literally
 * the world's own CURIE, so `id_world/2` can read the world off the entity term.
 */
export function worldNamespace(worldMongoId: string): string {
  return formatCurie(insimulWorldId(worldMongoId));
}

/**
 * `insimul:world:<w>:ent:<id>` when a world is known, `insimul:ent:<id>`
 * otherwise (globals: users, cross-world library content).
 */
export function insimulEntityId(mongoId: string, worldMongoId?: string): KinpId {
  return {
    kind: 'ent',
    namespace: worldMongoId ? worldNamespace(worldMongoId) : INSIMUL_NAMESPACE,
    localId: sanitizeLocalId(mongoId),
  };
}

/**
 * A provisional local minted offline (§6) — no authority round-trip, reconciled
 * later into a canonical entity by emitting an equivalence link.
 */
export function provisionalEntityId(localId: string, ns: string = INSIMUL_NAMESPACE): KinpId {
  return { kind: 'ent', namespace: `${ns}:local`, localId: sanitizeLocalId(localId) };
}

/** `pinakes:ent:<canonical>` — a real-world entity minted by the canonical authority (§6). */
export function pinakesEntityId(canonicalId: string): KinpId {
  return { kind: 'ent', namespace: PINAKES_NAMESPACE, localId: sanitizeLocalId(canonicalId) };
}

/** The world an entity belongs to, or `null` for a global/provisional entity. */
export function worldOfEntity(id: KinpId): KinpId | null {
  if (id.kind !== 'ent') return null;
  const parts = id.namespace.split(':');
  if (parts.length !== 3 || parts[1] !== 'world') return null;
  return { kind: 'world', namespace: parts[0], localId: parts[2] };
}

/**
 * `pinakes:world:consensus-reality` — the default world for real-world knowledge
 * (§5). Every other world in the chain inherits from it (or does not); it is the
 * world a "facts true of the real entity" query is asked at.
 */
export const CONSENSUS_REALITY_WORLD: KinpId = {
  kind: 'world',
  namespace: PINAKES_NAMESPACE,
  localId: 'consensus-reality',
};

/**
 * The world an identifier's assertions default to (§5: "assertions without an
 * explicit world default to the producer's declared world").
 *
 *   - a world-scoped entity → its own world (`worldOfEntity`);
 *   - a Pinakes entity      → `consensus-reality`, the real-world default;
 *   - anything else         → `null` (unknown; the caller must state it).
 *
 * `null` is deliberately NOT coerced to consensus reality: the §4.5 resolver
 * treats an unknown world as "not provably the same world", which yields
 * `based_on` and keeps the firewall closed by default.
 */
export function declaredWorld(id: KinpId): KinpId | null {
  const scoped = worldOfEntity(id);
  if (scoped) return scoped;
  if (rootNamespace(id.namespace) === PINAKES_NAMESPACE && id.kind === 'ent') {
    return CONSENSUS_REALITY_WORLD;
  }
  return null;
}

/** True for a provisional, pre-reconciliation identifier (`<ns>:local:…`, §6). */
export function isProvisionalId(id: KinpId): boolean {
  return isProvisionalNamespace(id.namespace);
}

/** Recover the source Mongo `_id` from an identifier (inverse of the minting helpers). */
export function mongoIdOf(id: KinpId): string {
  return unsanitizeLocalId(id.localId);
}
