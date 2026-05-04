#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "CombatSystem.generated.h"

/**
 * Handles all combat styles (melee, ranged, turn-based, fighting)
 * Ported from Insimul's Babylon.js CombatSystem to Unreal subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UCombatSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|CombatSystem")
    void LoadFromIR(const FString& JsonString);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    FString CombatStyle = TEXT("{{COMBAT_STYLE}}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    float BaseDamage = {{COMBAT_BASE_DAMAGE}};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    float CriticalChance = {{COMBAT_CRITICAL_CHANCE}};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    float CriticalMultiplier = {{COMBAT_CRITICAL_MULTIPLIER}};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    float BlockReduction = {{COMBAT_BLOCK_REDUCTION}};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
    float DodgeChance = {{COMBAT_DODGE_CHANCE}};

    UFUNCTION(BlueprintCallable, Category = "Combat")
    float CalculateDamage(float BaseDmg, bool bIsCritical);
};
