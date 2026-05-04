#include "ProceduralNatureGenerator.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AProceduralNatureGenerator::AProceduralNatureGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    // Root component
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    // Load primitive meshes
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    static ConstructorHelpers::FObjectFinder<UMaterial> MatFinder(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));

    UStaticMesh* SM_Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;
    UStaticMesh* SM_Sphere = SphereFinder.Succeeded() ? SphereFinder.Object : nullptr;
    UMaterial* BaseMat = MatFinder.Succeeded() ? MatFinder.Object : nullptr;

    // Tree trunk ISMC (brown cylinders)
    TreeTrunkISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("TreeTrunks"));
    TreeTrunkISMC->SetupAttachment(Root);
    if (SM_Cylinder) TreeTrunkISMC->SetStaticMesh(SM_Cylinder);
    TreeTrunkISMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    TreeTrunkISMC->SetCastShadow(true);

    // Tree canopy ISMC (green spheres)
    TreeCanopyISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("TreeCanopies"));
    TreeCanopyISMC->SetupAttachment(Root);
    if (SM_Sphere) TreeCanopyISMC->SetStaticMesh(SM_Sphere);
    TreeCanopyISMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    TreeCanopyISMC->SetCastShadow(true);

    // Pine canopy ISMC (dark green, elongated)
    PineCanopyISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("PineCanopies"));
    PineCanopyISMC->SetupAttachment(Root);
    if (SM_Sphere) PineCanopyISMC->SetStaticMesh(SM_Sphere);
    PineCanopyISMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    PineCanopyISMC->SetCastShadow(true);

    // Palm trunk ISMC (thin tall cylinders)
    PalmTrunkISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("PalmTrunks"));
    PalmTrunkISMC->SetupAttachment(Root);
    if (SM_Cylinder) PalmTrunkISMC->SetStaticMesh(SM_Cylinder);
    PalmTrunkISMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    PalmTrunkISMC->SetCastShadow(true);

    // Rock ISMC (gray spheres)
    RockISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Rocks"));
    RockISMC->SetupAttachment(Root);
    if (SM_Sphere) RockISMC->SetStaticMesh(SM_Sphere);
    RockISMC->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    RockISMC->SetCastShadow(true);

    // Flower ISMC (small colored spheres)
    FlowerISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Flowers"));
    FlowerISMC->SetupAttachment(Root);
    if (SM_Sphere) FlowerISMC->SetStaticMesh(SM_Sphere);
    FlowerISMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    FlowerISMC->SetCastShadow(false);

    // Geological ISMC (boulders, pillars, outcrops — uses sphere as base mesh)
    GeologicalISMC = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Geological"));
    GeologicalISMC->SetupAttachment(Root);
    if (SM_Sphere) GeologicalISMC->SetStaticMesh(SM_Sphere);
    GeologicalISMC->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    GeologicalISMC->SetCastShadow(true);
}

