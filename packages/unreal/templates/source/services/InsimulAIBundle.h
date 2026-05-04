#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Data/DialogueContextData.h"
#include "InsimulAIBundle.generated.h"

/**
 * AI Bundle — auto-initializes the InsimulAIService with exported world data.
 *
 * Config values and dialogue contexts are baked in at export time so the AI
 * service works immediately without manual setup or file parsing.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulAIBundle : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Get the baked-in AI configuration. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    FInsimulAIConfig GetBundledConfig() const;

    /** Get all baked-in NPC dialogue contexts. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    TArray<FInsimulDialogueContext> GetBundledContexts() const;

    /** Get the Prolog knowledge base content (empty if none exported). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    FString GetKnowledgeBase() const;

    /** True once the AI service has been initialized with bundle data. */
    UFUNCTION(BlueprintPure, Category = "Insimul|AI")
    bool IsAIInitialized() const { return bInitialized; }

private:
    bool bInitialized = false;
};
