// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulConversationTesterModel.h — the in-editor NPC Conversation Tester tab
// view-model (US-XE4).
//
// The engine-agnostic, UI-FREE heart of the editor's Conversation Tester: it loads
// the imported world's characters into a picker, lets the creator talk to any one of
// them through the conversation SDK's streaming endpoint, and drives a per-turn state
// machine (Idle -> Sending -> Streaming -> Idle, or -> Error) from reply chunks
// PULLED off an injected conversation stream. Both the player's message and the
// finalized character reply land in an inspectable transcript; a TTS-returned
// audio-chunk count is surfaced (edit-mode audio PLAYBACK is out of scope — see the
// constraint below).
//
// It reaches the backend two ways, each mirrored on the other panels:
//   - Character load: FEditorSession::AuthenticatedRequest("getWorldDetail") — a
//     401/403 clears the token and arms Session.NeedsReauth (the World Browser /
//     Generation Console re-auth-prompt seam).
//   - Reply streaming: through an INJECTED seam (IConversationClient opens an
//     IConversationStream for the turn), which the model DRAINS in Pump() (one call
//     per editor tick — no thread, no timer inside the model). The stream BYPASSES
//     AuthenticatedRequest (like the Generation Console poll), so a 401 mid-stream is
//     a conversation ERROR, not a session re-auth; the next AuthenticatedRequest
//     re-arms Session.NeedsReauth.
// Both injected, so the whole load -> send -> chunk -> complete/error lifecycle plus
// the send guards, a multi-turn transcript over one session id, character switching,
// and dispose-on-teardown are host-tested headless (test_conversation_tester.cpp)
// while the UE-coupled stream + window are syntax-gated only. Same pull-don't-push
// shape as FGenerationConsoleModel (US-XE3). This is the Unreal mirror of
// packages/core/src/editor/conversation-tester.ts, the Unity
// InsimulConversationTesterModel.cs (+ ConversationTesterTests), and the Godot
// conversation_reducer.gd.
//
// ── Edit-mode constraint (documented in README + VERIFICATION) ───────────────────
// Streaming TEXT works in edit mode: the production stream drives ONE non-blocking
// FHttpModule POST to /api/conversation/stream and parses the same data:{json} SSE
// the runtime conversation client does — but WITHOUT a running game world (no PIE
// required). Audio PLAYBACK and lip sync are NOT available here (they need the
// runtime AInsimulAICharacter / audio components); the tester only reports how many
// audio chunks a TTS-enabled reply returned. To hear audio, drive a scene in Play
// mode with the runtime conversation component.
//
// Unreal-Engine-free on purpose (std lib only): parses via the UE-free InsimulJson,
// exactly like the World Browser + Generation Console view-models.

#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "InsimulEditorSession.h"

namespace insimul {

class FJsonValue; // fwd (InsimulJson) — used only in the .cpp

/**
 * Per-turn conversation state. Idle between turns; Sending between the send and the
 * first reply chunk; Streaming while chunks arrive; then back to Idle on completion,
 * or Error on a failure.
 */
enum class ETesterState {
	Idle,
	Sending,
	Streaming,
	Error,
};

/** Character-list load lifecycle. */
enum class ETesterLoad {
	Idle,
	Loading,
	Loaded,
	Error,
};

/** A character the creator can talk to, parsed from the world detail. */
struct FTesterCharacter {
	std::string Id;
	std::string Name;
	/** A short role/occupation label for the picker (optional). */
	std::string Role;

	/** "Name — Role" when a role is present, else just the name. */
	std::string Label() const {
		return Role.empty() ? Name : (Name + " — " + Role);
	}
};

/** One line of the transcript: the player's message or the character's reply. */
struct FTesterTurn {
	bool bFromPlayer = false;
	std::string Text;

