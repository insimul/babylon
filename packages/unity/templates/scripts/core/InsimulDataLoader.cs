using System;
using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Core
{
    /// <summary>
    /// Transaction types for item transfers between entities.
    /// Matches DataSource.ts TransferData.transactionType.
    /// </summary>
    public enum TransactionType
    {
        Buy, Sell, Steal, Discard, Give, QuestReward
    }

    /// <summary>
    /// Data for transferring an item between entities.
    /// Matches the transfer parameter in DataSource.ts.
    /// </summary>
    [Serializable]
    public class TransferData
    {
        public string fromEntityId;
        public string toEntityId;
        public string itemId;
        public string itemName;
        public string itemDescription;
        public string itemType;
        public int quantity = 1;
        public TransactionType transactionType;
        public int totalPrice;
    }

    /// <summary>
    /// Static utility for loading individual data files from Resources/Data.
    /// Matches the DataSource / FileDataSource interface from the Babylon.js source.
    ///
    /// Files loaded:
    ///   world_ir.json, characters.json, npcs.json, quests.json, actions.json,
    ///   rules.json, geography.json, theme.json, asset-manifest.json,
    ///   knowledge-base.pl, items.json
    /// </summary>
    /// <summary>
    /// Metadata for a single playthrough entry, stored in the playthroughs index file.
    /// </summary>
    [Serializable]
    public class PlaythroughEntry
    {
        public string id;
        public string name;
        public long createdAt;
        public long lastPlayedAt;
    }

    [Serializable]
    public class PlaythroughIndex
    {
        public List<PlaythroughEntry> playthroughs = new List<PlaythroughEntry>();
    }

    public static class InsimulDataLoader
    {
        private const string DataRoot = "Data/";
        private static string currentPlaythroughId = "";

        public static T[] LoadArray<T>(string resourcePath)
        {
            var json = Resources.Load<TextAsset>(resourcePath);
            if (json == null)
            {
                Debug.LogWarning($"[Insimul] Could not load: Resources/{resourcePath}");
                return new T[0];
            }
            // Unity's JsonUtility doesn't support top-level arrays,
            // so we wrap in a helper
            string wrapped = "{\"items\":" + json.text + "}";
            var wrapper = JsonUtility.FromJson<ArrayWrapper<T>>(wrapped);
            return wrapper.items;
        }

        /// <summary>
        /// Load a single JSON object (Dictionary-style) from Resources/Data.
        /// </summary>
        public static T LoadSingle<T>(string resourcePath)
        {
            var json = Resources.Load<TextAsset>(resourcePath);
            if (json == null)
            {
                Debug.LogWarning($"[Insimul] Could not load: Resources/{resourcePath}");
                return default;
            }
            return JsonUtility.FromJson<T>(json.text);
        }

        /// <summary>
        /// Load a raw text file from Resources/Data (e.g. Prolog knowledge base).
        /// Returns null if not found.
        /// </summary>
        public static string LoadTextFile(string resourcePath)
        {
            var asset = Resources.Load<TextAsset>(resourcePath);
            if (asset == null)
            {
                Debug.LogWarning($"[Insimul] Could not load text: Resources/{resourcePath}");
                return null;
            }
            return asset.text;
        }

        // ── Array loaders (match DataSource interface) ────────────────────

        public static T[] LoadCharacters<T>() => LoadArray<T>(DataRoot + "characters");
        public static T[] LoadNpcs<T>() => LoadArray<T>(DataRoot + "npcs");
        public static T[] LoadActions<T>() => LoadArray<T>(DataRoot + "actions");
        public static T[] LoadBaseActions<T>() => LoadArray<T>(DataRoot + "base_actions");
        public static T[] LoadRules<T>() => LoadArray<T>(DataRoot + "rules");
        public static T[] LoadBaseRules<T>() => LoadArray<T>(DataRoot + "base_rules");
        public static T[] LoadQuests<T>() => LoadArray<T>(DataRoot + "quests");
        public static T[] LoadSettlements<T>() => LoadArray<T>(DataRoot + "settlements");

        /// <summary>
        /// Load settlements and map IR streetNetwork to game-format streets.
        /// Re-centers street waypoints from IR world-space to lot coordinate space.
        /// Matches FileDataSource.loadSettlements() streetNetwork→streets mapping.
        /// </summary>
        public static InsimulSettlementData[] LoadSettlementsWithStreets()
        {
            var settlements = LoadArray<InsimulSettlementData>(DataRoot + "settlements");
            if (settlements == null) return new InsimulSettlementData[0];

            foreach (var s in settlements)
            {
                if (s.streetNetwork?.segments == null || s.streets != null) continue;

                // Compute lot centroid
                float lotCX = 0f, lotCZ = 0f; int lotCount = 0;
                if (s.lots != null)
                {
                    foreach (var lot in s.lots)
                    {
                        if (lot.position != null)
                        {
                            lotCX += lot.position.x; lotCZ += lot.position.z; lotCount++;
                        }
                    }
                    if (lotCount > 0) { lotCX /= lotCount; lotCZ /= lotCount; }
                }

                // Compute waypoint centroid
                float wpCX = 0f, wpCZ = 0f; int wpCount = 0;
                foreach (var seg in s.streetNetwork.segments)
                {
                    if (seg.waypoints == null) continue;
                    foreach (var wp in seg.waypoints)
                    {
                        wpCX += wp.x; wpCZ += wp.z; wpCount++;
                    }
                }
                if (wpCount > 0) { wpCX /= wpCount; wpCZ /= wpCount; }

                float dx = lotCX - wpCX, dz = lotCZ - wpCZ;

                var streets = new List<GameStreet>();
                foreach (var seg in s.streetNetwork.segments)
                {
                    var gs = new GameStreet { id = seg.id, name = seg.name, width = seg.width };
                    if (seg.waypoints != null)
                    {
                        var wps = new List<Vec3Data>();
                        foreach (var wp in seg.waypoints)
                            wps.Add(new Vec3Data { x = wp.x + dx, y = 0f, z = wp.z + dz });
                        gs.waypoints = wps.ToArray();
                    }
                    streets.Add(gs);
                }
                s.streets = streets.ToArray();
            }
            return settlements;
        }
        public static T[] LoadBuildings<T>() => LoadArray<T>(DataRoot + "buildings");
        public static T[] LoadItems<T>() => LoadArray<T>(DataRoot + "items");
        public static T[] LoadContainers<T>() => LoadArray<T>(DataRoot + "containers");
        public static T[] LoadLootTables<T>() => LoadArray<T>(DataRoot + "loot_tables");
        public static T[] LoadTruths<T>() => LoadArray<T>(DataRoot + "truths");
        public static T[] LoadGrammars<T>() => LoadArray<T>(DataRoot + "grammars");
        public static T[] LoadTexts<T>() => LoadArray<T>(DataRoot + "texts");
        public static T[] LoadBusinesses<T>() => LoadArray<T>(DataRoot + "businesses");
        public static T[] LoadRoads<T>() => LoadArray<T>(DataRoot + "roads");
        public static T[] LoadDialogueContexts<T>() => LoadArray<T>(DataRoot + "dialogue_contexts");
        public static T[] LoadResources<T>() => LoadArray<T>(DataRoot + "resources");
        public static T[] LoadRecipes<T>() => LoadArray<T>(DataRoot + "recipes");
        public static T[] LoadCountries<T>() => LoadArray<T>(DataRoot + "countries");
        public static T[] LoadStates<T>() => LoadArray<T>(DataRoot + "states");

        // ── Single-object loaders ─────────────────────────────────────────

        public static T LoadWorld<T>() => LoadSingle<T>(DataRoot + "world_ir");
        public static T LoadWorldData<T>() => LoadSingle<T>(DataRoot + "world_ir");
        public static T LoadAssetManifest<T>() => LoadSingle<T>(DataRoot + "asset-manifest");
        public static T LoadAssets<T>() => LoadSingle<T>(DataRoot + "asset-manifest");
        public static T LoadTheme<T>() => LoadSingle<T>(DataRoot + "theme");
        public static T LoadPlayerConfig<T>() => LoadSingle<T>(DataRoot + "player");
        public static T LoadCombatConfig<T>() => LoadSingle<T>(DataRoot + "combat");
        public static T LoadUIConfig<T>() => LoadSingle<T>(DataRoot + "ui");
        public static T LoadConfig3D<T>() => LoadSingle<T>(DataRoot + "config3d");
        public static T LoadAIConfig<T>() => LoadSingle<T>(DataRoot + "ai_config");
        public static T LoadSurvivalConfig<T>() => LoadSingle<T>(DataRoot + "survival");
        public static T LoadBaseResources<T>() => LoadSingle<T>(DataRoot + "base_resources");

        // ── Asset type inference ─────────────────────────────────────────

        /// <summary>
        /// Infer asset type from file path. Mirrors DataSource.ts logic:
        /// non-texture→model, wall/plaster/brick/planks→texture_wall,
        /// roof/tiles/slates/corrugated→texture_material,
        /// ground/floor/cobblestone/forrest→texture_ground, else→texture.
        /// </summary>
        public static string InferAssetTypeFromPath(string filePath)
        {
            if (string.IsNullOrEmpty(filePath)) return "model";
            string lower = filePath.ToLowerInvariant();
            string ext = System.IO.Path.GetExtension(lower).TrimStart('.');
            bool isTexture = ext == "png" || ext == "jpg" || ext == "jpeg";
            if (!isTexture) return "model";
            if (lower.Contains("wall") || lower.Contains("plaster") || lower.Contains("brick") || lower.Contains("planks"))
                return "texture_wall";
            if (lower.Contains("roof") || lower.Contains("tiles") || lower.Contains("slates") || lower.Contains("corrugated"))
                return "texture_material";
            if (lower.Contains("ground") || lower.Contains("floor") || lower.Contains("cobblestone") || lower.Contains("forrest"))
                return "texture_ground";
            return "texture";
        }

        // ── Asset ID-to-path mapping from IR metadata ────────────────────

        /// <summary>
        /// Builds a mapping from MongoDB asset IDs to file paths using the
        /// IR's meta.assetIdToPath. This allows world3DConfig texture IDs
        /// (which are MongoDB ObjectIDs) to resolve to actual file paths.
        /// Matches FileDataSource.loadAssets() virtual asset entry logic.
        /// </summary>
        public static Dictionary<string, string> LoadAssetIdToPathMap()
        {
            var map = new Dictionary<string, string>();
            var json = Resources.Load<TextAsset>(DataRoot + "world_ir");
            if (json == null) return map;

            // Parse the assetIdToPath from meta using a lightweight wrapper
            var ir = JsonUtility.FromJson<WorldIRAssetIdWrapper>(json.text);
            if (ir?.meta?.assetIdToPath == null) return map;
            foreach (var entry in ir.meta.assetIdToPath)
            {
                if (!string.IsNullOrEmpty(entry.key) && !string.IsNullOrEmpty(entry.value))
                    map[entry.key] = entry.value;
            }
            return map;
        }

        /// <summary>
        /// Load config3D with IR world3DConfig merged on top.
        /// Matches FileDataSource.loadConfig3D() merge logic — IR config
        /// overrides manifest-derived values for proceduralBuildings,
        /// buildingTypeOverrides, wallTextureId, roofTextureId,
        /// modelScaling, and audioAssets.
        /// </summary>
        public static InsimulConfig3D LoadConfig3DMerged()
        {
            var config = LoadSingle<InsimulConfig3D>(DataRoot + "config3d");
            if (config == null) config = new InsimulConfig3D();

            // Merge world3DConfig from IR
            var json = Resources.Load<TextAsset>(DataRoot + "world_ir");
            if (json == null) return config;

            var ir = JsonUtility.FromJson<WorldIRConfig3DWrapper>(json.text);
            var irConfig = ir?.meta?.world3DConfig;
            if (irConfig == null) return config;

            // Procedural building config (style presets with colors, textures, architecture)
            if (!string.IsNullOrEmpty(irConfig.proceduralBuildings))
                config.proceduralBuildings = irConfig.proceduralBuildings;
            // Per-building-type overrides (e.g., Restaurant -> colonial_warm preset)
            if (!string.IsNullOrEmpty(irConfig.buildingTypeOverrides))
                config.buildingTypeOverrides = irConfig.buildingTypeOverrides;
            // Global texture IDs (fall back to manifest-derived if not present)
            if (!string.IsNullOrEmpty(irConfig.wallTextureId))
                config.wallTextureId = irConfig.wallTextureId;
            if (!string.IsNullOrEmpty(irConfig.roofTextureId))
                config.roofTextureId = irConfig.roofTextureId;
            // Model scaling overrides
            if (!string.IsNullOrEmpty(irConfig.modelScaling))
                config.modelScaling = irConfig.modelScaling;
            // Audio assets config
            if (!string.IsNullOrEmpty(irConfig.audioAssets))
                config.audioAssets = irConfig.audioAssets;

            return config;
        }

        // ── Character lookup ──────────────────────────────────────────────

        /// <summary>
        /// Load a single character by ID from the characters array.
        /// </summary>
        public static InsimulCharacterData LoadCharacter(string characterId)
        {
            var characters = LoadArray<InsimulCharacterData>(DataRoot + "characters");
            if (characters == null) return null;
            foreach (var ch in characters)
            {
                if (ch.id == characterId) return ch;
            }
            return null;
        }

        // ── Settlement sub-data loaders ───────────────────────────────────

        /// <summary>
        /// Load businesses for a specific settlement.
        /// Scans all businesses and filters by settlementId.
        /// Falls back to deriving from buildings data if no direct businesses found.
        /// Matches FileDataSource.loadSettlementBusinesses() fallback logic.
        /// </summary>
        public static T[] LoadSettlementBusinesses<T>(string settlementId) where T : class
        {
            var direct = LoadFilteredArray<T>(DataRoot + "businesses", settlementId);
            if (direct != null && direct.Length > 0) return direct;

            // Fallback: derive businesses from buildings data
            var buildings = LoadArray<InsimulBuildingData>(DataRoot + "buildings");
            if (buildings == null || buildings.Length == 0) return new T[0];

            // Load BusinessIR data for ownerId/businessType fallback
            var allBusinesses = LoadArray<InsimulDerivedBusiness>(DataRoot + "businesses");

            var results = new List<T>();
            foreach (var b in buildings)
            {
                if (b.settlementId == settlementId && !string.IsNullOrEmpty(b.businessId))
                {
                    // Look up BusinessIR for ownerId fallback when occupantIds is empty
                    InsimulDerivedBusiness bizIR = null;
                    if (allBusinesses != null)
                    {
                        foreach (var biz in allBusinesses)
                        {
                            if (biz.id == b.businessId) { bizIR = biz; break; }
                        }
                    }
                    // Derive ownerId from occupantIds[0]; fall back to BusinessIR.ownerId
                    bool hasOccupants = b.occupantIds != null && b.occupantIds.Length > 0;
                    string ownerId = hasOccupants ? b.occupantIds[0] : bizIR?.ownerId;
                    string[] employees = (b.occupantIds != null && b.occupantIds.Length > 1)
                        ? b.occupantIds[1..] : new string[0];
                    // Create a derived business entry via JSON round-trip
                    string bizType = bizIR?.businessType ?? (!string.IsNullOrEmpty(b.buildingRole) ? b.buildingRole : "Shop");
                    string bizName = bizIR?.name ?? (!string.IsNullOrEmpty(b.buildingRole) ? b.buildingRole : "Business");
                    string json = JsonUtility.ToJson(new InsimulDerivedBusiness
                    {
                        id = !string.IsNullOrEmpty(b.businessId) ? b.businessId : b.id,
                        settlementId = b.settlementId,
                        businessType = bizType,
                        name = bizName,
                        lotId = b.lotId,
                        ownerId = ownerId,
                        employees = employees
                    });
                    var item = JsonUtility.FromJson<T>(json);
                    if (item != null) results.Add(item);
                }
            }
            return results.ToArray();
        }

        /// <summary>
        /// Load lots for a specific settlement.
        /// </summary>
        public static T[] LoadSettlementLots<T>(string settlementId) where T : class
        {
            return LoadFilteredArray<T>(DataRoot + "lots", settlementId);
        }

        /// <summary>
        /// Load residences for a specific settlement.
        /// Falls back to deriving from buildings data if no direct residences found.
        /// Matches FileDataSource.loadSettlementResidences() fallback logic.
        /// </summary>
        public static T[] LoadSettlementResidences<T>(string settlementId) where T : class
        {
            var direct = LoadFilteredArray<T>(DataRoot + "residences", settlementId);
            if (direct != null && direct.Length > 0) return direct;

            // Fallback: derive residences from buildings data
            var buildings = LoadArray<InsimulBuildingData>(DataRoot + "buildings");
            if (buildings == null || buildings.Length == 0) return new T[0];

            var results = new List<T>();
            foreach (var b in buildings)
            {
                if (b.settlementId == settlementId && !string.IsNullOrEmpty(b.residenceId))
                {
                    string json = JsonUtility.ToJson(new InsimulDerivedResidence
                    {
                        id = !string.IsNullOrEmpty(b.residenceId) ? b.residenceId : b.id,
                        settlementId = b.settlementId,
                        residenceType = !string.IsNullOrEmpty(b.buildingRole) ? b.buildingRole : "House",
                        name = !string.IsNullOrEmpty(b.buildingRole) ? b.buildingRole : "Residence",
                        lotId = b.lotId
                    });
                    var item = JsonUtility.FromJson<T>(json);
                    if (item != null) results.Add(item);
                }
            }
            return results.ToArray();
        }

        // ── Entity inventory (local stub) ─────────────────────────────────

        /// <summary>
        /// Get entity inventory. In exported games, returns empty inventory.
        /// </summary>
        public static InsimulEntityInventory GetEntityInventory(string worldId, string entityId)
        {
            return new InsimulEntityInventory
            {
                entityId = entityId,
                items = new InsimulItemData[0],
                gold = 0
            };
        }

        /// <summary>
        /// Transfer item between entities. In exported games, handled locally.
        /// Returns success status.
        /// </summary>
        public static bool TransferItem(string worldId, TransferData transfer)
        {
            Debug.Log($"[Insimul] Item transferred: {transfer.itemName} ({transfer.transactionType})");
            return true;
        }

        /// <summary>
        /// Get merchant inventory. In exported games, returns null.
        /// </summary>
        public static InsimulMerchantInventory GetMerchantInventory(string worldId, string merchantId)
        {
            return null;
        }

        // ── Playthrough management ────────────────────────────────────────

        private static string PlaythroughIndexPath =>
            Application.persistentDataPath + "/insimul_playthroughs.json";

        /// <summary>
        /// List existing playthroughs from the persistent index file.
        /// Returns an array of PlaythroughEntry metadata.
        /// </summary>
        public static PlaythroughEntry[] ListPlaythroughs()
        {
            if (!System.IO.File.Exists(PlaythroughIndexPath))
            {
                return new PlaythroughEntry[0];
            }
            try
            {
                string json = System.IO.File.ReadAllText(PlaythroughIndexPath);
                var index = JsonUtility.FromJson<PlaythroughIndex>(json);
                return index?.playthroughs?.ToArray() ?? new PlaythroughEntry[0];
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] ListPlaythroughs failed: {e.Message}");
                return new PlaythroughEntry[0];
            }
        }

        /// <summary>
        /// Start a new playthrough with a unique local ID.
        /// Persists entry to the playthroughs index file and sets currentPlaythroughId.
        /// </summary>
        public static string StartPlaythrough(string playthroughName)
        {
            long timestamp = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string random = UnityEngine.Random.Range(100000, 999999).ToString();
            string id = $"local-{timestamp}-{random}";

            var entry = new PlaythroughEntry
            {
                id = id,
                name = playthroughName,
                createdAt = timestamp,
                lastPlayedAt = timestamp
            };

            // Load existing index or create new
            PlaythroughIndex index;
            if (System.IO.File.Exists(PlaythroughIndexPath))
            {
                try
                {
                    string existing = System.IO.File.ReadAllText(PlaythroughIndexPath);
                    index = JsonUtility.FromJson<PlaythroughIndex>(existing) ?? new PlaythroughIndex();
                }
                catch
                {
                    index = new PlaythroughIndex();
                }
            }
            else
            {
                index = new PlaythroughIndex();
            }

            index.playthroughs.Add(entry);

            try
            {
                System.IO.File.WriteAllText(PlaythroughIndexPath, JsonUtility.ToJson(index, true));
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] StartPlaythrough: failed to persist index: {e.Message}");
            }

            currentPlaythroughId = id;
            Debug.Log($"[Insimul] StartPlaythrough({playthroughName}) => {id}");
            return JsonUtility.ToJson(entry);
        }

        /// <summary>
        /// Look up a specific playthrough by ID from the index.
        /// Returns null if not found.
        /// </summary>
        public static PlaythroughEntry GetPlaythrough(string playthroughId)
        {
            var all = ListPlaythroughs();
            foreach (var entry in all)
            {
                if (entry.id == playthroughId) return entry;
            }
            return null;
        }

        // ── Text file loaders ─────────────────────────────────────────────

        /// <summary>
        /// Load the Prolog knowledge base as a raw string (knowledge-base.pl).
        /// </summary>
        public static string LoadPrologContent() => LoadTextFile(DataRoot + "knowledge_base");

        /// <summary>
        /// Load world items from items.json.
        /// </summary>
        public static InsimulItemData[] LoadWorldItems() => LoadArray<InsimulItemData>(DataRoot + "items");

        /// <summary>
        /// Load geography data (heightmap, terrain features) from geography.json.
        /// </summary>
        public static GeographyData LoadGeography() => LoadSingle<GeographyData>(DataRoot + "geography");

        // ── Save / Load ──────────────────────────────────────────────────

        /// <summary>
        /// Resolve the effective playthrough ID: uses the provided value if non-empty,
        /// otherwise falls back to currentPlaythroughId.
        /// </summary>
        private static string ResolvePlaythroughId(string playthroughId)
        {
            if (!string.IsNullOrEmpty(playthroughId)) return playthroughId;
            return currentPlaythroughId;
        }

        /// <summary>
        /// Save game state to a numbered slot (0-2), scoped to a playthrough.
        /// Writes to Application.persistentDataPath/insimul_save_{playthroughId}_{slotIndex}.json.
        /// If playthroughId is null/empty, uses the stored currentPlaythroughId.
        /// </summary>
        public static bool SaveGameState(int slotIndex, string gameStateJSON, string playthroughId = null)
        {
            if (slotIndex < 0 || slotIndex > 2)
            {
                Debug.LogWarning($"[Insimul] SaveGameState: invalid slot {slotIndex} (must be 0-2)");
                return false;
            }
            string ptId = ResolvePlaythroughId(playthroughId);
            try
            {
                string savePath = Application.persistentDataPath + $"/insimul_save_{ptId}_{slotIndex}.json";
                System.IO.File.WriteAllText(savePath, gameStateJSON);
                Debug.Log($"[Insimul] SaveGameState: saved to slot {slotIndex} for playthrough {ptId}");
                return true;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] SaveGameState failed: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// Load game state from a numbered slot (0-2), scoped to a playthrough.
        /// If playthroughId is null/empty, uses the stored currentPlaythroughId.
        /// Returns null if no save exists in that slot.
        /// </summary>
        public static string LoadGameState(int slotIndex, string playthroughId = null)
        {
            if (slotIndex < 0 || slotIndex > 2)
            {
                Debug.LogWarning($"[Insimul] LoadGameState: invalid slot {slotIndex} (must be 0-2)");
                return null;
            }
            string ptId = ResolvePlaythroughId(playthroughId);
            string savePath = Application.persistentDataPath + $"/insimul_save_{ptId}_{slotIndex}.json";
            if (!System.IO.File.Exists(savePath))
            {
                return null;
            }
            try
            {
                string json = System.IO.File.ReadAllText(savePath);
                Debug.Log($"[Insimul] LoadGameState: loaded slot {slotIndex} for playthrough {ptId}");
                return json;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] LoadGameState failed: {e.Message}");
                return null;
            }
        }

        /// <summary>
        /// Save quest progress JSON to a dedicated file, scoped to a playthrough.
        /// If playthroughId is null/empty, uses the stored currentPlaythroughId.
        /// Returns true on success.
        /// </summary>
        public static bool SaveQuestProgress(string questProgressJSON, string playthroughId = null)
        {
            string ptId = ResolvePlaythroughId(playthroughId);
            string savePath = Application.persistentDataPath + $"/insimul_quest_progress_{ptId}.json";
            try
            {
                System.IO.File.WriteAllText(savePath, questProgressJSON);
                Debug.Log($"[Insimul] SaveQuestProgress: saved for playthrough {ptId}");
                return true;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] SaveQuestProgress failed: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// Load quest progress JSON from the dedicated file, scoped to a playthrough.
        /// If playthroughId is null/empty, uses the stored currentPlaythroughId.
        /// Returns null if no quest progress has been saved.
        /// </summary>
        public static string LoadQuestProgress(string playthroughId = null)
        {
            string ptId = ResolvePlaythroughId(playthroughId);
            string savePath = Application.persistentDataPath + $"/insimul_quest_progress_{ptId}.json";
            if (!System.IO.File.Exists(savePath))
            {
                return null;
            }
            try
            {
                string json = System.IO.File.ReadAllText(savePath);
                Debug.Log($"[Insimul] LoadQuestProgress: loaded for playthrough {ptId}");
                return json;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Insimul] LoadQuestProgress failed: {e.Message}");
                return null;
            }
        }

        // ── Playthrough relationships ────────────────────────────────────

        /// <summary>Load playthrough relationships (empty in exported mode).</summary>
        public static string LoadPlaythroughRelationships()
        {
            return "[]"; // No server in exported mode
        }

        /// <summary>Update a playthrough relationship (no-op in exported mode).</summary>
        public static bool UpdatePlaythroughRelationship(string fromCharacterId, string toCharacterId, string type, float strength)
        {
            // No server in exported mode
            return false;
        }

        // ── NPC Conversation & Assessments ────────────────────────────────

        /// <summary>Start an NPC-NPC conversation (returns null — no AI server in exported mode).</summary>
        public static string StartNpcNpcConversation(string npc1Id, string npc2Id, string topic = null)
        {
            return null; // No AI server in exported mode
        }

        /// <summary>Create an assessment session (stub in exported mode).</summary>
        public static string CreateAssessmentSession(string playerId, string worldId, string assessmentType)
        {
            return "{}"; // Stub — store via PlayerPrefs in a real implementation
        }

        /// <summary>Submit results for an assessment phase (stub in exported mode).</summary>
        public static string SubmitAssessmentPhase(string sessionId, string phaseId, string dataJson)
        {
            return "{}";
        }

        /// <summary>Complete an assessment session (stub in exported mode).</summary>
        public static string CompleteAssessment(string sessionId, float totalScore, float maxScore = 0, string cefrLevel = null)
        {
            return "{}";
        }

        /// <summary>Get player's assessment history for a world (returns empty array in exported mode).</summary>
        public static string GetPlayerAssessments(string playerId, string worldId)
        {
            return "[]";
        }

        /// <summary>Simulate a rich conversation between two characters (no-op in exported mode).</summary>
        public static string SimulateRichConversation(string worldId, string char1Id, string char2Id, int turnCount)
        {
            return null; // No AI server in exported mode
        }

        /// <summary>Text-to-speech synthesis (no-op in exported mode).</summary>
        public static byte[] TextToSpeech(string text, string voice, string gender, string targetLanguage)
        {
            return null; // No TTS service in exported mode
        }

        /// <summary>Get player portfolio data (no-op in exported mode).</summary>
        public static string GetPortfolio(string worldId, string playerName)
        {
            return null; // No server in exported mode
        }

        /// <summary>Load reading progress (no-op in exported mode).</summary>
        public static string LoadReadingProgress(string playerId, string worldId, string playthroughId = null)
        {
            return null; // No server in exported mode
        }

        /// <summary>Sync reading progress (no-op in exported mode).</summary>
        public static void SyncReadingProgress(string dataJSON)
        {
            // No-op in exported mode
        }

        // ── Quest management ─────────────────────────────────────────────

        public static string CreateDynamicQuest(string worldId, string questDataJson)
        {
            string questId = "dynamic_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string questDir = System.IO.Path.Combine(Application.persistentDataPath, "quests");
            System.IO.Directory.CreateDirectory(questDir);
            System.IO.File.WriteAllText(System.IO.Path.Combine(questDir, questId + ".json"), questDataJson);
            Debug.Log($"[Insimul] Created dynamic quest: {questId}");
            return JsonUtility.ToJson(new QuestCreateResult { id = questId, status = "active" });
        }

        public static string BranchQuest(string worldId, string questId, string choiceId, string targetStageId = null)
        {
            Debug.Log($"[Insimul] BranchQuest: {questId}, choice: {choiceId}");
            return "{\"success\":true}";
        }

        public static string AdjustReputation(string playthroughId, string entityType, string entityId, int amount, string reason)
        {
            Debug.Log($"[Insimul] AdjustReputation: {entityType}/{entityId} by {amount} ({reason})");
            return "{\"success\":true}";
        }

        // Helper class for CreateDynamicQuest return
        [Serializable]
        private class QuestCreateResult
        {
            public string id;
            public string status;
        }

        // ── Helpers ───────────────────────────────────────────────────────

        private static T[] LoadFilteredArray<T>(string resourcePath, string settlementId) where T : class
        {
            var all = LoadArray<T>(resourcePath);
            if (all == null || all.Length == 0) return new T[0];
            // Filter by settlementId field via reflection (generic approach)
            var results = new List<T>();
            var field = typeof(T).GetField("settlementId");
            if (field == null) return all;
            foreach (var item in all)
            {
                if ((string)field.GetValue(item) == settlementId)
                    results.Add(item);
            }
            return results.ToArray();
        }

        [Serializable]
        private class ArrayWrapper<T>
        {
            public T[] items;
        }
    }

    // ── Helper data classes for loader returns ────────────────────────────

    [Serializable]
    public class InsimulEntityInventory
    {
        public string entityId;
        public InsimulItemData[] items;
        public int gold;
    }

    [Serializable]
    public class InsimulMerchantInventory
    {
        public string merchantId;
        public string merchantName;
        public InsimulShopItem[] items;
        public int goldReserve;
        public float buyMultiplier = 1f;
        public float sellMultiplier = 1f;
    }

    [Serializable]
    public class InsimulShopItem
    {
        public string id;
        public string name;
        public string description;
        public string itemType;
        public int buyPrice;
        public int sellPrice;
        public int stock;
        public int maxStock;
        public float restockRate;
    }

    // ── Config3D data class for IR merge ──────────────────────────────────

    [Serializable]
    public class InsimulConfig3D
    {
        public string proceduralBuildings;
        public string buildingTypeOverrides;
        public string wallTextureId;
        public string roofTextureId;
        public string modelScaling;
        public string audioAssets;
        public string buildingModels;
        public string natureModels;
        public string objectModels;
        public string questObjectModels;
        public string characterModels;
        public string playerModels;
        public string groundTextureId;
        public string roadTextureId;
    }

    // ── IR wrapper classes for asset ID and config3D extraction ───────────

    [Serializable]
    public class WorldIRAssetIdWrapper
    {
        public WorldIRMetaAssetId meta;
    }

    [Serializable]
    public class WorldIRMetaAssetId
    {
        public AssetIdEntry[] assetIdToPath;
    }

    [Serializable]
    public class WorldIRConfig3DWrapper
    {
        public WorldIRMetaConfig3D meta;
    }

    [Serializable]
    public class WorldIRMetaConfig3D
    {
        public InsimulConfig3D world3DConfig;
    }

    // ── Building data class for settlement fallback derivation ────────────

    [Serializable]
    public class InsimulBuildingData
    {
        public string id;
        public string settlementId;
        public string businessId;
        public string residenceId;
        public string buildingRole;
        public string lotId;
        public string[] occupantIds;
    }

    [Serializable]
    public class InsimulDerivedBusiness
    {
        public string id;
        public string settlementId;
        public string businessType;
        public string name;
        public string lotId;
        public string ownerId;
        public string[] employees;
    }

    [Serializable]
    public class InsimulDerivedResidence
    {
        public string id;
        public string settlementId;
        public string residenceType;
        public string name;
        public string lotId;
    }
}
