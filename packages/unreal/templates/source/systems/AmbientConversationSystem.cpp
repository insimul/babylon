#include "AmbientConversationSystem.h"

void UAmbientConversationSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Set up default conversation topics
    ConversationTopics.Add(TEXT("weather"));
    ConversationTopics.Add(TEXT("trade"));
    ConversationTopics.Add(TEXT("gossip"));
    ConversationTopics.Add(TEXT("work"));
    ConversationTopics.Add(TEXT("family"));
    ConversationTopics.Add(TEXT("news"));
    ConversationTopics.Add(TEXT("travel"));
    ConversationTopics.Add(TEXT("food"));

    UE_LOG(LogTemp, Log, TEXT("[Insimul] AmbientConversationSystem initialized (MaxConversations: %d, Range: %.0f)"),
           MaxSimultaneousConversations, ConversationRange);
}

void UAmbientConversationSystem::RegisterNPC(const FString& CharacterId, AActor* NPCActor)
{
    if (!NPCActor)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot register NPC '%s' for conversations — actor is null"), *CharacterId);
        return;
    }
    RegisteredNPCs.Add(CharacterId, NPCActor);
    LastConversationEndTime.Add(CharacterId, -MinTimeBetweenConversations); // Allow immediate first conversation
}

void UAmbientConversationSystem::UnregisterNPC(const FString& CharacterId)
{
    RegisteredNPCs.Remove(CharacterId);
    LastConversationEndTime.Remove(CharacterId);

    // End any active conversations involving this NPC
    for (int32 i = ActiveConversations.Num() - 1; i >= 0; i--)
    {
        if (ActiveConversations[i].NPC_A_Id == CharacterId || ActiveConversations[i].NPC_B_Id == CharacterId)
        {
            OnConversationEnded.Broadcast(ActiveConversations[i]);
            ActiveConversations.RemoveAt(i);
        }
    }
}

bool UAmbientConversationSystem::IsInConversation(const FString& CharacterId) const
{
    for (const FConversationPair& Conv : ActiveConversations)
    {
        if (Conv.NPC_A_Id == CharacterId || Conv.NPC_B_Id == CharacterId)
        {
            return true;
        }
    }
    return false;
}

bool UAmbientConversationSystem::IsEligible(const FString& CharacterId) const
{
    if (IsInConversation(CharacterId)) return false;

    const float* LastEnd = LastConversationEndTime.Find(CharacterId);
    if (LastEnd && (ElapsedTime - *LastEnd) < MinTimeBetweenConversations)
    {
        return false;
    }

    return true;
}

int32 UAmbientConversationSystem::StartConversation(const FString& NPC_A, const FString& NPC_B)
{
    if (ActiveConversations.Num() >= MaxSimultaneousConversations)
    {
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Cannot start conversation — max simultaneous conversations reached (%d)"),
               MaxSimultaneousConversations);
        return -1;
    }

    if (IsInConversation(NPC_A) || IsInConversation(NPC_B))
    {
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Cannot start conversation — one or both NPCs already in conversation"));
        return -1;
    }

    FConversationPair NewConv;
    NewConv.NPC_A_Id = NPC_A;
    NewConv.NPC_B_Id = NPC_B;
    NewConv.StartTime = ElapsedTime;
    NewConv.Duration = DefaultConversationDuration;
    NewConv.ConversationId = NextConversationId++;

    // Pick a random topic
    if (ConversationTopics.Num() > 0)
    {
        int32 TopicIndex = FMath::RandRange(0, ConversationTopics.Num() - 1);
        NewConv.Topic = ConversationTopics[TopicIndex];
    }

    ActiveConversations.Add(NewConv);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Conversation #%d started: '%s' <-> '%s' (topic: %s, duration: %.1fs)"),
           NewConv.ConversationId, *NPC_A, *NPC_B, *NewConv.Topic, NewConv.Duration);

    OnConversationStarted.Broadcast(NewConv);
    return NewConv.ConversationId;
}

void UAmbientConversationSystem::EndConversation(int32 ConversationId)
{
    for (int32 i = 0; i < ActiveConversations.Num(); i++)
    {
        if (ActiveConversations[i].ConversationId == ConversationId)
        {
            FConversationPair EndedConv = ActiveConversations[i];

            // Record end times
            LastConversationEndTime.Add(EndedConv.NPC_A_Id, ElapsedTime);
            LastConversationEndTime.Add(EndedConv.NPC_B_Id, ElapsedTime);

            ActiveConversations.RemoveAt(i);

            UE_LOG(LogTemp, Log, TEXT("[Insimul] Conversation #%d ended: '%s' <-> '%s'"),
                   EndedConv.ConversationId, *EndedConv.NPC_A_Id, *EndedConv.NPC_B_Id);

            OnConversationEnded.Broadcast(EndedConv);
            return;
        }
    }
}

void UAmbientConversationSystem::UpdateConversations(float DeltaTime)
{
    ElapsedTime += DeltaTime;

    // Check for expired conversations
    for (int32 i = ActiveConversations.Num() - 1; i >= 0; i--)
    {
        float Elapsed = ElapsedTime - ActiveConversations[i].StartTime;
        if (Elapsed >= ActiveConversations[i].Duration)
        {
            EndConversation(ActiveConversations[i].ConversationId);
        }
    }

    // Periodically try to start new conversations
    if (ActiveConversations.Num() < MaxSimultaneousConversations)
    {
        FindConversationPartners();
    }
}

TArray<FConversationPair> UAmbientConversationSystem::GetActiveConversations() const
{
    return ActiveConversations;
}

void UAmbientConversationSystem::FindConversationPartners()
{
    if (ActiveConversations.Num() >= MaxSimultaneousConversations) return;

    // Collect eligible NPCs
    TArray<FString> EligibleNPCs;
    for (const auto& Pair : RegisteredNPCs)
    {
        if (Pair.Value && IsEligible(Pair.Key))
        {
            EligibleNPCs.Add(Pair.Key);
        }
    }

    // Check pairs for proximity
    for (int32 i = 0; i < EligibleNPCs.Num() && ActiveConversations.Num() < MaxSimultaneousConversations; i++)
    {
        for (int32 j = i + 1; j < EligibleNPCs.Num() && ActiveConversations.Num() < MaxSimultaneousConversations; j++)
        {
            const FString& IdA = EligibleNPCs[i];
            const FString& IdB = EligibleNPCs[j];

            // Re-check eligibility (may have changed from starting a conversation in this loop)
            if (!IsEligible(IdA) || !IsEligible(IdB)) continue;

            AActor** ActorA = RegisteredNPCs.Find(IdA);
            AActor** ActorB = RegisteredNPCs.Find(IdB);
            if (!ActorA || !*ActorA || !ActorB || !*ActorB) continue;

            float Distance = FVector::Dist((*ActorA)->GetActorLocation(), (*ActorB)->GetActorLocation());
            if (Distance <= ConversationRange)
            {
                StartConversation(IdA, IdB);
            }
        }
    }
}
