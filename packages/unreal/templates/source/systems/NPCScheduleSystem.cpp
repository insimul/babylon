#include "NPCScheduleSystem.h"

void UNPCScheduleSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCScheduleSystem initialized"));
}

void UNPCScheduleSystem::RegisterNPC(const FString& CharacterId, const TArray<FNPCScheduleEntry>& Schedule)
{
    NPCSchedules.Add(CharacterId, Schedule);
    CurrentBlockIndices.Add(CharacterId, -1);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Registered schedule for NPC '%s' with %d time blocks"), *CharacterId, Schedule.Num());
}

void UNPCScheduleSystem::UnregisterNPC(const FString& CharacterId)
{
    NPCSchedules.Remove(CharacterId);
    CurrentBlockIndices.Remove(CharacterId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Unregistered schedule for NPC '%s'"), *CharacterId);
}

int32 UNPCScheduleSystem::FindBlockForHour(const TArray<FNPCScheduleEntry>& Schedule, float Hour) const
{
    int32 HourInt = FMath::FloorToInt(Hour) % 24;
    for (int32 i = 0; i < Schedule.Num(); i++)
    {
        const FNPCScheduleEntry& Entry = Schedule[i];
        if (Entry.StartHour <= Entry.EndHour)
        {
            // Normal range (e.g., 8-17)
            if (HourInt >= Entry.StartHour && HourInt < Entry.EndHour)
            {
                return i;
            }
        }
        else
        {
            // Overnight range (e.g., 22-6)
            if (HourInt >= Entry.StartHour || HourInt < Entry.EndHour)
            {
                return i;
            }
        }
    }
    return -1; // No matching block
}

FString UNPCScheduleSystem::GetCurrentActivity(const FString& CharacterId) const
{
    const int32* BlockIndex = CurrentBlockIndices.Find(CharacterId);
    if (!BlockIndex || *BlockIndex < 0) return FString(TEXT("idle"));

    const TArray<FNPCScheduleEntry>* Schedule = NPCSchedules.Find(CharacterId);
    if (!Schedule || *BlockIndex >= Schedule->Num()) return FString(TEXT("idle"));

    return (*Schedule)[*BlockIndex].Activity;
}

FVector UNPCScheduleSystem::GetCurrentDestination(const FString& CharacterId) const
{
    const int32* BlockIndex = CurrentBlockIndices.Find(CharacterId);
    if (!BlockIndex || *BlockIndex < 0) return FVector::ZeroVector;

    const TArray<FNPCScheduleEntry>* Schedule = NPCSchedules.Find(CharacterId);
    if (!Schedule || *BlockIndex >= Schedule->Num()) return FVector::ZeroVector;

    return (*Schedule)[*BlockIndex].Position;
}

void UNPCScheduleSystem::UpdateAllSchedules(float CurrentGameHour)
{
    for (auto& Pair : NPCSchedules)
    {
        const FString& CharacterId = Pair.Key;
        const TArray<FNPCScheduleEntry>& Schedule = Pair.Value;

        int32 NewBlockIndex = FindBlockForHour(Schedule, CurrentGameHour);
        int32* CurrentIndex = CurrentBlockIndices.Find(CharacterId);
        if (!CurrentIndex) continue;

        if (NewBlockIndex != *CurrentIndex)
        {
            FString OldActivity = TEXT("idle");
            if (*CurrentIndex >= 0 && *CurrentIndex < Schedule.Num())
            {
                OldActivity = Schedule[*CurrentIndex].Activity;
            }

            FString NewActivity = TEXT("idle");
            if (NewBlockIndex >= 0 && NewBlockIndex < Schedule.Num())
            {
                NewActivity = Schedule[NewBlockIndex].Activity;
            }

            *CurrentIndex = NewBlockIndex;

            UE_LOG(LogTemp, Log, TEXT("[Insimul] Schedule transition for '%s': '%s' -> '%s' (hour: %.1f)"),
                   *CharacterId, *OldActivity, *NewActivity, CurrentGameHour);

            OnScheduleTransition.Broadcast(CharacterId, OldActivity, NewActivity);
        }
    }
}
