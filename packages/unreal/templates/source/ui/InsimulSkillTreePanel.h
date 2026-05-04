#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulSkillTreePanel.generated.h"

/**
 * Skill tree UI with 5-tier progression.
 * Each tier unlocks at a proficiency threshold.
 * Skills are displayed as nodes in a vertical tree layout.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulSkillTreePanel : public UUserWidget
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "Insimul|SkillTree")
    void TogglePanel();

    UFUNCTION(BlueprintCallable, Category = "Insimul|SkillTree")
    void RefreshTree();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|SkillTree")
    bool IsPanelOpen() const { return bIsOpen; }

protected:
    virtual void NativeConstruct() override;

private:
    struct SkillNode
    {
        FString Name;
        FString Description;
        int32 Tier;          // 1-5
        int32 XPRequired;
        bool bUnlocked;
    };

    void BuildLayout();
    void PopulateSkills();
    TArray<SkillNode> GetSkillsForTier(int32 Tier) const;

    bool bIsOpen = false;
    TArray<SkillNode> AllSkills;
};
