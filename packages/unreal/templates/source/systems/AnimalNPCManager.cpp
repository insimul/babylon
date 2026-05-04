#include "AnimalNPCManager.h"
#include "Engine/World.h"
#include "NavigationSystem.h"

void UAnimalNPCManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AnimalNPCManager initialized (max: %d)"), MaxAnimals);
}

void UAnimalNPCManager::Deinitialize()
{
    Animals.Empty();
    Super::Deinitialize();
}

FString UAnimalNPCManager::SpawnAnimal(const FString& Species, FVector Position, bool bIsPet, bool bIsRideable)
{
    if (Animals.Num() >= MaxAnimals)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot spawn animal — max limit reached (%d)"), MaxAnimals);
        return FString();
    }

    FString AnimalId = FString::Printf(TEXT("animal_%s_%d"), *Species.ToLower(), NextAnimalIndex++);

    FAnimalData Data;
    Data.AnimalId = AnimalId;
    Data.Species = Species;
    Data.Position = Position;
    Data.Behavior = bIsPet ? EAnimalBehavior::Follow : EAnimalBehavior::Wander;
    Data.bIsPet = bIsPet;
    Data.bIsRideable = bIsRideable;

    Animals.Add(AnimalId, Data);

    // TODO: Spawn the actual actor in the world
    // FString MeshPath = GetSpeciesMeshPath(Species);
    // Spawn actor from mesh, set AI controller for behavior

    OnAnimalSpawned.Broadcast(Data);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Animal spawned: %s (%s) at (%.0f, %.0f, %.0f) pet=%d rideable=%d"),
           *AnimalId, *Species, Position.X, Position.Y, Position.Z, bIsPet, bIsRideable);

    return AnimalId;
}

void UAnimalNPCManager::DespawnAnimal(const FString& AnimalId)
{
    if (MountedAnimalId == AnimalId)
    {
        DismountAnimal();
    }

    if (Animals.Remove(AnimalId) > 0)
    {
        // TODO: Destroy the actor in the world
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Animal despawned: %s"), *AnimalId);
    }
}

void UAnimalNPCManager::SetBehavior(const FString& AnimalId, EAnimalBehavior Behavior)
{
    FAnimalData* Data = Animals.Find(AnimalId);
    if (!Data)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Animal not found: %s"), *AnimalId);
        return;
    }

    Data->Behavior = Behavior;

    // TODO: Update the AI controller on the animal's actor
    // Wander  — use random navigation points within a radius
    // Flee    — move away from player when within proximity
    // Follow  — move toward owner/player
    // Idle    — stay in place, play idle animation
    // Graze   — slow wander with periodic stops

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Animal %s behavior set to: %d"), *AnimalId, static_cast<int32>(Behavior));
}

TArray<FAnimalData> UAnimalNPCManager::GetNearbyAnimals(FVector Position, float Radius) const
{
    TArray<FAnimalData> Nearby;
    float RadiusSq = Radius * Radius;

    for (const auto& Pair : Animals)
    {
        float DistSq = FVector::DistSquared(Position, Pair.Value.Position);
        if (DistSq <= RadiusSq)
        {
            Nearby.Add(Pair.Value);
        }
    }

    return Nearby;
}

bool UAnimalNPCManager::MountAnimal(const FString& AnimalId)
{
    if (!MountedAnimalId.IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Already mounted on %s — dismount first"), *MountedAnimalId);
        return false;
    }

    FAnimalData* Data = Animals.Find(AnimalId);
    if (!Data)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Animal not found: %s"), *AnimalId);
        return false;
    }

    if (!Data->bIsRideable)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Animal %s is not rideable"), *AnimalId);
        return false;
    }

    MountedAnimalId = AnimalId;
    Data->Behavior = EAnimalBehavior::Idle; // Stop autonomous behavior while mounted

    // TODO: Attach the player pawn to the animal actor's saddle socket
    // Disable player locomotion, enable mounted movement

    OnAnimalMounted.Broadcast(AnimalId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Player mounted animal: %s (%s)"), *AnimalId, *Data->Species);
    return true;
}

void UAnimalNPCManager::DismountAnimal()
{
    if (MountedAnimalId.IsEmpty()) return;

    FAnimalData* Data = Animals.Find(MountedAnimalId);
    if (Data)
    {
        // Restore default behavior
        Data->Behavior = Data->bIsPet ? EAnimalBehavior::Follow : EAnimalBehavior::Idle;
    }

    // TODO: Detach player from animal actor, re-enable player locomotion

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Player dismounted from: %s"), *MountedAnimalId);
    MountedAnimalId.Empty();
}

FString UAnimalNPCManager::GetSpeciesMeshPath(const FString& Species) const
{
    // Map species names to skeletal mesh asset paths
    if (Species == TEXT("Horse"))  return TEXT("/Game/Animals/Horse/SK_Horse");
    if (Species == TEXT("Dog"))    return TEXT("/Game/Animals/Dog/SK_Dog");
    if (Species == TEXT("Cat"))    return TEXT("/Game/Animals/Cat/SK_Cat");
    if (Species == TEXT("Deer"))   return TEXT("/Game/Animals/Deer/SK_Deer");
    if (Species == TEXT("Rabbit")) return TEXT("/Game/Animals/Rabbit/SK_Rabbit");
    if (Species == TEXT("Chicken")) return TEXT("/Game/Animals/Chicken/SK_Chicken");
    if (Species == TEXT("Cow"))    return TEXT("/Game/Animals/Cow/SK_Cow");
    if (Species == TEXT("Sheep"))  return TEXT("/Game/Animals/Sheep/SK_Sheep");
    if (Species == TEXT("Wolf"))   return TEXT("/Game/Animals/Wolf/SK_Wolf");
    if (Species == TEXT("Bear"))   return TEXT("/Game/Animals/Bear/SK_Bear");

    return FString::Printf(TEXT("/Game/Animals/%s/SK_%s"), *Species, *Species);
}
