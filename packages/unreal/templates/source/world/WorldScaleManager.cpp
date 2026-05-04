#include "WorldScaleManager.h"

void UWorldScaleManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] WorldScaleManager initialized (terrain: %d, scale: %.2f)"), TerrainSize, ScaleFactor);
}

// ---------------------------------------------------------------------------
// Seeded random – mirrors the TypeScript createSeededRandom()
// ---------------------------------------------------------------------------

int32 UWorldScaleManager::CreateSeedHash(const FString& SeedString)
{
    int32 Hash = 0;
    for (int32 i = 0; i < SeedString.Len(); i++)
    {
        Hash = ((Hash << 5) - Hash) + static_cast<int32>(SeedString[i]);
        Hash = Hash & Hash; // force 32-bit wrap
    }
    return Hash;
}

float UWorldScaleManager::SeededRandom(int32& Hash)
{
    Hash = (Hash * 9301 + 49297) % 233280;
    return FMath::Abs(static_cast<float>(Hash)) / 233280.f;
}

// ---------------------------------------------------------------------------
// Population helpers
// ---------------------------------------------------------------------------

float UWorldScaleManager::GetSettlementRadius(int32 Population)
{
    struct FPopTier { int32 Min; int32 Max; float Radius; };
    static const FPopTier Tiers[] = {
        {0, 50, 20.f}, {51, 200, 35.f}, {201, 1000, 55.f},
        {1001, 5000, 80.f}, {5001, INT32_MAX, 120.f}
    };

    for (int32 i = 0; i < UE_ARRAY_COUNT(Tiers); i++)
    {
        const auto& T = Tiers[i];
        if (Population >= T.Min && Population <= T.Max)
        {
            // Interpolate within the tier just like the TS source
            const float TierProgress = (T.Max > T.Min)
                ? static_cast<float>(Population - T.Min) / static_cast<float>(T.Max - T.Min)
                : 0.f;

            if (i + 1 < UE_ARRAY_COUNT(Tiers))
            {
                return T.Radius + TierProgress * (Tiers[i + 1].Radius - T.Radius);
            }
            return T.Radius;
        }
    }
    return 20.f;
}

int32 UWorldScaleManager::GetBuildingCount(int32 Population)
{
    // Rough estimate: 1 building per 3-5 people (avg occupancy 4)
    const int32 AvgOccupancy = 4;
    return FMath::CeilToInt(static_cast<float>(Population) / AvgOccupancy);
}

FString UWorldScaleManager::GetSettlementTier(int32 Population)
{
    if (Population < 100) return TEXT("hamlet");
    if (Population < 500) return TEXT("village");
    if (Population < 2000) return TEXT("town");
    if (Population < 10000) return TEXT("city");
    return TEXT("metropolis");
}

// ---------------------------------------------------------------------------
// Territory distribution – countries
// ---------------------------------------------------------------------------

TArray<FScaledCountry> UWorldScaleManager::DistributeCountries(
    const TArray<FString>& CountryIds, const TArray<FString>& CountryNames)
{
    TArray<FScaledCountry> Result;
    const int32 Count = CountryIds.Num();
    if (Count == 0) return Result;

    const float Half = TerrainSize / 2.f;
    const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(Count)));
    const int32 Rows = FMath::CeilToInt(static_cast<float>(Count) / Cols);
    const float CellWidth = TerrainSize / static_cast<float>(Cols);
    const float CellHeight = TerrainSize / static_cast<float>(Rows);

    for (int32 Index = 0; Index < Count; Index++)
    {
        const int32 Row = Index / Cols;
        const int32 Col = Index % Cols;

        const float CellMinX = -Half + Col * CellWidth;
        const float CellMaxX = -Half + (Col + 1) * CellWidth;
        const float CellMinZ = -Half + Row * CellHeight;
        const float CellMaxZ = -Half + (Row + 1) * CellHeight;

        const float Padding = 20.f;

        FScaledCountry Country;
        Country.Id = CountryIds[Index];
        Country.Name = CountryNames.IsValidIndex(Index) ? CountryNames[Index] : Country.Id;
        Country.Bounds.MinX = CellMinX + Padding;
        Country.Bounds.MaxX = CellMaxX - Padding;
        Country.Bounds.MinZ = CellMinZ + Padding;
        Country.Bounds.MaxZ = CellMaxZ - Padding;
        Country.Bounds.CenterX = (CellMinX + CellMaxX) / 2.f;
        Country.Bounds.CenterZ = (CellMinZ + CellMaxZ) / 2.f;

        Result.Add(Country);
    }

    return Result;
}

