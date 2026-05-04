#include "InsimulAnimInstance.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "KismetAnimationLibrary.h"
#include "NPCCharacter.h"

void UInsimulAnimInstance::NativeInitializeAnimation()
{
    Super::NativeInitializeAnimation();
    OwnerPawn = TryGetPawnOwner();
}

void UInsimulAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
    Super::NativeUpdateAnimation(DeltaSeconds);

    if (!OwnerPawn)
    {
        OwnerPawn = TryGetPawnOwner();
        if (!OwnerPawn) return;
    }

    const FVector Velocity = OwnerPawn->GetVelocity();
    Speed = Velocity.Size2D();

    // Calculate movement direction relative to actor facing
    if (Speed > WalkThreshold)
    {
        Direction = UKismetAnimationLibrary::CalculateDirection(Velocity, OwnerPawn->GetActorRotation());
    }
    else
    {
        Direction = 0.f;
    }

    // Airborne check
    ACharacter* Character = Cast<ACharacter>(OwnerPawn);
    if (Character)
    {
        bIsInAir = Character->GetCharacterMovement()->IsFalling();
    }

    // Determine animation state from NPC behavior state or velocity
    ANPCCharacter* NPC = Cast<ANPCCharacter>(OwnerPawn);
    if (NPC)
    {
        // NPC: map behavior state to animation state
        switch (NPC->CurrentState)
        {
        case ENPCState::Talking:
            AnimState = EInsimulAnimState::Talk;
            return;
        case ENPCState::Fleeing:
        case ENPCState::Pursuing:
            AnimState = EInsimulAnimState::Run;
            return;
        default:
            break;
        }
    }

    // Velocity-based state (applies to player and NPCs in Idle/Patrol/Alert)
    if (Speed >= RunThreshold)
    {
        AnimState = EInsimulAnimState::Run;
    }
    else if (Speed >= WalkThreshold)
    {
        AnimState = EInsimulAnimState::Walk;
    }
    else
    {
        AnimState = EInsimulAnimState::Idle;
    }
}

float UInsimulAnimInstance::PlayActionMontage(UAnimMontage* Montage, float PlayRate)
{
    if (!Montage) return 0.f;
    return Montage_Play(Montage, PlayRate);
}

void UInsimulAnimInstance::StopActionMontage(float BlendOutTime)
{
    UAnimMontage* CurrentMontage = GetCurrentActiveMontage();
    if (CurrentMontage)
    {
        Montage_Stop(BlendOutTime, CurrentMontage);
    }
}

bool UInsimulAnimInstance::IsPlayingActionMontage() const
{
    return IsAnyMontagePlaying();
}
