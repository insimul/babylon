#include "ExteriorItemManager.h"

AExteriorItemManager::AExteriorItemManager()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void AExteriorItemManager::SpawnItem(FString ItemId, FVector Position, FRotator Rotation)
{
    FExteriorItemData Data;
    Data.ItemId = ItemId;
    Data.Name = ItemId;
    Data.Position = Position;
    Data.Rotation = Rotation;
    Data.InteractionRadius = DefaultInteractionRadius;

    SpawnItemFromData(Data);
}

void AExteriorItemManager::SpawnItemFromData(const FExteriorItemData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawning exterior item '%s' (%s) at (%.1f, %.1f, %.1f)"),
        *Data.ItemId, *Data.Name, Data.Position.X, Data.Position.Y, Data.Position.Z);

    // In a full implementation, this would spawn a static mesh actor with
    // an interaction trigger sphere and optional pickup logic.

    SpawnedItems.Add(Data);
}

void AExteriorItemManager::SpawnBook(const FBookData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawning book '%s' by '%s' at (%.1f, %.1f, %.1f) language '%s'"),
        *Data.Title, *Data.Author, Data.Position.X, Data.Position.Y, Data.Position.Z, *Data.Language);

    if (Data.Content.Len() > 0)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Book '%s' has %d characters of content"), *Data.BookId, Data.Content.Len());
    }

    // In a full implementation, this would spawn a book mesh actor with
    // an interaction trigger that opens a reading UI with the text content.

    SpawnedBooks.Add(Data);
}

TArray<FExteriorItemData> AExteriorItemManager::GetItemsInRadius(FVector Center, float Radius) const
{
    TArray<FExteriorItemData> Result;
    const float RadiusSq = Radius * Radius;

    for (const FExteriorItemData& Item : SpawnedItems)
    {
        if (FVector::DistSquared(Item.Position, Center) <= RadiusSq)
        {
            Result.Add(Item);
        }
    }

    return Result;
}

TArray<FBookData> AExteriorItemManager::GetBooksInRadius(FVector Center, float Radius) const
{
    TArray<FBookData> Result;
    const float RadiusSq = Radius * Radius;

    for (const FBookData& Book : SpawnedBooks)
    {
        if (FVector::DistSquared(Book.Position, Center) <= RadiusSq)
        {
            Result.Add(Book);
        }
    }

    return Result;
}

void AExteriorItemManager::SpawnItems(const TArray<FExteriorItemData>& Items)
{
    for (const FExteriorItemData& Item : Items)
    {
        SpawnItemFromData(Item);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawned %d exterior items"), Items.Num());
}

void AExteriorItemManager::SpawnBooks(const TArray<FBookData>& Books)
{
    for (const FBookData& Book : Books)
    {
        SpawnBook(Book);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawned %d books"), Books.Num());
}

bool AExteriorItemManager::RemoveItem(const FString& ItemId)
{
    for (int32 i = 0; i < SpawnedItems.Num(); i++)
    {
        if (SpawnedItems[i].ItemId == ItemId)
        {
            const FVector Pos = SpawnedItems[i].Position;
            SpawnedItems.RemoveAt(i);

            OnItemPickedUp.Broadcast(ItemId, Pos);

            UE_LOG(LogTemp, Log, TEXT("[Insimul] Removed item '%s'"), *ItemId);
            return true;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Item '%s' not found for removal"), *ItemId);
    return false;
}
