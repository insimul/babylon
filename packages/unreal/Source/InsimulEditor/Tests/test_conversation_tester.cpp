// Copyright 2024 Insimul. All Rights Reserved.
//
// test_conversation_tester.cpp — host gate for the in-editor NPC Conversation Tester
// view-model (US-XE4). Builds under a plain clang toolchain (no Unreal Engine, no
// UBT; see tools/verify-unreal/run-conversation-tests.sh) and proves the SAME cases
// the Unity leg (ConversationTesterTests) and the core leg (conversation-tester.ts)
// prove, so the engines' Conversation Testers can never diverge:
//
//   - static parsing (send body, character list nested/root arrays, SSE data lines);
//   - character load (populate picker; empty world fails without a request; no
//     credential fails; 401 arms re-auth);
//   - send guards (no character; empty text; no credential; while busy; stream
//     unavailable);
//   - turn lifecycle over a scripted stream (chunks -> complete finalizes the reply;
//     streaming across separate pumps; audio chunks counted not played; error event
//     discards the partial + sets error; premature close -> error);
//   - multi-turn over one session id, character switching resets, dispose on teardown.
//
// The UE-coupled seams (Private/Connect: the FHttpModule SSE stream + the window) sit
// ON TOP of this pure core and are syntax-gated only.

#include "../Portable/InsimulConversationTesterModel.h"
#include "../Portable/InsimulEditorSession.h"

#include <cstdio>
#include <map>
#include <memory>
#include <queue>
#include <string>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-58s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

// --- A transport that answers by operationId (FIFO per op) + records requests. --
class FRoutingTransport : public IEditorTransport {
public:
	std::vector<FEditorRequest> Sent;

	FRoutingTransport& On(const std::string& OperationId, int Status, const std::string& Body) {
		ByOp[OperationId].push(FEditorResponse(Status, Body));
		return *this;
	}

	void Request(const FEditorRequest& Req, FTransportCallback OnDone) override {
		Sent.push_back(Req);
		auto It = ByOp.find(Req.OperationId);
		if (It != ByOp.end() && !It->second.empty()) {
			FEditorResponse Res = It->second.front();
			It->second.pop();
			OnDone(Res);
			return;
		}
		OnDone(FEditorResponse(404, std::string()));
	}

private:
	std::map<std::string, std::queue<FEditorResponse>> ByOp;
};

/**
 * A scripted reply stream: pre-loaded with events the model drains, plus a
 * controllable bClosed to exercise premature close. Sets an external flag on disposal
 * (destruction) so the test can assert it after the model releases the stream.
 */
class FFakeConversationStream : public IConversationStream {
public:
	explicit FFakeConversationStream(bool* InDisposedFlag) : DisposedFlag(InDisposedFlag) {}
	~FFakeConversationStream() override {
		if (DisposedFlag != nullptr) {
			*DisposedFlag = true;
		}
	}

	bool bClosed = false;

	FFakeConversationStream& Enqueue(const FConversationEvent& Event) {
		Events.push(Event);
		return *this;
	}

	bool TryDequeue(FConversationEvent& OutEvent) override {
		if (Events.empty()) {
			return false;
		}
		OutEvent = Events.front();
		Events.pop();
		return true;
	}

	bool IsClosed() const override { return bClosed; }

private:
	std::queue<FConversationEvent> Events;
	bool* DisposedFlag;
};

/**
 * Hands the model a pre-built stream per turn (FIFO; null when the queue is empty),
 * recording the turn params it was opened with. The test keeps a raw pointer to a
 * handed-over stream (valid only while the model has not disposed it).
 */
class FScriptedConversationClient : public IConversationClient {
public:
	std::vector<std::string> SessionIds;
	std::string LastCharacterId;
	std::string LastText;
	std::string LastWorldId;
	int OpenCount = 0;

	FScriptedConversationClient& Enqueue(std::unique_ptr<IConversationStream> Stream) {
		Streams.push(std::move(Stream));
		return *this;
	}

	std::unique_ptr<IConversationStream> Send(FEditorSession&, const std::string& SessionId,
			const std::string& CharacterId, const std::string& WorldId,
			const std::string& Text) override {
		OpenCount++;
		SessionIds.push_back(SessionId);
		LastCharacterId = CharacterId;
		LastText = Text;
		LastWorldId = WorldId;
		if (Streams.empty()) {
			return nullptr;
		}
		std::unique_ptr<IConversationStream> Stream = std::move(Streams.front());
		Streams.pop();
		return Stream;
	}

private:
	std::queue<std::unique_ptr<IConversationStream>> Streams;
};

const std::string WorldDetailBody =
		"{\"world\":{\"id\":\"w1\",\"characters\":["
		"{\"id\":\"c1\",\"name\":\"Alice\",\"occupation\":\"Blacksmith\"},"
		"{\"id\":\"c2\",\"name\":\"Bob\"}]}}";

