// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulHttpJobStream.h — the production job-progress stream the Generation
// Console view-model drives (US-XE3).
//
//   - FInsimulHttpJobStreamFactory — opens a poll stream for a started job's id.
//   - FInsimulHttpJobStream        — POLLS the getGenerationJob status endpoint on
//     a fixed interval off FTimerManager, buffering each parsed progress event for
//     the model to drain in Pump(). One non-blocking FHttpModule request at a time;
//     disposing it cancels any in-flight request AND clears the poll timer.
//
// Streaming choice = POLLING (not edit-mode SSE): a poll survives a domain reload
// (Hot Reload / Live Coding / PIE enter) because the window re-opens the stream for
// the same job id when the tab is reconstructed, whereas a streaming HTTP response
// would have to be re-established after every reload. See the
// InsimulGenerationConsoleModel header for the full rationale.
//
// All the leak-free-teardown logic lives in the UE-FREE, host-tested
// Portable/InsimulJobPoller (FJobPoller + FPollingJobStream): this file only
// supplies the two engine seams the poller injects — an IScheduler backed by
// FTimerManager and an FJobFetch backed by FHttpModule (through the shared
// FEditorSession so a 401/403 re-arms re-auth). It is UE-coupled and therefore
// syntax-gated only; the poll/teardown decision logic is host-tested
// (test_generation_console.cpp).

#pragma once

#include "CoreMinimal.h"

#include <memory>

#include "../../Portable/InsimulGenerationConsoleModel.h" // IJobStream(Factory)
#include "../../Portable/InsimulJobPoller.h"               // IScheduler / FPollingJobStream

/**
 * An insimul::IScheduler backed by the editor's FTimerManager. ClearTimer cancels a
 * pending fire, so disposing the poller leaves no orphaned ticker across a reload.
 */
class FInsimulTimerScheduler : public insimul::IScheduler
{
public:
	int SetTimer(std::function<void()> Fn, int DelayMs) override;
	void ClearTimer(int Handle) override;

private:
	/** Handles are dense small ints mapped to live FTimerHandles. */
	TMap<int32, FTimerHandle> Handles;
	int32 NextHandle = 1;
};

/** Opens the production poll stream for a job id. */
class FInsimulHttpJobStreamFactory : public insimul::IJobStreamFactory
{
public:
	explicit FInsimulHttpJobStreamFactory(int32 InIntervalMs = 1000)
		: IntervalMs(InIntervalMs) {}

	std::unique_ptr<insimul::IJobStream> Open(insimul::FEditorSession& Session,
			const std::string& JobId) override;

private:
	int32 IntervalMs;
};

/**
 * The production job-progress stream: an FPollingJobStream (host-tested poller +
 * buffer) whose scheduler is FTimerManager-backed and whose fetch issues one
 * getGenerationJob request per interval through the shared session. Owns the
 * scheduler for the poller's lifetime; destruction disposes the poller (cancels the
 * in-flight poll + clears the timer).
 */
class FInsimulHttpJobStream : public insimul::IJobStream
{
public:
	FInsimulHttpJobStream(insimul::FEditorSession& Session, const std::string& JobId, int32 IntervalMs);

	bool TryDequeue(insimul::FJobEvent& OutEvent) override { return Inner->TryDequeue(OutEvent); }
	bool IsClosed() const override { return Inner->IsClosed(); }

private:
	std::unique_ptr<FInsimulTimerScheduler> Scheduler;
	std::unique_ptr<insimul::FPollingJobStream> Inner;
};
