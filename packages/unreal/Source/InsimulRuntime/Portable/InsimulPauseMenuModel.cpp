// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulPauseMenuModel implementation — see InsimulPauseMenuModel.h. std-only;
// host-tested by run-dialogue-ui-tests.sh against pause-menu-cases.json.

#include "InsimulPauseMenuModel.h"

namespace insimul {

std::vector<FPauseTab> FInsimulPauseMenuModel::DefaultTabs() {
	return {
		{"resume", "Resume", {}},
		{"journal", "Journal", {}},
		{"inventory", "Inventory", {}},
		{"map", "Map", {}},
		{"character", "Character", {"proficiency"}},
		{"vocabulary", "Vocabulary", {"knowledge-acquisition"}},
		{"skills", "Skills", {"skill-tree"}},
		{"analytics", "Analytics", {"conversation-analytics"}},
		{"assessment", "Assessment", {"assessment"}},
		{"settings", "Settings", {}},
		{"save", "Save / Load", {}},
	};
}

void FInsimulPauseMenuModel::InitFromDefaults() {
	TabDefs = DefaultTabs();
}

FInsimulPauseMenuModel::FInsimulPauseMenuModel(const std::vector<std::string>& EnabledModules,
		const std::vector<FPauseTab>& Tabs)
	: Enabled(EnabledModules) {
	TabDefs = Tabs.empty() ? DefaultTabs() : Tabs;
}

bool FInsimulPauseMenuModel::ModuleEnabled(const std::string& Module) const {
	for (const std::string& M : Enabled) {
		if (M == Module) {
			return true;
		}
	}
	return false;
}

bool FInsimulPauseMenuModel::Gated(const FPauseTab& Tab) const {
	for (const std::string& Req : Tab.Requires) {
		if (!ModuleEnabled(Req)) {
			return false;
		}
	}
	return true;
}

const FPauseTab* FInsimulPauseMenuModel::FindTab(const std::string& Key) const {
	for (const FPauseTab& T : TabDefs) {
		if (T.Key == Key) {
			return &T;
		}
	}
	return nullptr;
}

std::vector<FPauseTab> FInsimulPauseMenuModel::VisibleTabs() const {
	std::vector<FPauseTab> Out;
	for (const FPauseTab& T : TabDefs) {
		if (Gated(T)) {
			Out.push_back(T);
		}
	}
	return Out;
}

std::vector<std::string> FInsimulPauseMenuModel::VisibleKeys() const {
	std::vector<std::string> Out;
	for (const FPauseTab& T : TabDefs) {
		if (Gated(T)) {
			Out.push_back(T.Key);
		}
	}
	return Out;
}

bool FInsimulPauseMenuModel::IsVisible(const std::string& Key) const {
	const FPauseTab* T = FindTab(Key);
	return T != nullptr && Gated(*T);
}

void FInsimulPauseMenuModel::OpenMenu(const std::string& Tab) {
	bOpen = true;
	if (!Tab.empty() && IsVisible(Tab)) {
		Active = Tab;
	} else if (!IsVisible(Active)) {
		const std::vector<std::string> Keys = VisibleKeys();
		Active = Keys.empty() ? std::string() : Keys.front();
	}
}

void FInsimulPauseMenuModel::Toggle() {
	if (bOpen) {
		CloseMenu();
	} else {
		OpenMenu();
	}
}

bool FInsimulPauseMenuModel::SetActive(const std::string& Key) {
	if (!IsVisible(Key)) {
		return false;
	}
	Active = Key;
	return true;
}

} // namespace insimul
