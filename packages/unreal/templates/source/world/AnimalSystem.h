#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AnimalSystem.generated.h"

UENUM(BlueprintType)
enum class EAnimalSpecies : uint8
{
    Cat  UMETA(DisplayName = "Cat"),
    Dog  UMETA(DisplayName = "Dog"),
    Bird UMETA(DisplayName = "Bird"),
};

/**
 * Ambient animal that wanders near its home position.
 * Assembled from primitive meshes (sphere, cube, cylinder).
 */
UCLASS()
class INSIMULEXPORT_API AInsimulAnimal : public AActor
{
    GENERATED_BODY()

public:
    AInsimulAnimal();
    virtual void Tick(float DeltaTime) override;

    /** Initialize species, position, and build primitive body */
    void InitAnimal(EAnimalSpecies InSpecies, FVector InHome, int32 ColorSeed);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) EAnimalSpecies Species;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) FVector HomePosition;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float WanderRadius = 1500.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MoveSpeed = 150.f;

private:
    void PickNewTarget();
    void BuildCatBody(int32 ColorSeed);
    void BuildDogBody(int32 ColorSeed);
    void BuildBirdBody(int32 ColorSeed);

    UPROPERTY() USceneComponent* Root;
    FVector TargetPosition;
    float BehaviorTimer = 0.f;
    float IdleDuration = 3.f;
    bool bIsIdle = true;
    float FlightAltitude = 0.f; // birds only
};
