#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InteriorLightingSystem.generated.h"

/**
 * Lighting presets for interior scenes.
 * Mirrors LightingPreset from the TypeScript InteriorLightingSystem.
 */
UENUM(BlueprintType)
enum class ELightingPreset : uint8
{
    Bright      UMETA(DisplayName = "Bright"),
    Dim         UMETA(DisplayName = "Dim"),
    Warm        UMETA(DisplayName = "Warm"),
    Cool        UMETA(DisplayName = "Cool"),
    Candlelit   UMETA(DisplayName = "Candlelit")
};

/**
 * Atmospheric effects for interior ambiance.
 * Mirrors effects from InteriorAtmosphericEffects.ts.
 */
UENUM(BlueprintType)
enum class EAtmosphericEffect : uint8
{
    None            UMETA(DisplayName = "None"),
    DustParticles   UMETA(DisplayName = "Dust Particles"),
    Smoke           UMETA(DisplayName = "Smoke"),
    LightShafts     UMETA(DisplayName = "Light Shafts"),
    Fog             UMETA(DisplayName = "Fog"),
    Embers          UMETA(DisplayName = "Embers"),
    Steam           UMETA(DisplayName = "Steam")
};

/**
 * Configuration for a single interior light source.
 */
USTRUCT(BlueprintType)
struct FInteriorLight
{
    GENERATED_BODY()

    /** World-space location of the light. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    FVector Location = FVector::ZeroVector;

    /** Light color. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    FLinearColor Color = FLinearColor::White;

    /** Light intensity in candelas. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    float Intensity = 800.0f;

    /** Attenuation radius in centimeters. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    float AttenuationRadius = 500.0f;

    /** Whether this light casts shadows. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    bool bCastShadows = true;
};

/**
 * Manages interior lighting, including preset-based ambient lighting,
 * point lights, spot lights, emissive window materials, and atmospheric
 * particle effects (dust, smoke, light shafts).
 *
 * Mirrors shared/game-engine/rendering/InteriorLightingSystem.ts and
 * InteriorAtmosphericEffects.ts.
 */
UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class INSIMULEXPORT_API UInteriorLightingSystem : public UActorComponent
{
    GENERATED_BODY()

public:
    UInteriorLightingSystem();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    /**
     * Apply a lighting preset to the current interior.
     * Adjusts ambient light color/intensity and spawns preset-appropriate light sources.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    void ApplyLightingPreset(ELightingPreset Preset);

    /**
     * Add a point light at the specified location.
     * @param Location   World-space position.
     * @param Color      Light color.
     * @param Intensity  Brightness in candelas.
     * @return Index of the created light for later removal.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    int32 AddPointLight(FVector Location, FLinearColor Color, float Intensity = 800.0f);

    /**
     * Add a spot light at the specified location aiming in the given direction.
     * @param Location   World-space position.
     * @param Direction  Aim direction.
     * @param Color      Light color.
     * @param Intensity  Brightness in candelas.
     * @param InnerConeAngle  Inner cone angle in degrees.
     * @param OuterConeAngle  Outer cone angle in degrees.
     * @return Index of the created light for later removal.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    int32 AddSpotLight(FVector Location, FVector Direction, FLinearColor Color,
                       float Intensity = 1200.0f, float InnerConeAngle = 22.0f, float OuterConeAngle = 35.0f);

    /**
     * Apply an emissive material to window meshes to simulate exterior light.
     * @param WindowColor  Color of the emissive glow.
     * @param EmissiveIntensity  Strength of the emissive effect.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    void SetWindowEmissive(FLinearColor WindowColor, float EmissiveIntensity = 2.0f);

    /**
     * Add an atmospheric particle effect to the interior.
     * @param Effect  Type of atmospheric effect to spawn.
     * @return Index of the created effect for later removal.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    int32 AddAtmosphericEffect(EAtmosphericEffect Effect);

    /**
     * Remove an atmospheric effect by index.
     */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    void RemoveAtmosphericEffect(int32 EffectIndex);

    /** Remove all lights and atmospheric effects. */
    UFUNCTION(BlueprintCallable, Category = "Lighting")
    void ClearAllLighting();

    /** Get the currently applied lighting preset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Lighting")
    ELightingPreset GetCurrentPreset() const;

    /** Get the default ambient color for a lighting preset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Lighting")
    static FLinearColor GetPresetAmbientColor(ELightingPreset Preset);

    /** Get the default intensity for a lighting preset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Lighting")
    static float GetPresetIntensity(ELightingPreset Preset);

    /** Current lighting preset. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    ELightingPreset CurrentPreset = ELightingPreset::Warm;

    /** Global intensity multiplier applied on top of preset values. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting", meta = (ClampMin = "0.0", ClampMax = "5.0"))
    float IntensityMultiplier = 1.0f;

    /** Whether to enable shadow casting on newly created lights. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighting")
    bool bEnableShadows = true;

private:
    /** Spawned point/spot light components. */
    UPROPERTY()
    TArray<ULightComponent*> SpawnedLights;

    /** Spawned particle system components for atmospheric effects. */
    UPROPERTY()
    TArray<UParticleSystemComponent*> SpawnedEffects;

    /** Spawn a Niagara or Cascade particle system for the given effect type. */
    UParticleSystemComponent* SpawnAtmosphericParticles(EAtmosphericEffect Effect);

    /** Configure a light component with preset-appropriate defaults. */
    void ConfigureLightForPreset(ULightComponent* Light, ELightingPreset Preset);
};
