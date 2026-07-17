// InsimulQuestFeed.cs — the event bridge from the KB-backed quest runtime to the
// quest-UI view-model (US-UU2).
//
// The tracker/journal panels must update the moment the quest system transitions —
// NOT by polling every frame (the old QuestTrackerUI prototype re-read the whole
// active set in Update()). This feed subscribes to the InsimulQuestRuntime signals
// (OnQuestAccepted / OnObjectiveCompleted / OnQuestCompleted / OnRadiantQuestGenerated)
// and folds each transition into an InsimulQuestJournalModel, raising Changed so a
// view repaints exactly once per real change.
//
// The projection HydratedQuest -> QuestEntry keeps only present-facing fields (id,
// title, difficulty, status, objectives). Radiant arrivals are flagged from the
// OnRadiantQuestGenerated signal. UnityEngine-FREE — the runtime + its managed KB are
// pure C#, so the whole event path host-tests on a bare .NET SDK (tools/verify-unity).

using System;
using Insimul.Quest;

namespace Insimul.UI
{
    /// <summary>Subscribes an <see cref="InsimulQuestJournalModel"/> to the quest
    /// runtime's event surface so the quest panels update without polling.</summary>
    public sealed class InsimulQuestFeed
    {
        private readonly InsimulQuestJournalModel _model;
        private readonly System.Collections.Generic.HashSet<string> _radiantIds =
            new System.Collections.Generic.HashSet<string>();
        private InsimulQuestRuntime _runtime;

        /// <summary>Fired once per real transition folded into the model (so a UGUI view
        /// repaints on the event, not every frame).</summary>
        public event Action Changed;

        public InsimulQuestJournalModel Model => _model;

        public InsimulQuestFeed(InsimulQuestJournalModel model = null)
        {
            _model = model ?? new InsimulQuestJournalModel();
        }

        /// <summary>Subscribe to a runtime's signals. Idempotent — a prior attachment is
        /// detached first (safe to call from OnEnable). A null runtime just detaches.</summary>
        public void Attach(InsimulQuestRuntime runtime)
        {
            Detach();
            _runtime = runtime;
            if (_runtime == null) return;
            _runtime.OnQuestAccepted += HandleAccepted;
            _runtime.OnObjectiveCompleted += HandleObjectiveCompleted;
            _runtime.OnQuestCompleted += HandleCompleted;
            _runtime.OnRadiantQuestGenerated += HandleRadiantGenerated;
        }

        /// <summary>Unsubscribe (call from OnDisable so the model does not leak the
        /// runtime).</summary>
        public void Detach()
        {
            if (_runtime == null) return;
            _runtime.OnQuestAccepted -= HandleAccepted;
            _runtime.OnObjectiveCompleted -= HandleObjectiveCompleted;
            _runtime.OnQuestCompleted -= HandleCompleted;
            _runtime.OnRadiantQuestGenerated -= HandleRadiantGenerated;
            _runtime = null;
        }

        private void HandleAccepted(string questId)
        {
            if (Sync(questId)) Changed?.Invoke();
        }

        private void HandleRadiantGenerated(string questId)
        {
            if (!string.IsNullOrEmpty(questId)) _radiantIds.Add(questId);
            if (Sync(questId)) Changed?.Invoke();
        }

        private void HandleCompleted(string questId)
        {
            Sync(questId);
            _model.Untrack(questId);
            Changed?.Invoke();
        }

        private void HandleObjectiveCompleted(string questId, string objectiveId)
        {
            if (_model.MarkObjective(questId, objectiveId, true)) Changed?.Invoke();
        }

        /// <summary>Re-project the runtime's current view of a quest into the model.
        /// Returns false (no repaint) when the id is unknown to the runtime.</summary>
        private bool Sync(string questId)
        {
            var q = _runtime?.GetQuest(questId);
            if (q == null) return false;
            _model.Upsert(Project(q, _radiantIds.Contains(questId)));
            return true;
        }

        /// <summary>Present-only projection of a hydrated quest for the UI.</summary>
        public static QuestEntry Project(HydratedQuest quest, bool isRadiant = false)
        {
            var e = new QuestEntry
            {
                Id = quest.Id,
                Title = quest.HasTitle ? quest.Title : quest.Id,
                Difficulty = quest.HasDifficulty ? quest.Difficulty : string.Empty,
                Status = quest.HasStatus ? quest.Status : "available",
                IsRadiant = isRadiant,
            };
            foreach (var o in quest.Objectives)
                e.Objectives.Add(new QuestObjective { Id = o.Id, Description = o.Description });
            return e;
        }
    }
}
