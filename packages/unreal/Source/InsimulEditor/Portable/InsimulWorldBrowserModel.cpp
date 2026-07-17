// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulWorldBrowserModel.cpp — the World Browser tab view-model body (US-XE2).
// See the header for the contract; this file is Unreal-Engine-free (std lib +
// InsimulJson only) so it host-tests headless over a mocked transport + fake
// registry/pipeline (test_world_browser.cpp).

#include "InsimulWorldBrowserModel.h"

#include "../../InsimulRuntime/Portable/InsimulJson.h"

namespace insimul {

namespace {

/** Trim trailing slashes (matches Unity's TrimEnd('/') and the TS regex). */
std::string TrimTrailingSlash(std::string S) {
	while (!S.empty() && S.back() == '/') {
		S.pop_back();
	}
	return S;
}

/** encodeURIComponent-equivalent: percent-escape everything but the unreserved set. */
std::string EncodeUriComponent(const std::string& S) {
	static const char* Hex = "0123456789ABCDEF";
	std::string Out;
	Out.reserve(S.size());
	for (unsigned char C : S) {
		const bool bUnreserved = (C >= 'A' && C <= 'Z') || (C >= 'a' && C <= 'z') ||
				(C >= '0' && C <= '9') || C == '-' || C == '_' || C == '.' ||
				C == '!' || C == '~' || C == '*' || C == '\'' || C == '(' || C == ')';
		if (bUnreserved) {
			Out.push_back(static_cast<char>(C));
		} else {
			Out.push_back('%');
			Out.push_back(Hex[(C >> 4) & 0xF]);
			Out.push_back(Hex[C & 0xF]);
		}
	}
	return Out;
}

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

int IntField(const FJsonValue& O, const std::string& Key) {
	const FJsonValue* V = O.Find(Key);
	return (V != nullptr && V->IsNumber()) ? static_cast<int>(V->NumberValue) : 0;
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

/** Parse one world object defensively. Returns false when it lacks an id. */
bool ParseWorldObject(const FJsonValue& O, FWorldSummary& Out) {
	if (!O.IsObject()) {
		return false;
	}
	const std::string Id = Str(O, "id");
	if (Id.empty()) {
		return false;
	}
	const std::string Name = Str(O, "name");
	Out = FWorldSummary{};
	Out.Id = Id;
	Out.Name = Name.empty() ? Id : Name;
	Out.GenreBundle = FirstStr(O, {"genreBundle", "genre"});
	Out.Description = Str(O, "description");
	Out.SnapshotVersion = FirstInt(O, {"snapshotVersion", "worldVersion"});
	Out.NpcCount = IntField(O, "npcCount");
	Out.SettlementCount = IntField(O, "settlementCount");
	Out.QuestCount = IntField(O, "questCount");
	return true;
}

} // namespace

// ── FImportReport ──────────────────────────────────────────────────────────

std::string FImportReport::Summary() const {
	const std::string Prefix = bDryRun ? "Dry run: " : "";
	if (IsClean()) {
		return Prefix + "no changes (" + std::to_string(Unchanged) + " unchanged, " +
				std::to_string(Skipped) + " hand-edited).";
	}
	return Prefix + "+" + std::to_string(Added) + " / ~" + std::to_string(Updated) +
			" / -" + std::to_string(Deprecated) + " (" + std::to_string(Unchanged) +
			" unchanged, " + std::to_string(Skipped) + " hand-edited).";
}

// ── FInMemoryImportedWorldRegistry ───────────────────────────────────────────

bool FInMemoryImportedWorldRegistry::TryGetImportedVersion(
		const std::string& WorldId, int& OutVersion) const {
	for (const auto& Entry : Versions) {
		if (Entry.first == WorldId) {
			OutVersion = Entry.second;
			return true;
		}
	}
	return false;
}

void FInMemoryImportedWorldRegistry::SetImportedVersion(const std::string& WorldId, int Version) {
	for (auto& Entry : Versions) {
		if (Entry.first == WorldId) {
			Entry.second = Version;
			return;
		}
	}
	Versions.emplace_back(WorldId, Version);
}

// ── FWorldBrowserModel ───────────────────────────────────────────────────────

FWorldBrowserModel::FWorldBrowserModel(ISceneImportPipeline* InPipeline,
		IImportedWorldRegistry* InRegistry)
	: Pipeline(InPipeline ? InPipeline : &DefaultPipeline),
	  Registry(InRegistry ? InRegistry : &DefaultRegistry) {}

void FWorldBrowserModel::Reset() {
	WorldsValue.clear();
	StatusValue = EBrowserStatus::Idle;
	ErrorValue.clear();
	SelectedIdValue.clear();
}

void FWorldBrowserModel::RefreshWorlds(FEditorSession& Session, FBoolCallback OnDone) {
	StatusValue = EBrowserStatus::Loading;
	ErrorValue.clear();
	Session.AuthenticatedRequest("listWorlds", std::string(), [this, OnDone](const FSessionResult& Res) {
		if (!Res.bOk) {
			LoadError(!Res.Error.empty() ? Res.Error : ("server returned " + std::to_string(Res.Status)));
			if (OnDone) {
				OnDone(false);
			}
			return;
		}
		LoadSuccess(ParseWorldList(Res.Body));
		if (OnDone) {
			OnDone(true);
		}
	});
}

void FWorldBrowserModel::LoadDetail(FEditorSession& Session, const std::string& WorldId,
		FDetailCallback OnDone) {
	if (WorldId.empty()) {
		if (OnDone) {
			OnDone(false, FWorldSummary{});
		}
		return;
	}
	const std::string Body = "{\"worldId\":" + JsonString(WorldId) + "}";
	Session.AuthenticatedRequest("getWorldDetail", Body, [this, OnDone](const FSessionResult& Res) {
		if (!Res.bOk) {
			if (OnDone) {
				OnDone(false, FWorldSummary{});
			}
			return;
		}
		FWorldSummary Detail;
		if (!ParseWorldDetail(Res.Body, Detail)) {
			if (OnDone) {
				OnDone(false, FWorldSummary{});
			}
			return;
		}
		MergeWorld(Detail);
		if (OnDone) {
			OnDone(true, Detail);
		}
	});
}

void FWorldBrowserModel::Select(const std::string& WorldId) {
	if (!WorldId.empty() && FindWorld(WorldId) == nullptr) {
		return; // ignore selection of a world not in the list
	}
	SelectedIdValue = WorldId;
}

bool FWorldBrowserModel::SelectedWorld(FWorldSummary& OutWorld) const {
	if (SelectedIdValue.empty()) {
		return false;
	}
	const FWorldSummary* Found = FindWorld(SelectedIdValue);
	if (Found == nullptr) {
		return false;
	}
	OutWorld = *Found;
	return true;
}

void FWorldBrowserModel::LoadSuccess(std::vector<FWorldSummary> Worlds) {
	WorldsValue = std::move(Worlds);
	// Drop a now-dangling selection (a re-fetch that removed the world).
	if (!SelectedIdValue.empty() && FindWorld(SelectedIdValue) == nullptr) {
		SelectedIdValue.clear();
	}
	StatusValue = EBrowserStatus::Loaded;
	ErrorValue.clear();
}

void FWorldBrowserModel::LoadError(const std::string& Message) {
	StatusValue = EBrowserStatus::Error;
	ErrorValue = Message;
}

EWorldCompat FWorldBrowserModel::Compatibility(const FWorldSummary& World) const {
	int Imported = 0;
	if (World.Id.empty() || !Registry->TryGetImportedVersion(World.Id, Imported)) {
		return EWorldCompat::NotImported;
	}
	if (Imported == World.SnapshotVersion) {
		return EWorldCompat::UpToDate;
	}
	return Imported < World.SnapshotVersion ? EWorldCompat::UpdateAvailable : EWorldCompat::Ahead;
}

std::string FWorldBrowserModel::CompatibilityLabel(const FWorldSummary& World) const {
	switch (Compatibility(World)) {
		case EWorldCompat::UpToDate:
			return "Up to date (v" + std::to_string(World.SnapshotVersion) + ")";
		case EWorldCompat::UpdateAvailable: {
			int Imp = 0;
			Registry->TryGetImportedVersion(World.Id, Imp);
			return "Update available (imported v" + std::to_string(Imp) + " -> v" +
					std::to_string(World.SnapshotVersion) + ")";
		}
		case EWorldCompat::Ahead:
			return "Local copy ahead of server";
		default:
			return "Not imported";
	}
}

std::string FWorldBrowserModel::OpenInWebUrl(const std::string& BaseUrl, const std::string& WorldId) {
	return TrimTrailingSlash(BaseUrl) + "/worlds/" + EncodeUriComponent(WorldId);
}

void FWorldBrowserModel::PreviewImport(FEditorSession& Session, const FWorldSummary& World,
		FImportCallback OnDone) {
	RunImport(Session, World, /*bDryRun*/ true, std::move(OnDone));
}

void FWorldBrowserModel::ApplyImport(FEditorSession& Session, const FWorldSummary& World,
		FImportCallback OnDone) {
	const std::string WorldId = World.Id;
	const int SnapshotVersion = World.SnapshotVersion;
	RunImport(Session, World, /*bDryRun*/ false,
			[this, WorldId, SnapshotVersion, OnDone](const FImportOutcome& Outcome) {
				if (Outcome.bOk) {
					Registry->SetImportedVersion(WorldId, SnapshotVersion);
				}
				if (OnDone) {
					OnDone(Outcome);
				}
			});
}

void FWorldBrowserModel::RunImport(FEditorSession& Session, const FWorldSummary& World,
		bool bDryRun, FImportCallback OnDone) {
	if (!Pipeline->IsAvailable()) {
		FImportOutcome Outcome;
		Outcome.Error = Pipeline->UnavailableReason();
		if (OnDone) {
			OnDone(Outcome);
		}
		return;
	}
	if (World.Id.empty()) {
		FImportOutcome Outcome;
		Outcome.Error = "no world selected";
		if (OnDone) {
			OnDone(Outcome);
		}
		return;
	}
	// The backend exports the world IR (importWorld); the LOCAL scene-binding
	// pipeline then reconciles it against the current scene (dry run or apply).
	const FWorldSummary WorldCopy = World;
	const std::string Body = "{\"worldId\":" + JsonString(World.Id) + "}";
	Session.AuthenticatedRequest("importWorld", Body,
			[this, WorldCopy, bDryRun, OnDone](const FSessionResult& Res) {
				FImportOutcome Outcome;
				if (!Res.bOk) {
					Outcome.Error = !Res.Error.empty() ? Res.Error
							: ("server returned " + std::to_string(Res.Status));
					if (OnDone) {
						OnDone(Outcome);
					}
					return;
				}
				const bool bRan = bDryRun ? Pipeline->DryRun(WorldCopy, Res.Body, Outcome.Report)
						: Pipeline->Apply(WorldCopy, Res.Body, Outcome.Report);
				if (!bRan) {
					Outcome.Error = "the pipeline returned no report";
					if (OnDone) {
						OnDone(Outcome);
					}
					return;
				}
				Outcome.bOk = true;
				if (OnDone) {
					OnDone(Outcome);
				}
			});
}

std::vector<FWorldSummary> FWorldBrowserModel::ParseWorldList(const std::string& Body) {
	std::vector<FWorldSummary> Out;
	const FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		return Out;
	}
	const FJsonValue* Worlds = Parsed.Root->Find("worlds");
	if (Worlds == nullptr || !Worlds->IsArray()) {
		return Out;
	}
	for (const FJsonValuePtr& Item : Worlds->ArrayItems) {
		FWorldSummary Summary;
		if (Item && ParseWorldObject(*Item, Summary)) {
			Out.push_back(std::move(Summary));
		}
	}
	return Out;
}

bool FWorldBrowserModel::ParseWorldDetail(const std::string& Body, FWorldSummary& OutWorld) {
	const FJsonParseResult Parsed = ParseJson(Body);
	if (!Parsed.bOk || !Parsed.Root) {
		return false;
	}
	if (Parsed.Root->IsObject()) {
		const FJsonValue* Wrapped = Parsed.Root->Find("world");
		if (Wrapped != nullptr && Wrapped->IsObject()) {
			return ParseWorldObject(*Wrapped, OutWorld);
		}
	}
	return ParseWorldObject(*Parsed.Root, OutWorld);
}

const FWorldSummary* FWorldBrowserModel::FindWorld(const std::string& Id) const {
	for (const FWorldSummary& W : WorldsValue) {
		if (W.Id == Id) {
			return &W;
		}
	}
	return nullptr;
}

void FWorldBrowserModel::MergeWorld(const FWorldSummary& Detail) {
	for (FWorldSummary& W : WorldsValue) {
		if (W.Id == Detail.Id) {
			W = Detail;
			return;
		}
	}
	WorldsValue.push_back(Detail);
}

} // namespace insimul