/**
 * An authed session over a getWorldDetail-primed transport. Never copied/moved so the
 * session's back-pointers into T/Secrets stay valid.
 */
struct FAuthedWorld {
	FRoutingTransport T;
	FInMemorySecretStore Secrets;
	std::unique_ptr<FEditorSession> Session;

	explicit FAuthedWorld(const std::string& Token = "tok") {
		T.On("getWorldDetail", 200, WorldDetailBody);
		Secrets.SetToken(Token);
		Session.reset(new FEditorSession("http://localhost:8080", &T, &Secrets));
	}
};

void LoadedAndSelected(FConversationTesterModel& Model, FAuthedWorld& World,
		const std::string& CharId = "c1") {
	Model.LoadCharacters(*World.Session, "w1");
	Model.SelectCharacter(CharId);
}

std::unique_ptr<FFakeConversationStream> MakeStream(bool* DisposedFlag) {
	return std::unique_ptr<FFakeConversationStream>(new FFakeConversationStream(DisposedFlag));
}

// --- Static parsing ----------------------------------------------------------
void TestStaticParsing() {
	std::printf("\n== static parsing ==\n");

	const std::string Body = FConversationTesterModel::BuildSendBody("s1", "c1", "w1", "hello");
	Report("BuildSendBody carries all turn fields",
			Body.find("\"sessionId\":\"s1\"") != std::string::npos &&
					Body.find("\"characterId\":\"c1\"") != std::string::npos &&
					Body.find("\"worldId\":\"w1\"") != std::string::npos &&
					Body.find("\"text\":\"hello\"") != std::string::npos,
			Body);

	std::vector<FTesterCharacter> Nested = FConversationTesterModel::ParseCharacters(WorldDetailBody);
	Report("ParseCharacters reads nested world array",
			Nested.size() == 2 && Nested[0].Id == "c1" && Nested[0].Name == "Alice" &&
					Nested[0].Role == "Blacksmith" && Nested[1].Name == "Bob");
	Report("FTesterCharacter Label = Name — Role", Nested.size() == 2 &&
			Nested[0].Label() == "Alice — Blacksmith" && Nested[1].Label() == "Bob");

	std::vector<FTesterCharacter> Root = FConversationTesterModel::ParseCharacters(
			"{\"npcs\":[{\"characterId\":\"x\",\"displayName\":\"Xena\"}]}");
	Report("ParseCharacters reads root npcs array + displayName",
			Root.size() == 1 && Root[0].Id == "x" && Root[0].Name == "Xena");

	Report("ParseCharacters garbage -> empty",
			FConversationTesterModel::ParseCharacters("garbage").empty());
	Report("ParseCharacter without id is skipped",
			FConversationTesterModel::ParseCharacters("{\"characters\":[{\"name\":\"NoId\"}]}").empty());

	const std::string Sse =
			"data: {\"type\":\"text\",\"text\":\"Hel\"}\n"
			"data: {\"type\":\"audio\",\"data\":\"AA==\"}\n"
			"data: {\"type\":\"text\",\"text\":\"lo\",\"isFinal\":true}\n"
			"data: [DONE]\n";
	std::vector<FConversationEvent> Evts = FConversationTesterModel::ParseSSE(Sse);
	Report("ParseSSE maps data lines to events (stops at [DONE])",
			Evts.size() == 3 && Evts[0].Type == EConversationEventType::Text &&
					Evts[0].Text == "Hel" && Evts[1].Type == EConversationEventType::Audio &&
					Evts[2].bIsFinal);

	FConversationEvent Err;
	Report("ParseSSEEvent error carries message",
			FConversationTesterModel::ParseSSEEvent("{\"type\":\"error\",\"message\":\"boom\"}", Err) &&
					Err.Type == EConversationEventType::Error && Err.Message == "boom");
	FConversationEvent Ignored;
	Report("ParseSSEEvent ignores facial/action (returns false)",
			!FConversationTesterModel::ParseSSEEvent("{\"type\":\"facial\"}", Ignored));
	FConversationEvent Done;
	Report("ParseSSEEvent done/complete/end -> Complete",
			FConversationTesterModel::ParseSSEEvent("{\"type\":\"done\"}", Done) &&
					Done.Type == EConversationEventType::Complete);
}

