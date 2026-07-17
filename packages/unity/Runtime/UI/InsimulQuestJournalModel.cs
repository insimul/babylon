// InsimulQuestJournalModel.cs — quest journal / tracker / offer view-model (US-UU2).
//
// The Unity mirror of the engine-neutral quest UI contract
// (packages/core/src/ui/quest-journal-model.ts + the Godot quest_journal_model.gd).
// Holds the player-facing quest set (present-only projections: id, title,
// difficulty, status, objectives) and the interaction state the three quest panels
// share:
//   • the JOURNAL — tab filtering (all / active / completed / available) + counts,
//   • the TRACKER HUD — the bounded set of tracked ACTIVE quests (+ objective ticks),
//   • the OFFER dialog — accept / decline of an AVAILABLE quest (radiant arrivals
//     land here via Upsert()).
//
// Lifecycle transitions mirror the real InsimulQuestRuntime signals — Accept
// (OnQuestAccepted: available -> active), Complete (OnQuestCompleted: active ->
// completed, auto-untracked), Upsert (OnRadiantQuestGenerated: a radiant arrival
// appears as available). The shared cases live in
// packages/core/conformance/ui/quest-journal-cases.json, so every default-UI mirror
// (Babylon / Godot / Unreal / Unity) runs the SAME matrix.
//
// Objective progress (the tracker's per-quest ticks) is fed separately via
// MarkObjective(), driven off the runtime's OnObjectiveCompleted signal by
// InsimulQuestFeed — it is projection state, not part of the shared corpus matrix.
//
// UnityEngine-FREE so it host-tests on a bare .NET SDK (tools/verify-unity). The
// thin UGUI views (InsimulQuestJournal / InsimulQuestTracker / InsimulQuestOfferPanel,
// structural-gate-only) just reflect Filtered()/Counts()/TrackedQuests() into widgets.

