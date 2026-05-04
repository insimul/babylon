#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AnimalNPCManager.generated.h"

UENUM(BlueprintType)
enum class EAnimalBehavior : uint8
{
    Wander UMETA(DisplayName = "Wander"),
    Flee   UMETA(DisplayName = "Flee"),
    Follow UMETA(DisplayName = "Follow"),
    Idle   UMETA(DisplayName = "Idle"),
    Graze  UMETA(DisplayName = "Graze")
};

USTRUCT(BlueprintType)
struct FAnimalData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString AnimalId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Species;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EAnimalBehavior Behavior = EAnimalBehavior::Idle;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsPet = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bIsRideable = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString OwnerId;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAnimalSpawned, const FAnimalData&, AnimalData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAnimalMounted, const FString&, AnimalId);

/**
 * Manages animal NPCs — spawning, behavior states, mounting, and ownership.
 */
UCLASS()
class INSIMULEXPORT_API UAnimalNPCManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Spawn an animal at a position */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    FString SpawnAnimal(const FString& Species, FVector Position, bool bIsPet = false, bool bIsRideable = false);

    /** Remove an animal from the world */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    void DespawnAnimal(const FString& AnimalId);

    /** Set the behavior state for an animal */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    void SetBehavior(const FString& AnimalId, EAnimalBehavior Behavior);

    /** Get animals within a radius of a position */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    TArray<FAnimalData> GetNearbyAnimals(FVector Position, float Radius) const;

    /** Mount a rideable animal */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    bool MountAnimal(const FString& AnimalId);

    /** Dismount the currently mounted animal */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animals")
    void DismountAnimal();

    /** Maximum number of active animals */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Animals")
    int32 MaxAnimals = 20;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Animals")
    FOnAnimalSpawned OnAnimalSpawned;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Animals")
    FOnAnimalMounted OnAnimalMounted;

private:
    /** All active animals keyed by animal ID */
    TMap<FString, FAnimalData> Animals;

    /** Currently mounted animal ID (empty if none) */
    FString MountedAnimalId;

    /** Counter for generating unique animal IDs */
    int32 NextAnimalIndex = 0;

    /** Get the mesh path for a species */
    FString GetSpeciesMeshPath(const FString& Species) const;
};
