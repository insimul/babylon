#include "ProceduralTerrainGenerator.h"
#include "KismetProceduralMeshLibrary.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "UObject/ConstructorHelpers.h"

AProceduralTerrainGenerator::AProceduralTerrainGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    TerrainMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("TerrainMesh"));
    RootComponent = TerrainMesh;

    TerrainMesh->bUseComplexAsSimpleCollision = true;
    TerrainMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    TerrainMesh->SetCollisionResponseToAllChannels(ECR_Block);
}

void AProceduralTerrainGenerator::GenerateFromHeightmap(
    const TArray<float>& HeightmapData, int32 Resolution,
    float TerrainSizeCm, float ElevationScaleCm, FLinearColor GroundColor)
{
    if (HeightmapData.Num() != Resolution * Resolution)
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul Terrain] Heightmap size %d != Resolution^2 %d"),
            HeightmapData.Num(), Resolution * Resolution);
        return;
    }

    BuildMesh(HeightmapData, Resolution, TerrainSizeCm, ElevationScaleCm, GroundColor);
}

void AProceduralTerrainGenerator::GenerateFromJson(const TSharedPtr<FJsonObject>& TerrainJson)
{
    if (!TerrainJson.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul Terrain] Invalid terrain JSON"));
        return;
    }

    float SizeCm = TerrainJson->GetNumberField(TEXT("sizeUnreal"));

    // Parse ground color
    const TArray<TSharedPtr<FJsonValue>>* ColorArr;
    FLinearColor GroundColor = FLinearColor(0.3f, 0.5f, 0.2f); // default green
    if (TerrainJson->TryGetArrayField(TEXT("groundColorLinear"), ColorArr) && ColorArr->Num() >= 3)
    {
        GroundColor = FLinearColor(
            (*ColorArr)[0]->AsNumber(),
            (*ColorArr)[1]->AsNumber(),
            (*ColorArr)[2]->AsNumber());
    }

    // Parse heightmap 2D array into flat array
    const TArray<TSharedPtr<FJsonValue>>* RowsArr;
    if (!TerrainJson->TryGetArrayField(TEXT("heightmap"), RowsArr) || RowsArr->Num() == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul Terrain] No heightmap in JSON — generating flat terrain"));
        // Flat fallback
        TArray<float> FlatMap;
        FlatMap.Init(0.f, 16);
        BuildMesh(FlatMap, 4, SizeCm, ElevationScale, GroundColor);
        return;
    }

    int32 Resolution = RowsArr->Num();
    TArray<float> HeightmapData;
    HeightmapData.Reserve(Resolution * Resolution);

    for (int32 Row = 0; Row < Resolution; Row++)
    {
        const TArray<TSharedPtr<FJsonValue>>& Cols = (*RowsArr)[Row]->AsArray();
        for (int32 Col = 0; Col < Cols.Num(); Col++)
        {
            HeightmapData.Add(Cols[Col]->AsNumber());
        }
    }

    BuildMesh(HeightmapData, Resolution, SizeCm, ElevationScale, GroundColor);
}

