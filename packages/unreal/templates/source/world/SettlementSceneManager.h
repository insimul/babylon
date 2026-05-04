#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SettlementSceneManager.generated.h"

/** Zone type within a settlement. */
UENUM(BlueprintType)
enum class ESettlementZone : uint8
{
    Downtown    UMETA(DisplayName = "Downtown"),
    Commercial  UMETA(DisplayName = "Commercial"),
    Residential UMETA(DisplayName = "Residential"),
    Industrial  UMETA(DisplayName = "Industrial"),
    Park        UMETA(DisplayName = "Park")
};

/** LOD level for settlement rendering. */
UENUM(BlueprintType)
enum class ESettlementLOD : uint8
{
    Full        UMETA(DisplayName = "Full Detail"),
    Medium      UMETA(DisplayName = "Medium Detail"),
    Low         UMETA(DisplayName = "Low Detail"),
    Billboard   UMETA(DisplayName = "Billboard"),
    Hidden      UMETA(DisplayName = "Hidden")
};

/** Zone region within a settlement. */
USTRUCT(BlueprintType)
struct FSettlementZoneData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    ESettlementZone ZoneType = ESettlementZone::Residential;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    FVector Center = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    float Radius = 50.f;
};

/** Tracked settlement data. */
USTRUCT(BlueprintType)
struct FSettlementSceneData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    FString Id;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    FVector Center = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    float Radius = 100.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    int32 Population = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    ESettlementLOD CurrentLOD = ESettlementLOD::Hidden;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    bool bIsVisible = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
    TArray<FSettlementZoneData> Zones;
};

/**
 * Manages settlement visibility and LOD based on player distance.
 * Mirrors shared/game-engine/rendering/SettlementSceneManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API USettlementSceneManager : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Maximum number of settlements rendered in full 3D at once. */
    static constexpr int32 MAX_SETTLEMENTS_3D = 16;

    /** LOD distance thresholds. */
    static constexpr float LOD_FULL_DISTANCE = 500.f;
    static constexpr float LOD_MEDIUM_DISTANCE = 1500.f;
    static constexpr float LOD_LOW_DISTANCE = 3000.f;
    static constexpr float LOD_BILLBOARD_DISTANCE = 6000.f;

    /** Register a settlement for tracking. */
    UFUNCTION(BlueprintCallable, Category = "Settlement")
    void RegisterSettlement(FString Id, FVector Center, float Radius, int32 Population);

    /** Update visibility and LOD for all settlements based on player position. */
    UFUNCTION(BlueprintCallable, Category = "Settlement")
    void UpdateVisibility(FVector PlayerPos);

    /** Get all settlements currently marked as active (visible). */
    UFUNCTION(BlueprintCallable, Category = "Settlement")
    TArray<FSettlementSceneData> GetActiveSettlements() const;

    /** Get a settlement by ID. Returns false if not found. */
    UFUNCTION(BlueprintCallable, Category = "Settlement")
    bool GetSettlement(const FString& Id, FSettlementSceneData& OutData) const;

    /** Get the LOD level for a given distance. */
    UFUNCTION(BlueprintCallable, Category = "Settlement")
    static ESettlementLOD GetLODForDistance(float Distance);

private:
    UPROPERTY()
    TArray<FSettlementSceneData> Settlements;
};
