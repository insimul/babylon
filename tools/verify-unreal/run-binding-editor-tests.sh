#!/usr/bin/env bash
# run-binding-editor-tests.sh — host gate for the Binding Editor view-model logic
# (US-XG4). Compiles the UE-FREE portable view-model core
# (Source/InsimulEditor/Portable/InsimulBindingEditorModel.cpp) together with the
# resolver core + the placeholder pack (for the placeholder tier) + the
# InsimulRuntime portable JSON slice + the test driver under a plain C++
# toolchain — no cmake, no UBT, no Unreal Engine. Proves the editor's decision
# logic: Bound/Placeholder/Unbound status, name/tag suggestion ranking, taxonomy
# grouping, bound/unbound partitioning, and the pack import/export round-trip —
# the same cases the Unity leg (BindingEditorTests) proves.
#
# It ALSO grep-guards the portable core: like the resolver it must pull in NO
# Unreal headers/types so it host-tests on a bare box (the UE-coupled Binding
# Editor widget Public/InsimulBindingEditorWidget.h sits ON TOP, syntax-gated).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
FIXTURES="$EDITOR_DIR/Tests/fixtures"

# --- 1. grep-guard: the view-model core must be UE-free ----------------------
echo "== grep-guard: InsimulBindingEditorModel core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$EDITOR_DIR/Portable/InsimulBindingEditorModel.h" "$EDITOR_DIR/Portable/InsimulBindingEditorModel.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the binding-editor view-model core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulBindingEditorModel.{h,cpp}"

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

echo "== compiling binding-editor view-model host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulBindingEditorModel.cpp" \
  "$EDITOR_DIR/Portable/InsimulPlaceholderPack.cpp" \
  "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$PORTABLE_DIR/InsimulCanonicalJson.cpp" \
  "$PORTABLE_DIR/InsimulSha256.cpp" \
  "$EDITOR_DIR/Tests/test_binding_editor_model.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_binding_editor_model"

echo "== running binding-editor view-model host tests =="
"$OUT/test_binding_editor_model" "$FIXTURES"
