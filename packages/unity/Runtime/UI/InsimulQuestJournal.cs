// InsimulQuestJournal.cs — thin UGUI view over InsimulQuestJournalModel (US-UU2).
//
// The journal screen (the GameMenuSystem "Quests" tab / BabylonQuestTracker journal):
// four filter tabs (all / active / completed / available) with count badges, and the
// filtered quest rows with a track toggle. All filtering / counts / tracking logic is
// host-tested in the pure model; this view resolves through the shared feed so an
// accepted offer or a radiant arrival shows up here on the feed's Changed signal —
// no per-frame polling. Structural-gate-only (UnityEngine-coupled).

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulQuestJournal : MonoBehaviour
    {
        [SerializeField] private RectTransform _list;
        [SerializeField] private GameObject _rowPrefab;

        private InsimulQuestFeed _feed;
        private InsimulQuestJournalModel _model;

        /// <summary>Bind the shared feed (whose model backs the journal + tracker + offer
        /// panels alike).</summary>
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

        /// <summary>Switch the active journal tab (wired to the tab buttons).</summary>
        public void SetFilter(string filter)
        {
            if (_model == null) return;
            _model.SetFilter(filter);
            Repaint();
        }

        /// <summary>Toggle tracking of a quest from a row's track button.</summary>
        public void ToggleTrack(string questId)
        {
            if (_model == null) return;
            if (_model.IsTracked(questId)) _model.Untrack(questId);
            else _model.Track(questId);
            Repaint();
        }

        private void Repaint()
        {
            if (_list == null || _model == null) return;
            for (int i = _list.childCount - 1; i >= 0; i--)
                Destroy(_list.GetChild(i).gameObject);

            foreach (QuestEntry quest in _model.Filtered())
            {
                if (_rowPrefab == null) continue;
                GameObject row = Instantiate(_rowPrefab, _list);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text == null) continue;
                string marker = _model.IsTracked(quest.Id) ? "★ " : string.Empty;
                string radiant = quest.IsRadiant ? " [radiant]" : string.Empty;
                text.text = $"{marker}{quest.Title}  [{quest.Status}]{radiant}";
            }
        }
    }
}
