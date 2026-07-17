#!/usr/bin/env bash
# run-connect-tests.sh — host gate for the in-editor v1 client + session logic
# (US-XE1). Compiles the UE-FREE portable session core
# (Source/InsimulEditor/Portable/InsimulEditorSession.cpp + InsimulV1Operations.cpp)
# together with the InsimulRuntime portable JSON slice + the test driver under a
# plain C++ toolchain — no cmake, no UBT, no Unreal Engine. Proves the editor
# client's decision logic: operation-table conformance against the generated
# operations.json, request building, health parsing, and the full login -> token
# -> authed call -> 401 -> re-auth-prompt lifecycle — the same cases the Unity leg
# (EditorSessionTests) and the Godot leg (operations.test.ts) prove.
#
# It ALSO grep-guards the portable core: like the resolver it must pull in NO
# Unreal headers/types so it host-tests on a bare box (the UE-coupled seams under
# Private/Connect — FHttpModule transport, GConfig secret store, session service —
# sit ON TOP, syntax-gated only).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EDITOR_DIR="$REPO_ROOT/packages/unreal/Source/InsimulEditor"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
OPERATIONS_JSON="$REPO_ROOT/packages/core/openapi/operations.json"

# --- 1. grep-guard: the session core must be UE-free ------------------------
echo "== grep-guard: editor session core must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Http|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b'
guard_leak=0
for f in \
  "$EDITOR_DIR/Portable/InsimulEditorSession.h" \
  "$EDITOR_DIR/Portable/InsimulEditorSession.cpp" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.h" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into the editor session core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the session core"

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

echo "== compiling editor session host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$EDITOR_DIR/Portable/InsimulEditorSession.cpp" \
  "$EDITOR_DIR/Portable/InsimulV1Operations.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$EDITOR_DIR/Tests/test_editor_session.cpp" \
  -I "$EDITOR_DIR/Portable" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_editor_session"

echo "== running editor session host tests =="
"$OUT/test_editor_session" "$OPERATIONS_JSON"
