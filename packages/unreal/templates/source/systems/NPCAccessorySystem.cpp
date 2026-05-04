#include "NPCAccessorySystem.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"

void UNPCAccessorySystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Set up default socket names for each slot
    SlotSocketNames.Add(ENPCAccessorySlot::Hat,      FName(TEXT("socket_head")));
    SlotSocketNames.Add(ENPCAccessorySlot::Glasses,  FName(TEXT("socket_face")));
    SlotSocketNames.Add(ENPCAccessorySlot::Necklace, FName(TEXT("socket_neck")));
    SlotSocketNames.Add(ENPCAccessorySlot::Weapon,   FName(TEXT("socket_hand_r")));
    SlotSocketNames.Add(ENPCAccessorySlot::Tool,     FName(TEXT("socket_hand_r")));
    SlotSocketNames.Add(ENPCAccessorySlot::Shield,   FName(TEXT("socket_hand_l")));
    SlotSocketNames.Add(ENPCAccessorySlot::Backpack, FName(TEXT("socket_back")));

    LoadAccessoryManifest();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCAccessorySystem initialized — %d occupations configured"), OccupationAccessories.Num());
}

void UNPCAccessorySystem::LoadAccessoryManifest()
{
    // Guard: weapon + shield
    {
        TArray<FNPCAccessoryConfig> GuardAccessories;
        FNPCAccessoryConfig Weapon;
        Weapon.Slot = ENPCAccessorySlot::Weapon;
        Weapon.MeshPath = TEXT("/Game/Assets/Accessories/Weapons/sword_01");
        Weapon.SocketName = FName(TEXT("socket_hand_r"));
        GuardAccessories.Add(Weapon);

        FNPCAccessoryConfig Shield;
        Shield.Slot = ENPCAccessorySlot::Shield;
        Shield.MeshPath = TEXT("/Game/Assets/Accessories/Shields/shield_01");
        Shield.SocketName = FName(TEXT("socket_hand_l"));
        GuardAccessories.Add(Shield);

        OccupationAccessories.Add(TEXT("guard"), GuardAccessories);
    }

    // Blacksmith: tool
    {
        TArray<FNPCAccessoryConfig> BlacksmithAccessories;
        FNPCAccessoryConfig Tool;
        Tool.Slot = ENPCAccessorySlot::Tool;
        Tool.MeshPath = TEXT("/Game/Assets/Accessories/Tools/hammer_01");
        Tool.SocketName = FName(TEXT("socket_hand_r"));
        BlacksmithAccessories.Add(Tool);

        OccupationAccessories.Add(TEXT("blacksmith"), BlacksmithAccessories);
    }

    // Merchant: no default accessories
    {
        TArray<FNPCAccessoryConfig> MerchantAccessories;
        OccupationAccessories.Add(TEXT("merchant"), MerchantAccessories);
    }

    // Farmer: tool
    {
        TArray<FNPCAccessoryConfig> FarmerAccessories;
        FNPCAccessoryConfig Tool;
        Tool.Slot = ENPCAccessorySlot::Tool;
        Tool.MeshPath = TEXT("/Game/Assets/Accessories/Tools/pitchfork_01");
        Tool.SocketName = FName(TEXT("socket_hand_r"));
        FarmerAccessories.Add(Tool);

        OccupationAccessories.Add(TEXT("farmer"), FarmerAccessories);
    }

    // Noble: hat
    {
        TArray<FNPCAccessoryConfig> NobleAccessories;
        FNPCAccessoryConfig Hat;
        Hat.Slot = ENPCAccessorySlot::Hat;
        Hat.MeshPath = TEXT("/Game/Assets/Accessories/Hats/noble_hat_01");
        Hat.SocketName = FName(TEXT("socket_head"));
        NobleAccessories.Add(Hat);

        OccupationAccessories.Add(TEXT("noble"), NobleAccessories);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Accessory manifest loaded with %d occupation entries"), OccupationAccessories.Num());
}

int32 UNPCAccessorySystem::SeededHash(const FString& Input, int32 Seed) const
{
    uint32 Hash = GetTypeHash(Input);
    Hash ^= static_cast<uint32>(Seed) * 2654435761u;
    return static_cast<int32>(Hash & 0x7FFFFFFF);
}

TArray<FNPCAccessoryConfig> UNPCAccessorySystem::GenerateAccessoriesForNPC(const FString& CharacterId,
                                                                            const FString& Occupation,
                                                                            const FString& SocialStatus,
                                                                            int32 Seed)
{
    TArray<FNPCAccessoryConfig> Result;

    // Look up occupation-specific accessories
    const TArray<FNPCAccessoryConfig>* OccAccessories = OccupationAccessories.Find(Occupation.ToLower());
    if (OccAccessories)
    {
        Result.Append(*OccAccessories);
    }
    else
    {
        UE_LOG(LogTemp, Log, TEXT("[Insimul] No accessories defined for occupation '%s' (character: %s)"), *Occupation, *CharacterId);
    }

    // Social status can add additional accessories (e.g., nobles get a hat if not already assigned)
    if (SocialStatus.ToLower() == TEXT("upper") || SocialStatus.ToLower() == TEXT("noble"))
    {
        bool bHasHat = false;
        for (const FNPCAccessoryConfig& Config : Result)
        {
            if (Config.Slot == ENPCAccessorySlot::Hat)
            {
                bHasHat = true;
                break;
            }
        }
        if (!bHasHat)
        {
            FNPCAccessoryConfig Hat;
            Hat.Slot = ENPCAccessorySlot::Hat;
            Hat.MeshPath = TEXT("/Game/Assets/Accessories/Hats/fancy_hat_01");
            Hat.SocketName = FName(TEXT("socket_head"));
            Result.Add(Hat);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generated %d accessories for NPC: %s (%s)"), Result.Num(), *CharacterId, *Occupation);
    return Result;
}

UStaticMeshComponent* UNPCAccessorySystem::AttachAccessory(AActor* NPCActor, ENPCAccessorySlot Slot, const FString& AccessoryId)
{
    if (!NPCActor)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot attach accessory — NPCActor is null"));
        return nullptr;
    }

    // Determine mesh path from accessory ID
    FString MeshPath = FString::Printf(TEXT("/Game/Assets/Accessories/%s"), *AccessoryId);

    UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *MeshPath);
    if (!Mesh)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Accessory mesh not found: %s (this is normal if accessory assets weren't imported)"), *MeshPath);
        return nullptr;
    }

    // Remove existing accessory in this slot
    RemoveAccessory(NPCActor, Slot);

    // Create and attach the mesh component
    UStaticMeshComponent* MeshComp = NewObject<UStaticMeshComponent>(NPCActor);
    MeshComp->SetStaticMesh(Mesh);
    MeshComp->RegisterComponent();

    // Attach to socket if available
    const FName* SocketName = SlotSocketNames.Find(Slot);
    USceneComponent* RootComp = NPCActor->GetRootComponent();
    if (RootComp && SocketName)
    {
        MeshComp->AttachToComponent(RootComp, FAttachmentTransformRules::SnapToTargetNotIncludingScale, *SocketName);
    }
    else if (RootComp)
    {
        MeshComp->AttachToComponent(RootComp, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
    }

    // Track attached component
    FString ActorId = NPCActor->GetName();
    if (!AttachedAccessories.Contains(ActorId))
    {
        AttachedAccessories.Add(ActorId, TMap<ENPCAccessorySlot, UStaticMeshComponent*>());
    }
    AttachedAccessories[ActorId].Add(Slot, MeshComp);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Attached accessory '%s' to %s at slot %d"), *AccessoryId, *ActorId, static_cast<int32>(Slot));
    return MeshComp;
}

void UNPCAccessorySystem::RemoveAccessory(AActor* NPCActor, ENPCAccessorySlot Slot)
{
    if (!NPCActor) return;

    FString ActorId = NPCActor->GetName();
    TMap<ENPCAccessorySlot, UStaticMeshComponent*>* SlotMap = AttachedAccessories.Find(ActorId);
    if (!SlotMap) return;

    UStaticMeshComponent** ExistingComp = SlotMap->Find(Slot);
    if (ExistingComp && *ExistingComp)
    {
        (*ExistingComp)->DestroyComponent();
        SlotMap->Remove(Slot);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Removed accessory from %s at slot %d"), *ActorId, static_cast<int32>(Slot));
    }
}
