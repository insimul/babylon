#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "BuildingData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulBuildingData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Rotation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingRole;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Floors = 2;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 10.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Depth = 10.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasChimney = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHasBalcony = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ModelAssetKey;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BusinessId;
};
