// Copyright 2024 Insimul. All Rights Reserved.
//
// test_editor_session.cpp — host gate for the in-editor v1 client + session logic
// (US-XE1). Builds under a plain clang toolchain (no Unreal Engine, no UBT; see
// tools/verify-unreal/run-connect-tests.sh) and proves two things — the same
// cases the Unity leg (EditorSessionTests) and the Godot leg (operations.test.ts +
// insimul_editor_session.gd) prove, so the three engines' editor clients can never
// diverge:
//
//   1. OPERATION-TABLE CONFORMANCE — walks the generated
//      packages/core/openapi/operations.json (path passed as argv[1]) and asserts
//      the portable table (InsimulV1Operations) matches it verbatim: every spec op
//      resolves with the same method + path, no op is missing, none is extra, and
//      every USED operation id resolves.
//   2. SESSION LIFECYCLE over a mocked transport — login -> token -> authed call ->
//      401 -> re-auth-prompt, plus health parse + request building.
//
// The UE-coupled seams (Private/Connect: FHttpModule transport, GConfig secret
// store, the session service) sit ON TOP of this pure core and are syntax-gated
// only — a live editor is required to run them.

#include "../Portable/InsimulEditorSession.h"
#include "../Portable/InsimulV1Operations.h"
#include "../../InsimulRuntime/Portable/InsimulJson.h"

#include <cstdio>
#include <fstream>
#include <map>
#include <queue>
#include <sstream>
#include <string>
#include <vector>

using namespace insimul;

namespace {

int g_pass = 0;
int g_fail = 0;

void Report(const std::string& Name, bool bOk, const std::string& Detail = "") {
	std::printf("  %s  %-56s%s%s\n", bOk ? "PASS" : "FAIL", Name.c_str(),
			Detail.empty() ? "" : "  ", Detail.c_str());
	if (bOk) {
		g_pass++;
	} else {
		g_fail++;
	}
}

std::string ReadFile(const std::string& Path) {
	std::ifstream In(Path, std::ios::binary);
	if (!In) {
		throw std::string("cannot open ") + Path;
	}
	std::ostringstream SS;
	SS << In.rdbuf();
	return SS.str();
}

// --- A transport that replays canned responses FIFO and records every request. --
class FFakeTransport : public IEditorTransport {
public:
	std::vector<FEditorRequest> Sent;

	FFakeTransport& Enqueue(int Status, const std::string& Body = std::string()) {
		Responses.push(FEditorResponse(Status, Body));
		return *this;
	}

	void Request(const FEditorRequest& Req, FTransportCallback OnDone) override {
		Sent.push_back(Req);
		FEditorResponse Res(0, std::string());
		if (!Responses.empty()) {
			Res = Responses.front();
			Responses.pop();
		}
		OnDone(Res);
	}

private:
	std::queue<FEditorResponse> Responses;
};

/** A secret store that counts clears so tests can assert the token was wiped. */
class FCountingSecretStore : public IEditorSecretStore {
public:
	int Clears = 0;
	std::string GetToken() const override { return Tok; }
	void SetToken(const std::string& InTok) override { Tok = InTok; }
	void ClearToken() override { Tok.clear(); ++Clears; }

private:
	std::string Tok;
};

// ---------------------------------------------------------------------------
// 1. Operation-table conformance vs the generated operations.json.
// ---------------------------------------------------------------------------
void TestOperationTableConformance(const std::string& OperationsJsonPath) {
	std::printf("\n== operation-table conformance (vs operations.json) ==\n");

	FJsonParseResult Parsed;
	try {
		Parsed = ParseJson(ReadFile(OperationsJsonPath));
	} catch (const std::string& Err) {
		Report("read operations.json", false, Err);
		return;
	}
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		Report("parse operations.json", false, Parsed.Error);
		return;
	}
	const FJsonValue* Ops = Parsed.Root->Find("operations");
	if (Ops == nullptr || !Ops->IsArray() || Ops->Size() == 0) {
		Report("operations.json has an operations array", false);
		return;
	}

	// Build the spec table { id -> (method, path) } from the JSON.
	std::map<std::string, std::pair<std::string, std::string>> Spec;
	for (const FJsonValuePtr& Item : Ops->ArrayItems) {
		if (!Item || !Item->IsObject()) {
			continue;
		}
		const std::string Id = Item->GetString("operationId");
		Spec[Id] = { Item->GetString("method"), Item->GetString("path") };
	}
	Report("operations.json parsed with entries", !Spec.empty(),
			std::to_string(Spec.size()) + " ops");

