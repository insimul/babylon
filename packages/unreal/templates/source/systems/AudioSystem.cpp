#include "AudioSystem.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundWave.h"
#include "Kismet/GameplayStatics.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

void UAudioSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadAudioConfig();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AudioSystem initialized — %d audio roles configured"), AudioAssetPaths.Num());
}

void UAudioSystem::LoadAudioConfig()
{
    // Load audio asset mapping from Content/Data/AIConfig.json or similar
    // For now, set up default paths for common audio roles
    AudioAssetPaths.Add(TEXT("ambient_village"),  TEXT("/Game/Audio/ambient/medieval_village"));
    AudioAssetPaths.Add(TEXT("ambient_wind"),     TEXT("/Game/Audio/ambient/wind"));
    AudioAssetPaths.Add(TEXT("footstep_stone"),   TEXT("/Game/Audio/footstep/stone"));
    AudioAssetPaths.Add(TEXT("interact_door"),    TEXT("/Game/Audio/interact/door"));
    AudioAssetPaths.Add(TEXT("interact_button"),  TEXT("/Game/Audio/interact/button"));
}

void UAudioSystem::PlayAmbientLoop(const FString& AudioRole)
{
    const FString* Path = AudioAssetPaths.Find(AudioRole);
    if (!Path)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Audio role not found: %s"), *AudioRole);
        return;
    }

    USoundWave* Sound = LoadObject<USoundWave>(nullptr, **Path);
    if (!Sound)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Audio asset not found: %s (this is normal if audio files weren't imported)"), **Path);
        return;
    }

    // Stop existing ambient
    StopAmbientLoop();

    // Create audio component on the game instance's world
    UWorld* World = GetWorld();
    if (!World) return;

    APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
    if (!PC || !PC->GetPawn()) return;

    AmbientComp = UGameplayStatics::SpawnSound2D(World, Sound, AmbientVolume * MasterVolume);
    if (AmbientComp)
    {
        AmbientComp->bAutoDestroy = false;
        AmbientComp->bIsUISound = true; // Non-spatial
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Playing ambient loop: %s"), *AudioRole);
}

void UAudioSystem::StopAmbientLoop()
{
    if (AmbientComp)
    {
        AmbientComp->Stop();
        AmbientComp->DestroyComponent();
        AmbientComp = nullptr;
    }
}

void UAudioSystem::PlaySoundAtLocation(const FString& AudioRole, FVector Location)
{
    const FString* Path = AudioAssetPaths.Find(AudioRole);
    if (!Path) return;

    USoundWave* Sound = LoadObject<USoundWave>(nullptr, **Path);
    if (!Sound) return;

    UWorld* World = GetWorld();
    if (!World) return;

    UGameplayStatics::PlaySoundAtLocation(World, Sound, Location, SFXVolume * MasterVolume);
}

void UAudioSystem::PlayUISound(const FString& AudioRole)
{
    const FString* Path = AudioAssetPaths.Find(AudioRole);
    if (!Path) return;

    USoundWave* Sound = LoadObject<USoundWave>(nullptr, **Path);
    if (!Sound) return;

    UWorld* World = GetWorld();
    if (!World) return;

    UGameplayStatics::PlaySound2D(World, Sound, SFXVolume * MasterVolume);
}

void UAudioSystem::SetMasterVolume(float Volume)
{
    MasterVolume = FMath::Clamp(Volume, 0.0f, 1.0f);

    // Update ambient if playing
    if (AmbientComp)
    {
        AmbientComp->SetVolumeMultiplier(AmbientVolume * MasterVolume);
    }
}
