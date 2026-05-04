@echo off
setlocal enabledelayedexpansion

echo [Insimul] ===== Insimul Asset Setup =====
echo [Insimul] This will import bundled GLB assets into your UE5 project.
echo.

REM ─── Locate UnrealEditor.exe ────────────────────────────────────────────
set "UE_EXE="

if defined UE_ENGINE_DIR (
    set "UE_EXE=!UE_ENGINE_DIR!\Engine\Binaries\Win64\UnrealEditor.exe"
    if exist "!UE_EXE!" goto :found
)

for %%V in (5.5 5.4 5.3 5.2) do (
    set "CANDIDATE=C:\Program Files\Epic Games\UE_%%V\Engine\Binaries\Win64\UnrealEditor.exe"
    if exist "!CANDIDATE!" (
        set "UE_EXE=!CANDIDATE!"
        goto :found
    )
)

echo [Insimul] ERROR: Could not find UnrealEditor.exe.
echo [Insimul] Set the UE_ENGINE_DIR environment variable to your UE5 engine root, e.g.:
echo [Insimul]   set UE_ENGINE_DIR=C:\Program Files\Epic Games\UE_5.5
echo [Insimul] Then re-run this script.
pause
exit /b 1

:found
echo [Insimul] Unreal Editor: %UE_EXE%

REM ─── Find the .uproject file in this folder ──────────────────────────────
set "PROJECT="
for %%F in ("%~dp0*.uproject") do set "PROJECT=%%F"

if not defined PROJECT (
    echo [Insimul] ERROR: No .uproject file found in this folder.
    pause
    exit /b 1
)

echo [Insimul] Project: %PROJECT%

REM ─── Run the Python import script ────────────────────────────────────────
set "SCRIPT=%~dp0Scripts\ImportInsimulAssets.py"

echo [Insimul] Importing assets (this may take a minute)...
"%UE_EXE%" "%PROJECT%" -ExecutePythonScript="%SCRIPT%" -nullrhi -nopause -nosplash -Unattended

echo.
echo [Insimul] Asset import complete.
echo [Insimul] Open the .uproject in Unreal Editor, then follow Content/Data/ASSET_SETUP.md
echo [Insimul] to wire imported meshes to InsimulGameMode.BuildingBlueprintMap.
echo.
pause