void AProceduralNatureGenerator::GenerateNature(int32 TerrainSize, int32 Seed,
                                                 const TArray<FVector>& BuildingPositions,
                                                 const TArray<TPair<FVector, FVector>>& RoadSegments,
                                                 FVector InWorldCenter)
{
    // Apply materials
    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (!BaseMat) return;

    // Tree trunk material — brown
    UMaterialInstanceDynamic* TrunkMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    TrunkMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.35f, 0.22f, 0.1f));
    TreeTrunkISMC->SetMaterial(0, TrunkMat);

    // Tree canopy material — green
    UMaterialInstanceDynamic* CanopyMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    CanopyMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.15f, 0.45f, 0.12f));
    TreeCanopyISMC->SetMaterial(0, CanopyMat);

    // Pine canopy material — dark green
    UMaterialInstanceDynamic* PineMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    PineMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.1f, 0.35f, 0.1f));
    PineCanopyISMC->SetMaterial(0, PineMat);

    // Palm trunk material — light brown
    UMaterialInstanceDynamic* PalmMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    PalmMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.5f, 0.35f, 0.2f));
    PalmTrunkISMC->SetMaterial(0, PalmMat);

    // Rock material — gray
    UMaterialInstanceDynamic* RockMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    RockMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.45f, 0.45f, 0.42f));
    RockISMC->SetMaterial(0, RockMat);

    // Flower material — warm colors
    UMaterialInstanceDynamic* FlowerMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    FlowerMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.7f, 0.3f, 0.35f));
    FlowerISMC->SetMaterial(0, FlowerMat);

    FRandomStream Rng(Seed);

    // Determine scatter bounds centered on world center
    float ScatterRadius = FMath::Max(10000.f, (float)TerrainSize * 0.4f);

    // ── Scatter trees ──
    int32 TreeCount = FMath::Clamp((int32)(ScatterRadius * ScatterRadius / 5000000.f), 50, 400);
    int32 TreesPlaced = 0;

    for (int32 i = 0; i < TreeCount * 3 && TreesPlaced < TreeCount; i++)
    {
        FVector Candidate(
            InWorldCenter.X + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            InWorldCenter.Y + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            0.f
        );

        if (IsNearBuilding(Candidate, BuildingPositions, 800.f)) continue;
        if (IsNearRoad(Candidate, RoadSegments, 500.f)) continue;

        // Tree height variation
        float TreeH = Rng.FRandRange(600.f, 1200.f); // 6-12m in cm
        float TrunkH = TreeH * 0.5f;
        float TrunkR = Rng.FRandRange(20.f, 40.f);
        float CanopyR = Rng.FRandRange(200.f, 400.f);

        // Pick tree type: 50% oak, 30% pine, 20% palm
        float TreeTypeRoll = Rng.FRand();

        FTransform TrunkTransform;
        TrunkTransform.SetLocation(FVector(Candidate.X, Candidate.Y, TrunkH / 2.f));

        if (TreeTypeRoll < 0.5f)
        {
            // Oak: normal trunk + round canopy
            TrunkTransform.SetScale3D(FVector(TrunkR / 50.f, TrunkR / 50.f, TrunkH / 100.f));
            TreeTrunkISMC->AddInstance(TrunkTransform);

            FTransform CanopyTransform;
            CanopyTransform.SetLocation(FVector(Candidate.X, Candidate.Y, TrunkH + CanopyR * 0.7f));
            CanopyTransform.SetScale3D(FVector(CanopyR / 50.f, CanopyR / 50.f, CanopyR / 50.f * 0.8f));
            TreeCanopyISMC->AddInstance(CanopyTransform);
        }
        else if (TreeTypeRoll < 0.8f)
        {
            // Pine: tall narrow canopy (elongated Y)
            TrunkTransform.SetScale3D(FVector(TrunkR * 0.7f / 50.f, TrunkR * 0.7f / 50.f, TrunkH * 1.2f / 100.f));
            TreeTrunkISMC->AddInstance(TrunkTransform);

            FTransform PineTransform;
            PineTransform.SetLocation(FVector(Candidate.X, Candidate.Y, TrunkH * 0.5f + CanopyR));
            PineTransform.SetScale3D(FVector(CanopyR * 0.5f / 50.f, CanopyR * 0.5f / 50.f, CanopyR * 2.0f / 50.f));
            PineCanopyISMC->AddInstance(PineTransform);
        }
        else
        {
            // Palm: thin tall trunk + small top canopy
            TrunkTransform.SetScale3D(FVector(TrunkR * 0.4f / 50.f, TrunkR * 0.4f / 50.f, TrunkH * 1.5f / 100.f));
            PalmTrunkISMC->AddInstance(TrunkTransform);

            FTransform PalmCanopyTransform;
            PalmCanopyTransform.SetLocation(FVector(Candidate.X, Candidate.Y, TrunkH * 1.5f + CanopyR * 0.3f));
            PalmCanopyTransform.SetScale3D(FVector(CanopyR * 0.8f / 50.f, CanopyR * 0.8f / 50.f, CanopyR * 0.4f / 50.f));
            TreeCanopyISMC->AddInstance(PalmCanopyTransform);
        }

        TreesPlaced++;
    }

    // ── Scatter rocks ──
    int32 RockCount = FMath::Clamp(TreeCount / 3, 20, 150);
    int32 RocksPlaced = 0;

    for (int32 i = 0; i < RockCount * 3 && RocksPlaced < RockCount; i++)
    {
        FVector Candidate(
            InWorldCenter.X + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            InWorldCenter.Y + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            0.f
        );

        if (IsNearBuilding(Candidate, BuildingPositions, 400.f)) continue;
        if (IsNearRoad(Candidate, RoadSegments, 300.f)) continue;

        float RockScale = Rng.FRandRange(0.5f, 2.0f);
        // Irregular XZ scaling for natural look (matches source rock footprint logic)
        float XZVariation = Rng.FRandRange(0.8f, 1.4f);
        FTransform RockTransform;
        RockTransform.SetLocation(FVector(Candidate.X, Candidate.Y, RockScale * 25.f));
        RockTransform.SetScale3D(FVector(RockScale * XZVariation, RockScale * Rng.FRandRange(0.7f, 1.3f), RockScale * 0.6f));
        RockTransform.SetRotation(FQuat(FRotator(0.f, Rng.FRandRange(0.f, 360.f), 0.f)));
        RockISMC->AddInstance(RockTransform);

        RocksPlaced++;
    }

    // ── Scatter flowers ──
    int32 FlowerCount = FMath::Clamp(TreeCount / 2, 30, 100);
    int32 FlowersPlaced = 0;

    for (int32 i = 0; i < FlowerCount * 2 && FlowersPlaced < FlowerCount; i++)
    {
        FVector Candidate(
            InWorldCenter.X + Rng.FRandRange(-ScatterRadius * 0.6f, ScatterRadius * 0.6f),
            InWorldCenter.Y + Rng.FRandRange(-ScatterRadius * 0.6f, ScatterRadius * 0.6f),
            0.f
        );

        if (IsNearRoad(Candidate, RoadSegments, 200.f)) continue;

        float FlowerScale = Rng.FRandRange(0.15f, 0.35f);
        FTransform FlowerTransform;
        FlowerTransform.SetLocation(FVector(Candidate.X, Candidate.Y, FlowerScale * 15.f));
        FlowerTransform.SetScale3D(FVector(FlowerScale, FlowerScale, FlowerScale));
        FlowerISMC->AddInstance(FlowerTransform);
        FlowersPlaced++;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Nature: %d trees, %d rocks, %d flowers (radius=%.0f)"),
        TreesPlaced, RocksPlaced, FlowersPlaced, ScatterRadius);
}

