#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "VRScaffolding.generated.h"

UENUM(BlueprintType)
enum class EVRLocomotionMode : uint8
{
    Teleport   UMETA(DisplayName = "Teleport"),
    Smooth     UMETA(DisplayName = "Smooth"),
    RoomScale  UMETA(DisplayName = "Room Scale")
};

UENUM(BlueprintType)
enum class EVRComfortSetting : uint8
{
    Off    UMETA(DisplayName = "Off"),
    Low    UMETA(DisplayName = "Low"),
    Medium UMETA(DisplayName = "Medium"),
    High   UMETA(DisplayName = "High")
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnVRActivated);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnVRDeactivated);

/**
 * VR scaffolding subsystem providing locomotion, comfort settings,
 * and hand tracking abstractions. Stubs gracefully on non-VR platforms.
 */
UCLASS()
class INSIMULEXPORT_API UVRScaffolding : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Initialize VR — returns true if a head-mounted display is available */
    UFUNCTION(BlueprintCallable, Category = "Insimul|VR")
    bool InitializeVR();

    /** Check if VR is currently active */
    UFUNCTION(BlueprintPure, Category = "Insimul|VR")
    bool IsVRActive() const;

    /** Set the locomotion mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|VR")
    void SetLocomotionMode(EVRLocomotionMode Mode);

    /** Set the comfort level (adjusts vignette and snap turn) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|VR")
    void SetComfortLevel(EVRComfortSetting Level);

    /** Get the transform of a hand controller */
    UFUNCTION(BlueprintPure, Category = "Insimul|VR")
    FTransform GetHandTransform(bool bRightHand) const;

    /** Whether VR has been initialized successfully */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|VR")
    bool bVRInitialized = false;

    /** Whether to use seated mode (adjusts height and locomotion) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|VR")
    bool bSeatedMode = false;

    /** Snap turn angle in degrees */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|VR")
    float SnapTurnAngle = 30.0f;

    /** Vignette strength for comfort (0-1) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|VR")
    float VignetteStrength = 0.5f;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|VR")
    FOnVRActivated OnVRActivated;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|VR")
    FOnVRDeactivated OnVRDeactivated;

private:
    EVRLocomotionMode CurrentLocomotionMode = EVRLocomotionMode::Teleport;
    EVRComfortSetting CurrentComfortSetting = EVRComfortSetting::Medium;
};
