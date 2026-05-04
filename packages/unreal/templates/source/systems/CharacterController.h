#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "CharacterController.generated.h"

/**
 * Third-person character controller.
 * Handles WASD/gamepad movement, sprint, jump, and collision.
 * Integrates with CameraManager for camera-relative movement direction.
 */
UCLASS(ClassGroup=(Insimul), meta=(BlueprintSpawnableComponent))
class INSIMULEXPORT_API UCharacterController : public UActorComponent
{
    GENERATED_BODY()

public:
    UCharacterController();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Process movement input (camera-relative) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Character")
    void ProcessMovementInput(float ForwardValue, float RightValue);

    /** Start sprinting */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Character")
    void StartSprint();

    /** Stop sprinting */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Character")
    void StopSprint();

    /** Trigger jump */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Character")
    void TriggerJump();

    /** Check if character is on ground */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|Character")
    bool IsGrounded() const;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Character")
    float WalkSpeed = 400.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Character")
    float SprintSpeed = 700.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Character")
    float JumpForce = 500.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Character")
    float MaxSlopeAngle = 45.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Character")
    float StepUpHeight = 30.f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Insimul|Character")
    bool bIsSprinting = false;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Insimul|Character")
    FVector CurrentVelocity = FVector::ZeroVector;

private:
    /** Resolve movement direction relative to camera */
    FVector GetCameraRelativeDirection(float Forward, float Right) const;

    /** Ground detection via line trace */
    bool CheckGroundTrace() const;

    bool bIsGrounded = true;
};
