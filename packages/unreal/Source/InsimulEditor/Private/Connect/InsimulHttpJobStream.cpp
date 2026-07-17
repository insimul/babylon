// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulHttpJobStream.cpp — production job-progress stream body (US-XE3). Syntax-
// gated only (FTimerManager + FHttpModule). See the header; the poll/teardown
// decision logic lives in the UE-free Portable/InsimulJobPoller and is host-tested.

#include "InsimulHttpJobStream.h"

#include "Editor.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "TimerManager.h"

// ── FInsimulTimerScheduler ─────────────────────────────────────────────────

int FInsimulTimerScheduler::SetTimer(std::function<void()> Fn, int DelayMs)
{
	if (GEditor == nullptr)
	{
		return 0;
	}
	const int32 Handle = NextHandle++;
	FTimerHandle TimerHandle;
	GEditor->GetTimerManager()->SetTimer(
			TimerHandle,
			FTimerDelegate::CreateLambda([Fn]() { Fn(); }),
			FMath::Max(DelayMs, 1) / 1000.0f,
			/*bLoop*/ false);
	Handles.Add(Handle, TimerHandle);
	return Handle;
}

void FInsimulTimerScheduler::ClearTimer(int Handle)
{
	FTimerHandle* Found = Handles.Find(Handle);
	if (Found != nullptr && GEditor != nullptr)
	{
		GEditor->GetTimerManager()->ClearTimer(*Found);
		Handles.Remove(Handle);
	}
}

// ── FInsimulHttpJobStreamFactory ─────────────────────────────────────────────

std::unique_ptr<insimul::IJobStream> FInsimulHttpJobStreamFactory::Open(
		insimul::FEditorSession& Session, const std::string& JobId)
{
	if (JobId.empty())
	{
		return nullptr;
	}
	return std::unique_ptr<insimul::IJobStream>(
			new FInsimulHttpJobStream(Session, JobId, IntervalMs));
}

// ── FInsimulHttpJobStream ─────────────────────────────────────────────────────

FInsimulHttpJobStream::FInsimulHttpJobStream(insimul::FEditorSession& Session,
		const std::string& JobId, int32 IntervalMs)
	: Scheduler(new FInsimulTimerScheduler())
{
	// The fetch seam: one non-blocking getGenerationJob poll through the shared
	// session (so a 401/403 clears the token + arms NeedsReauth), parsed into a
	// job event. A transport failure / non-2xx surfaces as a terminal Failed so the
	// poller stops.
	insimul::FJobFetch Fetch = [&Session, JobId](insimul::FJobFetchDone Done)
	{
		const std::string Body = "{\"jobId\":" + std::string("\"") + JobId + "\"}";
		Session.AuthenticatedRequest("getGenerationJob", Body,
				[Done](const insimul::FSessionResult& Res)
				{
					if (!Res.bOk)
					{
						Done(true, insimul::FJobEvent::MakeFailed(
								Res.Error.empty() ? "job status poll failed" : Res.Error));
						return;
					}
					Done(true, insimul::FGenerationConsoleModel::ParseJobEvent(Res.Body));
				});
	};

	Inner.reset(new insimul::FPollingJobStream(Fetch, Scheduler.get(), IntervalMs));
}
