// Copyright 2024 Insimul. All Rights Reserved.
//
// Plain C++ data-transfer objects for the Insimul world snapshot.
//
// These structs mirror the TypeScript `WorldSnapshot` contract in
// packages/core/src/save-file.ts (the semantics authority). They are the
// hand-written slice that stands in for the codegen-pipeline output
// (US-CG2, which will populate Source/InsimulRuntime/Generated). When the
// generator lands, these shapes become the generated target and the
// FInsimulWorldSource loader below can consume them unchanged.
//
// Dependency-free (std only) so the loader is host-testable via
// tools/verify-unreal. The UStruct boundary layer maps these into UE types.

#pragma once

#include <string>
#include <vector>

namespace insimul {

/** WorldSnapshot.world — top-level world metadata. */
struct FWorldMetaDTO {
	std::string Id;
	std::string Name;
	std::string WorldType;
	std::string GameType;
	std::string TargetLanguage;
	std::string Description;
};

/** WorldSnapshot.countries[] */
struct FCountryDTO {
	std::string Id;
	std::string Name;
	std::string GovernmentType;
	std::string EconomicSystem;
};

/** WorldSnapshot.settlements[] */
struct FSettlementDTO {
	std::string Id;
	std::string Name;
	std::string SettlementType;
	long long Population = 0;
	std::string CountryId;
};

/** WorldSnapshot.characters[] (minimal snapshot slice). */
struct FCharacterDTO {
	std::string Id;
	std::string FirstName;
	std::string LastName;
	std::string Gender;
	std::string Occupation;
	std::string CurrentLocation;
	bool bIsAlive = true;
};

/** WorldSnapshot.lots[].building */
struct FLotBuildingDTO {
	bool bPresent = false;
	std::string BuildingCategory; // "business" | "residence"
	std::string Name;
	std::string BusinessType;
	std::string OwnerId;
};

/** WorldSnapshot.lots[] */
struct FLotDTO {
	std::string Id;
	std::string SettlementId;
	std::string Address;
	std::string LotType;
	FLotBuildingDTO Building;
};

/** WorldSnapshot.quests[] (Prolog `content` is the canonical field). */
struct FQuestDTO {
	std::string Id;
	std::string Name;
	std::string Description;
	std::string GiverNpcId;
	std::string Status;
	std::string Content; // Prolog source — canonical representation
	std::string QuestType;
	std::string Difficulty;
	std::string TargetLanguage;
};

/**
 * The parsed world snapshot. Rules/actions/grammars are retained as counts
 * only for now — they are opaque Prolog/config payloads consumed by the
 * quest + rule systems (US-XC3), not typed at the world-source boundary.
 */
struct FWorldSnapshotDTO {
	FWorldMetaDTO World;
	std::vector<FCountryDTO> Countries;
	std::vector<FSettlementDTO> Settlements;
	std::vector<FCharacterDTO> Characters;
	std::vector<FLotDTO> Lots;
	std::vector<FQuestDTO> Quests;
	std::size_t RuleCount = 0;
	std::size_t ActionCount = 0;
	std::size_t GrammarCount = 0;
};

} // namespace insimul