	// Every spec op resolves in the portable table with matching method + path.
	bool bAllSpecMatch = true;
	for (const auto& Entry : Spec) {
		const FV1Operation Op = ResolveOperation(Entry.first);
		const bool bMatch = Op.IsValid() && Op.Method == Entry.second.first &&
				Op.Path == Entry.second.second;
		if (!bMatch) {
			bAllSpecMatch = false;
			Report(std::string("spec op resolves: ") + Entry.first, false,
					Op.IsValid() ? (Op.Method + " " + Op.Path + " != " +
							Entry.second.first + " " + Entry.second.second)
							: "not in table");
		}
	}
	Report("every operations.json op resolves with matching method+path", bAllSpecMatch);

	// No extra op in the portable table that the spec does not have (bidirectional).
	bool bNoExtra = true;
	for (const FV1Operation& Op : AllOperations()) {
		if (Spec.find(Op.OperationId) == Spec.end()) {
			bNoExtra = false;
			Report(std::string("portable table has extra op: ") + Op.OperationId, false);
		}
	}
	Report("portable table has no op missing from operations.json", bNoExtra);
	Report("table sizes match", AllOperations().size() == Spec.size(),
			std::to_string(AllOperations().size()) + " vs " + std::to_string(Spec.size()));

	// Every USED operation id resolves.
	bool bAllUsedResolve = true;
	for (const std::string& Id : UsedOperationIds()) {
		if (!ResolveOperation(Id).IsValid()) {
			bAllUsedResolve = false;
			Report(std::string("used op resolves: ") + Id, false, "not in table");
		}
	}
	Report("every used operation id resolves", bAllUsedResolve);

	// Unknown id is invalid.
	Report("unknown operation is invalid", !ResolveOperation("noSuchOperation").IsValid());

	// Spot-check healthCheck (the op the session probes).
	const FV1Operation Health = ResolveOperation("healthCheck");
	Report("healthCheck = GET /api/conversation/health",
			Health.IsValid() && Health.Method == "GET" &&
					Health.Path == "/api/conversation/health");
}

// ---------------------------------------------------------------------------
// 2. Request building.
// ---------------------------------------------------------------------------
void TestRequestBuilding() {
	std::printf("\n== request building ==\n");

	FFakeTransport Transport;
	FCountingSecretStore Secrets;
	Secrets.SetToken("tok");
	FEditorSession Session("http://localhost:8080/", &Transport, &Secrets);

	FEditorRequest Req;
	const bool bBuilt = Session.BuildRequest("healthCheck", std::string(), Req);
	Report("build known op returns true", bBuilt);
	Report("base URL joined (trailing slash trimmed)",
			Req.Url == "http://localhost:8080/api/conversation/health", Req.Url);
	Report("bearer header carried", Req.Headers["Authorization"] == "Bearer tok");
	Report("content-type is json", Req.Headers["Content-Type"] == "application/json");

	FEditorRequest Unknown;
	Report("unknown op returns false",
			!Session.BuildRequest("noSuchOp", std::string(), Unknown));

	// No token -> no Authorization header.
	FFakeTransport T2;
	FEditorSession Anon("http://localhost:8080", &T2);
	FEditorRequest AnonReq;
	Anon.BuildRequest("healthCheck", std::string(), AnonReq);
	Report("omits auth header when no token",
			AnonReq.Headers.find("Authorization") == AnonReq.Headers.end());
}

// ---------------------------------------------------------------------------
// 3. Health / verify.
// ---------------------------------------------------------------------------
void TestHealth() {
	std::printf("\n== health / verify ==\n");

	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}");
		FEditorSession Session("http://localhost:8080", &Transport);
		FSessionResult Result;
		Session.Health([&Result](const FSessionResult& R) { Result = R; });
		Report("200 reports ok", Result.bOk);
		Report("parses healthy:true", Result.bHasHealthy && Result.bHealthy);
	}
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": false}");
		FEditorSession Session("http://localhost:8080", &Transport);
		FSessionResult Result;
		Session.Health([&Result](const FSessionResult& R) { Result = R; });
		Report("parses healthy:false", Result.bOk && Result.bHasHealthy && !Result.bHealthy);
	}
	{
		FFakeTransport Transport;
		Transport.Enqueue(500, "boom");
		FEditorSession Session("http://localhost:8080", &Transport);
		FSessionResult Result;
		Session.Health([&Result](const FSessionResult& R) { Result = R; });
		Report("500 reports failure with reason",
				!Result.bOk && Result.Status == 500 && Result.Error == "server returned 500");
	}
}

