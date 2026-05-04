#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "BuildingSignManager.generated.h"

/** Data describing a sign to create on a building facade. */
USTRUCT(BlueprintType)
struct FBuildingSignData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    FString BusinessName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    FVector BuildingPosition = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    FRotator FacingDirection = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    float SignWidth = 3.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    float SignHeight = 1.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    FLinearColor TextColor = FLinearColor::White;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    FLinearColor BackgroundColor = FLinearColor(0.2f, 0.15f, 0.1f, 1.f);
};

/**
 * Generates sign meshes on building facades using UTextRenderComponent.
 * Mirrors shared/game-engine/rendering/BuildingSignManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API ABuildingSignManager : public AActor
{
    GENERATED_BODY()

public:
    ABuildingSignManager();

    /** Create a sign on a building facade. */
    UFUNCTION(BlueprintCallable, Category = "Sign")
    void CreateSign(FString BusinessName, FVector BuildingPos, FRotator FacingDir, float SignWidth);

    /** Create a sign from full data. */
    UFUNCTION(BlueprintCallable, Category = "Sign")
    void CreateSignFromData(const FBuildingSignData& Data);

    /** Batch-create signs. */
    UFUNCTION(BlueprintCallable, Category = "Sign")
    void CreateSigns(const TArray<FBuildingSignData>& Signs);

    /** Height above building base where signs are placed. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    float SignMountHeight = 4.f;

    /** Offset from the building wall surface. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    float WallOffset = 0.2f;

    /** Default font size for sign text. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sign")
    float DefaultTextSize = 24.f;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FBuildingSignData> SpawnedSigns;
};
