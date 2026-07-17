// Copyright 2024 Insimul. All Rights Reserved.

using UnrealBuildTool;

public class InsimulEditor : ModuleRules
{
    public InsimulEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        // The editor-time scene-generation + Asset Binding Layer pipeline
        // (US-XG1..4). The archetype resolver core (Portable/) is UE-free and
        // host-tested; the UDataAsset / editor UI here sit on top of it.
        PublicIncludePaths.AddRange(new string[]
        {
            // The resolver core reuses the InsimulRuntime portable JSON slice.
            System.IO.Path.Combine(ModuleDirectory, "..", "InsimulRuntime", "Portable"),
        });

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "InsimulRuntime",
            "UnrealEd",
            "Slate",
            "SlateCore",
            "AssetTools",
        });
    }
}