	FTesterTurn() = default;
	FTesterTurn(bool bInFromPlayer, std::string InText)
		: bFromPlayer(bInFromPlayer), Text(std::move(InText)) {}
};

/** The kind of a single event pulled off the conversation stream. */
enum class EConversationEventType {
	Text,
	Audio,
	Transcript,
	Complete,
	Error,
};

/**
 * One conversation event: a reply text chunk, an audio chunk marker, a (player STT)
 * transcript, a terminal Complete, or an Error. Built by the parsers or the static
 * factories below.
 */
struct FConversationEvent {
	EConversationEventType Type = EConversationEventType::Text;
	/** Reply text for a Text event (or the player transcript for Transcript). */
	std::string Text;
	/** True on the final Text chunk of a reply. */
	bool bIsFinal = false;
	/** A failure reason on an Error event. */
	std::string Message;

	static FConversationEvent MakeText(const std::string& InText, bool bInIsFinal = false);
	static FConversationEvent Audio();
	static FConversationEvent MakeTranscript(const std::string& InText);
	static FConversationEvent Complete();
	static FConversationEvent Failed(const std::string& InMessage);
};

/**
 * A single conversation turn's reply stream. Non-blocking: the model DRAINS buffered
 * events via TryDequeue in its Pump(); the stream buffers them however it likes
 * (production parses one buffered SSE response). IsClosed lets the model detect a
 * premature close (the transport died before a terminal Complete/Error). Destruction
 * == disposal: disposing the stream aborts any in-flight request.
 */
class IConversationStream {
public:
	virtual ~IConversationStream() = default;

	/** Dequeue the next buffered event, or return false if none pending. */
	virtual bool TryDequeue(FConversationEvent& OutEvent) = 0;

	/**
	 * True once the underlying transport has closed. A close with no terminal event is
	 * a premature close.
	 */
	virtual bool IsClosed() const = 0;
};

/**
 * Opens a reply stream for one conversation turn. Injected so the model is testable
 * against a scripted stream; production returns the FHttpModule SSE stream. Returns
 * null when streaming is unavailable (surfaced as a conversation error).
 */
class IConversationClient {
public:
	virtual ~IConversationClient() = default;
	virtual std::unique_ptr<IConversationStream> Send(FEditorSession& Session,
			const std::string& SessionId, const std::string& CharacterId,
			const std::string& WorldId, const std::string& Text) = 0;
};

/**
 * A client used when no conversation streaming is wired: Send returns null so a turn
 * surfaces "stream unavailable" instead of hanging.
 */
class FUnavailableConversationClient : public IConversationClient {
public:
	std::unique_ptr<IConversationStream> Send(FEditorSession&, const std::string&,
			const std::string&, const std::string&, const std::string&) override {
		return nullptr;
	}
};

using FLoadCallback = std::function<void(bool)>;
using FSendCallback = std::function<void(bool)>;

/** The Conversation Tester view-model. */
class FConversationTesterModel {
public:
	/** The client defaults to the unavailable fallback so a bare model is usable. */
	explicit FConversationTesterModel(IConversationClient* InClient = nullptr);

	// ── State accessors ─────────────────────────────────────────────────────

	ETesterState State() const { return StateValue; }
	ETesterLoad LoadStatus() const { return LoadStatusValue; }
	/** A human reason for the last character-load failure. */
	const std::string& LoadError() const { return LoadErrorValue; }
	/** A human reason when State() is Error. */
	const std::string& Error() const { return ErrorValue; }
	/** The selected character id ("" when none selected). */
	const std::string& SelectedCharacterId() const { return SelectedCharacterIdValue; }
	/** Count of audio chunks a TTS-enabled reply returned this turn (never played in
	 * edit mode — see the class header constraint). */
	int AudioChunkCount() const { return AudioChunkCountValue; }

	const std::vector<FTesterCharacter>& Characters() const { return CharactersValue; }
	const std::vector<FTesterTurn>& Transcript() const { return TranscriptValue; }
	/** The reply text streamed so far this turn (finalized into the transcript on
	 * Complete). */
	const std::string& PendingReply() const { return PendingReplyValue; }
	/** The stable conversation session id shared across a character's turns (empty
	 * until the first send; reset on a character switch / NewConversation). */
	const std::string& SessionId() const { return SessionIdValue; }

	/** True while a turn is in flight (send requested through streaming). */
	bool IsBusy() const {
		return StateValue == ETesterState::Sending || StateValue == ETesterState::Streaming;
	}

	/** The currently-selected character, or null. */
	const FTesterCharacter* SelectedCharacter() const;

