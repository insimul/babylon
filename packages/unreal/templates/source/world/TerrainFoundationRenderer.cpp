#include "TerrainFoundationRenderer.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"

ATerrainFoundationRenderer::ATerrainFoundationRenderer()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void ATerrainFoundationRenderer::GenerateFoundation(FVector Location, float Width, float Depth, EFoundationType Type)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generating foundation at (%.1f, %.1f, %.1f) size %.1fx%.1f type %d"),
        Location.X, Location.Y, Location.Z, Width, Depth, static_cast<int32>(Type));

    UStaticMeshComponent* MeshComp = NewObject<UStaticMeshComponent>(this);
    if (!MeshComp) return;

    MeshComp->SetupAttachment(RootComponent);
    MeshComp->RegisterComponent();

    // Scale a unit cube to foundation dimensions
    MeshComp->SetWorldLocation(Location);
    MeshComp->SetWorldScale3D(FVector(Width, Depth, DefaultFoundationHeight));

    // Apply material based on type
    UMaterialInterface* Mat = GetFoundationMaterial(Type);
    if (Mat)
    {
        MeshComp->SetMaterial(0, Mat);
    }

    FoundationMeshes.Add(MeshComp);
}

void ATerrainFoundationRenderer::FlattenTerrainAt(FVector Location, float Radius)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Flattening terrain at (%.1f, %.1f, %.1f) radius %.1f"),
        Location.X, Location.Y, Location.Z, Radius);

    // In a full implementation this would modify the landscape heightmap.
    // For exported projects, terrain is typically pre-flattened at build time.
}

void ATerrainFoundationRenderer::GenerateFoundations(const TArray<FFoundationData>& Foundations)
{
    for (const FFoundationData& Data : Foundations)
    {
        FlattenTerrainAt(Data.Location, FMath::Max(Data.Width, Data.Depth) * 0.6f);
        GenerateFoundation(Data.Location, Data.Width, Data.Depth, Data.Type);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generated %d foundations"), Foundations.Num());
}

UMaterialInterface* ATerrainFoundationRenderer::GetFoundationMaterial(EFoundationType Type) const
{
    switch (Type)
    {
    case EFoundationType::Stone:    return StoneMaterial;
    case EFoundationType::Wood:     return WoodMaterial;
    case EFoundationType::Concrete: return ConcreteMaterial;
    case EFoundationType::Brick:    return BrickMaterial;
    default:                        return StoneMaterial;
    }
}
