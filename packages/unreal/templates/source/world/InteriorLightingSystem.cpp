#include "InteriorLightingSystem.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Particles/ParticleSystemComponent.h"

UInteriorLightingSystem::UInteriorLightingSystem()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UInteriorLightingSystem::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] InteriorLightingSystem initialized"));
}

void UInteriorLightingSystem::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    ClearAllLighting();
    Super::EndPlay(EndPlayReason);
}

// ---------------------------------------------------------------------------
// Preset management
// ---------------------------------------------------------------------------

void UInteriorLightingSystem::ApplyLightingPreset(ELightingPreset Preset)
{
    ClearAllLighting();
    CurrentPreset = Preset;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Applying lighting preset: %d"), static_cast<int32>(Preset));

    const FLinearColor AmbientColor = GetPresetAmbientColor(Preset);
    const float BaseIntensity = GetPresetIntensity(Preset) * IntensityMultiplier;

    // Create a primary ambient point light at center
    AddPointLight(GetOwner()->GetActorLocation() + FVector(0.f, 0.f, 250.f), AmbientColor, BaseIntensity);

    // Preset-specific additional lights
    switch (Preset)
    {
    case ELightingPreset::Candlelit:
        // Warm flickering point lights at lower positions
        AddPointLight(GetOwner()->GetActorLocation() + FVector(150.f, 100.f, 100.f),
            FLinearColor(1.0f, 0.7f, 0.3f), BaseIntensity * 0.4f);
        AddPointLight(GetOwner()->GetActorLocation() + FVector(-150.f, -100.f, 100.f),
            FLinearColor(1.0f, 0.65f, 0.25f), BaseIntensity * 0.3f);
        AddAtmosphericEffect(EAtmosphericEffect::DustParticles);
        break;

    case ELightingPreset::Bright:
        // Additional fill lights for even coverage
        AddPointLight(GetOwner()->GetActorLocation() + FVector(200.f, 0.f, 200.f),
            AmbientColor, BaseIntensity * 0.6f);
        AddPointLight(GetOwner()->GetActorLocation() + FVector(-200.f, 0.f, 200.f),
            AmbientColor, BaseIntensity * 0.6f);
        break;

    case ELightingPreset::Dim:
        AddAtmosphericEffect(EAtmosphericEffect::DustParticles);
        break;

    case ELightingPreset::Warm:
        AddAtmosphericEffect(EAtmosphericEffect::LightShafts);
        break;

    case ELightingPreset::Cool:
        // Slight blue fill from above
        AddPointLight(GetOwner()->GetActorLocation() + FVector(0.f, 0.f, 300.f),
            FLinearColor(0.7f, 0.8f, 1.0f), BaseIntensity * 0.3f);
        break;
    }
}

ELightingPreset UInteriorLightingSystem::GetCurrentPreset() const
{
    return CurrentPreset;
}

FLinearColor UInteriorLightingSystem::GetPresetAmbientColor(ELightingPreset Preset)
{
    switch (Preset)
    {
    case ELightingPreset::Bright:    return FLinearColor(1.0f, 0.98f, 0.95f);
    case ELightingPreset::Dim:       return FLinearColor(0.6f, 0.55f, 0.5f);
    case ELightingPreset::Warm:      return FLinearColor(1.0f, 0.85f, 0.65f);
    case ELightingPreset::Cool:      return FLinearColor(0.8f, 0.9f, 1.0f);
    case ELightingPreset::Candlelit: return FLinearColor(1.0f, 0.75f, 0.4f);
    default:                         return FLinearColor::White;
    }
}

float UInteriorLightingSystem::GetPresetIntensity(ELightingPreset Preset)
{
    switch (Preset)
    {
    case ELightingPreset::Bright:    return 1500.0f;
    case ELightingPreset::Dim:       return 400.0f;
    case ELightingPreset::Warm:      return 1000.0f;
    case ELightingPreset::Cool:      return 1200.0f;
    case ELightingPreset::Candlelit: return 300.0f;
    default:                         return 800.0f;
    }
}

// ---------------------------------------------------------------------------
// Light creation
// ---------------------------------------------------------------------------

int32 UInteriorLightingSystem::AddPointLight(FVector Location, FLinearColor Color, float Intensity)
{
    AActor* Owner = GetOwner();
    if (!Owner) return -1;

    UPointLightComponent* Light = NewObject<UPointLightComponent>(Owner, UPointLightComponent::StaticClass());
    if (!Light) return -1;

    Light->SetupAttachment(Owner->GetRootComponent());
    Light->RegisterComponent();
    Light->SetWorldLocation(Location);
    Light->SetLightColor(Color);
    Light->SetIntensity(Intensity * IntensityMultiplier);
    Light->SetAttenuationRadius(500.0f);
    Light->SetCastShadows(bEnableShadows);

    ConfigureLightForPreset(Light, CurrentPreset);

    const int32 Index = SpawnedLights.Add(Light);
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Added point light at (%.0f, %.0f, %.0f), intensity: %.0f"),
        Location.X, Location.Y, Location.Z, Intensity);
    return Index;
}

