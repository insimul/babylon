#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ActionSystem.generated.h"

/**
 * Effect produced by an action execution.
 */
USTRUCT(BlueprintType)
struct FInsimulActionEffect
{
    GENERATED_BODY()

    /** Effect type: relationship, attribute, status, event, item, knowledge, gold */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Target;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Value = 0.f;
    /** For item effects: the item identifier */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    /** For item effects: quantity to give/take */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 0;
};

/**
 * Tracks per-action cooldown and usage state.
 */
USTRUCT(BlueprintType)
struct FInsimulActionState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString ActionId;
    UPROPERTY(BlueprintReadOnly) float LastUsed = 0.f;
    UPROPERTY(BlueprintReadOnly) float CooldownRemaining = 0.f;
    UPROPERTY(BlueprintReadOnly) int32 TimesUsed = 0;
};

/**
 * Animation data attached to an action result.
 * Mirrors ActionAnimationData from the TypeScript action system.
 */
USTRUCT(BlueprintType)
struct FInsimulActionAnimationData
{
    GENERATED_BODY()

    /** Animation clip name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Clip;
    /** Alternative animation clip name */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClipAlt;
    /** Animation library: "UAL1" or "UAL2" */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Library;
    /** Whether the animation should loop */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bLoop = false;
    /** Playback speed multiplier */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Speed = 1.0f;
    /** Blend-in duration in seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BlendIn = 0.2f;
};

/**
 * Result of executing an action.
 */
USTRUCT(BlueprintType)
struct FInsimulActionResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) bool bSuccess = false;
    UPROPERTY(BlueprintReadOnly) FString Message;
    UPROPERTY(BlueprintReadOnly) int32 EnergyUsed = 0;
    UPROPERTY(BlueprintReadOnly) TArray<FInsimulActionEffect> Effects;
    UPROPERTY(BlueprintReadOnly) FString NarrativeText;
    /** Optional animation data extracted from action's CustomData */
    UPROPERTY(BlueprintReadOnly) bool bHasAnimation = false;
    UPROPERTY(BlueprintReadOnly) FInsimulActionAnimationData Animation;
};

/**
 * Big Five personality profile for personality-based action ranking.
 * Each trait ranges from -1.0 to 1.0.
 */
USTRUCT(BlueprintType)
struct FInsimulPersonalityProfile
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Openness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Conscientiousness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Extroversion = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Agreeableness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Neuroticism = 0.f;
};

/**
 * An action paired with its softmax probability from personality ranking.
 */
USTRUCT(BlueprintType)
struct FInsimulRankedAction
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString ActionId;
    UPROPERTY(BlueprintReadOnly) float Probability = 0.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGoldEffectApplied, int32, Amount);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemEffectApplied, const FString&, ItemId, int32, Quantity);

/**
 * Manages available actions and their execution.
 * Ported from Insimul's Babylon.js ActionManager to Unreal subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UActionSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|ActionSystem")
    void LoadFromIR(const FString& JsonString);

    UPROPERTY(BlueprintReadOnly, Category = "Actions")
    int32 ActionCount = 0;

    UFUNCTION(BlueprintCallable, Category = "Actions")
    FInsimulActionResult ExecuteAction(const FString& ActionId, AActor* Source, AActor* Target);

    /** Get all actions matching a category (social, combat, mental, etc.) */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    TArray<FString> GetActionsByCategory(const FString& Category);

    /** Get actions available in the given context (checks active, cooldown, energy). */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    TArray<FString> GetContextualActions(float PlayerEnergy, bool bHasTarget);

    /** Get contextual actions ranked by personality match using softmax probability.
     *  If no personality is provided (all zeros), returns uniform probability. */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    TArray<FInsimulRankedAction> GetContextualActionsRanked(float PlayerEnergy, bool bHasTarget, const FInsimulPersonalityProfile& Personality);

    /** Check whether an action can be performed; returns false with Reason populated on failure. */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    bool CanPerformAction(const FString& ActionId, float PlayerEnergy, bool bHasTarget, FString& Reason);

    /** Tick cooldowns – call once per frame with delta seconds. */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    void UpdateCooldowns(float DeltaTime);

    /** Get remaining cooldown for an action (0 if ready). */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    float GetCooldown(const FString& ActionId);

    /** Find actions that can satisfy a given quest objective type. Returns action IDs. */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    TArray<FString> FindActionForObjective(const FString& ObjectiveType);

    /** Look up an action by its name (e.g., "fish", "cook"). Returns empty string if not found. */
    UFUNCTION(BlueprintCallable, Category = "Actions")
    FString GetActionByName(const FString& ActionName);

    /** Fired when an action produces a gold effect the game should apply. */
    UPROPERTY(BlueprintAssignable, Category = "Actions")
    FOnGoldEffectApplied OnGoldEffect;

    /** Fired when an action produces an item effect the game should apply. */
    UPROPERTY(BlueprintAssignable, Category = "Actions")
    FOnItemEffectApplied OnItemEffect;

private:
    /** Per-action cooldown and usage tracking. */
    TMap<FString, FInsimulActionState> ActionStates;

    /** Parsed action definitions from IR. */
    TArray<TSharedPtr<FJsonObject>> ParsedActions;

    /** Generate narrative text from an action's narrativeTemplates array. */
    FString GenerateNarrativeText(const TSharedPtr<FJsonObject>& ActionObj, const FString& ActorName, const FString& TargetName);

    /** Standard personality affinities for common action types.
     *  Maps actionType -> { trait -> weight }. */
    static TMap<FString, TMap<FString, float>> GetStandardActionAffinities();
};
