// InsimulQuestRuntime — the stateful quest shell over the portable core (US-UC3).
//
// The Unity twin of the Unreal FInsimulQuestSystemShell: it owns an InsimulKB
// (currentState.prologFacts) + the registered HydratedQuests and routes ALL
// semantics through InsimulQuestSystem. It reimplements nothing — the shell is a
// thin event surface that preserves the template QuestSystem.cs public events so
// existing UI (QuestTrackerUI, QuestJournalUI, ...) keeps working after the
// completion detection is swapped to run on the real KB:
//
//   OnQuestAccepted(questId)                — a quest registered / accepted
//   OnObjectiveCompleted(questId, objectiveId)
//   OnQuestCompleted(questId)
//
// (OnQuestItemCollected / OnStoryTTS remain the template MonoBehaviour's concern —
// this runtime is the KB-backed core those events fire off of.)
//
// Completion is fact-driven: AssertFact() records a trigger fact (talked_to,
// visited, delivered, objective_satisfied) into the KB, then EvaluateQuest()
// re-checks and broadcasts the delegates for any NEW transition. Rewards are read
// from the hydrated Prolog content (quest_reward/3) via GetExperienceReward —
// never from a denormalized C# field.
//
// Save/load is KB-backed: Facts returns currentState.prologFacts to hand to
// InsimulSaveSystem.SnapshotFacts; LoadFacts restores from RestoreFacts. Registered
// quest status is re-derived from the restored facts, so quest state round-trips
// through the save file with no separate persistence.
//
// UnityEngine-FREE (System.* only) — host-tests under tools/verify-unity. The
// template MonoBehaviour is a thin wrapper that forwards its events to these
// (US-UC5 template integration).

using System;
using System.Collections.Generic;
using Insimul.Save;

namespace Insimul.Quest
{
    /// <summary>Stateful KB-backed quest shell preserving the template events.</summary>
    public sealed class InsimulQuestRuntime
    {
        private readonly InsimulKB _kb = new InsimulKB();
        private readonly List<HydratedQuest> _quests = new List<HydratedQuest>();
        private readonly Dictionary<string, HydratedQuest> _byId = new Dictionary<string, HydratedQuest>(StringComparer.Ordinal);

        // Template-compatible events (UI code subscribes to these).
        public event Action<string> OnQuestAccepted;
        public event Action<string, string> OnObjectiveCompleted;
        public event Action<string> OnQuestCompleted;

        /// <summary>The KB the quest system drives (currentState.prologFacts).</summary>
        public InsimulKB Kb => _kb;

        public int QuestCount => _quests.Count;
        public IReadOnlyList<HydratedQuest> Quests => _quests;

        /// <summary>Hydrate <paramref name="content"/> and register the quest by its
        /// parsed id. Fires <see cref="OnQuestAccepted"/>. Returns the hydrated quest.</summary>
        public HydratedQuest RegisterQuest(string content, string runtimeStatus = null)
        {
            var quest = InsimulQuestSystem.HydrateFromContent(content, runtimeStatus);
            if (string.IsNullOrEmpty(quest.Id)) return quest;

            if (_byId.TryGetValue(quest.Id, out var existing))
            {
                int idx = _quests.IndexOf(existing);
                _quests[idx] = quest;
            }
            else
            {
                _quests.Add(quest);
            }
            _byId[quest.Id] = quest;
            OnQuestAccepted?.Invoke(quest.Id);
            return quest;
        }

        public HydratedQuest GetQuest(string questId)
        {
            return questId != null && _byId.TryGetValue(questId, out var q) ? q : null;
        }

        /// <summary>Assert a ground trigger fact into the KB (atom args).</summary>
        public void AssertFact(string predicate, params string[] atomArgs)
        {
            var args = new PrologArg[atomArgs != null ? atomArgs.Length : 0];
            for (int i = 0; i < args.Length; i++) args[i] = PrologArg.Atom(atomArgs[i]);
            _kb.Assert(new PrologFact(predicate, args));
        }

        /// <summary>Re-evaluate one registered quest against the KB, broadcasting the
        /// template delegates for any NEW objective/quest transition.</summary>
        public QuestTransition EvaluateQuest(string questId)
        {
            var quest = GetQuest(questId);
            if (quest == null) return new QuestTransition { QuestId = questId ?? string.Empty };

            bool wasCompleted = quest.HasStatus && quest.Status == "completed";
            var transition = InsimulQuestSystem.EvaluateQuest(quest, _kb);

            foreach (var objId in transition.SatisfiedObjectiveIds)
                OnObjectiveCompleted?.Invoke(quest.Id, objId);

            if (transition.Completed && !wasCompleted)
                OnQuestCompleted?.Invoke(quest.Id);

            return transition;
        }

        /// <summary>Re-evaluate every registered quest (e.g. after a batch of facts).</summary>
        public void EvaluateAll()
        {
            // Snapshot the id list — EvaluateQuest does not add quests.
            var ids = new List<string>(_byId.Count);
            foreach (var q in _quests) ids.Add(q.Id);
            foreach (var id in ids) EvaluateQuest(id);
        }

        /// <summary>Experience reward for a quest, read from the hydrated Prolog content
        /// (quest_reward/3). 0 when the content carries no experience reward — there is
        /// no denormalized default.</summary>
        public double GetExperienceReward(string questId)
        {
            var q = GetQuest(questId);
            return q != null && q.HasExperience ? q.ExperienceReward : 0.0;
        }

        public bool IsQuestComplete(string questId)
        {
            var q = GetQuest(questId);
            return q != null && q.HasStatus && q.Status == "completed";
        }

        // ── Save seam (KB-backed persistence) ─────────────────────────────────

        /// <summary>The KB facts to hand to InsimulSaveSystem.SnapshotFacts.</summary>
        public IReadOnlyList<PrologFact> Facts => _kb.Facts;

        /// <summary>Restore the KB from InsimulSaveSystem.RestoreFacts and re-derive
        /// each registered quest's status from the restored quest_complete facts.</summary>
        public void LoadFacts(IEnumerable<PrologFact> facts)
        {
            _kb.Load(facts);
            foreach (var quest in _quests)
            {
                if (_kb.Has("quest_complete", new[] { PrologArg.Atom(quest.Id) }))
                {
                    quest.HasStatus = true;
                    quest.Status = "completed";
                }
            }
        }
    }
}
