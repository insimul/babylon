#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "WeatherSystem.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;

UENUM(BlueprintType)
enum class EWeatherType : uint8
{
    Clear    UMETA(DisplayName = "Clear"),
    Cloudy   UMETA(DisplayName = "Cloudy"),
    Overcast UMETA(DisplayName = "Overcast"),
    Rain     UMETA(DisplayName = "Rain"),
    Storm    UMETA(DisplayName = "Storm"),
};

/**
 * Weather system — cycles through 5 weather states with smooth transitions.
 * Modulates fog density, sun/sky intensity, and cloud coverage.
 */
UCLASS()
class INSIMULEXPORT_API UWeatherSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Call each frame to advance weather transitions */
    void UpdateWeather(float DeltaTime);

    /** Register light + fog components */
    void SetComponents(UDirectionalLightComponent* InSun, USkyLightComponent* InSky,
                       UExponentialHeightFogComponent* InFog);

    UFUNCTION(BlueprintPure, Category = "Insimul|Weather")
    EWeatherType GetCurrentWeather() const { return CurrentWeather; }

    /** Get sky darkening factor (1.0 = clear, 0.4 = storm) for day/night integration */
    float GetSkyDarkening() const;

private:
    struct WeatherState
    {
        float CloudCoverage;
        float FogDensity;
        float WindSpeed;
        float SunDimFactor; // multiplied onto sun intensity
        float SkyDimFactor;
    };

    WeatherState GetStateConfig(EWeatherType Type) const;
    EWeatherType PickNextWeather() const;

    EWeatherType CurrentWeather = EWeatherType::Clear;
    EWeatherType TargetWeather = EWeatherType::Clear;
    float TransitionAlpha = 1.0f; // 0 = start, 1 = fully arrived
    float StateTimer = 0.0f;
    float StateDuration = 180.0f; // seconds before next transition
    float TransitionSpeed = 0.005f; // per second (200s full transition)

    WeatherState CurrentState;

    UPROPERTY() UDirectionalLightComponent* SunLight = nullptr;
    UPROPERTY() USkyLightComponent* SkyLight = nullptr;
    UPROPERTY() UExponentialHeightFogComponent* FogComp = nullptr;

    /** Cloud mesh instances (flat cubes at high altitude) */
    UPROPERTY() class UInstancedStaticMeshComponent* CloudISMC = nullptr;
    TArray<FVector> CloudPositions;
    float CloudDriftTime = 0.0f;
    void InitClouds();
    void UpdateClouds(float DeltaTime);
};
