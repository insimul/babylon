#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "CombatModeManager.generated.h"

UENUM(BlueprintType)
enum class ECombatMode : uint8
{
    RealTime  UMETA(DisplayName = "Real Time"),
    TurnBased UMETA(DisplayName = "Turn Based"),
    Ranged    UMETA(DisplayName = "Ranged")
};

USTRUCT(BlueprintType)
struct FHealthBarData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float CurrentHP = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MaxHP = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsEnemy = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCombatStarted, AActor*, EnemyActor);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnCombatEnded);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnDamageDealt, AActor*, Target, float, Damage);

/**
 * Manages combat modes (real-time, turn-based, ranged), player actions,
 * and damage calculations.
 */
UCLASS()
class INSIMULEXPORT_API UCombatModeManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Set the active combat mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void SetCombatMode(ECombatMode NewMode);

    /** Get the current combat mode */
    UFUNCTION(BlueprintPure, Category = "Insimul|Combat")
    ECombatMode GetCombatMode() const;

    /** Begin combat with a target enemy */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void StartCombat(AActor* EnemyActor);

    /** End the current combat encounter */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void EndCombat();

    /** Whether combat is currently active */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Combat")
    bool bInCombat = false;

    /** Execute a player attack action */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void PlayerAttack();

    /** Execute a player block action */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void PlayerBlock();

    /** Execute a player dodge action */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    void PlayerDodge();

    /** Calculate damage with crit chance and multiplier */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Combat")
    float CalculateDamage(float BaseDamage, float CritChance = 0.1f, float CritMultiplier = 2.0f);

    /** Player health data */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Combat")
    FHealthBarData PlayerHealth;

    /** Enemy health data */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Combat")
    FHealthBarData EnemyHealth;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Combat")
    FOnCombatStarted OnCombatStarted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Combat")
    FOnCombatEnded OnCombatEnded;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Combat")
    FOnDamageDealt OnDamageDealt;

private:
    ECombatMode CurrentCombatMode = ECombatMode::RealTime;

    UPROPERTY()
    AActor* CurrentEnemy = nullptr;

    /** Whether the player is currently blocking */
    bool bIsBlocking = false;

    /** Whether the player is in a dodge window */
    bool bIsDodging = false;

    /** Queue of actions for turn-based mode */
    TArray<FString> TurnActionQueue;

    /** Process turn-based action queue */
    void ProcessTurnQueue();

    /** Award XP on combat end */
    void AwardCombatXP();
};
