#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "LipSyncController.generated.h"

class USkeletalMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnLipSyncStarted);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnLipSyncStopped);

/**
 * Lip sync controller component.
 * Drives morph targets (or bone rotation fallback) to animate mouth
 * movements in sync with dialogue text display progress.
 */
UCLASS(ClassGroup = (Insimul), meta = (BlueprintSpawnableComponent))
class INSIMULEXPORT_API ULipSyncController : public UActorComponent
{
    GENERATED_BODY()

public:
    ULipSyncController();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Begin lip sync animation for the given dialogue text */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LipSync")
    void StartLipSync(const FString& DialogueText, float InSpeechRate = 1.0f);

    /** Stop lip sync and reset morph targets */
    UFUNCTION(BlueprintCallable, Category = "Insimul|LipSync")
    void StopLipSync();

    /** Whether the character is currently speaking */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|LipSync")
    bool bIsSpeaking = false;

    /** Playback rate multiplier for speech */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LipSync")
    float SpeechRate = 1.0f;

    /** Morph target name for jaw open */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LipSync")
    FName MorphTarget_JawOpen = TEXT("JawOpen");

    /** Morph target name for lips closed */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LipSync")
    FName MorphTarget_LipsClosed = TEXT("LipsClosed");

    /** Morph target name for lips open */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|LipSync")
    FName MorphTarget_LipsOpen = TEXT("LipsOpen");

    /** Current viseme index in the generated sequence */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|LipSync")
    int32 CurrentVisemeIndex = 0;

    /** Blend alpha between current and next viseme (0-1) */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|LipSync")
    float VisemeBlendAlpha = 0.0f;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|LipSync")
    FOnLipSyncStarted OnLipSyncStarted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|LipSync")
    FOnLipSyncStopped OnLipSyncStopped;

private:
    /** Animate jaw and lip morph targets based on text progress */
    void TickLipSync(float DeltaTime);

    /** Reset all morph targets to default values */
    void ResetMorphTargets();

    /** Fall back to bone rotation if morph targets are unavailable */
    void ApplyBoneRotationFallback(float JawValue);

    /** Build viseme sequence from dialogue text */
    void GenerateVisemeSequence(const FString& Text);

    /** Check if the owning mesh has the required morph targets */
    bool HasMorphTargets() const;

    UPROPERTY()
    USkeletalMeshComponent* CachedMesh = nullptr;

    TArray<float> VisemeSequence;
    float SpeechElapsed = 0.0f;
    float SpeechDuration = 0.0f;
    bool bUseBoneFallback = false;
};
