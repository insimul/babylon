#include "ContainerSpawnSystem.h"

AContainerSpawnSystem::AContainerSpawnSystem()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void AContainerSpawnSystem::SpawnContainer(const FContainerData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawning container '%s' (%s) at (%.1f, %.1f, %.1f) rarity %d, loot entries: %d"),
        *Data.ContainerId, *Data.Name,
        Data.Position.X, Data.Position.Y, Data.Position.Z,
        static_cast<int32>(Data.Rarity), Data.LootTable.Num());

    if (Data.bIsLocked)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Container '%s' is locked"), *Data.ContainerId);
    }

    if (Data.bRespawns)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Container '%s' respawns in %.0fs"), *Data.ContainerId, Data.RespawnTime);
    }

    // In a full implementation, this would spawn an interactive actor with
    // collision, interaction trigger, and visual mesh based on container type.

    SpawnedContainers.Add(Data);
}

void AContainerSpawnSystem::SpawnQuestObject(const FQuestObjectData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawning quest object '%s' for quest '%s' at (%.1f, %.1f, %.1f)"),
        *Data.ObjectId, *Data.QuestId,
        Data.Position.X, Data.Position.Y, Data.Position.Z);

    if (Data.bGlowWhenActive)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Quest object '%s' will glow when quest is active"), *Data.ObjectId);
    }

    // In a full implementation, this would spawn an interactive actor with
    // glow material, interaction trigger, and quest-state-driven visibility.

    SpawnedQuestObjects.Add(Data);
}

TArray<FContainerData> AContainerSpawnSystem::GetContainersInRadius(FVector Center, float Radius) const
{
    TArray<FContainerData> Result;
    const float RadiusSq = Radius * Radius;

    for (const FContainerData& Container : SpawnedContainers)
    {
        if (FVector::DistSquared(Container.Position, Center) <= RadiusSq)
        {
            Result.Add(Container);
        }
    }

    return Result;
}

TArray<FQuestObjectData> AContainerSpawnSystem::GetQuestObjects(const FString& QuestId) const
{
    TArray<FQuestObjectData> Result;

    for (const FQuestObjectData& Obj : SpawnedQuestObjects)
    {
        if (Obj.QuestId == QuestId)
        {
            Result.Add(Obj);
        }
    }

    return Result;
}
