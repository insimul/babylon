#include "InsimulGameMode.h"
#include "InsimulMeshActor.h"
#include "InsimulGameInstance.h"
#include "InsimulPlayerController.h"
#include "../Characters/PlayerCharacter.h"
#include "../Characters/NPCCharacter.h"
#include "../Data/NPCData.h"
#include "../World/ProceduralTerrainGenerator.h"
#include "../World/ProceduralNatureGenerator.h"
#include "../World/AnimalSystem.h"
#include "../Systems/DayNightSystem.h"
#include "../Systems/WeatherSystem.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture2D.h"
#include "Kismet/GameplayStatics.h"
#include "Components/StaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "UObject/ConstructorHelpers.h"

AInsimulGameMode::AInsimulGameMode()
{
    PrimaryActorTick.bCanEverTick = true;
    PlayerControllerClass = AInsimulPlayerController::StaticClass();
    DefaultPawnClass = APlayerCharacter::StaticClass();

    static ConstructorHelpers::FObjectFinder<UStaticMesh> CF(TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (CF.Succeeded()) { CubeMesh = CF.Object; } else { UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load Cube mesh")); }

    static ConstructorHelpers::FObjectFinder<UStaticMesh> SF(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if (SF.Succeeded()) { SphereMesh = SF.Object; } else { UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load Sphere mesh")); }

    static ConstructorHelpers::FObjectFinder<UStaticMesh> CyF(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (CyF.Succeeded()) { CylinderMesh = CyF.Object; } else { UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load Cylinder mesh")); }

    static ConstructorHelpers::FObjectFinder<UMaterial> MF(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (MF.Succeeded()) { BaseMaterial = MF.Object; } else { UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load BasicShapeMaterial")); }

    // Load bundled ground texture (may fail if not imported as UAsset — that's OK, fallback color is used)
    static ConstructorHelpers::FObjectFinder<UTexture2D> GroundTexFinder(TEXT("/Game/Assets/ground/ground"));
    if (GroundTexFinder.Succeeded())
    {
        GroundTexture = GroundTexFinder.Object;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] ===== GameMode CONSTRUCTED ====="));
}

void AInsimulGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
    Super::InitGame(MapName, Options, ErrorMessage);
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] ===== InitGame — Map: %s ====="), *MapName);

    UInsimulGameInstance* GI = Cast<UInsimulGameInstance>(GetGameInstance());
    if (GI)
    {
        GI->LoadWorldData();
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] World loaded: %s (terrain: %d)"), *GI->WorldName, GI->TerrainSize);
    }
}

void AInsimulGameMode::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Mesh assets: Cube=%s Sphere=%s Cylinder=%s Mat=%s"),
        CubeMesh ? TEXT("OK") : TEXT("NULL"), SphereMesh ? TEXT("OK") : TEXT("NULL"),
        CylinderMesh ? TEXT("OK") : TEXT("NULL"), BaseMaterial ? TEXT("OK") : TEXT("NULL"));
}

void AInsimulGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    // Drive day/night and weather systems
    UGameInstance* GI = GetGameInstance();
    if (GI)
    {
        UDayNightSystem* DayNight = GI->GetSubsystem<UDayNightSystem>();
        if (DayNight) DayNight->UpdateCycle(DeltaSeconds);

        UWeatherSystem* Weather = GI->GetSubsystem<UWeatherSystem>();
        if (Weather) Weather->UpdateWeather(DeltaSeconds);
    }
}

void AInsimulGameMode::StartPlay()
{
    Super::StartPlay();
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] ===== StartPlay ====="));

    SpawnWorldEntities();

    // Teleport player to world center
    APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
    if (PC && PC->GetPawn())
    {
        FVector Dest = WorldCenter + FVector(0.0, 0.0, 300.0);
        PC->GetPawn()->SetActorLocation(Dest);
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Player teleported to %s"), *Dest.ToString());
    }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

TArray<TSharedPtr<FJsonValue>> AInsimulGameMode::LoadJsonArrayFile(const FString& FileName)
{
    TArray<TSharedPtr<FJsonValue>> Arr;
    FString Path = FPaths::ProjectContentDir() / TEXT("Data") / FileName;
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path)) return Arr;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    FJsonSerializer::Deserialize(Reader, Arr);
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Loaded %s — %d entries"), *FileName, Arr.Num());
    return Arr;
}

AInsimulMeshActor* AInsimulGameMode::SpawnColoredMesh(UStaticMesh* Mesh, FVector Location, FVector Scale,
                                                       FLinearColor Color, FRotator Rotation)
{
    if (!Mesh || !BaseMaterial) return nullptr;

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    AInsimulMeshActor* Actor = GetWorld()->SpawnActor<AInsimulMeshActor>(
        AInsimulMeshActor::StaticClass(), Location, Rotation, Params);
    if (!Actor) return nullptr;

    Actor->MeshComponent->SetStaticMesh(Mesh);
    Actor->SetActorScale3D(Scale);

    UMaterialInstanceDynamic* DM = UMaterialInstanceDynamic::Create(BaseMaterial, Actor);
    if (DM)
    {
        DM->SetVectorParameterValue(TEXT("Color"), Color);
        Actor->MeshComponent->SetMaterial(0, DM);
    }

    Actor->MeshComponent->SetVisibility(true);
    Actor->MeshComponent->SetHiddenInGame(false);
    Actor->SetActorHiddenInGame(false);
    return Actor;
}

UStaticMeshComponent* AInsimulGameMode::AttachColoredMesh(AActor* Parent, UStaticMesh* Mesh, FName Name,
                                                           FVector RelLoc, FVector Scale, FLinearColor Color,
                                                           FRotator Rot)
{
    if (!Parent || !Mesh || !BaseMaterial) return nullptr;

    UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Parent, Name);
    Comp->SetStaticMesh(Mesh);
    Comp->SetRelativeLocation(RelLoc);
    Comp->SetRelativeScale3D(Scale);
    Comp->SetRelativeRotation(Rot);
    Comp->SetupAttachment(Parent->GetRootComponent());

    UMaterialInstanceDynamic* DM = UMaterialInstanceDynamic::Create(BaseMaterial, Comp);
    if (DM)
    {
        DM->SetVectorParameterValue(TEXT("Color"), Color);
        Comp->SetMaterial(0, DM);
    }

    Comp->SetVisibility(true);
    Comp->SetHiddenInGame(false);
    Comp->RegisterComponent();
    return Comp;
}

