// Copyright 2024 Insimul. All Rights Reserved.
//
// ThirdParty module publishing the prebuilt libinsimul native Prolog core to the
// InsimulRuntime module. Layout mirrors insimul-native/docs/consuming.md
// ("Unreal — ThirdParty module"):
//
//   Source/ThirdParty/InsimulLibrary/
//     InsimulLibrary.Build.cs   (this file)
//     include/insimul.h         the stable extern "C" C ABI
//     lib/Mac/libinsimul.dylib
//     lib/Linux/libinsimul.so
//     lib/Win64/insimul.dll  insimul.lib
//     VERSION                   semver + platform + git sha + Trealla pin
//
// The binaries under lib/ are staged from insimul-native/dist/<platform>/ at
// package time (see the plugin release script); this module only declares where
// each engine build target should find them.

using System.IO;
using UnrealBuildTool;

public class InsimulLibrary : ModuleRules
{
    public InsimulLibrary(ReadOnlyTargetRules Target) : base(Target)
    {
        // Prebuilt native library — no UE source is compiled in this module.
        Type = ModuleType.External;

        // Consumers #include "insimul.h" (extern "C", leaks no engine types).
        PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "include"));

        string LibDir = Path.Combine(ModuleDirectory, "lib");

        if (Target.Platform == UnrealTargetPlatform.Mac)
        {
            string Dylib = Path.Combine(LibDir, "Mac", "libinsimul.dylib");
            PublicAdditionalLibraries.Add(Dylib);
            RuntimeDependencies.Add(Dylib);
        }
        else if (Target.Platform == UnrealTargetPlatform.Linux)
        {
            string So = Path.Combine(LibDir, "Linux", "libinsimul.so");
            PublicAdditionalLibraries.Add(So);
            RuntimeDependencies.Add(So);
        }
        else if (Target.Platform == UnrealTargetPlatform.Win64)
        {
            // Link against the import lib; delay-load + stage the runtime DLL.
            PublicAdditionalLibraries.Add(Path.Combine(LibDir, "Win64", "insimul.lib"));
            PublicDelayLoadDLLs.Add("insimul.dll");
            RuntimeDependencies.Add(Path.Combine(LibDir, "Win64", "insimul.dll"));
        }
    }
}
