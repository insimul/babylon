#include "NPCSimulationLOD.h"

void UNPCSimulationLOD::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCSimulationLOD initialized (MaxFull: %d, FullDist: %.0f, SimpleDist: %.0f, BillboardDist: %.0f)"),
           MAX_FULL_NPCS, FullSimDistance, SimplifiedDistance, BillboardDistance);
}

void UNPCSimulationLOD::RegisterNPC(const FString& CharacterId, FVector Location)
{
    NPCLocations.Add(CharacterId, Location);
    NPCSimLevels.Add(CharacterId, ENPCSimLevel::Culled);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Registered NPC for LOD: %s"), *CharacterId);
}

void UNPCSimulationLOD::UnregisterNPC(const FString& CharacterId)
{
    NPCLocations.Remove(CharacterId);
    NPCSimLevels.Remove(CharacterId);
}

void UNPCSimulationLOD::UpdateNPCLocation(const FString& CharacterId, FVector Location)
{
    FVector* Loc = NPCLocations.Find(CharacterId);
    if (Loc)
    {
        *Loc = Location;
    }
}

ENPCSimLevel UNPCSimulationLOD::GetSimLevel(const FString& CharacterId) const
{
    const ENPCSimLevel* Level = NPCSimLevels.Find(CharacterId);
    return Level ? *Level : ENPCSimLevel::Culled;
}

void UNPCSimulationLOD::SetLODDistances(float FullDist, float SimplifiedDist, float BillboardDist)
{
    FullSimDistance = FMath::Max(FullDist, 100.0f);
    SimplifiedDistance = FMath::Max(SimplifiedDist, FullSimDistance + 100.0f);
    BillboardDistance = FMath::Max(BillboardDist, SimplifiedDistance + 100.0f);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] LOD distances updated — Full: %.0f, Simplified: %.0f, Billboard: %.0f"),
           FullSimDistance, SimplifiedDistance, BillboardDistance);
}

void UNPCSimulationLOD::UpdateLODLevels(FVector PlayerLocation)
{
    // Build a sorted list of NPCs by distance to player
    struct FNPCDistEntry
    {
        FString CharacterId;
        float Distance;
    };

    TArray<FNPCDistEntry> DistanceEntries;
    DistanceEntries.Reserve(NPCLocations.Num());

    for (const auto& Pair : NPCLocations)
    {
        FNPCDistEntry Entry;
        Entry.CharacterId = Pair.Key;
        Entry.Distance = FVector::Dist(PlayerLocation, Pair.Value);
        DistanceEntries.Add(Entry);
    }

    // Sort by distance (closest first)
    DistanceEntries.Sort([](const FNPCDistEntry& A, const FNPCDistEntry& B)
    {
        return A.Distance < B.Distance;
    });

    int32 FullCount = 0;

    for (const FNPCDistEntry& Entry : DistanceEntries)
    {
        ENPCSimLevel NewLevel;

        if (Entry.Distance <= FullSimDistance && FullCount < MAX_FULL_NPCS)
        {
            NewLevel = ENPCSimLevel::Full;
            FullCount++;
        }
        else if (Entry.Distance <= SimplifiedDistance)
        {
            NewLevel = ENPCSimLevel::Simplified;
        }
        else if (Entry.Distance <= BillboardDistance)
        {
            NewLevel = ENPCSimLevel::Billboard;
        }
        else
        {
            NewLevel = ENPCSimLevel::Culled;
        }

        ENPCSimLevel* CurrentLevel = NPCSimLevels.Find(Entry.CharacterId);
        if (CurrentLevel && *CurrentLevel != NewLevel)
        {
            ENPCSimLevel OldLevel = *CurrentLevel;
            *CurrentLevel = NewLevel;

            UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LOD change for '%s': %d -> %d (dist: %.0f)"),
                   *Entry.CharacterId, static_cast<int32>(OldLevel), static_cast<int32>(NewLevel), Entry.Distance);

            OnLODChanged.Broadcast(Entry.CharacterId, OldLevel, NewLevel);
        }
        else if (!CurrentLevel)
        {
            NPCSimLevels.Add(Entry.CharacterId, NewLevel);
        }
    }
}
