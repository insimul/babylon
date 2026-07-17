// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorHttpTransport.h — the production request seam (US-XE1).
//
// Backs insimul::IEditorTransport with FHttpModule, so the pure session logic
// (insimul::FEditorSession) drives real HTTP in the editor. The request the pure
// core builds (method, URL, headers, body) is copied onto an IHttpRequest and the
// callback is invoked on completion with the status + body — mapping a transport
// failure (no response) to status 0 so the session's health/verify logic treats
// it as "server unreachable" exactly as the mocked transport does in host tests.
//
// UE-coupled (FHttpModule) and therefore syntax-gated only; the pure interface it
// implements is host-tested via FFakeTransport.

#pragma once

#include "CoreMinimal.h"

#include "../../Portable/InsimulEditorSession.h"

/** Performs editor v1 requests over FHttpModule and reports status + body back. */
class FInsimulEditorHttpTransport : public insimul::IEditorTransport
{
public:
	void Request(const insimul::FEditorRequest& Req, insimul::FTransportCallback OnDone) override;
};
