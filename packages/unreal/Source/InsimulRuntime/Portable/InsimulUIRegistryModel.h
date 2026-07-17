// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulUIRegistryModel — the UE-free core of the default-runtime UI panel
// registry (US-XU1). Maps a stable panel KEY (e.g. "quest_journal", "inventory",
// "dialogue") to an opaque widget reference, with a creator OVERRIDE layer that
// always wins over the shipped default, plus missing-panel diagnostics.
//
// This is the Unreal mirror of the engine-neutral registry contract; the behavior
// (default lookup, override precedence, missing diagnostics) is pinned by the
// shared cases in packages/core/conformance/ui/registry-cases.json — the SAME
// cases the Babylon reference and the Unity/Godot legs run. Only the concrete
// default map differs per engine (here: WBP asset paths).
//
// std-only (no Unreal Engine, no CoreMinimal.h) so it host-tests under
// tools/verify-unreal. The UE seam is UInsimulUIRegistry (a UDataAsset over
// TSoftClassPtr<UUserWidget>, referenced from UInsimulSettings) which is a thin,
// syntax-gated layer that mirrors this resolution — see Public/InsimulUIRegistry.h.

#pragma once

#include <string>
#include <utility>
#include <vector>

namespace insimul {

/** A creator-facing diagnostic recorded when a panel cannot be resolved. */
struct FUIRegistryDiagnostic {
	/** "missing_panel" (no key) — extend with load-time kinds at the UE seam. */
	std::string Kind;
	std::string Key;
	std::string Message;
};

/**
 * The panel registry resolution core. Two layers merged on lookup:
 *   1. Defaults — the shipped panel map (opaque refs). Constructed with a custom
 *      map to run the shared cases; DefaultPanelMap() supplies the real WBP set.
 *   2. Overrides — creator replacements applied via Register()/ApplyOverrides();
 *      a per-key override ALWAYS wins over the default.
 * SceneRef() returns "" and records a diagnostic for an unknown key.
 */
class FInsimulUIRegistryModel {
public:
	FInsimulUIRegistryModel() = default;

	/** Seed with a default panel map (key -> opaque widget ref). */
	explicit FInsimulUIRegistryModel(std::vector<std::pair<std::string, std::string>> Defaults);

	/** The canonical Unreal default panel map (panel key -> WBP asset path). */
	static std::vector<std::pair<std::string, std::string>> DefaultPanelMap();

	/** Register / override a single panel's widget ref (an override wins). */
	void Register(const std::string& Key, const std::string& Ref);

	/** Apply an override map directly (later keys win). */
	void ApplyOverrides(const std::vector<std::pair<std::string, std::string>>& Overrides);

	/** True if `Key` resolves to a default or an override. */
	bool Has(const std::string& Key) const;

	/** True if `Key` is currently served by a creator override, not the default. */
	bool IsOverridden(const std::string& Key) const;

	/**
	 * The widget ref for `Key` (override wins over default). Returns "" and
	 * records a missing-panel diagnostic when the key is unknown.
	 */
	std::string SceneRef(const std::string& Key);

	/** Non-mutating peek (no diagnostic recorded) — "" when unknown. */
	std::string PeekRef(const std::string& Key) const;

	/** All resolvable panel keys (defaults + overrides), sorted. */
	std::vector<std::string> Keys() const;

	const std::vector<FUIRegistryDiagnostic>& Diagnostics() const { return DiagnosticsList; }
	bool HasDiagnostics() const { return !DiagnosticsList.empty(); }
	void ClearDiagnostics() { DiagnosticsList.clear(); }

private:
	const std::string* FindDefault(const std::string& Key) const;
	const std::string* FindOverride(const std::string& Key) const;
	void RecordMissing(const std::string& Key);

	std::vector<std::pair<std::string, std::string>> DefaultsList;
	std::vector<std::pair<std::string, std::string>> OverridesList;
	std::vector<FUIRegistryDiagnostic> DiagnosticsList;
};

} // namespace insimul
