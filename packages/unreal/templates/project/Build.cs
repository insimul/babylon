using UnrealBuildTool;

public class InsimulExport : ModuleRules
{
    public InsimulExport(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicIncludePaths.AddRange(new string[]
        {
            ModuleDirectory
        });

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "EnhancedInput",
            "UMG",
            "Slate",
            "SlateCore",
            "NavigationSystem",
            "AIModule",
            "GameplayTasks",
            "Json",
            "JsonUtilities",
            "HTTP",
            "InsimulRuntime"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "ProceduralMeshComponent",
            "AnimGraphRuntime"
        });
    }
}
