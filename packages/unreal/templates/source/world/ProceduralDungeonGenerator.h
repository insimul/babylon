#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProceduralDungeonGenerator.generated.h"

UCLASS()
class INSIMULEXPORT_API AProceduralDungeonGenerator : public AActor
{
    GENERATED_BODY()

public:
    AProceduralDungeonGenerator();

    UFUNCTION(BlueprintCallable, Category = "Dungeon")
    void GenerateDungeon(const FString& Seed, int32 FloorCount, int32 RoomsPerFloor);
};
