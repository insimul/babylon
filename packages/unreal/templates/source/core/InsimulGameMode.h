#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "InsimulGameMode.generated.h"

class UStaticMesh;
class UMaterial;
class AInsimulMeshActor;
class ANPCCharacter;
class AProceduralTerrainGenerator;
class AProceduralNatureGenerator;
class AInsimulAnimal;
class UDirectionalLightComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UDayNightSystem;
class UWeatherSystem;

UCLASS()
class INSIMULEXPORT_API AInsimulGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AInsimulGameMode();

    virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
    virtual void BeginPlay() override;
    virtual void StartPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    /** Spawn all world entities from IR data */
    UFUNCTION(BlueprintCallable, Category = "Insimul")
    void SpawnWorldEntities();

    /** Map from ModelAssetKey to a Blueprint/Actor class. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul Assets")
    TMap<FString, TSubclassOf<AActor>> BuildingBlueprintMap;

    /** Optional NPC Blueprint class. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul Assets")
    TSubclassOf<ANPCCharacter> NPCBlueprintClass;

private:
    void SetupLighting();
    void GenerateTerrain();
    void SpawnBuildings();
    void SpawnRoads();
    void SpawnNPCs();
    void SpawnNature();
    void SpawnWater();
    void SpawnAnimals();
    void SpawnItems();

    /** Load a JSON array from Content/Data */
    TArray<TSharedPtr<FJsonValue>> LoadJsonArrayFile(const FString& FileName);

    /** Spawn a static-mesh actor with a colored material */
    AInsimulMeshActor* SpawnColoredMesh(UStaticMesh* Mesh, FVector Location, FVector Scale,
                                        FLinearColor Color, FRotator Rotation = FRotator::ZeroRotator);

    /** Attach a colored mesh component to an existing actor */
    UStaticMeshComponent* AttachColoredMesh(AActor* Parent, UStaticMesh* Mesh, FName Name,
                                            FVector RelLoc, FVector Scale, FLinearColor Color,
                                            FRotator Rot = FRotator::ZeroRotator);

    /** Build a multi-part procedural building on a root actor */
    void BuildProceduralBuilding(AActor* Actor, int32 Floors, double W, double D, double Rot,
                                 const FString& BuildingRole, bool bChimney, bool bBalcony);

    /** Get style-based color for a building part */
    FLinearColor GetBuildingStyleColor(const FString& Role, const FString& Part);

    UPROPERTY() UStaticMesh* CubeMesh;
    UPROPERTY() UStaticMesh* SphereMesh;
    UPROPERTY() UStaticMesh* CylinderMesh;
    UPROPERTY() UMaterial* BaseMaterial;
    UPROPERTY() UTexture2D* GroundTexture;
    UPROPERTY() AProceduralTerrainGenerator* TerrainGenerator;

    FVector WorldCenter = FVector::ZeroVector;

    /** Cached during SpawnBuildings for nature/item placement */
    TArray<FVector> BuildingPositions;
    TArray<double> BuildingRotations;
    TArray<double> BuildingWidths;
    TArray<double> BuildingDepths;

    /** Cached during SpawnRoads for nature avoidance */
    TArray<TPair<FVector, FVector>> RoadSegments;

    /** Light components for day/night and weather systems */
    UPROPERTY() UDirectionalLightComponent* SunLightComp = nullptr;
    UPROPERTY() USkyLightComponent* SkyLightComp = nullptr;
    UPROPERTY() UExponentialHeightFogComponent* FogComp = nullptr;
};
