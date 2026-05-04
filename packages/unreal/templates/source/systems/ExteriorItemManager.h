#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ExteriorItemManager.generated.h"

/** Data for a readable book or document spawned in the world. */
USTRUCT(BlueprintType)
struct FBookData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString BookId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString Title;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString Author;

    /** Full text content from TextIR. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString Content;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString Language;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    bool bIsPickup = true;
};

/** Data for a generic exterior item. */
USTRUCT(BlueprintType)
struct FExteriorItemData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString ItemId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FVector Position = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    FString MeshAssetPath;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    bool bIsPickup = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    float InteractionRadius = 2.f;
};

/** Delegate fired when an item is picked up. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemPickedUp, const FString&, ItemId, const FVector&, Position);

/**
 * Spawns collectible items and readable books/documents in the world exterior.
 * Mirrors shared/game-engine/rendering/ExteriorItemManager.ts and BookSpawnManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API AExteriorItemManager : public AActor
{
    GENERATED_BODY()

public:
    AExteriorItemManager();

    /** Spawn a generic item at a position. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    void SpawnItem(FString ItemId, FVector Position, FRotator Rotation);

    /** Spawn from full item data. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    void SpawnItemFromData(const FExteriorItemData& Data);

    /** Spawn a readable book/document. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    void SpawnBook(const FBookData& Data);

    /** Get all items within a radius. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    TArray<FExteriorItemData> GetItemsInRadius(FVector Center, float Radius) const;

    /** Get all books within a radius. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    TArray<FBookData> GetBooksInRadius(FVector Center, float Radius) const;

    /** Batch-spawn items. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    void SpawnItems(const TArray<FExteriorItemData>& Items);

    /** Batch-spawn books. */
    UFUNCTION(BlueprintCallable, Category = "Item")
    void SpawnBooks(const TArray<FBookData>& Books);

    /** Remove an item by ID (e.g., after pickup). */
    UFUNCTION(BlueprintCallable, Category = "Item")
    bool RemoveItem(const FString& ItemId);

    /** Fired when a player picks up an item. */
    UPROPERTY(BlueprintAssignable, Category = "Item")
    FOnItemPickedUp OnItemPickedUp;

    /** Default interaction radius for spawned items. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Item")
    float DefaultInteractionRadius = 2.f;

private:
    UPROPERTY()
    USceneComponent* SceneRoot = nullptr;

    UPROPERTY()
    TArray<FExteriorItemData> SpawnedItems;

    UPROPERTY()
    TArray<FBookData> SpawnedBooks;
};
