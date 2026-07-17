// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulPauseMenuModel — the host-testable, portable pause/ESC-menu tab-gating
// view-model for the unified in-game menu (US-XU4, InsimulGameMenuWidget /
// InsimulPauseMenuWidget). The Unreal mirror of the engine-neutral pause-menu
// contract (packages/core/src/ui/pause-menu-model.ts; the Godot leg is
// addons/insimul/ui/pause_menu_model.gd).
//
// An ordered set of tabs, each optionally GATED by the feature modules the active
// genre bundle enabled (the feature-modules registry from the IR). A tab with no
// requirements is always shown; a gated tab shows only when EVERY required module
// is enabled (AND-gating). The UUserWidget owns pause state + input; this pure core
// owns only which tabs are visible and the open/active-tab reducer.
//
// std-only (no Unreal Engine, no CoreMinimal.h) so the whole contract runs under
// tools/verify-unreal/run-dialogue-ui-tests.sh. Every default-UI leg runs the SAME
// matrix (packages/core/conformance/ui/pause-menu-cases.json) so the four legs
// cannot diverge on which tabs a genre bundle unlocks.

#pragma once

#include <string>
#include <vector>

namespace insimul {

/** One menu tab. Requires is the AND-set of feature modules that must be enabled
 *  for the tab to show (empty = ungated core tab). */
struct FPauseTab {
	std::string Key;
	std::string Label;
	std::vector<std::string> Requires;
};

class FInsimulPauseMenuModel {
public:
	FInsimulPauseMenuModel() { InitFromDefaults(); }

	/** Build with the enabled feature-module set. When Tabs is empty the shared
	 *  default tab set is used. */
	explicit FInsimulPauseMenuModel(const std::vector<std::string>& EnabledModules,
			const std::vector<FPauseTab>& Tabs = std::vector<FPauseTab>());

	/** The shared default tabs (core tabs ungated; learning/progression tabs gated
	 *  on a single module) — mirrors DEFAULT_TABS in every other default-UI leg. */
	static std::vector<FPauseTab> DefaultTabs();

	// ── Gating ──────────────────────────────────────────────────────────────────

	/** Tabs visible under the current module set, in declaration order. */
	std::vector<FPauseTab> VisibleTabs() const;
	std::vector<std::string> VisibleKeys() const;
	bool IsVisible(const std::string& Key) const;

	// ── Open / active-tab reducer ────────────────────────────────────────────────

	/** Open the menu, optionally to a tab (falls back to the first visible tab). */
	void OpenMenu(const std::string& Tab = std::string());
	void CloseMenu() { bOpen = false; }
	void Toggle();
	bool IsOpen() const { return bOpen; }

	/** Switch tabs. Rejected (returns false) for a hidden/unknown tab. */
	bool SetActive(const std::string& Key);
	std::string ActiveTab() const { return Active; }

private:
	std::vector<FPauseTab> TabDefs;
	std::vector<std::string> Enabled;
	bool bOpen = false;
	std::string Active;

	void InitFromDefaults();
	bool ModuleEnabled(const std::string& Module) const;
	bool Gated(const FPauseTab& Tab) const;
	const FPauseTab* FindTab(const std::string& Key) const;
};

} // namespace insimul
