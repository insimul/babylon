# Archetype taxonomy

*The engine-agnostic vocabulary the asset binding layer resolves against (plan
§4.2). Executable half: `packages/core/src/archetypes/taxonomy.ts` (+ the C#
port `packages/unity/Runtime/Binding/ArchetypeKey.cs`). Keep this doc and those
files in sync — the roots list is drift-guarded by
`src/archetypes/__tests__/taxonomy.test.ts`.*

## What an archetype key is

An **archetype key** names *what kind of thing* an IR entity is, independent of
any concrete asset. It is a hierarchical, lowercase, dot-separated path:

```
building.commercial.bakery.medium
npc.merchant.baker
item.tool.fishing_rod
prop.street.market-stall
terrain.texture.grass
```

The IR (`packages/core/src/game-engine/ir-types.ts`) carries the *raw* type
strings (`LotIR.buildingType`, `BuildingSpecIR.buildingRole`, item/prop/npc
category fields, terrain splat layer names). The export/generation layer maps
those to archetype keys under one of the five **roots** below; a per-engine
**binding table** then maps a key → a real prefab/mesh (Unity:
`InsimulBindingTable` + `BindingResolver`).

### Grammar

- **Segment** — `^[a-z][a-z0-9]*([-_][a-z0-9]+)*$`: starts with a lowercase
  letter, lowercase alphanumerics, may join words with `-` or `_`
  (`two-story`, `market_stall`). No leading digit, no empty segments,
  no `..`, no leading/trailing `.`.
- **Key** — one or more segments joined by `.`, whose first segment is a
  known **root**.
- **Pattern** — a key OR a key with a trailing `.*` **descendant wildcard**
  (`building.commercial.*`). A bare `*` is not a valid pattern; patterns are
  always rooted.
- **Tag** — same shape as a segment; a free-form set attached to a binding rule
  (e.g. `walkable`, `two-story`, `cc0`) for search/filtering. Tags are not part
  of the key path.

## Roots

| Root       | Covers                                                        | Example keys |
|------------|--------------------------------------------------------------|--------------|
| `building` | placeable structures on lot footprints                       | `building.commercial.bakery.medium`, `building.residential.house.small`, `building.civic.townhall` |
| `npc`      | character archetypes                                         | `npc.merchant.baker`, `npc.guard`, `npc.commoner.farmer` |
| `item`     | pickup/inventory items                                       | `item.tool.fishing_rod`, `item.food.bread`, `item.weapon.sword` |
| `prop`     | non-interactive set dressing / street furniture             | `prop.street.market-stall`, `prop.vegetation.tree.oak`, `prop.furniture.bench` |
| `terrain`  | terrain textures / splat layers (and terrain sub-features)  | `terrain.texture.grass`, `terrain.texture.road`, `terrain.texture.water` |

The hierarchy is open-ended below the root — an exporter may emit
`building.commercial.bakery.medium` or just `building.commercial` and both
resolve, because a binding rule at a shallower node covers its whole subtree
(see matching). New sub-nodes need no schema change; only the five roots are
fixed.

## Matching semantics

A binding table is a list of rules; each rule's key is a **pattern**. Resolving
a concrete query key against a rule:

1. **Exact** — `pattern == key`, pattern not a wildcard. Highest precedence.
2. **Wildcard** — `a.b.*` matches the base node `a.b` **and** any descendant
   `a.b.x…`.
3. **Descendant** — a plain ancestor node `a.b` used as a rule matches any
   *strict* descendant `a.b.x…` (an ancestor implicitly stands in for its whole
   subtree). At the node itself this is the exact case.

**Specificity** breaks ties when several rules in one layer match: an exact
match on N segments outranks any wildcard/ancestor match, and a deeper (longer)
pattern outranks a shallower one (`archetypeSpecificity`). So
`building.commercial.bakery.medium` (exact) beats `building.commercial.bakery.*`
beats `building.commercial.*` beats `building`.

## Resolution order (fallback chain)

Engines layer several tables and consult them in a fixed order, using the first
layer that yields *any* match (so a project override always wins over a pack,
which wins over the placeholder pack):

```
project table  →  imported binding packs  →  placeholder pack
```

Within a layer the best (most specific) matching rule wins. A key that matches
in **no** layer is reported as **unbound** (`BindingResolver.CollectUnbound`) so
a creator sees exactly what still needs art before generating a scene.
