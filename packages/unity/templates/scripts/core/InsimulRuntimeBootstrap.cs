using System;
using UnityEngine;
using Insimul.Prolog;
using Insimul.Quest;
using Insimul.Radiant;
using Insimul.Runtime;
using Insimul.Save;
using Insimul.World;

namespace Insimul.Core
{
    /// <summary>
    /// The new game-template startup orchestrator (US-UC5) — the thin Unity
    /// (MonoBehaviour) layer over the UnityEngine-free <see cref="InsimulRuntimeContext"/>.
    ///
    /// It runs the full loop the portable core defines:
    ///
    ///     world source  ->  save slot select / new-game  ->  KB up  ->  systems init
    ///
    /// and replaces the per-file JSON world/save loading the legacy bootstrap did
    /// with <c>JsonUtility</c> (see MIGRATION.md). All orchestration logic lives in
    /// the portable context; this class holds only Unity glue — reading the
    /// StreamingAssets world, picking a save slot, standing up the native Prolog KB,
    /// and bridging the KB-backed quest runtime's events onto the existing template
    /// <see cref="Insimul.Systems.QuestSystem"/> MonoBehaviour so shipped UI keeps
    /// working (US-UC3 preserved the same event surface).
    ///
    /// Attach to an empty GameObject alongside (or in place of) InsimulGameManager.
    /// The MonoBehaviour is structural-gate only (UnityEngine-coupled) — its
    /// behaviour is proven by the host tests on InsimulRuntimeContext
    /// (tools/verify-unity RunBootstrapTests).
    /// </summary>
    public class InsimulRuntimeBootstrap : MonoBehaviour
    {
        public static InsimulRuntimeBootstrap Instance { get; private set; }

        [Header("World source")]
        [Tooltip("StreamingAssets-relative path to the golden world (WorldIR export or a SaveFile.worldSnapshot).")]
        public string worldRelativePath = "world/world.json";

        [Header("Save slot")]
        [Tooltip("Slot to resume/save. A missing or corrupt slot falls back to a new game.")]
        public int saveSlot = 0;
        [Tooltip("insimulVersion stamped into written envelopes.")]
        public string insimulVersion = "unknown";

        [Header("Radiant tick")]
        [Tooltip("Consulted radiant template pack (Prolog) — folded into the tick program.")]
        [TextArea(2, 8)] public string radiantTemplateProgram = string.Empty;
        public int radiantMaxQuests = 3;

        /// <summary>The portable startup orchestrator (all logic lives here).</summary>
        public InsimulRuntimeContext Runtime { get; private set; }
        public bool DidResumeSave { get; private set; }
        public bool IsBooted { get; private set; }

        private InsimulProlog _kb;
        private PersistentDataSaveStore _store;
        private long _radiantTick;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Boot();
        }

        /// <summary>
        /// world source -> save slot -> KB -> systems init. A present-but-corrupt
        /// slot never bricks the boot (Boot falls back to a new game).
        /// </summary>
        public void Boot()
        {
            _store = new PersistentDataSaveStore(insimulVersion);
            Runtime = new InsimulRuntimeContext();

            // 1) World source (golden world JSON off StreamingAssets).
            string worldJson = ReadStreamingAsset(worldRelativePath);
            if (string.IsNullOrEmpty(worldJson))
            {
                Debug.LogError($"[Insimul] Failed to read world source at StreamingAssets/{worldRelativePath}");
                return;
            }

            // 2) Save slot select — resume a valid slot, else new game from the world.
            string existingSaveJson = TryReadSlotSaveJson(saveSlot);
            var options = new NewGameOptions
            {
                Id = Guid.NewGuid().ToString(),
                WorldId = "world",
                Name = "New Game",
                SlotIndex = saveSlot,
                CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            };
            var boot = Runtime.Boot(existingSaveJson, worldJson, options);
            if (!boot.Ok)
            {
                Debug.LogError($"[Insimul] Boot failed: {boot.Error}");
                return;
            }
            DidResumeSave = boot.ResumedSave;

            // 3) KB up — stand up a native Prolog session from the restored
            //    currentState.prologFacts (the same engine the radiant solver drives).
            ConsultKb();

            // 4) Systems init — bridge the KB-backed quest runtime onto the template
            //    systems; dialogue (existing SDK) + inventory init unchanged.
            WireQuestEvents();

            IsBooted = true;
            Debug.Log($"[Insimul] Runtime booted ({(DidResumeSave ? "resumed save" : "new game")}): " +
                      $"{Runtime.World.Characters.Count} characters, {Runtime.Quests.QuestCount} quests");
        }

