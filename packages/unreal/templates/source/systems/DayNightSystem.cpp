#include "DayNightSystem.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"

void UDayNightSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    InitKeyframes();
    CurrentHour = StartHour;
}

void UDayNightSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UDayNightSystem::SetLightComponents(UDirectionalLightComponent* InSun, USkyLightComponent* InSky)
{
    SunLight = InSun;
    SkyLight = InSky;
}

void UDayNightSystem::InitKeyframes()
{
    // 8 keyframes matching Babylon.js DayNightCycle.ts
    Keyframes.Empty();
    //                    Hour  Alt     Az       Int    SunColor                    SkyInt
    Keyframes.Add({  0.0f, -0.8f,   3.14f,   0.0f,  FLinearColor(0.1f, 0.1f, 0.2f),   0.5f });
    Keyframes.Add({  5.0f, -0.2f,  -2.36f,   0.1f,  FLinearColor(0.8f, 0.4f, 0.2f),   1.0f });
    Keyframes.Add({  6.5f,  0.15f, -1.88f,   0.6f,  FLinearColor(1.0f, 0.7f, 0.4f),   2.5f });
    Keyframes.Add({  8.0f,  0.5f,  -1.43f,   0.9f,  FLinearColor(1.0f, 0.95f, 0.85f), 4.0f });
    Keyframes.Add({ 12.0f,  1.2f,   0.0f,    1.1f,  FLinearColor(1.0f, 0.98f, 0.95f), 5.0f });
    Keyframes.Add({ 16.0f,  0.6f,   1.43f,   0.95f, FLinearColor(1.0f, 0.95f, 0.85f), 4.0f });
    Keyframes.Add({ 18.5f,  0.1f,   2.04f,   0.5f,  FLinearColor(1.0f, 0.6f, 0.3f),   2.0f });
    Keyframes.Add({ 20.0f, -0.3f,   2.51f,   0.05f, FLinearColor(0.3f, 0.2f, 0.3f),   0.8f });
}

UDayNightSystem::LightingKeyframe UDayNightSystem::InterpolateKeyframes(float Hour) const
{
    if (Keyframes.Num() == 0) return {};

    // Find surrounding keyframes
    int32 IdxA = Keyframes.Num() - 1;
    int32 IdxB = 0;

    for (int32 i = 0; i < Keyframes.Num(); i++)
    {
        if (Keyframes[i].Hour > Hour)
        {
            IdxB = i;
            IdxA = (i - 1 + Keyframes.Num()) % Keyframes.Num();
            break;
        }
        if (i == Keyframes.Num() - 1)
        {
            IdxA = i;
            IdxB = 0;
        }
    }

    const LightingKeyframe& A = Keyframes[IdxA];
    const LightingKeyframe& B = Keyframes[IdxB];

    // Calculate interpolation factor
    float SpanA = A.Hour;
    float SpanB = B.Hour;
    if (SpanB <= SpanA) SpanB += 24.0f; // wrap midnight
    float HourAdj = Hour;
    if (HourAdj < SpanA) HourAdj += 24.0f;

    float Range = SpanB - SpanA;
    float T = (Range > 0.01f) ? FMath::Clamp((HourAdj - SpanA) / Range, 0.0f, 1.0f) : 0.0f;

    LightingKeyframe Result;
    Result.Hour = Hour;
    Result.SunAltitude = FMath::Lerp(A.SunAltitude, B.SunAltitude, T);
    Result.SunAzimuth = FMath::Lerp(A.SunAzimuth, B.SunAzimuth, T);
    Result.SunIntensity = FMath::Lerp(A.SunIntensity, B.SunIntensity, T);
    Result.SunColor = FLinearColor(
        FMath::Lerp(A.SunColor.R, B.SunColor.R, T),
        FMath::Lerp(A.SunColor.G, B.SunColor.G, T),
        FMath::Lerp(A.SunColor.B, B.SunColor.B, T));
    Result.SkyIntensity = FMath::Lerp(A.SkyIntensity, B.SkyIntensity, T);

    return Result;
}

FVector UDayNightSystem::SunDirectionFromAngles(float Altitude, float Azimuth) const
{
    float CosAlt = FMath::Cos(Altitude);
    return FVector(
        CosAlt * FMath::Sin(Azimuth),
        CosAlt * FMath::Cos(Azimuth),
        -FMath::Sin(Altitude)
    );
}

void UDayNightSystem::UpdateCycle(float DeltaTime)
{
    // Advance game time: 1 real second = 1 game minute * TimeScale
    AccumulatedTime += DeltaTime * TimeScale;
    CurrentHour = FMath::Fmod(StartHour + AccumulatedTime / 60.0f, 24.0f);
    if (CurrentHour < 0.0f) CurrentHour += 24.0f;

    // Interpolate keyframes
    LightingKeyframe KF = InterpolateKeyframes(CurrentHour);

    // Apply to sun
    if (SunLight)
    {
        FVector Dir = SunDirectionFromAngles(KF.SunAltitude, KF.SunAzimuth);
        SunLight->SetWorldRotation(Dir.Rotation());
        SunLight->SetIntensity(KF.SunIntensity * 10000.0f); // Scale to UE lux
        SunLight->SetLightColor(KF.SunColor.ToFColor(true));
    }

    // Apply to sky
    if (SkyLight)
    {
        SkyLight->SetIntensity(KF.SkyIntensity);
    }
}

FString UDayNightSystem::GetTimeString() const
{
    int32 H = (int32)CurrentHour;
    int32 M = (int32)((CurrentHour - H) * 60.0f);
    return FString::Printf(TEXT("%02d:%02d"), H, M);
}
