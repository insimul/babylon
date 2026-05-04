#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "BiomeZoneData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulBiomeZoneSpecies : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SpeciesId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Density = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinScale = 0.8f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxScale = 1.2f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TreeType;
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulBiomeZoneData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ZoneId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Biome;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ElevationZone;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MoistureLevel;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 CellCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float CoverageFraction = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float AverageElevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float AverageMoisture = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulBiomeZoneSpecies> Species;
};
