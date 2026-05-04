# Insimul Asset Setup — Unreal Engine 5

## Overview
GLTF/GLB assets are bundled in `Content/assets/`.
Follow these steps to wire them up as 3D models in the level.

## Step 1 — Import Assets (run the setup script)

**Windows:** Double-click `Setup.bat` in the project root.
**macOS/Linux:** Open a terminal in the project root and run:
```
chmod +x setup.sh && ./setup.sh
```

The script locates your Unreal Editor installation, then runs `Scripts/ImportInsimulAssets.py`
headlessly to import all bundled `.glb`/`.gltf` files as Static Meshes.

If the script can't find Unreal Editor automatically, set `UE_ENGINE_DIR` first, e.g.:
- **Windows:** `set UE_ENGINE_DIR=C:\Program Files\Epic Games\UE_5.5`
- **macOS:** `export UE_ENGINE_DIR='/Users/Shared/Epic Games/UE_5.5'`

## Step 2 — Create Building Blueprints
For each imported building mesh:
1. Right-click the mesh in the Content Browser → **Create Blueprint Class** (parent: AActor).
2. In the Blueprint editor, add a **Static Mesh Component** and assign the imported mesh.
3. Note the asset's **ModelAssetKey** — find it in `Content/Data/DT_Buildings.json` under `"ModelAssetKey"`.
   Example: `"assets/buildings/building_home_A_blue.glb"`

## Step 3 — Assign Blueprints to GameMode
1. Open (or create) **Blueprints/BP_InsimulGameMode** from `AInsimulGameMode`.
2. In **Class Defaults > Insimul Assets**, expand **Building Blueprint Map**.
3. Add one entry per building type:
   - **Key** = ModelAssetKey string (e.g. `assets/buildings/building_home_A_blue.glb`)
   - **Value** = the Blueprint class you created in Step 2.
4. Set **BP_InsimulGameMode** as the GameMode in **World Settings**.

## Step 4 — NPC Visual (optional)
1. Import a character GLB as a Static or Skeletal Mesh.
2. Create a Blueprint subclass of **ANPCCharacter**.
3. In the Blueprint, assign the mesh to the **Visual Mesh** component.
4. Assign this Blueprint to **InsimulGameMode.NPCBlueprintClass**.

## Fallback Behaviour
- Buildings without a matching **BuildingBlueprintMap** entry use procedural colored cubes.
- NPCs without **NPCBlueprintClass** set spawn as default `ANPCCharacter` (capsule only).
