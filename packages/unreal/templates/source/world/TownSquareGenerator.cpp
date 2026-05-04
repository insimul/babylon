#include "TownSquareGenerator.h"

ATownSquareGenerator::ATownSquareGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;
}

void ATownSquareGenerator::GenerateTownSquare(FVector SettlementCenter, float SquareRadius, FString Style)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generating town square at (%.1f, %.1f, %.1f) radius %.1f style '%s'"),
        SettlementCenter.X, SettlementCenter.Y, SettlementCenter.Z, SquareRadius, *Style);

    ConnectionPoints.Empty();
    Decorations.Empty();

    SetActorLocation(SettlementCenter);

    // Generate the ground plane for the square
    // In a full implementation, this would spawn a ground mesh or modify landscape

    // Place decorative elements based on style
    PlaceDecorations(SettlementCenter, SquareRadius, Style);

    // Generate connection points to street network
    GenerateConnectionPoints(SettlementCenter, SquareRadius);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Town square generated with %d decorations and %d connection points"),
        Decorations.Num(), ConnectionPoints.Num());
}

void ATownSquareGenerator::PlaceDecorations(FVector Center, float Radius, const FString& Style)
{
    // Central feature - fountain or statue
    {
        FSquareDecoration CenterPiece;
        CenterPiece.ElementType = Style.Equals(TEXT("classical")) ? ETownSquareElement::Fountain : ETownSquareElement::Statue;
        CenterPiece.Position = Center;
        CenterPiece.Rotation = FRotator::ZeroRotator;
        Decorations.Add(CenterPiece);
    }

    // Benches around the perimeter
    const int32 BenchCount = FMath::Max(4, FMath::RoundToInt(Radius / 5.f));
    for (int32 i = 0; i < BenchCount; i++)
    {
        const float Angle = (static_cast<float>(i) / BenchCount) * 2.f * PI;
        const float PlaceRadius = Radius * 0.75f;

        FSquareDecoration Bench;
        Bench.ElementType = ETownSquareElement::Bench;
        Bench.Position = Center + FVector(FMath::Cos(Angle) * PlaceRadius, 0.f, FMath::Sin(Angle) * PlaceRadius);
        Bench.Rotation = FRotator(0.f, FMath::RadiansToDegrees(Angle) + 180.f, 0.f);
        Decorations.Add(Bench);
    }

    // Lamp posts at cardinal directions
    for (int32 i = 0; i < 4; i++)
    {
        const float Angle = (static_cast<float>(i) / 4.f) * 2.f * PI;
        const float PlaceRadius = Radius * 0.85f;

        FSquareDecoration Lamp;
        Lamp.ElementType = ETownSquareElement::Lamp;
        Lamp.Position = Center + FVector(FMath::Cos(Angle) * PlaceRadius, 0.f, FMath::Sin(Angle) * PlaceRadius);
        Lamp.Rotation = FRotator::ZeroRotator;
        Decorations.Add(Lamp);
    }

    // Trees interspersed
    const int32 TreeCount = FMath::Max(2, FMath::RoundToInt(Radius / 8.f));
    for (int32 i = 0; i < TreeCount; i++)
    {
        const float Angle = (static_cast<float>(i) / TreeCount) * 2.f * PI + 0.3f;
        const float PlaceRadius = Radius * 0.6f;

        FSquareDecoration Tree;
        Tree.ElementType = ETownSquareElement::Tree;
        Tree.Position = Center + FVector(FMath::Cos(Angle) * PlaceRadius, 0.f, FMath::Sin(Angle) * PlaceRadius);
        Tree.Rotation = FRotator::ZeroRotator;
        Decorations.Add(Tree);
    }

    // Market stalls for market-style squares
    if (Style.Equals(TEXT("market")) || Style.Equals(TEXT("bazaar")))
    {
        const int32 StallCount = FMath::Max(2, FMath::RoundToInt(Radius / 6.f));
        for (int32 i = 0; i < StallCount; i++)
        {
            const float Angle = (static_cast<float>(i) / StallCount) * 2.f * PI + 0.8f;
            const float PlaceRadius = Radius * 0.45f;

            FSquareDecoration Stall;
            Stall.ElementType = ETownSquareElement::MarketStall;
            Stall.Position = Center + FVector(FMath::Cos(Angle) * PlaceRadius, 0.f, FMath::Sin(Angle) * PlaceRadius);
            Stall.Rotation = FRotator(0.f, FMath::RadiansToDegrees(Angle) + 90.f, 0.f);
            Decorations.Add(Stall);
        }
    }
}

void ATownSquareGenerator::GenerateConnectionPoints(FVector Center, float Radius)
{
    for (int32 i = 0; i < ConnectionPointCount; i++)
    {
        const float Angle = (static_cast<float>(i) / ConnectionPointCount) * 2.f * PI;

        FSquareConnectionPoint Point;
        Point.Position = Center + FVector(FMath::Cos(Angle) * Radius, 0.f, FMath::Sin(Angle) * Radius);
        Point.Direction = FVector(FMath::Cos(Angle), 0.f, FMath::Sin(Angle));
        Point.ConnectedStreetName = FString::Printf(TEXT("Street_%d"), i);

        ConnectionPoints.Add(Point);
    }
}

TArray<FSquareConnectionPoint> ATownSquareGenerator::GetConnectionPoints() const
{
    return ConnectionPoints;
}

TArray<FSquareDecoration> ATownSquareGenerator::GetDecorations() const
{
    return Decorations;
}