// ---------------------------------------------------------------------------
// Territory distribution – states within a country
// ---------------------------------------------------------------------------

TArray<FScaledState> UWorldScaleManager::DistributeStatesInCountry(
    const FScaledCountry& Country,
    const TArray<FString>& StateIds,
    const TArray<FString>& StateNames,
    const TArray<FString>& StateTerrains)
{
    TArray<FScaledState> Result;
    const int32 Count = StateIds.Num();
    if (Count == 0) return Result;

    const float CountryWidth = Country.Bounds.MaxX - Country.Bounds.MinX;
    const float CountryHeight = Country.Bounds.MaxZ - Country.Bounds.MinZ;

    const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(Count)));
    const int32 Rows = FMath::CeilToInt(static_cast<float>(Count) / Cols);
    const float CellWidth = CountryWidth / static_cast<float>(Cols);
    const float CellHeight = CountryHeight / static_cast<float>(Rows);

    for (int32 Index = 0; Index < Count; Index++)
    {
        const int32 Row = Index / Cols;
        const int32 Col = Index % Cols;

        const float CellMinX = Country.Bounds.MinX + Col * CellWidth;
        const float CellMaxX = Country.Bounds.MinX + (Col + 1) * CellWidth;
        const float CellMinZ = Country.Bounds.MinZ + Row * CellHeight;
        const float CellMaxZ = Country.Bounds.MinZ + (Row + 1) * CellHeight;

        const float Padding = 5.f;

        FScaledState State;
        State.Id = StateIds[Index];
        State.Name = StateNames.IsValidIndex(Index) ? StateNames[Index] : State.Id;
        State.CountryId = Country.Id;
        State.Bounds.MinX = CellMinX + Padding;
        State.Bounds.MaxX = CellMaxX - Padding;
        State.Bounds.MinZ = CellMinZ + Padding;
        State.Bounds.MaxZ = CellMaxZ - Padding;
        State.Bounds.CenterX = (CellMinX + CellMaxX) / 2.f;
        State.Bounds.CenterZ = (CellMinZ + CellMaxZ) / 2.f;
        State.Terrain = StateTerrains.IsValidIndex(Index) ? StateTerrains[Index] : TEXT("");

        Result.Add(State);
    }

    return Result;
}

// ---------------------------------------------------------------------------
// Settlement distribution with collision detection (structured)
// ---------------------------------------------------------------------------

