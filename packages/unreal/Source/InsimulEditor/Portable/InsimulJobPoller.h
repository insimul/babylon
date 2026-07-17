// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulJobPoller.h — generation-job polling fallback + leak-free teardown
// (US-XE3).
//
// When the editor can't hold an SSE stream open, the Generation Console falls back
// to POLLING getGenerationJob on an interval. This is that poller — the piece that
// owns TIMERS and IN-FLIGHT REQUESTS, the exact things that leak across an editor
// domain reload / shutdown if not torn down. It is written to the story's
// editor-safety criterion ("no leaked tickers after shutdown"):
//
//   - Dispose() clears any pending timer AND flips a disposed flag so a fetch
//     callback that returns AFTER dispose is DROPPED (no OnUpdate fires, no next
//     poll is scheduled). So the window's teardown can dispose the poller with the
//     guarantee that nothing runs afterward — no orphaned timer, no zombie request.
//   - Polling stops on its own once a terminal (Completed/Failed) event arrives.
//   - One poll is in flight at a time (the next is scheduled only after the current
//     returns), so Dispose can never leave more than a single timer or request out.
//
// Both the timer seam (IScheduler) and the request seam (FJobFetch) are injected,
// so the whole lifecycle is host-testable with no real clock or HTTP
// (test_generation_console.cpp). The production stream
// (Private/Connect/InsimulHttpJobStream) backs IScheduler with FTimerManager and
// FJobFetch with an FHttpModule request, and wraps this poller in FPollingJobStream
// (below) to expose it to the view-model as an IJobStream.
//
// This is the Unreal mirror of packages/core/src/editor/job-poller.ts.
//
// Unreal-Engine-free on purpose (std lib only).

#pragma once

#include <functional>
#include <memory>
#include <queue>

#include "InsimulGenerationConsoleModel.h" // FJobEvent

namespace insimul {

/**
 * The timer seam. Real editors back it with the engine's timer manager; tests fake
 * it with a manually-fired clock. SetTimer returns an opaque, non-zero handle for
 * ClearTimer.
 */
class IScheduler {
public:
	virtual ~IScheduler() = default;
	/** Schedule Fn after DelayMs; return a non-zero handle for ClearTimer. */
	virtual int SetTimer(std::function<void()> Fn, int DelayMs) = 0;
	/** Cancel a scheduled timer by its handle. */
	virtual void ClearTimer(int Handle) = 0;
};

/**
 * The request seam: perform one poll and deliver the parsed event via OnDone —
 * bHas=false signals a transient miss / parse failure (the poller keeps going).
 * Callback-based so a real transport can fire it asynchronously and tests can fire
 * it late (after Dispose) to prove the drop.
 */
using FJobFetchDone = std::function<void(bool /*bHas*/, const FJobEvent&)>;
using FJobFetch = std::function<void(FJobFetchDone)>;

/** Called with each fresh event the poll returns (never after Dispose). */
using FJobUpdate = std::function<void(const FJobEvent&)>;

/** Construction options for FJobPoller. */
struct FJobPollerOptions {
	FJobFetch FetchJob;
	FJobUpdate OnUpdate;
	/** Poll interval in ms (default 1000). */
	int IntervalMs = 1000;
	/** The timer seam (required — no default scheduler outside the engine). */
	IScheduler* Scheduler = nullptr;
	/** Hard cap on polls (safety valve; default 600 ~= 10 min at 1 s). */
	int MaxPolls = 600;
};

/**
 * Polls a generation job to completion, with a clean teardown. Dispose is safe to
 * call multiple times and from inside a fetch callback.
 */
class FJobPoller {
public:
	explicit FJobPoller(const FJobPollerOptions& Options);

	/** True once Dispose has run — nothing fires afterward. */
	bool Disposed() const { return bDisposed; }
	/** Number of polls issued so far (in-flight or complete). */
	int PollCount() const { return PollCountValue; }
	/** True while a timer for the next poll is pending. */
	bool HasPendingTimer() const { return TimerHandle != 0; }

	/** Begin polling immediately. Idempotent; a no-op after Dispose. */
	void Start();

	/**
	 * Tear the poller down: cancel the pending timer and drop any in-flight
	 * response. Safe to call multiple times and from any callback.
	 */
	void Dispose();

private:
	void Poll();
	void ScheduleNext();

	FJobFetch FetchJob;
	FJobUpdate OnUpdate;
	int IntervalMs;
	IScheduler* Scheduler;
	int MaxPolls;

	int TimerHandle = 0; // 0 == no pending timer
	bool bDisposed = false;
	bool bStarted = false;
	int PollCountValue = 0;
};

/**
 * The production-shaped IJobStream: an FJobPoller buffering each polled event for
 * the view-model to drain in Pump(). Host-testable end-to-end (poller + buffer +
 * model) over a fake scheduler + fetch. Destruction disposes the poller (cancels
 * the in-flight poll + clears the timer) — this is what the model's DisposeStream
 * triggers, giving the leak-free teardown.
 */
class FPollingJobStream : public IJobStream {
public:
	FPollingJobStream(FJobFetch FetchJob, IScheduler* Scheduler, int IntervalMs = 1000,
			int MaxPolls = 600);

	bool TryDequeue(FJobEvent& OutEvent) override;
	bool IsClosed() const override { return bClosed; }

private:
	std::queue<FJobEvent> Buffer;
	bool bClosed = false;
	std::unique_ptr<FJobPoller> Poller;
};

} // namespace insimul
