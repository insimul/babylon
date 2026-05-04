using UnrealBuildTool;
using System.Collections.Generic;

public class InsimulExportEditorTarget : TargetRules
{
    public InsimulExportEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
        ExtraModuleNames.Add("InsimulExport");
    }
}
