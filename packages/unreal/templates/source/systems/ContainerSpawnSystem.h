#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ContainerSpawnSystem.generated.h"

/** Container rarity tier for loot tables. */
UENUM(BlueprintType)
enum class EContainerRarity : uint8
{
    Common      UMETA(DisplayName = "Common"),
    Uncommon    UMETA(DisplayName = "Uncommon"),
    Rare        UMETA(DisplayName = "Rare"),
    Epic        UMETA(DisplayName = "Epic"),
    Legendary   UMETA(DisplayName = "Legendary")
};

/** Loot table entry for container contents. */
USTRUCT(BlueprintType)
struct FLootEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    FString ItemId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    int32 MinQuantity = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    int32 MaxQuantity = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    float DropChance = 1.f;
};

/** Data for spawning a container actor. */
USTRUCT(BlueprintType)
struct FContainerData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    FString ContainerId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    EContainerRarity Rarity = EContainerRarity::Common;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    TArray<FLootEntry> LootTable;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    bool bIsLocked = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    bool bRespawns = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    float RespawnTime = 300.f;
};

/** Data for spawning a quest-related object. */
USTRUCT(BlueprintType)
struct FQuestObjectData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FString ObjectId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FString QuestId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    FString InteractionType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
    bool bGlowWhenActive = true;
};

/** Delegate fired when a container or quest object is interacted with. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnContainerInteracted, const FString&, ContainerId, const FVector&, Position);

/**
 * Spawns container actors and quest objects from IR data.
 * Mirrors shared/game-engine/rendering/ContainerSpawnSystem.ts,
 * ProceduralQuestObjects.ts, and QuestObjectManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API AContainerSpawnSystem : public AActor
{
    GENERATED_BODY()

public:
    AContainerSpawnSystem();

    /** Spawn a container actor. */
    UFUNCTION(BlueprintCallable, Category = "Container")
    void SpawnContainer(const FContainerData& Data);

    /** Spawn a quest-related object. */
    UFUNCTION(BlueprintCallable, Category = "Container")
    void SpawnQuestObject(const FQuestObjectData& Data);

    /** Get all containers within a radius. */
    UFUNCTION(BlueprintCallable, Category = "Container")
    TArray<FContainerData> GetContainersInRadius(FVector Center, float Radius) const;

    /** Get all quest objects for a specific quest. */
    UFUNCTION(BlueprintCallable, Category = "Container")
    TArray<FQuestObjectData> GetQuestObjects(const FString& QuestId) const;

    /** Fired when a container is interacted with. */
    UPROPERTY(BlueprintAssignable, Category = "Container")
    FOnContainerInteracted OnContainerInteracted;

    /** Default interaction radius for containers. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Container")
    float DefaultInteractionRadius = 2.f;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FContainerData> SpawnedContainers;

    UPROPERTY()
    TArray<FQuestObjectData> SpawnedQuestObjects;
};
