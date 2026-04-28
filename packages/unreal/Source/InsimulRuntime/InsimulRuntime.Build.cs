// Copyright 2024 Insimul. All Rights Reserved.

using UnrealBuildTool;

public class InsimulRuntime : ModuleRules
{
    public InsimulRuntime(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "HTTP",
            "Json",
            "JsonUtilities",
            "WebSockets",
            "UMG",
            "Slate",
            "SlateCore",
            "AudioCapture",
            "AudioMixer"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "Projects"
        });
    }
}
