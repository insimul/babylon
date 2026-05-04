#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "GameTypes.h"
#include "InfrastructureData.h"
#include "SettlementData.generated.h"

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulStreetNode
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> IntersectionOf;
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulStreetSegment
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Direction;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NodeIds;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FVector> Waypoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 250.f;
};

/** A street in game-format coordinates, produced by mapping IR streetNetwork segments with re-centered waypoints. */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulGameStreet
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FVector> Waypoints;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Width = 6.f;
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulSettlementData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Population = 100;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector Position = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Radius = 20.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CountryId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StateId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MayorId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MinElevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxElevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MeanElevation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ElevationRange = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SlopeClass = TEXT("flat");

    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulInfrastructureItem> Infrastructure;

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StreetNetworkLayout;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulStreetNode> StreetNodes;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulStreetSegment> StreetSegments;

    /** Game-format streets mapped from streetNetwork with re-centered waypoints. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulGameStreet> Streets;
};
