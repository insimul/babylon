#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "CameraManager.generated.h"

UENUM(BlueprintType)
enum class ECameraMode : uint8
{
    Exterior    UMETA(DisplayName = "Exterior"),
    Interior    UMETA(DisplayName = "Interior"),
    Dialogue    UMETA(DisplayName = "Dialogue"),
};

/**
 * Camera manager with orbit and follow modes.
 * Supports exterior third-person, interior (closer), and dialogue (NPC focus) modes.
 * Handles collision with buildings and terrain to prevent clipping.
 */
UCLASS(ClassGroup=(Insimul), meta=(BlueprintSpawnableComponent))
class INSIMULEXPORT_API UCameraManager : public UActorComponent
{
    GENERATED_BODY()

public:
    UCameraManager();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Rotate camera by yaw/pitch delta */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Camera")
    void RotateCamera(float YawDelta, float PitchDelta);

    /** Zoom camera by delta (scroll wheel) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Camera")
    void ZoomCamera(float Delta);

    /** Switch camera mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Camera")
    void SetCameraMode(ECameraMode NewMode);

    /** Set dialogue focus target */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Camera")
    void SetDialogueTarget(AActor* Target);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|Camera")
    ECameraMode GetCameraMode() const { return CurrentMode; }

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float ExteriorDistance = 500.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float InteriorDistance = 250.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float DialogueDistance = 200.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float MinZoom = 100.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float MaxZoom = 1000.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float ZoomSpeed = 50.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float RotationSpeed = 2.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float MinPitch = -60.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float MaxPitch = 60.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Camera")
    float TransitionSpeed = 5.f;

private:
    ECameraMode CurrentMode = ECameraMode::Exterior;
    float CurrentYaw = 0.f;
    float CurrentPitch = -20.f;
    float CurrentDistance = 500.f;
    float TargetDistance = 500.f;

    UPROPERTY() AActor* DialogueTarget = nullptr;

    /** Check for camera collision and adjust distance */
    float ResolveCollision(FVector Origin, FVector DesiredPos) const;

    /** Smoothly interpolate camera to target state */
    void SmoothTransition(float DeltaTime);
};
