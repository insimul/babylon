// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSession.h — the in-editor session + token lifecycle (US-XE1).
//
// The single authenticated-client owner every editor panel (World Browser,
// Generation Console, Conversation Tester) shares. It owns the base URL + token
// seam and drives the token lifecycle over an INJECTED transport, so it is fully
// host-testable headless against canned responses with no real HTTP. This is the
// Unreal mirror of packages/core/src/editor/editor-session.ts (the engine-agnostic
// contract), the Unity InsimulEditorSession.cs, and the Godot
// insimul_editor_session.gd.
//
// Token lifecycle (all enforced + host-tested):
//   - Login(token): store the token, verify it against the server. On 2xx keep it;
//     on 401/403 CLEAR it (an invalid credential is never left persisted).
//   - AuthenticatedRequest: any authenticated call that returns 401/403 clears the
//     token and raises NeedsReauth — the re-auth-prompt state panels observe to
//     surface a "re-authenticate" affordance. A successful login clears NeedsReauth.
//
// Unreal-Engine-free on purpose (std lib only): no CoreMinimal.h, no FString.
// The UE-coupled transport/secret seams (Private/Connect/*) sit ON TOP of these
// pure interfaces.

#pragma once

#include <functional>
#include <map>
#include <string>

namespace insimul {

/** A resolved request the transport must perform. */
struct FEditorRequest {
	std::string OperationId;
	std::string Method;
	/** Full URL: base URL + the operation's path template. */
	std::string Url;
	std::map<std::string, std::string> Headers;
	std::string Body;
};

/** A transport response: the HTTP status and (optionally) the raw body text. */
struct FEditorResponse {
	int Status = 0;
	std::string Body;

	FEditorResponse() = default;
	FEditorResponse(int InStatus, std::string InBody)
		: Status(InStatus), Body(std::move(InBody)) {}
};

using FTransportCallback = std::function<void(const FEditorResponse&)>;

/** The request seam. Performs Req and invokes OnDone with the response. */
class IEditorTransport {
public:
	virtual ~IEditorTransport() = default;
	virtual void Request(const FEditorRequest& Req, FTransportCallback OnDone) = 0;
};

/**
 * The secret seam: where the auth bearer token is persisted. Backed in production
 * by the editor's PER-USER, NON-COMMITTED store (GEditorPerProjectIni via
 * GConfig — see Private/Connect/InsimulEditorSecretStore), so the token never
 * lands in a committed asset/config. An in-memory default ships for tests.
 */
class IEditorSecretStore {
public:
	virtual ~IEditorSecretStore() = default;
	virtual std::string GetToken() const = 0;
	virtual void SetToken(const std::string& Token) = 0;
	virtual void ClearToken() = 0;
};

/** Default IEditorSecretStore: an in-process token holder (tests + fallback). */
class FInMemorySecretStore : public IEditorSecretStore {
public:
	std::string GetToken() const override { return Token; }
	void SetToken(const std::string& InToken) override { Token = InToken; }
	void ClearToken() override { Token.clear(); }

private:
	std::string Token;
};

/** Outcome of a session operation (login / verify / health / authenticated call). */
struct FSessionResult {
	/** True when the server accepted the request (2xx). */
	bool bOk = false;
	int Status = 0;
	/** The raw response body, when present. */
	std::string Body;
	/** For health/verify: whether a boolean "healthy" field was parsed at all. */
	bool bHasHealthy = false;
	/** The server's self-reported liveness, valid only when bHasHealthy is true. */
	bool bHealthy = false;
	/** A human-readable failure reason when bOk is false. */
	std::string Error;
};

using FSessionCallback = std::function<void(const FSessionResult&)>;

/**
 * The editor session. Holds the base URL + token seam and drives the token
 * lifecycle over the injected transport. When Secrets is null an in-process store
 * is used (tests). The session never persists the token itself — it hands it to
 * the seam — so "secrets never touch a committed asset" is enforced at the seam.
 */
class FEditorSession {
public:
	FEditorSession(const std::string& InBaseUrl, IEditorTransport* InTransport,
			IEditorSecretStore* InSecrets = nullptr);

	/** The base URL with any trailing slash trimmed. */
	const std::string& BaseUrl() const { return BaseUrlValue; }

	/** The current auth token (empty when unauthenticated). */
	std::string Token() const { return Secrets->GetToken(); }

	/** True once a token has been stored (does not imply the server accepts it). */
	bool IsAuthenticated() const { return !Secrets->GetToken().empty(); }

	/**
	 * Set when an authenticated call returns 401/403 (the token was cleared).
	 * Panels read this to show a re-authenticate prompt; a successful login clears it.
	 */
	bool NeedsReauth() const { return bNeedsReauth; }

	/**
	 * Store Token and verify it against the server. On a 2xx the token is kept and
	 * NeedsReauth is cleared; on a 401/403 the token is CLEARED.
	 */
	void Login(const std::string& InToken, FSessionCallback OnDone);

	/** Clear the stored token. */
	void Logout();

	/** Verify the current token by probing the health endpoint. */
	void Verify(FSessionCallback OnDone) { Health(std::move(OnDone)); }

	/** Probe server liveness via the healthCheck operation. */
	void Health(FSessionCallback OnDone);

	/**
	 * Dispatch an authenticated v1 operation with the current token + optional JSON
	 * body. A 401/403 clears the token and raises NeedsReauth before the result is
	 * delivered — so a stale token is never left persisted. Returns without a
	 * request (bOk=false) for an unknown operation or when there is no credential.
	 */
	void AuthenticatedRequest(const std::string& OperationId, const std::string& Body,
			FSessionCallback OnDone);

	/**
	 * Build the request for OperationId from the operation table: full URL, verb,
	 * JSON content type, and a bearer Authorization header when a token is present.
	 * Returns false (OutReq untouched) if the operation is not in the v1 table.
	 */
	bool BuildRequest(const std::string& OperationId, const std::string& Body,
			FEditorRequest& OutReq) const;

private:
	static bool IsOk(int Status) { return Status >= 200 && Status < 300; }
	static FSessionResult InterpretHealth(const FEditorResponse& Res);
	/** Extract a boolean "healthy" field from a JSON body; OutHealthy set on match. */
	static bool ParseHealthy(const std::string& Body, bool& OutHealthy);

	IEditorTransport* Transport;
	IEditorSecretStore* Secrets;
	FInMemorySecretStore DefaultSecrets;
	std::string BaseUrlValue;
	bool bNeedsReauth = false;
};

} // namespace insimul
