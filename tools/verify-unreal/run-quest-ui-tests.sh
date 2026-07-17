#!/usr/bin/env bash
# run-quest-ui-tests.sh — host gate for the Unreal default-UI quest panels +
# toast notifications (US-XU2). Compiles the UE-FREE portable cores
# (Source/InsimulRuntime/Portable/InsimulQuestJournalModel.cpp,
# InsimulNotifications.cpp), the portable JSON slice, and the test driver under a
# plain C++ toolchain — no cmake, no UBT, no Unreal Engine. Proves the SAME
# engine-neutral cases every default-UI mirror runs
# (packages/core/conformance/ui/quest-journal-cases.json): the journal (tab
# filtering + counts), the tracker HUD (bounded tracked set), the offer dialog
# (accept/decline), radiant arrival via upsert; PLUS the event-driven update
# surface (every mutation pushes an event — no polling; read-only/rejected ops are
# silent) and the toast notifications core (push/tick-expiry/dismiss/kind->color
# and the quest-events-drive-toasts integration).
#
# It ALSO grep-guards the cores: like every other portable core they must pull in
# NO Unreal headers/types so they host-test on a bare box (the UE seams —
# UInsimulQuestJournal with its dynamic multicast delegate, the quest UUserWidgets
# — sit ON TOP, syntax-gated only via check.mjs).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PORTABLE_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Portable"
TESTS_DIR="$REPO_ROOT/packages/unreal/Source/InsimulRuntime/Tests"
CORPUS_DIR="$REPO_ROOT/packages/core/conformance/ui"

# --- 1. grep-guard: the quest-UI cores must be UE-free ----------------------
echo "== grep-guard: quest-UI cores must be UE-free =="
FORBIDDEN='CoreMinimal|#include "Engine|#include "UObject|#include "GameFramework|#include "Blueprint|#include "Components|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|GENERATED_BODY|\bFString\b|\bTArray\b|\bTMap\b|\bUWorld\b|\bAActor\b|\bUUserWidget\b'
guard_leak=0
for f in \
  "$PORTABLE_DIR/InsimulQuestJournalModel.h" \
  "$PORTABLE_DIR/InsimulQuestJournalModel.cpp" \
  "$PORTABLE_DIR/InsimulNotifications.h" \
  "$PORTABLE_DIR/InsimulNotifications.cpp"; do
  if sed 's://.*$::' "$f" | grep -nE "$FORBIDDEN"; then
    echo "  ^ in $f" >&2
    guard_leak=1
  fi
done
if [ "$guard_leak" -ne 0 ]; then
  echo "FAIL: Unreal header/type leaked into a quest-UI core (see matches above)." >&2
  exit 1
fi
echo "  ok   no Unreal headers/types in the quest-UI cores"

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

echo "== compiling quest-UI host tests with $CXX =="
"$CXX" -std=c++17 -Wall -Wextra -O0 -g \
  "$PORTABLE_DIR/InsimulQuestJournalModel.cpp" \
  "$PORTABLE_DIR/InsimulNotifications.cpp" \
  "$PORTABLE_DIR/InsimulJson.cpp" \
  "$TESTS_DIR/test_quest_journal.cpp" \
  -I "$PORTABLE_DIR" \
  -o "$OUT/test_quest_journal"

echo "== running quest-UI host tests =="
"$OUT/test_quest_journal" "$CORPUS_DIR"
