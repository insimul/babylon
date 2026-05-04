#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "ResourceData.generated.h"

/** Row type for DT_Resources — one per resource type (wood, stone, iron, etc.) */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulResourceData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ResourceId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ResourceName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FLinearColor Color = FLinearColor::White;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxStack = 999;
    /** Milliseconds to gather one unit */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float GatherTime = 1500.f;
    /** Milliseconds until node respawns after depletion */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RespawnTime = 60000.f;
};

/** Row type for DT_GatheringNodes — individual harvestable nodes placed in the world */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulGatheringNodeData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NodeId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ResourceType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxAmount = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float RespawnTime = 60000.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Scale = 1.f;
};
