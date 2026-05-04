#include "ChunkManager.h"

void UChunkManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ChunkManager initialized (chunk size: %.0f, load radius: %d)"), CHUNK_SIZE, LoadRadius);
}

int64 UChunkManager::PackCoord(FIntPoint Coord)
{
    return (static_cast<int64>(Coord.X) << 32) | (static_cast<int64>(Coord.Y) & 0xFFFFFFFF);
}

FIntPoint UChunkManager::WorldToChunk(FVector WorldPos)
{
    return FIntPoint(
        FMath::FloorToInt(WorldPos.X / CHUNK_SIZE),
        FMath::FloorToInt(WorldPos.Z / CHUNK_SIZE)
    );
}

FChunkData& UChunkManager::GetOrCreateChunk(FIntPoint Coord)
{
    const int64 Key = PackCoord(Coord);
    FChunkData* Found = ChunkMap.Find(Key);
    if (Found)
    {
        return *Found;
    }

    FChunkData NewChunk;
    NewChunk.Coord = Coord;
    NewChunk.bIsLoaded = false;
    NewChunk.EntityCount = 0;

    return ChunkMap.Add(Key, NewChunk);
}

void UChunkManager::UpdatePlayerChunk(FVector PlayerPos)
{
    const FIntPoint NewChunk = WorldToChunk(PlayerPos);

    if (NewChunk == CurrentPlayerChunk)
    {
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Player moved to chunk (%d, %d)"), NewChunk.X, NewChunk.Y);

    // Unload chunks outside the load radius
    TArray<int64> KeysToUnload;
    for (auto& Pair : ChunkMap)
    {
        const FChunkData& Chunk = Pair.Value;
        if (Chunk.bIsLoaded)
        {
            const int32 DistX = FMath::Abs(Chunk.Coord.X - NewChunk.X);
            const int32 DistY = FMath::Abs(Chunk.Coord.Y - NewChunk.Y);
            if (DistX > LoadRadius || DistY > LoadRadius)
            {
                KeysToUnload.Add(Pair.Key);
            }
        }
    }

    for (const int64 Key : KeysToUnload)
    {
        FChunkData* Chunk = ChunkMap.Find(Key);
        if (Chunk)
        {
            Chunk->bIsLoaded = false;
            UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Unloaded chunk (%d, %d)"), Chunk->Coord.X, Chunk->Coord.Y);
        }
    }

    // Load chunks within load radius
    for (int32 DX = -LoadRadius; DX <= LoadRadius; DX++)
    {
        for (int32 DY = -LoadRadius; DY <= LoadRadius; DY++)
        {
            const FIntPoint Coord(NewChunk.X + DX, NewChunk.Y + DY);
            LoadChunk(Coord);
        }
    }

    CurrentPlayerChunk = NewChunk;
}

void UChunkManager::LoadChunk(FIntPoint ChunkCoord)
{
    FChunkData& Chunk = GetOrCreateChunk(ChunkCoord);
    if (!Chunk.bIsLoaded)
    {
        Chunk.bIsLoaded = true;
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Loaded chunk (%d, %d) with %d entities"),
            ChunkCoord.X, ChunkCoord.Y, Chunk.EntityCount);
    }
}

void UChunkManager::UnloadChunk(FIntPoint ChunkCoord)
{
    const int64 Key = PackCoord(ChunkCoord);
    FChunkData* Chunk = ChunkMap.Find(Key);
    if (Chunk && Chunk->bIsLoaded)
    {
        Chunk->bIsLoaded = false;
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Unloaded chunk (%d, %d)"), ChunkCoord.X, ChunkCoord.Y);
    }
}

TArray<FChunkData> UChunkManager::GetActiveChunks() const
{
    TArray<FChunkData> Active;
    for (const auto& Pair : ChunkMap)
    {
        if (Pair.Value.bIsLoaded)
        {
            Active.Add(Pair.Value);
        }
    }
    return Active;
}

void UChunkManager::RegisterSettlementToChunk(const FString& SettlementId, FVector WorldPos)
{
    FChunkData& Chunk = GetOrCreateChunk(WorldToChunk(WorldPos));
    Chunk.SettlementIds.AddUnique(SettlementId);
    Chunk.EntityCount = Chunk.SettlementIds.Num() + Chunk.BuildingIds.Num() + Chunk.NPCIds.Num();
}

void UChunkManager::RegisterBuildingToChunk(const FString& BuildingId, FVector WorldPos)
{
    FChunkData& Chunk = GetOrCreateChunk(WorldToChunk(WorldPos));
    Chunk.BuildingIds.AddUnique(BuildingId);
    Chunk.EntityCount = Chunk.SettlementIds.Num() + Chunk.BuildingIds.Num() + Chunk.NPCIds.Num();
}

void UChunkManager::RegisterNPCToChunk(const FString& NPCId, FVector WorldPos)
{
    FChunkData& Chunk = GetOrCreateChunk(WorldToChunk(WorldPos));
    Chunk.NPCIds.AddUnique(NPCId);
    Chunk.EntityCount = Chunk.SettlementIds.Num() + Chunk.BuildingIds.Num() + Chunk.NPCIds.Num();
}

bool UChunkManager::GetChunkAt(FIntPoint ChunkCoord, FChunkData& OutData) const
{
    const int64 Key = PackCoord(ChunkCoord);
    const FChunkData* Found = ChunkMap.Find(Key);
    if (Found)
    {
        OutData = *Found;
        return true;
    }
    return false;
}
