#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "NPCData.generated.h"

/** Activity type matching IR ScheduleActivityType */
UENUM(BlueprintType)
enum class EScheduleActivity : uint8
{
    Sleep        UMETA(DisplayName = "Sleep"),
    Work         UMETA(DisplayName = "Work"),
    Eat          UMETA(DisplayName = "Eat"),
    Socialize    UMETA(DisplayName = "Socialize"),
    Shop         UMETA(DisplayName = "Shop"),
    Wander       UMETA(DisplayName = "Wander"),
    IdleAtHome   UMETA(DisplayName = "Idle At Home"),
    VisitFriend  UMETA(DisplayName = "Visit Friend"),
};

/** A single time block in an NPC's daily schedule */
USTRUCT(BlueprintType)
struct FScheduleBlock
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float StartHour = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float EndHour = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) EScheduleActivity Activity = EScheduleActivity::Sleep;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Priority = 0;
};

/** Full daily schedule for an NPC */
USTRUCT(BlueprintType)
struct FNPCSchedule
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HomeBuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WorkBuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> FriendBuildingIds;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FScheduleBlock> Blocks;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WakeHour = 6.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BedtimeHour = 22.f;
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulNPCData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CharacterId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NPCRole;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector HomePosition = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PatrolRadius = 20.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Disposition = 50.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> QuestIds;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Greeting;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FNPCSchedule Schedule;
};
