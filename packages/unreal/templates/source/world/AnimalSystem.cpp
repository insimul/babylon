#include "AnimalSystem.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AInsimulAnimal::AInsimulAnimal()
{
    PrimaryActorTick.bCanEverTick = true;
    Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);
}

void AInsimulAnimal::InitAnimal(EAnimalSpecies InSpecies, FVector InHome, int32 ColorSeed)
{
    Species = InSpecies;
    HomePosition = InHome;
    SetActorLocation(InHome);
    TargetPosition = InHome;

    switch (Species)
    {
    case EAnimalSpecies::Cat:
        MoveSpeed = 120.f;
        WanderRadius = 1500.f;
        BuildCatBody(ColorSeed);
        break;
    case EAnimalSpecies::Dog:
        MoveSpeed = 180.f;
        WanderRadius = 2000.f;
        BuildDogBody(ColorSeed);
        break;
    case EAnimalSpecies::Bird:
        MoveSpeed = 250.f;
        WanderRadius = 3000.f;
        FlightAltitude = FMath::RandRange(300.f, 800.f);
        BuildBirdBody(ColorSeed);
        break;
    }
}

void AInsimulAnimal::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    BehaviorTimer -= DeltaTime;

    if (bIsIdle)
    {
        if (BehaviorTimer <= 0.0f)
        {
            bIsIdle = false;
            PickNewTarget();
            BehaviorTimer = FMath::RandRange(5.0f, 15.0f);
        }
        return;
    }

    // Move toward target
    FVector Pos = GetActorLocation();
    FVector Dir = (TargetPosition - Pos);
    Dir.Z = 0.0f;
    float Dist = Dir.Size();

    if (Dist < 50.0f || BehaviorTimer <= 0.0f)
    {
        bIsIdle = true;
        BehaviorTimer = FMath::RandRange(2.0f, 8.0f);
        return;
    }

    Dir.Normalize();
    FVector NewPos = Pos + Dir * MoveSpeed * DeltaTime;

    // Birds maintain altitude
    if (Species == EAnimalSpecies::Bird)
    {
        NewPos.Z = HomePosition.Z + FlightAltitude;
    }

    SetActorLocation(NewPos);

    // Face movement direction
    if (Dir.SizeSquared2D() > 0.01f)
    {
        SetActorRotation(FRotator(0.f, FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X)), 0.f));
    }
}

void AInsimulAnimal::PickNewTarget()
{
    float Angle = FMath::RandRange(0.f, 360.f);
    float Dist = FMath::RandRange(200.f, WanderRadius);
    TargetPosition = HomePosition + FVector(
        FMath::Cos(FMath::DegreesToRadians(Angle)) * Dist,
        FMath::Sin(FMath::DegreesToRadians(Angle)) * Dist,
        0.0f
    );
}

// ─── Mesh assembly helpers ──────────────────────────────────────

static UStaticMeshComponent* AddBodyPart(AActor* Owner, USceneComponent* Parent,
    const FName& Name, UStaticMesh* Mesh, FVector Loc, FVector Scale, FLinearColor Color)
{
    UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Owner, Name);
    Comp->SetStaticMesh(Mesh);
    Comp->SetRelativeLocation(Loc);
    Comp->SetRelativeScale3D(Scale);
    Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Comp->SetupAttachment(Parent);

    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (BaseMat)
    {
        UMaterialInstanceDynamic* DM = UMaterialInstanceDynamic::Create(BaseMat, Comp);
        if (DM)
        {
            DM->SetVectorParameterValue(TEXT("Color"), Color);
            Comp->SetMaterial(0, DM);
        }
    }

    Comp->RegisterComponent();
    return Comp;
}

void AInsimulAnimal::BuildCatBody(int32 ColorSeed)
{
    UStaticMesh* Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    UStaticMesh* Cylinder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (!Sphere || !Cube || !Cylinder) return;

    // Cat color variants
    static const FLinearColor CatColors[] = {
        FLinearColor(0.2f, 0.2f, 0.2f),   // Black
        FLinearColor(0.7f, 0.45f, 0.2f),  // Orange
        FLinearColor(0.6f, 0.6f, 0.55f),  // Gray
        FLinearColor(0.85f, 0.8f, 0.7f),  // White/cream
    };
    FLinearColor BodyColor = CatColors[FMath::Abs(ColorSeed) % 4];

    // Body (elongated sphere)
    AddBodyPart(this, Root, TEXT("Body"), Sphere, FVector(0, 0, 25.f), FVector(0.35f, 0.2f, 0.18f), BodyColor);
    // Head
    AddBodyPart(this, Root, TEXT("Head"), Sphere, FVector(18.f, 0, 30.f), FVector(0.14f, 0.13f, 0.13f), BodyColor);
    // Ears (2 tiny cubes)
    AddBodyPart(this, Root, TEXT("EarL"), Cube, FVector(20.f, -5.f, 38.f), FVector(0.03f, 0.03f, 0.05f), BodyColor);
    AddBodyPart(this, Root, TEXT("EarR"), Cube, FVector(20.f, 5.f, 38.f), FVector(0.03f, 0.03f, 0.05f), BodyColor);
    // Tail (thin cylinder)
    AddBodyPart(this, Root, TEXT("Tail"), Cylinder, FVector(-22.f, 0, 30.f), FVector(0.025f, 0.025f, 0.2f),
        BodyColor);
}

