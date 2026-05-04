#include "BuildingSignManager.h"
#include "Components/TextRenderComponent.h"

ABuildingSignManager::ABuildingSignManager()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void ABuildingSignManager::CreateSign(FString BusinessName, FVector BuildingPos, FRotator FacingDir, float SignWidth)
{
    FBuildingSignData Data;
    Data.BusinessName = BusinessName;
    Data.BuildingPosition = BuildingPos;
    Data.FacingDirection = FacingDir;
    Data.SignWidth = SignWidth;

    CreateSignFromData(Data);
}

void ABuildingSignManager::CreateSignFromData(const FBuildingSignData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Creating sign '%s' at building (%.1f, %.1f, %.1f) width %.1f"),
        *Data.BusinessName, Data.BuildingPosition.X, Data.BuildingPosition.Y, Data.BuildingPosition.Z, Data.SignWidth);

    // Calculate sign position: above building base, offset from wall
    const FVector FacingVec = Data.FacingDirection.Vector();
    const FVector SignPos = Data.BuildingPosition
        + FVector(0.f, SignMountHeight, 0.f)
        + FacingVec * WallOffset;

    // Create text render component for the business name
    UTextRenderComponent* TextComp = NewObject<UTextRenderComponent>(this);
    if (TextComp)
    {
        TextComp->SetupAttachment(RootComponent);
        TextComp->RegisterComponent();

        TextComp->SetText(FText::FromString(Data.BusinessName));
        TextComp->SetWorldLocation(SignPos);
        TextComp->SetWorldRotation(Data.FacingDirection);
        TextComp->SetWorldSize(DefaultTextSize);
        TextComp->SetTextRenderColor(Data.TextColor.ToFColor(true));
        TextComp->SetHorizontalAlignment(EHTA_Center);
        TextComp->SetVerticalAlignment(EVRTA_TextCenter);
    }

    SpawnedSigns.Add(Data);
}

void ABuildingSignManager::CreateSigns(const TArray<FBuildingSignData>& Signs)
{
    for (const FBuildingSignData& Data : Signs)
    {
        CreateSignFromData(Data);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Created %d building signs"), Signs.Num());
}
