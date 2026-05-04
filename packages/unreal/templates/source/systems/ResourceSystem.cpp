#include "ResourceSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UResourceSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ResourceSystem initialized"));
}

void UResourceSystem::Deinitialize()
{
    Definitions.Empty();
    Nodes.Empty();
    ResourceInventory.Empty();
    Super::Deinitialize();
}

void UResourceSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* ResObj;
    if (!Root->TryGetObjectField(TEXT("resources"), ResObj)) return;

    // Load resource definitions
    const TArray<TSharedPtr<FJsonValue>>* DefsArr;
    if ((*ResObj)->TryGetArrayField(TEXT("definitions"), DefsArr))
    {
        for (const auto& Val : *DefsArr)
        {
            const TSharedPtr<FJsonObject>& Obj = Val->AsObject();
            if (!Obj.IsValid()) continue;

            FResourceDefinition Def;
            Def.ResourceId = Obj->GetStringField(TEXT("id"));
            Def.DisplayName = Obj->GetStringField(TEXT("name"));
            Def.Icon = Obj->GetStringField(TEXT("icon"));
            Def.MaxStack = Obj->GetIntegerField(TEXT("maxStack"));
            Def.GatherTime = Obj->GetNumberField(TEXT("gatherTime")) / 1000.f; // ms → seconds
            Def.RespawnTime = Obj->GetNumberField(TEXT("respawnTime")) / 1000.f;

            const TSharedPtr<FJsonObject>* ColorObj;
            if (Obj->TryGetObjectField(TEXT("color"), ColorObj))
            {
                Def.Color = FLinearColor(
                    (*ColorObj)->GetNumberField(TEXT("r")),
                    (*ColorObj)->GetNumberField(TEXT("g")),
                    (*ColorObj)->GetNumberField(TEXT("b")),
                    1.f
                );
            }

            Definitions.Add(Def.ResourceId, Def);
            ResourceInventory.Add(Def.ResourceId, 0);
        }
        ResourceTypeCount = Definitions.Num();
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d resource definitions"), ResourceTypeCount);
    }

    // Load gathering nodes
    const TArray<TSharedPtr<FJsonValue>>* NodesArr;
    if ((*ResObj)->TryGetArrayField(TEXT("gatheringNodes"), NodesArr))
    {
        for (const auto& Val : *NodesArr)
        {
            const TSharedPtr<FJsonObject>& Obj = Val->AsObject();
            if (!Obj.IsValid()) continue;

            FGatheringNodeState Node;
            Node.NodeId = Obj->GetStringField(TEXT("id"));
            Node.ResourceType = Obj->GetStringField(TEXT("resourceType"));
            Node.MaxAmount = Obj->GetIntegerField(TEXT("maxAmount"));
            Node.CurrentAmount = Node.MaxAmount;
            Node.RespawnTime = Obj->GetNumberField(TEXT("respawnTime")) / 1000.f;
            Node.Scale = Obj->GetNumberField(TEXT("scale"));
            Node.bDepleted = false;
            Node.RespawnTimer = 0.f;

            const TSharedPtr<FJsonObject>* PosObj;
            if (Obj->TryGetObjectField(TEXT("position"), PosObj))
            {
                // IR uses Y-up; Unreal uses Z-up. Swap Y↔Z, scale m→cm.
                Node.Position = FVector(
                    (*PosObj)->GetNumberField(TEXT("x")) * 100.0,
                    (*PosObj)->GetNumberField(TEXT("z")) * 100.0,
                    (*PosObj)->GetNumberField(TEXT("y")) * 100.0
                );
            }

            Nodes.Add(Node.NodeId, Node);
        }
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d gathering nodes"), Nodes.Num());
    }
}

int32 UResourceSystem::GatherResource(const FString& NodeId)
{
    FGatheringNodeState* Node = Nodes.Find(NodeId);
    if (!Node || Node->bDepleted || Node->CurrentAmount <= 0) return 0;

    const int32 Gathered = 1;
    Node->CurrentAmount -= Gathered;

    // Add to inventory (capped by max stack from definition)
    const FResourceDefinition* Def = Definitions.Find(Node->ResourceType);
    int32& Held = ResourceInventory.FindOrAdd(Node->ResourceType);
    const int32 Max = Def ? Def->MaxStack : 999;
    Held = FMath::Min(Held + Gathered, Max);

    OnResourceGathered.Broadcast(NodeId, Node->ResourceType, Gathered);

    if (Node->CurrentAmount <= 0)
    {
        Node->bDepleted = true;
        Node->RespawnTimer = Node->RespawnTime;
        OnNodeDepleted.Broadcast(NodeId);
    }

    return Gathered;
}

float UResourceSystem::GetGatherTime(const FString& ResourceType) const
{
    const FResourceDefinition* Def = Definitions.Find(ResourceType);
    return Def ? Def->GatherTime : 1.5f;
}

int32 UResourceSystem::GetResourceCount(const FString& ResourceType) const
{
    const int32* Count = ResourceInventory.Find(ResourceType);
    return Count ? *Count : 0;
}

bool UResourceSystem::ConsumeResources(const FString& ResourceType, int32 Amount)
{
    int32* Count = ResourceInventory.Find(ResourceType);
    if (!Count || *Count < Amount) return false;
    *Count -= Amount;
    return true;
}

bool UResourceSystem::HasResources(const FString& ResourceType, int32 Amount) const
{
    const int32* Count = ResourceInventory.Find(ResourceType);
    return Count && *Count >= Amount;
}

TArray<FGatheringNodeState> UResourceSystem::GetNodesInRange(const FVector& Location, float Radius) const
{
    TArray<FGatheringNodeState> Result;
    const float RadiusSq = Radius * Radius;
    for (const auto& Pair : Nodes)
    {
        if (FVector::DistSquared(Location, Pair.Value.Position) <= RadiusSq)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

bool UResourceSystem::GetNearestAvailableNode(const FVector& Location, FGatheringNodeState& OutNode) const
{
    float BestDistSq = TNumericLimits<float>::Max();
    bool bFound = false;
    for (const auto& Pair : Nodes)
    {
        if (Pair.Value.bDepleted) continue;
        const float DistSq = FVector::DistSquared(Location, Pair.Value.Position);
        if (DistSq < BestDistSq)
        {
            BestDistSq = DistSq;
            OutNode = Pair.Value;
            bFound = true;
        }
    }
    return bFound;
}

void UResourceSystem::TickRespawns(float DeltaSeconds)
{
    for (auto& Pair : Nodes)
    {
        FGatheringNodeState& Node = Pair.Value;
        if (!Node.bDepleted) continue;

        Node.RespawnTimer -= DeltaSeconds;
        if (Node.RespawnTimer <= 0.f)
        {
            Node.bDepleted = false;
            Node.CurrentAmount = Node.MaxAmount;
            Node.RespawnTimer = 0.f;
            OnNodeRespawned.Broadcast(Node.NodeId);
        }
    }
}

bool UResourceSystem::GetNodeState(const FString& NodeId, FGatheringNodeState& OutState) const
{
    const FGatheringNodeState* Node = Nodes.Find(NodeId);
    if (!Node) return false;
    OutState = *Node;
    return true;
}
