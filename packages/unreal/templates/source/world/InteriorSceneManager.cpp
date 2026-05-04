#include "InteriorSceneManager.h"

void UInteriorSceneManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] InteriorSceneManager initialized"));
}

void UInteriorSceneManager::Deinitialize()
{
    if (bInsideBuilding)
    {
        UnloadCurrentInterior();
        ShowExterior();
    }
    Super::Deinitialize();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

void UInteriorSceneManager::EnterBuilding(const FString& BuildingId, EInteriorMode Mode, const FString& AssetPath)
{
    if (bInsideBuilding)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Already inside building '%s', exiting first"), *CurrentBuildingId);
        ExitBuilding();
    }

    CurrentBuildingId = BuildingId;
    CurrentMode = Mode;
    CurrentAssetPath = AssetPath;
    bInsideBuilding = true;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Entering building '%s' (mode: %s)"),
        *BuildingId,
        Mode == EInteriorMode::Model ? TEXT("Model") : TEXT("Procedural"));

    HideExterior();

    switch (Mode)
    {
    case EInteriorMode::Model:
        LoadModelInterior(BuildingId, AssetPath);
        break;
    case EInteriorMode::Procedural:
        GenerateProceduralInterior(BuildingId);
        break;
    }

    OnBuildingEntered.Broadcast(BuildingId, Mode);
}

void UInteriorSceneManager::ExitBuilding()
{
    if (!bInsideBuilding)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Not inside any building, cannot exit"));
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Exiting building '%s'"), *CurrentBuildingId);

    const FString PreviousBuildingId = CurrentBuildingId;

    UnloadCurrentInterior();
    ShowExterior();

    bInsideBuilding = false;
    CurrentBuildingId.Empty();
    CurrentAssetPath.Empty();

    OnBuildingExited.Broadcast(PreviousBuildingId);
}

bool UInteriorSceneManager::IsInsideBuilding() const
{
    return bInsideBuilding;
}

FString UInteriorSceneManager::GetCurrentBuildingId() const
{
    return CurrentBuildingId;
}

EInteriorMode UInteriorSceneManager::GetCurrentInteriorMode() const
{
    return CurrentMode;
}

// ---------------------------------------------------------------------------
// Interior loading
// ---------------------------------------------------------------------------

void UInteriorSceneManager::LoadModelInterior(const FString& BuildingId, const FString& AssetPath)
{
    if (AssetPath.IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No asset path provided for model interior '%s', falling back to procedural"), *BuildingId);
        GenerateProceduralInterior(BuildingId);
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loading model interior for '%s' from '%s'"), *BuildingId, *AssetPath);

    // TODO: Load GLB/static mesh asset at AssetPath and spawn into the scene.
    // This will use UStaticMeshComponent or runtime mesh import depending on
    // whether the asset is a cooked UAsset or a raw GLB loaded via glTFRuntime.
}

void UInteriorSceneManager::GenerateProceduralInterior(const FString& BuildingId)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generating procedural interior for '%s'"), *BuildingId);

    // TODO: Find or spawn an ABuildingInteriorGenerator and invoke GenerateInterior()
    // with the building's configuration (room count, floor count, building role, etc.).
}

void UInteriorSceneManager::UnloadCurrentInterior()
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Unloading interior for '%s'"), *CurrentBuildingId);

    // TODO: Destroy spawned interior actors/components to free memory.
    // For model interiors, destroy the loaded mesh actor.
    // For procedural interiors, destroy the ABuildingInteriorGenerator and its children.
}

// ---------------------------------------------------------------------------
// Exterior visibility management
// ---------------------------------------------------------------------------

void UInteriorSceneManager::HideExterior()
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Hiding exterior world for interior transition"));

    // TODO: Iterate exterior actors (terrain, buildings, vegetation) and set visibility
    // to hidden. Consider using actor tags or a dedicated exterior layer for efficient
    // toggling. Alternatively, teleport the player to an interior sub-level.
}

void UInteriorSceneManager::ShowExterior()
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Restoring exterior world after interior exit"));

    // TODO: Restore visibility on all exterior actors hidden by HideExterior().
}
