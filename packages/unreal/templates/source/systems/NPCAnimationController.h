#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "NPCAnimationController.generated.h"

class UAnimMontage;
class UAnimInstance;

/**
 * NPC animation controller component.
 * Manages animation state transitions, montage playback, and movement-speed
 * synchronization for NPC characters.
 */
UENUM(BlueprintType)
enum class ENPCAnimState : uint8
{
    Idle     UMETA(DisplayName = "Idle"),
    Walk     UMETA(DisplayName = "Walk"),
    Run      UMETA(DisplayName = "Run"),
    Talk     UMETA(DisplayName = "Talk"),
    Sit      UMETA(DisplayName = "Sit"),
    Work     UMETA(DisplayName = "Work"),
    Eat      UMETA(DisplayName = "Eat"),
    Sleep    UMETA(DisplayName = "Sleep"),
    Interact UMETA(DisplayName = "Interact"),
    Combat   UMETA(DisplayName = "Combat")
};

UCLASS(ClassGroup = (Insimul), meta = (BlueprintSpawnableComponent))
class INSIMULEXPORT_API UNPCAnimationController : public UActorComponent
{
    GENERATED_BODY()

public:
    UNPCAnimationController();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Set the current animation state */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animation")
    void SetAnimState(ENPCAnimState NewState);

    /** Get the current animation state */
    UFUNCTION(BlueprintPure, Category = "Insimul|Animation")
    ENPCAnimState GetAnimState() const;

    /** Set movement speed (affects playback rate when syncing) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animation")
    void SetMovementSpeed(float Speed);

    /** Play a named animation montage */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animation")
    void PlayMontage(const FString& MontageName);

    /** Load animation assets from content directory */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Animation")
    void LoadAnimationAssets();

    /** Blend time between animation states */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Animation")
    float BlendTime = 0.2f;

    /** Whether to sync animation playback rate with movement speed */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Animation")
    bool bSyncSpeedWithMovement = true;

private:
    UPROPERTY()
    ENPCAnimState CurrentAnimState = ENPCAnimState::Idle;

    UPROPERTY()
    ENPCAnimState PreviousAnimState = ENPCAnimState::Idle;

    /** Current movement speed for playback rate adjustment */
    float CurrentMovementSpeed = 0.0f;

    /** Target playback rate based on movement speed */
    float TargetPlaybackRate = 1.0f;

    /** Current playback rate (blends toward target) */
    float CurrentPlaybackRate = 1.0f;

    /** Mapping from animation state to asset path */
    TMap<ENPCAnimState, FString> AnimationAssetMap;

    /** Cached animation montages by name */
    TMap<FString, UAnimMontage*> CachedMontages;
};
