// InsimulChatPanel.cs — thin UGUI dialogue panel over InsimulChatModel (US-UU4).
//
// Finishes the ChatPanel / DialogueUI prototypes against the streaming conversation
// SDK. The engine-neutral InsimulChatModel owns the transcript / streaming / action /
// history contract (host-tested); this view adds only the engine-coupled hooks the
// BabylonChatPanel carries:
//   • streaming text — chunk signals fold into the in-flight NPC bubble and repaint,
//   • TTS — speak the settled NPC line on complete (injectable provider),
//   • InsimulLipSync — drive the speaker's visemes from the same line (injectable hook),
//   • ACTION triggers — assert each action's Prolog fact into the KB via a fact sink
//     (InsimulQuestRuntime.AssertClause is the real KB path), and
//   • HISTORY — append model.History().ToConversationSummary() into save.conversations
//     on close so the exchange round-trips through a save.
//
// It repaints only on SDK events (chunk / complete / error), never per-frame. All
// injectable seams are System.Action delegates so the host wires whatever SDK / TTS /
// KB it runs; the shared cases live in packages/core/conformance/ui/chat-cases.json.
// Structural-gate-only (UnityEngine-coupled).

using System;
using Insimul.Save;
using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulChatPanel : MonoBehaviour
    {
        [SerializeField] private RectTransform _messageList;
        [SerializeField] private GameObject _rowPrefab;
        [SerializeField] private TMPro.TMP_Text _header;
        [SerializeField] private TMPro.TMP_InputField _input;

        private InsimulChatModel _model = new InsimulChatModel();
        /// <summary>How many actions have already been forwarded to the KB (diff cursor).</summary>
        private int _actionsApplied;

        /// <summary>Speak a settled NPC line: (text, characterId).</summary>
        public Action<string, string> TtsProvider;
        /// <summary>InsimulLipSync viseme hook: (characterId, text).</summary>
        public Action<string, string> LipSyncHook;
        /// <summary>KB fact sink for triggered actions: (fact clause). The real KB path is
        /// InsimulQuestRuntime.AssertClause.</summary>
        public Action<string> KbAssert;
        /// <summary>Timestamp source for history projection (deterministic, host-supplied).</summary>
        public Func<string> TimestampProvider;

        /// <summary>Raised on each transcript change so bound widgets repaint.</summary>
        public event Action Changed;

        public InsimulChatModel Model => _model;

        /// <summary>Open the panel for a character, seeding the greeting from the AI context.</summary>
        public void OpenChat(string characterId, string characterName = null, string greeting = null)
        {
            _model = new InsimulChatModel(characterId, characterName);
            _actionsApplied = 0;
            if (!string.IsNullOrEmpty(greeting)) _model.Greeting(greeting);
            gameObject.SetActive(true);
            if (_header != null) _header.text = _model.CharacterName;
            Refresh();
            if (_input != null) _input.ActivateInputField();
        }

        /// <summary>Send the current input line — opens a turn and asks the SDK to stream.</summary>
        public void Send()
        {
            if (_model.IsStreaming() || _input == null) return;
            string text = (_input.text ?? string.Empty).Trim();
            if (text.Length == 0) return;
            _input.text = string.Empty;
            if (!_model.BeginUserTurn(text)) return;
            Refresh();
            // The host wires the actual SDK send elsewhere; the view drives the model.
        }

        // ── SDK stream signal handlers (wired by the host) ────────────────────

        public void OnChunk(string npcId, string text)
        {
            if (npcId != _model.CharacterId) return;
            _model.AppendChunk(text);
            ApplyPendingActions();
            Refresh();
        }

        public void OnComplete(string npcId, string fullText = null)
        {
            if (npcId != _model.CharacterId) return;
            _model.CompleteTurn(string.IsNullOrEmpty(fullText) ? null : fullText);
            ApplyPendingActions();
            Refresh();
            // Engine-coupled hooks fed from the settled NPC line.
            string line = _model.LastNpcText();
            if (!string.IsNullOrEmpty(line))
            {
                TtsProvider?.Invoke(line, _model.CharacterId);
                LipSyncHook?.Invoke(_model.CharacterId, line);
            }
            if (_input != null) _input.ActivateInputField();
        }

        public void OnError(string npcId, string error)
        {
            if (npcId != _model.CharacterId) return;
            _model.FailTurn(error);
            Refresh();
        }

        /// <summary>An NPC action the SDK's action channel surfaced — record + assert it.</summary>
        public void OnAction(string name, string[] args = null, string fact = null)
        {
            _model.TriggerAction(new ChatAction(name, args, fact));
            ApplyPendingActions();
        }

        /// <summary>Close the panel and persist the exchange into save.conversations.</summary>
        public void CloseChat(JsonVal conversations)
        {
            if (conversations != null && conversations.Kind == JsonKind.Array)
            {
                string ts = TimestampProvider != null ? TimestampProvider() : string.Empty;
                conversations.Add(_model.History(ts).ToConversationSummary(_model.CharacterId, _model.CharacterName));
            }
            gameObject.SetActive(false);
        }

        private void ApplyPendingActions()
        {
            var actions = _model.ActionList();
            while (_actionsApplied < actions.Count)
            {
                string fact = actions[_actionsApplied].FactToAssert;
                if (!string.IsNullOrEmpty(fact)) KbAssert?.Invoke(fact);
                _actionsApplied++;
            }
        }

        private void Refresh()
        {
            Changed?.Invoke();
            if (_messageList == null) return;
            for (int i = _messageList.childCount - 1; i >= 0; i--)
                Destroy(_messageList.GetChild(i).gameObject);

            foreach (ChatMessage m in _model.MessageList())
            {
                if (_rowPrefab == null) continue;
                GameObject row = Instantiate(_rowPrefab, _messageList);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text == null) continue;
                string who = m.Role == ChatRole.Player ? "You" : _model.CharacterName;
                text.text = $"{who}: {m.Text}";
                if (m.Error) text.color = InsimulUIThemeAsset.ToColor("danger");
            }
        }
    }
}
