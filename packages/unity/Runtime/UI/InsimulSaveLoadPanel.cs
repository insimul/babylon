// InsimulSaveLoadPanel.cs — save / load slot UI (US-UU5), a thin UGUI view over
// InsimulSaveSlotModel.
//
// Renders one row per slot from the model (status/title/message + Load/Save
// affordances), showing the corrupted-envelope MESSAGING when the codec reports an
// integrity failure. Feed it codec-reported slot outcomes via SetSlots(); the panel
// raises LoadRequested / SaveRequested for the host to act on. Corrupted rows are
// tinted with the `danger` theme token. Registered under the `save_load` key.
//
// Structural-gate-only (UnityEngine-coupled); the outcome→row projection + messaging is
// host-tested in the pure InsimulSaveSlotModel against the shared corpus
// (packages/core/conformance/ui/save-slot-cases.json).

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Insimul.UI
{
    public sealed class InsimulSaveLoadPanel : MonoBehaviour
    {
        [SerializeField] private Transform _list;         // parent for slot rows
        [SerializeField] private InsimulSaveSlotRow _rowPrefab;

        private readonly InsimulSaveSlotModel _model = new InsimulSaveSlotModel();

        public event Action<int> LoadRequested;
        public event Action<int> SaveRequested;

        public InsimulSaveSlotModel Model => _model;

        /// <summary>Set the codec-reported slot outcomes ([{ index, outcome, summary? }]).</summary>
        public void SetSlots(IEnumerable<SlotLoadResult> results)
        {
            _model.SetSlots(results);
            Refresh();
        }

        private void Refresh()
        {
            if (_list == null || _rowPrefab == null) return;
            for (int i = _list.childCount - 1; i >= 0; i--)
                Destroy(_list.GetChild(i).gameObject);
            foreach (SlotView row in _model.Slots())
            {
                InsimulSaveSlotRow view = Instantiate(_rowPrefab, _list);
                view.Bind(row, () => LoadRequested?.Invoke(row.Index), () => SaveRequested?.Invoke(row.Index));
            }
        }
    }

    /// <summary>One save-slot row widget. Structural-gate-only.</summary>
    public sealed class InsimulSaveSlotRow : MonoBehaviour
    {
        [SerializeField] private TMPro.TMP_Text _title;
        [SerializeField] private TMPro.TMP_Text _message;
        [SerializeField] private Button _loadButton;
        [SerializeField] private Button _saveButton;

        public void Bind(SlotView row, Action onLoad, Action onSave)
        {
            if (_title != null)
            {
                _title.text = row.Title;
                if (row.Status == "corrupted") _title.color = InsimulUIThemeAsset.ToColor("danger");
            }
            if (_message != null)
            {
                _message.text = row.Message;
                _message.gameObject.SetActive(!string.IsNullOrEmpty(row.Message));
            }
            if (_loadButton != null)
            {
                _loadButton.interactable = row.CanLoad;
                _loadButton.onClick.AddListener(() => onLoad?.Invoke());
            }
            if (_saveButton != null)
            {
                _saveButton.interactable = row.CanSave;
                _saveButton.onClick.AddListener(() => onSave?.Invoke());
            }
        }
    }
}
