// InsimulQuestTracker.cs — thin UGUI HUD over InsimulQuestJournalModel + the event
// feed (US-UU2).
//
// The on-screen tracked-quest list (the BabylonQuestTracker equivalent). It repaints
// ONLY when InsimulQuestFeed raises Changed — no per-frame polling (the old
// QuestTrackerUI prototype re-read the active set every Update()). All the tracking /
// bounding / objective-tick logic is host-tested in the pure model + feed; this view
// just materializes rows. Structural-gate-only (UnityEngine-coupled).

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulQuestTracker : MonoBehaviour
    {
        [SerializeField] private RectTransform _container;
        [SerializeField] private GameObject _rowPrefab;

        private InsimulQuestFeed _feed;
        private InsimulQuestJournalModel _model;

        /// <summary>Bind the shared feed (its model is the tracker's source of truth).</summary>
        public void Bind(InsimulQuestFeed feed)
        {
            if (_feed != null) _feed.Changed -= Repaint;
            _feed = feed;
            _model = feed != null ? feed.Model : null;
            if (_feed != null) _feed.Changed += Repaint;
            Repaint();
        }

        private void OnDisable()
        {
            if (_feed != null) _feed.Changed -= Repaint;
        }

        private void Repaint()
        {
            if (_container == null || _model == null) return;
            for (int i = _container.childCount - 1; i >= 0; i--)
                Destroy(_container.GetChild(i).gameObject);

            foreach (QuestEntry quest in _model.TrackedQuests())
            {
                if (_rowPrefab == null) continue;
                GameObject row = Instantiate(_rowPrefab, _container);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text == null) continue;
                var (done, total) = _model.ObjectiveProgress(quest.Id);
                text.text = total > 0
                    ? $"◈ {quest.Title}  ({done}/{total})"
                    : $"◈ {quest.Title}";
            }
        }
    }
}
