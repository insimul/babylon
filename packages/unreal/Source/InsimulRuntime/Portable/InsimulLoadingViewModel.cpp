// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulLoadingViewModel.h"

#include <algorithm>
#include <utility>

namespace insimul {

std::vector<FLoadingPhase> FInsimulLoadingViewModel::DefaultPhases() {
	// Mirrors packages/core/conformance/ui/loading-phases.json -> phases.
	return {
		{"init", "Starting up\xE2\x80\xA6", 1},
		{"world", "Loading world\xE2\x80\xA6", 3},
		{"save", "Restoring save\xE2\x80\xA6", 2},
		{"kb", "Building knowledge base\xE2\x80\xA6", 2},
		{"systems", "Initializing systems\xE2\x80\xA6", 1},
		{"ready", "Ready", 1},
	};
}

std::vector<std::string> FInsimulLoadingViewModel::DefaultTips() {
	return {
		"Talk to villagers to uncover radiant quests.",
		"Every conversation is generated live \xE2\x80\x94 no two runs are alike.",
		"Check the quest journal (J) to track objectives.",
		"Your progress autosaves to the active slot.",
	};
}

FInsimulLoadingViewModel::FInsimulLoadingViewModel()
	: FInsimulLoadingViewModel(DefaultPhases(), DefaultTips()) {}

FInsimulLoadingViewModel::FInsimulLoadingViewModel(
	std::vector<FLoadingPhase> InPhases, std::vector<std::string> InTips)
	: Phases(std::move(InPhases)), Tips(std::move(InTips)) {
	if (Phases.empty()) {
		Phases = DefaultPhases();
	}
	if (Tips.empty()) {
		Tips = DefaultTips();
	}
	TotalWeight = 0;
	for (const FLoadingPhase& Phase : Phases) {
		TotalWeight += Phase.Weight;
	}
	if (TotalWeight <= 0) {
		TotalWeight = 1;
	}
}

int FInsimulLoadingViewModel::IndexOf(const std::string& Key) const {
	for (int i = 0; i < static_cast<int>(Phases.size()); ++i) {
		if (Phases[i].Key == Key) {
			return i;
		}
	}
	return -1;
}

void FInsimulLoadingViewModel::Advance(const std::string& Key) {
	const int Idx = IndexOf(Key);
	if (Idx < 0) {
		return;
	}
	CurrentKey = Key;
	int Cumulative = 0;
	for (int i = 0; i <= Idx; ++i) {
		Cumulative += Phases[i].Weight;
	}
	const double NextProgress = static_cast<double>(Cumulative) / static_cast<double>(TotalWeight);
	ProgressValue = std::max(ProgressValue, NextProgress);
}

std::string FInsimulLoadingViewModel::Label() const {
	const int Idx = IndexOf(CurrentKey);
	return Idx < 0 ? std::string() : Phases[Idx].Label;
}

std::string FInsimulLoadingViewModel::Tip() const {
	const int Idx = IndexOf(CurrentKey);
	if (Idx < 0 || Tips.empty()) {
		return std::string();
	}
	return Tips[static_cast<std::size_t>(Idx) % Tips.size()];
}

bool FInsimulLoadingViewModel::IsComplete() const {
	if (Phases.empty()) {
		return false;
	}
	return CurrentKey == Phases.back().Key;
}

void FInsimulLoadingViewModel::Reset() {
	CurrentKey.clear();
	ProgressValue = 0.0;
}

} // namespace insimul
