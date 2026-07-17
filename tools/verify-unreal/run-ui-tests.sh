#!/usr/bin/env bash
# run-ui-tests.sh — host gate for the Unreal default-UI cores (US-XU1). Compiles
# the UE-FREE portable UI cores (Source/InsimulRuntime/Portable/InsimulUIRegistryModel
# .cpp, InsimulLoadingViewModel.cpp, InsimulUIThemeTokens.cpp), the portable JSON
# slice, and the test driver under a plain C++ toolchain — no cmake, no UBT, no
# Unreal Engine. Proves the SAME engine-neutral cases every default-UI mirror runs
# (packages/core/conformance/ui/*.json): the panel registry (default lookup /
# creator-override precedence / missing-panel diagnostics), the loading view-model
# (weighted cumulative progress / monotonicity / labels / completion / per-phase
# tips), and the theme token table (byte-for-byte vs theme-tokens.json).
#
# It ALSO grep-guards the cores: like every other portable core they must pull in
# NO Unreal headers/types so they host-test on a bare box (the UE seams —
# UInsimulUIRegistry / UInsimulUITheme UDataAssets, the loading UUserWidget — sit
# ON TOP, syntax-gated only via check.mjs).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
TESTS_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Tests"
CORPUS_DIR="$REPO_ROOT/packages/core/conformance/ui"

# --- 1. grep-guard: the UI cores must be UE-free ----------------------------
echo "== grep-guard: default-UI cores must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Blueprint|#include "Components|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b|\bUUserWidget\b'
guard_leak=0
for f in \
  "$PORTABLE_DIR/InsimulUIRegistryModel.h" \
  "$PORTABLE_DIR/InsimulUIRegistryModel.cpp" \
  "$PORTABLE_DIR/InsimulLoadingViewModel.h" \
  "$PORTABLE_DIR/InsimulLoadingViewModel.cpp" \
  "$PORTABLE_DIR/InsimulUIThemeTokens.h" \
  "$PORTABLE_DIR/InsimulUIThemeTokens.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into a default-UI core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the default-UI cores"

# --- 2. pick a C++ compiler -------------------------------------------------
CXX="${CXX:-}"
if [ -z "$CXX" ]; then
  if command -v clang++ >/dev/null 2>&1; then CXX=clang++
  elif command -v c++ >/dev/null 2>&1; then CXX=c++
  elif command -v g++ >/dev/null 2>&1; then CXX=g++
  else echo "error: no C++ compiler found (clang++/c++/g++)" >&2; exit 127
  fi
fi

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "== compiling default-UI host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$PORTABLE_DIR/InsimulUIRegistryModel.cpp" \
  "$PORTABLE_DIR/InsimulLoadingViewModel.cpp" \
  "$PORTABLE_DIR/InsimulUIThemeTokens.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$TESTS_DIR/test_ui_registry.cpp" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_ui_registry"

echo "== running default-UI host tests =="
"$OUT/test_ui_registry" "$CORPUS_DIR"
