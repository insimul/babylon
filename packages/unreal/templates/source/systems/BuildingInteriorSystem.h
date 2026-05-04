#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "BuildingInteriorSystem.generated.h"

class UStaticMesh;
class UMaterial;
class AInsimulMeshActor;

/**
 * Manages building entry/exit transitions and procedural interior generation.
 * When the player interacts with a door, this system:
 * 1. Generates a procedural interior at an offset position (Z + 50000)
 * 2. Teleports the player inside
 * 3. Provides an exit trigger to return to the overworld
 */
UCLASS()
class INSIMULEXPORT_API UBuildingInteriorSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Enter a building — generates interior and teleports player */
    void EnterBuilding(const FString& BuildingId, const FString& BuildingRole,
                       FVector DoorWorldPos, float BuildingWidth, float BuildingDepth,
                       int32 Floors);

    /** Exit current building — returns player to overworld */
    void ExitBuilding();

    /** Check if player is currently inside a building */
    bool IsInsideBuilding() const { return bInsideBuilding; }

    /** Get the building ID the player is currently inside */
    FString GetCurrentBuildingId() const { return CurrentBuildingId; }

private:
    struct FurnitureSpec
    {
        FString Type;
        FVector RelativePos;
        FVector Scale;
        FLinearColor Color;
    };

    void GenerateInteriorMeshes(FVector InteriorCenter, float W, float D, float H,
                                const FString& BuildingRole);
    TArray<FurnitureSpec> GetFurnitureForRole(const FString& Role, float W, float D) const;
    void ClearInterior();

    bool bInsideBuilding = false;
    FString CurrentBuildingId;
    FVector SavedOverworldPosition;
    FRotator SavedOverworldRotation;

    /** Interior is generated at this Z offset above the overworld */
    static constexpr float InteriorZOffset = 50000.0f;

    /** Spawned interior actors to clean up on exit */
    TArray<AActor*> InteriorActors;
};
