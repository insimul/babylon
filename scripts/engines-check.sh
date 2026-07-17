#!/usr/bin/env bash
# engines-check.sh — native-engine gate for `npm run engines:check`.
#
# The native engine packages (packages/{unity,unreal,godot}) carry toolchain-
# specific tests that the root `npm run check` (tsc) and `npm test` (vitest) do
# NOT cover. This script runs the ones that are runnable on a plain box, but only
# when the relevant engine sources actually changed — so a TS-only diff pays
# nothing. Currently wired: the Godot GDExtension host gates (US-GP1 marshalling
# + US-GP2 conformance corpus). Unity/Unreal legs slot in here as they land.
#
# "Changed" = files differing from the merge-base with the base branch, PLUS any
# uncommitted working-tree changes. If the base can't be resolved (detached CI,
# shallow clone), we fail SAFE and run every wired gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

base_branch="${ENGINES_CHECK_BASE:-main}"

changed=""
if git rev-parse --git-dir >/dev/null 2>&1; then
	base="$(git merge-base HEAD "$base_branch" 2>/dev/null || true)"
	if [[ -n "$base" ]]; then
		changed="$(git diff --name-only "$base" HEAD; git status --porcelain | sed 's/^...//')"
	else
		echo "engines:check: base '$base_branch' unresolved — running all gates"
		changed="__ALL__"
	fi
else
	echo "engines:check: not a git repo — running all gates"
	changed="__ALL__"
fi

changed_matches() { # $1 = path prefix
	[[ "$changed" == "__ALL__" ]] && return 0
	grep -q "^$1" <<<"$changed"
}

ran_any=0

# ---- Unity ------------------------------------------------------------------
# Always run the C# structural syntax gate (no SDK needed). When a .NET SDK IS
# present, also run the pure host harness (tools/verify-unity), which exercises
# the UnityEngine-free cores — the Prolog wrapper AND the US-UC1 world source —
# against the golden fixtures on a bare SDK (no editor, no libinsimul). When
# dotnet is absent we SKIP cleanly so this gate never fails for want of the
# toolchain (autoMerge is off; a human/CI box runs the full suite before merge).
if changed_matches "packages/unity/"; then
	ran_any=1
	echo "== unity: C# structural syntax gate (US-EP3) =="
	node tools/verify-unity/check.mjs
	if command -v dotnet >/dev/null 2>&1; then
		echo "== unity: pure host tests — Prolog wrapper + world source + save system =="
		bash tools/verify-unity/run.sh --pure
	else
		echo "unity: dotnet not found — SKIP host dotnet tests (structural gate only)"
	fi
	# Save-system portability cross-check (US-UC2): recompute the golden integrity
	# vectors from the TS authority (the exact canonical bytes the C# side targets)
	# + validate a C#-produced envelope if the dotnet run wrote one. Needs vite-node.
	echo "== unity: save-system portability cross-check (US-UC2) =="
	npx vite-node tools/verify-unity/cross-check.mjs
	# Quest reward grep-guard (US-UC3): rewards must be READ FROM PROLOG
	# (quest_reward/3), never a denormalized C# default. Fail if the quest core
	# hardcodes a numeric reward assignment (ExperienceReward = <number>).
	echo "== unity: quest reward grep-guard (US-UC3) =="
	if grep -REn 'ExperienceReward[[:space:]]*=[[:space:]]*[0-9]' packages/unity/Runtime/Quest/; then
		echo "unity: FAIL — denormalized reward literal in quest core (read from Prolog instead)"
		exit 1
	fi
	echo "unity: quest reward grep-guard OK (no denormalized reward literals)"
else
	echo "engines:check: no packages/unity/ changes — skipping unity gates"
fi

# ---- Unreal ----------------------------------------------------------------
# Always run the C++ structural syntax gate (no UE SDK needed). The UE-coupled
# layer (subsystems, actors, widgets, UDataAssets) is verified only structurally
# in this harness; a human builds it in a real editor (autoMerge off). The
# UE-FREE portable cores host-test on the clang toolchain: the InsimulKB Prolog
# wrapper (US-XP*, needs a built libinsimul — skipped here) and the Asset Binding
# Layer resolver (US-XG1, no external deps — always runnable).
if changed_matches "packages/unreal/"; then
	ran_any=1
	echo "== unreal: C++ structural syntax gate (US-EP3) =="
	node tools/verify-unreal/check.mjs
	echo "== unreal: Asset Binding Layer resolver host tests (US-XG1) =="
	bash tools/verify-unreal/run-binding-tests.sh
	echo "== unreal: scene-generation placement host tests (US-XG2) =="
	bash tools/verify-unreal/run-scene-tests.sh
	echo "== unreal: placeholder pack coverage host tests (US-XG3) =="
	bash tools/verify-unreal/run-placeholder-tests.sh
	echo "== unreal: re-import diff policy host tests (US-XG4) =="
	bash tools/verify-unreal/run-reimport-tests.sh
	echo "== unreal: binding-editor view-model host tests (US-XG4) =="
	bash tools/verify-unreal/run-binding-editor-tests.sh
	echo "== unreal: editor-connect v1 client + session host tests (US-XE1) =="
	bash tools/verify-unreal/run-connect-tests.sh
	echo "== unreal: World Browser view-model host tests (US-XE2) =="
	bash tools/verify-unreal/run-world-browser-tests.sh
	echo "== unreal: Generation Console view-model host tests (US-XE3) =="
	bash tools/verify-unreal/run-generation-tests.sh
	echo "== unreal: Conversation Tester view-model host tests (US-XE4) =="
	bash tools/verify-unreal/run-conversation-tests.sh
	echo "== unreal: default-UI registry/loading/theme host tests (US-XU1) =="
	bash tools/verify-unreal/run-ui-tests.sh
	echo "== unreal: quest journal/tracker/offer + notifications host tests (US-XU2) =="
	bash tools/verify-unreal/run-quest-ui-tests.sh
