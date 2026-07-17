// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulUIThemeTokens — the UE-free source-of-truth mirror of the shared UI
// design tokens (US-XU1). Every default-runtime UI (Babylon CSS vars, Unity
// UIStyleSheet, Unreal Slate style set, Godot Theme) maps these EXACT tokens into
// its native theme representation; a native theme value that diverges from a token
// here is a parity bug.
//
// The values mirror packages/core/conformance/ui/theme-tokens.json — the single
// source of truth. std-only so the token table host-tests against that JSON under
// tools/verify-unreal. The UE seam (UInsimulUITheme, a UDataAsset over
// FLinearColor / int) maps Color()/Spacing()/… into Slate at the engine boundary.

#pragma once

#include <string>
#include <utility>
#include <vector>

namespace insimul {

/** The shared design-token table, keyed by the token names in theme-tokens.json. */
struct FInsimulUIThemeTokens {
	/** color name -> hex string (e.g. "accent" -> "#5b8cff"), matching JSON. */
	static std::vector<std::pair<std::string, std::string>> Colors();

	/** spacing name -> px (e.g. "md" -> 12). */
	static std::vector<std::pair<std::string, int>> Spacing();

	/** corner radius name -> px. */
	static std::vector<std::pair<std::string, int>> Radius();

	/** font-size name -> px. */
	static std::vector<std::pair<std::string, int>> FontSize();

	/** Hex string for a color token, or "" when unknown. */
	static std::string Color(const std::string& Name);
};

} // namespace insimul