	// ── Load characters ──────────────────────────────────────────────────────

	/**
	 * Load WorldId's characters via getWorldDetail for the picker. A missing world id
	 * fails WITHOUT a backend call; a 401/403 arms Session.NeedsReauth. OnDone receives
	 * success/failure.
	 */
	void LoadCharacters(FEditorSession& Session, const std::string& WorldId,
			FLoadCallback OnDone = nullptr);

	/**
	 * Select the character to talk to (or "" to clear). Selecting a DIFFERENT character
	 * starts a fresh conversation (new session id, cleared transcript); an id not in the
	 * loaded list is ignored.
	 */
	void SelectCharacter(const std::string& CharacterId);

	// ── Send a turn ────────────────────────────────────────────────────────

	/**
	 * Send the player's Text to the selected character and open the reply stream. No-op
	 * (delivers false) while a turn is in flight, with no character selected, or with
	 * empty text; a missing credential lands in Error. The player message is appended to
	 * the transcript immediately; the reply streams in through Pump().
	 */
	void Send(FEditorSession& Session, const std::string& Text, FSendCallback OnDone = nullptr);

	// ── Pump (drain the stream — one call per editor tick) ────────────────────

	/**
	 * Drain every buffered reply event and advance the turn state machine. Called once
	 * per tick by the window. A premature close (the stream ended with no
	 * Complete/Error) becomes an Error.
	 */
	void Pump();

	// ── Reset / dispose ────────────────────────────────────────────────────

	/**
	 * Start a fresh conversation with the current character (new session id, cleared
	 * transcript) — the window's "New conversation" button.
	 */
	void NewConversation();

	/**
	 * Dispose the in-flight stream (stop streaming). Called by the window when the tab
	 * is torn down so a domain reload never leaves an orphaned request.
	 */
	void Dispose() { DisposeStream(); }

	// ── Static helpers (body + parsing) ──────────────────────────────────────

	/** Build the streamConversation body for a turn. */
	static std::string BuildSendBody(const std::string& SessionId, const std::string& CharacterId,
			const std::string& WorldId, const std::string& Text);

	/**
	 * Parse a getWorldDetail body for its character list. Accepts a
	 * characters/npcs/people array on the root or a nested world. Defensive: an
	 * unparseable body or a bad entry yields an empty list / skipped entry rather than
	 * throwing.
	 */
	static std::vector<FTesterCharacter> ParseCharacters(const std::string& Body);

	/**
	 * Parse a buffered SSE response (the data:{json} lines the conversation endpoint
	 * emits) into a sequence of conversation events. Mirrors the runtime client's SSE
	 * parse into the UE-free event model, so the production stream stays a thin buffer
	 * over this tested parser.
	 */
	static std::vector<FConversationEvent> ParseSSE(const std::string& Body);

	/**
	 * Map one SSE event JSON to a conversation event success flag + value (bOk false
	 * for the event kinds the tester ignores — facial / action / unknown).
	 */
	static bool ParseSSEEvent(const std::string& Json, FConversationEvent& OutEvent);

private:
	void ApplyEvent(const FConversationEvent& Event);
	void FinalizeReply();
	void SetError(const std::string& Reason);
	void FailLoad(const std::string& Reason);
	void SetCharacters(std::vector<FTesterCharacter> Characters);
	void DisposeStream();
	const FTesterCharacter* FindCharacter(const std::string& Id) const;
	std::string NewSessionId();

	IConversationClient* Client;
	FUnavailableConversationClient DefaultClient;
	std::unique_ptr<IConversationStream> Stream;

	std::vector<FTesterCharacter> CharactersValue;
	std::vector<FTesterTurn> TranscriptValue;
	std::string PendingReplyValue;

	std::string WorldIdValue;
	std::string SessionIdValue;
	std::string SelectedCharacterIdValue;

	ETesterState StateValue = ETesterState::Idle;
	ETesterLoad LoadStatusValue = ETesterLoad::Idle;
	std::string LoadErrorValue;
	std::string ErrorValue;
	int AudioChunkCountValue = 0;
	int SessionCounter = 0;
};

} // namespace insimul
