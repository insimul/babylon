// InsimulGenerationConsoleWindow.cs — the Generation Console EditorWindow (US-UE3).
//
// Opened via Insimul ▸ Generation Console. Invokes a backend generator (regenerate
// settlements / character batch / quest generation) against the connected world,
// streams live job progress, shows the entity-count diff on completion, and offers
// "Sync IR now…" (which opens the World Browser to run the import path).
//
// This is a THIN view over the UnityEngine-free logic layer
// (Insimul.Editor.Connect.InsimulGenerationConsoleModel), which owns the whole job
// lifecycle state machine and is unit-tested headless (GenerationConsoleTests). Only
// the shared session wiring, the EditorApplication.update pump, and IMGUI live here,
// so this file is verified by the C# structural syntax gate only.
//
// ── Domain-reload safety (the EditorApplication.update pattern) ──────────────────
// OnEnable subscribes EditorApplication.update (→ model.Pump() each tick); OnDisable
// UNSUBSCRIBES and calls model.Dispose(). A domain reload (recompile / entering play
// mode) fires OnDisable, so the update handler is removed and the poll stream is
// disposed (aborting any in-flight request) — no orphaned polling loop survives a
// reload. Cancel does the same on demand.

#if UNITY_EDITOR
using Insimul.Editor.Connect;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>The Generation Console EditorWindow. UI over
    /// InsimulGenerationConsoleModel; all lifecycle logic is headless-tested.</summary>
    public sealed class InsimulGenerationConsoleWindow : EditorWindow
    {
        private InsimulGenerationConsoleModel _model;
        private string _worldId = "";
        private InsimulGeneratorKind _kind = InsimulGeneratorKind.SettlementRegenerate;

        [MenuItem("Insimul/Generation Console")]
        public static void Open()
        {
            var window = GetWindow<InsimulGenerationConsoleWindow>("Insimul Generation");
            window.minSize = new Vector2(420f, 300f);
            window.Show();
        }

        private void OnEnable()
        {
            _model = new InsimulGenerationConsoleModel(new UnityJobStreamFactory());
            EditorApplication.update += Tick;
        }

        private void OnDisable()
        {
            EditorApplication.update -= Tick;
            _model?.Dispose(); // stop the poll loop — no orphan survives a domain reload
        }

        private InsimulEditorSession Session => InsimulEditorSessionService.Session;

        /// <summary>One pump per editor tick: drain buffered progress events and repaint
        /// only while a job is live (or just finished) so the console stays cheap.</summary>
        private void Tick()
        {
            if (_model == null) return;
            var before = _model.Status;
            _model.Pump();
            if (_model.Status != before || _model.IsActive)
            {
                Repaint();
            }
        }

        private void OnGUI()
        {
            EditorGUILayout.Space();
            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUILayout.LabelField("World id", GUILayout.Width(60f));
                _worldId = EditorGUILayout.TextField(_worldId);
            }
            _kind = (InsimulGeneratorKind)EditorGUILayout.EnumPopup("Generator", _kind);

            if (Session.NeedsReauth)
            {
                EditorGUILayout.HelpBox(
                    "Session expired — re-authenticate in Project Settings ▸ Insimul.",
                    MessageType.Warning);
            }

            using (new EditorGUILayout.HorizontalScope())
            {
                using (new EditorGUI.DisabledScope(_model.IsActive || string.IsNullOrEmpty(_worldId)))
                {
                    if (GUILayout.Button("Run " + InsimulGenerationConsoleModel.GeneratorLabel(_kind)))
                    {
                        _model.Start(Session, _kind, _worldId, _ => Repaint());
                    }
                }
                using (new EditorGUI.DisabledScope(!_model.IsActive))
                {
                    if (GUILayout.Button("Cancel", GUILayout.Width(90f)))
                    {
                        _model.Cancel();
                        Repaint();
                    }
                }
            }

            DrawStatus();
        }

        private void DrawStatus()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Status", _model.Status.ToString(), EditorStyles.boldLabel);

            if (_model.IsActive)
            {
                var rect = EditorGUILayout.GetControlRect(false, 18f);
                string label = string.IsNullOrEmpty(_model.Phase)
                    ? _model.Status.ToString()
                    : _model.Phase;
                EditorGUI.ProgressBar(rect, _model.Progress, label);
            }

            switch (_model.Status)
            {
                case InsimulJobStatus.Failed:
                    EditorGUILayout.HelpBox("Job failed: " + _model.Error, MessageType.Error);
                    break;
                case InsimulJobStatus.Canceled:
                    EditorGUILayout.HelpBox("Job canceled (the server job may still finish).", MessageType.Info);
                    break;
                case InsimulJobStatus.Completed:
                    EditorGUILayout.HelpBox(_model.Result != null ? _model.Result.Summary() : "Completed.",
                        MessageType.Info);
                    break;
            }

            if (_model.OffersSync)
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GUILayout.Button("Sync IR now…"))
                    {
                        // The World Browser owns the (dry-run-then-apply) import path;
                        // route the sync through it so the two can never diverge.
                        InsimulWorldBrowserWindow.Open();
                    }
                    if (GUILayout.Button("New job", GUILayout.Width(90f)))
                    {
                        _model.Reset();
                        Repaint();
                    }
                }
            }
        }
    }
}
#endif
