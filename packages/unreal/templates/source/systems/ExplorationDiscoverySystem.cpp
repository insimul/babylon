#include "ExplorationDiscoverySystem.h"

void UExplorationDiscoverySystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ExplorationDiscoverySystem initialized"));
}

void UExplorationDiscoverySystem::Deinitialize()
{
    Super::Deinitialize();
}

void UExplorationDiscoverySystem::RegisterDiscoverableArea(const FString& AreaId, const FString& Name, const FString& Type, FVector Position, float DiscoveryRadius)
{
    FDiscoverableArea Area;
    Area.AreaId = AreaId;
    Area.Name = Name;
    Area.Type = Type;
    Area.Position = Position;
    Area.Radius = DiscoveryRadius;

    DiscoverableAreas.Add(Area);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Discoverable area registered: %s at (%.0f, %.0f, %.0f) radius %.0f"),
           *AreaId, Position.X, Position.Y, Position.Z, DiscoveryRadius);
}

void UExplorationDiscoverySystem::DiscoverArea(const FString& AreaId, const FString& Name, const FString& Type, FVector Position)
{
    if (DiscoveredAreas.Contains(AreaId)) return;

    DiscoveredAreas.Add(AreaId);

    FDiscovery Discovery;
    Discovery.AreaId = AreaId;
    Discovery.Name = Name;
    Discovery.Type = Type;
    Discovery.Position = Position;
    Discovery.DiscoveryTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    DiscoveryLog.Add(Discovery);

    // Award XP through EventBus
    // TODO: Dispatch DiscoveryBonusXP through EventBus
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Area discovered: %s (%s) — +%d XP"), *Name, *Type, DiscoveryBonusXP);

    OnAreaDiscovered.Broadcast(Discovery);
}

bool UExplorationDiscoverySystem::IsDiscovered(const FString& AreaId) const
{
    return DiscoveredAreas.Contains(AreaId);
}

TArray<FDiscovery> UExplorationDiscoverySystem::GetDiscoveries() const
{
    return DiscoveryLog;
}

int32 UExplorationDiscoverySystem::GetDiscoveryCount() const
{
    return DiscoveredAreas.Num();
}

void UExplorationDiscoverySystem::CheckPlayerDiscovery(FVector PlayerLocation)
{
    for (const FDiscoverableArea& Area : DiscoverableAreas)
    {
        if (DiscoveredAreas.Contains(Area.AreaId)) continue;

        float DistSq = FVector::DistSquared(PlayerLocation, Area.Position);
        float RadiusSq = Area.Radius * Area.Radius;

        if (DistSq <= RadiusSq)
        {
            DiscoverArea(Area.AreaId, Area.Name, Area.Type, Area.Position);
        }
    }
}
