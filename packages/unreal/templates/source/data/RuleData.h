#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "RuleData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulRuleData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RuleId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Content;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString RuleType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Priority = 5;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Likelihood = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsBase = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActive = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Tags;
};
