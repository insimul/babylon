// InsimulBindingEditorWindow.cs — the creator-facing Binding Editor window
// (US-UB5).
//
// Opened via Insimul ▸ Binding Editor. It walks every archetype the loaded World
// IR uses, grouped by taxonomy, with bound / placeholder / unbound status, a
// per-row prefab picker, a "bind all descendants" affordance, fuzzy name/tag
// candidate suggestions over the project's assets (AssetDatabase), preview
// thumbnails, and binding-pack export / import (JSON).
//
// This is a THIN view over the UnityEngine-free logic layer:
//   • Insimul.Binding.BindingEditorModel — taxonomy tree, bound/unbound status,
//     suggestion ranking (host-tested, RunBindingEditorTests), and
//   • Insimul.Binding.BindingPack — the portable pack export/import round-trip.
// Only the AssetDatabase / EditorGUI / file-dialog wiring lives here, so this file
// is verified by the C# structural syntax gate only (autoMerge off; the human
// end-to-end pass is VERIFICATION.md's binding-editor checklist).

#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using Insimul.Binding;
using Insimul.Save; // JsonVal
using Insimul.Scene;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>The Binding Editor EditorWindow. UI over BindingEditorModel +
    /// BindingPack; all logic is host-tested in the pure layer.</summary>
    public sealed class InsimulBindingEditorWindow : EditorWindow
    {
        private static readonly Color BoundColor = new Color(0.55f, 0.85f, 0.55f);
        private static readonly Color PlaceholderColor = new Color(0.9f, 0.8f, 0.45f);
        private static readonly Color UnboundColor = new Color(0.9f, 0.55f, 0.5f);

        private InsimulBindingTable _projectTable;
        private readonly List<string> _archetypes = new List<string>();
        private BindingEditorModel _model;
        private Vector2 _scroll;
        private string _selected;
        private List<AssetCandidate> _assetIndex;

        [MenuItem("Insimul/Binding Editor")]
        public static void Open()
        {
            var window = GetWindow<InsimulBindingEditorWindow>("Insimul Bindings");
            window.minSize = new Vector2(420f, 320f);
            window.Show();
        }

        private void OnEnable() => Rebuild();

        // ── Data ──────────────────────────────────────────────────────────────

        /// <summary>Re-derive the resolver + model from the assigned project table
        /// (layered over the placeholder pack) and the loaded archetype set.</summary>
        private void Rebuild()
        {
            var layers = new List<BindingLayer>();
            foreach (var guid in AssetDatabase.FindAssets("t:InsimulBindingTable"))
            {
                var table = AssetDatabase.LoadAssetAtPath<InsimulBindingTable>(
                    AssetDatabase.GUIDToAssetPath(guid));
                if (table != null) layers.Add(table.ToLayer());
            }
            layers.Add(PlaceholderPack.BuildLayer());
            layers.Sort((a, b) => a.Kind.CompareTo(b.Kind));
            _model = new BindingEditorModel(new BindingResolver(layers));
            _assetIndex = null; // lazily rebuilt on first suggestion request
        }

        /// <summary>Load the archetype keys a World IR uses (via the shared placement
        /// core), so the tree shows exactly the art this world needs.</summary>
        private void LoadIrArchetypes(string irPath)
        {
            _archetypes.Clear();
            var ir = JsonVal.Parse(File.ReadAllText(irPath));
            var manifest = SceneGenerator.ComputePlacement(ir, BuildResolver());
            var seen = new HashSet<string>();
            foreach (var node in manifest.Nodes)
                if (!string.IsNullOrEmpty(node.Archetype) && seen.Add(node.Archetype))
                    _archetypes.Add(node.Archetype);
            _archetypes.Sort(System.StringComparer.Ordinal);
        }

        private BindingResolver BuildResolver()
        {
            var layers = new List<BindingLayer>();
            foreach (var guid in AssetDatabase.FindAssets("t:InsimulBindingTable"))
            {
                var table = AssetDatabase.LoadAssetAtPath<InsimulBindingTable>(
                    AssetDatabase.GUIDToAssetPath(guid));
                if (table != null) layers.Add(table.ToLayer());
            }
            layers.Add(PlaceholderPack.BuildLayer());
            layers.Sort((a, b) => a.Kind.CompareTo(b.Kind));
            return new BindingResolver(layers);
        }

        /// <summary>Build the mocked asset index the suggestion logic ranks — every
        /// prefab in the project, with its name / path / label tags.</summary>
        private List<AssetCandidate> AssetIndex()
        {
            if (_assetIndex != null) return _assetIndex;
            _assetIndex = new List<AssetCandidate>();
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab"))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var obj = AssetDatabase.LoadAssetAtPath<Object>(path);
                var tags = obj != null ? new List<string>(AssetDatabase.GetLabels(obj)) : new List<string>();
                _assetIndex.Add(new AssetCandidate(path, Path.GetFileNameWithoutExtension(path), tags));
            }
            return _assetIndex;
        }

        // ── GUI ───────────────────────────────────────────────────────────────

        private void OnGUI()
        {
            DrawToolbar();
            if (_model == null) Rebuild();

            int bound = _model.BoundKeys(_archetypes).Count;
            EditorGUILayout.LabelField($"{bound} / {_archetypes.Count} archetypes bound",
                EditorStyles.miniBoldLabel);

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            var tree = _model.BuildTaxonomyTree(_archetypes);
            foreach (var kv in tree.Children) DrawNode(kv.Value, 0);
            EditorGUILayout.EndScrollView();

            DrawSuggestions();
        }

        private void DrawToolbar()
        {
            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                if (GUILayout.Button("Load World IR…", EditorStyles.toolbarButton))
                {
                    string path = EditorUtility.OpenFilePanel("Select World IR (JSON)", "", "json");
                    if (!string.IsNullOrEmpty(path)) LoadIrArchetypes(path);
                }
                if (GUILayout.Button("Import Pack…", EditorStyles.toolbarButton)) ImportPack();
                if (GUILayout.Button("Export Pack…", EditorStyles.toolbarButton)) ExportPack();
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Refresh", EditorStyles.toolbarButton)) Rebuild();
            }
        }

        private void DrawNode(TaxonomyNode node, int depth)
        {
            using (new EditorGUILayout.HorizontalScope())
            {
                GUILayout.Space(depth * 14f);
                if (node.IsArchetype)
                {
                    var prev = GUI.color;
                    GUI.color = node.IsPlaceholder ? PlaceholderColor
                        : node.Bound ? BoundColor : UnboundColor;
                    if (GUILayout.Button(node.Segment, EditorStyles.miniButton, GUILayout.Width(180f)))
                        _selected = node.Path;
                    GUI.color = prev;

                    string status = node.IsPlaceholder ? "(placeholder)"
                        : node.Bound ? node.AssetRef : "(unbound)";
                    EditorGUILayout.LabelField(status);

                    if (GUILayout.Button("Bind…", GUILayout.Width(52f))) BindRow(node.Path, false);
                    if (GUILayout.Button("+desc", GUILayout.Width(52f))) BindRow(node.Path, true);
                }
                else
                {
                    EditorGUILayout.LabelField(node.Segment, EditorStyles.boldLabel);
                    if (GUILayout.Button("+desc", GUILayout.Width(52f))) BindRow(node.Path, true);
                }
            }
            foreach (var kv in node.Children) DrawNode(kv.Value, depth + 1);
        }

        private void DrawSuggestions()
        {
            if (string.IsNullOrEmpty(_selected)) return;
            EditorGUILayout.Space();
            EditorGUILayout.LabelField($"Suggestions for {_selected}", EditorStyles.boldLabel);
            var hits = _model.SuggestBindings(_selected, AssetIndex());
            int shown = 0;
            foreach (var hit in hits)
            {
                if (shown++ >= 8) break;
                using (new EditorGUILayout.HorizontalScope())
                {
                    var prefab = AssetDatabase.LoadAssetAtPath<Object>(hit.Path);
                    var thumb = prefab != null ? AssetPreview.GetMiniThumbnail(prefab) : null;
                    if (thumb != null) GUILayout.Label(thumb, GUILayout.Width(20f), GUILayout.Height(20f));
                    EditorGUILayout.LabelField($"{hit.Name}  (score {hit.Score})");
                    if (GUILayout.Button("Use", GUILayout.Width(40f)))
                        BindPath(_selected, hit.Path, false);
                }
            }
        }

        // ── Binding operations (over the project table) ───────────────────────

        private void BindRow(string archetype, bool descendants)
        {
            string path = EditorUtility.OpenFilePanel("Select prefab", "Assets", "prefab");
            if (string.IsNullOrEmpty(path)) return;
            string rel = ToProjectRelative(path);
            BindPath(archetype, rel, descendants);
        }

        /// <summary>Bind an archetype (or, for a non-leaf key, all its descendants)
        /// to a prefab in the project override table. Binding a non-leaf key covers
        /// every descendant with no more-specific entry — descendant matching lives
        /// in the resolver, so this is a single entry.</summary>
        private void BindPath(string archetype, string assetPath, bool descendants)
        {
            var table = EnsureProjectTable();
            string guid = AssetDatabase.AssetPathToGUID(assetPath);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);

            InsimulBindingTable.Entry entry = null;
            foreach (var e in table.entries)
                if (e != null && e.archetypeKey == archetype) entry = e;
            if (entry == null)
            {
                entry = new InsimulBindingTable.Entry { archetypeKey = archetype };
                table.entries.Add(entry);
            }
            entry.prefab = prefab;
            entry.assetGuid = guid;
            table.SortEntries();
            EditorUtility.SetDirty(table);
            AssetDatabase.SaveAssetIfDirty(table);
            Rebuild();
        }

        private InsimulBindingTable EnsureProjectTable()
        {
            if (_projectTable != null) return _projectTable;
            foreach (var guid in AssetDatabase.FindAssets("t:InsimulBindingTable"))
            {
                var t = AssetDatabase.LoadAssetAtPath<InsimulBindingTable>(
                    AssetDatabase.GUIDToAssetPath(guid));
                if (t != null && t.sourceKind == BindingSourceKind.Project) { _projectTable = t; return t; }
            }
            _projectTable = CreateInstance<InsimulBindingTable>();
            _projectTable.sourceKind = BindingSourceKind.Project;
            Directory.CreateDirectory("Assets/Insimul");
            AssetDatabase.CreateAsset(_projectTable, "Assets/Insimul/ProjectBindingTable.asset");
            AssetDatabase.SaveAssets();
            return _projectTable;
        }

        // ── Pack import / export ──────────────────────────────────────────────

        private void ExportPack()
        {
            var table = EnsureProjectTable();
            string path = EditorUtility.SaveFilePanel("Export binding pack", "", "binding-pack", "json");
            if (string.IsNullOrEmpty(path)) return;
            File.WriteAllText(path, BindingPack.Export(table.ToLayer()));
        }

        private void ImportPack()
        {
            string path = EditorUtility.OpenFilePanel("Import binding pack", "", "json");
            if (string.IsNullOrEmpty(path)) return;
            var layer = BindingPack.Import(File.ReadAllText(path));
            var table = EnsureProjectTable();
            table.entries.Clear();
            foreach (var rule in layer.Rules)
            {
                var entry = new InsimulBindingTable.Entry
                {
                    archetypeKey = rule.Key,
                    assetGuid = rule.AssetRef,
                    pivotOffset = new Vector3(rule.PivotOffset.X, rule.PivotOffset.Y, rule.PivotOffset.Z),
                    scale = new Vector3(rule.Scale.X, rule.Scale.Y, rule.Scale.Z),
                    footprintAlign = rule.FootprintAlign,
                    tags = new List<string>(rule.Tags),
                };
                string assetPath = AssetDatabase.GUIDToAssetPath(rule.AssetRef);
                if (!string.IsNullOrEmpty(assetPath))
                    entry.prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                foreach (var s in rule.Sockets)
                    entry.sockets.Add(new InsimulBindingTable.SocketEntry
                    {
                        name = s.Name,
                        localPosition = new Vector3(s.LocalPosition.X, s.LocalPosition.Y, s.LocalPosition.Z),
                        localEulerAngles = new Vector3(s.LocalEulerAngles.X, s.LocalEulerAngles.Y, s.LocalEulerAngles.Z),
                    });
                table.entries.Add(entry);
            }
            table.SortEntries();
            EditorUtility.SetDirty(table);
            AssetDatabase.SaveAssetIfDirty(table);
            Rebuild();
        }

        private static string ToProjectRelative(string absolutePath)
        {
            string dataPath = Application.dataPath;
            if (absolutePath.StartsWith(dataPath))
                return "Assets" + absolutePath.Substring(dataPath.Length);
            return absolutePath;
        }
    }
}
#endif