void AProceduralTerrainGenerator::BuildMesh(
    const TArray<float>& HeightmapData, int32 Resolution,
    float TerrainSizeCm, float ElevationScaleCm, FLinearColor GroundColor)
{
    const int32 VertCount = Resolution * Resolution;
    const int32 QuadCount = (Resolution - 1) * (Resolution - 1);
    const float CellSize = TerrainSizeCm / (Resolution - 1);
    const float HalfSize = TerrainSizeCm / 2.f;

    TArray<FVector> Vertices;
    TArray<FVector2D> UVs;
    Vertices.Reserve(VertCount);
    UVs.Reserve(VertCount);

    // Generate vertices
    for (int32 Row = 0; Row < Resolution; Row++)
    {
        for (int32 Col = 0; Col < Resolution; Col++)
        {
            float X = Col * CellSize - HalfSize;
            float Y = Row * CellSize - HalfSize;
            float Z = HeightmapData[Row * Resolution + Col] * ElevationScaleCm;

            Vertices.Add(FVector(X, Y, Z));
            UVs.Add(FVector2D(
                static_cast<float>(Col) / (Resolution - 1),
                static_cast<float>(Row) / (Resolution - 1)));
        }
    }

    // Generate triangles (two per quad)
    TArray<int32> Triangles;
    Triangles.Reserve(QuadCount * 6);

    for (int32 Row = 0; Row < Resolution - 1; Row++)
    {
        for (int32 Col = 0; Col < Resolution - 1; Col++)
        {
            int32 BL = Row * Resolution + Col;
            int32 BR = BL + 1;
            int32 TL = BL + Resolution;
            int32 TR = TL + 1;

            // First triangle (BL, TL, BR)
            Triangles.Add(BL);
            Triangles.Add(TL);
            Triangles.Add(BR);

            // Second triangle (BR, TL, TR)
            Triangles.Add(BR);
            Triangles.Add(TL);
            Triangles.Add(TR);
        }
    }

    // Compute normals from cross products
    TArray<FVector> Normals;
    Normals.Init(FVector::ZeroVector, VertCount);

    for (int32 i = 0; i < Triangles.Num(); i += 3)
    {
        FVector V0 = Vertices[Triangles[i]];
        FVector V1 = Vertices[Triangles[i + 1]];
        FVector V2 = Vertices[Triangles[i + 2]];
        FVector Normal = FVector::CrossProduct(V1 - V0, V2 - V0).GetSafeNormal();

        Normals[Triangles[i]] += Normal;
        Normals[Triangles[i + 1]] += Normal;
        Normals[Triangles[i + 2]] += Normal;
    }

    // Normalise accumulated normals and compute vertex colors from slope
    TArray<FLinearColor> VertexColors;
    VertexColors.Reserve(VertCount);

    for (int32 i = 0; i < VertCount; i++)
    {
        Normals[i] = Normals[i].GetSafeNormal();
        float Slope = 1.f - FMath::Abs(Normals[i].Z); // 0 = flat, 1 = vertical
        FColor C = SlopeToVertexColor(Slope, GrassSlopeMax, RockSlopeMax);
        VertexColors.Add(FLinearColor(C));
    }

    // Build the procedural mesh section
    TArray<FProcMeshTangent> Tangents; // empty — UE will compute from normals + UVs
    TerrainMesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs,
        VertexColors, Tangents, true /* collision */);

    // Apply a simple colored material
    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr,
        TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (BaseMat)
    {
        UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(BaseMat, this);
        if (DynMat)
        {
            DynMat->SetVectorParameterValue(TEXT("Color"), GroundColor);
            TerrainMesh->SetMaterial(0, DynMat);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul Terrain] Built mesh: %d verts, %d tris, size %.0f cm, elevation scale %.0f cm"),
        VertCount, Triangles.Num() / 3, TerrainSizeCm, ElevationScaleCm);
}

FColor AProceduralTerrainGenerator::SlopeToVertexColor(float Slope, float GrassMax, float RockMax)
{
    // Encode slope region into vertex color channels for material blending:
    // R = cliff weight, G = grass weight, B = rock weight
    if (Slope < GrassMax)
    {
        return FColor(0, 255, 0); // Grass
    }
    else if (Slope < RockMax)
    {
        float T = (Slope - GrassMax) / (RockMax - GrassMax);
        uint8 Rock = FMath::Clamp(static_cast<int32>(T * 255), 0, 255);
        return FColor(0, 255 - Rock, Rock); // Blend grass→rock
    }
    else
    {
        float T = FMath::Clamp((Slope - RockMax) / (1.f - RockMax), 0.f, 1.f);
        uint8 Cliff = FMath::Clamp(static_cast<int32>(T * 255), 0, 255);
        return FColor(Cliff, 0, 255 - Cliff); // Blend rock→cliff
    }
}
