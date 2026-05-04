#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "WorldScaleManager.generated.h"

/** Axis-aligned territory bounding box with cached center. */
USTRUCT(BlueprintType)
struct FTerritoryBounds
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float MinX = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float MaxX = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float MinZ = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float MaxZ = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float CenterX = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float CenterZ = 0.f;
};

/** A settlement placed within a state or country. */
USTRUCT(BlueprintType)
struct FScaledSettlement
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Id;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Name;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString StateId;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString CountryId;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FVector Position = FVector::ZeroVector;

    /** Radius derived from population. */
    UPROPERTY(BlueprintReadWrite, Category = "World")
    float Radius = 20.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    int32 Population = 0;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString SettlementType;
};

/** A state region within a country. */
USTRUCT(BlueprintType)
struct FScaledState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Id;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Name;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString CountryId;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FTerritoryBounds Bounds;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    TArray<FScaledSettlement> Settlements;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Terrain;
};

/** A country containing states. */
USTRUCT(BlueprintType)
struct FScaledCountry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Id;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Name;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FTerritoryBounds Bounds;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    TArray<FScaledState> States;
};

/** Lot metadata returned by street-aligned generation. */
USTRUCT(BlueprintType)
struct FPlacedLot
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    float FacingAngle = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    int32 HouseNumber = 0;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString StreetName;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    bool bIsCorner = false;
};

/** Street segment returned by street-aligned generation. */
USTRUCT(BlueprintType)
struct FStreetSegment
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FVector Start = FVector::ZeroVector;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FVector End = FVector::ZeroVector;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    FString Name;
};

/** Full result of street-aligned settlement generation. */
USTRUCT(BlueprintType)
struct FStreetAlignedResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "World")
    TArray<FStreetSegment> Streets;

    UPROPERTY(BlueprintReadWrite, Category = "World")
    TArray<FPlacedLot> Lots;
};

UCLASS()
class INSIMULEXPORT_API UWorldScaleManager : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UPROPERTY(BlueprintReadOnly, Category = "World")
    int32 TerrainSize = {{TERRAIN_SIZE}};

    /** Runtime scale factor applied to all world positions (default 1.0). */
    UPROPERTY(BlueprintReadOnly, Category = "World")
    float ScaleFactor = {{WORLD_SCALE_FACTOR}};

    UPROPERTY(BlueprintReadOnly, Category = "World")
    FLinearColor GroundColor = FLinearColor({{GROUND_COLOR_R}}, {{GROUND_COLOR_G}}, {{GROUND_COLOR_B}});

    UPROPERTY(BlueprintReadOnly, Category = "World")
    FLinearColor SkyColor = FLinearColor({{SKY_COLOR_R}}, {{SKY_COLOR_G}}, {{SKY_COLOR_B}});

    UPROPERTY(BlueprintReadOnly, Category = "World")
    FLinearColor RoadColor = FLinearColor({{ROAD_COLOR_R}}, {{ROAD_COLOR_G}}, {{ROAD_COLOR_B}});

    // --- Scale constants ---
    static constexpr float SPAWN_CLEAR_RADIUS = 15.f;
    static constexpr float COUNTRY_MIN_SIZE = 200.f;
    static constexpr float COUNTRY_MAX_SIZE = 400.f;
    static constexpr float STATE_MIN_SIZE = 60.f;
    static constexpr float STATE_MAX_SIZE = 150.f;

    // --- Population helpers ---

    UFUNCTION(BlueprintCallable, Category = "World")
    static float GetSettlementRadius(int32 Population);

    UFUNCTION(BlueprintCallable, Category = "World")
    static int32 GetBuildingCount(int32 Population);

    UFUNCTION(BlueprintCallable, Category = "World")
    static FString GetSettlementTier(int32 Population);

    // --- Territory distribution ---

    /** Distribute countries across the world map in a grid layout. */
    UFUNCTION(BlueprintCallable, Category = "World")
    TArray<FScaledCountry> DistributeCountries(const TArray<FString>& CountryIds, const TArray<FString>& CountryNames);

    /** Distribute states within a country in a grid layout. */
    UFUNCTION(BlueprintCallable, Category = "World")
    TArray<FScaledState> DistributeStatesInCountry(const FScaledCountry& Country, const TArray<FString>& StateIds, const TArray<FString>& StateNames, const TArray<FString>& StateTerrains);

    // --- Settlement distribution ---

    /** Distribute settlements within territory bounds with collision detection. */
    UFUNCTION(BlueprintCallable, Category = "World")
    TArray<FScaledSettlement> DistributeSettlementsInTerritory(
        const FTerritoryBounds& Bounds, const FString& TerritoryId, bool bIsState,
        const TArray<FString>& SettlementIds, const TArray<FString>& SettlementNames,
        const TArray<int32>& Populations, const TArray<FString>& SettlementTypes,
        const TArray<float>& WorldPositionsX, const TArray<float>& WorldPositionsZ);

    /** Legacy: distribute settlements using flat vectors (kept for backward compat). */
    UFUNCTION(BlueprintCallable, Category = "World")
    static TArray<FVector> DistributeSettlements(FVector BoundsMin, FVector BoundsMax, FVector BoundsCenter, int32 SettlementCount, const TArray<float>& Radii, int32 WorldSeed);

    // --- Lot generation ---

    UFUNCTION(BlueprintCallable, Category = "World")
    static TArray<FVector> GenerateLotPositions(FVector SettlementPosition, float SettlementRadius, int32 LotCount);

    /** Generate a full street-aligned layout for a settlement. */
    UFUNCTION(BlueprintCallable, Category = "World")
    FStreetAlignedResult GenerateStreetAlignedSettlement(FVector SettlementPosition, float SettlementRadius, int32 LotCount, int32 BizCount = 0);

    // --- World sizing ---

    UFUNCTION(BlueprintCallable, Category = "World")
    static int32 CalculateOptimalWorldSize(int32 CountryCount, int32 StateCount, int32 SettlementCount);

private:
    FString Seed = TEXT("world");

    /** Deterministic seeded PRNG identical to the TypeScript source (hash * 9301 + 49297) % 233280. */
    static int32 CreateSeedHash(const FString& SeedString);
    static float SeededRandom(int32& Hash);
};
