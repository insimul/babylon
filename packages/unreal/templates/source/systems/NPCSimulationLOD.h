#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCSimulationLOD.generated.h"

/**
 * NPC simulation level-of-detail subsystem.
 * Dynamically adjusts NPC simulation fidelity based on distance from the player,
 * enforcing a maximum count of full-detail NPCs for performance.
 */
UENUM(BlueprintType)
enum class ENPCSimLevel : uint8
{
    Full        UMETA(DisplayName = "Full"),
    Simplified  UMETA(DisplayName = "Simplified"),
    Billboard   UMETA(DisplayName = "Billboard"),
    Culled      UMETA(DisplayName = "Culled")
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnLODChanged, const FString&, CharacterId,
                                                 ENPCSimLevel, OldLevel, ENPCSimLevel, NewLevel);

UCLASS()
class INSIMULEXPORT_API UNPCSimulationLOD : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Maximum number of NPCs at full simulation detail */
    static constexpr int32 MAX_FULL_NPCS = 8;

    /** Update LOD levels for all registered NPCs based on player location */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    void UpdateLODLevels(FVector PlayerLocation);

    /** Get the current simulation level for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    ENPCSimLevel GetSimLevel(const FString& CharacterId) const;

    /** Set LOD distance thresholds */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    void SetLODDistances(float FullDist, float SimplifiedDist, float BillboardDist);

    /** Register an NPC with its current location */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    void RegisterNPC(const FString& CharacterId, FVector Location);

    /** Unregister an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    void UnregisterNPC(const FString& CharacterId);

    /** Update an NPC's known location */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LOD")
    void UpdateNPCLocation(const FString& CharacterId, FVector Location);

    /** Distance threshold for full simulation (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LOD")
    float FullSimDistance = 2000.0f;

    /** Distance threshold for simplified simulation (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LOD")
    float SimplifiedDistance = 5000.0f;

    /** Distance threshold for billboard rendering (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LOD")
    float BillboardDistance = 10000.0f;

    /** Fired when an NPC's simulation level changes */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|LOD")
    FOnLODChanged OnLODChanged;

private:
    /** Current simulation level per NPC */
    TMap<FString, ENPCSimLevel> NPCSimLevels;

    /** Known NPC locations */
    TMap<FString, FVector> NPCLocations;
};
