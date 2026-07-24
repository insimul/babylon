# KGP alignment — open questions from the Pinakes rename (US-4)

US-4 renamed the bridge seam in `packages/core/src/schemas/grounding.schema.ts`
from **LinguaScrape** to **Pinakes** and moved the producer identity onto the
KINP namespace constant `PINAKES_NAMESPACE` (`identity/kinp.ts`, spec
`koine/specs/identity.md` §3.4).

That is a **rename of already-built code**, deliberately not a rebuild: every
exported name (`GROUNDING_CONTRACT_VERSION`, `groundingProvenanceSchema`,
`groundingEntitySchema`, `groundingPackSchema`, `canonicalWorldExportSchema` and
their inferred types) is unchanged, and the emitted
`schemas/grounding-pack.schema.json` differs only in the `source` const.

The envelope in this repo predates the ratified Koine Grounding-Pack Protocol
(`koine/specs/grounding-pack.md`, spec 0.4.0). Reconciling the two is a
cross-project decision — a producer and at least one consumer have to move
together — so the deltas are recorded here rather than guessed at in core. They
belong to the platform-side KGP alignment story, which is where the wire format
is actually negotiated.

## Deltas: `groundingPackSchema` (this repo) vs KGP §2

| KGP §2 field | Core stub today | Open question |
|---|---|---|
| `kgp_version` | `contractVersion: 'insimul-grounding-v1'` | Does the pack declare the KGP spec version, the Insimul contract version, or both? A `z.literal` on either one is a hard gate, so they cannot simply coexist unpinned. |
| `pack_id` (content hash, §2.1) | `packId` (opaque string) | KGP makes `pack_id` the sha256 of the canonical manifest ⊕ sorted records. Core cannot compute it without the §3 normalizer, which nothing in this repo implements yet. |
| `producer` (KINP namespace) | `source` (KINP namespace) | Same value, different key. Renaming the key is a wire break for any existing consumer; keep `source` until the alignment story schedules it. |
| `worlds: [CURIE]` | *(absent)* | Core now mints world CURIEs (`identity/worlds.ts`), so this is addable — but whether a pack is single- or multi-world affects `@world(W)` handling on ingest. |
| `kind` / `basis` (§6 snapshot vs delta) | *(absent)* | Deltas need `retracts`/`supersedes` lifecycle relations, which the equivalence layer (`identity/equivalence-predicates.ts`) does not model yet. |
| `dialect` (§5 tier) | *(absent)* | Insimul emits `full-prolog` internally and must downshift to `grounding-only` for export (§8). Which side performs the downshift is undecided. |
| `assertions` / `links` | `prologFacts: string[]` | KGP carries structured KINP assertion envelopes; the stub carries rendered Prolog text. The §3 normalization (and therefore claim dedup) needs the structured form. |
| `provenance` (W3C-PROV records) | `provenance` inline per entity | KGP references shared provenance records by id so a merged claim keeps every producer's provenance; the stub inlines one record per entity. |
| `manifest.license_policy` (§7.1) | `licenseManifest` (passthrough) | Per-record SPDX `license` already matches §7.1; the class-based *admission allowlist* shape does not exist here. |
| egress class `local-only` (§7.2) | *(absent)* | Normative in KGP 0.4.0: a producer must filter `local-only` at pack construction and a consumer must reject a pack containing it. Insimul is both, so this needs a decision on both legs. |

## Deltas: `canonicalWorldExportSchema` vs KGP §2

The Bridge 2 envelope (Insimul → Pinakes) is not a KGP pack at all — it ships a
`WorldIR` plus a raw `prologKb` string. Under KGP §8 Insimul's contribution
should be a `grounding-only` pack of assertions about the world. Whether Bridge 2
becomes a KGP pack producer or stays a private Insimul→Pinakes ingest format is
the single biggest open question here.

## What is settled

- The producer's identity is `pinakes`, the KINP namespace (§3.4) — same atom
  `pinakesEntityId` / `CONSENSUS_REALITY_WORLD` already use, so the pack's
  producer and the identifiers it carries can never disagree.
- License stays on records (per-entity SPDX `license`), which already matches
  KGP §7.1 and is excluded from claim identity (§3.1).