// ---------------------------------------------------------------------------
// 4. Login lifecycle: login -> token -> authed call -> 401 -> re-auth.
// ---------------------------------------------------------------------------
void TestLoginLifecycle() {
	std::printf("\n== login lifecycle (auth / 401 re-auth) ==\n");

	// Login success keeps token + clears re-auth.
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}");
		FEditorSession Session("http://localhost:8080", &Transport);
		FSessionResult Result;
		Session.Login("good-token", [&Result](const FSessionResult& R) { Result = R; });
		Report("login 200 ok", Result.bOk);
		Report("login keeps token", Session.IsAuthenticated() && Session.Token() == "good-token");
		Report("login clears NeedsReauth", !Session.NeedsReauth());
	}

	// Login 401 clears token + leaves unauthenticated.
	{
		FFakeTransport Transport;
		Transport.Enqueue(401, "unauthorized");
		FCountingSecretStore Secrets;
		FEditorSession Session("http://localhost:8080", &Transport, &Secrets);
		FSessionResult Result;
		Session.Login("bad-token", [&Result](const FSessionResult& R) { Result = R; });
		Report("login 401 not ok", !Result.bOk && Result.Status == 401);
		Report("login 401 clears token", !Session.IsAuthenticated() && Session.Token().empty());
		Report("login 401 called ClearToken", Secrets.Clears > 0);
	}

	// Authenticated request sends bearer + returns body.
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}"); // login verify
		Transport.Enqueue(200, "{\"worlds\": []}");    // the authed call
		FEditorSession Session("http://localhost:8080", &Transport);
		Session.Login("tok", [](const FSessionResult&) {});
		FSessionResult Result;
		Session.AuthenticatedRequest("listWorlds", std::string(),
				[&Result](const FSessionResult& R) { Result = R; });
		Report("authed request ok", Result.bOk);
		Report("authed request returns body", Result.Body == "{\"worlds\": []}");
		const FEditorRequest& Last = Transport.Sent.back();
		Report("authed request carries op + bearer",
				Last.OperationId == "listWorlds" && Last.Headers.at("Authorization") == "Bearer tok");
	}

	// Authenticated 401 raises re-auth + clears token.
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}"); // login verify OK
		Transport.Enqueue(401, "expired");             // token later rejected
		FEditorSession Session("http://localhost:8080", &Transport);
		Session.Login("tok", [](const FSessionResult&) {});
		FSessionResult Result;
		Session.AuthenticatedRequest("listWorlds", std::string(),
				[&Result](const FSessionResult& R) { Result = R; });
		Report("authed 401 not ok", !Result.bOk && Result.Status == 401);
		Report("authed 401 raises NeedsReauth", Session.NeedsReauth());
		Report("authed 401 clears stale token", !Session.IsAuthenticated());
	}

	// Authenticated request without a token does not send.
	{
		FFakeTransport Transport;
		FEditorSession Session("http://localhost:8080", &Transport);
		FSessionResult Result;
		Session.AuthenticatedRequest("listWorlds", std::string(),
				[&Result](const FSessionResult& R) { Result = R; });
		Report("no-token authed request refused", !Result.bOk && Result.Error == "not authenticated");
		Report("no-token authed request sends nothing", Transport.Sent.empty());
	}

	// Second login recovers from re-auth state.
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}"); // first login
		Transport.Enqueue(401, "expired");             // authed call fails
		Transport.Enqueue(200, "{\"healthy\": true}"); // re-login succeeds
		FEditorSession Session("http://localhost:8080", &Transport);
		Session.Login("tok", [](const FSessionResult&) {});
		Session.AuthenticatedRequest("listWorlds", std::string(), [](const FSessionResult&) {});
		Report("re-auth pending before re-login", Session.NeedsReauth());
		Session.Login("fresh-tok", [](const FSessionResult&) {});
		Report("re-login clears NeedsReauth", !Session.NeedsReauth());
		Report("re-login stores fresh token",
				Session.IsAuthenticated() && Session.Token() == "fresh-tok");
	}

	// Logout clears token.
	{
		FFakeTransport Transport;
		Transport.Enqueue(200, "{\"healthy\": true}");
		FEditorSession Session("http://localhost:8080", &Transport);
		Session.Login("tok", [](const FSessionResult&) {});
		Report("authenticated before logout", Session.IsAuthenticated());
		Session.Logout();
		Report("logout clears token", !Session.IsAuthenticated());
	}
}

} // namespace

int main(int argc, char** argv) {
	if (argc < 2) {
		std::fprintf(stderr,
				"usage: %s <path-to-operations.json>\n", argv[0]);
		return 2;
	}
	const std::string OperationsJsonPath = argv[1];

	std::printf("editor-session host tests (US-XE1)\n");
	TestOperationTableConformance(OperationsJsonPath);
	TestRequestBuilding();
	TestHealth();
	TestLoginLifecycle();

	std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
	return g_fail == 0 ? 0 : 1;
}