TArray<UInstancedStaticMeshComponent*> AProceduralNatureGenerator::GetTreeTemplates() const
{
    TArray<UInstancedStaticMeshComponent*> Templates;
    if (TreeTrunkISMC) Templates.Add(TreeTrunkISMC);
    if (TreeCanopyISMC) Templates.Add(TreeCanopyISMC);
    if (PineCanopyISMC) Templates.Add(PineCanopyISMC);
    if (PalmTrunkISMC) Templates.Add(PalmTrunkISMC);
    return Templates;
}

bool AProceduralNatureGenerator::IsNearBuilding(const FVector& Pos, const TArray<FVector>& Buildings, float MinDist) const
{
    float MinDistSq = MinDist * MinDist;
    for (const FVector& B : Buildings)
    {
        if (FVector::DistSquared2D(Pos, B) < MinDistSq) return true;
    }
    return false;
}

bool AProceduralNatureGenerator::IsNearRoad(const FVector& Pos, const TArray<TPair<FVector, FVector>>& Roads, float MinDist) const
{
    for (const auto& Seg : Roads)
    {
        if (PointToSegmentDist2D(Pos, Seg.Key, Seg.Value) < MinDist) return true;
    }
    return false;
}

float AProceduralNatureGenerator::PointToSegmentDist2D(const FVector& P, const FVector& A, const FVector& B) const
{
    FVector2D P2(P.X, P.Y);
    FVector2D A2(A.X, A.Y);
    FVector2D B2(B.X, B.Y);

    FVector2D AB = B2 - A2;
    float ABLenSq = AB.SizeSquared();
    if (ABLenSq < 1.f) return FVector2D::Distance(P2, A2);

    float T = FMath::Clamp(FVector2D::DotProduct(P2 - A2, AB) / ABLenSq, 0.f, 1.f);
    FVector2D Proj = A2 + AB * T;
    return FVector2D::Distance(P2, Proj);
}

void AProceduralNatureGenerator::RegisterTreeVariant(UStaticMesh* Mesh)
{
    if (Mesh && !RegisteredTreeVariants.Contains(Mesh))
        RegisteredTreeVariants.Add(Mesh);
}

void AProceduralNatureGenerator::SetLODProfile(const FNatureLODProfile& Profile)
{
    CurrentLODProfile = Profile;
}

