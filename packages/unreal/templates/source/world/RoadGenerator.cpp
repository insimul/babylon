#include "RoadGenerator.h"

ARoadGenerator::ARoadGenerator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void ARoadGenerator::GenerateRoad(const TArray<FVector>& Waypoints, float Width)
{
    // Store segments for point-on-road queries
    for (int32 i = 0; i < Waypoints.Num() - 1; i++)
    {
        StoredRoadSegments.Add(TPair<FVector, FVector>(Waypoints[i], Waypoints[i + 1]));
    }

    // TODO: Generate road spline mesh between waypoints
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generate road with %d waypoints, width %.1f"),
        Waypoints.Num(), Width);
}

void ARoadGenerator::CreateStreetSign(FVector Position, const FString& StreetName, FVector StreetDirection)
{
    // TODO: Create street sign mesh oriented parallel to street direction (double-sided)
    // Sign should use StreetDirection to compute rotation: FMath::Atan2(StreetDirection.X, StreetDirection.Y)
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Create street sign '%s' at (%.1f, %.1f, %.1f)"),
        *StreetName, Position.X, Position.Y, Position.Z);
}

void ARoadGenerator::GenerateLotSidewalks(FVector LotCenter, FVector LotSize, FVector StreetDirection)
{
    FVector Forward = StreetDirection.GetSafeNormal();
    FVector Right = FVector(-Forward.Y, Forward.X, 0.f).GetSafeNormal();
    if (Right.IsNearlyZero()) Right = FVector(1.f, 0.f, 0.f);

    float HalfDepth = LotSize.Y * 0.5f;
    FVector FrontCenter = LotCenter - Forward * HalfDepth;

    float HalfWidth = LotSize.X * 0.5f;
    TArray<FVector> SidewalkPoints;
    SidewalkPoints.Add(FrontCenter - Right * HalfWidth + FVector(0.f, 0.f, RoadElevation + 8.f));
    SidewalkPoints.Add(FrontCenter + Right * HalfWidth + FVector(0.f, 0.f, RoadElevation + 8.f));

    // TODO: Create sidewalk ribbon mesh from SidewalkPoints with width ~150cm
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generate lot sidewalk at (%.0f, %.0f) width %.0f"),
        FrontCenter.X, FrontCenter.Y, HalfWidth * 2.f);
}

bool ARoadGenerator::IsPointOnRoad(FVector Point, float Threshold) const
{
    float ThresholdSq = Threshold * Threshold;
    for (const auto& Seg : StoredRoadSegments)
    {
        FVector2D P2(Point.X, Point.Y);
        FVector2D A2(Seg.Key.X, Seg.Key.Y);
        FVector2D B2(Seg.Value.X, Seg.Value.Y);

        FVector2D AB = B2 - A2;
        float ABLenSq = AB.SizeSquared();
        if (ABLenSq < 1.f)
        {
            if (FVector2D::DistSquared(P2, A2) < ThresholdSq) return true;
            continue;
        }

        float T = FMath::Clamp(FVector2D::DotProduct(P2 - A2, AB) / ABLenSq, 0.f, 1.f);
        FVector2D Proj = A2 + AB * T;
        if (FVector2D::DistSquared(P2, Proj) < ThresholdSq) return true;
    }
    return false;
}

FVector ARoadGenerator::InterpolatePolyline(const TArray<FVector>& Waypoints, float Distance)
{
    if (Waypoints.Num() == 0) return FVector::ZeroVector;
    if (Waypoints.Num() == 1 || Distance <= 0.f) return Waypoints[0];

    float Walked = 0.f;
    for (int32 i = 0; i < Waypoints.Num() - 1; i++)
    {
        float SegLen = FVector::Dist(Waypoints[i], Waypoints[i + 1]);
        if (Walked + SegLen >= Distance)
        {
            float T = FMath::Clamp((Distance - Walked) / FMath::Max(SegLen, 0.001f), 0.f, 1.f);
            return FMath::Lerp(Waypoints[i], Waypoints[i + 1], T);
        }
        Walked += SegLen;
    }
    return Waypoints.Last();
}

float ARoadGenerator::PolylineLength(const TArray<FVector>& Waypoints)
{
    if (Waypoints.Num() < 2) return 0.f;
    float Length = 0.f;
    for (int32 i = 0; i < Waypoints.Num() - 1; i++)
        Length += FVector::Dist(Waypoints[i], Waypoints[i + 1]);
    return Length;
}

void ARoadGenerator::GenerateSettlementRoads(const TArray<FVector>& SettlementCenters, float DefaultWidth)
{
    int32 N = SettlementCenters.Num();
    if (N < 2) return;

    // Build all edges sorted by distance (Kruskal's)
    struct FEdge { int32 A; int32 B; float Dist; };
    TArray<FEdge> Edges;
    for (int32 i = 0; i < N; i++)
        for (int32 j = i + 1; j < N; j++)
            Edges.Add({ i, j, FVector::Dist(SettlementCenters[i], SettlementCenters[j]) });

    Edges.Sort([](const FEdge& L, const FEdge& R) { return L.Dist < R.Dist; });

    // Union-Find
    TArray<int32> Parent;
    Parent.SetNum(N);
    for (int32 i = 0; i < N; i++) Parent[i] = i;

    TFunction<int32(int32)> FindRoot = [&](int32 X) -> int32 {
        if (Parent[X] == X) return X;
        Parent[X] = FindRoot(Parent[X]);
        return Parent[X];
    };

    int32 EdgesAdded = 0;
    for (const FEdge& Edge : Edges)
    {
        int32 RootA = FindRoot(Edge.A);
        int32 RootB = FindRoot(Edge.B);
        if (RootA == RootB) continue;

        Parent[RootA] = RootB;
        TArray<FVector> Points;
        Points.Add(SettlementCenters[Edge.A] + FVector(0.f, 0.f, RoadElevation));
        Points.Add(SettlementCenters[Edge.B] + FVector(0.f, 0.f, RoadElevation));
        GenerateRoad(Points, DefaultWidth);
        EdgesAdded++;

        if (EdgesAdded >= N - 1) break;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Generated %d settlement MST roads"), EdgesAdded);
}
