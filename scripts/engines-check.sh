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

# ---- Godot GDExtension -----------------------------------------------------
if changed_matches "packages/godot/"; then
	ran_any=1
	echo "== godot: host marshalling tests (US-GP1) =="
	bash packages/godot/gdextension/test/run_host_tests.sh
	echo "== godot: conformance corpus (US-GP2) =="
	bash packages/godot/gdextension/test/run_conformance.sh
	echo "== godot: portable save-system host tests (US-GC2) =="
	bash packages/godot/gdextension/test/run_save_tests.sh
	echo "== godot: GDScript structural lint (US-GP3, godot --check-only stand-in) =="
	python3 packages/godot/gdextension/tests/gdscript_structural_lint.py
	echo "== godot: world-source headless test (US-GC1, skips without a godot binary) =="
	bash packages/godot/addons/insimul/tests/run_world_source_headless.sh
	echo "== godot: save-system headless test (US-GC2, skips without a godot binary/extension) =="
	bash packages/godot/addons/insimul/tests/run_save_system_headless.sh
else
	echo "engines:check: no packages/godot/ changes — skipping godot gates"
fi

if [[ "$ran_any" -eq 0 ]]; then
	echo "engines:check: no engine sources changed — nothing to run"
fi
echo "engines:check: OK"
