#!/usr/bin/env bash
# run-placeholder-tests.sh — host gate for the bundled placeholder asset pack
# (US-XG3). Compiles the UE-FREE portable pack recipe
# (Source/InsimulEditor/Portable/InsimulPlaceholderPack.cpp) together with the
# resolver core (InsimulBindingResolver.cpp) + the InsimulRuntime portable JSON
# slice + the test driver under a plain C++ toolchain — no cmake, no UBT, no
# Unreal Engine. Proves the coverage contract: every archetype key the golden
# world's IR uses resolves against the placeholder pack with zero unbound.
#
# It ALSO grep-guards the portable pack core: like the resolver it must pull in
# NO Unreal headers/types so it host-tests on a bare box (the UE-coupled
# generator + PCG graph builder sit ON TOP and are syntax-gated only).
#
# The golden-world-archetypes.json fixture is byte-identical to Unity's — the one
# cross-engine coverage contract the Unity/Unreal/Godot placeholder packs share.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
FIXTURES="$EDITOR_DIR/Tests/fixtures"

# --- 1. grep-guard: the placeholder pack core must be UE-free ----------------
echo "== grep-guard: InsimulPlaceholderPack core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$EDITOR_DIR/Portable/InsimulPlaceholderPack.h" "$EDITOR_DIR/Portable/InsimulPlaceholderPack.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the placeholder pack core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulPlaceholderPack.{h,cpp}"

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

echo "== compiling placeholder-pack host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulPlaceholderPack.cpp" \
  "$EDITOR_DIR/Portable/InsimulBindingResolver.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$PORTABLE_DIR/InsimulCanonicalJson.cpp" \
  "$PORTABLE_DIR/InsimulSha256.cpp" \
  "$EDITOR_DIR/Tests/test_placeholder_pack.cpp" \
  -I "$PORTABLE_DIR" \
  -I "$EDITOR_DIR/Portable" \
  -o "$OUT/test_placeholder_pack"

echo "== running placeholder-pack host tests =="
"$OUT/test_placeholder_pack" "$FIXTURES"
