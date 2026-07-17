// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorSession.cpp — the session + token-lifecycle body (US-XE1). See the
// header for the contract; this file is Unreal-Engine-free (std lib only) so it
// host-tests headless over a mocked transport.

#include "InsimulEditorSession.h"

#include "InsimulV1Operations.h"

namespace insimul {

namespace {
/** Trim a single kind of trailing char (matches Unity's TrimEnd('/')). */
std::string TrimTrailingSlash(std::string S) {
	while (!S.empty() && S.back() == '/') {
		S.pop_back();
	}
	return S;
}
} // namespace

FEditorSession::FEditorSession(const std::string& InBaseUrl, IEditorTransport* InTransport,
		IEditorSecretStore* InSecrets)
	: Transport(InTransport),
	  Secrets(InSecrets ? InSecrets : &DefaultSecrets),
	  BaseUrlValue(TrimTrailingSlash(InBaseUrl)) {}

bool FEditorSession::BuildRequest(const std::string& OperationId, const std::string& Body,
		FEditorRequest& OutReq) const {
	const FV1Operation Op = ResolveOperation(OperationId);
	if (!Op.IsValid()) {
		return false;
	}
	OutReq = FEditorRequest{};
	OutReq.OperationId = OperationId;
	OutReq.Method = Op.Method;
	OutReq.Url = BaseUrlValue + Op.Path;
	OutReq.Body = Body;
	OutReq.Headers["Content-Type"] = "application/json";
	const std::string Tok = Secrets->GetToken();
	if (!Tok.empty()) {
		OutReq.Headers["Authorization"] = "Bearer " + Tok;
	}
	return true;
}

void FEditorSession::Login(const std::string& InToken, FSessionCallback OnDone) {
	Secrets->SetToken(InToken);
	Verify([this, OnDone](const FSessionResult& Res) {
		if (Res.bOk) {
			bNeedsReauth = false;
		} else if (Res.Status == 401 || Res.Status == 403) {
			Secrets->ClearToken();
		}
		if (OnDone) {
			OnDone(Res);
		}
	});
}

void FEditorSession::Logout() {
	Secrets->ClearToken();
}

void FEditorSession::Health(FSessionCallback OnDone) {
	FEditorRequest Req;
	if (!BuildRequest("healthCheck", std::string(), Req)) {
		FSessionResult R;
		R.Error = "unknown operation: healthCheck";
		if (OnDone) {
			OnDone(R);
		}
		return;
	}
	Transport->Request(Req, [OnDone](const FEditorResponse& Res) {
		if (OnDone) {
			OnDone(InterpretHealth(Res));
		}
	});
}

void FEditorSession::AuthenticatedRequest(const std::string& OperationId, const std::string& Body,
		FSessionCallback OnDone) {
	if (!IsAuthenticated()) {
		FSessionResult R;
		R.Error = "not authenticated";
		if (OnDone) {
			OnDone(R);
		}
		return;
	}
	FEditorRequest Req;
	if (!BuildRequest(OperationId, Body, Req)) {
		FSessionResult R;
		R.Error = "unknown operation: " + OperationId;
		if (OnDone) {
			OnDone(R);
		}
		return;
	}
	Transport->Request(Req, [this, OnDone](const FEditorResponse& Res) {
		FSessionResult R;
		R.bOk = IsOk(Res.Status);
		R.Status = Res.Status;
		R.Body = Res.Body;
		if (!R.bOk && (Res.Status == 401 || Res.Status == 403)) {
			Secrets->ClearToken();
			bNeedsReauth = true;
		}
		if (!R.bOk) {
			R.Error = "server returned " + std::to_string(Res.Status);
		}
		if (OnDone) {
			OnDone(R);
		}
	});
}

FSessionResult FEditorSession::InterpretHealth(const FEditorResponse& Res) {
	FSessionResult R;
	R.Status = Res.Status;
	R.Body = Res.Body;
	if (!IsOk(Res.Status)) {
		R.Error = "server returned " + std::to_string(Res.Status);
		return R;
	}
	R.bOk = true;
	bool Healthy = false;
	if (ParseHealthy(Res.Body, Healthy)) {
		R.bHasHealthy = true;
		R.bHealthy = Healthy;
	}
	return R;
}

bool FEditorSession::ParseHealthy(const std::string& Body, bool& OutHealthy) {
	if (Body.empty()) {
		return false;
	}
	const std::string Key = "\"healthy\"";
	const std::size_t Idx = Body.find(Key);
	if (Idx == std::string::npos) {
		return false;
	}
	const std::size_t Colon = Body.find(':', Idx);
	if (Colon == std::string::npos) {
		return false;
	}
	std::size_t Pos = Colon + 1;
	while (Pos < Body.size() && (Body[Pos] == ' ' || Body[Pos] == '\t' ||
			Body[Pos] == '\r' || Body[Pos] == '\n')) {
		++Pos;
	}
	if (Body.compare(Pos, 4, "true") == 0) {
		OutHealthy = true;
		return true;
	}
	if (Body.compare(Pos, 5, "false") == 0) {
		OutHealthy = false;
		return true;
	}
	return false;
}

} // namespace insimul
