#include "CharacterController.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Camera/CameraComponent.h"
#include "Kismet/GameplayStatics.h"

UCharacterController::UCharacterController()
{
    PrimaryComponentTick.bCanEverTick = true;
}

void UCharacterController::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] CharacterController initialized — walk %.0f sprint %.0f"), WalkSpeed, SprintSpeed);
}

void UCharacterController::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    bIsGrounded = CheckGroundTrace();

    ACharacter* Owner = Cast<ACharacter>(GetOwner());
    if (Owner && Owner->GetCharacterMovement())
    {
        float TargetSpeed = bIsSprinting ? SprintSpeed : WalkSpeed;
        Owner->GetCharacterMovement()->MaxWalkSpeed = TargetSpeed;
    }
}

void UCharacterController::ProcessMovementInput(float ForwardValue, float RightValue)
{
    ACharacter* Owner = Cast<ACharacter>(GetOwner());
    if (!Owner) return;

    FVector Direction = GetCameraRelativeDirection(ForwardValue, RightValue);
    if (!Direction.IsNearlyZero())
    {
        Owner->AddMovementInput(Direction, 1.f);
    }
}

void UCharacterController::StartSprint() { bIsSprinting = true; }
void UCharacterController::StopSprint() { bIsSprinting = false; }

void UCharacterController::TriggerJump()
{
    ACharacter* Owner = Cast<ACharacter>(GetOwner());
    if (Owner && bIsGrounded)
    {
        Owner->Jump();
    }
}

bool UCharacterController::IsGrounded() const { return bIsGrounded; }

FVector UCharacterController::GetCameraRelativeDirection(float Forward, float Right) const
{
    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (!PC) return FVector(Forward, Right, 0.f).GetSafeNormal();

    FRotator CamRot = PC->PlayerCameraManager->GetCameraRotation();
    FRotator YawOnly(0.f, CamRot.Yaw, 0.f);

    FVector ForwardDir = FRotationMatrix(YawOnly).GetUnitAxis(EAxis::X);
    FVector RightDir = FRotationMatrix(YawOnly).GetUnitAxis(EAxis::Y);

    return (ForwardDir * Forward + RightDir * Right).GetSafeNormal();
}

bool UCharacterController::CheckGroundTrace() const
{
    AActor* Owner = GetOwner();
    if (!Owner) return false;

    FVector Start = Owner->GetActorLocation();
    FVector End = Start - FVector(0.f, 0.f, StepUpHeight + 10.f);

    FHitResult Hit;
    FCollisionQueryParams Params;
    Params.AddIgnoredActor(Owner);

    return GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params);
}
