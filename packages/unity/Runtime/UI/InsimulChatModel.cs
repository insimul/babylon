// InsimulChatModel.cs — dialogue / chat streaming view-model (US-UU4).
//
// The Unity mirror of the engine-neutral dialogue contract
// (packages/core/src/ui/chat-model.ts + the Godot chat_model.gd), the UI-free heart
// of the default-runtime NPC dialogue panel (finishing the ChatPanel / DialogueUI
// prototypes against the streaming conversation SDK).
//
// It drives the streaming SDK's turn lifecycle: a player line opens a turn, response
// CHUNKS accumulate into the in-flight NPC bubble, ACTION triggers (parsed from the
// stream, asserted into the KB by the panel) are recorded, and Complete/Fail close
// the turn. The finished transcript projects into the save.conversations
// (ConversationSummary.recentTurns) shape so history round-trips through a save.
//
// TTS + InsimulLipSync are PANEL-level hooks fed from LastNpcText() on Complete; the
// action → KB assert path is a panel-supplied fact sink (Action<string>) so the
// streaming / action / history contract stays testable headless. The shared behavior
// matrix lives in packages/core/conformance/ui/chat-cases.json, so every default-UI
// mirror (Babylon / Godot / Unreal / Unity) runs the SAME cases.
//
// UnityEngine-FREE (it composes plain data + JsonVal, the save value model) so it
// host-tests on a bare .NET SDK (tools/verify-unity). The thin UGUI view
// (InsimulChatPanel, structural-gate-only) wires the SDK signals in and forwards the
// engine-coupled hooks out.

using System.Collections.Generic;
using Insimul.Save;

namespace Insimul.UI
{
    /// <summary>Who authored a chat line.</summary>
    public enum ChatRole { Player, Npc }

    /// <summary>A rendered transcript bubble.</summary>
    public sealed class ChatMessage
    {
        public ChatRole Role;
        public string Text = string.Empty;
        /// <summary>True while this NPC bubble is still receiving stream chunks.</summary>
        public bool Streaming;
        /// <summary>True when the turn ended in an error (rendered as an error bubble).</summary>
        public bool Error;
    }

    /// <summary>An action the NPC stream triggered — the panel asserts
    /// <see cref="FactToAssert"/> into the KB.</summary>
    public readonly struct ChatAction
    {
        public string Name { get; }
        public IReadOnlyList<string> Args { get; }
        /// <summary>Prolog fact the action asserts into the KB (e.g. <c>has_item(player,sword)</c>).</summary>
        public string FactToAssert { get; }

        public ChatAction(string name, IReadOnlyList<string> args = null, string factToAssert = "")
        {
            Name = name ?? string.Empty;
            Args = args ?? System.Array.Empty<string>();
            FactToAssert = factToAssert ?? string.Empty;
        }
    }

    /// <summary>A projected transcript turn, matching ConversationSummary.recentTurns.</summary>
    public readonly struct ChatTurn
    {
        public ChatRole Role { get; }
        public string Content { get; }
        public string Timestamp { get; }

        public ChatTurn(ChatRole role, string content, string timestamp)
        {
            Role = role;
            Content = content ?? string.Empty;
            Timestamp = timestamp ?? string.Empty;
        }
    }

    /// <summary>The transcript projected for save.conversations: the settled turns
    /// plus the completed-turn count.</summary>
    public sealed class ChatHistory
    {
        public IReadOnlyList<ChatTurn> RecentTurns { get; }
        public int TotalTurnCount { get; }

        public ChatHistory(IReadOnlyList<ChatTurn> recentTurns, int totalTurnCount)
        {
            RecentTurns = recentTurns ?? System.Array.Empty<ChatTurn>();
            TotalTurnCount = totalTurnCount;
        }

        /// <summary>Project into a save.conversations ConversationSummary JsonVal
        /// (characterId + recentTurns[{role,content,timestamp}] + totalTurnCount).
        /// The panel appends this to save.conversations on close so history
        /// round-trips through a save serialize → load cycle.</summary>
        public JsonVal ToConversationSummary(string characterId, string characterName = null)
        {
            var summary = JsonVal.Object();
            summary.Set("characterId", JsonVal.Str(characterId ?? string.Empty));
            summary.Set("characterName", JsonVal.Str(characterName ?? characterId ?? string.Empty));
            var turns = JsonVal.Arr();
            foreach (ChatTurn t in RecentTurns)
            {
                var e = JsonVal.Object();
                e.Set("role", JsonVal.Str(InsimulChatModel.RoleName(t.Role)));
                e.Set("content", JsonVal.Str(t.Content));
                e.Set("timestamp", JsonVal.Str(t.Timestamp));
                turns.Add(e);
            }
            summary.Set("recentTurns", turns);
            summary.Set("totalTurnCount", JsonVal.Int(TotalTurnCount));
            return summary;
        }
    }

    /// <summary>Streaming dialogue view-model. Owns the transcript, the streaming
    /// flag, the triggered-action log, and the history projection; holds no view
    /// state and no engine coupling.</summary>
    public sealed class InsimulChatModel
    {
        public string CharacterId { get; }
        public string CharacterName { get; }