TArray<FScaledSettlement> UWorldScaleManager::DistributeSettlementsInTerritory(
    const FTerritoryBounds& Bounds, const FString& TerritoryId, bool bIsState,
    const TArray<FString>& SettlementIds, const TArray<FString>& SettlementNames,
    const TArray<int32>& Populations, const TArray<FString>& SettlementTypes,
    const TArray<float>& WorldPositionsX, const TArray<float>& WorldPositionsZ)
{
    TArray<FScaledSettlement> Result;
    const int32 Count = SettlementIds.Num();
    if (Count == 0) return Result;

    int32 Hash = CreateSeedHash(Seed + TEXT("_") + TerritoryId);

    const float BoundsW = Bounds.MaxX - Bounds.MinX;
    const float BoundsH = Bounds.MaxZ - Bounds.MinZ;
    const float Margin = FMath::Min(BoundsW, BoundsH) * 0.25f;
    const float SafeMinX = Bounds.MinX + Margin;
    const float SafeMaxX = Bounds.MaxX - Margin;
    const float SafeMinZ = Bounds.MinZ + Margin;
    const float SafeMaxZ = Bounds.MaxZ - Margin;

    for (int32 Index = 0; Index < Count; Index++)
    {
        const int32 Pop = Populations.IsValidIndex(Index) ? Populations[Index] : 100;
        const float Radius = GetSettlementRadius(Pop);

        FVector Position;

        // Use stored world coordinates if available
        const bool bHasWorldPos = WorldPositionsX.IsValidIndex(Index) && WorldPositionsZ.IsValidIndex(Index)
            && WorldPositionsX[Index] != 0.f && WorldPositionsZ[Index] != 0.f;

        if (bHasWorldPos)
        {
            Position = FVector(WorldPositionsX[Index] * ScaleFactor, 0.f, WorldPositionsZ[Index] * ScaleFactor);
        }
        else if (Count == 1)
        {
            Position = FVector(Bounds.CenterX, 0.f, Bounds.CenterZ);
        }
        else
        {
            int32 Attempts = 0;
            const int32 MaxAttempts = 50;
            bool bPlaced = false;
            Position = FVector(Bounds.CenterX, 0.f, Bounds.CenterZ);

            while (Attempts < MaxAttempts)
            {
                const float X = SafeMinX + SeededRandom(Hash) * FMath::Max(SafeMaxX - SafeMinX, 1.f);
                const float Z = SafeMinZ + SeededRandom(Hash) * FMath::Max(SafeMaxZ - SafeMinZ, 1.f);
                Position = FVector(X, 0.f, Z);

                bool bTooClose = false;
                for (int32 j = 0; j < Result.Num(); j++)
                {
                    const float Dist = FVector::Dist(Position, Result[j].Position);
                    if (Dist < (Radius + Result[j].Radius + 10.f))
                    {
                        bTooClose = true;
                        break;
                    }
                }

                if (!bTooClose)
                {
                    bPlaced = true;
                    break;
                }
                Attempts++;
            }

            // Grid fallback
            if (!bPlaced)
            {
                const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(Count)));
                const int32 Row = Index / Cols;
                const int32 Col = Index % Cols;
                const float CellWidth = (SafeMaxX - SafeMinX) / Cols;
                const float CellHeight = (SafeMaxZ - SafeMinZ) / FMath::CeilToInt(static_cast<float>(Count) / Cols);

                Position = FVector(
                    SafeMinX + Col * CellWidth + CellWidth / 2.f,
                    0.f,
                    SafeMinZ + Row * CellHeight + CellHeight / 2.f
                );
            }
        }

        FScaledSettlement Settlement;
        Settlement.Id = SettlementIds[Index];
        Settlement.Name = SettlementNames.IsValidIndex(Index) ? SettlementNames[Index] : Settlement.Id;
        Settlement.StateId = bIsState ? TerritoryId : TEXT("");
        Settlement.CountryId = bIsState ? TEXT("") : TerritoryId;
        Settlement.Position = Position;
        Settlement.Radius = Radius;
        Settlement.Population = Pop;
        Settlement.SettlementType = SettlementTypes.IsValidIndex(Index) ? SettlementTypes[Index] : TEXT("town");

        Result.Add(Settlement);
    }

    return Result;
}

// ---------------------------------------------------------------------------
// Legacy flat-vector settlement distribution (kept for backward compat)
// ---------------------------------------------------------------------------

TArray<FVector> UWorldScaleManager::DistributeSettlements(FVector BoundsMin, FVector BoundsMax, FVector BoundsCenter, int32 SettlementCount, const TArray<float>& Radii, int32 WorldSeed)
{
    TArray<FVector> Positions;
    if (SettlementCount <= 0) return Positions;

    const float BoundsW = BoundsMax.X - BoundsMin.X;
    const float BoundsH = BoundsMax.Z - BoundsMin.Z;

    const float Margin = FMath::Min(BoundsW, BoundsH) * 0.25f;
    const float SafeMinX = BoundsMin.X + Margin;
    const float SafeMaxX = BoundsMax.X - Margin;
    const float SafeMinZ = BoundsMin.Z + Margin;
    const float SafeMaxZ = BoundsMax.Z - Margin;

    FRandomStream Rand(WorldSeed);

    for (int32 Index = 0; Index < SettlementCount; Index++)
    {
        const float Radius = Radii.IsValidIndex(Index) ? Radii[Index] : 20.f;
        FVector Position;

        if (SettlementCount == 1)
        {
            Position = BoundsCenter;
        }
        else
        {
            int32 Attempts = 0;
            const int32 MaxAttempts = 50;
            bool bPlaced = false;

            while (Attempts < MaxAttempts)
            {
                const float X = SafeMinX + Rand.FRand() * FMath::Max(SafeMaxX - SafeMinX, 1.f);
                const float Z = SafeMinZ + Rand.FRand() * FMath::Max(SafeMaxZ - SafeMinZ, 1.f);
                Position = FVector(X, 0.f, Z);

                bool bTooClose = false;
                for (int32 j = 0; j < Positions.Num(); j++)
                {
                    const float Dist = FVector::Dist(Position, Positions[j]);
                    const float OtherRadius = Radii.IsValidIndex(j) ? Radii[j] : 20.f;
                    if (Dist < (Radius + OtherRadius + 10.f))
                    {
                        bTooClose = true;
                        break;
                    }
                }

                if (!bTooClose)
                {
                    bPlaced = true;
                    break;
                }
                Attempts++;
            }

            if (!bPlaced)
            {
                const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(SettlementCount)));
                const int32 Row = Index / Cols;
                const int32 Col = Index % Cols;

                const float CellWidth = (SafeMaxX - SafeMinX) / Cols;
                const float CellHeight = (SafeMaxZ - SafeMinZ) / FMath::CeilToInt(static_cast<float>(SettlementCount) / Cols);

                Position = FVector(
                    SafeMinX + Col * CellWidth + CellWidth / 2.f,
                    0.f,
                    SafeMinZ + Row * CellHeight + CellHeight / 2.f
                );
            }
        }

        Positions.Add(Position);
    }

    return Positions;
}

