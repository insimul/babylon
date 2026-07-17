// InsimulWorldBrowserWindow.cs — the World Browser EditorWindow (US-UE2).
//
// Opened via Insimul ▸ World Browser. Lists the connected account's worlds (name,
// genre bundle, snapshot version, entity counts), with per-world actions: Sync IR
// (invokes the unity-scene-binding pipeline, showing the re-import DRY-RUN report
// before applying), Open in web, and a compatibility badge (locally-imported
// snapshot version vs the world's current one).
//
// This is a THIN view over the UnityEngine-free logic layer
// (Insimul.Editor.Connect.InsimulWorldBrowserModel), which owns all parsing,
// selection, badge, and import-orchestration logic and is unit-tested headless
// (WorldBrowserTests). Only the shared session wiring + IMGUI live here, so this
// file is verified by the C# structural syntax gate only (autoMerge off; the human
// end-to-end pass is VERIFICATION.md's connect+browse+import checklist).

#if UNITY_EDITOR
using Insimul.Editor.Connect;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>The World Browser EditorWindow. UI over InsimulWorldBrowserModel;
    /// all logic is host/headless-tested in the pure layer.</summary>
    public sealed class InsimulWorldBrowserWindow : EditorWindow
    {
        private InsimulWorldBrowserModel _model;
        private Vector2 _scroll;
        private InsimulImportReport _lastPreview;
        private string _status = "";

        [MenuItem("Insimul/World Browser")]
        public static void Open()
        {
            var window = GetWindow<InsimulWorldBrowserWindow>("Insimul Worlds");
            window.minSize = new Vector2(460f, 360f);
            window.Show();
        }

        private void OnEnable()
        {
            _model = new InsimulWorldBrowserModel(
                new UnitySceneImportPipeline(),
                new EditorPrefsImportedWorldRegistry());
        }

        private InsimulEditorSession Session => InsimulEditorSessionService.Session;

        private void OnGUI()
        {
            EditorGUILayout.Space();
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Refresh worlds", GUILayout.Width(140f)))
                {
                    Refresh();
                }
                GUILayout.FlexibleSpace();
                EditorGUILayout.LabelField(Session.BaseUrl, EditorStyles.miniLabel);
            }

            if (Session.NeedsReauth)
            {
                EditorGUILayout.HelpBox(
                    "Session expired — re-authenticate in Project Settings ▸ Insimul.",
                    MessageType.Warning);
            }

            if (!_model.ImportAvailable)
            {
                EditorGUILayout.HelpBox("Import disabled: " + _model.ImportUnavailableReason, MessageType.Info);
            }

            switch (_model.Status)
            {
                case InsimulBrowserStatus.Loading:
                    EditorGUILayout.LabelField("Loading…");
                    break;
                case InsimulBrowserStatus.Error:
                    EditorGUILayout.HelpBox("Failed to load worlds: " + _model.Error, MessageType.Error);
                    break;
            }

            EditorGUILayout.Space();
            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            foreach (var world in _model.Worlds)
            {
                DrawWorldRow(world);
            }
            EditorGUILayout.EndScrollView();

            if (!string.IsNullOrEmpty(_status))
            {
                EditorGUILayout.HelpBox(_status, MessageType.None);
            }
        }

        private void DrawWorldRow(InsimulWorldSummary world)
        {
            bool selected = world.Id == _model.SelectedId;
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GUILayout.Toggle(selected, world.Name, EditorStyles.foldoutHeader) != selected)
                    {
                        _model.Select(selected ? null : world.Id);
                        _lastPreview = null;
                        _status = "";
                    }
                    GUILayout.FlexibleSpace();
                    EditorGUILayout.LabelField(_model.CompatibilityLabel(world), EditorStyles.miniLabel,
                        GUILayout.Width(260f));
                }

                if (!selected) return;

                EditorGUILayout.LabelField(
                    $"{world.GenreBundle}   snapshot v{world.SnapshotVersion}",
                    EditorStyles.miniLabel);
                EditorGUILayout.LabelField(
                    $"NPCs {world.NpcCount}   Settlements {world.SettlementCount}   Quests {world.QuestCount}",
                    EditorStyles.miniLabel);

                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GUILayout.Button("Open in web"))
                    {
                        Application.OpenURL(InsimulWorldBrowserModel.OpenInWebUrl(Session.BaseUrl, world.Id));
                    }
                    using (new EditorGUI.DisabledScope(!_model.ImportAvailable))
                    {
                        if (GUILayout.Button("Preview Sync (dry run)"))
                        {
                            Preview(world);
                        }
                        if (GUILayout.Button("Sync IR now…"))
                        {
                            ApplySync(world);
                        }
                    }
                }

                if (_lastPreview != null && _lastPreview.WorldId == world.Id)
                {
                    EditorGUILayout.HelpBox(_lastPreview.Summary(), MessageType.None);
                }
            }
        }

        private void Refresh()
        {
            _status = "";
            _model.RefreshWorlds(Session, _ => Repaint());
        }

        private void Preview(InsimulWorldSummary world)
        {
            _model.PreviewImport(Session, world, (report, err) =>
            {
                _lastPreview = report;
                _status = report != null ? report.Summary() : ("Preview failed: " + err);
                Repaint();
            });
        }

        private void ApplySync(InsimulWorldSummary world)
        {
            // Confirm against the freshest dry-run before mutating the scene.
            _model.PreviewImport(Session, world, (preview, previewErr) =>
            {
                if (preview == null)
                {
                    _status = "Sync failed: " + previewErr;
                    Repaint();
                    return;
                }
                bool go = EditorUtility.DisplayDialog("Insimul Sync World IR",
                    $"Sync '{world.Name}'?\n\n{preview.Summary()}", "Apply", "Cancel");
                if (!go) return;
                _model.ApplyImport(Session, world, (applied, err) =>
                {
                    _status = applied != null ? applied.Summary() : ("Sync failed: " + err);
                    _lastPreview = null;
                    Repaint();
                });
            });
        }
    }
}
#endif
