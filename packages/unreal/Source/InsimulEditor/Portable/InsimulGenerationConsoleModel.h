// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulGenerationConsoleModel.h — the Generation Console tab view-model (US-XE3).
//
// The engine-agnostic, UI-FREE heart of the editor's Generation Console: it invokes
// a backend generator (settlement regenerate / character batch / quest generation)
// against the connected world, then advances a job lifecycle state machine
// (Idle -> Starting -> Queued -> Running -> Completed / Failed / Canceled) from
// progress events PULLED off an injected job-progress stream. On completion it
// exposes the entity-count diff (added / updated / removed) and an OffersSync flag
// the window turns into a "Sync IR now…" affordance (which re-runs the World
// Browser import path).
//
// It reaches the backend ONLY via FEditorSession::AuthenticatedRequest (to START
// the job) and reaches progress ONLY through an INJECTED stream seam
// (IJobStreamFactory / IJobStream) — opened for the started job's id, drained one
// event at a time in Pump() (one call per editor tick — no thread, no timer inside
// the model). Both injected, so the whole queued -> progress -> complete/failed ->
// sync-prompt lifecycle plus cancel and premature-close are host-testable headless
// (test_generation_console.cpp) while the UE-coupled poll stream + window are
// syntax-gated only. This is the Unreal mirror of packages/core/src/editor/
// generation-console.ts, the Unity InsimulGenerationConsoleModel.cs (+
// GenerationConsoleTests), and the Godot job_reducer.gd.
//
// ── Streaming choice: POLLING (documented rationale) ─────────────────────────
// Progress is delivered by POLLING the getGenerationJob status endpoint, NOT by an
// in-editor SSE stream over FHttpModule. Edit-mode SSE would need a streaming HTTP
// response held open across every domain reload (a Hot Reload / Live Coding pass or
// a PIE enter tears down module state) — brittle and easy to leak. A poll survives
// a reload because the window simply re-opens the stream for the same job id when
// the tab is reconstructed. The production stream (Private/Connect/
// InsimulHttpJobStream) is an FTimerManager-driven poller (Portable/InsimulJobPoller,
// the host-testable timer abstraction) that issues one FHttpModule request per
// interval and buffers each parsed event for the model to drain in Pump(); the model
// itself holds no timer/thread and is trivially testable.
//
// ── Domain-reload / editor-shutdown safety ───────────────────────────────────
// The window subscribes a tick in its construction and calls model.Dispose() +
// stream teardown when the tab is destroyed. A reload / shutdown fires that path ->
// Dispose() disposes the stream (which cancels any in-flight poll AND clears the
// poll timer via FJobPoller::Dispose), so NO orphaned polling loop survives.
// Cancel() does the same on demand. The leak-free teardown is proven host-side by
// the FJobPoller tests (Portable/InsimulJobPoller).
//
// Unreal-Engine-free on purpose (std lib only): parses via the UE-free InsimulJson,
// exactly like the World Browser view-model.

#pragma once

#include <functional>
#include <memory>
#include <string>

#include "InsimulEditorSession.h"

namespace insimul {

/** The backend generators the console can invoke against a world. */
enum class EGeneratorKind {
	SettlementRegenerate,
	CharacterBatch,
	QuestGeneration,
};

/**
 * Job lifecycle state. Idle before a run; Starting between the start request and
 * its ack; Queued/Running while the server works; then a terminal Completed /
 * Failed / Canceled.
 */
enum class EJobStatus {
	Idle,
	Starting,
	Queued,
	Running,
	Completed,
	Failed,
	Canceled,
};

/** The kind of a single progress event pulled off the stream. */
enum class EJobEventType {
	Queued,
	Progress,
	Completed,
	Failed,
};

/**
 * The entity-count diff a completed generation job produced — the results summary
 * the console shows before offering a Sync.
 */
struct FJobResult {
	int Added = 0;
	int Updated = 0;
	int Removed = 0;

	/** True when the job changed nothing. */
	bool IsEmpty() const { return Added == 0 && Updated == 0 && Removed == 0; }

	/** A one-line human summary of the diff. */
	std::string Summary() const;
};

/**
 * One progress event: a status transition plus optional progress / phase / message
 * / terminal result. Built by the parsers or by the static factories below.
 */
struct FJobEvent {
	EJobEventType Type = EJobEventType::Queued;
	/** Fractional progress in [0, 1] for a Progress event. */
	float Progress = 0.0f;
	std::string Phase;
	/** A failure reason (Failed) or human note. */
	std::string Message;
	/** The entity diff, set on a Completed event. */
	FJobResult Result;

	static FJobEvent MakeQueued();
	static FJobEvent MakeProgress(float InProgress, const std::string& InPhase = std::string());
	static FJobEvent MakeCompleted(const FJobResult& InResult);
	static FJobEvent MakeFailed(const std::string& InMessage);

	/** True once the event drives the state machine to a terminal status. */
	bool IsTerminal() const { return Type == EJobEventType::Completed || Type == EJobEventType::Failed; }
};

/**
 * A job-progress stream. Non-blocking: the model DRAINS buffered events via
 * TryDequeue in its Pump(); the stream buffers them however it likes (production
 * polls the status endpoint). IsClosed lets the model detect a premature close
 * (transport died before a terminal event). Destruction == disposal: disposing the
 * stream cancels any in-flight poll and clears the poll timer.
 */
class IJobStream {
public:
	virtual ~IJobStream() = default;