// --- Character load ----------------------------------------------------------
void TestCharacterLoad() {
	std::printf("\n== character load ==\n");

	{
		FAuthedWorld World;
		FConversationTesterModel Model;
		bool bOk = false;
		Model.LoadCharacters(*World.Session, "w1", [&](bool r) { bOk = r; });
		Report("LoadCharacters populates the picker",
				bOk && Model.LoadStatus() == ETesterLoad::Loaded && Model.Characters().size() == 2 &&
						Model.Characters()[0].Label() == "Alice — Blacksmith");
	}

	{
		FAuthedWorld World;
		FConversationTesterModel Model;
		bool bOk = true;
		Model.LoadCharacters(*World.Session, "", [&](bool r) { bOk = r; });
		Report("LoadCharacters empty world fails without a request",
				!bOk && Model.LoadStatus() == ETesterLoad::Error && World.T.Sent.empty());
	}

	{
		FAuthedWorld World("" /*no token*/);
		FConversationTesterModel Model;
		bool bOk = true;
		Model.LoadCharacters(*World.Session, "w1", [&](bool r) { bOk = r; });
		Report("LoadCharacters no credential fails",
				!bOk && Model.LoadStatus() == ETesterLoad::Error && !Model.LoadError().empty());
	}

	{
		FRoutingTransport T;
		T.On("getWorldDetail", 401, "expired");
		FInMemorySecretStore Secrets;
		Secrets.SetToken("tok");
		FEditorSession Session("http://localhost:8080", &T, &Secrets);
		FConversationTesterModel Model;
		Model.LoadCharacters(Session, "w1");
		Report("LoadCharacters 401 arms re-auth",
				Model.LoadStatus() == ETesterLoad::Error && Session.NeedsReauth());
	}
}

// --- Send guards -------------------------------------------------------------
void TestSendGuards() {
	std::printf("\n== send guards ==\n");

	{
		FScriptedConversationClient Client;
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		Model.LoadCharacters(*World.Session, "w1"); // no SelectCharacter
		bool bOk = true;
		Model.Send(*World.Session, "hi", [&](bool r) { bOk = r; });
		Report("Send with no character selected is ignored",
				!bOk && Model.State() == ETesterState::Idle && Model.Transcript().empty() &&
						Client.OpenCount == 0);
	}

	{
		FScriptedConversationClient Client;
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		bool bOk = true;
		Model.Send(*World.Session, "   ", [&](bool r) { bOk = r; });
		Report("Send with empty text is ignored (no stream opened)",
				!bOk && Client.OpenCount == 0 && Model.Transcript().empty());
	}

	{
		FScriptedConversationClient Client;
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		// A fresh unauthed session for the send.
		FAuthedWorld Unauthed("" /*no token*/);
		bool bOk = true;
		Model.Send(*Unauthed.Session, "hi", [&](bool r) { bOk = r; });
		Report("Send with no credential sets error",
				!bOk && Model.State() == ETesterState::Error && Client.OpenCount == 0);
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		Stream->Enqueue(FConversationEvent::MakeText("streaming"));
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);

		Model.Send(*World.Session, "turn one");
		Model.Pump(); // -> Streaming (busy)
		bool bSecond = true;
		Model.Send(*World.Session, "turn two", [&](bool r) { bSecond = r; });
		Report("Send while busy is refused (no second stream opened)",
				Model.IsBusy() && !bSecond && Client.OpenCount == 1);
	}

	{
		// Client returns null (empty queue) -> the turn has no way to stream.
		FScriptedConversationClient Client;
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		bool bOk = true;
		Model.Send(*World.Session, "hi", [&](bool r) { bOk = r; });
		Report("Send with stream unavailable sets error",
				!bOk && Model.State() == ETesterState::Error &&
						Model.Error().find("unavailable") != std::string::npos);
	}
}

