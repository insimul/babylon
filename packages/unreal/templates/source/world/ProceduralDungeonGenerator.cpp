#include "ProceduralDungeonGenerator.h"

AProceduralDungeonGenerator::AProceduralDungeonGenerator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void AProceduralDungeonGenerator::GenerateDungeon(const FString& Seed,
    int32 FloorCount, int32 RoomsPerFloor)
{
    // TODO: Generate dungeon rooms and corridors procedurally
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generate dungeon — %d floors, %d rooms/floor (seed: %s)"),
        FloorCount, RoomsPerFloor, *Seed);
}
