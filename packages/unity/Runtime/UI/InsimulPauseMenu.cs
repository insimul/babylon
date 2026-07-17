// InsimulPauseMenu.cs — unified ESC / pause menu (the GameMenuSystem equivalent),
// a thin UGUI view over InsimulPauseMenuModel (US-UU5).
//
// Builds a tab bar from the model's VISIBLE tabs (module-bundle-gated, driven off the
// active genre bundle), routes active-tab selection through the model, and owns the
// engine-coupled bits the model can't: Time.timeScale pausing, cursor visibility, and
// the ESC toggle. Configure the enabled feature modules with Configure() (from the
// active genre bundle) or ConfigureGenre() (from the IR's genre id). Registered under
// the `pause_menu` / `game_menu` panel keys.
//
// Structural-gate-only (UnityEngine-coupled); the tab-gating + active-tab logic is
// host-tested in the pure InsimulPauseMenuModel against the shared corpus
// (packages/core/conformance/ui/pause-menu-cases.json).

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Insimul.UI
{
    public sealed class InsimulPauseMenu : MonoBehaviour
    {
        [SerializeField] private GameObject _root;
        [SerializeField] private Transform _tabBar;       // holds the tab buttons
        [SerializeField] private Button _tabButtonPrefab;
        [SerializeField] private TMPro.TMP_Text _title;

        private InsimulPauseMenuModel _model = new InsimulPauseMenuModel();

        /// <summary>Fired when the menu opens.</summary>
        public event Action Opened;
        /// <summary>Fired when the menu closes.</summary>
        public event Action Closed;
        /// <summary>Fired when the active tab changes (the panel key to show).</summary>
        public event Action<string> TabSelected;

        public InsimulPauseMenuModel Model => _model;

        /// <summary>Set the enabled feature-module ids (from the active genre bundle) —
        /// regates the tab set.</summary>
        public void Configure(IEnumerable<string> enabledModules)
        {
            _model = new InsimulPauseMenuModel(enabledModules);
            RebuildTabs();
        }

        /// <summary>Configure from the IR's genre id (its default module bundle gates
        /// the tabs).</summary>
        public void ConfigureGenre(string genreId)
        {
            _model = InsimulPauseMenuModel.ForGenre(genreId);
            RebuildTabs();
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape)) Toggle();
        }

        public void Toggle()
        {
            _model.Toggle();
            ApplyOpenState();
        }

        public void OpenMenu(string tab = null)
        {
            _model.OpenMenu(tab);
            ApplyOpenState();
        }

        public void CloseMenu()
        {
            _model.CloseMenu();
            ApplyOpenState();
        }

        public string ActiveTab() => _model.ActiveTab();

        private void ApplyOpenState()
        {
            bool open = _model.IsOpen();
            if (_root != null) _root.SetActive(open);
            Time.timeScale = open ? 0f : 1f;
            Cursor.visible = open;
            Cursor.lockState = open ? CursorLockMode.None : CursorLockMode.Locked;
            if (open)
            {
                RebuildTabs();
                Opened?.Invoke();
                TabSelected?.Invoke(_model.ActiveTab());
            }
            else
            {
                Closed?.Invoke();
            }
        }

        private void SelectTab(string key)
        {
            if (_model.SetActive(key))
            {
                if (_title != null) _title.text = key;
                TabSelected?.Invoke(key);
            }
        }

        private void RebuildTabs()
        {
            if (_tabBar == null || _tabButtonPrefab == null) return;
            for (int i = _tabBar.childCount - 1; i >= 0; i--)
                Destroy(_tabBar.GetChild(i).gameObject);
            foreach (MenuTabDef tab in _model.VisibleTabs())
            {
                Button btn = Instantiate(_tabButtonPrefab, _tabBar);
                var label = btn.GetComponentInChildren<TMPro.TMP_Text>();
                if (label != null) label.text = tab.Label;
                string key = tab.Key;
                btn.onClick.AddListener(() => SelectTab(key));
            }
            if (_title != null) _title.text = _model.ActiveTab();
        }
    }
}