// ═══════════════════════════════════════════════════════════════════
// Building style colors (matching Babylon.js STYLE_PRESETS)
// ═══════════════════════════════════════════════════════════════════

FLinearColor AInsimulGameMode::GetBuildingStyleColor(const FString& Role, const FString& Part)
{
    // Style lookup by role keywords
    FString R = Role.ToLower();

    // Wall colors
    if (Part == TEXT("wall"))
    {
        if (R.Contains(TEXT("tavern")) || R.Contains(TEXT("inn")) || R.Contains(TEXT("brewer")))
            return FLinearColor(0.55f, 0.35f, 0.2f);   // medieval_wood
        if (R.Contains(TEXT("blacksmith")) || R.Contains(TEXT("armory")) || R.Contains(TEXT("forge")))
            return FLinearColor(0.6f, 0.6f, 0.55f);    // medieval_stone
        if (R.Contains(TEXT("church")) || R.Contains(TEXT("temple")) || R.Contains(TEXT("chapel")))
            return FLinearColor(0.8f, 0.75f, 0.65f);   // stone
        if (R.Contains(TEXT("shop")) || R.Contains(TEXT("market")) || R.Contains(TEXT("general")))
            return FLinearColor(0.65f, 0.55f, 0.4f);   // colonial
        if (R.Contains(TEXT("residence")) || R.Contains(TEXT("house")) || R.Contains(TEXT("home")))
            return FLinearColor(0.7f, 0.5f, 0.3f);     // rustic_cottage
        if (R.Contains(TEXT("bakery")) || R.Contains(TEXT("cafe")))
            return FLinearColor(0.75f, 0.6f, 0.4f);    // warm wood
        return FLinearColor({{BASE_COLOR_R}}, {{BASE_COLOR_G}}, {{BASE_COLOR_B}});
    }

    // Roof colors
    if (Part == TEXT("roof"))
    {
        if (R.Contains(TEXT("tavern")) || R.Contains(TEXT("inn")) || R.Contains(TEXT("brewer")))
            return FLinearColor(0.3f, 0.2f, 0.15f);
        if (R.Contains(TEXT("blacksmith")) || R.Contains(TEXT("armory")) || R.Contains(TEXT("forge")))
            return FLinearColor(0.35f, 0.2f, 0.15f);
        if (R.Contains(TEXT("church")) || R.Contains(TEXT("temple")))
            return FLinearColor(0.35f, 0.3f, 0.25f);
        if (R.Contains(TEXT("residence")) || R.Contains(TEXT("house")) || R.Contains(TEXT("home")))
            return FLinearColor(0.5f, 0.35f, 0.2f);
        return FLinearColor({{ROOF_COLOR_R}}, {{ROOF_COLOR_G}}, {{ROOF_COLOR_B}});
    }

    // Window color — always light blue/white
    if (Part == TEXT("window"))
        return FLinearColor(0.7f, 0.8f, 0.9f);

    // Door color — wall color darkened
    if (Part == TEXT("door"))
    {
        FLinearColor Wall = GetBuildingStyleColor(Role, TEXT("wall"));
        return FLinearColor(Wall.R * 0.6f, Wall.G * 0.6f, Wall.B * 0.6f);
    }

    // Door frame — even darker
    if (Part == TEXT("frame"))
    {
        FLinearColor Wall = GetBuildingStyleColor(Role, TEXT("wall"));
        return FLinearColor(Wall.R * 0.4f, Wall.G * 0.4f, Wall.B * 0.4f);
    }

    return FLinearColor(0.5f, 0.5f, 0.5f);
}

