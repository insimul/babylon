#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "ProceduralNatureGenerator.generated.h"

UENUM(BlueprintType)
enum class EGeologicalFeatureType : uint8
{
    Boulder,
    RockCluster,
    StonePillar,
    RockOutcrop,
    CrystalFormation
};

USTRUCT(BlueprintType)
struct FNatureLODProfile
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere) TArray<float> LODDistances = { 5000.f, 8000.f, 12000.f };
    UPROPERTY(EditAnywhere) TArray<float> LODReductionFactors = { 1.0f, 0.5f, 0.25f };
};

UCLASS()
class INSIMULEXPORT_API AProceduralNatureGenerator : public AActor
{
    GENERATED_BODY()

public:
    AProceduralNatureGenerator();

    /** Scatter trees and rocks using instanced meshes.
     *  @param TerrainSize  Terrain extent in cm
     *  @param Seed         Random seed for determinism
     *  @param BuildingPositions  Positions to avoid when placing nature
     *  @param RoadSegments       Road start/end pairs to avoid
     *  @param InWorldCenter      Center of the world for placement bounds
     */
    void GenerateNature(int32 TerrainSize, int32 Seed,
                        const TArray<FVector>& BuildingPositions,
                        const TArray<TPair<FVector, FVector>>& RoadSegments,
                        FVector InWorldCenter);

    /** Return all tree ISMC components for external cloning (e.g., grove lots). */
    TArray<UInstancedStaticMeshComponent*> GetTreeTemplates() const;

    /** Register a custom tree variant mesh for use during generation. */
    UFUNCTION(BlueprintCallable, Category = "Nature")
    void RegisterTreeVariant(UStaticMesh* Mesh);

    /** Set the LOD profile for nature objects. */
    UFUNCTION(BlueprintCallable, Category = "Nature")
    void SetLODProfile(const FNatureLODProfile& Profile);

    /** Generate geological features (boulders, pillars, outcrops, crystals) based on density. */
    void GenerateGeologicalFeatures(int32 Seed, float Density,
                                     const TArray<EGeologicalFeatureType>& Features,
                                     float ScatterRadius, FVector WorldCenter,
                                     const TArray<FVector>& BuildingPositions,
                                     const TArray<TPair<FVector, FVector>>& RoadSegments);

    /** Stub for terrain-aware placement using heightmap/slope analysis. */
    UFUNCTION(BlueprintCallable, Category = "Nature")
    void GenerateTerrainAwarePlacements();

    /** Return a map of object counts by category. */
    UFUNCTION(BlueprintCallable, Category = "Nature")
    TMap<FString, int32> GetLODStats() const;

private:
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* TreeTrunkISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* TreeCanopyISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* PineCanopyISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* PalmTrunkISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* RockISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* FlowerISMC;
    UPROPERTY(VisibleAnywhere) UInstancedStaticMeshComponent* GeologicalISMC;

    UPROPERTY() TArray<UStaticMesh*> RegisteredTreeVariants;
    FNatureLODProfile CurrentLODProfile;
    int32 GeologicalFeatureCount = 0;

    bool IsNearBuilding(const FVector& Pos, const TArray<FVector>& Buildings, float MinDist) const;
    bool IsNearRoad(const FVector& Pos, const TArray<TPair<FVector, FVector>>& Roads, float MinDist) const;
    float PointToSegmentDist2D(const FVector& P, const FVector& A, const FVector& B) const;
};
