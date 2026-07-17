#!/usr/bin/env bash
# run-dialogue-ui-tests.sh — host gate for the Unreal default-UI dialogue /
# pause-menu / save-load view-models (US-XU4). Compiles the UE-FREE portable cores
# (InsimulChatModel, InsimulPauseMenuModel, InsimulSaveSlotModel), the portable
# JSON slice, and the test driver under a plain C++ toolchain — no cmake, no UBT,
# no Unreal Engine. Proves the SAME engine-neutral cases every default-UI mirror
# runs: chat-cases.json (streaming turn lifecycle + actions + history projection),
# pause-menu-cases.json (module-bundle tab-gating + open/active reducer), and
# save-slot-cases.json (codec-outcome -> row rendering, incl. the corrupted-envelope
# messaging cross-engine contract).
#
# It ALSO grep-guards the cores: like every other portable core they must pull in
# NO Unreal headers/types so they host-test on a bare box (the UE seams —
# UInsimulChatPanel / UInsimulPauseMenu / UInsimulSaveSlotPanel — sit ON TOP,
# syntax-gated only via check.mjs).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
TESTS_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Tests"
CORPUS_DIR="$REPO_ROOT/packages/core/conformance/ui"

# --- 1. grep-guard: the dialogue/menu/save cores must be UE-free ------------
echo "== grep-guard: dialogue/menu/save cores must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Blueprint|#include "Components|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b|\bUUserWidget\b'
guard_leak=0
for f in \
  "$PORTABLE_DIR/InsimulChatModel.h" \
  "$PORTABLE_DIR/InsimulChatModel.cpp" \
  "$PORTABLE_DIR/InsimulPauseMenuModel.h" \
  "$PORTABLE_DIR/InsimulPauseMenuModel.cpp" \
  "$PORTABLE_DIR/InsimulSaveSlotModel.h" \
  "$PORTABLE_DIR/InsimulSaveSlotModel.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into a dialogue/menu/save core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the dialogue/menu/save cores"

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

echo "== compiling dialogue/menu/save host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$PORTABLE_DIR/InsimulChatModel.cpp" \
  "$PORTABLE_DIR/InsimulPauseMenuModel.cpp" \
  "$PORTABLE_DIR/InsimulSaveSlotModel.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$TESTS_DIR/test_dialogue_ui.cpp" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_dialogue_ui"

echo "== running dialogue/menu/save host tests =="
"$OUT/test_dialogue_ui" "$CORPUS_DIR"
