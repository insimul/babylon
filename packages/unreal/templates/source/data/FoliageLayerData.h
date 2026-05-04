#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "FoliageLayerData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulFoliageLayerData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FoliageType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Biome;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Density = 0.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ScaleRangeMin = 0.2f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ScaleRangeMax = 0.6f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxSlope = 0.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ElevationRangeMin = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ElevationRangeMax = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 InstanceCount = 0;
};
