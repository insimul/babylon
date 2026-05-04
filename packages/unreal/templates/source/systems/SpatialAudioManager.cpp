#include "SpatialAudioManager.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"

void USpatialAudioManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SpatialAudioManager initialized"));
}

void USpatialAudioManager::Deinitialize()
{
    // Clean up all active sources
    for (auto& Pair : ActiveSources)
    {
        if (Pair.Value && Pair.Value->IsPlaying())
        {
            Pair.Value->Stop();
        }
    }
    ActiveSources.Empty();

    if (AmbientComponent && AmbientComponent->IsPlaying())
    {
        AmbientComponent->Stop();
    }

    Super::Deinitialize();
}

void USpatialAudioManager::RegisterAudioSource(const FString& SourceId, FVector Position, const FString& AudioRole, float Radius, bool bLoop)
{
    // Remove existing source if present
    UnregisterAudioSource(SourceId);

    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    // Attempt to load the sound asset for this audio role
    FString SoundPath = FString::Printf(TEXT("/Game/Audio/%s"), *AudioRole);
    USoundBase* Sound = LoadObject<USoundBase>(nullptr, *SoundPath);

    if (!Sound)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Audio asset not found for role: %s"), *AudioRole);
        return;
    }

    UAudioComponent* AudioComp = UGameplayStatics::SpawnSoundAtLocation(
        World, Sound, Position, FRotator::ZeroRotator,
        1.0f, 1.0f, 0.0f, nullptr, nullptr, true);

    if (AudioComp)
    {
        AudioComp->bAutoDestroy = false;
        AudioComp->bIsUISound = false;

        if (bLoop)
        {
            // Note: looping should be set on the sound asset; this is a runtime hint
        }

        AudioComp->Play();
        ActiveSources.Add(SourceId, AudioComp);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Audio source registered: %s (role: %s, radius: %.0f)"),
               *SourceId, *AudioRole, Radius);
    }
}

void USpatialAudioManager::UnregisterAudioSource(const FString& SourceId)
{
    UAudioComponent** Found = ActiveSources.Find(SourceId);
    if (Found && *Found)
    {
        (*Found)->Stop();
        (*Found)->DestroyComponent();
    }
    ActiveSources.Remove(SourceId);
}

void USpatialAudioManager::PlayFootstep(const FString& SurfaceType, FVector Position)
{
    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    // Throttle footsteps
    float CurrentTime = World->GetTimeSeconds();
    if (CurrentTime - LastFootstepTime < FootstepInterval) return;
    LastFootstepTime = CurrentTime;

    FString SoundPath = GetFootstepSoundPath(SurfaceType);
    USoundBase* Sound = LoadObject<USoundBase>(nullptr, *SoundPath);

    if (Sound)
    {
        UGameplayStatics::PlaySoundAtLocation(World, Sound, Position, 0.6f);
    }
    else
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Footstep sound not found for surface: %s"), *SurfaceType);
    }
}

void USpatialAudioManager::PlayDoorSound(bool bOpening, FVector Position)
{
    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    FString SoundPath = bOpening
        ? TEXT("/Game/Audio/SFX/Door_Open")
        : TEXT("/Game/Audio/SFX/Door_Close");

    USoundBase* Sound = LoadObject<USoundBase>(nullptr, *SoundPath);
    if (Sound)
    {
        UGameplayStatics::PlaySoundAtLocation(World, Sound, Position, 0.8f);
    }
}

void USpatialAudioManager::UpdateListenerPosition(FVector Position)
{
    ListenerPosition = Position;

    // Adjust volume of all active sources based on distance to listener
    for (auto& Pair : ActiveSources)
    {
        if (Pair.Value && Pair.Value->IsPlaying())
        {
            float Dist = FVector::Dist(Position, Pair.Value->GetComponentLocation());
            // Simple linear attenuation (UE5 handles this natively via attenuation settings,
            // but this provides a manual override layer)
            float Volume = FMath::Clamp(1.0f - (Dist / 2000.0f), 0.0f, 1.0f);
            Pair.Value->SetVolumeMultiplier(Volume);
        }
    }
}

void USpatialAudioManager::SetAmbientForWorldType(const FString& WorldType)
{
    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    // Stop current ambient
    if (AmbientComponent && AmbientComponent->IsPlaying())
    {
        AmbientComponent->FadeOut(2.0f, 0.0f);
    }

    FString SoundPath = GetAmbientSoundPath(WorldType);
    USoundBase* Sound = LoadObject<USoundBase>(nullptr, *SoundPath);

    if (Sound)
    {
        AmbientComponent = UGameplayStatics::SpawnSound2D(World, Sound, 0.5f, 1.0f, 0.0f, nullptr, true);
        if (AmbientComponent)
        {
            AmbientComponent->FadeIn(2.0f, 0.5f);
        }
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Ambient set for world type: %s"), *WorldType);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Ambient sound not found for world type: %s"), *WorldType);
    }
}

FString USpatialAudioManager::GetFootstepSoundPath(const FString& SurfaceType) const
{
    if (SurfaceType == TEXT("Stone"))  return TEXT("/Game/Audio/Footsteps/Footstep_Stone");
    if (SurfaceType == TEXT("Grass"))  return TEXT("/Game/Audio/Footsteps/Footstep_Grass");
    if (SurfaceType == TEXT("Wood"))   return TEXT("/Game/Audio/Footsteps/Footstep_Wood");
    if (SurfaceType == TEXT("Metal"))  return TEXT("/Game/Audio/Footsteps/Footstep_Metal");
    if (SurfaceType == TEXT("Sand"))   return TEXT("/Game/Audio/Footsteps/Footstep_Sand");
    if (SurfaceType == TEXT("Water"))  return TEXT("/Game/Audio/Footsteps/Footstep_Water");
    return TEXT("/Game/Audio/Footsteps/Footstep_Default");
}

FString USpatialAudioManager::GetAmbientSoundPath(const FString& WorldType) const
{
    if (WorldType == TEXT("forest"))   return TEXT("/Game/Audio/Ambient/Ambient_Forest");
    if (WorldType == TEXT("town"))     return TEXT("/Game/Audio/Ambient/Ambient_Town");
    if (WorldType == TEXT("dungeon"))  return TEXT("/Game/Audio/Ambient/Ambient_Dungeon");
    if (WorldType == TEXT("cave"))     return TEXT("/Game/Audio/Ambient/Ambient_Cave");
    if (WorldType == TEXT("desert"))   return TEXT("/Game/Audio/Ambient/Ambient_Desert");
    if (WorldType == TEXT("mountain")) return TEXT("/Game/Audio/Ambient/Ambient_Mountain");
    if (WorldType == TEXT("ocean"))    return TEXT("/Game/Audio/Ambient/Ambient_Ocean");
    return TEXT("/Game/Audio/Ambient/Ambient_Default");
}
