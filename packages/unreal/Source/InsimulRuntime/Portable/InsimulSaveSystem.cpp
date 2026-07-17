// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulSaveSystem.h"

#include "InsimulCanonicalJson.h"

#include <utility>

namespace insimul {
namespace {

// ── JSON node factories (mutable building) ──────────────────────────────────

FJsonValuePtr MakeObject() {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::Object;
	return Node;
}

FJsonValuePtr MakeArray() {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::Array;
	return Node;
}

FJsonValuePtr MakeString(const std::string& S) {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::String;
	Node->StringValue = S;
	return Node;
}

FJsonValuePtr MakeNull() {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::Null;
	return Node;
}

FJsonValuePtr MakeInt(long long N) {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::Number;
	Node->NumberValue = static_cast<double>(N);
	Node->RawNumber = std::to_string(N);
	return Node;
}

FJsonValuePtr MakeNumber(double N) {
	auto Node = std::make_shared<FJsonValue>();
	Node->Type = EJsonType::Number;
	Node->NumberValue = N;
	return Node;
}

// ── Mutable object member access ────────────────────────────────────────────

FJsonValue* ObjFind(FJsonValue& Obj, const std::string& Key) {
	for (auto& Pair : Obj.ObjectItems) {
		if (Pair.first == Key) {
			return Pair.second.get();
		}
	}
	return nullptr;
}

void ObjSet(FJsonValue& Obj, const std::string& Key, FJsonValuePtr Value) {
	for (auto& Pair : Obj.ObjectItems) {
		if (Pair.first == Key) {
			Pair.second = std::move(Value);
			return;
		}
	}
	Obj.ObjectItems.emplace_back(Key, std::move(Value));
}

/** Ensure `Key` exists on `Obj`; if absent, insert `Fallback` and return it. */
FJsonValue* ObjEnsure(FJsonValue& Obj, const std::string& Key, FJsonValuePtr Fallback) {
	if (FJsonValue* Existing = ObjFind(Obj, Key)) {
		return Existing;
	}
	FJsonValue* Raw = Fallback.get();
	Obj.ObjectItems.emplace_back(Key, std::move(Fallback));
	return Raw;
}

FJsonValuePtr MakeEmptySrsState() {
	// createEmptySrsState() in packages/core/src/language/spaced-repetition.ts.
	auto Node = MakeObject();
	ObjSet(*Node, "items", MakeObject());
	ObjSet(*Node, "currentSession", MakeInt(0));
	ObjSet(*Node, "lastUpdated", MakeInt(0));
	return Node;
}

/**
 * migrateLanguageProgress() in packages/core/src/save-file.ts: backfill the
 * proficiency fields so every field is present. Augments in place (idempotent).
 */
void MigrateLanguageProgress(FJsonValue& State) {
	FJsonValue* LP = ObjFind(State, "languageProgress");
	if (!LP || !LP->IsObject()) {
		FJsonValuePtr Fresh = MakeObject();
		ObjSet(State, "languageProgress", Fresh);
		LP = ObjFind(State, "languageProgress");
	}
	ObjEnsure(*LP, "vocabulary", MakeArray());
	ObjEnsure(*LP, "grammarPatterns", MakeArray());
	ObjEnsure(*LP, "totalXP", MakeInt(0));
	ObjEnsure(*LP, "level", MakeInt(1));
	ObjEnsure(*LP, "arrivalAssessment", MakeNull());
	ObjEnsure(*LP, "proficiencyHistory", MakeArray());
	ObjEnsure(*LP, "srsState", MakeEmptySrsState());
	ObjEnsure(*LP, "weakAreaHistory", MakeArray());
}

/** Backfill WorldSnapshot version stamps on saves predating US-001. */
void BackfillSnapshotVersioning(FJsonValue& Snapshot) {
	auto EnsureString = [&](const char* Key) {
		FJsonValue* Member = ObjFind(Snapshot, Key);
		if (!Member || !Member->IsString()) {
			ObjSet(Snapshot, Key, MakeString("pre-versioning"));
		}
	};
	EnsureString("insimulVersion");
	EnsureString("engineRevision");
	EnsureString("snapshotCreatedAt");
}

FJsonValuePtr BuildDefaultVec3() {
	auto V = MakeObject();
	ObjSet(*V, "x", MakeInt(0));
	ObjSet(*V, "y", MakeInt(0));
	ObjSet(*V, "z", MakeInt(0));
	return V;
}

FJsonValuePtr BuildDefaultCurrentState() {
	auto State = MakeObject();

	auto Player = MakeObject();
	ObjSet(*Player, "position", BuildDefaultVec3());
	ObjSet(*Player, "rotation", BuildDefaultVec3());
	ObjSet(*Player, "gold", MakeInt(0));
	ObjSet(*Player, "health", MakeInt(100));
	ObjSet(*Player, "energy", MakeInt(100));
	ObjSet(*Player, "inventory", MakeArray());
	ObjSet(*Player, "cefrLevel", MakeNull());
	ObjSet(*Player, "effectiveFluency", MakeNull());
	ObjSet(*State, "player", Player);

	auto Quests = MakeObject();
	ObjSet(*Quests, "progress", MakeObject());
	ObjSet(*Quests, "dynamicQuests", MakeArray());
	ObjSet(*State, "quests", Quests);

	auto Npcs = MakeObject();
	ObjSet(*Npcs, "relationships", MakeObject());
	ObjSet(*Npcs, "romance", MakeObject());
	ObjSet(*Npcs, "merchantStates", MakeObject());
	ObjSet(*State, "npcs", Npcs);

	ObjSet(*State, "characterRelationships", MakeObject());

	auto Reputation = MakeObject();
	ObjSet(*Reputation, "settlements", MakeObject());
	ObjSet(*State, "reputation", Reputation);

	auto Containers = MakeObject();
	ObjSet(*Containers, "containers", MakeObject());
	ObjSet(*State, "containers", Containers);

	// Full (current-version) languageProgress defaults.
	auto LP = MakeObject();
	ObjSet(*State, "languageProgress", LP);
	MigrateLanguageProgress(*State);

	ObjSet(*State, "prologFacts", MakeArray());
	ObjSet(*State, "timeState", MakeNull());
	ObjSet(*State, "interiorState", MakeNull());
	ObjSet(*State, "extensions", MakeObject());
	return State;
}

} // namespace

// ── Public API ──────────────────────────────────────────────────────────────

bool FInsimulSaveSystem::Load(const std::string& Json, std::string& OutError) {
	Root.reset();
	LoadedVersion = 0;

	FJsonParseResult Parsed = ParseJson(Json);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		OutError = Parsed.bOk ? "SaveFile root is not a JSON object" : Parsed.Error;
		return false;
	}