void AInsimulAnimal::BuildDogBody(int32 ColorSeed)
{
    UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    UStaticMesh* Cylinder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (!Cube || !Cylinder) return;

    static const FLinearColor DogColors[] = {
        FLinearColor(0.45f, 0.3f, 0.15f),  // Brown
        FLinearColor(0.25f, 0.2f, 0.15f),  // Dark brown
        FLinearColor(0.7f, 0.65f, 0.55f),  // Golden
        FLinearColor(0.15f, 0.15f, 0.15f), // Black
    };
    FLinearColor BodyColor = DogColors[FMath::Abs(ColorSeed) % 4];

    // Body (box)
    AddBodyPart(this, Root, TEXT("Body"), Cube, FVector(0, 0, 35.f), FVector(0.4f, 0.2f, 0.22f), BodyColor);
    // Head (box)
    AddBodyPart(this, Root, TEXT("Head"), Cube, FVector(22.f, 0, 40.f), FVector(0.15f, 0.14f, 0.14f), BodyColor);
    // Snout
    AddBodyPart(this, Root, TEXT("Snout"), Cube, FVector(30.f, 0, 38.f), FVector(0.08f, 0.08f, 0.06f), BodyColor);
    // Legs (4 cylinders)
    AddBodyPart(this, Root, TEXT("LegFL"), Cylinder, FVector(12.f, -8.f, 15.f), FVector(0.04f, 0.04f, 0.18f), BodyColor);
    AddBodyPart(this, Root, TEXT("LegFR"), Cylinder, FVector(12.f, 8.f, 15.f), FVector(0.04f, 0.04f, 0.18f), BodyColor);
    AddBodyPart(this, Root, TEXT("LegBL"), Cylinder, FVector(-12.f, -8.f, 15.f), FVector(0.04f, 0.04f, 0.18f), BodyColor);
    AddBodyPart(this, Root, TEXT("LegBR"), Cylinder, FVector(-12.f, 8.f, 15.f), FVector(0.04f, 0.04f, 0.18f), BodyColor);
    // Tail
    AddBodyPart(this, Root, TEXT("Tail"), Cylinder, FVector(-22.f, 0, 42.f), FVector(0.025f, 0.025f, 0.15f), BodyColor);
}

void AInsimulAnimal::BuildBirdBody(int32 ColorSeed)
{
    UStaticMesh* Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (!Sphere || !Cube) return;

    static const FLinearColor BirdColors[] = {
        FLinearColor(0.2f, 0.2f, 0.6f),   // Blue
        FLinearColor(0.6f, 0.15f, 0.15f),  // Red
        FLinearColor(0.5f, 0.5f, 0.2f),    // Yellow-green
        FLinearColor(0.3f, 0.3f, 0.3f),    // Gray
    };
    FLinearColor BodyColor = BirdColors[FMath::Abs(ColorSeed) % 4];

    // Body (small elongated sphere)
    AddBodyPart(this, Root, TEXT("Body"), Sphere, FVector(0, 0, 0), FVector(0.12f, 0.08f, 0.08f), BodyColor);
    // Head
    AddBodyPart(this, Root, TEXT("Head"), Sphere, FVector(8.f, 0, 3.f), FVector(0.06f, 0.06f, 0.06f), BodyColor);
    // Beak
    AddBodyPart(this, Root, TEXT("Beak"), Cube, FVector(12.f, 0, 2.f), FVector(0.04f, 0.02f, 0.015f), FLinearColor(0.7f, 0.5f, 0.1f));
    // Wings (2 flat cubes)
    AddBodyPart(this, Root, TEXT("WingL"), Cube, FVector(-2.f, -8.f, 1.f), FVector(0.08f, 0.12f, 0.01f), BodyColor);
    AddBodyPart(this, Root, TEXT("WingR"), Cube, FVector(-2.f, 8.f, 1.f), FVector(0.08f, 0.12f, 0.01f), BodyColor);
}
