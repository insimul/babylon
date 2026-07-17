// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulWorldSource.h"

namespace insimul {

FVersionGateResult FInsimulWorldSource::CheckVersion(int InVersion) {
	FVersionGateResult Result;
	Result.Version = InVersion;

	if (InVersion < MinSupportedSaveVersion) {
		Result.bCompatible = false;
		Result.Status = "incompatible";
		Result.Message = "Save version " + std::to_string(InVersion) +
			" is older than the minimum supported version " +
			std::to_string(MinSupportedSaveVersion) + ".";
		return Result;
	}

	if (InVersion > MaxSupportedSaveVersion) {
		Result.bCompatible = false;
		Result.Status = "incompatible";
		Result.Message = "Save version " + std::to_string(InVersion) +
			" was produced by a newer build (max supported " +
			std::to_string(MaxSupportedSaveVersion) + "). Please update the game.";
		return Result;
	}

	Result.bCompatible = true;
	Result.Status = (InVersion == MaxSupportedSaveVersion) ? "current" : "supported";
	Result.Message = "Save version " + std::to_string(InVersion) + " is compatible.";
	return Result;
}

const FCharacterDTO* FInsimulWorldSource::FindCharacter(const std::string& Id) const {
	for (const FCharacterDTO& C : Snapshot.Characters) {
		if (C.Id == Id) {
			return &C;
		}
	}
	return nullptr;
}

const FSettlementDTO* FInsimulWorldSource::FindSettlement(const std::string& Id) const {
	for (const FSettlementDTO& S : Snapshot.Settlements) {
		if (S.Id == Id) {
			return &S;
		}
	}
	return nullptr;
}

const FQuestDTO* FInsimulWorldSource::FindQuest(const std::string& Id) const {
	for (const FQuestDTO& Q : Snapshot.Quests) {
		if (Q.Id == Id) {
			return &Q;
		}
	}
	return nullptr;
}

bool FInsimulWorldSource::LoadFromSaveFileJson(const std::string& Json, std::string& OutError) {
	bLoaded = false;
	FJsonParseResult Parsed = ParseJson(Json);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		OutError = Parsed.bOk ? "SaveFile root is not a JSON object" : Parsed.Error;
		return false;
	}

	const FJsonValue& Root = *Parsed.Root;

	// Schema-version compatibility gate.
	const FJsonValue* VersionNode = Root.Find("version");
	Version = VersionNode ? static_cast<int>(VersionNode->AsInt(0)) : 0;
	const FVersionGateResult Gate = CheckVersion(Version);
	if (!Gate.bCompatible) {
		OutError = Gate.Message;
		return false;
	}

	const FJsonValue* SnapshotNode = Root.Find("worldSnapshot");
	if (!SnapshotNode || !SnapshotNode->IsObject()) {
		OutError = "SaveFile is missing a worldSnapshot object";
		return false;
	}

	if (!ParseSnapshotObject(*SnapshotNode, OutError)) {
		return false;
	}
	bLoaded = true;
	return true;
}

bool FInsimulWorldSource::LoadFromWorldSnapshotJson(const std::string& Json, std::string& OutError) {
	bLoaded = false;
	FJsonParseResult Parsed = ParseJson(Json);
	if (!Parsed.bOk || !Parsed.Root || !Parsed.Root->IsObject()) {
		OutError = Parsed.bOk ? "World snapshot root is not a JSON object" : Parsed.Error;
		return false;
	}

	// A WorldIR document may nest the snapshot under "worldSnapshot"; accept
	// either the bare snapshot object or the wrapped form.
	const FJsonValue* SnapshotNode = Parsed.Root->Find("worldSnapshot");
	const FJsonValue& Obj = (SnapshotNode && SnapshotNode->IsObject()) ? *SnapshotNode : *Parsed.Root;

	if (!ParseSnapshotObject(Obj, OutError)) {
		return false;
	}
	bLoaded = true;
	return true;
}

