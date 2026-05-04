#include "TruthSyncSystem.h"

void UTruthSyncSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] TruthSyncSystem initialized"));
}

void UTruthSyncSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UTruthSyncSystem::SetTruth(const FString& TruthId, const FString& Title, const FString& Content)
{
    SetTruthWithExpiry(TruthId, Title, Content, 0.0f);
}

void UTruthSyncSystem::SetTruthWithExpiry(const FString& TruthId, const FString& Title, const FString& Content, float ExpiresAtGameHour)
{
    FWorldTruth Truth;
    Truth.TruthId = TruthId;
    Truth.Title = Title;
    Truth.Content = Content;
    Truth.bActive = true;
    Truth.ExpiresAtGameHour = ExpiresAtGameHour;

    Truths.Add(TruthId, Truth);

    OnTruthChanged.Broadcast(TruthId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Truth set: %s — \"%s\" (expires: %.1f)"),
           *TruthId, *Title, ExpiresAtGameHour);
}

void UTruthSyncSystem::RemoveTruth(const FString& TruthId)
{
    if (Truths.Remove(TruthId) > 0)
    {
        OnTruthChanged.Broadcast(TruthId);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Truth removed: %s"), *TruthId);
    }
}

bool UTruthSyncSystem::IsTruthActive(const FString& TruthId) const
{
    const FWorldTruth* Truth = Truths.Find(TruthId);
    return Truth && Truth->bActive;
}

TArray<FWorldTruth> UTruthSyncSystem::GetActiveTruths() const
{
    TArray<FWorldTruth> ActiveTruths;
    for (const auto& Pair : Truths)
    {
        if (Pair.Value.bActive)
        {
            ActiveTruths.Add(Pair.Value);
        }
    }
    return ActiveTruths;
}

void UTruthSyncSystem::SyncTruths(float CurrentGameHour)
{
    TArray<FString> ToRemove;

    for (auto& Pair : Truths)
    {
        FWorldTruth& Truth = Pair.Value;
        if (Truth.bActive && Truth.ExpiresAtGameHour > 0.0f && CurrentGameHour >= Truth.ExpiresAtGameHour)
        {
            Truth.bActive = false;
            ToRemove.Add(Pair.Key);
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Truth expired: %s (hour: %.1f >= %.1f)"),
                   *Truth.TruthId, CurrentGameHour, Truth.ExpiresAtGameHour);
        }
    }

    // Fire delegates for expired truths
    for (const FString& TruthId : ToRemove)
    {
        OnTruthChanged.Broadcast(TruthId);
    }
}

bool UTruthSyncSystem::EvaluateContentGating(const FString& GateId) const
{
    const TArray<FString>* RequiredTruths = ContentGates.Find(GateId);
    if (!RequiredTruths) return false;

    for (const FString& TruthId : *RequiredTruths)
    {
        if (!IsTruthActive(TruthId))
        {
            return false;
        }
    }

    return true;
}

void UTruthSyncSystem::RegisterContentGate(const FString& GateId, const TArray<FString>& RequiredTruths)
{
    ContentGates.Add(GateId, RequiredTruths);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Content gate registered: %s (requires %d truths)"),
           *GateId, RequiredTruths.Num());
}
