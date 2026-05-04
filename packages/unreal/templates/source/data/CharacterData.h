#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "CharacterData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulCharacterData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CharacterId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FirstName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MiddleName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LastName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Suffix;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Gender;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsAlive = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Occupation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CurrentLocation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Status;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString HomeResidenceId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 BirthYear = 0;

    // Personality (Big Five)
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Openness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Conscientiousness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Extroversion = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Agreeableness = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Neuroticism = 0.f;
};