	const FJsonValue* VersionNode = Parsed.Root->Find("version");
	const int FileVersion = VersionNode ? static_cast<int>(VersionNode->AsInt(1)) : 1;
	if (FileVersion < 1) {
		OutError = "SaveFile version " + std::to_string(FileVersion) + " is below the minimum (1).";
		return false;
	}
	if (FileVersion > SaveFileVersion) {
		OutError = "SaveFile version " + std::to_string(FileVersion) +
			" was produced by a newer build (max supported " + std::to_string(SaveFileVersion) +
			"). Please update the game.";
		return false;
	}

	Root = Parsed.Root;
	LoadedVersion = FileVersion;
	MigrateToCurrent();
	return true;
}

bool FInsimulSaveSystem::NewGame(
	const std::string& WorldSnapshotJson, const FNewGameOptions& Options, std::string& OutError) {
	Root.reset();
	LoadedVersion = 0;

	FJsonParseResult Parsed = ParseJson(WorldSnapshotJson);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		OutError = Parsed.bOk ? "worldSnapshot root is not a JSON object" : Parsed.Error;
		return false;
	}

	// Accept either a bare snapshot or a document wrapping it under worldSnapshot.
	FJsonValuePtr Snapshot = Parsed.Root;
	if (const FJsonValue* Wrapped = Parsed.Root->Find("worldSnapshot")) {
		if (Wrapped->IsObject()) {
			for (const auto& Pair : Parsed.Root->ObjectItems) {
				if (Pair.first == "worldSnapshot") {
					Snapshot = Pair.second;
					break;
				}
			}
		}
	}
	if (!Snapshot->Find("world")) {
		OutError = "worldSnapshot is missing a world object";
		return false;
	}

	auto Save = MakeObject();
	ObjSet(*Save, "id", MakeString(Options.Id));
	ObjSet(*Save, "slotIndex", MakeInt(Options.SlotIndex));
	ObjSet(*Save, "userId", MakeString(Options.UserId));
	ObjSet(*Save, "worldId", MakeString(Options.WorldId));
	ObjSet(*Save, "name", MakeString(Options.Name));
	ObjSet(*Save, "version", MakeInt(SaveFileVersion));
	ObjSet(*Save, "status", MakeString("active"));
	ObjSet(*Save, "createdAt", MakeString(Options.CreatedAt));
	ObjSet(*Save, "lastSavedAt", MakeString(Options.CreatedAt));
	ObjSet(*Save, "totalPlaytime", MakeInt(0));
	ObjSet(*Save, "saveCount", MakeInt(0));
	ObjSet(*Save, "worldSnapshot", Snapshot);
	ObjSet(*Save, "currentState", BuildDefaultCurrentState());
	ObjSet(*Save, "conversations", MakeArray());

	Root = Save;
	LoadedVersion = SaveFileVersion;
	return true;
}

