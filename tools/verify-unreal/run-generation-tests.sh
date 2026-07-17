#!/usr/bin/env bash
# run-generation-tests.sh — host gate for the Generation Console view-model
# (US-XE3). Compiles the UE-FREE portable console core
# (Source/InsimulEditor/Portable/InsimulGenerationConsoleModel.cpp) + the
# host-testable polling timer abstraction (InsimulJobPoller.cpp), the editor
# session core they build a request through (InsimulEditorSession.cpp +
# InsimulV1Operations.cpp), the InsimulRuntime portable JSON slice, and the test
# driver under a plain C++ toolchain — no cmake, no UBT, no Unreal Engine. Proves
# the console's decision logic: start body + parsing (job id / status -> event /
# percent normalize / diff), the job lifecycle over a scripted stream (queued ->
# progress -> completed / failed / premature-close), the start guards (no world /
# 401 re-auth / stream unavailable / refused-while-active), cancel / dispose
# (domain-reload safety) / reset, and the FJobPoller "no leaked ticker" teardown
# (dispose clears the pending timer AND drops a late fetch callback) + maxPolls cap
# + an end-to-end poll -> buffered stream -> model completion — the same cases the
# Unity leg (GenerationConsoleTests) and the Godot/core leg
# (generation-console.test.ts / job-poller.test.ts) prove.
#
# It ALSO grep-guards the portable core: like the session it must pull in NO Unreal
# headers/types so it host-tests on a bare box (the UE-coupled seams under
# Private/Connect — the FHttpModule poll stream + window — sit ON TOP, syntax-gated
# only).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"

# --- 1. grep-guard: the console core must be UE-free ------------------------
echo "== grep-guard: Generation Console core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Http|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in \
  "$EDITOR_DIR/Portable/InsimulGenerationConsoleModel.h" \
  "$EDITOR_DIR/Portable/InsimulGenerationConsoleModel.cpp" \
  "$EDITOR_DIR/Portable/InsimulJobPoller.h" \
  "$EDITOR_DIR/Portable/InsimulJobPoller.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the Generation Console core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the console core"

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

echo "== compiling Generation Console host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulGenerationConsoleModel.cpp" \
  "$EDITOR_DIR/Portable/InsimulJobPoller.cpp" \
  "$EDITOR_DIR/Portable/InsimulEditorSession.cpp" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$EDITOR_DIR/Tests/test_generation_console.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_generation_console"

echo "== running Generation Console host tests =="
"$OUT/test_generation_console"
