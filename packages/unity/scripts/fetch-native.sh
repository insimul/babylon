#!/usr/bin/env bash
# fetch-native.sh — populate the UPM package's Runtime/Plugins/ with prebuilt
# libinsimul native binaries (US-UP3).
#
# The binaries are NOT committed to the repo (see Runtime/Plugins/.gitignore) —
# they are fetched from a local insimul-native build (produced by
# insimul-native/scripts/package.sh into dist/<platform>/) or from a release
# archive. This script drops each platform's library into the folder layout the
# Unity PluginImporter (Editor/InsimulNativeImporter.cs) keys its import settings
# off of:
#
#   Runtime/Plugins/macOS/libinsimul.dylib          (universal2: x86_64 + arm64)
#   Runtime/Plugins/Windows/x86_64/insimul.dll
#   Runtime/Plugins/Windows/arm64/insimul.dll
#   Runtime/Plugins/Linux/x86_64/libinsimul.so
#   Runtime/Plugins/Linux/arm64/libinsimul.so
#
# Source layout expected under the dist root (insimul-native/dist):
#   dist/macos-x86_64/libinsimul.dylib   dist/macos-arm64/libinsimul.dylib
#   dist/windows-x86_64/insimul.dll      dist/windows-arm64/insimul.dll
#   dist/linux-x86_64/libinsimul.so      dist/linux-arm64/libinsimul.so
#   dist/VERSION                          (semver, e.g. 0.1.0)
#
# Usage:
#   scripts/fetch-native.sh                       # from ../insimul-native/dist
#   scripts/fetch-native.sh --dist /path/to/dist  # explicit dist root
#   scripts/fetch-native.sh --url  https://…/insimul-native-dist.tar.gz
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/.." && pwd)"                 # packages/unity
PLUGINS="$PKG_ROOT/Runtime/Plugins"
WRAPPER="$PKG_ROOT/Runtime/Prolog/InsimulProlog.cs"

DIST=""
URL=""
TMP=""

cleanup() {
  # Must return 0 — this runs as an EXIT trap and its status becomes the
  # script's exit status.
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
  return 0
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist) DIST="${2:-}"; shift 2 ;;
    --url)  URL="${2:-}";  shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1' (see --help)." >&2; exit 2 ;;
  esac
done

# --- Resolve the dist root ----------------------------------------------------

if [[ -n "$URL" ]]; then
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl required for --url." >&2; exit 127; }
  TMP="$(mktemp -d)"
  echo ">> downloading $URL"
  curl -fsSL "$URL" -o "$TMP/dist.tar.gz"
  mkdir -p "$TMP/dist"
  tar -xzf "$TMP/dist.tar.gz" -C "$TMP/dist"
  # The archive may wrap everything in a single top-level dir; descend into it
  # if there is exactly one and it isn't already a platform layout.
  if [[ ! -e "$TMP/dist/VERSION" ]]; then
    inner="$(find "$TMP/dist" -maxdepth 1 -mindepth 1 -type d | head -1)"
    [[ -n "$inner" && -e "$inner/VERSION" ]] && DIST="$inner"
  fi
  [[ -z "$DIST" ]] && DIST="$TMP/dist"
elif [[ -n "$DIST" ]]; then
  : # explicit
else
  for cand in "$PKG_ROOT/../../insimul-native/dist" "$PKG_ROOT/../insimul-native/dist"; do
    if [[ -d "$cand" ]]; then DIST="$cand"; break; fi
  done
fi

if [[ -z "$DIST" || ! -d "$DIST" ]]; then
  echo "ERROR: could not locate a dist root. Pass --dist <path> or --url <archive>," >&2
  echo "       or place an insimul-native build at ../insimul-native/dist." >&2
  exit 1
fi

echo ">> fetching native binaries from: $DIST"

# --- Copy one platform binary, if present ------------------------------------

FETCHED=0
copy_one() {
  local src="$1" dst="$2"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "   + $(basename "$dst")  <-  ${src#$DIST/}"
    FETCHED=$((FETCHED + 1))
    return 0
  fi
  return 1
}

