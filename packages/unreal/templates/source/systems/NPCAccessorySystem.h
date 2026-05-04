#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCAccessorySystem.generated.h"

class UStaticMeshComponent;

/**
 * NPC accessory management subsystem.
 * Handles attaching and removing accessories from NPCs based on occupation,
 * social status, and deterministic seed-based selection.
 */
UENUM(BlueprintType)
enum class ENPCAccessorySlot : uint8
{
    Hat       UMETA(DisplayName = "Hat"),
    Glasses   UMETA(DisplayName = "Glasses"),
    Necklace  UMETA(DisplayName = "Necklace"),
    Weapon    UMETA(DisplayName = "Weapon"),
    Tool      UMETA(DisplayName = "Tool"),
    Shield    UMETA(DisplayName = "Shield"),
    Backpack  UMETA(DisplayName = "Backpack")
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FNPCAccessoryConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Accessories")
    ENPCAccessorySlot Slot = ENPCAccessorySlot::Hat;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Accessories")
    FString MeshPath;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Accessories")
    FName SocketName;
};

UCLASS()
class INSIMULEXPORT_API UNPCAccessorySystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Attach an accessory to an NPC actor at the specified slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Accessories")
    UStaticMeshComponent* AttachAccessory(AActor* NPCActor, ENPCAccessorySlot Slot, const FString& AccessoryId);

    /** Remove an accessory from an NPC actor at the specified slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Accessories")
    void RemoveAccessory(AActor* NPCActor, ENPCAccessorySlot Slot);

    /** Generate a set of accessories for an NPC based on their properties */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Accessories")
    TArray<FNPCAccessoryConfig> GenerateAccessoriesForNPC(const FString& CharacterId, const FString& Occupation,
                                                          const FString& SocialStatus, int32 Seed);

    /** Load the accessory manifest defining available accessories per occupation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Accessories")
    void LoadAccessoryManifest();

private:
    /** Accessories available per occupation */
    TMap<FString, TArray<FNPCAccessoryConfig>> OccupationAccessories;

    /** Currently attached accessory components per NPC per slot */
    TMap<FString, TMap<ENPCAccessorySlot, UStaticMeshComponent*>> AttachedAccessories;

    /** Socket names for each accessory slot */
    TMap<ENPCAccessorySlot, FName> SlotSocketNames;

    /** Deterministic hash for seed-based selection */
    int32 SeededHash(const FString& Input, int32 Seed) const;
};
