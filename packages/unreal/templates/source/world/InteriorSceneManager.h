#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "InteriorSceneManager.generated.h"

/**
 * Interior loading mode: pre-built model or procedurally generated.
 * Mirrors InteriorMode from the TypeScript InteriorSceneManager.
 */
UENUM(BlueprintType)
enum class EInteriorMode : uint8
{
    Model       UMETA(DisplayName = "Model"),
    Procedural  UMETA(DisplayName = "Procedural")
};

/**
 * Manages loading and unloading of interior scenes when the player enters
 * or exits buildings. For buildings with Mode=Model, loads a pre-built GLB
 * interior asset. For Mode=Procedural, invokes ABuildingInteriorGenerator
 * to create interior geometry at runtime.
 *
 * Mirrors shared/game-engine/rendering/InteriorSceneManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API UInteriorSceneManager : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /**
     * Transition the player into a building interior.
     * @param BuildingId  Unique identifier for the building.
     * @param Mode        Whether to load a model or generate procedurally.
     * @param AssetPath   Path to the GLB/mesh asset (used when Mode == Model).
     */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void EnterBuilding(const FString& BuildingId, EInteriorMode Mode, const FString& AssetPath = TEXT(""));

    /** Transition the player back to the exterior world. */
    UFUNCTION(BlueprintCallable, Category = "Interior")
    void ExitBuilding();

    /** Returns true if the player is currently inside a building interior. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    bool IsInsideBuilding() const;

    /** Returns the ID of the building the player is currently inside, or empty string. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    FString GetCurrentBuildingId() const;

    /** Returns the interior mode of the current building. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Interior")
    EInteriorMode GetCurrentInteriorMode() const;

    /** Delegate broadcast when the player enters a building. */
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnBuildingEntered, const FString&, BuildingId, EInteriorMode, Mode);
    UPROPERTY(BlueprintAssignable, Category = "Interior")
    FOnBuildingEntered OnBuildingEntered;

    /** Delegate broadcast when the player exits a building. */
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnBuildingExited, const FString&, BuildingId);
    UPROPERTY(BlueprintAssignable, Category = "Interior")
    FOnBuildingExited OnBuildingExited;

private:
    /** Whether the player is currently inside a building. */
    bool bInsideBuilding = false;

    /** The ID of the building the player is currently inside. */
    FString CurrentBuildingId;

    /** The interior mode of the current building. */
    EInteriorMode CurrentMode = EInteriorMode::Model;

    /** Asset path for the current model-based interior. */
    FString CurrentAssetPath;

    /** Hide exterior world actors during interior view. */
    void HideExterior();

    /** Restore exterior world actors when leaving interior. */
    void ShowExterior();

    /** Load a pre-built interior model from the given asset path. */
    void LoadModelInterior(const FString& BuildingId, const FString& AssetPath);

    /** Invoke procedural generation for the building interior. */
    void GenerateProceduralInterior(const FString& BuildingId);

    /** Clean up the currently loaded interior scene. */
    void UnloadCurrentInterior();
};
