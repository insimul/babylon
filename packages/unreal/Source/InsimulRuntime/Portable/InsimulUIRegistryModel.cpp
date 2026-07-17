// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulUIRegistryModel.h"

#include <algorithm>

namespace insimul {

FInsimulUIRegistryModel::FInsimulUIRegistryModel(
	std::vector<std::pair<std::string, std::string>> Defaults)
	: DefaultsList(std::move(Defaults)) {}

std::vector<std::pair<std::string, std::string>> FInsimulUIRegistryModel::DefaultPanelMap() {
	// Panel keys mirror packages/core/conformance/ui/registry-cases.json ->
	// panel_keys. Each maps to the WBP the export pipeline creates under /Game/UI
	// (see templates/scripts/GenerateInsimulContent.py, which registers the same
	// key -> WBP mapping into DA_InsimulUIRegistry). The `_C` suffix is the
	// generated Blueprint class object path a creator loads to CreateWidget<>().
	return {
		{"loading_screen", "/Game/UI/WBP_IntroSequence.WBP_IntroSequence_C"},
		{"notifications", "/Game/UI/WBP_Notifications.WBP_Notifications_C"},
		{"hud", "/Game/UI/WBP_HUD.WBP_HUD_C"},
		{"main_menu", "/Game/UI/WBP_MainMenu.WBP_MainMenu_C"},
		{"game_menu", "/Game/UI/WBP_GameMenu.WBP_GameMenu_C"},
		{"quest_journal", "/Game/UI/WBP_QuestJournal.WBP_QuestJournal_C"},
		{"quest_tracker", "/Game/UI/WBP_QuestTracker.WBP_QuestTracker_C"},
		{"quest_offer", "/Game/UI/WBP_QuestOfferPanel.WBP_QuestOfferPanel_C"},
		{"inventory", "/Game/UI/WBP_Inventory.WBP_Inventory_C"},
		{"container", "/Game/UI/WBP_Container.WBP_Container_C"},
		{"merchant", "/Game/UI/WBP_ShopPanel.WBP_ShopPanel_C"},
		{"dialogue", "/Game/UI/WBP_Dialogue.WBP_Dialogue_C"},
		{"pause_menu", "/Game/UI/WBP_PauseMenu.WBP_PauseMenu_C"},
		{"save_load", "/Game/UI/WBP_SaveLoad.WBP_SaveLoad_C"},
	};
}

const std::string* FInsimulUIRegistryModel::FindDefault(const std::string& Key) const {
	for (const auto& Pair : DefaultsList) {
		if (Pair.first == Key) {
			return &Pair.second;
		}
	}
	return nullptr;
}

const std::string* FInsimulUIRegistryModel::FindOverride(const std::string& Key) const {
	for (const auto& Pair : OverridesList) {
		if (Pair.first == Key) {
			return &Pair.second;
		}
	}
	return nullptr;
}

void FInsimulUIRegistryModel::Register(const std::string& Key, const std::string& Ref) {
	for (auto& Pair : OverridesList) {
		if (Pair.first == Key) {
			Pair.second = Ref;
			return;
		}
	}
	OverridesList.emplace_back(Key, Ref);
}

void FInsimulUIRegistryModel::ApplyOverrides(
	const std::vector<std::pair<std::string, std::string>>& Overrides) {
	for (const auto& Pair : Overrides) {
		Register(Pair.first, Pair.second);
	}
}

bool FInsimulUIRegistryModel::Has(const std::string& Key) const {
	return FindOverride(Key) != nullptr || FindDefault(Key) != nullptr;
}

bool FInsimulUIRegistryModel::IsOverridden(const std::string& Key) const {
	return FindOverride(Key) != nullptr;
}

std::string FInsimulUIRegistryModel::PeekRef(const std::string& Key) const {
	if (const std::string* Ov = FindOverride(Key)) {
		return *Ov;
	}
	if (const std::string* Def = FindDefault(Key)) {
		return *Def;
	}
	return std::string();
}

std::string FInsimulUIRegistryModel::SceneRef(const std::string& Key) {
	if (const std::string* Ov = FindOverride(Key)) {
		return *Ov;
	}
	if (const std::string* Def = FindDefault(Key)) {
		return *Def;
	}
	RecordMissing(Key);
	return std::string();
}

std::vector<std::string> FInsimulUIRegistryModel::Keys() const {
	std::vector<std::string> Out;
	auto AddUnique = [&Out](const std::string& K) {
		if (std::find(Out.begin(), Out.end(), K) == Out.end()) {
			Out.push_back(K);
		}
	};
	for (const auto& Pair : DefaultsList) {
		AddUnique(Pair.first);
	}
	for (const auto& Pair : OverridesList) {
		AddUnique(Pair.first);
	}
	std::sort(Out.begin(), Out.end());
	return Out;
}

void FInsimulUIRegistryModel::RecordMissing(const std::string& Key) {
	DiagnosticsList.push_back(
		{"missing_panel", Key, "no panel registered for key '" + Key + "'"});
}

} // namespace insimul