bool FInsimulWorldSource::ParseSnapshotObject(const FJsonValue& Obj, std::string& OutError) {
	Snapshot = FWorldSnapshotDTO();

	const FJsonValue* WorldNode = Obj.Find("world");
	if (!WorldNode || !WorldNode->IsObject()) {
		OutError = "worldSnapshot is missing a world object";
		return false;
	}
	Snapshot.World.Id = WorldNode->GetString("id");
	Snapshot.World.Name = WorldNode->GetString("name");
	Snapshot.World.WorldType = WorldNode->GetString("worldType");
	Snapshot.World.GameType = WorldNode->GetString("gameType");
	Snapshot.World.TargetLanguage = WorldNode->GetString("targetLanguage");
	Snapshot.World.Description = WorldNode->GetString("description");

	if (const FJsonValue* Countries = Obj.Find("countries")) {
		for (const FJsonValuePtr& Item : Countries->ArrayItems) {
			if (!Item || !Item->IsObject()) {
				continue;
			}
			FCountryDTO C;
			C.Id = Item->GetString("id");
			C.Name = Item->GetString("name");
			C.GovernmentType = Item->GetString("governmentType");
			C.EconomicSystem = Item->GetString("economicSystem");
			Snapshot.Countries.push_back(std::move(C));
		}
	}

	if (const FJsonValue* Settlements = Obj.Find("settlements")) {
		for (const FJsonValuePtr& Item : Settlements->ArrayItems) {
			if (!Item || !Item->IsObject()) {
				continue;
			}
			FSettlementDTO S;
			S.Id = Item->GetString("id");
			S.Name = Item->GetString("name");
			S.SettlementType = Item->GetString("settlementType");
			S.Population = Item->GetInt("population", 0);
			S.CountryId = Item->GetString("countryId");
			Snapshot.Settlements.push_back(std::move(S));
		}
	}

	if (const FJsonValue* Characters = Obj.Find("characters")) {
		for (const FJsonValuePtr& Item : Characters->ArrayItems) {
			if (!Item || !Item->IsObject()) {
				continue;
			}
			FCharacterDTO C;
			C.Id = Item->GetString("id");
			C.FirstName = Item->GetString("firstName");
			C.LastName = Item->GetString("lastName");
			C.Gender = Item->GetString("gender");
			C.Occupation = Item->GetString("occupation");
			C.CurrentLocation = Item->GetString("currentLocation");
			C.bIsAlive = Item->GetBool("isAlive", true);
			Snapshot.Characters.push_back(std::move(C));
		}
	}

	if (const FJsonValue* Lots = Obj.Find("lots")) {
		for (const FJsonValuePtr& Item : Lots->ArrayItems) {
			if (!Item || !Item->IsObject()) {
				continue;
			}
			FLotDTO L;
			L.Id = Item->GetString("id");
			L.SettlementId = Item->GetString("settlementId");
			L.Address = Item->GetString("address");
			L.LotType = Item->GetString("lotType");
			if (const FJsonValue* Building = Item->Find("building")) {
				if (Building->IsObject()) {
					L.Building.bPresent = true;
					L.Building.BuildingCategory = Building->GetString("buildingCategory");
					L.Building.Name = Building->GetString("name");
					L.Building.BusinessType = Building->GetString("businessType");
					L.Building.OwnerId = Building->GetString("ownerId");
				}
			}
			Snapshot.Lots.push_back(std::move(L));
		}
	}

	if (const FJsonValue* Quests = Obj.Find("quests")) {
		for (const FJsonValuePtr& Item : Quests->ArrayItems) {
			if (!Item || !Item->IsObject()) {
				continue;
			}
			FQuestDTO Q;
			Q.Id = Item->GetString("id");
			Q.Name = Item->GetString("name");
			Q.Description = Item->GetString("description");
			Q.GiverNpcId = Item->GetString("giverNpcId");
			Q.Status = Item->GetString("status");
			Q.Content = Item->GetString("content");
			Q.QuestType = Item->GetString("questType");
			Q.Difficulty = Item->GetString("difficulty");
			Q.TargetLanguage = Item->GetString("targetLanguage");
			Snapshot.Quests.push_back(std::move(Q));
		}
	}

	if (const FJsonValue* Rules = Obj.Find("rules")) {
		Snapshot.RuleCount = Rules->Size();
	}
	if (const FJsonValue* Actions = Obj.Find("actions")) {
		Snapshot.ActionCount = Actions->Size();
	}
	if (const FJsonValue* Grammars = Obj.Find("grammars")) {
		Snapshot.GrammarCount = Grammars->Size();
	}

	return true;
}

} // namespace insimul
