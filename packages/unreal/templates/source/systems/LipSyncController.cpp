#include "LipSyncController.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"

ULipSyncController::ULipSyncController()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.0f;
}

void ULipSyncController::BeginPlay()
{
    Super::BeginPlay();

    // Cache the skeletal mesh from the owning actor
    if (ACharacter* Character = Cast<ACharacter>(GetOwner()))
    {
        CachedMesh = Character->GetMesh();
    }
    else if (GetOwner())
    {
        CachedMesh = GetOwner()->FindComponentByClass<USkeletalMeshComponent>();
    }

    bUseBoneFallback = !HasMorphTargets();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] LipSyncController initialized on %s (morph targets: %s)"),
           *GetOwner()->GetName(), bUseBoneFallback ? TEXT("fallback to bone") : TEXT("available"));
}

void ULipSyncController::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (bIsSpeaking)
    {
        TickLipSync(DeltaTime);
    }
}

void ULipSyncController::StartLipSync(const FString& DialogueText, float InSpeechRate)
{
    if (DialogueText.IsEmpty()) return;

    SpeechRate = FMath::Max(InSpeechRate, 0.1f);

    // Estimate duration: ~0.06 seconds per character at rate 1.0
    SpeechDuration = (DialogueText.Len() * 0.06f) / SpeechRate;
    SpeechElapsed = 0.0f;
    CurrentVisemeIndex = 0;
    VisemeBlendAlpha = 0.0f;

    GenerateVisemeSequence(DialogueText);

    bIsSpeaking = true;
    OnLipSyncStarted.Broadcast();
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LipSync started — %d visemes over %.2fs"), VisemeSequence.Num(), SpeechDuration);
}

void ULipSyncController::StopLipSync()
{
    bIsSpeaking = false;
    CurrentVisemeIndex = 0;
    VisemeBlendAlpha = 0.0f;
    SpeechElapsed = 0.0f;

    ResetMorphTargets();

    OnLipSyncStopped.Broadcast();
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LipSync stopped"));
}

void ULipSyncController::TickLipSync(float DeltaTime)
{
    SpeechElapsed += DeltaTime * SpeechRate;

    if (SpeechElapsed >= SpeechDuration || VisemeSequence.Num() == 0)
    {
        StopLipSync();
        return;
    }

    // Determine current viseme from elapsed time
    float Progress = SpeechElapsed / SpeechDuration;
    float FloatIndex = Progress * (VisemeSequence.Num() - 1);
    CurrentVisemeIndex = FMath::Clamp(FMath::FloorToInt(FloatIndex), 0, VisemeSequence.Num() - 2);
    VisemeBlendAlpha = FloatIndex - CurrentVisemeIndex;

    // Interpolate between current and next viseme values
    float CurrentValue = VisemeSequence[CurrentVisemeIndex];
    float NextValue = VisemeSequence[FMath::Min(CurrentVisemeIndex + 1, VisemeSequence.Num() - 1)];
    float BlendedValue = FMath::Lerp(CurrentValue, NextValue, VisemeBlendAlpha);

    if (bUseBoneFallback)
    {
        ApplyBoneRotationFallback(BlendedValue);
    }
    else if (CachedMesh)
    {
        // Jaw opens proportionally, lips inverse
        CachedMesh->SetMorphTarget(MorphTarget_JawOpen, BlendedValue);
        CachedMesh->SetMorphTarget(MorphTarget_LipsOpen, BlendedValue * 0.8f);
        CachedMesh->SetMorphTarget(MorphTarget_LipsClosed, 1.0f - BlendedValue);
    }
}

void ULipSyncController::ResetMorphTargets()
{
    if (CachedMesh)
    {
        CachedMesh->SetMorphTarget(MorphTarget_JawOpen, 0.0f);
        CachedMesh->SetMorphTarget(MorphTarget_LipsClosed, 0.0f);
        CachedMesh->SetMorphTarget(MorphTarget_LipsOpen, 0.0f);
    }
}

void ULipSyncController::ApplyBoneRotationFallback(float JawValue)
{
    // Rotate the jaw bone downward proportional to the viseme value
    // This is a simple fallback for meshes without morph targets
    if (!CachedMesh) return;

    FName JawBoneName = TEXT("jaw_bone");
    int32 BoneIndex = CachedMesh->GetBoneIndex(JawBoneName);
    if (BoneIndex != INDEX_NONE)
    {
        FTransform BoneTransform = CachedMesh->GetBoneTransformByName(JawBoneName, EBoneSpaces::ComponentSpace);
        FRotator JawRotation = FRotator(-JawValue * 15.0f, 0.0f, 0.0f); // Open down up to 15 degrees
        BoneTransform.SetRotation(FQuat(JawRotation));
        CachedMesh->SetBoneTransformByName(JawBoneName, BoneTransform, EBoneSpaces::ComponentSpace);
    }
}

void ULipSyncController::GenerateVisemeSequence(const FString& Text)
{
    VisemeSequence.Empty();

    // Generate a viseme value (0-1 mouth openness) per character cluster
    // Vowels = open, consonants = partially open, spaces = closed
    for (int32 i = 0; i < Text.Len(); ++i)
    {
        TCHAR Ch = FChar::ToLower(Text[i]);

        if (Ch == ' ' || Ch == '.' || Ch == ',' || Ch == '!' || Ch == '?')
        {
            VisemeSequence.Add(0.0f);
        }
        else if (Ch == 'a' || Ch == 'e' || Ch == 'i' || Ch == 'o' || Ch == 'u')
        {
            VisemeSequence.Add(FMath::RandRange(0.6f, 1.0f));
        }
        else if (Ch == 'm' || Ch == 'b' || Ch == 'p')
        {
            VisemeSequence.Add(0.05f); // Lips together
        }
        else if (Ch == 'f' || Ch == 'v')
        {
            VisemeSequence.Add(0.2f); // Lower lip tucked
        }
        else
        {
            VisemeSequence.Add(FMath::RandRange(0.2f, 0.5f));
        }
    }

    // Smooth the sequence to avoid jarring transitions
    TArray<float> Smoothed;
    Smoothed.SetNum(VisemeSequence.Num());
    for (int32 i = 0; i < VisemeSequence.Num(); ++i)
    {
        float Sum = VisemeSequence[i];
        int32 Count = 1;
        if (i > 0) { Sum += VisemeSequence[i - 1]; Count++; }
        if (i < VisemeSequence.Num() - 1) { Sum += VisemeSequence[i + 1]; Count++; }
        Smoothed[i] = Sum / Count;
    }
    VisemeSequence = Smoothed;
}

bool ULipSyncController::HasMorphTargets() const
{
    if (!CachedMesh || !CachedMesh->GetSkeletalMeshAsset()) return false;

    TArray<FName> MorphTargetNames;
    // Check if at least the jaw open morph target exists
    float TestValue = CachedMesh->GetMorphTarget(MorphTarget_JawOpen);
    // GetMorphTarget returns 0 for both "exists at 0" and "doesn't exist"
    // so we check the skeletal mesh directly
    return CachedMesh->GetSkeletalMeshAsset()->GetMorphTargets().Num() > 0;
}
