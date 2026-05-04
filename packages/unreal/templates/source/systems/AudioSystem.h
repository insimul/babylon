#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AudioSystem.generated.h"

class UAudioComponent;

/**
 * Audio manager subsystem.
 * Handles ambient loops, footstep sounds, and UI audio.
 * Gracefully handles missing audio assets (exported worlds may not include .wav files).
 */
UCLASS()
class INSIMULEXPORT_API UAudioSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Play an ambient loop by role (e.g., "ambient_village", "ambient_forest") */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void PlayAmbientLoop(const FString& AudioRole);

    /** Stop the current ambient loop */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void StopAmbientLoop();

    /** Play a one-shot sound at a world position */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void PlaySoundAtLocation(const FString& AudioRole, FVector Location);

    /** Play a UI sound (non-spatial) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void PlayUISound(const FString& AudioRole);

    /** Set master volume (0-1) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void SetMasterVolume(float Volume);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio")
    float MasterVolume = 0.7f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio")
    float AmbientVolume = 0.4f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio")
    float SFXVolume = 0.8f;

private:
    /** Map from audio role to asset path */
    TMap<FString, FString> AudioAssetPaths;
    void LoadAudioConfig();

    UPROPERTY() UAudioComponent* AmbientComp = nullptr;
};
