#!/usr/bin/env bash
# run-conversation-tests.sh — host gate for the in-editor NPC Conversation Tester
# view-model (US-XE4). Compiles the UE-FREE portable tester core
# (Source/InsimulEditor/Portable/InsimulConversationTesterModel.cpp), the editor
# session core it loads characters through (InsimulEditorSession.cpp +
# InsimulV1Operations.cpp), the InsimulRuntime portable JSON slice, and the test
# driver under a plain C++ toolchain — no cmake, no UBT, no Unreal Engine. Proves the
# tester's decision logic: static parsing (send body / character list / SSE lines),
# character load (populate picker / empty world / no credential / 401 re-auth), the
# send guards (no character / empty text / no credential / while busy / stream
# unavailable), the turn lifecycle over a scripted stream (chunks -> complete /
# streaming across pumps / audio counted / error / premature close), and the
# multi-turn-over-one-session / character-switch-reset / dispose-on-teardown cases —
# the same cases the Unity leg (ConversationTesterTests) and the core leg
# (conversation-tester.test.ts) prove.
#
# It ALSO grep-guards the portable core: like the session it must pull in NO Unreal
# headers/types so it host-tests on a bare box (the UE-coupled seam under
# Private/Connect — the FHttpModule SSE stream + window — sits ON TOP, syntax-gated
# only).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"

# --- 1. grep-guard: the tester core must be UE-free -------------------------
echo "== grep-guard: Conversation Tester core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Http|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in \
  "$EDITOR_DIR/Portable/InsimulConversationTesterModel.h" \
  "$EDITOR_DIR/Portable/InsimulConversationTesterModel.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the Conversation Tester core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the tester core"

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

echo "== compiling Conversation Tester host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulConversationTesterModel.cpp" \
  "$EDITOR_DIR/Portable/InsimulEditorSession.cpp" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$EDITOR_DIR/Tests/test_conversation_tester.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_conversation_tester"

echo "== running Conversation Tester host tests =="
"$OUT/test_conversation_tester"
