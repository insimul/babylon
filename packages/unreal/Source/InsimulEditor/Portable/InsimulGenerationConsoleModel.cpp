// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulGenerationConsoleModel.cpp — the Generation Console view-model body
// (US-XE3). See the header for the contract; this file is Unreal-Engine-free
// (std lib + InsimulJson only) so it host-tests headless over a mocked transport
// (FEditorSession) + a scripted job stream (test_generation_console.cpp).

#include "InsimulGenerationConsoleModel.h"

#include <algorithm>
#include <cctype>

#include "../../InsimulRuntime/Portable/InsimulJson.h"

namespace insimul {

namespace {

/** A JSON string literal for the tiny request bodies we build. */
std::string JsonString(const std::string& S) {
	std::string Out;
	Out.reserve(S.size() + 2);
	Out.push_back('"');
	for (char C : S) {
		switch (C) {
			case '"': Out += "\\\""; break;
			case '\\': Out += "\\\\"; break;
			case '\n': Out += "\\n"; break;
			case '\r': Out += "\\r"; break;
			case '\t': Out += "\\t"; break;
			default: Out.push_back(C); break;
		}
	}
	Out.push_back('"');
	return Out;
}

std::string ToLower(std::string S) {
	std::transform(S.begin(), S.end(), S.begin(),
			[](unsigned char C) { return static_cast<char>(std::tolower(C)); });
	return S;
}

std::string Str(const FJsonValue& O, const std::string& Key) {
	const FJsonValue* V = O.Find(Key);
	return (V != nullptr && V->IsString()) ? V->StringValue : std::string();
}

std::string FirstStr(const FJsonValue& O, const std::vector<std::string>& Keys) {
	for (const std::string& K : Keys) {
		std::string S = Str(O, K);
		if (!S.empty()) {
			return S;
		}
	}
	return std::string();
}

int FirstInt(const FJsonValue& O, const std::vector<std::string>& Keys) {
	for (const std::string& K : Keys) {
		const FJsonValue* V = O.Find(K);
		if (V != nullptr && V->IsNumber()) {
			return static_cast<int>(V->NumberValue);
		}
	}
	return 0;
}

float FirstFloat(const FJsonValue& O, const std::vector<std::string>& Keys) {
	for (const std::string& K : Keys) {
		const FJsonValue* V = O.Find(K);
		if (V != nullptr && V->IsNumber()) {
			return static_cast<float>(V->NumberValue);
		}
	}
	return 0.0f;
}

float Clamp01(float V) {
	return V < 0.0f ? 0.0f : (V > 1.0f ? 1.0f : V);
}

/** Peel a { "job": {...} } wrapper, returning the inner object when present. */
const FJsonValue& UnwrapJob(const FJsonValue& Root) {
	if (Root.IsObject()) {
		const FJsonValue* Job = Root.Find("job");
		if (Job != nullptr && Job->IsObject()) {
			return *Job;
		}
	}
	return Root;
}

FJobResult ParseResultScope(const FJsonValue& Root) {
	const FJsonValue* Scope = &Root;
	if (Root.IsObject()) {
		const FJsonValue* R = Root.Find("result");
		const FJsonValue* D = Root.Find("diff");
		if (R != nullptr && R->IsObject()) {
			Scope = R;
		} else if (D != nullptr && D->IsObject()) {
			Scope = D;
		}
	}
	FJobResult Result;
	Result.Added = FirstInt(*Scope, {"added", "created"});
	Result.Updated = FirstInt(*Scope, {"updated", "changed", "modified"});
	Result.Removed = FirstInt(*Scope, {"removed", "deleted", "deprecated"});
	return Result;
}

} // namespace

// ── FJobResult ───────────────────────────────────────────────────────────────

std::string FJobResult::Summary() const {
	if (IsEmpty()) {
		return "No entities changed.";
	}
	return "+" + std::to_string(Added) + " added / ~" + std::to_string(Updated) +
			" updated / -" + std::to_string(Removed) + " removed";
}

// ── FJobEvent factories ───────────────────────────────────────────────────────

FJobEvent FJobEvent::MakeQueued() {
	FJobEvent E;
	E.Type = EJobEventType::Queued;
	return E;
}

FJobEvent FJobEvent::MakeProgress(float InProgress, const std::string& InPhase) {
	FJobEvent E;
	E.Type = EJobEventType::Progress;
	E.Progress = Clamp01(InProgress);
	E.Phase = InPhase;
	return E;
}

FJobEvent FJobEvent::MakeCompleted(const FJobResult& InResult) {
	FJobEvent E;
	E.Type = EJobEventType::Completed;
	E.Progress = 1.0f;
	E.Result = InResult;
	return E;
}

FJobEvent FJobEvent::MakeFailed(const std::string& InMessage) {
	FJobEvent E;
	E.Type = EJobEventType::Failed;
	E.Message = InMessage;
	return E;
}

// ── FGenerationConsoleModel ────────────────────────────────────────────────────

FGenerationConsoleModel::FGenerationConsoleModel(IJobStreamFactory* InStreamFactory)
	: StreamFactory(InStreamFactory != nullptr ? InStreamFactory : &DefaultStreamFactory) {}

void FGenerationConsoleModel::Start(FEditorSession& Session, EGeneratorKind Kind,
		const std::string& WorldId, FStartCallback OnDone) {
	if (IsActive()) {
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	ResetForNewRun();
	StatusValue = EJobStatus::Starting;
	if (WorldId.empty()) {
		Fail("no world selected");
		if (OnDone) {
			OnDone(false);
		}
		return;
	}
	const std::string Body = BuildStartBody(Kind, WorldId);
	Session.AuthenticatedRequest("startGenerationJob", Body,
			[this, &Session, OnDone](const FSessionResult& Res) {
		if (!Res.bOk) {
			Fail(!Res.Error.empty() ? Res.Error : ("server returned " + std::to_string(Res.Status)));
			if (OnDone) {
				OnDone(false);
			}
			return;
		}
		const std::string ParsedId = ParseJobId(Res.Body);
		if (ParsedId.empty()) {
			Fail("the server did not return a job id");
			if (OnDone) {
				OnDone(false);
			}
			return;
		}
		JobIdValue = ParsedId;
		StatusValue = EJobStatus::Queued;
		Stream = StreamFactory->Open(Session, ParsedId);
		if (Stream == nullptr) {
			Fail("job progress stream unavailable");
			if (OnDone) {
				OnDone(false);
			}
			return;
		}
		if (OnDone) {
			OnDone(true);
		}
	});
}

void FGenerationConsoleModel::Pump() {
	if (Stream == nullptr) {
		return;
	}
	FJobEvent Event;
	while (Stream != nullptr && Stream->TryDequeue(Event)) {
		ApplyEvent(Event);
		if (Stream == nullptr) {
			return; // a terminal event disposed the stream
		}
	}
	if (Stream != nullptr && Stream->IsClosed() && IsActive()) {
		Fail("the job progress stream closed before completion");
	}
}

void FGenerationConsoleModel::ApplyEvent(const FJobEvent& Event) {
	switch (Event.Type) {
		case EJobEventType::Queued:
			StatusValue = EJobStatus::Queued;
			break;
		case EJobEventType::Progress:
			StatusValue = EJobStatus::Running;
			ProgressValue = Clamp01(Event.Progress);
			if (!Event.Phase.empty()) {
				PhaseValue = Event.Phase;
			}
			break;
		case EJobEventType::Completed:
			StatusValue = EJobStatus::Completed;
			ProgressValue = 1.0f;
			ResultValue = Event.Result;
			bHasResult = true;
			bOffersSync = true;
			DisposeStream();
			break;
		case EJobEventType::Failed:
			Fail(Event.Message.empty() ? "the job failed" : Event.Message);
			break;
	}
}

void FGenerationConsoleModel::Cancel() {
	if (!IsActive()) {
		return;
	}
	StatusValue = EJobStatus::Canceled;
	DisposeStream();
}

void FGenerationConsoleModel::Reset() {
	DisposeStream();
	ResetForNewRun();
	StatusValue = EJobStatus::Idle;
}

void FGenerationConsoleModel::Fail(const std::string& Reason) {
	StatusValue = EJobStatus::Failed;
	ErrorValue = Reason;
	DisposeStream();
}

void FGenerationConsoleModel::DisposeStream() {
	// Destroying the stream is its disposal: it cancels any in-flight poll and
	// clears the poll timer (Private/Connect/InsimulHttpJobStream -> FJobPoller).
	Stream.reset();
}

void FGenerationConsoleModel::ResetForNewRun() {
	JobIdValue.clear();
	ProgressValue = 0.0f;
	PhaseValue.clear();
	ErrorValue.clear();
	bHasResult = false;
	ResultValue = FJobResult{};
	bOffersSync = false;
}

// ── Static helpers ─────────────────────────────────────────────────────────────

std::string FGenerationConsoleModel::GeneratorSlug(EGeneratorKind Kind) {
	switch (Kind) {
		case EGeneratorKind::SettlementRegenerate: return "settlement_regenerate";
		case EGeneratorKind::CharacterBatch: return "character_batch";
		case EGeneratorKind::QuestGeneration: return "quest_generation";
	}
	return std::string();
}

std::string FGenerationConsoleModel::GeneratorLabel(EGeneratorKind Kind) {
	switch (Kind) {
		case EGeneratorKind::SettlementRegenerate: return "Regenerate settlements";
		case EGeneratorKind::CharacterBatch: return "Generate characters (batch)";
		case EGeneratorKind::QuestGeneration: return "Generate quests";
	}
	return std::string();
}

std::string FGenerationConsoleModel::BuildStartBody(EGeneratorKind Kind, const std::string& WorldId) {
	return "{\"worldId\":" + JsonString(WorldId) + ",\"generator\":" +
			JsonString(GeneratorSlug(Kind)) + "}";
}

std::string FGenerationConsoleModel::ParseJobId(const std::string& Body) {
	FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || Parsed.Root == nullptr || !Parsed.Root->IsObject()) {
		return std::string();
	}
	const FJsonValue& Root = UnwrapJob(*Parsed.Root);
	return FirstStr(Root, {"jobId", "id"});
}

FJobEvent FGenerationConsoleModel::ParseJobEvent(const std::string& Body) {
	FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || Parsed.Root == nullptr || !Parsed.Root->IsObject()) {
		return FJobEvent::MakeQueued();
	}
	const FJsonValue& Root = UnwrapJob(*Parsed.Root);

