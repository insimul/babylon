#include "WeatherSystem.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

void UWeatherSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    CurrentWeather = EWeatherType::Clear;
    TargetWeather = EWeatherType::Clear;
    CurrentState = GetStateConfig(EWeatherType::Clear);
    TransitionAlpha = 1.0f;
    StateTimer = 0.0f;
    StateDuration = FMath::RandRange(120.0f, 300.0f);
}

void UWeatherSystem::SetComponents(UDirectionalLightComponent* InSun, USkyLightComponent* InSky,
                                    UExponentialHeightFogComponent* InFog)
{
    SunLight = InSun;
    SkyLight = InSky;
    FogComp = InFog;
}

UWeatherSystem::WeatherState UWeatherSystem::GetStateConfig(EWeatherType Type) const
{
    switch (Type)
    {
    case EWeatherType::Clear:    return { 0.1f,  0.0002f, 0.1f, 1.0f,  1.0f  };
    case EWeatherType::Cloudy:   return { 0.4f,  0.001f,  0.2f, 0.85f, 0.85f };
    case EWeatherType::Overcast: return { 0.7f,  0.003f,  0.3f, 0.6f,  0.65f };
    case EWeatherType::Rain:     return { 0.8f,  0.005f,  0.4f, 0.45f, 0.5f  };
    case EWeatherType::Storm:    return { 1.0f,  0.008f,  0.8f, 0.3f,  0.35f };
    default:                     return { 0.1f,  0.0002f, 0.1f, 1.0f,  1.0f  };
    }
}

EWeatherType UWeatherSystem::PickNextWeather() const
{
    // Weighted transition — prefer gradual changes
    float R = FMath::FRand();
    switch (CurrentWeather)
    {
    case EWeatherType::Clear:
        return R < 0.6f ? EWeatherType::Clear : (R < 0.9f ? EWeatherType::Cloudy : EWeatherType::Overcast);
    case EWeatherType::Cloudy:
        return R < 0.3f ? EWeatherType::Clear : (R < 0.7f ? EWeatherType::Cloudy : (R < 0.9f ? EWeatherType::Overcast : EWeatherType::Rain));
    case EWeatherType::Overcast:
        return R < 0.2f ? EWeatherType::Cloudy : (R < 0.5f ? EWeatherType::Overcast : (R < 0.8f ? EWeatherType::Rain : EWeatherType::Storm));
    case EWeatherType::Rain:
        return R < 0.3f ? EWeatherType::Overcast : (R < 0.6f ? EWeatherType::Rain : (R < 0.85f ? EWeatherType::Cloudy : EWeatherType::Storm));
    case EWeatherType::Storm:
        return R < 0.4f ? EWeatherType::Rain : (R < 0.7f ? EWeatherType::Storm : EWeatherType::Overcast);
    default:
        return EWeatherType::Clear;
    }
}

float UWeatherSystem::GetSkyDarkening() const
{
    return 1.0f - CurrentState.CloudCoverage * 0.6f;
}

void UWeatherSystem::UpdateWeather(float DeltaTime)
{
    // Advance state timer
    StateTimer += DeltaTime;

    // Check if it's time to transition to a new weather state
    if (TransitionAlpha >= 1.0f && StateTimer >= StateDuration)
    {
        TargetWeather = PickNextWeather();
        if (TargetWeather != CurrentWeather)
        {
            TransitionAlpha = 0.0f;
        }
        StateTimer = 0.0f;
        StateDuration = FMath::RandRange(120.0f, 300.0f);
    }

    // Smoothly transition between states
    if (TransitionAlpha < 1.0f)
    {
        TransitionAlpha = FMath::Clamp(TransitionAlpha + DeltaTime * TransitionSpeed, 0.0f, 1.0f);

        WeatherState Target = GetStateConfig(TargetWeather);
        CurrentState.CloudCoverage = FMath::Lerp(CurrentState.CloudCoverage, Target.CloudCoverage, TransitionAlpha);
        CurrentState.FogDensity = FMath::Lerp(CurrentState.FogDensity, Target.FogDensity, TransitionAlpha);
        CurrentState.WindSpeed = FMath::Lerp(CurrentState.WindSpeed, Target.WindSpeed, TransitionAlpha);
        CurrentState.SunDimFactor = FMath::Lerp(CurrentState.SunDimFactor, Target.SunDimFactor, TransitionAlpha);
        CurrentState.SkyDimFactor = FMath::Lerp(CurrentState.SkyDimFactor, Target.SkyDimFactor, TransitionAlpha);

        if (TransitionAlpha >= 1.0f)
        {
            CurrentWeather = TargetWeather;
            CurrentState = Target;
        }
    }

    // Apply fog
    if (FogComp)
    {
        FogComp->SetFogDensity(CurrentState.FogDensity);
        FogComp->SetFogInscatteringColor(FLinearColor(0.5f, 0.55f, 0.6f));
    }

    // Update clouds
    UpdateClouds(DeltaTime);
}

void UWeatherSystem::InitClouds()
{
    // Generate 10 cloud positions at high altitude
    FRandomStream Rng(999);
    CloudPositions.Empty();
    for (int32 i = 0; i < 10; i++)
    {
        CloudPositions.Add(FVector(
            Rng.FRandRange(-30000.f, 30000.f),
            Rng.FRandRange(-30000.f, 30000.f),
            Rng.FRandRange(7000.f, 9000.f)
        ));
    }
}

void UWeatherSystem::UpdateClouds(float DeltaTime)
{
    CloudDriftTime += DeltaTime * CurrentState.WindSpeed * 50.0f;

    // Clouds are visual-only — modulate sky light based on coverage
    // (Cloud ISMC would need an actor host, which subsystems don't have.
    //  Cloud visual is achieved through fog density + sky dimming.)
}