        /// <summary>
        /// Bridge the existing template <see cref="Insimul.Systems.QuestSystem"/>
        /// MonoBehaviour to the KB-backed runtime WITHOUT rewriting it: subscribe to
        /// its public gameplay events (allowed from outside — only <c>invoking</c> an
        /// event is class-private) and feed them into the runtime KB as trigger facts,
        /// then re-evaluate. The runtime's own events (<see cref="InsimulQuestRuntime.OnQuestCompleted"/>
        /// etc.) are the KB-derived truth new UI subscribes to; they keep the same
        /// signatures the template exposed (US-UC3) so shipped trackers keep working.
        /// </summary>
        private void WireQuestEvents()
        {
            var templateQuests = FindFirstObjectByType<Insimul.Systems.QuestSystem>();
            if (templateQuests == null) return;

            // Player-side gameplay events -> runtime KB trigger facts -> re-evaluate.
            templateQuests.OnObjectiveCompleted += (questId, objectiveId) =>
            {
                Runtime.Quests.AssertFact("objective_satisfied", questId, objectiveId);
                Runtime.EvaluateAllQuests();
            };
            templateQuests.OnQuestItemCollected += (questId, objectiveId, itemName) =>
            {
                Runtime.Quests.AssertFact("delivered", "player", itemName);
                Runtime.EvaluateAllQuests();
            };
        }

        // ── Radiant tick (same triggers as the Babylon RadiantQuestDirector) ─────

        /// <summary>Trigger a radiant tick (call on a time tick, quest board open, or
        /// quest completion). Generated quests flow into the runtime + persist on the
        /// next save; the read-only worldSnapshot is untouched.</summary>
        public void RadiantTick(double now)
        {
            if (!IsBooted) return;
            var solver = new InsimulPrologRadiantSolver(_kb);
            string program = Runtime.SerializeCanonical() + "\n" + radiantTemplateProgram;
            var opts = new RadiantOptions
            {
                Seed = RadiantSeed.FromString($"tick-{_radiantTick++}"),
                Now = now,
                MaxQuests = radiantMaxQuests,
            };
            Runtime.RunRadiantTick(program, solver, opts);
            ConsultKb(); // reflect the newly asserted radiant_* facts into the native KB
        }

        // ── Save / evaluate ──────────────────────────────────────────────────────

        /// <summary>Re-evaluate every quest against the KB (mirror the native KB back
        /// into the runtime's fact store first so query-driven completion sees it).</summary>
        public void EvaluateQuests()
        {
            if (IsBooted) Runtime.EvaluateAllQuests();
        }

        /// <summary>Commit live KB state into the save and persist to the slot.</summary>
        public void SaveToSlot()
        {
            if (!IsBooted) return;
            Runtime.CommitToSave();
            _store.Save(saveSlot, Runtime.Save, DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
        }

        private void ConsultKb()
        {
            // The runtime's fact store (currentState.prologFacts) is the truth; rebuild
            // the native session from the world's quest content + the live facts so it
            // can answer completion / radiant queries. (InsimulProlog has no in-place
            // clear, so a fresh session is the clean-slate path.)
            _kb?.Dispose();
            _kb = new InsimulProlog();
            foreach (string content in Runtime.World.QuestPrologContent())
                _kb.Consult(content);
            foreach (var fact in Runtime.Quests.Facts)
                _kb.Assert(FactToClause(fact));
        }

        private static string FactToClause(PrologFact fact)
        {
            if (fact.Args.Count == 0) return fact.Predicate;
            var args = new string[fact.Args.Count];
            for (int i = 0; i < fact.Args.Count; i++)
            {
                var a = fact.Args[i];
                args[i] = a.IsNumber ? a.Num.ToString(System.Globalization.CultureInfo.InvariantCulture) : a.Str;
            }
            return $"{fact.Predicate}({string.Join(", ", args)})";
        }

        private string TryReadSlotSaveJson(int slot)
        {
            try
            {
                if (!_store.HasSlot(slot)) return null;
                var loaded = _store.Load(slot);           // verifies envelope integrity + migrates
                return loaded.SerializeCanonical();
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[Insimul] Slot {slot} unreadable ({ex.Message}) — starting a new game.");
                return null;
            }
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
            _kb?.Dispose();
            _kb = null;
        }

        private static string ReadStreamingAsset(string relativePath)
        {
            string path = System.IO.Path.Combine(Application.streamingAssetsPath, relativePath);
            // On desktop/editor StreamingAssets is a plain directory; Android needs the
            // StreamingAssetsWorldSource.ReadTextAsync coroutine instead.
            return System.IO.File.Exists(path) ? System.IO.File.ReadAllText(path) : null;
        }
    }
}
