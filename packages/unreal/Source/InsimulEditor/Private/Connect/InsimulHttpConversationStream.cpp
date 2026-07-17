// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulHttpConversationStream.cpp — production reply-stream body (US-XE4). Syntax-
// gated only (FHttpModule). See the header; the SSE parse + turn-lifecycle decision
// logic lives in the UE-free Portable/InsimulConversationTesterModel and is
// host-tested.

#include "InsimulHttpConversationStream.h"

#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"

// ── FInsimulHttpConversationStream ─────────────────────────────────────────────

FInsimulHttpConversationStream::FInsimulHttpConversationStream(insimul::FEditorSession& Session,
		const std::string& SessionId, const std::string& CharacterId, const std::string& WorldId,
		const std::string& Text)
	: Alive(std::make_shared<bool>(true))
{
	// Build the streamConversation request off the shared session so it carries the
	// base URL + bearer token; the stream BYPASSES AuthenticatedRequest on purpose, so
	// a 401/403 mid-stream is a conversation error (buffered below), not a session
	// re-auth — the next AuthenticatedRequest re-arms NeedsReauth.
	const std::string Body = insimul::FConversationTesterModel::BuildSendBody(
			SessionId, CharacterId, WorldId, Text);
	insimul::FEditorRequest Built;
	if (!Session.BuildRequest("streamConversation", Body, Built))
	{
		Events.push(insimul::FConversationEvent::Failed("streamConversation is not a known operation"));
		bClosed = true;
		return;
	}

	Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(UTF8_TO_TCHAR(Built.Url.c_str()));
	Request->SetVerb(UTF8_TO_TCHAR(Built.Method.c_str()));
	for (const auto& Header : Built.Headers)
	{
		Request->SetHeader(UTF8_TO_TCHAR(Header.first.c_str()), UTF8_TO_TCHAR(Header.second.c_str()));
	}
	Request->SetHeader(TEXT("Accept"), TEXT("text/event-stream"));
	if (!Built.Body.empty())
	{
		Request->SetContentAsString(UTF8_TO_TCHAR(Built.Body.c_str()));
	}

	// The completion lambda captures a COPY of the alive flag (not this) so a callback
	// that fires after the stream was disposed is dropped instead of touching freed
	// memory — the domain-reload zombie-response guard.
	std::shared_ptr<bool> AliveCopy = Alive;
	Request->OnProcessRequestComplete().BindLambda(
			[this, AliveCopy](FHttpRequestPtr /*Req*/, FHttpResponsePtr Response, bool bConnectedSuccessfully)
			{
				if (AliveCopy == nullptr || !*AliveCopy)
				{
					return; // the stream was disposed before the response arrived
				}
				int32 Status = 0;
				std::string ResponseBody;
				if (bConnectedSuccessfully && Response.IsValid())
				{
					Status = Response->GetResponseCode();
					ResponseBody = std::string(TCHAR_TO_UTF8(*Response->GetContentAsString()));
				}
				OnComplete(Status, ResponseBody);
			});

	Request->ProcessRequest();
}

FInsimulHttpConversationStream::~FInsimulHttpConversationStream()
{
	// Disposal: drop any late callback and abort the in-flight request so no orphaned
	// request survives a domain reload / window close.
	if (Alive != nullptr)
	{
		*Alive = false;
	}
	if (Request.IsValid())
	{
		Request->CancelRequest();
	}
}

void FInsimulHttpConversationStream::OnComplete(int32 Status, const std::string& Body)
{
	const bool bOk = Status >= 200 && Status < 300;
	if (!bOk)
	{
		Events.push(insimul::FConversationEvent::Failed(
				"the conversation request failed (HTTP " + std::to_string(Status) + ")"));
		bClosed = true;
		return;
	}
	// Buffer the parsed SSE events — the model drains them in Pump() and derives the
	// running transcript. IsClosed goes true so a body with no terminal event surfaces
	// as a premature close.
	for (const insimul::FConversationEvent& Event : insimul::FConversationTesterModel::ParseSSE(Body))
	{
		Events.push(Event);
	}
	bClosed = true;
}

bool FInsimulHttpConversationStream::TryDequeue(insimul::FConversationEvent& OutEvent)
{
	if (Events.empty())
	{
		return false;
	}
	OutEvent = Events.front();
	Events.pop();
	return true;
}

// ── FInsimulHttpConversationClient ─────────────────────────────────────────────

std::unique_ptr<insimul::IConversationStream> FInsimulHttpConversationClient::Send(
		insimul::FEditorSession& Session, const std::string& SessionId,
		const std::string& CharacterId, const std::string& WorldId, const std::string& Text)
{
	if (!Session.IsAuthenticated() || CharacterId.empty())
	{
		return nullptr; // surfaced as "conversation stream unavailable" by the model
	}
	return std::unique_ptr<insimul::IConversationStream>(
			new FInsimulHttpConversationStream(Session, SessionId, CharacterId, WorldId, Text));
}
