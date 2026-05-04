#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProceduralMeshComponent.h"
#include "ProceduralTerrainGenerator.generated.h"

/**
 * Generates terrain mesh from heightmap data exported in LevelDescriptor.json.
 * Uses ProceduralMeshComponent with slope-based material blending.
 */
UCLASS()
class INSIMULEXPORT_API AProceduralTerrainGenerator : public AActor
{
    GENERATED_BODY()

public:
    AProceduralTerrainGenerator();

    /** Build terrain mesh from a 2D heightmap grid. */
    UFUNCTION(BlueprintCallable, Category = "Terrain")
    void GenerateFromHeightmap(const TArray<float>& HeightmapData, int32 Resolution,
                               float TerrainSizeCm, float ElevationScaleCm,
                               FLinearColor GroundColor);

    /** Build terrain from LevelDescriptor JSON terrain object. */
    void GenerateFromJson(const TSharedPtr<FJsonObject>& TerrainJson);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Terrain")
    UProceduralMeshComponent* TerrainMesh;

    /** Elevation scale multiplier (heightmap [0,1] * this = world height in cm). Default 2000 (= 20m). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terrain")
    float ElevationScale = 2000.f;

    /** Slope threshold below which grass material is used (normalised 0-1). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terrain")
    float GrassSlopeMax = 0.3f;

    /** Slope threshold below which rock material is used; above this is cliff. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terrain")
    float RockSlopeMax = 0.6f;

private:
    void BuildMesh(const TArray<float>& HeightmapData, int32 Resolution,
                   float TerrainSizeCm, float ElevationScaleCm, FLinearColor GroundColor);

    /** Compute vertex color from local slope for slope-based blending. */
    static FColor SlopeToVertexColor(float Slope, float GrassMax, float RockMax);
};
