#include "BuildingPlacementSystem.h"

void UBuildingPlacementSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] BuildingPlacementSystem initialized"));
}

FBuildingPlacementResult UBuildingPlacementSystem::PlaceBuilding(const FBuildingPlacement& Data)
{
    FBuildingPlacementResult Result;

    // Compute scale based on zone
    const FVector ZoneScale = GetBuildingScale(Data.Zone);
    Result.FinalScale = Data.Scale * ZoneScale;

    // Align to street direction
    Result.FinalRotation = Data.Rotation;
    if (!Data.StreetDirection.IsNearlyZero())
    {
        Result.FinalRotation = AlignToStreet(Data.Position, Data.StreetDirection);
    }

    // Collision avoidance - nudge building if overlapping
    FVector CandidatePos = Data.Position;
    const FVector HalfExtent = Result.FinalScale * 5.f; // approximate building half-extent

    if (!IsPositionClear(CandidatePos, HalfExtent))
    {
        // Try offsetting perpendicular to street direction
        const FVector Perp(-Data.StreetDirection.Z, 0.f, Data.StreetDirection.X);
        for (float Offset = MinBuildingSpacing; Offset <= MinBuildingSpacing * 5.f; Offset += MinBuildingSpacing)
        {
            FVector TestPos = Data.Position + Perp * Offset;
            if (IsPositionClear(TestPos, HalfExtent))
            {
                CandidatePos = TestPos;
                break;
            }

            TestPos = Data.Position - Perp * Offset;
            if (IsPositionClear(TestPos, HalfExtent))
            {
                CandidatePos = TestPos;
                break;
            }
        }
    }

    Result.FinalPosition = CandidatePos;
    Result.bSuccess = true;

    // Record placement for future collision checks
    FBuildingPlacement Placed = Data;
    Placed.Position = Result.FinalPosition;
    Placed.Rotation = Result.FinalRotation;
    Placed.Scale = Result.FinalScale;
    PlacedBuildings.Add(Placed);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Placed building '%s' at (%.1f, %.1f, %.1f) zone %d"),
        *Data.BuildingId, Result.FinalPosition.X, Result.FinalPosition.Y, Result.FinalPosition.Z,
        static_cast<int32>(Data.Zone));

    return Result;
}

FRotator UBuildingPlacementSystem::AlignToStreet(FVector Position, FVector StreetDir)
{
    if (StreetDir.IsNearlyZero())
    {
        return FRotator::ZeroRotator;
    }

    // Face perpendicular to street direction (building facade faces the street)
    const FVector FacingDir(-StreetDir.Z, 0.f, StreetDir.X);
    return FacingDir.Rotation();
}

FVector UBuildingPlacementSystem::GetBuildingScale(EBuildingZone Zone)
{
    switch (Zone)
    {
    case EBuildingZone::Downtown:    return FVector(1.2f, 1.2f, 2.5f);
    case EBuildingZone::Commercial:  return FVector(1.1f, 1.1f, 1.5f);
    case EBuildingZone::Residential: return FVector(1.0f, 1.0f, 1.0f);
    case EBuildingZone::Industrial:  return FVector(1.5f, 1.5f, 1.2f);
    default:                         return FVector::OneVector;
    }
}

int32 UBuildingPlacementSystem::GetMaxFloors(EBuildingZone Zone)
{
    switch (Zone)
    {
    case EBuildingZone::Downtown:    return 8;
    case EBuildingZone::Commercial:  return 4;
    case EBuildingZone::Residential: return 3;
    case EBuildingZone::Industrial:  return 2;
    default:                         return 2;
    }
}

bool UBuildingPlacementSystem::IsPositionClear(FVector Position, FVector Extent) const
{
    for (const FBuildingPlacement& Existing : PlacedBuildings)
    {
        const float Dist = FVector::Dist(Existing.Position, Position);
        const float MinDist = Extent.GetMax() + MinBuildingSpacing;
        if (Dist < MinDist)
        {
            return false;
        }
    }
    return true;
}
