#include "ResourceGatheringSystem.h"

void UResourceGatheringSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ResourceGatheringSystem initialized"));
}

void UResourceGatheringSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UResourceGatheringSystem::RegisterResourceNode(const FString& NodeId, FVector Position, EGatheringType ResourceType, int32 Amount)
{
    FResourceNode Node;
    Node.NodeId = NodeId;
    Node.Position = Position;
    Node.ResourceType = ResourceType;
    Node.Remaining = Amount;
    Node.MaxAmount = Amount;

    ResourceNodes.Add(NodeId, Node);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Resource node registered: %s (%d units)"), *NodeId, Amount);
}

void UResourceGatheringSystem::StartGathering(const FString& NodeId, EGatheringType GatheringType)
{
    if (bIsGathering) return;

    FResourceNode* Node = ResourceNodes.Find(NodeId);
    if (!Node || Node->Remaining <= 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot gather from node %s — not found or depleted"), *NodeId);
        return;
    }

    CurrentGatherNodeId = NodeId;
    CurrentGatherType = GatheringType;
    GatherElapsed = 0.0f;
    GatheringProgress = 0.0f;
    bIsGathering = true;

    OnGatheringStarted.Broadcast(NodeId, GatheringType);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Gathering started at node %s"), *NodeId);
}

void UResourceGatheringSystem::CancelGathering()
{
    if (!bIsGathering) return;

    bIsGathering = false;
    GatheringProgress = 0.0f;
    GatherElapsed = 0.0f;
    CurrentGatherNodeId.Empty();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Gathering cancelled"));
}

void UResourceGatheringSystem::TickGathering(float DeltaTime)
{
    if (!bIsGathering) return;

    GatherElapsed += DeltaTime;
    GatheringProgress = FMath::Clamp(GatherElapsed / GatherDuration, 0.0f, 1.0f);

    if (GatheringProgress >= 1.0f)
    {
        TArray<FString> Items = CompleteGathering();
        // Items returned for caller; delegate already fired in CompleteGathering
    }
}

TArray<FString> UResourceGatheringSystem::CompleteGathering()
{
    TArray<FString> GatheredItems;
    if (!bIsGathering) return GatheredItems;

    FResourceNode* Node = ResourceNodes.Find(CurrentGatherNodeId);
    if (Node && Node->Remaining > 0)
    {
        GatheredItems = GenerateGatheredItems(CurrentGatherType);
        Node->Remaining = FMath::Max(0, Node->Remaining - 1);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Gathered %d items from %s (remaining: %d)"),
               GatheredItems.Num(), *CurrentGatherNodeId, Node->Remaining);
    }

    FString CompletedNodeId = CurrentGatherNodeId;
    bIsGathering = false;
    GatheringProgress = 0.0f;
    GatherElapsed = 0.0f;
    CurrentGatherNodeId.Empty();

    OnGatheringCompleted.Broadcast(CompletedNodeId, GatheredItems);
    return GatheredItems;
}

TArray<FString> UResourceGatheringSystem::GenerateGatheredItems(EGatheringType Type) const
{
    TArray<FString> Items;

    // Base yield: 1-3 items with some randomness
    int32 Yield = FMath::RandRange(1, 3);

    switch (Type)
    {
    case EGatheringType::Mining:
        for (int32 i = 0; i < Yield; ++i)
        {
            float Roll = FMath::FRand();
            if (Roll < 0.5f) Items.Add(TEXT("stone"));
            else if (Roll < 0.8f) Items.Add(TEXT("iron_ore"));
            else if (Roll < 0.95f) Items.Add(TEXT("copper_ore"));
            else Items.Add(TEXT("gold_ore"));
        }
        break;

    case EGatheringType::Fishing:
        for (int32 i = 0; i < Yield; ++i)
        {
            float Roll = FMath::FRand();
            if (Roll < 0.4f) Items.Add(TEXT("common_fish"));
            else if (Roll < 0.7f) Items.Add(TEXT("bass"));
            else if (Roll < 0.9f) Items.Add(TEXT("trout"));
            else Items.Add(TEXT("rare_fish"));
        }
        break;

    case EGatheringType::Herbalism:
        for (int32 i = 0; i < Yield; ++i)
        {
            float Roll = FMath::FRand();
            if (Roll < 0.4f) Items.Add(TEXT("common_herb"));
            else if (Roll < 0.7f) Items.Add(TEXT("healing_herb"));
            else if (Roll < 0.9f) Items.Add(TEXT("rare_herb"));
            else Items.Add(TEXT("moonpetal"));
        }
        break;

    case EGatheringType::Woodcutting:
        for (int32 i = 0; i < Yield; ++i)
        {
            float Roll = FMath::FRand();
            if (Roll < 0.5f) Items.Add(TEXT("wood"));
            else if (Roll < 0.8f) Items.Add(TEXT("oak_wood"));
            else if (Roll < 0.95f) Items.Add(TEXT("birch_wood"));
            else Items.Add(TEXT("ironwood"));
        }
        break;
    }

    return Items;
}