        private readonly List<ChatMessage> _messages = new List<ChatMessage>();
        private readonly List<ChatAction> _actions = new List<ChatAction>();
        private bool _streaming;
        /// <summary>Index into <see cref="_messages"/> of the in-flight NPC bubble, or -1.</summary>
        private int _streamIndex = -1;
        /// <summary>Completed player/npc pairs (a turn = a player line answered by the NPC).</summary>
        private int _turnCount;

        public InsimulChatModel() : this(string.Empty, null) { }

        public InsimulChatModel(string characterId, string characterName = null)
        {
            CharacterId = characterId ?? string.Empty;
            CharacterName = string.IsNullOrEmpty(characterName) ? CharacterId : characterName;
        }

        /// <summary>Seed the NPC's opening line (context greeting) — not a streamed turn.</summary>
        public void Greeting(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            _messages.Add(new ChatMessage { Role = ChatRole.Npc, Text = text });
        }

        /// <summary>Open a new turn with the player's line and an empty in-flight NPC
        /// bubble. Rejected (returns false) while a turn is already streaming or the
        /// line is blank.</summary>
        public bool BeginUserTurn(string text)
        {
            if (_streaming) return false;
            string trimmed = (text ?? string.Empty).Trim();
            if (trimmed.Length == 0) return false;
            _messages.Add(new ChatMessage { Role = ChatRole.Player, Text = trimmed });
            _messages.Add(new ChatMessage { Role = ChatRole.Npc, Text = string.Empty, Streaming = true });
            _streamIndex = _messages.Count - 1;
            _streaming = true;
            return true;
        }

        /// <summary>Append a streamed chunk to the in-flight NPC bubble. No-op when idle.</summary>
        public void AppendChunk(string text)
        {
            if (!_streaming || _streamIndex < 0) return;
            _messages[_streamIndex].Text += text ?? string.Empty;
        }

        /// <summary>Record an action the stream triggered (the panel applies it to the KB).</summary>
        public void TriggerAction(ChatAction action) => _actions.Add(action);

        /// <summary>Close the in-flight turn (a <c>done</c> event). <paramref name="fullText"/>,
        /// when non-null, replaces the accumulated bubble text (the SDK's authoritative
        /// final text). Returns false when no turn is in flight.</summary>
        public bool CompleteTurn(string fullText = null)
        {
            if (!_streaming || _streamIndex < 0) return false;
            ChatMessage bubble = _messages[_streamIndex];
            if (fullText != null) bubble.Text = fullText;
            bubble.Streaming = false;
            _streaming = false;
            _streamIndex = -1;
            _turnCount++;
            return true;
        }

        /// <summary>Fail the in-flight turn (stream error / watchdog) — renders an error
        /// bubble and drops the turn from history. Returns false when no turn is in flight.</summary>
        public bool FailTurn(string error)
        {
            if (!_streaming || _streamIndex < 0) return false;
            ChatMessage bubble = _messages[_streamIndex];
            bubble.Text = $"[Error: {error}]";
            bubble.Error = true;
            bubble.Streaming = false;
            _streaming = false;
            _streamIndex = -1;
            return true;
        }

        public bool IsStreaming() => _streaming;

        /// <summary>The whole transcript (including any in-flight / errored bubble), oldest first.</summary>
        public IReadOnlyList<ChatMessage> MessageList() => _messages;

        /// <summary>Actions triggered so far (the panel diffs this to feed the KB).</summary>
        public IReadOnlyList<ChatAction> ActionList() => _actions;

        /// <summary>The current in-flight bubble text (for live rendering).</summary>
        public string StreamingText() => _streamIndex >= 0 ? _messages[_streamIndex].Text : string.Empty;

        /// <summary>The last settled (non-streaming, non-error) NPC line — TTS / lip-sync source.</summary>
        public string LastNpcText()
        {
            for (int i = _messages.Count - 1; i >= 0; i--)
            {
                ChatMessage m = _messages[i];
                if (m.Role == ChatRole.Npc && !m.Streaming && !m.Error) return m.Text;
            }
            return string.Empty;
        }

        public int CompletedTurnCount() => _turnCount;

        /// <summary>Project the transcript into ConversationSummary.recentTurns form.
        /// In-flight and errored bubbles are excluded (only settled turns persist).
        /// <paramref name="timestamp"/> stamps every emitted turn (caller-supplied so
        /// the projection stays deterministic).</summary>
        public ChatHistory History(string timestamp = "")
        {
            var recent = new List<ChatTurn>();
            foreach (ChatMessage m in _messages)
            {
                if (m.Streaming || m.Error) continue;
                recent.Add(new ChatTurn(m.Role, m.Text, timestamp));
            }
            return new ChatHistory(recent, _turnCount);
        }

        /// <summary>The engine-neutral role token ("player" / "npc").</summary>
        public static string RoleName(ChatRole role) => role == ChatRole.Player ? "player" : "npc";
    }
}
