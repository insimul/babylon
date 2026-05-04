"""
ImportInsimulAssets.py — Unreal Editor Python Script

Bulk-imports all GLB/GLTF/FBX files bundled in Content/ subdirectories into UE5.

Asset routing:
  - Content/Models/   → Static Meshes (GLB/GLTF via Interchange)
  - Content/Characters/ → Skeletal Meshes (FBX with animations)
  - Content/Textures/ → Texture assets
  - Content/Audio/    → Sound Wave assets

Requires: InterchangeEditor, Interchange, GLTFExporter plugins (enabled in .uproject)

Usage:
  Automated (recommended): Run setup.sh — it calls this script automatically.
  Manual: File > Execute Python Script (browse to this file)
  Console: exec(open("Scripts/ImportInsimulAssets.py").read())

After import:
  1. For each building mesh, right-click > Create Blueprint Class, add a StaticMeshComponent.
  2. Open BP_InsimulGameMode > Class Defaults > Insimul Assets.
  3. Add entries to BuildingBlueprintMap: key = ModelAssetKey from DT_Buildings.json,
     value = the Blueprint class you just created.
  4. For character FBX: create AnimBlueprint referencing InsimulAnimInstance,
     assign to NPCCharacter's AnimClass property.
"""

import os
import unreal

# File extensions supported by each import category
MODEL_EXTENSIONS = {".glb", ".gltf", ".fbx"}
TEXTURE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tga", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg"}

# Directories to scan under Content/
IMPORT_DIRS = ["Models", "Characters", "Textures", "Audio"]


def import_insimul_assets():
    content_dir = unreal.Paths.project_content_dir()

    tasks = []
    for subdir in IMPORT_DIRS:
        scan_dir = os.path.join(content_dir, subdir)
        if not os.path.exists(scan_dir):
            continue

        for root, dirs, files in os.walk(scan_dir):
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext not in MODEL_EXTENSIONS | TEXTURE_EXTENSIONS | AUDIO_EXTENSIONS:
                    continue

                filepath = os.path.join(root, filename)
                rel_root = os.path.relpath(root, content_dir).replace("\\", "/")
                dest_path = f"/Game/{rel_root}"

                task = unreal.AssetImportTask()
                task.filename = filepath
                task.destination_path = dest_path
                task.automated = True
                task.replace_existing = False
                task.save = True

                # FBX-specific: import as skeletal mesh with animations
                if ext == ".fbx":
                    task.options = unreal.FbxImportUI()
                    task.options.import_mesh = True
                    task.options.import_as_skeletal = True
                    task.options.import_animations = True
                    task.options.import_materials = True
                    task.options.import_textures = True

                tasks.append(task)
                unreal.log(f"[Insimul] Queued: {filename} -> {dest_path}")

    # Also scan legacy assets/ directory for backward compatibility
    legacy_dir = os.path.join(content_dir, "assets")
    if os.path.exists(legacy_dir):
        for root, dirs, files in os.walk(legacy_dir):
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext not in MODEL_EXTENSIONS:
                    continue
                filepath = os.path.join(root, filename)
                rel_root = os.path.relpath(root, content_dir).replace("\\", "/")
                dest_path = f"/Game/{rel_root}"

                task = unreal.AssetImportTask()
                task.filename = filepath
                task.destination_path = dest_path
                task.automated = True
                task.replace_existing = False
                task.save = True
                tasks.append(task)
                unreal.log(f"[Insimul] Queued (legacy): {filename} -> {dest_path}")

    if not tasks:
        unreal.log_warning("[Insimul] No importable files found under Content/")
        return

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset_tools.import_asset_tasks(tasks)
    unreal.log(f"[Insimul] Done — {len(tasks)} asset(s) imported.")
    unreal.log("[Insimul] See Content/Data/ASSET_SETUP.md for next steps.")


import_insimul_assets()
