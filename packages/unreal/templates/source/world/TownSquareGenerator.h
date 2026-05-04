#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TownSquareGenerator.generated.h"

/** Decorative element type for town squares. */
UENUM(BlueprintType)
enum class ETownSquareElement : uint8
{
    Fountain     UMETA(DisplayName = "Fountain"),
    Bench        UMETA(DisplayName = "Bench"),
    MarketStall  UMETA(DisplayName = "Market Stall"),
    Statue       UMETA(DisplayName = "Statue"),
    Tree         UMETA(DisplayName = "Tree"),
    Lamp         UMETA(DisplayName = "Lamp Post")
};

/** Connection point from the town square to the street network. */
USTRUCT(BlueprintType)
struct FSquareConnectionPoint
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    FVector Direction = FVector::ForwardVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    FString ConnectedStreetName;
};

/** Placed decorative element in the town square. */
USTRUCT(BlueprintType)
struct FSquareDecoration
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    ETownSquareElement ElementType = ETownSquareElement::Bench;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    FRotator Rotation = FRotator::ZeroRotator;
};

/**
 * Generates central gathering areas for settlements.
 * Mirrors shared/game-engine/rendering/TownSquareGenerator.ts.
 */
UCLASS()
class INSIMULEXPORT_API ATownSquareGenerator : public AActor
{
    GENERATED_BODY()

public:
    ATownSquareGenerator();

    /** Generate a town square at the settlement center. */
    UFUNCTION(BlueprintCallable, Category = "TownSquare")
    void GenerateTownSquare(FVector SettlementCenter, float SquareRadius, FString Style);

    /** Get the connection points created by the last generation. */
    UFUNCTION(BlueprintCallable, Category = "TownSquare")
    TArray<FSquareConnectionPoint> GetConnectionPoints() const;

    /** Get all decorations placed in the square. */
    UFUNCTION(BlueprintCallable, Category = "TownSquare")
    TArray<FSquareDecoration> GetDecorations() const;

    /** Number of street connection points to generate (default 4). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    int32 ConnectionPointCount = 4;

    /** Ground material for the square surface. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "TownSquare")
    UMaterialInterface* GroundMaterial = nullptr;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FSquareConnectionPoint> ConnectionPoints;

    UPROPERTY()
    TArray<FSquareDecoration> Decorations;

    void PlaceDecorations(FVector Center, float Radius, const FString& Style);
    void GenerateConnectionPoints(FVector Center, float Radius);
};
