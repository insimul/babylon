#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SpatialAudioManager.generated.h"

class UAudioComponent;

UENUM(BlueprintType)
enum class ESurfaceType : uint8
{
    Stone  UMETA(DisplayName = "Stone"),
    Grass  UMETA(DisplayName = "Grass"),
    Wood   UMETA(DisplayName = "Wood"),
    Metal  UMETA(DisplayName = "Metal"),
    Sand   UMETA(DisplayName = "Sand"),
    Water  UMETA(DisplayName = "Water")
};

/**
 * Manages spatial audio sources, footstep sounds, door sounds, and ambient tracks.
 */
UCLASS()
class INSIMULEXPORT_API USpatialAudioManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Register a spatial audio source in the world */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void RegisterAudioSource(const FString& SourceId, FVector Position, const FString& AudioRole, float Radius = 1000.0f, bool bLoop = false);

    /** Remove a registered audio source */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void UnregisterAudioSource(const FString& SourceId);

    /** Play a footstep sound at a position for the given surface type */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void PlayFootstep(const FString& SurfaceType, FVector Position);

    /** Play a door open/close sound at a position */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void PlayDoorSound(bool bOpening, FVector Position);

    /** Update the listener position for attenuation calculations */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void UpdateListenerPosition(FVector Position);

    /** Set ambient audio track based on world type (e.g., "forest", "town", "dungeon") */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
    void SetAmbientForWorldType(const FString& WorldType);

    /** Interval between footstep sounds in seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio")
    float FootstepInterval = 0.4f;

private:
    /** Active spatial audio components keyed by source ID */
    UPROPERTY()
    TMap<FString, UAudioComponent*> ActiveSources;

    /** Current ambient audio component */
    UPROPERTY()
    UAudioComponent* AmbientComponent = nullptr;

    /** Current listener position */
    FVector ListenerPosition = FVector::ZeroVector;

    /** Last footstep time for throttling */
    float LastFootstepTime = 0.0f;

    /** Map surface type string to sound asset path */
    FString GetFootstepSoundPath(const FString& SurfaceType) const;

    /** Get ambient sound path for a world type */
    FString GetAmbientSoundPath(const FString& WorldType) const;
};