void FInsimulSaveSystem::MigrateToCurrent() {
	if (!Root) {
		return;
	}
	int Version = LoadedVersion;

	// v1 -> v2: backfill LanguageProgressState proficiency fields.
	if (Version < 2) {
		if (FJsonValue* State = ObjFind(*Root, "currentState")) {
			if (State->IsObject()) {
				MigrateLanguageProgress(*State);
			}
		}
		Version = 2;
	}

	// v2 -> v3: backfill WorldSnapshot version stamps.
	if (Version < 3) {
		if (FJsonValue* Snapshot = ObjFind(*Root, "worldSnapshot")) {
			if (Snapshot->IsObject()) {
				BackfillSnapshotVersioning(*Snapshot);
			}
		}
		Version = 3;
	}

	ObjSet(*Root, "version", MakeInt(Version));
	LoadedVersion = Version;
}

std::string FInsimulSaveSystem::SerializeCanonical() const {
	if (!Root) {
		return "null";
	}
	return CanonicalJsonStringify(*Root);
}

std::string FInsimulSaveSystem::ComputeIntegrity() const {
	if (!Root) {
		return CanonicalJsonIntegrity(*MakeNull());
	}
	return CanonicalJsonIntegrity(*Root);
}

std::string FInsimulSaveSystem::BuildEnvelopeJson(
	const std::string& InsimulVersion, const std::string& ExportedAt) const {
	auto Envelope = MakeObject();
	ObjSet(*Envelope, "format", MakeString(SaveEnvelopeFormat()));
	ObjSet(*Envelope, "exportedAt", MakeString(ExportedAt));
	ObjSet(*Envelope, "insimulVersion", MakeString(InsimulVersion));
	ObjSet(*Envelope, "saveFile", Root ? Root : MakeNull());
	ObjSet(*Envelope, "integrity", MakeString(ComputeIntegrity()));
	return CanonicalJsonStringify(*Envelope);
}

void FInsimulSaveSystem::SnapshotFacts(const std::vector<FPrologFact>& Facts) {
	if (!Root) {
		return;
	}
	FJsonValue* State = ObjFind(*Root, "currentState");
	if (!State || !State->IsObject()) {
		ObjSet(*Root, "currentState", MakeObject());
		State = ObjFind(*Root, "currentState");
	}

	auto FactsArray = MakeArray();
	for (const FPrologFact& Fact : Facts) {
		auto FactNode = MakeObject();
		ObjSet(*FactNode, "predicate", MakeString(Fact.Predicate));
		auto ArgsArray = MakeArray();
		for (const FPrologArg& Arg : Fact.Args) {
			ArgsArray->ArrayItems.push_back(Arg.bIsNumber ? MakeNumber(Arg.Num) : MakeString(Arg.Str));
		}
		ObjSet(*FactNode, "args", ArgsArray);
		FactsArray->ArrayItems.push_back(FactNode);
	}
	ObjSet(*State, "prologFacts", FactsArray);
}

std::vector<FPrologFact> FInsimulSaveSystem::RestoreFacts() const {
	std::vector<FPrologFact> Out;
	if (!Root) {
		return Out;
	}
	const FJsonValue* State = Root->Find("currentState");
	if (!State) {
		return Out;
	}
	const FJsonValue* FactsArray = State->Find("prologFacts");
	if (!FactsArray || !FactsArray->IsArray()) {
		return Out;
	}
	for (const FJsonValuePtr& Item : FactsArray->ArrayItems) {
		if (!Item || !Item->IsObject()) {
			continue;
		}
		FPrologFact Fact;
		Fact.Predicate = Item->GetString("predicate");
		if (const FJsonValue* Args = Item->Find("args")) {
			for (const FJsonValuePtr& ArgNode : Args->ArrayItems) {
				if (!ArgNode) {
					continue;
				}
				if (ArgNode->IsNumber()) {
					Fact.Args.push_back(FPrologArg::MakeNumber(ArgNode->NumberValue));
				} else {
					Fact.Args.push_back(FPrologArg::MakeAtom(ArgNode->AsString()));
				}
			}
		}
		Out.push_back(std::move(Fact));
	}
	return Out;
}

} // namespace insimul
