#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "WaterFeatureData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulWaterFeatureData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WaterFeatureId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WaterType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SubType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WaterLevel = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Depth = 200.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 1000.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float FlowSpeed = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsNavigable = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsDrinkable = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Biome;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Transparency = 0.3f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ModelAssetKey;
};
