// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulChatModel — the host-testable, portable dialogue/chat streaming
// view-model for the default-UI conversation panel (US-XU4, InsimulChatPanel).
// The Unreal mirror of the engine-neutral dialogue contract
// (packages/core/src/ui/chat-model.ts; the Godot leg is
// addons/insimul/ui/chat_model.gd).
//
// Drives the streaming conversation SDK's turn lifecycle: a player line opens a
// turn and an empty in-flight NPC bubble, response CHUNKS accumulate into that
// bubble (live-render source), ACTION triggers (applied to the KB by the panel)
// are recorded, and Complete()/Fail() close the turn. The settled transcript
// projects into the save.conversations (ConversationSummary.recentTurns) shape so
// history persists through the portable save system.
//
// TTS playback + the InsimulFaceSync lip-sync hook are PANEL concerns fed from
// LastNpcText() on Complete(); they are not part of this pure core.
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs under
// tools/verify-unreal/run-dialogue-ui-tests.sh. The UMG seam (UInsimulChatPanel,
// Public/InsimulChatPanel.h) is a thin UObject boundary on top, syntax-gated only.
// Every default-UI leg runs the SAME matrix
// (packages/core/conformance/ui/chat-cases.json) so the four legs cannot diverge.

#pragma once

#include <string>
#include <vector>

namespace insimul {

/** One rendered chat bubble. bStreaming marks the in-flight NPC bubble; bError an
 *  error bubble (both excluded from persisted history). */
struct FChatMessage {
	std::string Role;   // "player" | "npc"
	std::string Text;
	bool bStreaming = false;
	bool bError = false;
};

/** An action the stream triggered — the panel diffs this list and applies each to
 *  the KB (FactToAssert). */
struct FChatAction {
	std::string Name;
	std::vector<std::string> Args;
	std::string FactToAssert;
};

/** One persisted conversation turn (ConversationSummary.recentTurns element). */
struct FChatHistoryTurn {
	std::string Role;
	std::string Content;
	std::string Timestamp;
};

/** save.conversations projection: the settled turns + the completed-turn count. */
struct FChatHistory {
	std::vector<FChatHistoryTurn> RecentTurns;
	long long TotalTurnCount = 0;
};

class FInsimulChatModel {
public:
	FInsimulChatModel() = default;
	explicit FInsimulChatModel(const std::string& InCharId, const std::string& InCharName = std::string());

	std::string CharacterId() const { return CharId; }
	std::string CharacterName() const { return CharName; }

	// ── Turn lifecycle ────────────────────────────────────────────────────────

	/** Seed the NPC's opening line (context greeting) — not a streamed turn. */
	void Greeting(const std::string& Text);

	/** Open a turn with the player's line + an empty in-flight NPC bubble. Rejected
	 *  (returns false) while a turn is already streaming or the line is blank. */
	bool BeginUserTurn(const std::string& Text);

	/** Append a streamed chunk to the in-flight NPC bubble. No-op when idle. */
	void AppendChunk(const std::string& Text);

	/** Record an action the stream triggered (the panel applies it to the KB). */
	void TriggerAction(const FChatAction& Action);

	/** Close the in-flight turn. Returns false when no turn is in flight. */
	bool CompleteTurn();

	/** Close the in-flight turn, replacing the bubble with an authoritative full
	 *  text (overrides the accumulated chunks). */
	bool CompleteTurn(const std::string& FullText);

	/** Fail the in-flight turn — renders an error bubble, drops the turn from
	 *  history. Returns false when no turn is in flight. */
	bool FailTurn(const std::string& Error);

	// ── Reads ─────────────────────────────────────────────────────────────────

	bool IsStreaming() const { return bStreaming; }

	/** The whole transcript (including any in-flight / errored bubble), oldest first. */
	const std::vector<FChatMessage>& MessageList() const { return Messages; }

	/** Actions triggered so far. */
	const std::vector<FChatAction>& ActionList() const { return Actions; }

	/** The current in-flight bubble text (live-render source). */
	std::string StreamingText() const;

	/** The last settled (non-streaming, non-error) NPC line — TTS / lip-sync source. */
	std::string LastNpcText() const;

	long long CompletedTurnCount() const { return TurnCount; }

	/** Project the transcript into ConversationSummary.recentTurns form. In-flight
	 *  and errored bubbles are excluded; Timestamp stamps every emitted turn. */
	FChatHistory History(const std::string& Timestamp = std::string()) const;

private:
	std::string CharId;
	std::string CharName;

	std::vector<FChatMessage> Messages;
	std::vector<FChatAction> Actions;
	bool bStreaming = false;
	long long StreamIndex = -1;
	long long TurnCount = 0;

	bool CloseTurn(const std::string* FullText);
};

} // namespace insimul
