#!/usr/bin/env bash
# run-binding-tests.sh — host gate for the Asset Binding Layer resolver core
# (US-XG1). Compiles the UE-FREE portable resolver
# (Source/InsimulEditor/Portable/InsimulBindingResolver.cpp) together with the
# InsimulRuntime portable JSON slice (InsimulJson.cpp + InsimulCanonicalJson.cpp)
# and the test driver under a plain C++ toolchain — no cmake, no UBT, no Unreal
# Engine. Runs the shared resolver matrix + cross-engine (Unity) pack round-trip
# + determinism + unbound-report cases.
#
# It ALSO grep-guards the portable resolver core: like the InsimulKB wrapper it
# must pull in NO Unreal headers/types so it host-tests on a bare box (the
# UE-coupled UInsimulBindingTable sits ON TOP and is syntax-gated only).
#
# The fixtures (Tests/fixtures/*.json) are byte-identical to the Godot leg's —
# the one cross-engine contract the Unity/Unreal/Godot binding layers share.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
FIXTURES="$EDITOR_DIR/Tests/fixtures"

# --- 1. grep-guard: the resolver core must be UE-free -----------------------
echo "== grep-guard: InsimulBindingResolver core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$EDITOR_DIR/Portable/InsimulBindingResolver.h" "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the resolver core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulBindingResolver.{h,cpp}"

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

echo "== compiling binding-resolver host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$PORTABLE_DIR/InsimulCanonicalJson.cpp" \
  "$PORTABLE_DIR/InsimulSha256.cpp" \
  "$EDITOR_DIR/Tests/test_binding_resolver.cpp" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_binding_resolver"

echo "== running binding-resolver host tests =="
"$OUT/test_binding_resolver" "$FIXTURES"
