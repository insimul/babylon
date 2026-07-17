#!/usr/bin/env bash
# run-scene-tests.sh — host gate for the scene-generation placement math core
# (US-XG2). Compiles the UE-FREE portable placement core
# (Source/InsimulEditor/Portable/InsimulScenePlacement.cpp) together with the
# resolver core it consumes (InsimulBindingResolver.cpp) and the InsimulRuntime
# portable JSON slice (InsimulJson.cpp + InsimulCanonicalJson.cpp + InsimulSha256.cpp)
# and the test driver under a plain C++ toolchain — no cmake, no UBT, no Unreal
# Engine. Runs the cross-engine determinism gate: ComputePlacement over the shared
# golden IR reproduces the NUMERIC contract of Unity's committed golden manifest.
#
# It ALSO grep-guards the placement core: like the binding resolver it must pull
# in NO Unreal headers/types so it host-tests on a bare box (the UE-coupled
# materializer sits ON TOP and is syntax-gated only).
#
# The golden IR (Tests/fixtures/scene/golden-ir.json) + the reference manifest
# (unity-golden-placement-manifest.json) are byte-copied from the Unity leg
# (packages/unity/Tests/Editor/fixtures/scene/) — the one cross-engine placement
# contract Unity/Unreal/Godot generate against.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
FIXTURES="$EDITOR_DIR/Tests/fixtures/scene"

# --- 1. grep-guard: the placement core must be UE-free ----------------------
echo "== grep-guard: InsimulScenePlacement core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Landscape|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$EDITOR_DIR/Portable/InsimulScenePlacement.h" "$EDITOR_DIR/Portable/InsimulScenePlacement.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the placement core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulScenePlacement.{h,cpp}"

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

echo "== compiling scene-placement host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulScenePlacement.cpp" \
  "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$PORTABLE_DIR/InsimulCanonicalJson.cpp" \
  "$PORTABLE_DIR/InsimulSha256.cpp" \
  "$EDITOR_DIR/Tests/test_scene_placement.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_scene_placement"

echo "== running scene-placement host tests =="
"$OUT/test_scene_placement" "$FIXTURES"
