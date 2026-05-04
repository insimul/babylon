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

:: Step 1: Build C++ modules
echo.
echo Step 1/2: Building C++ modules...
"%UE_ENGINE_DIR%\Engine\Build\BatchFiles\RunUBT.bat" InsimulExportEditor Win64 Development "-project=%PROJECT_PATH%"
if errorlevel 1 exit /b 1

:: Step 2: Run CreateLevel commandlet
echo.
echo Step 2/2: Generating MainWorld.umap...
"%UE_ENGINE_DIR%\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "%PROJECT_PATH%" -run=CreateLevel -unattended -nosplash -nopause
if errorlevel 1 exit /b 1

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
