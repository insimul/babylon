#include "VRScaffolding.h"
#include "IHeadMountedDisplay.h"
#include "IXRTrackingSystem.h"
#include "Engine/Engine.h"

void UVRScaffolding::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] VRScaffolding initialized (VR not yet activated)"));
}

void UVRScaffolding::Deinitialize()
{
    if (bVRInitialized)
    {
        bVRInitialized = false;
        OnVRDeactivated.Broadcast();
    }
    Super::Deinitialize();
}

bool UVRScaffolding::InitializeVR()
{
    if (bVRInitialized) return true;

    // Check for available HMD via OpenXR or SteamVR
    if (GEngine && GEngine->XRSystem.IsValid())
    {
        IHeadMountedDisplay* HMD = GEngine->XRSystem->GetHMDDevice();
        if (HMD && HMD->IsHMDEnabled())
        {
            bVRInitialized = true;

            // Apply default comfort settings
            SetComfortLevel(EVRComfortSetting::Medium);
            SetLocomotionMode(EVRLocomotionMode::Teleport);

            OnVRActivated.Broadcast();
            UE_LOG(LogTemp, Log, TEXT("[Insimul] VR initialized successfully — HMD detected"));
            return true;
        }
    }

    // No VR hardware available — stub mode
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] VR initialization failed — no HMD detected. Running in stub mode."));
    return false;
}

bool UVRScaffolding::IsVRActive() const
{
    return bVRInitialized;
}

void UVRScaffolding::SetLocomotionMode(EVRLocomotionMode Mode)
{
    CurrentLocomotionMode = Mode;

    // TODO: Configure the VR pawn's movement component based on mode:
    //   Teleport  — arc teleport with fade
    //   Smooth    — thumbstick-based smooth locomotion
    //   RoomScale — physical room-scale only (no artificial movement)

    UE_LOG(LogTemp, Log, TEXT("[Insimul] VR locomotion mode set to: %d"), static_cast<int32>(Mode));
}

void UVRScaffolding::SetComfortLevel(EVRComfortSetting Level)
{
    CurrentComfortSetting = Level;

    switch (Level)
    {
    case EVRComfortSetting::Off:
        VignetteStrength = 0.0f;
        SnapTurnAngle = 0.0f; // Smooth turn
        break;

    case EVRComfortSetting::Low:
        VignetteStrength = 0.2f;
        SnapTurnAngle = 45.0f;
        break;

    case EVRComfortSetting::Medium:
        VignetteStrength = 0.5f;
        SnapTurnAngle = 30.0f;
        break;

    case EVRComfortSetting::High:
        VignetteStrength = 0.8f;
        SnapTurnAngle = 15.0f;
        break;
    }

    // TODO: Apply VignetteStrength to post-process volume
    // TODO: Configure snap turn angle on the VR pawn's turn component

    UE_LOG(LogTemp, Log, TEXT("[Insimul] VR comfort level set to: %d (vignette: %.2f, snap: %.1f deg)"),
           static_cast<int32>(Level), VignetteStrength, SnapTurnAngle);
}

FTransform UVRScaffolding::GetHandTransform(bool bRightHand) const
{
    if (!bVRInitialized)
    {
        // Stub: return identity transform when VR is not active
        return FTransform::Identity;
    }

    if (GEngine && GEngine->XRSystem.IsValid())
    {
        IXRTrackingSystem* XR = GEngine->XRSystem.Get();

        // Motion controller device IDs: typically 0 = HMD, 1 = Left, 2 = Right
        // but this varies by runtime. Use the XR tracking system API.
        FQuat Orientation;
        FVector Position;

        // EControllerHand::Right = 1, EControllerHand::Left = 0
        int32 DeviceId = bRightHand ? 2 : 1;

        if (XR->GetCurrentPose(DeviceId, Orientation, Position))
        {
            return FTransform(Orientation, Position);
        }
    }

    return FTransform::Identity;
}
