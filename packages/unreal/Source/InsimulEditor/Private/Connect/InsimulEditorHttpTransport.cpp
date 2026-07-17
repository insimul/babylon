// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEditorHttpTransport.cpp — production request seam body (US-XE1). Syntax-
// gated only (FHttpModule). See the header.

#include "InsimulEditorHttpTransport.h"

#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

void FInsimulEditorHttpTransport::Request(const insimul::FEditorRequest& Req,
		insimul::FTransportCallback OnDone)
{
	const TSharedRef<IHttpRequest, ESPMode::ThreadSafe> HttpRequest =
			FHttpModule::Get().CreateRequest();

	HttpRequest->SetURL(UTF8_TO_TCHAR(Req.Url.c_str()));
	HttpRequest->SetVerb(UTF8_TO_TCHAR(Req.Method.c_str()));
	for (const auto& Header : Req.Headers)
	{
		HttpRequest->SetHeader(UTF8_TO_TCHAR(Header.first.c_str()),
				UTF8_TO_TCHAR(Header.second.c_str()));
	}
	if (!Req.Body.empty())
	{
		HttpRequest->SetContentAsString(UTF8_TO_TCHAR(Req.Body.c_str()));
	}

	HttpRequest->OnProcessRequestComplete().BindLambda(
			[OnDone](FHttpRequestPtr /*Request*/, FHttpResponsePtr Response, bool bConnectedSuccessfully)
			{
				// A transport failure (no response) maps to status 0 — the pure
				// session treats it as "server unreachable", matching the mocked
				// transport's default response in the host tests.
				int32 Status = 0;
				std::string Body;
				if (bConnectedSuccessfully && Response.IsValid())
				{
					Status = Response->GetResponseCode();
					Body = std::string(TCHAR_TO_UTF8(*Response->GetContentAsString()));
				}
				OnDone(insimul::FEditorResponse(Status, Body));
			});

	HttpRequest->ProcessRequest();
}
