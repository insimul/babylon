#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "LotData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulLotData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LotId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Address;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 HouseNumber = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StreetName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Block;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString DistrictName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
};