// ═══════════════════════════════════════════════════════════════════
// Multi-part procedural building
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::BuildProceduralBuilding(AActor* Actor, int32 Floors, double W, double D, double Rot,
                                                const FString& BuildingRole, bool bChimney, bool bBalcony)
{
    if (!Actor) return;

    double H = Floors * 300.0; // 3m per floor in cm
    FLinearColor WallColor = GetBuildingStyleColor(BuildingRole, TEXT("wall"));
    FLinearColor RoofColor = GetBuildingStyleColor(BuildingRole, TEXT("roof"));
    FLinearColor WindowColor = GetBuildingStyleColor(BuildingRole, TEXT("window"));
    FLinearColor DoorColor = GetBuildingStyleColor(BuildingRole, TEXT("door"));
    FLinearColor FrameColor = GetBuildingStyleColor(BuildingRole, TEXT("frame"));

    // ── 0. Foundation (if building has elevation offset) ──
    // If the building's Z > 50cm, add a stone foundation base
    double BuildingZ = Actor->GetActorLocation().Z;
    if (BuildingZ > 50.0)
    {
        FLinearColor FoundationColor(0.45f, 0.42f, 0.4f); // Stone gray
        if (BuildingZ > 250.0)
        {
            // Stilts for large elevation gaps
            double StiltH = BuildingZ;
            double StiltSpacing = FMath::Min(W, D) * 0.35;
            for (int32 Si = 0; Si < 4; Si++)
            {
                double Sx = (Si % 2 == 0 ? -1.0 : 1.0) * StiltSpacing;
                double Sy = (Si < 2 ? -1.0 : 1.0) * StiltSpacing;
                AttachColoredMesh(Actor, CylinderMesh,
                    *FString::Printf(TEXT("Stilt_%d"), Si),
                    FVector(Sx, Sy, -StiltH / 2.0),
                    FVector(0.2, 0.2, StiltH / 100.0),
                    FoundationColor);
            }
        }
        else
        {
            // Solid stone base
            AttachColoredMesh(Actor, CubeMesh, TEXT("Foundation"),
                FVector(0, 0, -BuildingZ / 2.0),
                FVector(W / 100.0 * 1.05, D / 100.0 * 1.05, BuildingZ / 100.0),
                FoundationColor);
        }
    }

    // ── 1. Wall box (main structure) ──
    AttachColoredMesh(Actor, CubeMesh, TEXT("Wall"),
        FVector(0, 0, H / 2.0),
        FVector(W / 100.0, D / 100.0, H / 100.0),
        WallColor);

    // ── 2. Roof (3 variants: flat, hip, gable) ──
    FString R = BuildingRole.ToLower();
    bool bFlat = R.Contains(TEXT("modern")) || R.Contains(TEXT("futuristic")) || R.Contains(TEXT("warehouse"));
    bool bHip = R.Contains(TEXT("church")) || R.Contains(TEXT("temple")) || R.Contains(TEXT("shop")) || R.Contains(TEXT("market"));

    if (bFlat)
    {
        // Flat roof — thin slab slightly wider than building
        AttachColoredMesh(Actor, CubeMesh, TEXT("Roof"),
            FVector(0, 0, H + 15.0),
            FVector(W / 100.0 * 1.05, D / 100.0 * 1.05, 0.3),
            RoofColor);
    }
    else if (bHip)
    {
        // Hip roof — squashed sphere covering the building top
        double RoofDiamX = W / 100.0 * 0.65;
        double RoofDiamY = D / 100.0 * 0.65;
        AttachColoredMesh(Actor, SphereMesh, TEXT("RoofHip"),
            FVector(0, 0, H + 50.0),
            FVector(RoofDiamX, RoofDiamY, 1.5),
            RoofColor);
    }
    else
    {
        // Gable roof — two angled planes forming an inverted V
        double RoofH = 150.0;
        double HalfRoofH = RoofH / 2.0;

        AttachColoredMesh(Actor, CubeMesh, TEXT("RoofLeft"),
            FVector(0, -D / 4.0, H + HalfRoofH + 30.0),
            FVector(W / 100.0 * 1.08, D / 100.0 * 0.58, 0.15),
            RoofColor,
            FRotator(25.f, 0.f, 0.f));

        AttachColoredMesh(Actor, CubeMesh, TEXT("RoofRight"),
            FVector(0, D / 4.0, H + HalfRoofH + 30.0),
            FVector(W / 100.0 * 1.08, D / 100.0 * 0.58, 0.15),
            RoofColor,
            FRotator(-25.f, 0.f, 0.f));
    }

    // ── 3. Windows (front and back faces) ──
    int32 WindowsPerFloor = FMath::Max(1, (int32)(W / 300.0));
    double WindowW = 1.5;  // 150cm / 100
    double WindowH = 2.0;  // 200cm / 100

    for (int32 Floor = 0; Floor < Floors; Floor++)
    {
        double FloorCenterZ = Floor * 300.0 + 150.0; // Center of each floor

        for (int32 Wi = 0; Wi < WindowsPerFloor; Wi++)
        {
            double WinX = -W / 2.0 + (Wi + 1) * (W / (WindowsPerFloor + 1));

            // Front windows
            AttachColoredMesh(Actor, CubeMesh,
                *FString::Printf(TEXT("WinF_%d_%d"), Floor, Wi),
                FVector(WinX, D / 2.0 + 2.0, FloorCenterZ),
                FVector(WindowW, 0.05, WindowH),
                WindowColor);

            // Front window shutters (left and right)
            FLinearColor ShutterColor = FLinearColor(WallColor.R * 0.7f, WallColor.G * 0.7f, WallColor.B * 0.7f);
            AttachColoredMesh(Actor, CubeMesh,
                *FString::Printf(TEXT("ShLF_%d_%d"), Floor, Wi),
                FVector(WinX - 85.0, D / 2.0 + 4.0, FloorCenterZ),
                FVector(0.3, 0.08, WindowH + 0.2), ShutterColor);
            AttachColoredMesh(Actor, CubeMesh,
                *FString::Printf(TEXT("ShRF_%d_%d"), Floor, Wi),
                FVector(WinX + 85.0, D / 2.0 + 4.0, FloorCenterZ),
                FVector(0.3, 0.08, WindowH + 0.2), ShutterColor);

            // Back windows
            AttachColoredMesh(Actor, CubeMesh,
                *FString::Printf(TEXT("WinB_%d_%d"), Floor, Wi),
                FVector(WinX, -D / 2.0 - 2.0, FloorCenterZ),
                FVector(WindowW, 0.05, WindowH),
                WindowColor);
        }
    }

    // ── 4. Door (front face, ground level) ──
    double DoorW = 1.2;  // 120cm / 100
    double DoorH = 2.5;  // 250cm / 100
    AttachColoredMesh(Actor, CubeMesh, TEXT("Door"),
        FVector(0, D / 2.0 + 3.0, DoorH * 50.0),
        FVector(DoorW, 0.15, DoorH),
        DoorColor);

    // Door frame — left post
    AttachColoredMesh(Actor, CubeMesh, TEXT("FrameL"),
        FVector(-65.0, D / 2.0 + 3.0, DoorH * 50.0),
        FVector(0.12, 0.18, DoorH + 0.15),
        FrameColor);

    // Door frame — right post
    AttachColoredMesh(Actor, CubeMesh, TEXT("FrameR"),
        FVector(65.0, D / 2.0 + 3.0, DoorH * 50.0),
        FVector(0.12, 0.18, DoorH + 0.15),
        FrameColor);

    // Door frame — lintel
    AttachColoredMesh(Actor, CubeMesh, TEXT("FrameT"),
        FVector(0, D / 2.0 + 3.0, DoorH * 100.0 + 10.0),
        FVector(DoorW + 0.3, 0.18, 0.12),
        FrameColor);

    // Door handle (small metallic cube)
    AttachColoredMesh(Actor, CubeMesh, TEXT("Handle"),
        FVector(50.0, D / 2.0 + 10.0, 100.0),
        FVector(0.06, 0.06, 0.2),
        FLinearColor(0.7f, 0.65f, 0.4f));

    // ── 4b. Porch steps (3 small steps in front of door) ──
    for (int32 Step = 0; Step < 3; Step++)
    {
        double StepZ = Step * 15.0;
        double StepY = D / 2.0 + 30.0 + Step * 25.0;
        AttachColoredMesh(Actor, CubeMesh,
            *FString::Printf(TEXT("Step_%d"), Step),
            FVector(0, StepY, StepZ),
            FVector(DoorW + 0.5, 0.25, 0.15),
            FLinearColor(0.5f, 0.45f, 0.4f));
    }

    // ── 5. Chimney (optional) ──
    if (bChimney)
    {
        AttachColoredMesh(Actor, CubeMesh, TEXT("Chimney"),
            FVector(W * 0.3, -D * 0.3, H + 250.0),
            FVector(0.6, 0.6, 2.5),
            FLinearColor(0.4f, 0.35f, 0.3f));
    }

    // ── 6. Balcony (optional, 2+ floors) ──
    if (bBalcony && Floors >= 2)
    {
        double BalconyZ = 300.0; // Second floor level
        AttachColoredMesh(Actor, CubeMesh, TEXT("Balcony"),
            FVector(0, D / 2.0 + 80.0, BalconyZ),
            FVector(W / 100.0 * 0.6, 0.8, 0.1),
            FLinearColor(0.35f, 0.25f, 0.15f));

        // Balcony railing
        AttachColoredMesh(Actor, CubeMesh, TEXT("Railing"),
            FVector(0, D / 2.0 + 140.0, BalconyZ + 50.0),
            FVector(W / 100.0 * 0.6, 0.05, 0.5),
            FLinearColor(0.3f, 0.2f, 0.1f));
    }
}

