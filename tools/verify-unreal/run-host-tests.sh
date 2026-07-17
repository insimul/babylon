#!/usr/bin/env bash
#
# US-XP1 host verification for the plain C++ InsimulKB wrapper.
#
#   1. grep-guard: assert the wrapper core (InsimulKB.{h,cpp}) pulls in NO Unreal
#      headers / types — it must stay engine-agnostic.
#   2. build + run the wrapper unit tests against a locally built libinsimul.
#
# libinsimul is consumed from an insimul-native checkout (its build/ holds the
# static archive). Point at one with INSIMUL_NATIVE_ROOT, else common locations
# are probed. If the static lib is missing it is built (requires cmake + network
# for the pinned Trealla fetch, on first build only).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
WRAPPER_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Private/Prolog"

# --- 1. grep-guard: no UE headers/types in the wrapper core -----------------
# Strip // line comments first so the guard checks CODE, not the docs (which
# name these tokens to explain the invariant).
echo "== grep-guard: InsimulKB core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in "$WRAPPER_DIR/InsimulKB.h" "$WRAPPER_DIR/InsimulKB.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the InsimulKB core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in InsimulKB.{h,cpp}"

# --- 2. locate a built libinsimul -------------------------------------------
NATIVE="${INSIMUL_NATIVE_ROOT:-}"
if [ -z "$NATIVE" ]; then
  for c in \
    "$REPO_ROOT/../insimul-native" \
    "$(cd "$REPO_ROOT/../.." 2>/dev/null && pwd)/insimul-native" \
    "$HOME/Development/workspace/insimul-native"; do
    if [ -n "$c" ] && [ -f "$c/include/insimul.h" ]; then NATIVE="$c"; break; fi
  done
fi
if [ -z "$NATIVE" ] || [ ! -f "$NATIVE/include/insimul.h" ]; then
  echo "FAIL: insimul-native checkout not found; set INSIMUL_NATIVE_ROOT." >&2
  exit 2
fi
echo "== libinsimul source: $NATIVE =="

if [ ! -f "$NATIVE/build/libinsimul.a" ]; then
  echo "  building libinsimul (first run) ..."
  cmake -S "$NATIVE" -B "$NATIVE/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build "$NATIVE/build" --target insimul >/dev/null
fi

# --- 3. build + run the wrapper unit tests ----------------------------------
BUILD="$HERE/host-test/build"
echo "== building wrapper host tests =="
cmake -S "$HERE/host-test" -B "$BUILD" -DINSIMUL_NATIVE_ROOT="$NATIVE" >/dev/null
cmake --build "$BUILD" >/dev/null
echo "== running wrapper host tests =="
ctest --test-dir "$BUILD" --output-on-failure