// ---------------------------------------------------------------------------
// Lot generation
// ---------------------------------------------------------------------------

TArray<FVector> UWorldScaleManager::GenerateLotPositions(FVector SettlementPosition, float SettlementRadius, int32 LotCount)
{
    TArray<FVector> Positions;
    if (LotCount <= 0) return Positions;

    const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(LotCount)));
    const int32 Rows = FMath::CeilToInt(static_cast<float>(LotCount) / Cols);
    const float LotSpacing = 20.f;
    const float GridWidth = (Cols - 1) * LotSpacing;
    const float GridHeight = (Rows - 1) * LotSpacing;

    FRandomStream Rand(GetTypeHash(FString::Printf(TEXT("%f_%f"), SettlementPosition.X, SettlementPosition.Z)));

    for (int32 i = 0; i < LotCount; i++)
    {
        const int32 Row = i / Cols;
        const int32 Col = i % Cols;

        float BaseX = SettlementPosition.X - GridWidth / 2.f + Col * LotSpacing;
        float BaseZ = SettlementPosition.Y - GridHeight / 2.f + Row * LotSpacing;

        float JitterX = (Rand.FRand() - 0.5f) * 4.f;
        float JitterZ = (Rand.FRand() - 0.5f) * 4.f;

        float LotX = BaseX + JitterX;
        float LotZ = BaseZ + JitterZ;

        // Push lots outside spawn clear radius
        float DX = LotX - SettlementPosition.X;
        float DZ = LotZ - SettlementPosition.Y;
        float Dist = FMath::Sqrt(DX * DX + DZ * DZ);
        if (Dist < SPAWN_CLEAR_RADIUS)
        {
            float Angle = Dist > 0.001f ? FMath::Atan2(DZ, DX) : (i * PI * 0.618f);
            LotX = SettlementPosition.X + FMath::Cos(Angle) * SPAWN_CLEAR_RADIUS;
            LotZ = SettlementPosition.Y + FMath::Sin(Angle) * SPAWN_CLEAR_RADIUS;
        }

        Positions.Add(FVector(LotX, LotZ, 0.f));
    }

    return Positions;
}

// ---------------------------------------------------------------------------
// Street-aligned settlement generation
// ---------------------------------------------------------------------------

