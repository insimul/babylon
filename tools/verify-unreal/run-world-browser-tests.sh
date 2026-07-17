#!/usr/bin/env bash
# run-world-browser-tests.sh — host gate for the World Browser view-model
# (US-XE2). Compiles the UE-FREE portable browser core
# (Source/InsimulEditor/Portable/InsimulWorldBrowserModel.cpp) together with the
# editor session core it depends on (InsimulEditorSession.cpp + InsimulV1Operations.cpp),
# the InsimulRuntime portable JSON slice, and the test driver under a plain C++
# toolchain — no cmake, no UBT, no Unreal Engine. Proves the browser's decision
# logic: parsing (both field namings, bad body, bare + wrapped detail), the list
# load lifecycle (success / server error / 401 re-auth), detail merge, the
# selection reducer, the compatibility badge (imported version vs snapshot), the
# open-in-web URL, import wiring (dry-run / apply / unavailable / backend error),
# and the report summary — the same cases the Unity leg (WorldBrowserTests) and
# the Godot/core leg (world-browser.test.ts) prove.
#
# It ALSO grep-guards the portable core: like the session it must pull in NO
# Unreal headers/types so it host-tests on a bare box (the UE-coupled seams under
# Private/Connect — FHttpModule transport, GConfig imported-world registry, scene
# pipeline bridge — sit ON TOP, syntax-gated only).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"

# --- 1. grep-guard: the browser core must be UE-free ------------------------
echo "== grep-guard: World Browser core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Http|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in \
  "$EDITOR_DIR/Portable/InsimulWorldBrowserModel.h" \
  "$EDITOR_DIR/Portable/InsimulWorldBrowserModel.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the World Browser core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the browser core"

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

echo "== compiling World Browser host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulWorldBrowserModel.cpp" \
  "$EDITOR_DIR/Portable/InsimulEditorSession.cpp" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$EDITOR_DIR/Tests/test_world_browser.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_world_browser"

echo "== running World Browser host tests =="
"$OUT/test_world_browser"