void AProceduralNatureGenerator::GenerateGeologicalFeatures(int32 Seed, float Density,
                                                             const TArray<EGeologicalFeatureType>& Features,
                                                             float ScatterRadius, FVector WorldCenter,
                                                             const TArray<FVector>& BuildingPositions,
                                                             const TArray<TPair<FVector, FVector>>& RoadSegments)
{
    if (Density <= 0.001f || Features.Num() == 0) return;

    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (!BaseMat) return;

    UMaterialInstanceDynamic* GeoMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    GeoMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.5f, 0.48f, 0.44f));
    GeologicalISMC->SetMaterial(0, GeoMat);

    FRandomStream Rng(Seed + 9999);
    int32 Count = FMath::Clamp(FMath::RoundToInt(Density * 30.f), 5, 100);
    int32 Placed = 0;

    for (int32 i = 0; i < Count * 3 && Placed < Count; i++)
    {
        FVector Candidate(
            WorldCenter.X + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            WorldCenter.Y + Rng.FRandRange(-ScatterRadius, ScatterRadius),
            0.f
        );

        if (IsNearBuilding(Candidate, BuildingPositions, 600.f)) continue;
        if (IsNearRoad(Candidate, RoadSegments, 400.f)) continue;

        EGeologicalFeatureType FeatureType = Features[Rng.RandRange(0, Features.Num() - 1)];
        float BaseScale = Rng.FRandRange(1.5f, 4.0f);

        FTransform GeoTransform;
        GeoTransform.SetRotation(FQuat(FRotator(0.f, Rng.FRandRange(0.f, 360.f), 0.f)));

        switch (FeatureType)
        {
            case EGeologicalFeatureType::Boulder:
                GeoTransform.SetLocation(FVector(Candidate.X, Candidate.Y, BaseScale * 20.f));
                GeoTransform.SetScale3D(FVector(BaseScale * 1.2f, BaseScale, BaseScale * 0.65f));
                break;
            case EGeologicalFeatureType::RockCluster:
                GeoTransform.SetLocation(FVector(Candidate.X, Candidate.Y, BaseScale * 15.f));
                GeoTransform.SetScale3D(FVector(BaseScale, BaseScale * 0.8f, BaseScale * 0.7f));
                break;
            case EGeologicalFeatureType::StonePillar:
                GeoTransform.SetLocation(FVector(Candidate.X, Candidate.Y, BaseScale * 50.f));
                GeoTransform.SetScale3D(FVector(BaseScale * 0.4f, BaseScale * 0.4f, BaseScale * 2.0f));
                break;
            case EGeologicalFeatureType::RockOutcrop:
                GeoTransform.SetLocation(FVector(Candidate.X, Candidate.Y, BaseScale * 15.f));
                GeoTransform.SetScale3D(FVector(BaseScale * 1.5f, BaseScale * 1.2f, BaseScale * 0.5f));
                break;
            case EGeologicalFeatureType::CrystalFormation:
                GeoTransform.SetLocation(FVector(Candidate.X, Candidate.Y, BaseScale * 30.f));
                GeoTransform.SetScale3D(FVector(BaseScale * 0.5f, BaseScale * 0.5f, BaseScale * 1.5f));
                break;
        }

        GeologicalISMC->AddInstance(GeoTransform);
        Placed++;
    }

    GeologicalFeatureCount = Placed;
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Geological features: %d placed (density=%.2f)"), Placed, Density);
}

void AProceduralNatureGenerator::GenerateTerrainAwarePlacements()
{
    // TODO: Integrate with terrain heightmap for slope-based density
    // TODO: Sample moisture/temperature maps for biome-specific placement
    // TODO: Respect cliff faces and water edges
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] GenerateTerrainAwarePlacements stub — use GenerateNature for current placement logic"));
}

TMap<FString, int32> AProceduralNatureGenerator::GetLODStats() const
{
    TMap<FString, int32> Stats;
    Stats.Add(TEXT("TreeTrunks"), TreeTrunkISMC ? TreeTrunkISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("TreeCanopies"), TreeCanopyISMC ? TreeCanopyISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("PineCanopies"), PineCanopyISMC ? PineCanopyISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("PalmTrunks"), PalmTrunkISMC ? PalmTrunkISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("Rocks"), RockISMC ? RockISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("Flowers"), FlowerISMC ? FlowerISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("Geological"), GeologicalISMC ? GeologicalISMC->GetInstanceCount() : 0);
    Stats.Add(TEXT("GeologicalFeatureCount"), GeologicalFeatureCount);
    Stats.Add(TEXT("RegisteredTreeVariants"), RegisteredTreeVariants.Num());
    return Stats;
}
