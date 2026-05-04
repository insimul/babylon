#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "ActionData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulActionData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActionId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActionType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Duration = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Difficulty = 0.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 EnergyCost = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bRequiresTarget = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Range = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Cooldown = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActive = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Tags;

    // Prolog content — single source of truth
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Content;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString VerbPast;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString VerbPresent;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NarrativeTemplates;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsBase = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CustomData; // JSON string
};
