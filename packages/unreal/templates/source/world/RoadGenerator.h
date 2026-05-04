#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RoadGenerator.generated.h"

UCLASS()
class INSIMULEXPORT_API ARoadGenerator : public AActor
{
    GENERATED_BODY()

public:
    ARoadGenerator();

    UFUNCTION(BlueprintCallable, Category = "Roads")
    void GenerateRoad(const TArray<FVector>& Waypoints, float Width);

    /** Create a street name sign oriented parallel to the street direction. Double-sided. */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    void CreateStreetSign(FVector Position, const FString& StreetName, FVector StreetDirection);

    /** Generate a sidewalk along the street-facing edge of a lot. */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    void GenerateLotSidewalks(FVector LotCenter, FVector LotSize, FVector StreetDirection);

    /** Returns true if the given point is within the threshold distance of any road. */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    bool IsPointOnRoad(FVector Point, float Threshold = 100.f) const;

    /** Interpolate a position along a polyline at a given distance from the start. */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    static FVector InterpolatePolyline(const TArray<FVector>& Waypoints, float Distance);

    /** Calculate the total length of a polyline path. */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    static float PolylineLength(const TArray<FVector>& Waypoints);

    /** Generate inter-settlement roads using a minimum spanning tree (Kruskal's algorithm). */
    UFUNCTION(BlueprintCallable, Category = "Roads")
    void GenerateSettlementRoads(const TArray<FVector>& SettlementCenters, float DefaultWidth);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Style")
    FLinearColor RoadColor = FLinearColor({{ROAD_COLOR_R}}, {{ROAD_COLOR_G}}, {{ROAD_COLOR_B}});

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Style")
    float RoadRadius = {{ROAD_RADIUS}};

    /** Height offset above terrain to prevent z-fighting on slopes. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Style")
    float RoadElevation = 0.5f;

private:
    /** Road segment storage for point-on-road queries. */
    TArray<TPair<FVector, FVector>> StoredRoadSegments;
};
