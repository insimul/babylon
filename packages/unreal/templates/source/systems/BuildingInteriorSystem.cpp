#include "BuildingInteriorSystem.h"
#include "../Core/InsimulMeshActor.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "UObject/ConstructorHelpers.h"

void UBuildingInteriorSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
}

void UBuildingInteriorSystem::EnterBuilding(const FString& BuildingId, const FString& BuildingRole,
                                             FVector DoorWorldPos, float BuildingWidth, float BuildingDepth,
                                             int32 Floors)
{
    if (bInsideBuilding) return;

    UWorld* World = GetWorld();
    if (!World) return;

    // Save overworld position
    APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
    if (!PC || !PC->GetPawn()) return;

    SavedOverworldPosition = PC->GetPawn()->GetActorLocation();
    SavedOverworldRotation = PC->GetPawn()->GetActorRotation();

    // Generate interior at offset position
    float FloorH = 300.0f; // 3m per floor
    float H = FloorH; // Interior is always 1 floor
    FVector InteriorCenter(DoorWorldPos.X, DoorWorldPos.Y, InteriorZOffset);

    ClearInterior();
    GenerateInteriorMeshes(InteriorCenter, BuildingWidth, BuildingDepth, H, BuildingRole);

    // Teleport player to interior door position
    FVector EntryPos = InteriorCenter + FVector(0, -BuildingDepth / 2.0 + 100.0, 100.0);
    PC->GetPawn()->SetActorLocation(EntryPos);
    PC->SetControlRotation(FRotator(0, 0, 0));

    bInsideBuilding = true;
    CurrentBuildingId = BuildingId;

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Entered building %s (role: %s)"), *BuildingId, *BuildingRole);
}

void UBuildingInteriorSystem::ExitBuilding()
{
    if (!bInsideBuilding) return;

    UWorld* World = GetWorld();
    if (!World) return;

    APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
    if (PC && PC->GetPawn())
    {
        PC->GetPawn()->SetActorLocation(SavedOverworldPosition);
        PC->SetControlRotation(SavedOverworldRotation);
    }

    ClearInterior();
    bInsideBuilding = false;
    CurrentBuildingId = FString();

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Exited building"));
}

void UBuildingInteriorSystem::ClearInterior()
{
    for (AActor* Actor : InteriorActors)
    {
        if (Actor) Actor->Destroy();
    }
    InteriorActors.Empty();
}

void UBuildingInteriorSystem::GenerateInteriorMeshes(FVector Center, float W, float D, float H,
                                                      const FString& BuildingRole)
{
    UWorld* World = GetWorld();
    if (!World) return;

    UStaticMesh* CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (!CubeMesh || !BaseMat) return;

    auto SpawnCube = [&](FVector Pos, FVector Scale, FLinearColor Color) -> AInsimulMeshActor*
    {
        FActorSpawnParameters Params;
        Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        AInsimulMeshActor* A = World->SpawnActor<AInsimulMeshActor>(
            AInsimulMeshActor::StaticClass(), Pos, FRotator::ZeroRotator, Params);
        if (!A) return nullptr;
        A->MeshComponent->SetStaticMesh(CubeMesh);
        A->SetActorScale3D(Scale);
        UMaterialInstanceDynamic* DM = UMaterialInstanceDynamic::Create(BaseMat, A);
        if (DM)
        {
            DM->SetVectorParameterValue(TEXT("Color"), Color);
            A->MeshComponent->SetMaterial(0, DM);
        }
        A->MeshComponent->SetVisibility(true);
        InteriorActors.Add(A);
        return A;
    };

    FLinearColor FloorColor(0.45f, 0.35f, 0.25f);  // Wood floor
    FLinearColor WallColor(0.75f, 0.7f, 0.65f);     // Plaster walls
    FLinearColor CeilingColor(0.8f, 0.78f, 0.75f);

    // Floor
    SpawnCube(Center, FVector(W / 100.0, D / 100.0, 0.05), FloorColor);

    // Ceiling
    SpawnCube(Center + FVector(0, 0, H), FVector(W / 100.0, D / 100.0, 0.05), CeilingColor);

    // Walls (4 sides)
    // Front wall (with door gap — split into two halves)
    float DoorW = 120.0f;
    float HalfFrontW = (W - DoorW) / 2.0f;
    SpawnCube(Center + FVector(-W / 2.0 + HalfFrontW / 2.0, -D / 2.0, H / 2.0),
              FVector(HalfFrontW / 100.0, 0.1, H / 100.0), WallColor);
    SpawnCube(Center + FVector(W / 2.0 - HalfFrontW / 2.0, -D / 2.0, H / 2.0),
              FVector(HalfFrontW / 100.0, 0.1, H / 100.0), WallColor);

    // Back wall
    SpawnCube(Center + FVector(0, D / 2.0, H / 2.0), FVector(W / 100.0, 0.1, H / 100.0), WallColor);

    // Left wall
    SpawnCube(Center + FVector(-W / 2.0, 0, H / 2.0), FVector(0.1, D / 100.0, H / 100.0), WallColor);

    // Right wall
    SpawnCube(Center + FVector(W / 2.0, 0, H / 2.0), FVector(0.1, D / 100.0, H / 100.0), WallColor);

    // Furniture based on building role
    TArray<FurnitureSpec> Furniture = GetFurnitureForRole(BuildingRole, W, D);
    for (const FurnitureSpec& F : Furniture)
    {
        SpawnCube(Center + F.RelativePos, F.Scale, F.Color);
    }

    // Interior light (bright point — use a visible sphere as light marker)
    SpawnCube(Center + FVector(0, 0, H - 30.0), FVector(0.3, 0.3, 0.1), FLinearColor(1.0f, 0.95f, 0.8f));

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Generated interior: %d furniture items"), Furniture.Num());
}

