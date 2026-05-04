#include "OutdoorFurnitureGenerator.h"

AOutdoorFurnitureGenerator::AOutdoorFurnitureGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void AOutdoorFurnitureGenerator::PopulateSettlement(FVector Center, float Radius, int32 Density)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Populating settlement at (%.1f, %.1f, %.1f) radius %.1f density %d"),
        Center.X, Center.Y, Center.Z, Radius, Density);

    // Density controls how many items per unit area
    const float Area = PI * Radius * Radius;
    const int32 TotalItems = FMath::Max(1, FMath::RoundToInt(Area * Density / 10000.f));

    FRandomStream Rand(GetTypeHash(FString::Printf(TEXT("furn_%f_%f"), Center.X, Center.Z)));

    // Weighted distribution of furniture types
    struct FFurnitureWeight { EOutdoorFurnitureType Type; float Weight; };
    static const FFurnitureWeight Weights[] = {
        {EOutdoorFurnitureType::Bench,      0.20f},
        {EOutdoorFurnitureType::LampPost,   0.15f},
        {EOutdoorFurnitureType::Barrel,     0.12f},
        {EOutdoorFurnitureType::Crate,      0.12f},
        {EOutdoorFurnitureType::Planter,    0.10f},
        {EOutdoorFurnitureType::Fence,      0.08f},
        {EOutdoorFurnitureType::MarketStall,0.08f},
        {EOutdoorFurnitureType::SignPost,   0.05f},
        {EOutdoorFurnitureType::Well,       0.03f},
        {EOutdoorFurnitureType::Cart,       0.07f},
    };

    for (int32 i = 0; i < TotalItems; i++)
    {
        // Random position within settlement radius
        const float Angle = Rand.FRand() * 2.f * PI;
        const float R = Rand.FRand() * Radius * 0.9f;
        const FVector Pos = Center + FVector(FMath::Cos(Angle) * R, 0.f, FMath::Sin(Angle) * R);

        if (!IsValidPlacement(Pos))
        {
            continue;
        }

        // Pick type by weighted random
        float Roll = Rand.FRand();
        EOutdoorFurnitureType ChosenType = EOutdoorFurnitureType::Bench;
        float Cumulative = 0.f;
        for (const auto& W : Weights)
        {
            Cumulative += W.Weight;
            if (Roll <= Cumulative)
            {
                ChosenType = W.Type;
                break;
            }
        }

        const FRotator Rot(0.f, Rand.FRand() * 360.f, 0.f);
        SpawnFurniture(ChosenType, Pos, Rot);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Placed %d outdoor furniture items"), PlacedFurniture.Num());
}

void AOutdoorFurnitureGenerator::SpawnFurniture(EOutdoorFurnitureType Type, FVector Position, FRotator Rotation)
{
    FOutdoorFurnitureInstance Instance;
    Instance.Type = Type;
    Instance.Position = Position;
    Instance.Rotation = Rotation;
    Instance.Scale = 1.f;

    PlacedFurniture.Add(Instance);

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Spawned furniture type %d at (%.1f, %.1f, %.1f)"),
        static_cast<int32>(Type), Position.X, Position.Y, Position.Z);
}

TArray<FOutdoorFurnitureInstance> AOutdoorFurnitureGenerator::GetPlacedFurniture() const
{
    return PlacedFurniture;
}

void AOutdoorFurnitureGenerator::ClearFurniture()
{
    PlacedFurniture.Empty();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Cleared all outdoor furniture"));
}

bool AOutdoorFurnitureGenerator::IsValidPlacement(FVector Position) const
{
    for (const FOutdoorFurnitureInstance& Existing : PlacedFurniture)
    {
        if (FVector::Dist(Existing.Position, Position) < MinSpacing)
        {
            return false;
        }
    }
    return true;
}