int32 UInteriorLightingSystem::AddSpotLight(FVector Location, FVector Direction, FLinearColor Color,
                                             float Intensity, float InnerConeAngle, float OuterConeAngle)
{
    AActor* Owner = GetOwner();
    if (!Owner) return -1;

    USpotLightComponent* Light = NewObject<USpotLightComponent>(Owner, USpotLightComponent::StaticClass());
    if (!Light) return -1;

    Light->SetupAttachment(Owner->GetRootComponent());
    Light->RegisterComponent();
    Light->SetWorldLocation(Location);
    Light->SetWorldRotation(Direction.Rotation());
    Light->SetLightColor(Color);
    Light->SetIntensity(Intensity * IntensityMultiplier);
    Light->SetInnerConeAngle(InnerConeAngle);
    Light->SetOuterConeAngle(OuterConeAngle);
    Light->SetCastShadows(bEnableShadows);

    ConfigureLightForPreset(Light, CurrentPreset);

    const int32 Index = SpawnedLights.Add(Light);
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Added spot light at (%.0f, %.0f, %.0f)"),
        Location.X, Location.Y, Location.Z);
    return Index;
}

void UInteriorLightingSystem::SetWindowEmissive(FLinearColor WindowColor, float EmissiveIntensity)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Setting window emissive (R:%.2f G:%.2f B:%.2f, intensity: %.1f)"),
        WindowColor.R, WindowColor.G, WindowColor.B, EmissiveIntensity);

    // TODO: Find all window mesh components in the owning actor hierarchy and
    // apply a dynamic material instance with emissive color set to
    // WindowColor * EmissiveIntensity. This simulates exterior light coming
    // through windows.
}

// ---------------------------------------------------------------------------
// Atmospheric effects
// ---------------------------------------------------------------------------

int32 UInteriorLightingSystem::AddAtmosphericEffect(EAtmosphericEffect Effect)
{
    if (Effect == EAtmosphericEffect::None) return -1;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Adding atmospheric effect: %d"), static_cast<int32>(Effect));

    UParticleSystemComponent* PSC = SpawnAtmosphericParticles(Effect);
    if (!PSC) return -1;

    const int32 Index = SpawnedEffects.Add(PSC);
    return Index;
}

void UInteriorLightingSystem::RemoveAtmosphericEffect(int32 EffectIndex)
{
    if (SpawnedEffects.IsValidIndex(EffectIndex) && SpawnedEffects[EffectIndex])
    {
        SpawnedEffects[EffectIndex]->DestroyComponent();
        SpawnedEffects[EffectIndex] = nullptr;
    }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

void UInteriorLightingSystem::ClearAllLighting()
{
    for (ULightComponent* Light : SpawnedLights)
    {
        if (Light)
        {
            Light->DestroyComponent();
        }
    }
    SpawnedLights.Empty();

    for (UParticleSystemComponent* PSC : SpawnedEffects)
    {
        if (PSC)
        {
            PSC->DestroyComponent();
        }
    }
    SpawnedEffects.Empty();

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] All interior lighting cleared"));
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

UParticleSystemComponent* UInteriorLightingSystem::SpawnAtmosphericParticles(EAtmosphericEffect Effect)
{
    AActor* Owner = GetOwner();
    if (!Owner) return nullptr;

    // TODO: Load the appropriate Niagara or Cascade particle system asset
    // based on the effect type. For now, create a placeholder component.
    // Particle assets should be bundled with the exported project:
    //   DustParticles  -> /Game/Effects/FX_Dust
    //   Smoke          -> /Game/Effects/FX_Smoke
    //   LightShafts    -> /Game/Effects/FX_LightShafts
    //   Fog            -> /Game/Effects/FX_Fog
    //   Embers         -> /Game/Effects/FX_Embers
    //   Steam          -> /Game/Effects/FX_Steam

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Spawning atmospheric particle effect %d"), static_cast<int32>(Effect));
    return nullptr;
}

void UInteriorLightingSystem::ConfigureLightForPreset(ULightComponent* Light, ELightingPreset Preset)
{
    if (!Light) return;

    // Adjust shadow quality based on preset
    switch (Preset)
    {
    case ELightingPreset::Candlelit:
        // Softer shadows for candle-like sources
        Light->SetCastShadows(bEnableShadows);
        break;

    case ELightingPreset::Bright:
        // Sharper shadows for bright environments
        Light->SetCastShadows(bEnableShadows);
        break;

    case ELightingPreset::Dim:
        // Minimal shadow for dim scenes (performance)
        Light->SetCastShadows(false);
        break;

    default:
        Light->SetCastShadows(bEnableShadows);
        break;
    }
}
