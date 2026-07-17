// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulConversationTesterModel.cpp — the Conversation Tester view-model body
// (US-XE4). See the header for the contract; this file is Unreal-Engine-free
// (std lib + InsimulJson only) so it host-tests headless over a mocked transport
// (FEditorSession) + a scripted conversation stream (test_conversation_tester.cpp).

#include "InsimulConversationTesterModel.h"

#include <algorithm>
#include <cctype>

#include "../../InsimulRuntime/Portable/InsimulJson.h"

namespace insimul {

namespace {

/** A JSON string literal for the tiny request bodies we build. */
std::string JsonString(const std::string& S) {
	std::string Out;
	Out.reserve(S.size() + 2);
	Out.push_back('"');
	for (char C : S) {
		switch (C) {
			case '"': Out += "\\\""; break;
			case '\\': Out += "\\\\"; break;
			case '\n': Out += "\\n"; break;
			case '\r': Out += "\\r"; break;
			case '\t': Out += "\\t"; break;
			default: Out.push_back(C); break;
		}
	}
	Out.push_back('"');
	return Out;
}

std::string ToLower(std::string S) {
	std::transform(S.begin(), S.end(), S.begin(),
			[](unsigned char C) { return static_cast<char>(std::tolower(C)); });
	return S;
}

std::string Trim(const std::string& S) {
	std::size_t Begin = 0;
	std::size_t End = S.size();
	while (Begin < End && std::isspace(static_cast<unsigned char>(S[Begin]))) {
		++Begin;
	}
	while (End > Begin && std::isspace(static_cast<unsigned char>(S[End - 1]))) {
		--End;
	}
	return S.substr(Begin, End - Begin);
}

std::string Str(const FJsonValue& O, const std::string& Key) {
	const FJsonValue* V = O.Find(Key);
	return (V != nullptr && V->IsString()) ? V->StringValue : std::string();
}

std::string FirstStr(const FJsonValue& O, const std::vector<std::string>& Keys) {
	for (const std::string& K : Keys) {
		std::string S = Str(O, K);
		if (!S.empty()) {
			return S;
		}
	}
	return std::string();
}

bool Bool(const FJsonValue& O, const std::string& Key) {
	const FJsonValue* V = O.Find(Key);
	return V != nullptr && V->Type == EJsonType::Bool && V->BoolValue;
}

/** Parse one character object defensively. Returns false when it lacks an id. */
bool ParseCharacter(const FJsonValue& O, FTesterCharacter& Out) {
	if (!O.IsObject()) {
		return false;
	}
	const std::string Id = FirstStr(O, {"id", "characterId"});
	if (Id.empty()) {
		return false;
	}
	const std::string Name = FirstStr(O, {"name", "displayName"});
	Out.Id = Id;
	Out.Name = Name.empty() ? Id : Name;
	Out.Role = FirstStr(O, {"role", "occupation", "title", "description"});
	return true;
}

} // namespace

// ── FConversationEvent factories ────────────────────────────────────────────────

FConversationEvent FConversationEvent::MakeText(const std::string& InText, bool bInIsFinal) {
	FConversationEvent E;
	E.Type = EConversationEventType::Text;
	E.Text = InText;
	E.bIsFinal = bInIsFinal;
	return E;
}

FConversationEvent FConversationEvent::Audio() {
	FConversationEvent E;
	E.Type = EConversationEventType::Audio;
	return E;
}

FConversationEvent FConversationEvent::MakeTranscript(const std::string& InText) {
	FConversationEvent E;
	E.Type = EConversationEventType::Transcript;
	E.Text = InText;
	return E;
}

FConversationEvent FConversationEvent::Complete() {
	FConversationEvent E;
	E.Type = EConversationEventType::Complete;
	return E;
}

FConversationEvent FConversationEvent::Failed(const std::string& InMessage) {
	FConversationEvent E;
	E.Type = EConversationEventType::Error;
	E.Message = InMessage;
	return E;
}

// ── FConversationTesterModel ────────────────────────────────────────────────────

FConversationTesterModel::FConversationTesterModel(IConversationClient* InClient)
	: Client(InClient != nullptr ? InClient : &DefaultClient) {}

const FTesterCharacter* FConversationTesterModel::SelectedCharacter() const {
	return SelectedCharacterIdValue.empty() ? nullptr : FindCharacter(SelectedCharacterIdValue);
}

// ── Load characters ──────────────────────────────────────────────────────────

void FConversationTesterModel::LoadCharacters(FEditorSession& Session, const std::string& WorldId,
		FLoadCallback OnDone) {
	if (WorldId.empty()) {
		FailLoad("no world selected");
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	WorldIdValue = WorldId;
	LoadStatusValue = ETesterLoad::Loading;
	LoadErrorValue.clear();
	const std::string Body = "{\"worldId\":" + JsonString(WorldId) + "}";
	Session.AuthenticatedRequest("getWorldDetail", Body, [this, OnDone](const FSessionResult& Res) {
		if (!Res.bOk) {
			FailLoad(!Res.Error.empty() ? Res.Error : ("server returned " + std::to_string(Res.Status)));
			if (OnDone) {
				OnDone(false);
			}
			return;
		}
		SetCharacters(ParseCharacters(Res.Body));
		LoadStatusValue = ETesterLoad::Loaded;
		if (OnDone) {
			OnDone(true);
		}
	});
}

void FConversationTesterModel::SelectCharacter(const std::string& CharacterId) {
	if (!CharacterId.empty() && FindCharacter(CharacterId) == nullptr) {
		return; // an id not in the loaded list is ignored
	}
	if (CharacterId == SelectedCharacterIdValue) {
		return;
	}
	SelectedCharacterIdValue = CharacterId;
	NewConversation();
}

// ── Send a turn ────────────────────────────────────────────────────────────────

void FConversationTesterModel::Send(FEditorSession& Session, const std::string& InText,
		FSendCallback OnDone) {
	if (IsBusy()) {
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	if (SelectedCharacterIdValue.empty()) {
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	const std::string Text = Trim(InText);
	if (Text.empty()) {
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	if (!Session.IsAuthenticated()) {
		SetError("not authenticated");
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	if (SessionIdValue.empty()) {
		SessionIdValue = NewSessionId();
	}

	TranscriptValue.emplace_back(true, Text);
	PendingReplyValue.clear();
	AudioChunkCountValue = 0;
	ErrorValue.clear();
	StateValue = ETesterState::Sending;

	Stream = Client->Send(Session, SessionIdValue, SelectedCharacterIdValue, WorldIdValue, Text);
	if (Stream == nullptr) {
		SetError("conversation stream unavailable");
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	if (OnDone) {
		OnDone(true);
	}
}

// ── Pump ────────────────────────────────────────────────────────────────────────

void FConversationTesterModel::Pump() {
	if (Stream == nullptr) {
		return;
	}
	FConversationEvent Event;
	while (Stream != nullptr && Stream->TryDequeue(Event)) {
		ApplyEvent(Event);
		if (Stream == nullptr) {
			return; // a terminal event disposed the stream
		}
	}
	if (Stream != nullptr && Stream->IsClosed() && IsBusy()) {
		SetError("the conversation stream closed before the reply completed");
	}
}

void FConversationTesterModel::ApplyEvent(const FConversationEvent& Event) {
	switch (Event.Type) {
		case EConversationEventType::Text:
			StateValue = ETesterState::Streaming;
			PendingReplyValue += Event.Text;
			break;
		case EConversationEventType::Audio:
			AudioChunkCountValue++;
			break;
		case EConversationEventType::Transcript:
			// The player's STT transcript (audio turns). Text turns already carry the
			// message verbatim, so this is informational only.
			break;
		case EConversationEventType::Complete:
			FinalizeReply();
			break;
		case EConversationEventType::Error:
			SetError(Event.Message.empty() ? "the conversation failed" : Event.Message);
			break;
	}
}

void FConversationTesterModel::FinalizeReply() {
	const std::string Reply = PendingReplyValue;
	PendingReplyValue.clear();
	if (!Reply.empty()) {
		TranscriptValue.emplace_back(false, Reply);
	}
	StateValue = ETesterState::Idle;
	DisposeStream();
}

// ── Reset / dispose ──────────────────────────────────────────────────────────────

void FConversationTesterModel::NewConversation() {
	DisposeStream();
	TranscriptValue.clear();
	PendingReplyValue.clear();
	SessionIdValue.clear();
	AudioChunkCountValue = 0;
	ErrorValue.clear();
	StateValue = ETesterState::Idle;
}

// ── Internals ────────────────────────────────────────────────────────────────────

void FConversationTesterModel::SetCharacters(std::vector<FTesterCharacter> Characters) {
	CharactersValue = std::move(Characters);
	// Drop a now-dangling selection (a re-load that removed the character).
	if (!SelectedCharacterIdValue.empty() && FindCharacter(SelectedCharacterIdValue) == nullptr) {
		SelectedCharacterIdValue.clear();
		NewConversation();
	}
}

void FConversationTesterModel::FailLoad(const std::string& Reason) {
	LoadStatusValue = ETesterLoad::Error;
	LoadErrorValue = Reason;
}

void FConversationTesterModel::SetError(const std::string& Reason) {
	StateValue = ETesterState::Error;
	ErrorValue = Reason;
	PendingReplyValue.clear(); // discard the partial reply
	DisposeStream();
}

void FConversationTesterModel::DisposeStream() {
	// Destroying the stream is its disposal: it aborts any in-flight request
	// (Private/Connect/InsimulHttpConversationStream).
	Stream.reset();
}

const FTesterCharacter* FConversationTesterModel::FindCharacter(const std::string& Id) const {
	for (const FTesterCharacter& C : CharactersValue) {
		if (C.Id == Id) {
			return &C;
		}
	}
	return nullptr;
}

std::string FConversationTesterModel::NewSessionId() {
	return "editor-" + std::to_string(++SessionCounter);
}

// ── Static helpers ────────────────────────────────────────────────────────────────

std::string FConversationTesterModel::BuildSendBody(const std::string& SessionId,
		const std::string& CharacterId, const std::string& WorldId, const std::string& Text) {
	return "{\"sessionId\":" + JsonString(SessionId) + ",\"characterId\":" + JsonString(CharacterId) +
			",\"worldId\":" + JsonString(WorldId) + ",\"text\":" + JsonString(Text) + "}";
}

std::vector<FTesterCharacter> FConversationTesterModel::ParseCharacters(const std::string& Body) {
	std::vector<FTesterCharacter> Out;
	FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || Parsed.Root == nullptr || !Parsed.Root->IsObject()) {
		return Out;
	}
	const FJsonValue* Root = Parsed.Root.get();
	const FJsonValue* World = Root->Find("world");
	if (World != nullptr && World->IsObject()) {
		Root = World;
	}

	const FJsonValue* Arr = nullptr;
	for (const char* Key : {"characters", "npcs", "people"}) {
		const FJsonValue* A = Root->Find(Key);
		if (A != nullptr && A->IsArray()) {
			Arr = A;
			break;
		}
	}
	if (Arr == nullptr) {
		return Out;
	}
	for (const FJsonValuePtr& Item : Arr->ArrayItems) {
		FTesterCharacter Character;
		if (Item != nullptr && ParseCharacter(*Item, Character)) {
			Out.push_back(std::move(Character));
		}
	}
	return Out;
}

std::vector<FConversationEvent> FConversationTesterModel::ParseSSE(const std::string& Body) {
	std::vector<FConversationEvent> Out;
	if (Body.empty()) {
		return Out;
	}
	std::size_t Pos = 0;
	while (Pos <= Body.size()) {
		const std::size_t Nl = Body.find('\n', Pos);
		const std::string Raw = Body.substr(Pos, Nl == std::string::npos ? std::string::npos : Nl - Pos);
		const std::string Line = Trim(Raw);
		if (Line.rfind("data:", 0) == 0) {
			const std::string Json = Trim(Line.substr(5));
			if (Json == "[DONE]") {
				break;
			}
			FConversationEvent Event;
			if (!Json.empty() && ParseSSEEvent(Json, Event)) {
				Out.push_back(Event);
			}
		}
		if (Nl == std::string::npos) {
			break;
		}
		Pos = Nl + 1;
	}
	return Out;
}

bool FConversationTesterModel::ParseSSEEvent(const std::string& Json, FConversationEvent& OutEvent) {
	FJsonParseResult Parsed = ParseJson(Json);
	if (!Parsed.bOk || Parsed.Root == nullptr || !Parsed.Root->IsObject()) {
		return false;
	}
	const FJsonValue& Root = *Parsed.Root;
	const std::string Type = ToLower(Str(Root, "type"));
	if (Type == "text") {
		OutEvent = FConversationEvent::MakeText(Str(Root, "text"), Bool(Root, "isFinal"));
		return true;
	}
	if (Type == "audio") {
		OutEvent = FConversationEvent::Audio();
		return true;
	}
	if (Type == "transcript") {
		OutEvent = FConversationEvent::MakeTranscript(Str(Root, "text"));
		return true;
	}
	if (Type == "error") {
		OutEvent = FConversationEvent::Failed(FirstStr(Root, {"message", "error"}));
		return true;
	}
	if (Type == "done" || Type == "complete" || Type == "end") {
		OutEvent = FConversationEvent::Complete();
		return true;
	}
	return false; // facial / action / unknown — not surfaced by the tester
}

} // namespace insimul
