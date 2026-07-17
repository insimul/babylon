#!/usr/bin/env bash
# run.sh — build libinsimul and run the Unity Prolog wrapper verification harness.
#
# This is the authoritative host-side gate for US-UP1/2/3: it exercises the pure
# C# wrapper (packages/unity/Runtime/Prolog/) against a REAL, locally built
# libinsimul dylib — no Unity editor required. autoMerge is off for this branch,
# so a human/CI machine with the .NET SDK + a C toolchain runs this before merge.
#
# Requirements: dotnet SDK (net8), cmake, a C compiler, and the insimul-native
# source tree (from libinsimul-bootstrap).
#
# Locating insimul-native (first hit wins):
#   1. $INSIMUL_NATIVE_DIR (explicit override)
#   2. a prebuilt dylib in $INSIMUL_NATIVE_LIB (skip the build entirely)
#   3. ../insimul-native or ../../insimul-native relative to the repo root
#
# Usage:
#   tools/verify-unity/run.sh            # build native + run all tests
#   tools/verify-unity/run.sh --pure     # skip the native build, pure tests only
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

PURE_ONLY=0
[[ "${1:-}" == "--pure" ]] && PURE_ONLY=1

if ! command -v dotnet >/dev/null 2>&1; then
  echo "ERROR: dotnet SDK not found on PATH. Install .NET 8 SDK." >&2
  exit 127
fi

if [[ "$PURE_ONLY" == "1" ]]; then
  echo ">> pure-only run (no native library)"
  exec dotnet run --project "$HERE/verify-unity.csproj" -c Release -- --pure-only
fi

# --- Locate / build libinsimul ------------------------------------------------

find_native_dir() {
  if [[ -n "${INSIMUL_NATIVE_DIR:-}" && -d "$INSIMUL_NATIVE_DIR" ]]; then
    echo "$INSIMUL_NATIVE_DIR"; return 0
  fi
  for cand in "$REPO_ROOT/../insimul-native" "$REPO_ROOT/../../insimul-native"; do
    if [[ -d "$cand" ]]; then echo "$cand"; return 0; fi
  done
  return 1
}

# Determine the platform-specific library filename.
case "$(uname -s)" in
  Darwin) LIBNAME="libinsimul.dylib"; LDVAR="DYLD_LIBRARY_PATH" ;;
  Linux)  LIBNAME="libinsimul.so";    LDVAR="LD_LIBRARY_PATH" ;;
  *)      LIBNAME="insimul.dll";       LDVAR="PATH" ;;
esac

LIBDIR=""
if [[ -n "${INSIMUL_NATIVE_LIB:-}" && -f "$INSIMUL_NATIVE_LIB" ]]; then
  echo ">> using prebuilt library: $INSIMUL_NATIVE_LIB"
  LIBDIR="$(cd "$(dirname "$INSIMUL_NATIVE_LIB")" && pwd)"
else
  NATIVE_DIR="$(find_native_dir || true)"
  if [[ -z "$NATIVE_DIR" ]]; then
    echo "ERROR: could not locate insimul-native. Set INSIMUL_NATIVE_DIR (source) or" >&2
    echo "       INSIMUL_NATIVE_LIB (a prebuilt $LIBNAME), or run with --pure." >&2
    exit 1
  fi
  echo ">> building libinsimul from: $NATIVE_DIR"
  BUILD_DIR="$NATIVE_DIR/build"
  cmake -S "$NATIVE_DIR" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release
  cmake --build "$BUILD_DIR" --config Release
  # Find the freshly built library anywhere under the build tree.
  FOUND="$(find "$BUILD_DIR" -name "$LIBNAME" -print -quit 2>/dev/null || true)"
  if [[ -z "$FOUND" ]]; then
    echo "ERROR: built $NATIVE_DIR but $LIBNAME was not produced under $BUILD_DIR." >&2
    exit 1
  fi
  LIBDIR="$(cd "$(dirname "$FOUND")" && pwd)"
fi

echo ">> $LIBNAME on loader path: $LIBDIR"
export "$LDVAR"="$LIBDIR:${!LDVAR:-}"

exec dotnet run --project "$HERE/verify-unity.csproj" -c Release
