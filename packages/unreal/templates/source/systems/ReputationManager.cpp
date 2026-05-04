#include "ReputationManager.h"

void UReputationManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ReputationManager initialized"));
}

void UReputationManager::Deinitialize()
{
    Super::Deinitialize();
}

float UReputationManager::GetSettlementReputation(const FString& SettlementId) const
{
    const float* Rep = SettlementReputations.Find(SettlementId);
    return Rep ? *Rep : 0.0f;
}

void UReputationManager::ModifyReputation(const FString& SettlementId, float Delta)
{
    float& Rep = SettlementReputations.FindOrAdd(SettlementId, 0.0f);
    Rep = FMath::Clamp(Rep + Delta, -100.0f, 100.0f);

    OnReputationChanged.Broadcast(SettlementId, Rep);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Reputation for %s: %.1f (delta: %.1f)"), *SettlementId, Rep, Delta);
}

EReputationLevel UReputationManager::GetReputationLevel(const FString& SettlementId) const
{
    float Rep = GetSettlementReputation(SettlementId);

    if (Rep <= -60.0f) return EReputationLevel::Hostile;
    if (Rep <= -20.0f) return EReputationLevel::Unfriendly;
    if (Rep < 20.0f)   return EReputationLevel::Neutral;
    if (Rep < 50.0f)   return EReputationLevel::Friendly;
    if (Rep < 80.0f)   return EReputationLevel::Honored;
    return EReputationLevel::Revered;
}

FRelationshipData UReputationManager::GetRelationship(const FString& NPCId) const
{
    const FRelationshipData* Data = NPCRelationships.Find(NPCId);
    if (Data) return *Data;

    FRelationshipData Default;
    Default.NPCId = NPCId;
    return Default;
}

void UReputationManager::ModifyFriendship(const FString& NPCId, float Delta)
{
    FRelationshipData& Data = NPCRelationships.FindOrAdd(NPCId);
    if (Data.NPCId.IsEmpty()) Data.NPCId = NPCId;

    Data.Friendship = FMath::Clamp(Data.Friendship + Delta, -100.0f, 100.0f);
    Data.LastInteractionTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    OnRelationshipChanged.Broadcast(NPCId, Data);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Friendship with %s: %.1f"), *NPCId, Data.Friendship);
}

void UReputationManager::ModifyTrust(const FString& NPCId, float Delta)
{
    FRelationshipData& Data = NPCRelationships.FindOrAdd(NPCId);
    if (Data.NPCId.IsEmpty()) Data.NPCId = NPCId;

    Data.Trust = FMath::Clamp(Data.Trust + Delta, -100.0f, 100.0f);
    Data.LastInteractionTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    OnRelationshipChanged.Broadcast(NPCId, Data);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Trust with %s: %.1f"), *NPCId, Data.Trust);
}

void UReputationManager::ModifyRomance(const FString& NPCId, float Delta)
{
    FRelationshipData& Data = NPCRelationships.FindOrAdd(NPCId);
    if (Data.NPCId.IsEmpty()) Data.NPCId = NPCId;

    Data.Romance = FMath::Clamp(Data.Romance + Delta, -100.0f, 100.0f);
    Data.LastInteractionTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    OnRelationshipChanged.Broadcast(NPCId, Data);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Romance with %s: %.1f"), *NPCId, Data.Romance);
}

float UReputationManager::GetPriceModifier(const FString& SettlementId) const
{
    float Rep = GetSettlementReputation(SettlementId);

    // Map reputation to price modifier:
    //   -100 rep -> 1.3 (30% surcharge)
    //     0 rep -> 1.0 (no change)
    //   +100 rep -> 0.7 (30% discount)
    float Modifier = 1.0f - (Rep / 100.0f) * 0.3f;
    return FMath::Clamp(Modifier, 0.7f, 1.3f);
}
