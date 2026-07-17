// InsimulWorldSource.cs — the engine-agnostic world-loading core (US-UC1).
//
// Loads world data for the Unity runtime from one of two shapes, BOTH through the
// generated schema DTOs (Insimul.Generated) and System.Text.Json — never Unity's
// JsonUtility (which cannot round-trip the Dictionary<string,object> / object[]
// sections the schema-faithful DTOs use; see MIGRATION.md):
//
//   • a SaveFile's embedded `worldSnapshot`  (the primary path — a playthrough's
//     read-only world capture), or
//   • a WorldIR export                        (a freshly authored world).
//
// It ports the world-snapshot version-compatibility SEMANTICS from
// packages/core/src/world-snapshot-version.ts (byte-for-byte statuses + messages)
// so a save captured against an older world is detected and, when the gap is too
// large, REJECTED with the documented message.
//
// This file is deliberately UnityEngine-free so the tools/verify-unity console
// harness can <Compile Include> and exercise it on a bare .NET SDK (no editor).
// The thin StreamingAssets adapter that reads these off disk in a real build lives
// in the sibling StreamingAssetsWorldSource.cs (UnityEngine-coupled, structural
// gate only).

using System;
using System.Collections.Generic;
using System.Text.Json;
using Insimul.Generated;

namespace Insimul.World
{
    /// <summary>Thrown when a world / save cannot be loaded or is version-incompatible.</summary>
    public sealed class InsimulWorldException : Exception
    {
        public InsimulWorldException(string message) : base(message) { }
        public InsimulWorldException(string message, Exception inner) : base(message, inner) { }
    }

    /// <summary>
    /// A world-snapshot-version compatibility check, a faithful C# port of
    /// packages/core/src/world-snapshot-version.ts. Kept a standalone static class
    /// so the exact statuses + messages stay comparable across runtimes.
    /// </summary>
    public static class WorldSnapshotVersion
    {
        /// <summary>Entity types whose mutations bump the world version (parity with core).</summary>
        public static readonly IReadOnlyList<string> VersionBumpEntityTypes = new[]
        {
            "character", "settlement", "country", "state", "lot", "business",
            "residence", "rule", "action", "quest", "item", "truth", "occupation",
        };

        /// <summary>
        /// Maximum version gap before a save is considered incompatible. Beyond this
        /// the world has changed too much for delta-based isolation to be reliable.
        /// </summary>
        public const int MaxCompatibleVersionGap = 50;

        /// <summary>Compatibility status, mirroring the core union type.</summary>
        public enum Status { Current, Behind, Incompatible }

        /// <summary>Result of a compatibility check between a playthrough and its world.</summary>
        public sealed class CompatibilityResult
        {
            public bool Compatible { get; }
            public int WorldVersion { get; }
            public int SnapshotVersion { get; }
            public int VersionsBehind { get; }
            public Status Status { get; }
            public string Message { get; }

            public CompatibilityResult(
                bool compatible, int worldVersion, int snapshotVersion,
                int versionsBehind, Status status, string message)
            {
                Compatible = compatible;
                WorldVersion = worldVersion;
                SnapshotVersion = snapshotVersion;
                VersionsBehind = versionsBehind;
                Status = status;
                Message = message;
            }
        }

        /// <summary>
        /// Check whether a playthrough's snapshot version is compatible with the
        /// current world version. Semantics identical to the TS
        /// <c>checkSnapshotCompatibility</c>.
        /// </summary>
        public static CompatibilityResult CheckSnapshotCompatibility(int worldVersion, int snapshotVersion)
        {
            int versionsBehind = worldVersion - snapshotVersion;

            if (versionsBehind == 0)
            {
                return new CompatibilityResult(
                    true, worldVersion, snapshotVersion, 0, Status.Current,
                    "Save is up to date with the current world version.");
            }

            if (versionsBehind < 0)
            {
                // Snapshot is somehow ahead of the world — data corruption / rollback.
                return new CompatibilityResult(
                    false, worldVersion, snapshotVersion, versionsBehind, Status.Incompatible,
                    $"Save version ({snapshotVersion}) is ahead of the world version ({worldVersion}). " +
                    "The world may have been rolled back.");
            }

            if (versionsBehind > MaxCompatibleVersionGap)
            {
                return new CompatibilityResult(
                    false, worldVersion, snapshotVersion, versionsBehind, Status.Incompatible,
                    $"Save is {versionsBehind} versions behind (max {MaxCompatibleVersionGap}). " +
                    "The world has changed too much — please start a new playthrough.");
            }

            return new CompatibilityResult(
                true, worldVersion, snapshotVersion, versionsBehind, Status.Behind,
                $"Save is {versionsBehind} version{(versionsBehind == 1 ? "" : "s")} behind. " +
                "The world has been updated since this save was created.");
        }

