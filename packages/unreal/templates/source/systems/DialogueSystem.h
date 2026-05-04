#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Data/DialogueContextData.h"
#include "DialogueSystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDialogueStarted, const FString&, NPCId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnDialogueEnded);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnActionSelected, const FString&, ActionId);

/**
 * NPC dialogue and conversation management with AI-powered chat.
 */
UCLASS()
class INSIMULEXPORT_API UDialogueSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DialogueSystem")
    void LoadFromIR(const FString& JsonString);

    /** Load dialogue contexts and AI config from JSON files */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DialogueSystem")
    void LoadDialogueData();

    UFUNCTION(BlueprintCallable, Category = "Dialogue")
    void StartDialogue(const FString& NPCCharacterId);

    UFUNCTION(BlueprintCallable, Category = "Dialogue")
    void EndDialogue();

    UPROPERTY(BlueprintReadOnly, Category = "Dialogue")
    bool bIsInDialogue = false;

    UPROPERTY(BlueprintReadOnly, Category = "Dialogue")
    FString CurrentNPCId;

    UPROPERTY(BlueprintAssignable, Category = "Dialogue")
    FOnDialogueStarted OnDialogueStarted;

    UPROPERTY(BlueprintAssignable, Category = "Dialogue")
    FOnDialogueEnded OnDialogueEnded;

    UPROPERTY(BlueprintAssignable, Category = "Dialogue")
    FOnActionSelected OnActionSelected;

    /** Current player energy for action affordability checks */
    UPROPERTY(BlueprintReadWrite, Category = "Dialogue")
    float PlayerEnergy = 100.0f;

    /** Set the current player energy level */
    UFUNCTION(BlueprintCallable, Category = "Dialogue")
    void SetPlayerEnergy(float Energy);

    /** Get available social actions filtered by energy affordability */
    UFUNCTION(BlueprintCallable, Category = "Dialogue")
    TArray<FString> GetAvailableActions();

    /** Select an action during dialogue, broadcasts OnActionSelected */
    UFUNCTION(BlueprintCallable, Category = "Dialogue")
    void SelectAction(const FString& ActionId);

    /** Romance action input data */
    struct FInsimulRomanceAction
    {
        FString Id;
        FString Name;
        FString RequiredStage;
        float SparkGain = 0.0f;
        FString Description;
        float EnergyCost = 5.0f;
    };

    /** Show dialogue with romance actions merged alongside base actions */
    void ShowWithRomanceActions(const TArray<FString>& BaseActionIds, const TArray<FInsimulRomanceAction>& RomanceActions, float Energy);

private:
    FInsimulAIConfig AIConfig;
    TArray<FInsimulDialogueContext> DialogueContexts;

    /** Cached social actions loaded from data */
    TArray<TSharedPtr<FJsonObject>> SocialActions;

    /** Load social actions from JSON data */
    void LoadSocialActions();
};
