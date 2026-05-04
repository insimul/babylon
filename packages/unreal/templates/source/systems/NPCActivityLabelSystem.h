#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCActivityLabelSystem.generated.h"

class UWidgetComponent;

/**
 * NPC activity label subsystem.
 * Displays floating labels above NPCs showing their current activity and
 * talking state, with distance-based visibility and opacity fading.
 */
UCLASS()
class INSIMULEXPORT_API UNPCActivityLabelSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Set the activity text displayed above an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Labels")
    void SetActivity(const FString& CharacterId, const FString& ActivityText);

    /** Set whether an NPC is currently talking */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Labels")
    void SetTalking(const FString& CharacterId, bool bIsTalking);

    /** Update all label visibility and orientation based on camera */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Labels")
    void UpdateLabels(FVector CameraLocation, FVector CameraForward);

    /** Register an NPC actor for label display */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Labels")
    void RegisterNPC(const FString& CharacterId, AActor* NPCActor);

    /** Unregister an NPC and remove its label */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Labels")
    void UnregisterNPC(const FString& CharacterId);

    /** Maximum distance at which labels are visible (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Labels")
    float MaxLabelDistance = 3000.0f;

    /** Distance at which labels begin to fade (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Labels")
    float FadeStartDistance = 2000.0f;

private:
    /** Current activity text per NPC */
    TMap<FString, FString> ActivityLabels;

    /** Current talking state per NPC */
    TMap<FString, bool> TalkingStates;

    /** Widget components for label display */
    UPROPERTY()
    TMap<FString, UWidgetComponent*> LabelWidgets;

    /** Registered NPC actors */
    TMap<FString, AActor*> RegisteredActors;
};