FStreetAlignedResult UWorldScaleManager::GenerateStreetAlignedSettlement(
    FVector SettlementPosition, float SettlementRadius, int32 LotCount, int32 BizCount)
{
    FStreetAlignedResult Result;
    if (LotCount <= 0) return Result;

    const float Half = TerrainSize / 2.f;
    int32 Hash = CreateSeedHash(Seed + TEXT("_lots"));

    // --- Generate street network ---
    // Main street runs through the settlement center
    const float MainStreetHalfLen = SettlementRadius * 0.85f;
    const float MainAngle = SeededRandom(Hash) * PI; // random orientation

    const float CosA = FMath::Cos(MainAngle);
    const float SinA = FMath::Sin(MainAngle);

    FStreetSegment MainStreet;
    MainStreet.Name = TEXT("Main Street");
    MainStreet.Start = FVector(
        SettlementPosition.X - CosA * MainStreetHalfLen,
        0.f,
        SettlementPosition.Z - SinA * MainStreetHalfLen);
    MainStreet.End = FVector(
        SettlementPosition.X + CosA * MainStreetHalfLen,
        0.f,
        SettlementPosition.Z + SinA * MainStreetHalfLen);
    Result.Streets.Add(MainStreet);

    // Side streets perpendicular to main street
    const int32 SideStreetCount = FMath::Max(1, LotCount / 8);
    const float PerpCos = FMath::Cos(MainAngle + PI / 2.f);
    const float PerpSin = FMath::Sin(MainAngle + PI / 2.f);

    for (int32 s = 0; s < SideStreetCount; s++)
    {
        const float T = static_cast<float>(s + 1) / (SideStreetCount + 1);
        const FVector Origin = FMath::Lerp(MainStreet.Start, MainStreet.End, T);
        const float SideLen = SettlementRadius * (0.3f + SeededRandom(Hash) * 0.3f);

        FStreetSegment Side;
        Side.Name = FString::Printf(TEXT("Side Street %d"), s + 1);
        Side.Start = Origin;
        Side.End = FVector(
            Origin.X + PerpCos * SideLen * (SeededRandom(Hash) > 0.5f ? 1.f : -1.f),
            0.f,
            Origin.Z + PerpSin * SideLen * (SeededRandom(Hash) > 0.5f ? 1.f : -1.f));
        Result.Streets.Add(Side);
    }

    // --- Place lots along streets ---
    const float LotOffset = 8.f; // perpendicular offset from street centerline
    const float LotSpacing = 14.f;
    int32 PlacedCount = 0;
    int32 HouseNum = 1;

    for (int32 si = 0; si < Result.Streets.Num() && PlacedCount < LotCount; si++)
    {
        const FStreetSegment& Street = Result.Streets[si];
        const FVector Dir = (Street.End - Street.Start);
        const float Len = Dir.Size();
        if (Len < 1.f) continue;

        const FVector DirN = Dir / Len;
        const FVector PerpN = FVector(-DirN.Z, 0.f, DirN.X); // perpendicular

        const int32 LotsPerSide = FMath::Max(1, FMath::FloorToInt(Len / LotSpacing));

        for (int32 Side = -1; Side <= 1; Side += 2)
        {
            for (int32 li = 0; li < LotsPerSide && PlacedCount < LotCount; li++)
            {
                const float T = (li + 0.5f) / LotsPerSide;
                const FVector Along = FMath::Lerp(Street.Start, Street.End, T);
                FVector Pos = Along + PerpN * (LotOffset * Side);

                // Clamp within world bounds
                Pos.X = FMath::Clamp(Pos.X, -Half, Half);
                Pos.Z = FMath::Clamp(Pos.Z, -Half, Half);

                FPlacedLot Lot;
                Lot.Position = Pos;
                Lot.FacingAngle = FMath::Atan2(PerpN.Z * -Side, PerpN.X * -Side);
                Lot.HouseNumber = HouseNum++;
                Lot.StreetName = Street.Name;
                Lot.bIsCorner = (li == 0 || li == LotsPerSide - 1);

                Result.Lots.Add(Lot);
                PlacedCount++;
            }
        }
    }

    // If we still need more lots, fill with jittered grid
    if (PlacedCount < LotCount)
    {
        const int32 Remaining = LotCount - PlacedCount;
        const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(Remaining)));

        for (int32 i = 0; i < Remaining; i++)
        {
            const float Angle = SeededRandom(Hash) * 2.f * PI;
            const float R = (SeededRandom(Hash) * 0.5f + 0.5f) * SettlementRadius;

            FPlacedLot Lot;
            Lot.Position = FVector(
                FMath::Clamp(SettlementPosition.X + FMath::Cos(Angle) * R, -Half, Half),
                0.f,
                FMath::Clamp(SettlementPosition.Z + FMath::Sin(Angle) * R, -Half, Half));
            Lot.FacingAngle = Angle + PI;
            Lot.HouseNumber = HouseNum++;
            Lot.StreetName = TEXT("Outskirts");
            Lot.bIsCorner = false;

            Result.Lots.Add(Lot);
        }
    }

    // Sort lots so commercial-friendly positions (corners, near main street) come first
    if (BizCount > 0)
    {
        Result.Lots.Sort([&](const FPlacedLot& A, const FPlacedLot& B)
        {
            // Corners first
            if (A.bIsCorner != B.bIsCorner) return A.bIsCorner;
            // Then by proximity to settlement center (main street intersection)
            const float DistA = FVector::Dist(A.Position, SettlementPosition);
            const float DistB = FVector::Dist(B.Position, SettlementPosition);
            return DistA < DistB;
        });
    }

    return Result;
}

// ---------------------------------------------------------------------------
// World sizing
// ---------------------------------------------------------------------------

int32 UWorldScaleManager::CalculateOptimalWorldSize(int32 CountryCount, int32 StateCount, int32 SettlementCount)
{
    const float MaxEntities = FMath::Max3(
        static_cast<float>(CountryCount),
        static_cast<float>(StateCount) / 2.f,
        static_cast<float>(SettlementCount) / 5.f
    );

    if (MaxEntities <= 4.f) return 1024;
    if (MaxEntities <= 9.f) return 1536;
    if (MaxEntities <= 16.f) return 2048;
    if (MaxEntities <= 25.f) return 2560;
    return 3072;
}
