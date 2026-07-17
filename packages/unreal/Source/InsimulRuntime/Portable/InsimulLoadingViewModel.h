// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulLoadingViewModel — the loading-screen view-model driven by the runtime
// startup phases (US-XU1). The boot loop (world source -> save slot -> KB ->
// systems init; see InsimulBootstrap.h / FInsimulRuntimeContext) advances this
// model through an ordered set of weighted phases. The model turns the current
// phase into a MONOTONIC progress fraction in [0, 1], a human label, and a
// deterministic per-phase tip.
//
// Contract + shared cases: packages/core/conformance/ui/loading-phases.json. The
// same weighted-cumulative-progress rule is asserted by every default-UI mirror
// (Babylon / Unity / Godot), so DefaultPhases()/DefaultTips() below MUST match the
// corpus. A custom table can be injected (constructor) to run the shared cases.
//
// std-only (no Unreal Engine) so it host-tests under tools/verify-unreal. The UE
// seam (a UUserWidget subclass — the InsimulIntroSequence / loading widget) drives
// this and paints progress; it never re-implements the progress math.

#pragma once

#include <string>
#include <vector>

namespace insimul {

/** One ordered loading phase: a stable key, a human label, and a weight. */
struct FLoadingPhase {
	std::string Key;
	std::string Label;
	int Weight = 1;
};

class FInsimulLoadingViewModel {
public:
	FInsimulLoadingViewModel();

	/** Inject a custom phase table / tip pool (used to run the shared corpus). */
	FInsimulLoadingViewModel(std::vector<FLoadingPhase> Phases, std::vector<std::string> Tips);

	/** The canonical phase table, mirroring loading-phases.json -> phases. */
	static std::vector<FLoadingPhase> DefaultPhases();

	/** The deterministic tip pool, mirroring loading-phases.json -> tips. */
	static std::vector<std::string> DefaultTips();

	/**
	 * Advance to a named phase. Progress is clamped MONOTONIC — re-entering the
	 * current phase, or an earlier one, never lowers the bar. An unknown key is a
	 * no-op.
	 */
	void Advance(const std::string& Key);

	/** Current cumulative progress fraction in [0, 1]. */
	double Progress() const { return ProgressValue; }

	/** Human label of the current phase ("" before the first advance). */
	std::string Label() const;

	/** Deterministic per-phase tip (phase index modulo the tip pool). */
	std::string Tip() const;

	/** The current phase key ("" before the first advance). */
	std::string CurrentPhase() const { return CurrentKey; }

	/** True once the final (terminal) phase has been reached. */
	bool IsComplete() const;

	/** Reset to the pre-boot state (progress 0, no phase). */
	void Reset();

private:
	int IndexOf(const std::string& Key) const;

	std::vector<FLoadingPhase> Phases;
	std::vector<std::string> Tips;
	int TotalWeight = 1;
	std::string CurrentKey;
	double ProgressValue = 0.0;
};

} // namespace insimul