TArray<UBuildingInteriorSystem::FurnitureSpec> UBuildingInteriorSystem::GetFurnitureForRole(
    const FString& Role, float W, float D) const
{
    TArray<FurnitureSpec> Items;
    FString R = Role.ToLower();

    FLinearColor WoodColor(0.45f, 0.3f, 0.15f);
    FLinearColor DarkWood(0.3f, 0.2f, 0.1f);
    FLinearColor MetalColor(0.4f, 0.4f, 0.42f);
    FLinearColor FabricColor(0.5f, 0.3f, 0.2f);

    if (R.Contains(TEXT("tavern")) || R.Contains(TEXT("inn")))
    {
        // Bar counter
        Items.Add({ TEXT("counter"), FVector(0, D * 0.2f, 50.0f), FVector(W * 0.006f, 0.8f, 1.0f), DarkWood });
        // Tables (2)
        Items.Add({ TEXT("table"), FVector(-W * 0.25f, -D * 0.15f, 40.0f), FVector(1.0f, 1.0f, 0.8f), WoodColor });
        Items.Add({ TEXT("table"), FVector(W * 0.25f, -D * 0.15f, 40.0f), FVector(1.0f, 1.0f, 0.8f), WoodColor });
        // Stools
        Items.Add({ TEXT("stool"), FVector(-80.0f, D * 0.2f - 60.0f, 25.0f), FVector(0.35f, 0.35f, 0.5f), WoodColor });
        Items.Add({ TEXT("stool"), FVector(80.0f, D * 0.2f - 60.0f, 25.0f), FVector(0.35f, 0.35f, 0.5f), WoodColor });
    }
    else if (R.Contains(TEXT("blacksmith")) || R.Contains(TEXT("forge")))
    {
        // Anvil
        Items.Add({ TEXT("anvil"), FVector(0, 0, 40.0f), FVector(0.6f, 0.4f, 0.8f), MetalColor });
        // Workbench
        Items.Add({ TEXT("bench"), FVector(-W * 0.3f, D * 0.2f, 45.0f), FVector(1.5f, 0.6f, 0.9f), WoodColor });
        // Forge glow
        Items.Add({ TEXT("forge"), FVector(W * 0.3f, D * 0.3f, 30.0f), FVector(0.8f, 0.8f, 0.6f), FLinearColor(0.8f, 0.3f, 0.1f) });
    }
    else if (R.Contains(TEXT("shop")) || R.Contains(TEXT("market")) || R.Contains(TEXT("general")))
    {
        // Display counter
        Items.Add({ TEXT("counter"), FVector(0, D * 0.15f, 50.0f), FVector(W * 0.005f, 0.6f, 1.0f), WoodColor });
        // Shelves (2)
        Items.Add({ TEXT("shelf"), FVector(-W * 0.35f, D * 0.35f, 80.0f), FVector(0.15f, 0.6f, 1.6f), DarkWood });
        Items.Add({ TEXT("shelf"), FVector(W * 0.35f, D * 0.35f, 80.0f), FVector(0.15f, 0.6f, 1.6f), DarkWood });
    }
    else // Default: residence
    {
        // Bed
        Items.Add({ TEXT("bed"), FVector(W * 0.25f, D * 0.25f, 25.0f), FVector(1.0f, 2.0f, 0.5f), FabricColor });
        // Table
        Items.Add({ TEXT("table"), FVector(-W * 0.2f, -D * 0.15f, 40.0f), FVector(0.8f, 0.8f, 0.8f), WoodColor });
        // Chair
        Items.Add({ TEXT("chair"), FVector(-W * 0.2f, -D * 0.3f, 25.0f), FVector(0.4f, 0.4f, 0.85f), WoodColor });
    }

    return Items;
}
