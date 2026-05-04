#include "CameraManager.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "Kismet/GameplayStatics.h"

UCameraManager::UCameraManager()
{
    PrimaryComponentTick.bCanEverTick = true;
}

void UCameraManager::BeginPlay()
{
    Super::BeginPlay();
    CurrentDistance = ExteriorDistance;
    TargetDistance = ExteriorDistance;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] CameraManager initialized — mode Exterior, distance %.0f"), CurrentDistance);
}

void UCameraManager::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    SmoothTransition(DeltaTime);
}

void UCameraManager::RotateCamera(float YawDelta, float PitchDelta)
{
    CurrentYaw += YawDelta * RotationSpeed;
    CurrentPitch = FMath::Clamp(CurrentPitch + PitchDelta * RotationSpeed, MinPitch, MaxPitch);
}

void UCameraManager::ZoomCamera(float Delta)
{
    TargetDistance = FMath::Clamp(TargetDistance - Delta * ZoomSpeed, MinZoom, MaxZoom);
}

void UCameraManager::SetCameraMode(ECameraMode NewMode)
{
    if (CurrentMode == NewMode) return;

    ECameraMode OldMode = CurrentMode;
    CurrentMode = NewMode;

    switch (NewMode)
    {
    case ECameraMode::Exterior:
        TargetDistance = ExteriorDistance;
        break;
    case ECameraMode::Interior:
        TargetDistance = InteriorDistance;
        break;
    case ECameraMode::Dialogue:
        TargetDistance = DialogueDistance;
        break;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Camera mode changed: %d -> %d"), (int32)OldMode, (int32)NewMode);
}

void UCameraManager::SetDialogueTarget(AActor* Target)
{
    DialogueTarget = Target;
    if (Target)
    {
        SetCameraMode(ECameraMode::Dialogue);
    }
}

float UCameraManager::ResolveCollision(FVector Origin, FVector DesiredPos) const
{
    UWorld* World = GetWorld();
    if (!World) return FVector::Dist(Origin, DesiredPos);

    FHitResult Hit;
    FCollisionQueryParams Params;
    Params.AddIgnoredActor(GetOwner());

    if (World->LineTraceSingleByChannel(Hit, Origin, DesiredPos, ECC_Camera, Params))
    {
        return FMath::Max(Hit.Distance - 20.f, MinZoom);
    }

    return FVector::Dist(Origin, DesiredPos);
}

void UCameraManager::SmoothTransition(float DeltaTime)
{
    CurrentDistance = FMath::FInterpTo(CurrentDistance, TargetDistance, DeltaTime, TransitionSpeed);

    // Update spring arm if available
    AActor* Owner = GetOwner();
    if (!Owner) return;

    USpringArmComponent* SpringArm = Owner->FindComponentByClass<USpringArmComponent>();
    if (SpringArm)
    {
        SpringArm->TargetArmLength = CurrentDistance;
        SpringArm->SetRelativeRotation(FRotator(CurrentPitch, CurrentYaw, 0.f));

        // Resolve collision
        FVector Origin = Owner->GetActorLocation();
        FVector DesiredEnd = Origin - SpringArm->GetForwardVector() * CurrentDistance;
        float SafeDistance = ResolveCollision(Origin, DesiredEnd);
        SpringArm->TargetArmLength = FMath::Min(CurrentDistance, SafeDistance);
    }
}
