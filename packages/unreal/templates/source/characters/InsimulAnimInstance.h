#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "InsimulAnimInstance.generated.h"

/**
 * Animation state enum matching character activity types from the IR.
 * Used to drive Animation Blueprint state transitions.
 */
UENUM(BlueprintType)
enum class EInsimulAnimState : uint8
{
    Idle     UMETA(DisplayName = "Idle"),
    Walk     UMETA(DisplayName = "Walk"),
    Run      UMETA(DisplayName = "Run"),
    Talk     UMETA(DisplayName = "Talk"),
    Work     UMETA(DisplayName = "Work"),
    Sit      UMETA(DisplayName = "Sit"),
    Eat      UMETA(DisplayName = "Eat"),
    Sleep    UMETA(DisplayName = "Sleep"),
};

/**
 * Custom AnimInstance that reads character velocity and state to drive
 * animation blending in the Animation Blueprint.
 *
 * Workflow:
 * 1. Assign this class as the Anim Instance in the character's Skeletal Mesh
 * 2. In the Animation Blueprint, read Speed/Direction/AnimState to blend poses
 * 3. Use PlayActionMontage() for one-shot animations (attack, interact, wave)
 */
UCLASS()
class INSIMULEXPORT_API UInsimulAnimInstance : public UAnimInstance
{
    GENERATED_BODY()

public:
    /** Current ground speed (cm/s). Drives idle/walk/run blend. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation")
    float Speed = 0.f;

    /** Movement direction relative to actor forward (-180 to 180 degrees). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation")
    float Direction = 0.f;

    /** True when character is airborne. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation")
    bool bIsInAir = false;

    /** Current high-level animation state. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Animation")
    EInsimulAnimState AnimState = EInsimulAnimState::Idle;

    /** Speed threshold below which character is considered idle. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Animation|Thresholds")
    float WalkThreshold = 5.f;

    /** Speed threshold above which character transitions from walk to run. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Animation|Thresholds")
    float RunThreshold = 350.f;

    virtual void NativeInitializeAnimation() override;
    virtual void NativeUpdateAnimation(float DeltaSeconds) override;

    /** Play a one-shot montage (e.g. attack, interact, wave). Returns montage duration. */
    UFUNCTION(BlueprintCallable, Category = "Animation")
    float PlayActionMontage(UAnimMontage* Montage, float PlayRate = 1.f);

    /** Stop the currently playing action montage, if any. */
    UFUNCTION(BlueprintCallable, Category = "Animation")
    void StopActionMontage(float BlendOutTime = 0.25f);

    /** True while an action montage is playing. */
    UFUNCTION(BlueprintPure, Category = "Animation")
    bool IsPlayingActionMontage() const;

private:
    UPROPERTY()
    APawn* OwnerPawn = nullptr;
};
