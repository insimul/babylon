// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulJobPoller.cpp — the polling fallback + leak-free teardown body (US-XE3).
// See the header for the contract; this file is Unreal-Engine-free (std lib only)
// so the whole timer/teardown lifecycle host-tests headless over a fake scheduler
// + fetch (test_generation_console.cpp). Mirror of packages/core/src/editor/
// job-poller.ts.

#include "InsimulJobPoller.h"

namespace insimul {

// ── FJobPoller ─────────────────────────────────────────────────────────────────

FJobPoller::FJobPoller(const FJobPollerOptions& Options)
	: FetchJob(Options.FetchJob)
	, OnUpdate(Options.OnUpdate)
	, IntervalMs(Options.IntervalMs)
	, Scheduler(Options.Scheduler)
	, MaxPolls(Options.MaxPolls) {}

void FJobPoller::Start() {
	if (bStarted || bDisposed) {
		return;
	}
	bStarted = true;
	Poll();
}

void FJobPoller::Poll() {
	if (bDisposed) {
		return;
	}
	PollCountValue += 1;
	FetchJob([this](bool bHas, const FJobEvent& Event) {
		// Drop a response that arrives after teardown — the defining safety rule.
		if (bDisposed) {
			return;
		}
		if (bHas) {
			if (OnUpdate) {
				OnUpdate(Event);
			}
			if (Event.IsTerminal()) {
				Dispose();
				return;
			}
		}
		if (PollCountValue >= MaxPolls) {
			Dispose();
			return;
		}
		ScheduleNext();
	});
}

void FJobPoller::ScheduleNext() {
	if (bDisposed || Scheduler == nullptr) {
		return;
	}
	TimerHandle = Scheduler->SetTimer([this]() {
		TimerHandle = 0;
		Poll();
	}, IntervalMs);
}

void FJobPoller::Dispose() {
	bDisposed = true;
	if (TimerHandle != 0 && Scheduler != nullptr) {
		Scheduler->ClearTimer(TimerHandle);
		TimerHandle = 0;
	}
}

// ── FPollingJobStream ───────────────────────────────────────────────────────────

FPollingJobStream::FPollingJobStream(FJobFetch FetchJob, IScheduler* Scheduler, int IntervalMs,
		int MaxPolls) {
	FJobPollerOptions Options;
	Options.FetchJob = std::move(FetchJob);
	Options.Scheduler = Scheduler;
	Options.IntervalMs = IntervalMs;
	Options.MaxPolls = MaxPolls;
	Options.OnUpdate = [this](const FJobEvent& Event) {
		Buffer.push(Event);
		if (Event.IsTerminal()) {
			bClosed = true;
		}
	};
	Poller.reset(new FJobPoller(Options));
	Poller->Start();
}

bool FPollingJobStream::TryDequeue(FJobEvent& OutEvent) {
	if (Buffer.empty()) {
		return false;
	}
	OutEvent = Buffer.front();
	Buffer.pop();
	// A drained terminal event lets the poller's cap-driven close also surface as
	// IsClosed for the model's premature-close guard; the poller has already
	// self-disposed on a terminal event.
	return true;
}

} // namespace insimul