// ═══════════════════════════════════════════════════════════════════
// World spawning
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnWorldEntities()
{
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] === SpawnWorldEntities START ==="));

    SpawnBuildings();
    SetupLighting();
    GenerateTerrain();
    SpawnRoads();
    SpawnNPCs();
    SpawnNature();
    SpawnWater();
    SpawnAnimals();
    SpawnItems();

    // Initialize day/night and weather subsystems with our light components
    UGameInstance* GI = GetGameInstance();
    if (GI)
    {
        UDayNightSystem* DayNight = GI->GetSubsystem<UDayNightSystem>();
        if (DayNight)
        {
            DayNight->SetLightComponents(SunLightComp, SkyLightComp);
        }

        UWeatherSystem* Weather = GI->GetSubsystem<UWeatherSystem>();
        if (Weather)
        {
            Weather->SetComponents(SunLightComp, SkyLightComp, FogComp);
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] === SpawnWorldEntities DONE — center %s ==="), *WorldCenter.ToString());
}

void AInsimulGameMode::SetupLighting()
{
    UWorld* World = GetWorld();
    if (!World) return;

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    // Directional sun light
    {
        AInsimulMeshActor* SunHost = World->SpawnActor<AInsimulMeshActor>(
            AInsimulMeshActor::StaticClass(), WorldCenter, FRotator::ZeroRotator, Params);
        if (SunHost)
        {
            SunHost->MeshComponent->SetVisibility(false);
            SunHost->MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);

            UDirectionalLightComponent* Sun = NewObject<UDirectionalLightComponent>(SunHost, TEXT("Sun"));
            Sun->SetupAttachment(SunHost->GetRootComponent());
            Sun->SetRelativeRotation(FRotator(-50.f, -30.f, 0.f));
            Sun->Intensity = 10000.f;
            Sun->LightColor = FColor(255, 244, 214);
            Sun->CastShadows = true;
            Sun->RegisterComponent();
            SunLightComp = Sun; // Store for day/night system
        }
    }

    // Sky atmosphere + sky light
    {
        AInsimulMeshActor* SkyHost = World->SpawnActor<AInsimulMeshActor>(
            AInsimulMeshActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
        if (SkyHost)
        {
            SkyHost->MeshComponent->SetVisibility(false);
            SkyHost->MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);

            USkyAtmosphereComponent* Atmo = NewObject<USkyAtmosphereComponent>(SkyHost, TEXT("Atmo"));
            Atmo->SetupAttachment(SkyHost->GetRootComponent());
            Atmo->RegisterComponent();

            USkyLightComponent* Sky = NewObject<USkyLightComponent>(SkyHost, TEXT("SkyLight"));
            Sky->SetupAttachment(SkyHost->GetRootComponent());
            Sky->SetIntensity(5.f);
            Sky->bRealTimeCapture = true;
            Sky->RegisterComponent();
            Sky->RecaptureSky();
            SkyLightComp = Sky; // Store for day/night system
        }
    }

    // Exponential height fog for weather system
    {
        AInsimulMeshActor* FogHost = World->SpawnActor<AInsimulMeshActor>(
            AInsimulMeshActor::StaticClass(), WorldCenter, FRotator::ZeroRotator, Params);
        if (FogHost)
        {
            FogHost->MeshComponent->SetVisibility(false);
            FogHost->MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);

            UExponentialHeightFogComponent* Fog = NewObject<UExponentialHeightFogComponent>(FogHost, TEXT("Fog"));
            Fog->SetupAttachment(FogHost->GetRootComponent());
            Fog->SetFogDensity(0.0002f);
            Fog->SetFogInscatteringColor(FLinearColor(0.5f, 0.55f, 0.6f));
            Fog->RegisterComponent();
            FogComp = Fog;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Lighting set up"));
}

void AInsimulGameMode::GenerateTerrain()
{
    FString LevelPath = FPaths::ProjectContentDir() / TEXT("Data/LevelDescriptor.json");
    FString LevelJson;
    TSharedPtr<FJsonObject> LevelObj;

    bool bHasHeightmap = false;
    if (FFileHelper::LoadFileToString(LevelJson, *LevelPath))
    {
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(LevelJson);
        if (FJsonSerializer::Deserialize(Reader, LevelObj) && LevelObj.IsValid())
        {
            const TSharedPtr<FJsonObject>* TerrainPtr;
            if (LevelObj->TryGetObjectField(TEXT("terrain"), TerrainPtr))
            {
                const TArray<TSharedPtr<FJsonValue>>* HmArr;
                if ((*TerrainPtr)->TryGetArrayField(TEXT("heightmap"), HmArr) && HmArr->Num() > 0)
                {
                    bHasHeightmap = true;
                }
            }
        }
    }

    if (bHasHeightmap)
    {
        FActorSpawnParameters Params;
        Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

        TerrainGenerator = GetWorld()->SpawnActor<AProceduralTerrainGenerator>(
            AProceduralTerrainGenerator::StaticClass(),
            FVector(WorldCenter.X, WorldCenter.Y, 0.f),
            FRotator::ZeroRotator, Params);

        if (TerrainGenerator)
        {
            const TSharedPtr<FJsonObject>* TerrainPtr;
            LevelObj->TryGetObjectField(TEXT("terrain"), TerrainPtr);
            TerrainGenerator->GenerateFromJson(*TerrainPtr);
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] Terrain generated from heightmap"));
        }
    }
    else
    {
        // Flat ground plane — natural green
        float HalfSize = 200000.f;
        FVector GroundPos = FVector(WorldCenter.X, WorldCenter.Y, -50.f);
        SpawnColoredMesh(CubeMesh, GroundPos,
            FVector(HalfSize / 50.f, HalfSize / 50.f, 0.5f),
            FLinearColor(0.35f, 0.55f, 0.25f));
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Flat green ground plane at %s"), *GroundPos.ToString());
    }
}

