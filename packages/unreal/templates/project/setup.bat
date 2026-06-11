@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Insimul UE5 Project Setup
echo ========================================

:: Detect UE5 installation
if not defined UE_ENGINE_DIR (
    if exist "C:\Program Files\Epic Games\UE_5.5" (
        set "UE_ENGINE_DIR=C:\Program Files\Epic Games\UE_5.5"
    ) else if exist "C:\Program Files\Epic Games\UE_5.4" (
        set "UE_ENGINE_DIR=C:\Program Files\Epic Games\UE_5.4"
    ) else (
        echo ERROR: Could not find UE5 installation
        echo Set UE_ENGINE_DIR environment variable to your UE5 install path
        exit /b 1
    )
)

echo Using UE5: %UE_ENGINE_DIR%
set "PROJECT_PATH=%CD%\InsimulExport.uproject"
set "EDITOR_CMD=%UE_ENGINE_DIR%\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
set "IMPORT_SCRIPT=%CD%\Scripts\ImportInsimulAssets.py"
set "CONTENT_SCRIPT=%CD%\Scripts\GenerateInsimulContent.py"

:: Step 1: Build C++ modules
echo.
echo Step 1/4: Building C++ modules...
"%UE_ENGINE_DIR%\Engine\Build\BatchFiles\RunUBT.bat" InsimulExportEditor Win64 Development "-project=%PROJECT_PATH%"
if errorlevel 1 exit /b 1

:: Step 2: Run CreateLevel commandlet
echo.
echo Step 2/4: Generating MainWorld.umap...
"%EDITOR_CMD%" "%PROJECT_PATH%" -run=CreateLevel -unattended -nosplash -nopause
if errorlevel 1 exit /b 1

:: Step 3: Import bundled assets (characters, audio, textures, models)
echo.
echo Step 3/4: Importing bundled assets...
if exist "%IMPORT_SCRIPT%" (
    "%EDITOR_CMD%" "%PROJECT_PATH%" -ExecutePythonScript="%IMPORT_SCRIPT%" -unattended -nosplash -nopause
) else (
    echo WARNING: ImportInsimulAssets.py not found - skipping asset import.
)

:: Step 4: Generate UI Widget Blueprints + import fonts
echo.
echo Step 4/4: Generating UI Widget Blueprints and importing fonts...
if exist "%CONTENT_SCRIPT%" (
    "%EDITOR_CMD%" "%PROJECT_PATH%" -ExecutePythonScript="%CONTENT_SCRIPT%" -unattended -nosplash -nopause
) else (
    echo WARNING: GenerateInsimulContent.py not found - the C++ UI may render empty without it.
)

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Open InsimulExport.uproject in Unreal Editor
echo   2. Open Content/Maps/MainWorld
echo   3. Press Play to test the game
echo.
pause
