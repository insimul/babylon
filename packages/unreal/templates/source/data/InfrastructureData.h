#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "InfrastructureData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulInfrastructureItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Level = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 BuiltYear = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
};
