// InsimulMainMenu.cs — title-screen main menu (US-UU5), a thin UGUI view over
// InsimulSaveSlotModel.
//
// The title-screen entry point: Continue / New Game / Load / Settings / Exit (the
// MainMenuScreen set). The Continue + Load affordances gate on whether any slot is
// loadable, reusing the InsimulSaveSlotModel contract (HasAnyLoadable) so the main menu
// and the in-game save/load panel agree on what "has a save" means. Feed
// codec-reported slot outcomes via SetSlots(). Registered under the `main_menu` key.
//
// Structural-gate-only (UnityEngine-coupled); the loadable-gate logic is host-tested in
// the pure InsimulSaveSlotModel.

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Insimul.UI
{
    public sealed class InsimulMainMenu : MonoBehaviour
    {
        [SerializeField] private Button _continueButton;
        [SerializeField] private Button _loadButton;

        private readonly InsimulSaveSlotModel _slots = new InsimulSaveSlotModel();

        /// <summary>Continue the most recent save.</summary>
        public event Action ContinueRequested;
        public event Action NewGameRequested;
        public event Action LoadRequested;
        public event Action SettingsRequested;
        public event Action ExitRequested;

        /// <summary>Set the codec-reported slot outcomes (gates Continue/Load).</summary>
        public void SetSlots(IEnumerable<SlotLoadResult> results)
        {
            _slots.SetSlots(results);
            RefreshGates();
        }

        public bool HasSave() => _slots.HasAnyLoadable();

        public void OnContinue() => ContinueRequested?.Invoke();
        public void OnNewGame() => NewGameRequested?.Invoke();
        public void OnLoad() => LoadRequested?.Invoke();
        public void OnSettings() => SettingsRequested?.Invoke();
        public void OnExit() => ExitRequested?.Invoke();

        private void RefreshGates()
        {
            bool has = _slots.HasAnyLoadable();
            if (_continueButton != null) _continueButton.interactable = has;
            if (_loadButton != null) _loadButton.interactable = has;
        }
    }
}
