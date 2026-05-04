#!/bin/bash
set -e

echo "========================================"
echo "Insimul UE5 Project Setup"
echo "========================================"

# Detect UE5 installation — scan common locations for newest version first
if [ -z "$UE_ENGINE_DIR" ]; then
    for VERSION in 5.7 5.6 5.5 5.4; do
        CANDIDATE="/Users/Shared/Epic Games/UE_$VERSION"
        if [ -d "$CANDIDATE" ]; then
            UE_ENGINE_DIR="$CANDIDATE"
            break
        fi
    done
fi

# Linux fallback
if [ -z "$UE_ENGINE_DIR" ] || [ ! -d "$UE_ENGINE_DIR" ]; then
    for VERSION in 5.7 5.6 5.5 5.4; do
        CANDIDATE="/opt/unreal-engine-$VERSION"
        if [ -d "$CANDIDATE" ]; then
            UE_ENGINE_DIR="$CANDIDATE"
            break
        fi
    done
fi

if [ -z "$UE_ENGINE_DIR" ] || [ ! -d "$UE_ENGINE_DIR" ]; then
    echo "ERROR: Could not find UE5 installation"
    echo "Set UE_ENGINE_DIR environment variable to your UE5 install path"
    echo "  e.g.  UE_ENGINE_DIR=\"/Users/Shared/Epic Games/UE_5.7\" ./setup.sh"
    exit 1
fi

echo "Using UE5: $UE_ENGINE_DIR"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR/InsimulExport.uproject"
IMPORT_SCRIPT="$SCRIPT_DIR/Scripts/ImportInsimulAssets.py"

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="Mac"
    EDITOR_CMD="$UE_ENGINE_DIR/Engine/Binaries/Mac/UnrealEditor-Cmd"
elif [[ "$OSTYPE" == "linux"* ]]; then
    PLATFORM="Linux"
    EDITOR_CMD="$UE_ENGINE_DIR/Engine/Binaries/Linux/UnrealEditor-Cmd"
else
    echo "ERROR: Unsupported platform: $OSTYPE"
    exit 1
fi

# Step 1: Build C++ modules
echo ""
echo "Step 1/3: Building C++ modules..."
"$UE_ENGINE_DIR/Engine/Build/BatchFiles/RunUBT.sh" InsimulExportEditor "$PLATFORM" Development "-project=$PROJECT_PATH"

# Step 2: Run CreateLevel commandlet to generate MainWorld.umap
echo ""
echo "Step 2/3: Generating MainWorld.umap..."
"$EDITOR_CMD" "$PROJECT_PATH" -run=CreateLevel -unattended -nosplash -nopause || true

# Step 3: Import bundled assets (characters, audio, textures, models) into UE5
echo ""
echo "Step 3/3: Importing bundled assets (characters, audio, textures, models)..."
if [ -f "$IMPORT_SCRIPT" ]; then
    "$EDITOR_CMD" "$PROJECT_PATH" -ExecutePythonScript="$IMPORT_SCRIPT" -unattended -nosplash -nopause || {
        echo ""
        echo "NOTE: Automated asset import finished (some warnings are normal)."
        echo "If assets didn't import correctly, you can manually run the script"
        echo "from within Unreal Editor: File > Execute Python Script > Scripts/ImportInsimulAssets.py"
    }
else
    echo "WARNING: ImportInsimulAssets.py not found at $IMPORT_SCRIPT"
    echo "Skipping asset import. You can import assets manually from the Unreal Editor."
fi

echo ""
echo "========================================"
echo "Setup complete!"
echo "========================================"
echo ""
echo "Imported assets include:"
echo "  - Character models (FBX with skeletal animations)"
echo "  - Audio files (ambient, footsteps, interactions)"
echo "  - Textures (ground, building surfaces)"
echo "  - 3D models (buildings, props, markers)"
echo ""
echo "Next steps:"
echo "  1. Open InsimulExport.uproject in Unreal Editor"
echo "  2. Open Content/Maps/MainWorld"
echo "  3. Press Play to test the game"
echo ""
