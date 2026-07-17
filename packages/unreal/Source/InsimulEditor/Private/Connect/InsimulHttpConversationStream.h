// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulHttpConversationStream.h — the production reply stream the Conversation
// Tester view-model drives (US-XE4).
//
//   - FInsimulHttpConversationClient — opens a reply stream for one turn by issuing
//     one non-blocking streamConversation POST through the shared FEditorSession.
//   - FInsimulHttpConversationStream — buffers the parsed SSE events for the model to
//     drain in Pump(); disposing it (destruction) aborts the in-flight request so a
//     domain reload / window close never leaves an orphaned request.
//
// Streaming choice = one non-blocking FHttpModule POST that parses the same
// data:{json} SSE the runtime conversation client emits (via the UE-FREE, host-tested
// FConversationTesterModel::ParseSSE), buffered into events. TEXT streaming works in
// edit mode with NO running game world (no PIE needed); audio PLAYBACK + lip sync are
// NOT available here (they need the runtime audio components) — the tester only counts
// the TTS audio chunks a reply returned. See the FConversationTesterModel header for
// the full edit-mode constraint.
//
// All the parse/lifecycle decision logic lives in the UE-FREE, host-tested
// Portable/InsimulConversationTesterModel; this file only supplies the engine seam
// (FHttpModule through the shared session so a 401/403 mid-stream is a conversation
// error, and the next AuthenticatedRequest re-arms re-auth). It is UE-coupled and
// therefore syntax-gated only.

#pragma once

#include "CoreMinimal.h"

#include <memory>
#include <queue>
#include <string>

#include "Interfaces/IHttpRequest.h"

#include "../../Portable/InsimulConversationTesterModel.h" // IConversationStream(Client)

/**
 * The production reply stream: one non-blocking streamConversation POST whose SSE body
 * is parsed into buffered conversation events on completion. TryDequeue drains the
 * buffer; IsClosed flips true once the request finished (a close with no terminal
 * event surfaces as a premature close in the model). Destruction cancels the in-flight
 * request AND flips a shared "alive" flag so a completion callback that fires after
 * teardown is dropped — the zombie-response guard the model relies on for domain-reload
 * safety.
 */
class FInsimulHttpConversationStream : public insimul::IConversationStream
{
public:
	FInsimulHttpConversationStream(insimul::FEditorSession& Session, const std::string& SessionId,
			const std::string& CharacterId, const std::string& WorldId, const std::string& Text);
	~FInsimulHttpConversationStream() override;

	bool TryDequeue(insimul::FConversationEvent& OutEvent) override;
	bool IsClosed() const override { return bClosed; }

private:
	void OnComplete(int32 Status, const std::string& Body);

	TSharedPtr<IHttpRequest, ESPMode::ThreadSafe> Request;
	/** Flipped false in the dtor; the completion lambda drops the response if not set. */
	std::shared_ptr<bool> Alive;
	std::queue<insimul::FConversationEvent> Events;
	bool bClosed = false;
};

/** Opens the production reply stream for one conversation turn. */
class FInsimulHttpConversationClient : public insimul::IConversationClient
{
public:
	std::unique_ptr<insimul::IConversationStream> Send(insimul::FEditorSession& Session,
			const std::string& SessionId, const std::string& CharacterId,
			const std::string& WorldId, const std::string& Text) override;
};
