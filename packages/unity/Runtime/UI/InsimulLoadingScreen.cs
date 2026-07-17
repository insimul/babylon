// InsimulLoadingScreen.cs — thin UGUI view over InsimulLoadingScreenModel (US-UU1).
//
// The default loading-screen panel: a full-screen overlay with a progress bar, a
// phase label, and a rotating tip. It owns an InsimulLoadingScreenModel and just
// reflects Progress()/Label()/Tip()/IsComplete() into UGUI widgets — the boot
// loop calls Advance(phase) as it moves through world → save → kb → systems. All
// the progress MATH lives in the host-tested model; this view is presentation
// only (structural-gate-only, UnityEngine-coupled).
//
// Mirrors packages/babylon-game/src/optimization/LoadingScreen.tsx (phases + tips)
// and the Godot InsimulLoadingScreen — same phase table, same monotonic bar.

using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Insimul.UI
{
    public sealed class InsimulLoadingScreen : MonoBehaviour
    {
        [SerializeField] private Slider _progressBar;
        [SerializeField] private TMP_Text _label;
        [SerializeField] private TMP_Text _tip;
        [SerializeField] private CanvasGroup _canvasGroup;

        private readonly InsimulLoadingScreenModel _model = new InsimulLoadingScreenModel();

        /// <summary>Fired once the terminal ("ready") phase is reached.</summary>
        public event System.Action Finished;

        /// <summary>Drive the loading screen to a named startup phase and repaint.</summary>
        public void Advance(string phaseKey)
        {
            _model.Advance(phaseKey);
            Repaint();
            if (_model.IsComplete()) Finished?.Invoke();
        }

        public void ResetProgress()
        {
            _model.Reset();
            Repaint();
        }

        public float Progress => _model.Progress();
        public bool IsComplete => _model.IsComplete();

        private void Repaint()
        {
            if (_progressBar != null) _progressBar.value = _model.Progress();
            if (_label != null) _label.text = _model.Label();
            if (_tip != null) _tip.text = _model.Tip();
            if (_canvasGroup != null)
            {
                float a = _model.IsComplete() ? 0f : 1f;
                _canvasGroup.alpha = a;
                _canvasGroup.blocksRaycasts = !_model.IsComplete();
            }
        }
    }
}
