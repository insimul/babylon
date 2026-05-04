#include "BuildingCollisionSystem.h"

void UBuildingCollisionSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] BuildingCollisionSystem initialized"));
}

void UBuildingCollisionSystem::RegisterBuilding(FString Id, FVector Position, FVector Extent)
{
    // Check for duplicate
    for (FBuildingCollisionData& Existing : Buildings)
    {
        if (Existing.BuildingId == Id)
        {
            Existing.Position = Position;
            Existing.Extent = Extent;
            return;
        }
    }

    FBuildingCollisionData Data;
    Data.BuildingId = Id;
    Data.Position = Position;
    Data.Extent = Extent;

    Buildings.Add(Data);

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Registered building '%s' collision at (%.1f, %.1f, %.1f) extent (%.1f, %.1f, %.1f)"),
        *Id, Position.X, Position.Y, Position.Z, Extent.X, Extent.Y, Extent.Z);
}

void UBuildingCollisionSystem::RegisterEntrance(FString BuildingId, FVector EntrancePos, FVector FacingDir, float InteractionRadius)
{
    for (FBuildingCollisionData& Building : Buildings)
    {
        if (Building.BuildingId == BuildingId)
        {
            FBuildingEntrance Entrance;
            Entrance.BuildingId = BuildingId;
            Entrance.Position = EntrancePos;
            Entrance.FacingDirection = FacingDir;
            Entrance.InteractionRadius = InteractionRadius;

            Building.Entrances.Add(Entrance);

            UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Registered entrance for building '%s' at (%.1f, %.1f, %.1f)"),
                *BuildingId, EntrancePos.X, EntrancePos.Y, EntrancePos.Z);
            return;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot register entrance: building '%s' not found"), *BuildingId);
}

bool UBuildingCollisionSystem::CheckPlayerEntry(FVector PlayerPos)
{
    FBuildingEntrance NearestEntrance;
    if (GetNearestEntrance(PlayerPos, NearestEntrance))
    {
        const float Dist = FVector::Dist(PlayerPos, NearestEntrance.Position);
        if (Dist <= NearestEntrance.InteractionRadius * EntryDetectionMultiplier)
        {
            if (CurrentNearbyBuildingId != NearestEntrance.BuildingId)
            {
                CurrentNearbyBuildingId = NearestEntrance.BuildingId;
                OnBuildingEntryDetected.Broadcast(NearestEntrance.BuildingId, NearestEntrance.Position);

                UE_LOG(LogTemp, Log, TEXT("[Insimul] Player near entrance of building '%s'"), *NearestEntrance.BuildingId);
            }
            return true;
        }
    }

    // Player not near any entrance
    if (!CurrentNearbyBuildingId.IsEmpty())
    {
        CurrentNearbyBuildingId.Empty();
        OnBuildingExitDetected.Broadcast();
    }

    return false;
}

bool UBuildingCollisionSystem::GetNearestEntrance(FVector PlayerPos, FBuildingEntrance& OutEntrance) const
{
    float BestDist = FLT_MAX;
    bool bFound = false;

    for (const FBuildingCollisionData& Building : Buildings)
    {
        for (const FBuildingEntrance& Entrance : Building.Entrances)
        {
            const float Dist = FVector::Dist(PlayerPos, Entrance.Position);
            if (Dist < BestDist)
            {
                BestDist = Dist;
                OutEntrance = Entrance;
                bFound = true;
            }
        }
    }

    return bFound;
}

bool UBuildingCollisionSystem::IsInsideBuilding(FVector Point, FString& OutBuildingId) const
{
    for (const FBuildingCollisionData& Building : Buildings)
    {
        const FVector Delta = Point - Building.Position;
        if (FMath::Abs(Delta.X) <= Building.Extent.X &&
            FMath::Abs(Delta.Y) <= Building.Extent.Y &&
            FMath::Abs(Delta.Z) <= Building.Extent.Z)
        {
            OutBuildingId = Building.BuildingId;
            return true;
        }
    }

    return false;
}