# Windows / Linux: straight per-arch copies.
copy_one "$DIST/windows-x86_64/insimul.dll"    "$PLUGINS/Windows/x86_64/insimul.dll"    || true
copy_one "$DIST/windows-arm64/insimul.dll"     "$PLUGINS/Windows/arm64/insimul.dll"     || true
copy_one "$DIST/linux-x86_64/libinsimul.so"    "$PLUGINS/Linux/x86_64/libinsimul.so"    || true
copy_one "$DIST/linux-arm64/libinsimul.so"     "$PLUGINS/Linux/arm64/libinsimul.so"     || true

# macOS: lipo the two arch slices into one universal2 dylib (Unity prefers a
# single fat binary for the macOS plugin). Fall back to whichever single arch
# exists if lipo is unavailable or only one slice was built.
MAC_X="$DIST/macos-x86_64/libinsimul.dylib"
MAC_A="$DIST/macos-arm64/libinsimul.dylib"
MAC_OUT="$PLUGINS/macOS/libinsimul.dylib"
if [[ -f "$MAC_X" && -f "$MAC_A" ]] && command -v lipo >/dev/null 2>&1; then
  mkdir -p "$(dirname "$MAC_OUT")"
  if lipo -create "$MAC_X" "$MAC_A" -output "$MAC_OUT" 2>/dev/null; then
    echo "   + libinsimul.dylib (universal2: x86_64 + arm64)"
    FETCHED=$((FETCHED + 1))
  else
    echo "   ! lipo failed; falling back to a single-arch macOS dylib" >&2
    copy_one "$MAC_A" "$MAC_OUT" || copy_one "$MAC_X" "$MAC_OUT" || true
  fi
else
  # Only one slice (or no lipo): ship it as-is.
  copy_one "$MAC_A" "$MAC_OUT" || copy_one "$MAC_X" "$MAC_OUT" || true
fi

if [[ "$FETCHED" -eq 0 ]]; then
  echo "ERROR: no platform binaries found under $DIST (nothing copied)." >&2
  exit 1
fi

# --- Cross-check the fetched ABI version vs the wrapper's expectation ----------

EXPECTED=""
if [[ -f "$WRAPPER" ]]; then
  # Grep the ExpectedNativeSemver constant straight out of the C# source so the
  # two can never silently drift.
  EXPECTED="$(grep -oE 'ExpectedNativeSemver *= *"[0-9]+\.[0-9]+\.[0-9]+"' "$WRAPPER" \
              | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
fi

if [[ -f "$DIST/VERSION" ]]; then
  ACTUAL="$(tr -d '[:space:]' < "$DIST/VERSION")"
  echo ">> fetched libinsimul VERSION: $ACTUAL"
  if [[ -n "$EXPECTED" ]]; then
    # Compare on MAJOR.MINOR (the wrapper's compatibility axis).
    amm="$(echo "$ACTUAL"   | cut -d. -f1-2)"
    emm="$(echo "$EXPECTED" | cut -d. -f1-2)"
    if [[ "$amm" != "$emm" ]]; then
      echo "" >&2
      echo "!! WARNING: ABI DRIFT — fetched libinsimul $ACTUAL but the wrapper expects" >&2
      echo "!!          $EXPECTED (compatible: $emm.x). VerifyNativeVersion() will throw" >&2
      echo "!!          at runtime. Update ExpectedNativeSemver in InsimulProlog.cs or" >&2
      echo "!!          fetch a matching native build." >&2
      echo "" >&2
    else
      echo ">> version OK: $ACTUAL is compatible with the wrapper's $EXPECTED"
    fi
  fi
else
  echo ">> (no VERSION file in dist; skipping the ABI drift check)" >&2
fi

echo ">> done: $FETCHED binary/binaries in $PLUGINS"
echo "   Open the Unity project once so InsimulNativeImporter sets the plugin"
echo "   import settings (or run Insimul > Reimport Native Plugins)."
