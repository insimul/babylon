// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulUIThemeTokens.h"

namespace insimul {

std::vector<std::pair<std::string, std::string>> FInsimulUIThemeTokens::Colors() {
	// Mirrors packages/core/conformance/ui/theme-tokens.json -> colors.
	return {
		{"background", "#12141c"},
		{"surface", "#1b1e2a"},
		{"surface_alt", "#242838"},
		{"overlay", "#0a0b10cc"},
		{"border", "#333a52"},
		{"text_primary", "#eef1f8"},
		{"text_secondary", "#9aa3bd"},
		{"text_disabled", "#5a6076"},
		{"accent", "#5b8cff"},
		{"accent_hover", "#7aa2ff"},
		{"accent_pressed", "#3f6fe0"},
		{"success", "#4ecb8d"},
		{"warning", "#e6b34d"},
		{"danger", "#e05a6a"},
		{"quest", "#c9a24b"},
	};
}

std::vector<std::pair<std::string, int>> FInsimulUIThemeTokens::Spacing() {
	return {{"xs", 4}, {"sm", 8}, {"md", 12}, {"lg", 16}, {"xl", 24}};
}

std::vector<std::pair<std::string, int>> FInsimulUIThemeTokens::Radius() {
	return {{"sm", 4}, {"md", 8}, {"lg", 12}};
}

std::vector<std::pair<std::string, int>> FInsimulUIThemeTokens::FontSize() {
	return {{"caption", 12}, {"body", 16}, {"title", 22}, {"display", 32}};
}

std::string FInsimulUIThemeTokens::Color(const std::string& Name) {
	for (const auto& Pair : Colors()) {
		if (Pair.first == Name) {
			return Pair.second;
		}
	}
	return std::string();
}

} // namespace insimul
