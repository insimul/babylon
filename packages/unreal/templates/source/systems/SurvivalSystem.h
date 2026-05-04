#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "../data/GameTypes.h"
#include "SurvivalSystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSurvivalEvent, const FInsimulSurvivalEvent&, Event);

/**
 * Survival needs (hunger, thirst, temperature, stamina, sleep)
 * Ported from Insimul's Babylon.js SurvivalSystem to Unreal subsystem.
 */
UCLASS()
class INSIMULEXPORT_API USurvivalSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void LoadFromIR(const FString& JsonString);

    /** Call each frame with delta seconds to apply decay and damage */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void Update(float DeltaTime);

    /** Get current value for a need (0–MaxValue) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    float GetNeedValue(const FString& NeedId) const;

    /** Get current value as percentage (0–1) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    float GetNeedPercent(const FString& NeedId) const;

    /** Restore a need by the given amount (e.g. eating restores hunger) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void RestoreNeed(const FString& NeedId, float Amount);

    /** Consume stamina for an action; returns false if insufficient */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    bool ConsumeStamina(float Amount);

    /** Recover stamina by the given amount */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void RecoverStamina(float Amount);

    /** Set temperature directly (environment-driven) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void SetTemperature(float Value);

    /** Add a modifier that affects a need's decay rate */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void AddModifier(const FString& ModifierId, const FString& NeedId, float RateMultiplier, float Duration);

    /** Remove a modifier by ID */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    void RemoveModifier(const FString& ModifierId);

    /** Check if any need is at critical level */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    bool IsAnyCritical() const;

    /** Check if any need is at warning level */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Survival")
    bool IsAnyWarning() const;

    /** Broadcast when a survival event occurs */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Survival")
    FOnSurvivalEvent OnSurvivalEvent;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Survival")
    int32 NeedCount = 0;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Survival")
    FInsimulSurvivalDamageConfig DamageConfig;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Survival")
    FInsimulTemperatureConfig TemperatureConfig;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Survival")
    FInsimulStaminaConfig StaminaConfig;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Survival")
    TArray<FInsimulSurvivalModifierPreset> ModifierPresets;

private:
    /** Runtime state per need, keyed by need ID string */
    struct FNeedRuntime
    {
        FInsimulNeedConfig Config;
        float Current;
        bool bWasCritical = false;
        bool bWasWarning = false;
    };

    TMap<FString, FNeedRuntime> Needs;

    struct FActiveModifier
    {
        FString Id;
        FString NeedId;
        float RateMultiplier;
        float RemainingTime; // <= 0 means permanent
    };

    TArray<FActiveModifier> ActiveModifiers;

    /** Get effective decay multiplier for a need from all active modifiers */
    float GetDecayMultiplier(const FString& NeedId) const;

    /** Fire a survival event and broadcast delegate */
    void FireEvent(EInsimulSurvivalEventType EventType, const FString& NeedId, float Value, const FString& Message);

    /** Map need ID string to enum */
    static EInsimulNeedType StringToNeedType(const FString& Id);
};
