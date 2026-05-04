using UnityEngine;
using Insimul.Data;

namespace Insimul.Core
{
    /// <summary>
    /// Central game manager — singleton that orchestrates all systems.
    /// Attach to an empty GameObject in the scene.
    /// </summary>
    public class InsimulGameManager : MonoBehaviour
    {
        public static InsimulGameManager Instance { get; private set; }

        [Header("World Data")]
        public InsimulWorldIR WorldData { get; private set; }
        public bool IsDataLoaded { get; private set; }

        [Header("Settings")]
        public string worldIRPath = "Data/WorldIR";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            LoadWorldData();
        }

        private void Start()
        {
            if (IsDataLoaded) SpawnWorld();
        }

        public void LoadWorldData()
        {
            var json = Resources.Load<TextAsset>(worldIRPath);
            if (json == null)
            {
                Debug.LogError("[Insimul] Failed to load WorldIR from Resources/" + worldIRPath);
                return;
            }
            WorldData = JsonUtility.FromJson<InsimulWorldIR>(json.text);
            IsDataLoaded = true;
            Debug.Log($"[Insimul] Loaded world: {WorldData.meta.worldName} (type: {WorldData.meta.worldType})");
        }

        /// <summary>Find an existing component or create a new GameObject with it.</summary>
        private T FindOrCreate<T>(string name = null) where T : MonoBehaviour
        {
            var existing = FindFirstObjectByType<T>();
            if (existing != null) return existing;
            var go = new GameObject(name ?? typeof(T).Name);
            return go.AddComponent<T>();
        }

        private void SpawnWorld()
        {
            Debug.Log("[Insimul] Spawning world entities...");
            // Terrain
            var wsm = FindOrCreate<Insimul.World.WorldScaleManager>("WorldScaleManager");
            if (wsm != null) wsm.Initialize(WorldData);

            // Buildings
            var bg = FindOrCreate<Insimul.World.ProceduralBuildingGenerator>("BuildingGenerator");
            bg.GenerateFromData(WorldData);

            // Roads
            var rg = FindOrCreate<Insimul.World.RoadGenerator>("RoadGenerator");
            rg.GenerateFromData(WorldData);

            // Water features
            var wfg = FindOrCreate<Insimul.World.WaterFeatureGenerator>("WaterFeatureGenerator");
            wfg.GenerateFromData(WorldData);

            // Nature (after buildings/roads so it can avoid them)
            var ng = FindOrCreate<Insimul.World.ProceduralNatureGenerator>("NatureGenerator");
            ng.SetPositionValidator((x, z) =>
            {
                if (WorldData?.entities?.buildings == null) return false;
                foreach (var b in WorldData.entities.buildings)
                {
                    if (b.position == null) continue;
                    float dx = x - b.position.x;
                    float dz = z - b.position.z;
                    if (dx * dx + dz * dz < 64f) return true; // 8m radius
                }
                return false;
            });
            ng.GenerateFromData(WorldData);

            // Day/night cycle
            var dnc = FindOrCreate<Insimul.World.DayNightCycleManager>("DayNightCycle");
            dnc.Initialize();

            // Weather (after day/night — adds to its fog baseline)
            var weather = FindOrCreate<Insimul.World.WeatherSystem>("WeatherSystem");
            weather.Initialize();

            // NPCs
            var npcMgr = FindOrCreate<Insimul.Characters.NPCManager>("NPCManager");
            npcMgr.SpawnNPCs(WorldData);

            // Ambient animals (cats, dogs, birds near settlements)
            var animals = FindOrCreate<Insimul.World.AnimalAmbientLifeSystem>("AmbientAnimals");
            animals.Initialize(WorldData);

            // World items
            var itemMgr = FindOrCreate<Insimul.World.ItemSpawnManager>("ItemSpawnManager");
            itemMgr.SpawnWorldItems(WorldData);

            // Containers (chests, barrels, crates with loot)
            var containers = FindOrCreate<Insimul.Systems.ContainerManager>("ContainerManager");
            containers.SpawnContainers(WorldData);

            // Outdoor furniture (benches, market stalls, wells, signs, barrels)
            var furniture = FindOrCreate<Insimul.World.OutdoorFurnitureGenerator>("OutdoorFurniture");
            furniture.Generate(WorldData);

            // Building signs (business names above buildings)
            var signs = FindOrCreate<Insimul.World.BuildingSignManager>("BuildingSignManager");
            signs.GenerateSigns(WorldData);

            // Quest indicators (! and ? markers on NPCs)
            var questIndicators = FindOrCreate<Insimul.UI.QuestIndicatorManager>("QuestIndicators");
            questIndicators.Initialize(WorldData);

            // Building interiors (entry/exit triggers + interior spaces)
            var interiorGen = FindOrCreate<Insimul.World.BuildingInteriorGenerator>("InteriorGenerator");
            interiorGen.GenerateInteriors(WorldData);

            // Systems
            var actionSys = FindOrCreate<Insimul.Systems.ActionSystem>("ActionSystem");
            actionSys.LoadFromData(WorldData);

            var questSys = FindOrCreate<Insimul.Systems.QuestSystem>("QuestSystem");
            questSys.LoadFromData(WorldData);

            // Quest waypoints (3D markers for active objectives)
            var waypoints = FindOrCreate<Insimul.UI.QuestWaypointManager>("QuestWaypoints");
            waypoints.Initialize(WorldData);

            // Notification toasts (singleton, self-manages)
            FindOrCreate<Insimul.UI.NotificationSystem>("NotificationSystem");

            var combatSys = FindOrCreate<Insimul.Systems.CombatSystem>("CombatSystem");
            combatSys.LoadFromData(WorldData);

            var ruleSys = FindOrCreate<Insimul.Systems.RuleEnforcer>("RuleEnforcer");
            ruleSys.LoadFromData(WorldData);

            var survivalSys = FindOrCreate<Insimul.Systems.SurvivalSystem>("SurvivalSystem");
            survivalSys.LoadFromData(WorldData);

            // Reputation and relationships
            var repMgr = FindOrCreate<Insimul.Systems.ReputationManager>("ReputationManager");
            repMgr.Initialize(WorldData);

            // Interaction prompts and NPC greetings (self-initialize in Start)
            FindOrCreate<Insimul.Systems.InteractionPromptSystem>("InteractionPrompts");
            FindOrCreate<Insimul.Characters.NPCGreetingSystem>("NPCGreetings");

            // Audio
            FindOrCreate<Insimul.Systems.AudioManager>("AudioManager");
            var ambientSound = FindOrCreate<Insimul.Systems.AmbientSoundSystem>("AmbientSound");
            ambientSound.Initialize();

            // Onboarding tutorial (self-manages, skips if already completed)
            FindOrCreate<Insimul.Systems.OnboardingManager>("Onboarding");

            Debug.Log("[Insimul] World spawning complete.");
        }
    }
}
