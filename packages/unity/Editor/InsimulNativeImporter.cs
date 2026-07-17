// InsimulNativeImporter.cs — set PluginImporter platform/CPU flags for the
// fetched libinsimul native binaries (US-UP3).
//
// The native binaries are fetched (scripts/fetch-native.sh), not committed, so
// their .meta files can't be hand-authored ahead of time (Unity generates .meta
// on import, and PluginImporter settings need the editor). This AssetPostprocessor
// derives the correct import settings from each binary's folder on first import:
//
//   Runtime/Plugins/macOS/*.dylib          -> Standalone macOS (x64 + ARM64)
//   Runtime/Plugins/Windows/x86_64/*.dll   -> Standalone Windows x86_64
//   Runtime/Plugins/Windows/arm64/*.dll    -> Standalone Windows ARM64
//   Runtime/Plugins/Linux/x86_64/*.so      -> Standalone Linux x86_64
//   Runtime/Plugins/Linux/arm64/*.so       -> Standalone Linux ARM64
//
// Editor compatibility is enabled to match the host OS/CPU so the same library
// loads inside the editor (the conformance EditMode tests need it). A manual
// "Insimul > Reimport Native Plugins" menu re-applies the settings if a binary
// was dropped in without a reimport.
//
// This file lives OUTSIDE Runtime/Prolog/ (it references UnityEditor); the pure
// wrapper stays UnityEngine-free.

#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>Applies platform/CPU import settings to the fetched libinsimul plugins.</summary>
    public sealed class InsimulNativeImporter : AssetPostprocessor
    {
        // The package-relative root the plugin folders hang off of. Matched as a
        // path substring so it works both in-package (Packages/com.insimul.sdk/…)
        // and when the package is embedded under Assets/.
        private const string PluginsMarker = "Runtime/Plugins/";

        private static void OnPostprocessAllAssets(
            string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            foreach (string path in imported)
            {
                if (LooksLikeNativePlugin(path)) ApplyImportSettings(path);
            }
        }

        [MenuItem("Insimul/Reimport Native Plugins")]
        public static void ReimportNativePlugins()
        {
            int count = 0;
            foreach (string guid in AssetDatabase.FindAssets(string.Empty))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (LooksLikeNativePlugin(path))
                {
                    AssetImporter.GetAtPath(path)?.SaveAndReimport();
                    count++;
                }
            }
            Debug.Log($"[Insimul] Reimported {count} native plugin(s).");
        }

        private static bool LooksLikeNativePlugin(string path)
        {
            if (path == null) return false;
            string norm = path.Replace('\\', '/');
            if (norm.IndexOf(PluginsMarker, StringComparison.OrdinalIgnoreCase) < 0) return false;
            string ext = Path.GetExtension(norm).ToLowerInvariant();
            return ext == ".dylib" || ext == ".dll" || ext == ".so";
        }

        private static void ApplyImportSettings(string path)
        {
            if (!(AssetImporter.GetAtPath(path) is PluginImporter importer))
            {
                // Unity did not (yet) recognize this as a native plugin — nothing
                // to configure. This can happen on some import orderings; the
                // manual menu re-applies once the PluginImporter exists.
                return;
            }

            string norm = path.Replace('\\', '/');

            importer.ClearSettings();
            importer.SetCompatibleWithAnyPlatform(false);

            if (norm.IndexOf("Runtime/Plugins/macOS/", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                importer.SetCompatibleWithPlatform(BuildTarget.StandaloneOSX, true);
                importer.SetCompatibleWithEditor(true);
                importer.SetEditorData("OS", "OSX");
            }
            else if (norm.IndexOf("Runtime/Plugins/Windows/arm64/", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                importer.SetCompatibleWithPlatform(BuildTarget.StandaloneWindows64, true);
                importer.SetPlatformData(BuildTarget.StandaloneWindows64, "CPU", "ARM64");
            }
            else if (norm.IndexOf("Runtime/Plugins/Windows/", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                importer.SetCompatibleWithPlatform(BuildTarget.StandaloneWindows64, true);
                importer.SetPlatformData(BuildTarget.StandaloneWindows64, "CPU", "x86_64");
                SetEditorForHost(importer, RuntimePlatform.WindowsEditor);
            }
            else if (norm.IndexOf("Runtime/Plugins/Linux/arm64/", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                importer.SetCompatibleWithPlatform(BuildTarget.StandaloneLinux64, true);
                importer.SetPlatformData(BuildTarget.StandaloneLinux64, "CPU", "ARM64");
            }
            else if (norm.IndexOf("Runtime/Plugins/Linux/", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                importer.SetCompatibleWithPlatform(BuildTarget.StandaloneLinux64, true);
                importer.SetPlatformData(BuildTarget.StandaloneLinux64, "CPU", "x86_64");
                SetEditorForHost(importer, RuntimePlatform.LinuxEditor);
            }
            else
            {
                // A binary under Plugins/ but not in a recognized platform folder.
                Debug.LogWarning($"[Insimul] Native binary in an unrecognized folder, left unconfigured: {path}");
                return;
            }

            importer.SaveAndReimport();
        }

        // Enable editor compatibility only when the host editor OS/CPU matches the
        // binary — so the macOS universal dylib and the x86_64 Windows/Linux DLLs
        // load in-editor for the EditMode conformance tests.
        private static void SetEditorForHost(PluginImporter importer, RuntimePlatform hostEditor)
        {
            if (Application.platform == hostEditor)
            {
                importer.SetCompatibleWithEditor(true);
                importer.SetEditorData("CPU", "x86_64");
            }
        }
    }
}
#endif