// ═══════════════════════════════════════════════════════════════════
// Buildings — multi-part procedural
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnBuildings()
{
    TArray<TSharedPtr<FJsonValue>> Arr = LoadJsonArrayFile(TEXT("DT_Buildings.json"));

    double SumX = 0, SumY = 0;
    int32 Count = 0;

    for (const TSharedPtr<FJsonValue>& Val : Arr)
    {
        const TSharedPtr<FJsonObject> Obj = Val->AsObject();
        if (!Obj.IsValid()) continue;

        const TSharedPtr<FJsonObject>* PosPtr;
        if (!Obj->TryGetObjectField(TEXT("Position"), PosPtr)) continue;

        double X  = (*PosPtr)->GetNumberField(TEXT("X"));
        double Y  = (*PosPtr)->GetNumberField(TEXT("Y"));
        double Z  = (*PosPtr)->GetNumberField(TEXT("Z"));
        double Rot = Obj->GetNumberField(TEXT("Rotation"));
        int32 Floors = FMath::Max(1, Obj->GetIntegerField(TEXT("Floors")));
        double W = Obj->GetNumberField(TEXT("Width"));
        double D = Obj->GetNumberField(TEXT("Depth"));
        FString BuildingRole = Obj->GetStringField(TEXT("BuildingRole"));
        bool bChimney = false;
        Obj->TryGetBoolField(TEXT("bHasChimney"), bChimney);
        bool bBalcony = false;
        Obj->TryGetBoolField(TEXT("bHasBalcony"), bBalcony);

        FString ModelKey = Obj->GetStringField(TEXT("ModelAssetKey"));
        bool bPlaced = false;

        // Try Blueprint override
        if (!ModelKey.IsEmpty() && BuildingBlueprintMap.Contains(ModelKey))
        {
            TSubclassOf<AActor> BPClass = BuildingBlueprintMap[ModelKey];
            if (BPClass)
            {
                FActorSpawnParameters BPParams;
                BPParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
                AActor* BPActor = GetWorld()->SpawnActor<AActor>(BPClass,
                    FVector(X, Y, Z), FRotator(0.f, FMath::RadiansToDegrees((float)Rot), 0.f), BPParams);
                if (BPActor)
                {
                    BPActor->SetActorLabel(FString::Printf(TEXT("Building_%d"), Count));
                    bPlaced = true;
                }
            }
        }

        if (!bPlaced)
        {
            // Procedural multi-part building
            FActorSpawnParameters Params;
            Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

            AInsimulMeshActor* BuildingActor = GetWorld()->SpawnActor<AInsimulMeshActor>(
                AInsimulMeshActor::StaticClass(),
                FVector(X, Y, Z),
                FRotator(0.f, FMath::RadiansToDegrees((float)Rot), 0.f),
                Params);

            if (BuildingActor)
            {
                // Hide the root mesh — children will be the visible parts
                BuildingActor->MeshComponent->SetVisibility(false);
                BuildingActor->MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
                BuildingActor->SetActorLabel(FString::Printf(TEXT("Building_%d"), Count));

                BuildProceduralBuilding(BuildingActor, Floors, W, D, Rot, BuildingRole, bChimney, bBalcony);
            }
        }

        // Cache for nature/items
        BuildingPositions.Add(FVector(X, Y, Z));
        BuildingRotations.Add(Rot);
        BuildingWidths.Add(W);
        BuildingDepths.Add(D);

        SumX += X;
        SumY += Y;
        Count++;
    }

    if (Count > 0)
    {
        WorldCenter = FVector(SumX / Count, SumY / Count, 0.0);
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d buildings — WorldCenter %s"), Count, *WorldCenter.ToString());
}

// ═══════════════════════════════════════════════════════════════════
// Roads — with center lines and sidewalks
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnRoads()
{
    TArray<TSharedPtr<FJsonValue>> Arr = LoadJsonArrayFile(TEXT("DT_Roads.json"));
    int32 SegCount = 0;

    FLinearColor RoadColor(0.3f, 0.28f, 0.25f);       // Dark asphalt
    FLinearColor CenterLineColor(0.58f, 0.53f, 0.25f); // Yellow center line
    FLinearColor SidewalkColor(0.55f, 0.54f, 0.5f);    // Concrete

    for (const TSharedPtr<FJsonValue>& Val : Arr)
    {
        const TSharedPtr<FJsonObject> Obj = Val->AsObject();
        if (!Obj.IsValid()) continue;

        double RoadWidth = Obj->GetNumberField(TEXT("Width"));

        const TArray<TSharedPtr<FJsonValue>>* WP;
        if (!Obj->TryGetArrayField(TEXT("Waypoints"), WP)) continue;

        for (int32 i = 0; i < WP->Num() - 1; i++)
        {
            const TSharedPtr<FJsonObject> A = (*WP)[i]->AsObject();
            const TSharedPtr<FJsonObject> B = (*WP)[i + 1]->AsObject();
            if (!A.IsValid() || !B.IsValid()) continue;

            double AX = A->GetNumberField(TEXT("X"));
            double AY = A->GetNumberField(TEXT("Y"));
            double BX = B->GetNumberField(TEXT("X"));
            double BY = B->GetNumberField(TEXT("Y"));

            double DX = BX - AX;
            double DY = BY - AY;
            double Len = FMath::Sqrt(DX * DX + DY * DY);
            if (Len < 1.0) continue;
            double Angle = FMath::RadiansToDegrees(FMath::Atan2(DY, DX));

            FVector MidPt((AX + BX) / 2.0, (AY + BY) / 2.0, 8.0);
            FRotator SegRot(0.f, (float)Angle, 0.f);

            // Road surface
            SpawnColoredMesh(CubeMesh, MidPt,
                FVector(Len / 100.0, RoadWidth / 100.0, 0.1),
                RoadColor, SegRot);

            // Center line (yellow dashed — thin cube on top)
            SpawnColoredMesh(CubeMesh,
                FVector(MidPt.X, MidPt.Y, 10.0),
                FVector(Len / 100.0, 0.15, 0.05),
                CenterLineColor, SegRot);

            // Sidewalks (left and right)
            double SidewalkW = 100.0; // 1m
            double PerpX = -DY / Len;
            double PerpY = DX / Len;
            double SidewalkOffset = RoadWidth / 2.0 + SidewalkW / 2.0 + 20.0;

            SpawnColoredMesh(CubeMesh,
                FVector(MidPt.X + PerpX * SidewalkOffset, MidPt.Y + PerpY * SidewalkOffset, 6.0),
                FVector(Len / 100.0, SidewalkW / 100.0, 0.12),
                SidewalkColor, SegRot);

            SpawnColoredMesh(CubeMesh,
                FVector(MidPt.X - PerpX * SidewalkOffset, MidPt.Y - PerpY * SidewalkOffset, 6.0),
                FVector(Len / 100.0, SidewalkW / 100.0, 0.12),
                SidewalkColor, SegRot);

            // Cache road segment for nature avoidance
            RoadSegments.Add(TPair<FVector, FVector>(FVector(AX, AY, 0), FVector(BX, BY, 0)));
            SegCount++;
        }
    }

    // ── Crosswalks at road endpoints ──
    for (const auto& Seg : RoadSegments)
    {
        FVector Dir = (Seg.Value - Seg.Key).GetSafeNormal2D();
        double Angle = FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X));
        FLinearColor CrosswalkColor(0.85f, 0.85f, 0.82f); // White

        // 4 stripes at each endpoint
        for (int32 S = 0; S < 4; S++)
        {
            double Offset = (S - 1.5) * 30.0;
            // Start endpoint
            SpawnColoredMesh(CubeMesh,
                FVector(Seg.Key.X + Dir.Y * Offset, Seg.Key.Y - Dir.X * Offset, 11.0),
                FVector(0.6, 0.08, 0.03),
                CrosswalkColor, FRotator(0.f, (float)Angle + 90.f, 0.f));
        }
    }

    // ── Street lights along roads ──
    int32 LightCount = 0;
    FLinearColor LampPostColor(0.3f, 0.3f, 0.32f); // Metal gray
    FLinearColor LampGlowColor(1.0f, 0.9f, 0.6f);  // Warm yellow

    for (int32 i = 0; i < RoadSegments.Num(); i += 3) // Every 3rd segment
    {
        const auto& Seg = RoadSegments[i];
        FVector Mid = (Seg.Key + Seg.Value) * 0.5f;
        FVector Dir = (Seg.Value - Seg.Key).GetSafeNormal2D();
        double PerpX = -Dir.Y;
        double PerpY = Dir.X;

        // Lamp post on right side of road
        FVector PostPos(Mid.X + PerpX * 600.0, Mid.Y + PerpY * 600.0, 0.0);

        // Post (tall thin cylinder)
        SpawnColoredMesh(CylinderMesh, PostPos + FVector(0, 0, 200.0),
            FVector(0.12, 0.12, 4.0), LampPostColor);

        // Lamp head (small cube at top)
        SpawnColoredMesh(CubeMesh, PostPos + FVector(0, 0, 420.0),
            FVector(0.35, 0.35, 0.2), LampGlowColor);

        LightCount++;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d road segments, %d street lights"), SegCount, LightCount);
}

