#include "NPCAnimationController.h"
#include "Animation/AnimMontage.h"
#include "Animation/AnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"

UNPCAnimationController::UNPCAnimationController()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.0f;
}

void UNPCAnimationController::BeginPlay()
{
    Super::BeginPlay();
    LoadAnimationAssets();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCAnimationController initialized on %s — %d animation assets mapped"),
           *GetOwner()->GetName(), AnimationAssetMap.Num());
}

void UNPCAnimationController::LoadAnimationAssets()
{
    // Map animation states to content paths
    AnimationAssetMap.Add(ENPCAnimState::Idle,     TEXT("/Game/Animations/NPC/Anim_NPC_Idle"));
    AnimationAssetMap.Add(ENPCAnimState::Walk,     TEXT("/Game/Animations/NPC/Anim_NPC_Walk"));
    AnimationAssetMap.Add(ENPCAnimState::Run,      TEXT("/Game/Animations/NPC/Anim_NPC_Run"));
    AnimationAssetMap.Add(ENPCAnimState::Talk,     TEXT("/Game/Animations/NPC/Anim_NPC_Talk"));
    AnimationAssetMap.Add(ENPCAnimState::Sit,      TEXT("/Game/Animations/NPC/Anim_NPC_Sit"));
    AnimationAssetMap.Add(ENPCAnimState::Work,     TEXT("/Game/Animations/NPC/Anim_NPC_Work"));
    AnimationAssetMap.Add(ENPCAnimState::Eat,      TEXT("/Game/Animations/NPC/Anim_NPC_Eat"));
    AnimationAssetMap.Add(ENPCAnimState::Sleep,    TEXT("/Game/Animations/NPC/Anim_NPC_Sleep"));
    AnimationAssetMap.Add(ENPCAnimState::Interact, TEXT("/Game/Animations/NPC/Anim_NPC_Interact"));
    AnimationAssetMap.Add(ENPCAnimState::Combat,   TEXT("/Game/Animations/NPC/Anim_NPC_Combat"));
}

void UNPCAnimationController::SetAnimState(ENPCAnimState NewState)
{
    if (NewState == CurrentAnimState) return;

    PreviousAnimState = CurrentAnimState;
    CurrentAnimState = NewState;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] %s animation state: %d -> %d"),
           *GetOwner()->GetName(), static_cast<int32>(PreviousAnimState), static_cast<int32>(CurrentAnimState));

    // Look up the animation asset for the new state
    const FString* AssetPath = AnimationAssetMap.Find(CurrentAnimState);
    if (!AssetPath)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No animation asset mapped for state %d"), static_cast<int32>(CurrentAnimState));
        return;
    }

    // Attempt to play the animation on the owner's skeletal mesh
    ACharacter* OwnerCharacter = Cast<ACharacter>(GetOwner());
    if (!OwnerCharacter) return;

    USkeletalMeshComponent* MeshComp = OwnerCharacter->GetMesh();
    if (!MeshComp) return;

    UAnimInstance* AnimInstance = MeshComp->GetAnimInstance();
    if (!AnimInstance)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No AnimInstance on %s — animation state change will not be visible"), *GetOwner()->GetName());
    }
}

ENPCAnimState UNPCAnimationController::GetAnimState() const
{
    return CurrentAnimState;
}

void UNPCAnimationController::SetMovementSpeed(float Speed)
{
    CurrentMovementSpeed = FMath::Max(Speed, 0.0f);

    // Calculate target playback rate based on movement speed
    // Walking speed ~150 = 1.0x, running speed ~400 = 1.0x for run anim
    if (CurrentAnimState == ENPCAnimState::Walk)
    {
        TargetPlaybackRate = FMath::Clamp(CurrentMovementSpeed / 150.0f, 0.5f, 2.0f);
    }
    else if (CurrentAnimState == ENPCAnimState::Run)
    {
        TargetPlaybackRate = FMath::Clamp(CurrentMovementSpeed / 400.0f, 0.5f, 2.0f);
    }
    else
    {
        TargetPlaybackRate = 1.0f;
    }
}

void UNPCAnimationController::PlayMontage(const FString& MontageName)
{
    ACharacter* OwnerCharacter = Cast<ACharacter>(GetOwner());
    if (!OwnerCharacter) return;

    USkeletalMeshComponent* MeshComp = OwnerCharacter->GetMesh();
    if (!MeshComp) return;

    UAnimInstance* AnimInstance = MeshComp->GetAnimInstance();
    if (!AnimInstance) return;

    // Check cache first
    UAnimMontage** CachedMontage = CachedMontages.Find(MontageName);
    if (CachedMontage && *CachedMontage)
    {
        AnimInstance->Montage_Play(*CachedMontage, 1.0f);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Playing montage '%s' on %s (cached)"), *MontageName, *GetOwner()->GetName());
        return;
    }

    // Try to load the montage
    FString MontagePath = FString::Printf(TEXT("/Game/Animations/NPC/Montages/%s"), *MontageName);
    UAnimMontage* Montage = LoadObject<UAnimMontage>(nullptr, *MontagePath);
    if (Montage)
    {
        CachedMontages.Add(MontageName, Montage);
        AnimInstance->Montage_Play(Montage, 1.0f);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Playing montage '%s' on %s"), *MontageName, *GetOwner()->GetName());
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Montage not found: %s (this is normal if animation assets weren't imported)"), *MontagePath);
    }
}

void UNPCAnimationController::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Blend playback rate toward target
    if (bSyncSpeedWithMovement && !FMath::IsNearlyEqual(CurrentPlaybackRate, TargetPlaybackRate, 0.01f))
    {
        CurrentPlaybackRate = FMath::FInterpTo(CurrentPlaybackRate, TargetPlaybackRate, DeltaTime, 1.0f / BlendTime);

        // Apply playback rate to anim instance
        ACharacter* OwnerCharacter = Cast<ACharacter>(GetOwner());
        if (OwnerCharacter)
        {
            USkeletalMeshComponent* MeshComp = OwnerCharacter->GetMesh();
            if (MeshComp)
            {
                MeshComp->SetPlayRate(CurrentPlaybackRate);
            }
        }
    }
}
