#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "ChunkManager.generated.h"

/** Data stored per world chunk. */
USTRUCT(BlueprintType)
struct FChunkData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    FIntPoint Coord = FIntPoint::ZeroValue;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    bool bIsLoaded = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    TArray<FString> SettlementIds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    TArray<FString> BuildingIds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    TArray<FString> NPCIds;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    int32 EntityCount = 0;
};

/**
 * Divides the world into chunks for efficient culling and streaming.
 * Mirrors shared/game-engine/rendering/ChunkManager.ts.
 */
UCLASS()
class INSIMULEXPORT_API UChunkManager : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Size of each chunk in world units. */
    static constexpr float CHUNK_SIZE = 128.f;

    /** Radius in chunks around the player to keep loaded. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chunk")
    int32 LoadRadius = 3;

    /** Update which chunk the player is in and load/unload as needed. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void UpdatePlayerChunk(FVector PlayerPos);

    /** Load a specific chunk. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void LoadChunk(FIntPoint ChunkCoord);

    /** Unload a specific chunk. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void UnloadChunk(FIntPoint ChunkCoord);

    /** Get all currently loaded chunks. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    TArray<FChunkData> GetActiveChunks() const;

    /** Register an entity (settlement, building, NPC) to a chunk. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void RegisterSettlementToChunk(const FString& SettlementId, FVector WorldPos);

    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void RegisterBuildingToChunk(const FString& BuildingId, FVector WorldPos);

    UFUNCTION(BlueprintCallable, Category = "Chunk")
    void RegisterNPCToChunk(const FString& NPCId, FVector WorldPos);

    /** Convert a world position to chunk coordinates. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    static FIntPoint WorldToChunk(FVector WorldPos);

    /** Get the chunk data at a coordinate. Returns false if not found. */
    UFUNCTION(BlueprintCallable, Category = "Chunk")
    bool GetChunkAt(FIntPoint ChunkCoord, FChunkData& OutData) const;

private:
    UPROPERTY()
    TMap<int64, FChunkData> ChunkMap;

    FIntPoint CurrentPlayerChunk = FIntPoint(INT32_MAX, INT32_MAX);

    /** Pack an FIntPoint into an int64 key for the map. */
    static int64 PackCoord(FIntPoint Coord);

    /** Get or create a chunk entry. */
    FChunkData& GetOrCreateChunk(FIntPoint Coord);
};
