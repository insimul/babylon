#include "WaterRenderer.h"

AWaterRenderer::AWaterRenderer()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void AWaterRenderer::SpawnWaterBody(EWaterType Type, FVector Position, float Size, const TArray<FVector>& RiverPath)
{
    FWaterBodyData Data;
    Data.Type = Type;
    Data.Position = Position;
    Data.Size = Size;
    Data.RiverPath = RiverPath;
    Data.MaterialProps = GetDefaultMaterialProps(Type);

    SpawnWaterBodyFromData(Data);
}

void AWaterRenderer::SpawnWaterBodyFromData(const FWaterBodyData& Data)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawning water body type %d at (%.1f, %.1f, %.1f) size %.1f"),
        static_cast<int32>(Data.Type), Data.Position.X, Data.Position.Y, Data.Position.Z, Data.Size);

    if (Data.Type == EWaterType::River || Data.Type == EWaterType::Stream)
    {
        if (Data.RiverPath.Num() < 2)
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] River/stream requires at least 2 path points, got %d"), Data.RiverPath.Num());
            return;
        }

        // In a full implementation, create a spline mesh along the river path.
        // Each segment between path points gets a mesh strip with flowing UV animation.
        UE_LOG(LogTemp, Log, TEXT("[Insimul] River path has %d points, width %.1f, flow speed %.2f"),
            Data.RiverPath.Num(), DefaultRiverWidth, Data.MaterialProps.FlowSpeed);
    }
    else
    {
        // Static water bodies (lake, pond, ocean, swamp) use a scaled plane mesh
        // with a water material instance for transparency, color, and wave animation.
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Static water body: transparency %.2f, color (%.2f, %.2f, %.2f)"),
            Data.MaterialProps.Transparency,
            Data.MaterialProps.Color.R, Data.MaterialProps.Color.G, Data.MaterialProps.Color.B);
    }

    SpawnedBodies.Add(Data);
}

void AWaterRenderer::SpawnAllWaterBodies(const TArray<FWaterBodyData>& WaterBodies)
{
    for (const FWaterBodyData& Body : WaterBodies)
    {
        SpawnWaterBodyFromData(Body);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Spawned %d water bodies"), WaterBodies.Num());
}

FWaterMaterialProperties AWaterRenderer::GetDefaultMaterialProps(EWaterType Type)
{
    FWaterMaterialProperties Props;

    switch (Type)
    {
    case EWaterType::Lake:
        Props.Transparency = 0.5f;
        Props.FlowSpeed = 0.f;
        Props.Color = FLinearColor(0.1f, 0.3f, 0.5f, 1.f);
        Props.WaveAmplitude = 0.15f;
        Props.WaveFrequency = 0.8f;
        Props.ReflectionStrength = 0.6f;
        break;

    case EWaterType::Pond:
        Props.Transparency = 0.4f;
        Props.FlowSpeed = 0.f;
        Props.Color = FLinearColor(0.15f, 0.35f, 0.3f, 1.f);
        Props.WaveAmplitude = 0.05f;
        Props.WaveFrequency = 0.5f;
        Props.ReflectionStrength = 0.7f;
        break;

    case EWaterType::River:
        Props.Transparency = 0.55f;
        Props.FlowSpeed = 1.5f;
        Props.Color = FLinearColor(0.1f, 0.25f, 0.45f, 1.f);
        Props.WaveAmplitude = 0.2f;
        Props.WaveFrequency = 1.2f;
        Props.ReflectionStrength = 0.4f;
        break;

    case EWaterType::Ocean:
        Props.Transparency = 0.7f;
        Props.FlowSpeed = 0.3f;
        Props.Color = FLinearColor(0.05f, 0.15f, 0.4f, 1.f);
        Props.WaveAmplitude = 0.5f;
        Props.WaveFrequency = 0.6f;
        Props.ReflectionStrength = 0.8f;
        break;

    case EWaterType::Stream:
        Props.Transparency = 0.6f;
        Props.FlowSpeed = 2.f;
        Props.Color = FLinearColor(0.15f, 0.35f, 0.5f, 1.f);
        Props.WaveAmplitude = 0.1f;
        Props.WaveFrequency = 1.5f;
        Props.ReflectionStrength = 0.3f;
        break;

    case EWaterType::Swamp:
        Props.Transparency = 0.2f;
        Props.FlowSpeed = 0.f;
        Props.Color = FLinearColor(0.2f, 0.3f, 0.15f, 1.f);
        Props.WaveAmplitude = 0.02f;
        Props.WaveFrequency = 0.3f;
        Props.ReflectionStrength = 0.2f;
        break;
    }

    return Props;
}