        /// <summary>Whether a given entity mutation should bump the world version.</summary>
        public static bool ShouldBumpVersion(string entityType)
        {
            if (entityType == null) return false;
            foreach (string t in VersionBumpEntityTypes)
            {
                if (string.Equals(t, entityType, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        /// <summary>Compute the next world version after a bump.</summary>
        public static int NextVersion(int current) => current + 1;
    }

    /// <summary>A minimally-typed world entity: its id/name plus the raw JSON for the rest.</summary>
    public sealed class WorldEntity
    {
        /// <summary>Stable entity id (e.g. <c>npc-shopkeeper</c>). May be null if absent.</summary>
        public string Id { get; }

        /// <summary>Display name — <c>name</c>, falling back to <c>firstName</c>. May be null.</summary>
        public string Name { get; }

        /// <summary>The full entity JSON, for callers that need fields beyond id/name.</summary>
        public JsonElement Raw { get; }

        public WorldEntity(string id, string name, JsonElement raw)
        {
            Id = id;
            Name = name;
            Raw = raw;
        }
    }

    /// <summary>A world quest, carrying its authored Prolog <c>content</c> string.</summary>
    public sealed class WorldQuest
    {
        public string Id { get; }
        public string Name { get; }

        /// <summary>The Prolog source for this quest (e.g. <c>quest(q, [...]).</c>). May be null.</summary>
        public string PrologContent { get; }

        public JsonElement Raw { get; }

        public WorldQuest(string id, string name, string prologContent, JsonElement raw)
        {
            Id = id;
            Name = name;
            PrologContent = prologContent;
            Raw = raw;
        }
    }

    /// <summary>
    /// A loaded, read-only view of world data with typed accessors. Construct via
    /// <see cref="FromSaveJson"/> (a SaveFile's embedded snapshot) or
    /// <see cref="FromWorldIrJson"/> (a WorldIR export).
    /// </summary>
    public sealed class InsimulWorldSource
    {
        public string WorldId { get; }
        public string WorldName { get; }

        public IReadOnlyList<WorldEntity> Characters { get; }
        public IReadOnlyList<WorldEntity> Settlements { get; }
        public IReadOnlyList<WorldEntity> Lots { get; }
        public IReadOnlyList<WorldEntity> Items { get; }
        public IReadOnlyList<WorldQuest> Quests { get; }

        /// <summary>
        /// The version-compatibility verdict computed at load time. Non-null only when
        /// the save carried a <c>worldSnapshot.worldVersion</c> AND a current world
        /// version was supplied; otherwise null (unversioned save — treated as current).
        /// </summary>
        public WorldSnapshotVersion.CompatibilityResult Compatibility { get; }

        private InsimulWorldSource(
            string worldId, string worldName,
            IReadOnlyList<WorldEntity> characters,
            IReadOnlyList<WorldEntity> settlements,
            IReadOnlyList<WorldEntity> lots,
            IReadOnlyList<WorldEntity> items,
            IReadOnlyList<WorldQuest> quests,
            WorldSnapshotVersion.CompatibilityResult compatibility)
        {
            WorldId = worldId;
            WorldName = worldName;
            Characters = characters;
            Settlements = settlements;
            Lots = lots;
            Items = items;
            Quests = quests;
            Compatibility = compatibility;
        }

        /// <summary>Prolog <c>content</c> strings for every quest that has one.</summary>
        public IReadOnlyList<string> QuestPrologContent()
        {
            var list = new List<string>();
            foreach (WorldQuest q in Quests)
            {
                if (!string.IsNullOrEmpty(q.PrologContent)) list.Add(q.PrologContent);
            }
            return list;
        }

        /// <summary>
        /// Load from a SaveFile JSON (the full save, top-level — NOT wrapped in an
        /// envelope). Parsed through the generated <see cref="SaveFile"/> DTO.
        ///
        /// When <paramref name="currentWorldVersion"/> is supplied AND the snapshot
        /// carries a <c>worldVersion</c>, the compatibility check runs and an
        /// INCOMPATIBLE verdict throws <see cref="InsimulWorldException"/> with the
        /// documented message. An unversioned save (or a null current version) skips
        /// the check and is treated as current.
        /// </summary>
        public static InsimulWorldSource FromSaveJson(string saveJson, int? currentWorldVersion = null)
        {
            if (string.IsNullOrWhiteSpace(saveJson))
                throw new InsimulWorldException("Cannot load world: empty save JSON.");

            SaveFile save;
            try
            {
                save = JsonSerializer.Deserialize<SaveFile>(saveJson, Converter.Settings);
            }
            catch (Exception ex)
            {
                throw new InsimulWorldException("Failed to parse SaveFile JSON: " + ex.Message, ex);
            }

            if (save?.WorldSnapshot == null)
                throw new InsimulWorldException("SaveFile has no worldSnapshot to load.");

            WorldSnapshot ws = save.WorldSnapshot;

            // worldVersion + an `items` array are not on the (schema-faithful) DTO, so
            // read them from the same JSON via a raw document pass (still System.Text.Json).
            int? snapshotVersion;
            List<WorldEntity> items;
            using (JsonDocument doc = JsonDocument.Parse(saveJson))
            {
                JsonElement wsEl = default;
                bool hasWs = doc.RootElement.TryGetProperty("worldSnapshot", out wsEl);
                snapshotVersion = hasWs ? ReadIntProperty(wsEl, "worldVersion") : null;
                items = hasWs ? ReadEntities(EnumerateArrayProperty(wsEl, "items")) : new List<WorldEntity>();
            }

            WorldSnapshotVersion.CompatibilityResult compat = null;
            if (currentWorldVersion.HasValue && snapshotVersion.HasValue)
            {
                compat = WorldSnapshotVersion.CheckSnapshotCompatibility(
                    currentWorldVersion.Value, snapshotVersion.Value);
                if (!compat.Compatible)
                    throw new InsimulWorldException(compat.Message);
            }

            return new InsimulWorldSource(
                ws.World?.Id,
                ws.World?.Name,
                ReadEntities(AsElements(ws.Characters)),
                ReadEntities(AsElements(ws.Settlements)),
                ReadEntities(AsElements(ws.Lots)),
                items,
                ReadQuests(AsElements(ws.Quests)),
                compat);
        }

        /// <summary>
        /// Load from a WorldIR export JSON, parsed through the generated
        /// <see cref="WorldIr"/> DTO. Entities are read from the permissive
        /// <c>entities.{characters,settlements,lots,items,quests}</c> sub-arrays. A
        /// WorldIR IS the current world, so no compatibility check applies.
        /// </summary>
        public static InsimulWorldSource FromWorldIrJson(string worldIrJson)
        {
            if (string.IsNullOrWhiteSpace(worldIrJson))
                throw new InsimulWorldException("Cannot load world: empty WorldIR JSON.");

            WorldIr ir;
            try
            {
                ir = JsonSerializer.Deserialize<WorldIr>(worldIrJson, Converter.Settings);
            }
            catch (Exception ex)
            {
                throw new InsimulWorldException("Failed to parse WorldIR JSON: " + ex.Message, ex);
            }

            // The entity collections live in the permissive `entities` section; read
            // them from the same JSON so the sub-array shapes stay opaque to the DTO.
            var characters = new List<WorldEntity>();
            var settlements = new List<WorldEntity>();
            var lots = new List<WorldEntity>();
            var items = new List<WorldEntity>();
            var quests = new List<WorldQuest>();
            using (JsonDocument doc = JsonDocument.Parse(worldIrJson))
            {
                if (doc.RootElement.TryGetProperty("entities", out JsonElement ents) &&
                    ents.ValueKind == JsonValueKind.Object)
                {
                    characters = ReadEntities(EnumerateArrayProperty(ents, "characters"));
                    settlements = ReadEntities(EnumerateArrayProperty(ents, "settlements"));
                    lots = ReadEntities(EnumerateArrayProperty(ents, "lots"));
                    items = ReadEntities(EnumerateArrayProperty(ents, "items"));
                    quests = ReadQuests(EnumerateArrayProperty(ents, "quests"));
                }
            }

            string worldId = ir?.Meta != null ? ir.Meta.WorldId : null;
            string worldName = ir?.Meta != null ? ir.Meta.WorldName : null;

            return new InsimulWorldSource(
                worldId, worldName, characters, settlements, lots, items, quests, null);
        }

        // --- helpers ----------------------------------------------------------

        // System.Text.Json deserializes `object[]` elements to boxed JsonElements.
        private static IEnumerable<JsonElement> AsElements(object[] arr)
        {
            if (arr == null) yield break;
            foreach (object o in arr)
            {
                if (o is JsonElement el) yield return el;
            }
        }

        private static List<JsonElement> EnumerateArrayProperty(JsonElement parent, string name)
        {
            var list = new List<JsonElement>();
            if (parent.ValueKind == JsonValueKind.Object &&
                parent.TryGetProperty(name, out JsonElement arr) &&
                arr.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement el in arr.EnumerateArray()) list.Add(el.Clone());
            }
            return list;
        }

        private static List<WorldEntity> ReadEntities(IEnumerable<JsonElement> elements)
        {
            var list = new List<WorldEntity>();
            foreach (JsonElement el in elements)
            {
                if (el.ValueKind != JsonValueKind.Object) continue;
                list.Add(new WorldEntity(
                    ReadStringProperty(el, "id"),
                    ReadStringProperty(el, "name") ?? ReadStringProperty(el, "firstName"),
                    el));
            }
            return list;
        }

        private static List<WorldQuest> ReadQuests(IEnumerable<JsonElement> elements)
        {
            var list = new List<WorldQuest>();
            foreach (JsonElement el in elements)
            {
                if (el.ValueKind != JsonValueKind.Object) continue;
                list.Add(new WorldQuest(
                    ReadStringProperty(el, "id"),
                    ReadStringProperty(el, "name"),
                    ReadStringProperty(el, "content"),
                    el));
            }
            return list;
        }

        private static string ReadStringProperty(JsonElement obj, string name) =>
            obj.ValueKind == JsonValueKind.Object &&
            obj.TryGetProperty(name, out JsonElement v) &&
            v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

        private static int? ReadIntProperty(JsonElement obj, string name) =>
            obj.ValueKind == JsonValueKind.Object &&
            obj.TryGetProperty(name, out JsonElement v) &&
            v.ValueKind == JsonValueKind.Number &&
            v.TryGetInt32(out int n)
                ? n
                : (int?)null;
    }
}