using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>One quest objective projection (id + human description). Completion
    /// is tracked out-of-band by the model (MarkObjective) so a re-Upsert never wipes
    /// progress.</summary>
    public sealed class QuestObjective
    {
        public string Id = string.Empty;
        public string Description = string.Empty;

        public QuestObjective Clone() => new QuestObjective { Id = Id, Description = Description };
    }

    /// <summary>A present-only quest projection shown by the journal / tracker / offer
    /// panels.</summary>
    public sealed class QuestEntry
    {
        public string Id = string.Empty;
        public string Title = string.Empty;
        public string Description = string.Empty;
        public string Difficulty = string.Empty;
        /// <summary>available | active | completed.</summary>
        public string Status = string.Empty;
        /// <summary>True when the quest arrived via the radiant tick (quest_offered).</summary>
        public bool IsRadiant;
        public readonly List<QuestObjective> Objectives = new List<QuestObjective>();

        public QuestEntry Clone()
        {
            var e = new QuestEntry
            {
                Id = Id,
                Title = Title,
                Description = Description,
                Difficulty = Difficulty,
                Status = Status,
                IsRadiant = IsRadiant,
            };
            foreach (var o in Objectives) e.Objectives.Add(o.Clone());
            return e;
        }
    }

    /// <summary>Per-filter quest counts (the journal tab badges).</summary>
    public sealed class QuestCounts
    {
        public int All;
        public int Active;
        public int Completed;
        public int Available;
    }

    /// <summary>Quest journal / tracker / offer view-model. Pure; no Unity types.</summary>
    public sealed class InsimulQuestJournalModel
    {
        /// <summary>Default cap on simultaneously-tracked quests (the tracker HUD).</summary>
        public const int DefaultMaxTracked = 3;

        // Insertion-ordered quest list (order is stable + part of the contract).
        private readonly List<string> _order = new List<string>();
        private readonly Dictionary<string, QuestEntry> _byId = new Dictionary<string, QuestEntry>();
        private readonly List<string> _tracked = new List<string>();
        // questId -> completed objective ids (progress ticks).
        private readonly Dictionary<string, HashSet<string>> _objectiveDone =
            new Dictionary<string, HashSet<string>>();
        private string _filter = "all";

        public int MaxTracked { get; }

        public InsimulQuestJournalModel(int maxTracked = DefaultMaxTracked)
        {
            MaxTracked = maxTracked > 0 ? maxTracked : DefaultMaxTracked;
        }

        /// <summary>Replace the whole quest set (e.g. on load), preserving given order.</summary>
        public void SetQuests(IEnumerable<QuestEntry> entries)
        {
            _order.Clear();
            _byId.Clear();
            _tracked.Clear();
            _objectiveDone.Clear();
            if (entries == null) return;
            foreach (var e in entries) Upsert(e);
        }

        /// <summary>Add or replace a quest by id (a radiant arrival / quest_offered lands
        /// here). A brand-new id is appended so list order stays stable.</summary>
        public void Upsert(QuestEntry entry)
        {
            if (entry == null || string.IsNullOrEmpty(entry.Id)) return;
            if (!_byId.ContainsKey(entry.Id)) _order.Add(entry.Id);
            _byId[entry.Id] = entry.Clone();
        }

        public QuestEntry Get(string id) =>
            id != null && _byId.TryGetValue(id, out var e) ? e.Clone() : null;

        /// <summary>Accept an AVAILABLE quest (available -> active). No-op otherwise.</summary>
        public bool Accept(string id)
        {
            if (id == null || !_byId.TryGetValue(id, out var e) || e.Status != "available") return false;
            e.Status = "active";
            return true;
        }

        /// <summary>Decline an AVAILABLE quest (offer dismissed) — removes it entirely.</summary>
        public bool Decline(string id)
        {
            if (id == null || !_byId.TryGetValue(id, out var e) || e.Status != "available") return false;
            Remove(id);
            return true;
        }

        /// <summary>Complete an ACTIVE quest (active -> completed) and auto-untrack it.</summary>
        public bool Complete(string id)
        {
            if (id == null || !_byId.TryGetValue(id, out var e) || e.Status != "active") return false;
            e.Status = "completed";
            Untrack(id);
            return true;
        }

        private void Remove(string id)
        {
            _byId.Remove(id);
            _order.Remove(id);
            _objectiveDone.Remove(id);
            Untrack(id);
        }

        // ── Filtering / counts ──────────────────────────────────────────────────

        public void SetFilter(string filter) => _filter = filter ?? "all";

        public string CurrentFilter() => _filter;

        /// <summary>Quests matching the current filter, in stable insertion order.</summary>
        public List<QuestEntry> Filtered()
        {
            var outList = new List<QuestEntry>();
            foreach (var id in _order)
            {
                var e = _byId[id];
                if (_filter == "all" || e.Status == _filter) outList.Add(e.Clone());
            }
            return outList;
        }

        public List<string> FilteredIds()
        {
            var outList = new List<string>();
            foreach (var e in Filtered()) outList.Add(e.Id);
            return outList;
        }

        public QuestCounts Counts()
        {
            var c = new QuestCounts();
            foreach (var id in _order)
            {
                c.All++;
                switch (_byId[id].Status)
                {
                    case "active": c.Active++; break;
                    case "completed": c.Completed++; break;
                    case "available": c.Available++; break;
                }
            }
            return c;
        }

        // ── Tracker HUD ─────────────────────────────────────────────────────────

        /// <summary>Track an ACTIVE quest for the HUD. Fails if the quest is not active,
        /// already tracked, or the tracked set is full (MaxTracked). Returns true on a
        /// change.</summary>
        public bool Track(string id)
        {
            if (id == null || !_byId.TryGetValue(id, out var e) || e.Status != "active") return false;
            if (_tracked.Contains(id)) return false;
            if (_tracked.Count >= MaxTracked) return false;
            _tracked.Add(id);
            return true;
        }

        public bool Untrack(string id)
        {
            return id != null && _tracked.Remove(id);
        }

        public bool IsTracked(string id) => id != null && _tracked.Contains(id);

        /// <summary>The tracker HUD view: tracked quests that are still active, in track
        /// order.</summary>
        public List<QuestEntry> TrackedQuests()
        {
            var outList = new List<QuestEntry>();
            foreach (var id in _tracked)
                if (_byId.TryGetValue(id, out var e) && e.Status == "active") outList.Add(e.Clone());
            return outList;
        }

        public List<string> TrackedIds()
        {
            var outList = new List<string>();
            foreach (var e in TrackedQuests()) outList.Add(e.Id);
            return outList;
        }

        // ── Objective progress ticks ────────────────────────────────────────────

        /// <summary>Mark an objective of a quest complete/incomplete (driven off the
        /// runtime's OnObjectiveCompleted signal). Returns true if the state changed.</summary>
        public bool MarkObjective(string questId, string objectiveId, bool done)
        {
            if (string.IsNullOrEmpty(questId) || string.IsNullOrEmpty(objectiveId)) return false;
            if (!_objectiveDone.TryGetValue(questId, out var set))
            {
                if (!done) return false;
                set = new HashSet<string>();
                _objectiveDone[questId] = set;
            }
            return done ? set.Add(objectiveId) : set.Remove(objectiveId);
        }

        public bool IsObjectiveDone(string questId, string objectiveId) =>
            questId != null && objectiveId != null
            && _objectiveDone.TryGetValue(questId, out var set) && set.Contains(objectiveId);

        /// <summary>Objective progress for a quest as (completed, total) — the tracker's
        /// "2/3" tick. Total is 0 for an unknown quest.</summary>
        public (int Completed, int Total) ObjectiveProgress(string questId)
        {
            if (questId == null || !_byId.TryGetValue(questId, out var e)) return (0, 0);
            int total = e.Objectives.Count;
            if (total == 0) return (0, 0);
            _objectiveDone.TryGetValue(questId, out var set);
            int done = 0;
            foreach (var o in e.Objectives)
                if (set != null && set.Contains(o.Id)) done++;
            return (done, total);
        }
    }
}
