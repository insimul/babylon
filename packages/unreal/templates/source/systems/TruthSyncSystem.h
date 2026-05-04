#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TruthSyncSystem.generated.h"

USTRUCT(BlueprintType)
struct FWorldTruth
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString TruthId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Title;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Content;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bActive = true;

    /** Game hour at which this truth expires (0 = never expires) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ExpiresAtGameHour = 0.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTruthChanged, const FString&, TruthId);

/**
 * Manages world truths — facts about the game world that can be set, expire,
 * and gate content. Mirrors Insimul's truth/state system.
 */
UCLASS()
class INSIMULEXPORT_API UTruthSyncSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Set or update a world truth */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    void SetTruth(const FString& TruthId, const FString& Title, const FString& Content);

    /** Set a truth with an expiration time */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    void SetTruthWithExpiry(const FString& TruthId, const FString& Title, const FString& Content, float ExpiresAtGameHour);

    /** Remove a truth */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    void RemoveTruth(const FString& TruthId);

    /** Check if a truth is currently active */
    UFUNCTION(BlueprintPure, Category = "Insimul|Truths")
    bool IsTruthActive(const FString& TruthId) const;

    /** Get all currently active truths */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    TArray<FWorldTruth> GetActiveTruths() const;

    /** Expire time-limited truths — call each tick or at intervals */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    void SyncTruths(float CurrentGameHour);

    /** Evaluate a content gate — returns true if all required truths are active */
    UFUNCTION(BlueprintPure, Category = "Insimul|Truths")
    bool EvaluateContentGating(const FString& GateId) const;

    /** Register a content gate with its required truths */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Truths")
    void RegisterContentGate(const FString& GateId, const TArray<FString>& RequiredTruths);

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Truths")
    FOnTruthChanged OnTruthChanged;

private:
    /** All truths keyed by truth ID */
    TMap<FString, FWorldTruth> Truths;

    /** Content gates: gate ID -> array of required truth IDs */
    TMap<FString, TArray<FString>> ContentGates;
};
