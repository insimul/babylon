using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    [CustomEditor(typeof(InsimulManager))]
    public class InsimulManagerEditor : UnityEditor.Editor
    {
        private SerializedProperty _serverUrl;
        private SerializedProperty _apiKey;
        private SerializedProperty _worldId;
        private SerializedProperty _languageCode;
        private SerializedProperty _persistAcrossScenes;

        private bool _showConnectionTest;
        private string _connectionStatus = "";

        private void OnEnable()
        {
            _serverUrl = serializedObject.FindProperty("serverUrl");
            _apiKey = serializedObject.FindProperty("apiKey");
            _worldId = serializedObject.FindProperty("worldId");
            _languageCode = serializedObject.FindProperty("languageCode");
            _persistAcrossScenes = serializedObject.FindProperty("persistAcrossScenes");
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            EditorGUILayout.LabelField("Insimul Conversation SDK", EditorStyles.boldLabel);
            EditorGUILayout.Space(4);

            // Server Configuration
            EditorGUILayout.LabelField("Server Configuration", EditorStyles.miniBoldLabel);
            EditorGUILayout.PropertyField(_serverUrl, new GUIContent("Server URL"));

            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.PropertyField(_apiKey, new GUIContent("API Key"));
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.PropertyField(_worldId, new GUIContent("World ID"));
            EditorGUILayout.PropertyField(_languageCode, new GUIContent("Language Code"));

            EditorGUILayout.Space(8);

            // Options
            EditorGUILayout.LabelField("Options", EditorStyles.miniBoldLabel);
            EditorGUILayout.PropertyField(_persistAcrossScenes, new GUIContent("Persist Across Scenes"));

            EditorGUILayout.Space(8);

            // Connection Test
            if (Application.isPlaying)
            {
                EditorGUILayout.LabelField("Diagnostics", EditorStyles.miniBoldLabel);
                if (GUILayout.Button("Test Connection"))
                {
                    var manager = (InsimulManager)target;
                    _connectionStatus = "Testing...";
                    manager.CheckHealth(healthy =>
                    {
                        _connectionStatus = healthy ? "Connected" : "Failed to connect";
                        Repaint();
                    });
                }

                if (!string.IsNullOrEmpty(_connectionStatus))
                {
                    Color statusColor = _connectionStatus == "Connected" ? Color.green :
                                        _connectionStatus == "Testing..." ? Color.yellow : Color.red;
                    var prevColor = GUI.color;
                    GUI.color = statusColor;
                    EditorGUILayout.LabelField("Status: " + _connectionStatus);
                    GUI.color = prevColor;
                }
            }
            else
            {
                EditorGUILayout.HelpBox("Enter Play Mode to test the server connection.", MessageType.Info);
            }

            // Validation warnings
            if (string.IsNullOrEmpty(_serverUrl.stringValue))
            {
                EditorGUILayout.HelpBox("Server URL is required.", MessageType.Warning);
            }
            if (string.IsNullOrEmpty(_worldId.stringValue))
            {
                EditorGUILayout.HelpBox("World ID is required for conversations.", MessageType.Warning);
            }

            serializedObject.ApplyModifiedProperties();
        }
    }

    [CustomEditor(typeof(InsimulNPC))]
    public class InsimulNPCEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            EditorGUILayout.LabelField("Insimul NPC", EditorStyles.boldLabel);
            EditorGUILayout.Space(4);

            var characterId = serializedObject.FindProperty("characterId");
            var languageOverride = serializedObject.FindProperty("languageCodeOverride");

            EditorGUILayout.PropertyField(characterId, new GUIContent("Character ID"));
            EditorGUILayout.PropertyField(languageOverride, new GUIContent("Language Override"));

            if (string.IsNullOrEmpty(characterId.stringValue))
            {
                EditorGUILayout.HelpBox("Character ID is required. Set this to the Insimul character ID for this NPC.", MessageType.Warning);
            }

            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("Events", EditorStyles.miniBoldLabel);

            EditorGUILayout.PropertyField(serializedObject.FindProperty("onTextReceived"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onAudioReceived"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onFacialDataReceived"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onActionTriggered"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onTranscriptReceived"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onConversationStarted"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onConversationEnded"));
            EditorGUILayout.PropertyField(serializedObject.FindProperty("onError"));

            // Runtime info
            if (Application.isPlaying)
            {
                EditorGUILayout.Space(8);
                EditorGUILayout.LabelField("Runtime", EditorStyles.miniBoldLabel);
                var npc = (InsimulNPC)target;
                EditorGUILayout.LabelField("State", npc.State.ToString());
                EditorGUILayout.LabelField("Session ID", npc.SessionId ?? "(none)");
            }

            serializedObject.ApplyModifiedProperties();
        }
    }
}
