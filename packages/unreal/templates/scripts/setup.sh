#!/usr/bin/env bash
# Insimul Asset Setup — macOS / Linux
# Imports all bundled GLB assets into your UE5 project.
set -euo pipefail

echo "[Insimul] ===== Insimul Asset Setup ====="
echo "[Insimul] Searching for Unreal Editor..."

UE_EXE=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Locate UnrealEditor ────────────────────────────────────────────────────
if [[ -n "${UE_ENGINE_DIR:-}" ]]; then
    CANDIDATE_MAC="$UE_ENGINE_DIR/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
    CANDIDATE_LIN="$UE_ENGINE_DIR/Engine/Binaries/Linux/UnrealEditor"
    [[ -x "$CANDIDATE_MAC" ]] && UE_EXE="$CANDIDATE_MAC"
    [[ -z "$UE_EXE" && -x "$CANDIDATE_LIN" ]] && UE_EXE="$CANDIDATE_LIN"
fi

if [[ -z "$UE_EXE" ]]; then
    for VERSION in 5.7 5.5 5.4 5.3 5.2; do
        MAC_PATH="/Users/Shared/Epic Games/UE_$VERSION/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
        LIN_PATH="/opt/unreal-engine-$VERSION/Engine/Binaries/Linux/UnrealEditor"
        if [[ -x "$MAC_PATH" ]]; then UE_EXE="$MAC_PATH"; break; fi
        if [[ -x "$LIN_PATH" ]]; then UE_EXE="$LIN_PATH"; break; fi
    done
fi

if [[ -z "$UE_EXE" ]]; then
    echo "[Insimul] ERROR: Could not find UnrealEditor."
    echo "[Insimul] Set UE_ENGINE_DIR to your UE5 engine root and re-run, e.g.:"
    echo "[Insimul]   export UE_ENGINE_DIR='/Users/Shared/Epic Games/UE_5.5'"
    exit 1
fi

echo "[Insimul] Unreal Editor: $UE_EXE"

# ─── Find .uproject file ────────────────────────────────────────────────────
PROJECT=$(ls "$SCRIPT_DIR"/*.uproject 2>/dev/null | head -1 || true)
if [[ -z "$PROJECT" ]]; then
    echo "[Insimul] ERROR: No .uproject file found in $SCRIPT_DIR"
    exit 1
fi

echo "[Insimul] Project: $PROJECT"

# ─── Run the Python import script ───────────────────────────────────────────
SCRIPT="$SCRIPT_DIR/Scripts/ImportInsimulAssets.py"
echo "[Insimul] Importing assets (this may take a minute)..."

"$UE_EXE" "$PROJECT" -ExecutePythonScript="$SCRIPT" -nullrhi -nopause -nosplash -Unattended

echo ""
echo "[Insimul] Asset import complete."
echo "[Insimul] Open the .uproject in Unreal Editor, then follow Content/Data/ASSET_SETUP.md"
echo "[Insimul] to wire imported meshes to InsimulGameMode.BuildingBlueprintMap."