// ═══════════════════════════════════════════════════════════════════
// NPCs — spawn from DT_NPCs.json, fallback to DT_Characters.json
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnNPCs()
{
    TArray<TSharedPtr<FJsonValue>> Arr = LoadJsonArrayFile(TEXT("DT_NPCs.json"));

    // If no dedicated NPCs, fall back to characters data
    if (Arr.Num() == 0 && BuildingPositions.Num() > 0)
    {
        TArray<TSharedPtr<FJsonValue>> CharArr = LoadJsonArrayFile(TEXT("DT_Characters.json"));
        if (CharArr.Num() > 0)
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] No NPCs found — spawning %d characters as NPCs"), CharArr.Num());

            int32 Spawned = 0;
            FRandomStream Rng(42);

            for (const TSharedPtr<FJsonValue>& Val : CharArr)
            {
                const TSharedPtr<FJsonObject> Obj = Val->AsObject();
                if (!Obj.IsValid()) continue;

                FString CharId = Obj->GetStringField(TEXT("CharacterId"));
                if (CharId.IsEmpty()) CharId = Obj->GetStringField(TEXT("Name"));
                FString CharRole = Obj->GetStringField(TEXT("Role"));
                if (CharRole.IsEmpty()) CharRole = Obj->GetStringField(TEXT("Occupation"));

                // Place near a random building
                int32 BldgIdx = Rng.RandRange(0, BuildingPositions.Num() - 1);
                FVector SpawnLoc = BuildingPositions[BldgIdx] + FVector(Rng.FRandRange(-300.f, 300.f), Rng.FRandRange(-300.f, 300.f), 100.0);

                FActorSpawnParameters Params;
                Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

                TSubclassOf<ANPCCharacter> NPCClass = NPCBlueprintClass
                    ? NPCBlueprintClass
                    : TSubclassOf<ANPCCharacter>(ANPCCharacter::StaticClass());
                ANPCCharacter* NPC = GetWorld()->SpawnActor<ANPCCharacter>(NPCClass, SpawnLoc, FRotator::ZeroRotator, Params);
                if (NPC)
                {
                    NPC->InitFromData(CharId, CharRole, BuildingPositions[BldgIdx], 500.f, 0.5f);
                    Spawned++;
                }
            }

            UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d character-NPCs"), Spawned);
            return;
        }
    }

    // Standard NPC spawning from DT_NPCs.json
    int32 Spawned = 0;
    for (const TSharedPtr<FJsonValue>& Val : Arr)
    {
        const TSharedPtr<FJsonObject> Obj = Val->AsObject();
        if (!Obj.IsValid()) continue;

        FString CharId = Obj->GetStringField(TEXT("CharacterId"));
        FString CharRole = Obj->GetStringField(TEXT("Role"));
        double Patrol  = Obj->GetNumberField(TEXT("PatrolRadius"));
        double Disp    = Obj->GetNumberField(TEXT("Disposition"));

        const TSharedPtr<FJsonObject>* PosPtr;
        if (!Obj->TryGetObjectField(TEXT("HomePosition"), PosPtr)) continue;

        double X = (*PosPtr)->GetNumberField(TEXT("X"));
        double Y = (*PosPtr)->GetNumberField(TEXT("Y"));
        double Z = (*PosPtr)->GetNumberField(TEXT("Z"));

        FActorSpawnParameters Params;
        Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

        TSubclassOf<ANPCCharacter> NPCClass = NPCBlueprintClass
            ? NPCBlueprintClass
            : TSubclassOf<ANPCCharacter>(ANPCCharacter::StaticClass());
        ANPCCharacter* NPC = GetWorld()->SpawnActor<ANPCCharacter>(
            NPCClass, FVector(X, Y, Z + 100.0), FRotator::ZeroRotator, Params);

        if (NPC)
        {
            NPC->InitFromData(CharId, CharRole, FVector(X, Y, Z), (float)Patrol, (float)Disp);

            // Parse schedule
            const TSharedPtr<FJsonObject>* SchedPtr;
            if (Obj->TryGetObjectField(TEXT("Schedule"), SchedPtr) && SchedPtr->IsValid())
            {
                FNPCSchedule Sched;
                Sched.HomeBuildingId = (*SchedPtr)->GetStringField(TEXT("homeBuildingId"));
                Sched.WorkBuildingId = (*SchedPtr)->GetStringField(TEXT("workBuildingId"));
                Sched.WakeHour = (float)(*SchedPtr)->GetNumberField(TEXT("wakeHour"));
                Sched.BedtimeHour = (float)(*SchedPtr)->GetNumberField(TEXT("bedtimeHour"));

                const TArray<TSharedPtr<FJsonValue>>* BlockArr;
                if ((*SchedPtr)->TryGetArrayField(TEXT("blocks"), BlockArr))
                {
                    for (const auto& BV : *BlockArr)
                    {
                        const TSharedPtr<FJsonObject> BO = BV->AsObject();
                        if (!BO.IsValid()) continue;

                        FScheduleBlock Block;
                        Block.StartHour = (float)BO->GetNumberField(TEXT("startHour"));
                        Block.EndHour = (float)BO->GetNumberField(TEXT("endHour"));
                        Block.Priority = BO->GetIntegerField(TEXT("priority"));
                        Block.BuildingId = BO->GetStringField(TEXT("buildingId"));

                        FString ActivityStr = BO->GetStringField(TEXT("activity"));
                        if (ActivityStr == TEXT("sleep")) Block.Activity = EScheduleActivity::Sleep;
                        else if (ActivityStr == TEXT("work")) Block.Activity = EScheduleActivity::Work;
                        else if (ActivityStr == TEXT("eat")) Block.Activity = EScheduleActivity::Eat;
                        else if (ActivityStr == TEXT("socialize")) Block.Activity = EScheduleActivity::Socialize;
                        else if (ActivityStr == TEXT("shop")) Block.Activity = EScheduleActivity::Shop;
                        else if (ActivityStr == TEXT("wander")) Block.Activity = EScheduleActivity::Wander;
                        else if (ActivityStr == TEXT("idle_at_home")) Block.Activity = EScheduleActivity::IdleAtHome;
                        else if (ActivityStr == TEXT("visit_friend")) Block.Activity = EScheduleActivity::VisitFriend;

                        Sched.Blocks.Add(Block);
                    }
                }

                NPC->SetSchedule(Sched);
            }

            Spawned++;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d NPCs"), Spawned);
}

// ═══════════════════════════════════════════════════════════════════
// Nature — trees and rocks via instanced meshes
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnNature()
{
    if (BuildingPositions.Num() == 0) return;

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    AProceduralNatureGenerator* NatureGen = GetWorld()->SpawnActor<AProceduralNatureGenerator>(
        AProceduralNatureGenerator::StaticClass(), WorldCenter, FRotator::ZeroRotator, Params);

    if (NatureGen)
    {
        NatureGen->GenerateNature(51200, 42, BuildingPositions, RoadSegments, WorldCenter);
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Nature generation complete"));
    }
}

// ═══════════════════════════════════════════════════════════════════
// Items — small colored boxes near buildings
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnItems()
{
    TArray<TSharedPtr<FJsonValue>> Arr = LoadJsonArrayFile(TEXT("DT_Items.json"));
    if (Arr.Num() == 0 || BuildingPositions.Num() == 0) return;

    FRandomStream Rng(123);
    int32 Spawned = 0;
    int32 MaxItems = FMath::Min(50, Arr.Num()); // Cap to avoid flooding

    for (int32 i = 0; i < MaxItems; i++)
    {
        const TSharedPtr<FJsonObject> Obj = Arr[i]->AsObject();
        if (!Obj.IsValid()) continue;

        FString ItemType = Obj->GetStringField(TEXT("ItemType"));
        if (ItemType.IsEmpty()) ItemType = Obj->GetStringField(TEXT("type"));

        // Determine color by item type
        FLinearColor Color(0.5f, 0.45f, 0.4f); // default neutral
        if (ItemType.Contains(TEXT("food")) || ItemType.Contains(TEXT("drink")))
            Color = FLinearColor(0.7f, 0.5f, 0.2f);
        else if (ItemType.Contains(TEXT("weapon")) || ItemType.Contains(TEXT("sword")) || ItemType.Contains(TEXT("bow")))
            Color = FLinearColor(0.5f, 0.5f, 0.55f);
        else if (ItemType.Contains(TEXT("quest")))
            Color = FLinearColor(0.3f, 0.6f, 0.7f);
        else if (ItemType.Contains(TEXT("tool")))
            Color = FLinearColor(0.4f, 0.35f, 0.3f);
        else if (ItemType.Contains(TEXT("key")))
            Color = FLinearColor(0.7f, 0.65f, 0.2f);
        else if (ItemType.Contains(TEXT("armor")) || ItemType.Contains(TEXT("shield")))
            Color = FLinearColor(0.45f, 0.4f, 0.35f);

        // Place near a random building entrance
        int32 BldgIdx = Rng.RandRange(0, BuildingPositions.Num() - 1);
        FVector BldgPos = BuildingPositions[BldgIdx];
        double BldgRot = BuildingRotations[BldgIdx];
        double BldgD = BuildingDepths.IsValidIndex(BldgIdx) ? BuildingDepths[BldgIdx] : 500.0;

        // Offset to building front + random lateral
        double FrontOffset = BldgD / 2.0 + 200.0;
        double LateralOffset = Rng.FRandRange(-300.f, 300.f);

        double CosR = FMath::Cos(BldgRot);
        double SinR = FMath::Sin(BldgRot);
        FVector ItemPos(
            BldgPos.X + CosR * LateralOffset + SinR * FrontOffset,
            BldgPos.Y + SinR * LateralOffset - CosR * FrontOffset,
            BldgPos.Z + 15.0 // slightly above ground
        );

        AInsimulMeshActor* ItemActor = SpawnColoredMesh(CubeMesh, ItemPos, FVector(0.35, 0.35, 0.35), Color);
        if (ItemActor)
        {
            FString ItemId = Obj->GetStringField(TEXT("ItemId"));
            FString ItemName = Obj->GetStringField(TEXT("ItemName"));
            if (ItemName.IsEmpty()) ItemName = Obj->GetStringField(TEXT("Name"));
            ItemActor->SetActorLabel(FString::Printf(TEXT("Item_%s"), *ItemId));
            ItemActor->Tags.Add(TEXT("Pickup"));
            ItemActor->Tags.Add(*ItemType);
            ItemActor->Tags.Add(*ItemId);
        }
        Spawned++;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d items near buildings"), Spawned);
}

// ═══════════════════════════════════════════════════════════════════
// Water — spawn from DT_WaterFeatures.json
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnWater()
{
    TArray<TSharedPtr<FJsonValue>> Arr = LoadJsonArrayFile(TEXT("DT_WaterFeatures.json"));
    if (Arr.Num() == 0) return;

    int32 Spawned = 0;

    for (const TSharedPtr<FJsonValue>& Val : Arr)
    {
        const TSharedPtr<FJsonObject> Obj = Val->AsObject();
        if (!Obj.IsValid()) continue;

        FString WaterType = Obj->GetStringField(TEXT("WaterType"));
        double WaterLevel = Obj->GetNumberField(TEXT("WaterLevel"));
        double Width = Obj->GetNumberField(TEXT("Width"));
        double Depth = Obj->GetNumberField(TEXT("Depth"));

        const TSharedPtr<FJsonObject>* PosPtr;
        double X = WorldCenter.X, Y = WorldCenter.Y;
        if (Obj->TryGetObjectField(TEXT("Position"), PosPtr))
        {
            X = (*PosPtr)->GetNumberField(TEXT("X"));
            Y = (*PosPtr)->GetNumberField(TEXT("Y"));
        }

        // Color by water type (matching Babylon.js WaterRenderer configs)
        FLinearColor WaterColor(0.15f, 0.35f, 0.55f); // Default lake blue
        if (WaterType == TEXT("ocean"))       WaterColor = FLinearColor(0.05f, 0.2f, 0.45f);
        else if (WaterType == TEXT("pond"))   WaterColor = FLinearColor(0.12f, 0.3f, 0.42f);
        else if (WaterType == TEXT("marsh"))  WaterColor = FLinearColor(0.15f, 0.25f, 0.2f);
        else if (WaterType == TEXT("stream")) WaterColor = FLinearColor(0.18f, 0.4f, 0.58f);

        // Size based on type
        double SizeX = FMath::Max(Width, 500.0);
        double SizeY = FMath::Max(Width, 500.0);
        if (WaterType == TEXT("ocean")) { SizeX = 100000.0; SizeY = 100000.0; }
        else if (WaterType == TEXT("river") || WaterType == TEXT("stream") || WaterType == TEXT("canal"))
        {
            SizeX = FMath::Max(Width, 300.0);
            SizeY = SizeX * 5.0; // elongated
        }

        SpawnColoredMesh(CubeMesh,
            FVector(X, Y, WaterLevel),
            FVector(SizeX / 100.0, SizeY / 100.0, 0.05),
            WaterColor);

        Spawned++;
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d water features"), Spawned);
}

// ═══════════════════════════════════════════════════════════════════
// Animals — ambient cats, dogs, birds
// ═══════════════════════════════════════════════════════════════════

void AInsimulGameMode::SpawnAnimals()
{
    if (BuildingPositions.Num() == 0) return;

    FRandomStream Rng(777);
    int32 Spawned = 0;
    int32 AnimalCount = FMath::Clamp(BuildingPositions.Num() / 2, 3, 12);

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    for (int32 i = 0; i < AnimalCount; i++)
    {
        // Pick a random building to place near
        int32 BldgIdx = Rng.RandRange(0, BuildingPositions.Num() - 1);
        FVector NearBuilding = BuildingPositions[BldgIdx];

        // Random offset from building
        FVector SpawnPos = NearBuilding + FVector(
            Rng.FRandRange(-500.f, 500.f),
            Rng.FRandRange(-500.f, 500.f),
            0.0f
        );

        // Pick species: 40% cat, 35% dog, 25% bird
        float Roll = Rng.FRand();
        EAnimalSpecies Species;
        if (Roll < 0.4f) Species = EAnimalSpecies::Cat;
        else if (Roll < 0.75f) Species = EAnimalSpecies::Dog;
        else Species = EAnimalSpecies::Bird;

        AInsimulAnimal* Animal = GetWorld()->SpawnActor<AInsimulAnimal>(
            AInsimulAnimal::StaticClass(), SpawnPos, FRotator::ZeroRotator, Params);

        if (Animal)
        {
            Animal->InitAnimal(Species, SpawnPos, i);
            Spawned++;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] Spawned %d ambient animals"), Spawned);
}
