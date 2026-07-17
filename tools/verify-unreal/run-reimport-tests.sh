#!/usr/bin/env bash
# run-reimport-tests.sh — host gate for the conservative re-import diff policy
# (US-XG4). Compiles the UE-FREE portable policy core
# (Source/InsimulEditor/Portable/InsimulReimportDiff.cpp) together with the scene
# placement core (for FPlacedNode) + the resolver core + the InsimulRuntime
# portable JSON slice + the test driver under a plain C++ toolchain — no cmake,
# no UBT, no Unreal Engine. Proves the re-import POLICY: entityId matching,
# generated-only updates, hand-edits untouched, dropped-generated -> Deprecated,
# and a canonical dry-run report byte-identical to the cross-engine golden.
#
# It ALSO grep-guards the portable core: like the resolver / placement cores it
# must pull in NO Unreal headers/types so it host-tests on a bare box (the
# UE-coupled applier Private/InsimulReimport.cpp sits ON TOP and is syntax-gated).
#
# The reimport fixtures (old/new manifest + golden-diff-report.json) are
# byte-identical to Unity's + Godot's — the one cross-engine re-import contract.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
FIXTURES="$EDITOR_DIR/Tests/fixtures"

# --- 1. grep-guard: the re-import policy core must be UE-free -----------------
echo "== grep-guard: InsimulReimportDiff core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$EDITOR_DIR/Portable/InsimulReimportDiff.h" "$EDITOR_DIR/Portable/InsimulReimportDiff.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the re-import policy core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulReimportDiff.{h,cpp}"

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

echo "== compiling re-import diff host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulReimportDiff.cpp" \
  "$EDITOR_DIR/Portable/InsimulScenePlacement.cpp" \
  "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$PORTABLE_DIR/InsimulCanonicalJson.cpp" \
  "$PORTABLE_DIR/InsimulSha256.cpp" \
  "$EDITOR_DIR/Tests/test_reimport_diff.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_reimport_diff"

echo "== running re-import diff host tests =="
"$OUT/test_reimport_diff" "$FIXTURES"
