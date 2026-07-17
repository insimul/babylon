// InsimulConversationTesterWindow.cs — the in-editor NPC Conversation Tester
// EditorWindow (US-UE4).
//
// Opened via Insimul ▸ Conversation Tester. Loads the connected world's characters,
// lets the creator pick one and exchange text turns through the conversation SDK's
// streaming endpoint, and shows the transcript live. This is a THIN view over the
// UnityEngine-free logic layer (Insimul.Editor.Connect.InsimulConversationTesterModel),
// which owns the whole turn lifecycle + transcript and is unit-tested headless
// (ConversationTesterTests). Only the session wiring, the EditorApplication.update
// pump, and IMGUI live here, so this file is verified by the structural syntax gate.
//
// ── Edit-mode constraint ─────────────────────────────────────────────────────────
// Text streaming works in edit mode; audio PLAYBACK + lip sync do NOT (they need the
// InsimulAudioPlayer / InsimulLipSync MonoBehaviours). The tester reports how many
// audio chunks a TTS reply returned but never plays them — drive a Play-mode scene
// with the runtime SDK to hear audio. See README ▸ Conversation Tester window.
//
// ── Domain-reload safety (the EditorApplication.update pattern) ──────────────────
// OnEnable subscribes EditorApplication.update (→ model.Pump() each tick); OnDisable
// UNSUBSCRIBES and calls model.Dispose(). A domain reload (recompile / entering play
// mode) fires OnDisable, so the update handler is removed and any in-flight request
// aborted — no orphaned stream survives a reload.

#if UNITY_EDITOR
using Insimul.Editor.Connect;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>The Conversation Tester EditorWindow. UI over
    /// InsimulConversationTesterModel; all lifecycle logic is headless-tested.</summary>
    public sealed class InsimulConversationTesterWindow : EditorWindow
    {
        private InsimulConversationTesterModel _model;
        private string _worldId = "";
        private string _draft = "";
        private int _characterIndex;
        private Vector2 _scroll;

        [MenuItem("Insimul/Conversation Tester")]
        public static void Open()
        {
            var window = GetWindow<InsimulConversationTesterWindow>("Insimul Conversation");
            window.minSize = new Vector2(420f, 340f);
            window.Show();
        }

        private void OnEnable()
        {
            _model = new InsimulConversationTesterModel(new UnityWebRequestConversationClient());
            EditorApplication.update += Tick;
        }

        private void OnDisable()
        {
            EditorApplication.update -= Tick;
            _model?.Dispose(); // stop the stream — no orphan survives a domain reload
        }

        private InsimulEditorSession Session => InsimulEditorSessionService.Session;

        /// <summary>One pump per editor tick: drain buffered reply events and repaint
        /// only while a turn is live (or just finished) so the window stays cheap.</summary>
        private void Tick()
        {
            if (_model == null) return;
            var before = _model.State;
            _model.Pump();
            if (_model.State != before || _model.IsBusy)
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
                using (new EditorGUI.DisabledScope(string.IsNullOrEmpty(_worldId)))
                {
                    if (GUILayout.Button("Load characters", GUILayout.Width(120f)))
                    {
                        _model.LoadCharacters(Session, _worldId, _ => Repaint());
                    }
                }
            }

            if (Session.NeedsReauth)
            {
                EditorGUILayout.HelpBox(
                    "Session expired — re-authenticate in Project Settings ▸ Insimul.",
                    MessageType.Warning);
            }

            DrawCharacterPicker();
            DrawTranscript();
            DrawComposer();

            EditorGUILayout.HelpBox(
                "Text streaming only in edit mode — audio playback + lip sync need Play mode.",
                MessageType.None);
        }

        private void DrawCharacterPicker()
        {
            switch (_model.LoadStatus)
            {
                case InsimulTesterLoad.Loading:
                    EditorGUILayout.LabelField("Characters", "Loading…");
                    return;
                case InsimulTesterLoad.Error:
                    EditorGUILayout.HelpBox("Failed to load characters: " + _model.LoadError, MessageType.Error);
                    return;
            }

            var characters = _model.Characters;
            if (characters.Count == 0)
            {
                if (_model.LoadStatus == InsimulTesterLoad.Loaded)
                {
                    EditorGUILayout.HelpBox("This world has no characters to talk to.", MessageType.Info);
                }
                return;
            }

            var labels = new string[characters.Count];
            for (int i = 0; i < characters.Count; i++) labels[i] = characters[i].Label;
            _characterIndex = Mathf.Clamp(_characterIndex, 0, characters.Count - 1);
            int picked = EditorGUILayout.Popup("Character", _characterIndex, labels);
            if (picked != _characterIndex || _model.SelectedCharacterId == null)
            {
                _characterIndex = picked;
                _model.SelectCharacter(characters[_characterIndex].Id);
            }
        }

        private void DrawTranscript()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Transcript", EditorStyles.boldLabel);
            using (var scope = new EditorGUILayout.ScrollViewScope(_scroll, GUILayout.MinHeight(120f)))
            {
                _scroll = scope.scrollPosition;
                foreach (var turn in _model.Transcript)
                {
                    EditorGUILayout.LabelField(turn.FromPlayer ? "You" : "NPC", turn.Text, EditorStyles.wordWrappedLabel);
                }
                if (_model.State == InsimulTesterState.Streaming && !string.IsNullOrEmpty(_model.PendingReply))
                {
                    EditorGUILayout.LabelField("NPC", _model.PendingReply + " …", EditorStyles.wordWrappedLabel);
                }
            }

            if (_model.State == InsimulTesterState.Error)
            {
                EditorGUILayout.HelpBox("Conversation error: " + _model.Error, MessageType.Error);
            }
            if (_model.AudioChunkCount > 0)
            {
                EditorGUILayout.LabelField("TTS audio", _model.AudioChunkCount +
                    " chunk(s) returned (not played in edit mode).");
            }
        }

        private void DrawComposer()
        {
            EditorGUILayout.Space();
            using (new EditorGUILayout.HorizontalScope())
            {
                _draft = EditorGUILayout.TextField(_draft);
                bool canSend = !_model.IsBusy && _model.SelectedCharacterId != null &&
                               !string.IsNullOrEmpty(_draft);
                using (new EditorGUI.DisabledScope(!canSend))
                {
                    if (GUILayout.Button(_model.IsBusy ? "…" : "Send", GUILayout.Width(60f)))
                    {
                        _model.Send(Session, _draft, ok => { if (ok) { _draft = ""; } Repaint(); });
                    }
                }
                using (new EditorGUI.DisabledScope(_model.Transcript.Count == 0 || _model.IsBusy))
                {
                    if (GUILayout.Button("New", GUILayout.Width(50f)))
                    {
                        _model.NewConversation();
                        Repaint();
                    }
                }
            }
        }
    }
}
#endif