	const std::string RawStatus = ToLower(FirstStr(Root, {"status", "state"}));
	const std::string Phase = FirstStr(Root, {"phase", "step", "stage"});
	const std::string Message = FirstStr(Root, {"error", "message", "reason"});
	float Progress = FirstFloat(Root, {"progress", "percent"});
	if (Progress > 1.5f) {
		Progress /= 100.0f; // tolerate 0..100 percentages
	}

	if (RawStatus == "completed" || RawStatus == "complete" || RawStatus == "done" ||
			RawStatus == "succeeded" || RawStatus == "success") {
		return FJobEvent::MakeCompleted(ParseResultScope(Root));
	}
	if (RawStatus == "failed" || RawStatus == "error" || RawStatus == "canceled" ||
			RawStatus == "cancelled") {
		return FJobEvent::MakeFailed(Message.empty() ? "the job failed" : Message);
	}
	if (RawStatus == "running" || RawStatus == "in_progress" || RawStatus == "processing" ||
			RawStatus == "active") {
		return FJobEvent::MakeProgress(Progress, Phase);
	}
	return FJobEvent::MakeQueued();
}

FJobResult FGenerationConsoleModel::ParseJobResult(const std::string& Body) {
	FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || Parsed.Root == nullptr) {
		return FJobResult{};
	}
	return ParseResultScope(UnwrapJob(*Parsed.Root));
}

} // namespace insimul
