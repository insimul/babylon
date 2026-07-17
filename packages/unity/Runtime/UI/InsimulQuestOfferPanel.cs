// InsimulQuestOfferPanel.cs — thin UGUI offer dialog over InsimulQuestJournalModel
// (US-UU2).
//
// Presents a single AVAILABLE quest (from an NPC giver or a radiant arrival) with
// Accept / Decline. The model owns the transitions (accept: available -> active,
// decline: removed); it is the SAME model instance the journal + tracker share (via
// the feed) so an accepted offer immediately shows as active in the journal. The
// accept path also asserts the quest fact through the runtime so the KB agrees.
// Structural-gate-only (UnityEngine-coupled); the transition logic is host-tested in
// the pure model.

using System;
using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulQuestOfferPanel : MonoBehaviour
    {
        [SerializeField] private TMPro.TMP_Text _title;
        [SerializeField] private TMPro.TMP_Text _description;
        [SerializeField] private GameObject _root;

        private InsimulQuestJournalModel _model;
        private string _questId;

        /// <summary>Fired when the player accepts an offered quest.</summary>
        public event Action<string> Accepted;
        /// <summary>Fired when the player declines an offered quest.</summary>
        public event Action<string> Declined;

        /// <summary>Share the journal/tracker model so an accept shows up there.</summary>
        public void Bind(InsimulQuestJournalModel model) => _model = model;

        /// <summary>Present an offer. The entry is upserted (as available) into the
        /// shared model so the journal's Available tab reflects it too.</summary>
        public void Present(QuestEntry entry)
        {
            if (entry == null) return;
            _model?.Upsert(entry);
            _questId = entry.Id;
            if (_title != null) _title.text = entry.Title;
            if (_description != null) _description.text = entry.Description;
            if (_root != null) _root.SetActive(true);
        }

        /// <summary>Accept button handler.</summary>
        public void OnAccept()
        {
            if (_model != null && _model.Accept(_questId)) Accepted?.Invoke(_questId);
            Hide();
        }

        /// <summary>Decline button handler.</summary>
        public void OnDecline()
        {
            if (_model != null && _model.Decline(_questId)) Declined?.Invoke(_questId);
            Hide();
        }

        private void Hide()
        {
            if (_root != null) _root.SetActive(false);
        }
    }
}