else
	echo "engines:check: no packages/unreal/ changes — skipping unreal gates"
fi

# ---- Godot GDExtension -----------------------------------------------------
if changed_matches "packages/godot/"; then
	ran_any=1
	echo "== godot: host marshalling tests (US-GP1) =="
	bash packages/godot/gdextension/test/run_host_tests.sh
	echo "== godot: conformance corpus (US-GP2) =="
	bash packages/godot/gdextension/test/run_conformance.sh
	echo "== godot: portable save-system host tests (US-GC2) =="
	bash packages/godot/gdextension/test/run_save_tests.sh
	echo "== godot: portable quest-system host tests (US-GC3) =="
	bash packages/godot/gdextension/test/run_quest_tests.sh
	echo "== godot: startup-orchestrator host tests (US-GC4, full loop) =="
	bash packages/godot/gdextension/test/run_bootstrap_tests.sh
	echo "== godot: binding-resolver host tests (US-GB1) =="
	bash packages/godot/gdextension/test/run_binding_tests.sh
	echo "== godot: scene-placement host tests (US-GB2) =="
	bash packages/godot/gdextension/test/run_placement_tests.sh
	echo "== godot: re-import diff host tests (US-GB3) =="
	bash packages/godot/gdextension/test/run_reimport_tests.sh
	echo "== godot: GDScript structural lint (US-GP3, godot --check-only stand-in) =="
	python3 packages/godot/gdextension/tests/gdscript_structural_lint.py
	echo "== godot: world-source headless test (US-GC1, skips without a godot binary) =="
	bash packages/godot/addons/insimul/tests/run_world_source_headless.sh
	echo "== godot: save-system headless test (US-GC2, skips without a godot binary/extension) =="
	bash packages/godot/addons/insimul/tests/run_save_system_headless.sh
	echo "== godot: quest-system headless test (US-GC3, skips without a godot binary/extension) =="
	bash packages/godot/addons/insimul/tests/run_quest_system_headless.sh
	echo "== godot: runtime-bootstrap headless test (US-GC4, skips without a godot binary/extension) =="
	bash packages/godot/addons/insimul/tests/run_runtime_bootstrap_headless.sh
	echo "== godot: default-UI registry/loading/notifications headless test (US-GU1, skips without a godot binary) =="
	bash packages/godot/addons/insimul/tests/run_ui_registry_headless.sh
	echo "== godot: default-UI quest+trade headless test (US-GU2, skips without a godot binary) =="
	bash packages/godot/addons/insimul/tests/run_quest_trade_headless.sh
	echo "== godot: default-UI dialogue/menu/save headless test (US-GU3, skips without a godot binary) =="
	bash packages/godot/addons/insimul/tests/run_dialogue_menu_save_headless.sh
	echo "== godot: binding-resolver headless test (US-GB1, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/binding/run_binding_resolver_headless.sh
	echo "== godot: scene-generator headless test (US-GB2, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/scene/run_scene_generator_headless.sh
	echo "== godot: re-import diff headless test (US-GB3, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/reimport/run_reimport_headless.sh
	echo "== godot: binding-dock headless test (US-GB3, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/dock/run_binding_dock_headless.sh
	echo "== godot: editor-connect headless test (US-GE1, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/connect/run_connect_headless.sh
	echo "== godot: World Browser dock headless test (US-GE2, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/browser/run_browser_headless.sh
	echo "== godot: Generation Console dock headless test (US-GE2, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/generation/run_generation_headless.sh
	echo "== godot: Conversation Tester dock headless test (US-GE3, skips without a godot binary) =="
	bash packages/godot/addons/insimul/editor/conversation/run_conversation_headless.sh
else
	echo "engines:check: no packages/godot/ changes — skipping godot gates"
fi

if [[ "$ran_any" -eq 0 ]]; then
	echo "engines:check: no engine sources changed — nothing to run"
fi
echo "engines:check: OK"
