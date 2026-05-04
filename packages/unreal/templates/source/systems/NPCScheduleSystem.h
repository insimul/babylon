#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCScheduleSystem.generated.h"

/**
 * NPC daily schedule subsystem.
 * Manages time-based NPC activities and destinations, firing events on schedule
 * transitions so movement and animation systems can respond.
 */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FNPCScheduleEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Schedule")
    int32 StartHour = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Schedule")
    int32 EndHour = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Schedule")
    FString Activity;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Schedule")
    FString BuildingId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Schedule")
    FVector Position = FVector::ZeroVector;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnScheduleTransition, const FString&, CharacterId,
                                                 const FString&, OldActivity, const FString&, NewActivity);

UCLASS()
class INSIMULEXPORT_API UNPCScheduleSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Register an NPC with a daily schedule */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Schedule")
    void RegisterNPC(const FString& CharacterId, const TArray<FNPCScheduleEntry>& Schedule);

    /** Unregister an NPC from the schedule system */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Schedule")
    void UnregisterNPC(const FString& CharacterId);

    /** Get the current activity for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Schedule")
    FString GetCurrentActivity(const FString& CharacterId) const;

    /** Get the current destination for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Schedule")
    FVector GetCurrentDestination(const FString& CharacterId) const;

    /** Update all NPC schedules based on current game hour */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Schedule")
    void UpdateAllSchedules(float CurrentGameHour);

    /** Fired when an NPC transitions between schedule blocks */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Schedule")
    FOnScheduleTransition OnScheduleTransition;

private:
    /** NPC schedules keyed by character ID */
    TMap<FString, TArray<FNPCScheduleEntry>> NPCSchedules;

    /** Current schedule block index per NPC */
    TMap<FString, int32> CurrentBlockIndices;

    /** Find the schedule block index for a given hour */
    int32 FindBlockForHour(const TArray<FNPCScheduleEntry>& Schedule, float Hour) const;
};