// --- Turn lifecycle ----------------------------------------------------------
void TestLifecycle() {
	std::printf("\n== turn lifecycle ==\n");

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		Stream->Enqueue(FConversationEvent::MakeText("Hel"))
				.Enqueue(FConversationEvent::MakeText("lo!"))
				.Enqueue(FConversationEvent::Complete());
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);

		bool bStarted = false;
		Model.Send(*World.Session, "hi there", [&](bool ok) { bStarted = ok; });
		Report("send records the player turn immediately -> Sending",
				bStarted && Model.State() == ETesterState::Sending && Model.Transcript().size() == 1 &&
						Model.Transcript()[0].bFromPlayer && Client.LastCharacterId == "c1" &&
						Client.LastText == "hi there");

		Model.Pump();
		Report("chunks then complete finalizes the reply -> Idle",
				Model.State() == ETesterState::Idle && Model.Transcript().size() == 2 &&
						!Model.Transcript()[1].bFromPlayer && Model.Transcript()[1].Text == "Hello!" &&
						Model.PendingReply().empty() && Disposed);
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		FFakeConversationStream* Raw = Stream.get();
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		Model.Send(*World.Session, "hi");

		Raw->Enqueue(FConversationEvent::MakeText("par"));
		Model.Pump();
		Report("streaming across separate pumps (chunk 1)",
				Model.State() == ETesterState::Streaming && Model.PendingReply() == "par");

		Raw->Enqueue(FConversationEvent::MakeText("tial"));
		Model.Pump();
		Report("streaming across separate pumps (chunk 2)",
				Model.PendingReply() == "partial" && Model.IsBusy());
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		Stream->Enqueue(FConversationEvent::MakeText("hi"))
				.Enqueue(FConversationEvent::Audio())
				.Enqueue(FConversationEvent::Audio())
				.Enqueue(FConversationEvent::Complete());
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		Model.Send(*World.Session, "hi");
		Model.Pump();
		Report("audio chunks counted, not played",
				Model.AudioChunkCount() == 2 && Model.State() == ETesterState::Idle);
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		Stream->Enqueue(FConversationEvent::MakeText("half a rep"))
				.Enqueue(FConversationEvent::Failed("model crashed"));
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		Model.Send(*World.Session, "hi");
		Model.Pump();
		Report("error event discards the partial + sets error",
				Model.State() == ETesterState::Error && Model.Error() == "model crashed" &&
						Model.PendingReply().empty() && Model.Transcript().size() == 1 && Disposed);
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		FFakeConversationStream* Raw = Stream.get();
		Raw->Enqueue(FConversationEvent::MakeText("start"));
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		Model.Send(*World.Session, "hi");

		Raw->bClosed = true; // transport died mid-reply, no terminal event
		Model.Pump();
		Report("premature close becomes error",
				Model.State() == ETesterState::Error &&
						Model.Error().find("closed before") != std::string::npos && Disposed);
	}
}

// --- Multi-turn / switching / teardown ---------------------------------------
void TestMultiTurnAndTeardown() {
	std::printf("\n== multi-turn / switching / teardown ==\n");

	{
		bool D1 = false, D2 = false;
		auto S1 = MakeStream(&D1);
		S1->Enqueue(FConversationEvent::MakeText("Hi!")).Enqueue(FConversationEvent::Complete());
		auto S2 = MakeStream(&D2);
		S2->Enqueue(FConversationEvent::MakeText("Bye!")).Enqueue(FConversationEvent::Complete());
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(S1)).Enqueue(std::move(S2));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);

		Model.Send(*World.Session, "hello");
		Model.Pump();
		Model.Send(*World.Session, "goodbye");
		Model.Pump();

		Report("two turns share one session id, transcript grows to 4",
				Client.OpenCount == 2 && !Client.SessionIds[0].empty() &&
						Client.SessionIds[1] == Client.SessionIds[0] && Model.Transcript().size() == 4);
	}

	{
		bool D1 = false, D2 = false;
		auto S1 = MakeStream(&D1);
		S1->Enqueue(FConversationEvent::MakeText("Hi!")).Enqueue(FConversationEvent::Complete());
		auto S2 = MakeStream(&D2);
		S2->Enqueue(FConversationEvent::MakeText("Yo!")).Enqueue(FConversationEvent::Complete());
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(S1)).Enqueue(std::move(S2));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World, "c1");

		Model.Send(*World.Session, "to alice");
		Model.Pump();
		const std::string Sid1 = Model.SessionId();
		const bool bTwoTurns = Model.Transcript().size() == 2;

		Model.SelectCharacter("c2");
		const bool bReset = Model.Transcript().empty() && Model.SessionId().empty();

		Model.Send(*World.Session, "to bob");
		Model.Pump();
		Report("switching characters resets the conversation + new session id",
				bTwoTurns && bReset && Client.LastCharacterId == "c2" &&
						Client.SessionIds[1] != Sid1 && !Client.SessionIds[1].empty());
	}

	{
		bool Disposed = false;
		auto Stream = MakeStream(&Disposed);
		Stream->Enqueue(FConversationEvent::MakeText("mid"));
		FScriptedConversationClient Client;
		Client.Enqueue(std::move(Stream));
		FConversationTesterModel Model(&Client);
		FAuthedWorld World;
		LoadedAndSelected(Model, World);
		Model.Send(*World.Session, "hi");
		Model.Pump();

		// The window's teardown (domain reload / editor shutdown) calls Dispose().
		Model.Dispose();
		Report("dispose disposes the stream (domain-reload safety)", Disposed);
	}

	{
		// An id not in the loaded list is ignored (no reset, no selection).
		FConversationTesterModel Model;
		FAuthedWorld World;
		Model.LoadCharacters(*World.Session, "w1");
		Model.SelectCharacter("nope");
		Report("selecting an unknown character id is ignored",
				Model.SelectedCharacterId().empty() && Model.SelectedCharacter() == nullptr);
	}
}

} // namespace

int main() {
	std::printf("conversation-tester host tests (US-XE4)\n");
	TestStaticParsing();
	TestCharacterLoad();
	TestSendGuards();
	TestLifecycle();
	TestMultiTurnAndTeardown();
	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
