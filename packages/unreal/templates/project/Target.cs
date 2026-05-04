using UnrealBuildTool;
using System.Collections.Generic;

public class InsimulExportTarget : TargetRules
{
    public InsimulExportTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
        ExtraModuleNames.Add("InsimulExport");
    }
}
