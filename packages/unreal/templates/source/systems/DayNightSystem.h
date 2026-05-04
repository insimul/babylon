#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "DayNightSystem.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;

/**
 * Day/Night cycle system — rotates the sun, interpolates light colors,
 * and modifies sky intensity across 8 keyframes matching a 24-hour cycle.
 * Game time: 1 real second = 1 game minute (matches NPC schedule tick rate).
 */
UCLASS()
class INSIMULEXPORT_API UDayNightSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;
    virtual bool ShouldCreateSubsystem(UObject* Outer) const override { return true; }

    /** Call each frame from GameMode or a ticking actor */
    void UpdateCycle(float DeltaTime);

    /** Register the light components spawned by SetupLighting() */
    void SetLightComponents(UDirectionalLightComponent* InSun, USkyLightComponent* InSky);

    /** Get current game hour (0-24) */
    UFUNCTION(BlueprintPure, Category = "Insimul|DayNight")
    float GetCurrentHour() const { return CurrentHour; }

    /** Get a human-readable time string (e.g. "14:30") */
    UFUNCTION(BlueprintPure, Category = "Insimul|DayNight")
    FString GetTimeString() const;

    /** Speed multiplier: 1.0 = 1 real second per game minute */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|DayNight")
    float TimeScale = 1.0f;

    /** Starting hour when the game begins */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|DayNight")
    float StartHour = 8.0f;

private:
    struct LightingKeyframe
    {
        float Hour;
        float SunAltitude;   // radians above horizon (negative = below)
        float SunAzimuth;    // radians around Y axis
        float SunIntensity;  // lux multiplier (0-1.1)
        FLinearColor SunColor;
        float SkyIntensity;
    };

    TArray<LightingKeyframe> Keyframes;
    void InitKeyframes();
    LightingKeyframe InterpolateKeyframes(float Hour) const;
    FVector SunDirectionFromAngles(float Altitude, float Azimuth) const;

    float CurrentHour = 8.0f;
    float AccumulatedTime = 0.0f;

    UPROPERTY() UDirectionalLightComponent* SunLight = nullptr;
    UPROPERTY() USkyLightComponent* SkyLight = nullptr;
};