	/** Dequeue the next buffered event, or return false if none pending. */
	virtual bool TryDequeue(FJobEvent& OutEvent) = 0;

	/**
	 * True once the underlying transport has closed (job done or the poll gave up).
	 * A close with no terminal event is a premature close.
	 */
	virtual bool IsClosed() const = 0;
};

/**
 * Opens a job-progress stream for a started job's id. Injected so the model is
 * testable against a scripted stream; production returns the FHttpModule poll
 * stream. Returns null when streaming is unavailable (surfaced as a job failure).
 */
class IJobStreamFactory {
public:
	virtual ~IJobStreamFactory() = default;
	virtual std::unique_ptr<IJobStream> Open(FEditorSession& Session, const std::string& JobId) = 0;
};

/**
 * A stream factory used when no job streaming is wired: opening returns null so a
 * start surfaces "stream unavailable" instead of hanging.
 */
class FUnavailableJobStreamFactory : public IJobStreamFactory {
public:
	std::unique_ptr<IJobStream> Open(FEditorSession&, const std::string&) override { return nullptr; }
};

using FStartCallback = std::function<void(bool)>;

/** The Generation Console view-model. */
class FGenerationConsoleModel {
public:
	/** The factory defaults to the unavailable fallback so a bare model is usable. */
	explicit FGenerationConsoleModel(IJobStreamFactory* InStreamFactory = nullptr);

	// ── State accessors ─────────────────────────────────────────────────────

	EJobStatus Status() const { return StatusValue; }
	const std::string& JobId() const { return JobIdValue; }
	/** Fractional progress in [0, 1] of the running job. */
	float Progress() const { return ProgressValue; }
	const std::string& Phase() const { return PhaseValue; }
	/** A human failure reason when Status() is Failed. */
	const std::string& Error() const { return ErrorValue; }
	/** True once a job completed; then Result()/OffersSync() are valid. */
	bool HasResult() const { return bHasResult; }
	const FJobResult& Result() const { return ResultValue; }
	/** True once a job completed successfully — the window shows "Sync IR now…". */
	bool OffersSync() const { return bOffersSync; }

	/** True while a job is in flight (start requested through Running). */
	bool IsActive() const {
		return StatusValue == EJobStatus::Starting || StatusValue == EJobStatus::Queued ||
				StatusValue == EJobStatus::Running;
	}

	// ── Start ────────────────────────────────────────────────────────────────

	/**
	 * Kick off a generation job against WorldId and open its progress stream. No-op
	 * (delivers false) while another job is active. On the start ack the state goes
	 * Queued and progress flows through Pump(); a start failure lands in Failed with
	 * the reason. A 401/403 clears the token + arms Session.NeedsReauth via
	 * AuthenticatedRequest.
	 */
	void Start(FEditorSession& Session, EGeneratorKind Kind, const std::string& WorldId,
			FStartCallback OnDone = nullptr);

	// ── Pump (drain the stream — one call per editor tick) ────────────────────

	/**
	 * Drain every buffered progress event and advance the state machine. Called once
	 * per tick by the window. A premature close (the stream ended with no terminal
	 * event) becomes a Failed.
	 */
	void Pump();

	// ── Cancel / dispose / reset ───────────────────────────────────────────────

	/**
	 * Cancel an in-flight job locally: stop draining and dispose the stream (which
	 * cancels any in-flight poll). The v1 API has no cancel endpoint, so this is
	 * client-side only — the server job may finish, but the editor stops tracking it.
	 */
	void Cancel();

	/**
	 * Dispose the stream (stop polling). Called by the window when the tab is torn
	 * down so a domain reload / shutdown never leaves an orphaned poll loop.
	 */
	void Dispose() { DisposeStream(); }

	/** Clear a terminal run back to Idle (the window's "New job" button). */
	void Reset();

	// ── Static helpers (kind <-> slug/label, body + parsing) ──────────────────

	/** Map a generator kind to its server slug. */
	static std::string GeneratorSlug(EGeneratorKind Kind);
	/** A human label for the generator kind (window buttons). */
	static std::string GeneratorLabel(EGeneratorKind Kind);

	/** Build the startGenerationJob body: the world + generator slug. */
	static std::string BuildStartBody(EGeneratorKind Kind, const std::string& WorldId);

	/** Parse a startGenerationJob body for the job id (accepts jobId, id, wrapped). */
	static std::string ParseJobId(const std::string& Body);

	/**
	 * Parse a getGenerationJob status body into a progress event. Defensive: an
	 * unknown/absent status is treated as still-Queued (never throws). Maps status
	 * -> event type; reads progress / phase / message / result diff.
	 */
	static FJobEvent ParseJobEvent(const std::string& Body);

	/**
	 * Parse the entity-count diff from a completed status body — either a nested
	 * result/diff object or the counts on the root.
	 */
	static FJobResult ParseJobResult(const std::string& Body);

private:
	void ApplyEvent(const FJobEvent& Event);
	void Fail(const std::string& Reason);
	void DisposeStream();
	void ResetForNewRun();

	IJobStreamFactory* StreamFactory;
	FUnavailableJobStreamFactory DefaultStreamFactory;
	std::unique_ptr<IJobStream> Stream;

	EJobStatus StatusValue = EJobStatus::Idle;
	std::string JobIdValue;
	float ProgressValue = 0.0f;
	std::string PhaseValue;
	std::string ErrorValue;
	bool bHasResult = false;
	FJobResult ResultValue;
	bool bOffersSync = false;
};

} // namespace insimul
