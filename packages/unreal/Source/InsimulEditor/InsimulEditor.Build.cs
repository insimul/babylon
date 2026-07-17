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
            "AssetRegistry",
            // The editor-connect panels (US-XE1+) talk to the backend v1 API over
            // FHttpModule; the pure session/operation-table core (Portable/) is
            // UE-free + host-tested, the FHttpModule transport sits on top.
            "HTTP",
            // The Binding Editor is an Editor Utility Widget (US-XG4); Blutility +
            // UMG back the UEditorUtilityWidget base + its UMG surface.
            "Blutility",
            "UMG",
            "UMGEditor",
            // Terrain + settlement generation (US-XG2): Landscape sculpt/splines,
            // Level Instances for interiors, World Partition + NavMesh setup.
            "Landscape",
            "LandscapeEditor",
            "Foliage",
            "NavigationSystem",
            // PCG-driven vegetation scatter seeded from IR biome/density (US-XG3);
            // declared here so the generation pipeline can feed PCG graph params.
            "PCG",
        });
    }
}
