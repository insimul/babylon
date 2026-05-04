#include "CreateLevelCommandlet.h"
#include "InsimulGameMode.h"
#include "InsimulMeshActor.h"
#include "../Characters/NPCCharacter.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "GameFramework/WorldSettings.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "UObject/ConstructorHelpers.h"
#include "HAL/FileManager.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

UCreateLevelCommandlet::UCreateLevelCommandlet()
{
    IsClient = false;
    IsEditor = true;
    IsServer = false;
    LogToConsole = true;
}

// Helper to load JSON array from Content/Data
static TArray<TSharedPtr<FJsonValue>> LoadJsonArrayFile(const FString& FileName)
{
    TArray<TSharedPtr<FJsonValue>> Arr;
    FString Path = FPaths::ProjectContentDir() / TEXT("Data") / FileName;
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path))
    {
        UE_LOG(LogTemp, Error, TEXT("[Commandlet] Failed to load JSON: %s"), *Path);
        return Arr;
    }
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    if (!FJsonSerializer::Deserialize(Reader, Arr))
    {
        UE_LOG(LogTemp, Error, TEXT("[Commandlet] Failed to parse JSON: %s"), *FileName);
    }
    return Arr;
}

// Helper to spawn colored mesh actor
static AInsimulMeshActor* SpawnColoredMesh(UWorld* World, UStaticMesh* Mesh, UMaterial* BaseMat,
    const FVector& Pos, const FVector& Scale, const FLinearColor& Color, const FRotator& Rot = FRotator::ZeroRotator)
{
    if (!World || !Mesh || !BaseMat) return nullptr;

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    AInsimulMeshActor* Actor = World->SpawnActor<AInsimulMeshActor>(AInsimulMeshActor::StaticClass(), Pos, Rot, Params);
    if (!Actor) return nullptr;

    Actor->MeshComponent->SetStaticMesh(Mesh);
    Actor->SetActorScale3D(Scale);
    Actor->MeshComponent->SetVisibility(true);
    Actor->MeshComponent->SetHiddenInGame(false);

    UMaterialInstanceDynamic* Mat = UMaterialInstanceDynamic::Create(BaseMat, Actor);
    if (Mat)
    {
        Mat->SetVectorParameterValue(TEXT("Color"), Color);
        Actor->MeshComponent->SetMaterial(0, Mat);
    }

    Actor->SetFlags(RF_Public);
    return Actor;
}

int32 UCreateLevelCommandlet::Main(const FString& Params)
{
    UE_LOG(LogTemp, Display, TEXT("[Insimul] ===== CreateLevel Commandlet ====="));

    // Load mesh assets
    UStaticMesh* CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    UStaticMesh* SphereMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UMaterial* BaseMaterial = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));

    if (!CubeMesh || !SphereMesh || !BaseMaterial)
    {
        UE_LOG(LogTemp, Error, TEXT("[Commandlet] Failed to load basic shape meshes!"));
        return 1;
    }

    FString MapPackageName = TEXT("/Game/Maps/MainWorld");
    FString FilePath = FPackageName::LongPackageNameToFilename(MapPackageName, FPackageName::GetMapPackageExtension());

    // Delete existing map
    if (IFileManager::Get().FileExists(*FilePath))
    {
        IFileManager::Get().Delete(*FilePath);
    }

    // Create package and world
    FString Dir = FPaths::GetPath(FilePath);
    IFileManager::Get().MakeDirectory(*Dir, true);

    UPackage* MapPackage = CreatePackage(*MapPackageName);
    MapPackage->FullyLoad();
    MapPackage->MarkPackageDirty();

    UWorld* NewWorld = UWorld::CreateWorld(EWorldType::Editor, false, FName(TEXT("MainWorld")), MapPackage);
    if (!NewWorld)
    {
        UE_LOG(LogTemp, Error, TEXT("[Commandlet] Failed to create world!"));
        return 1;
    }

    NewWorld->SetFlags(RF_Public);
    NewWorld->Rename(TEXT("MainWorld"), MapPackage);

    if (NewWorld->PersistentLevel)
    {
        NewWorld->PersistentLevel->SetFlags(RF_Public);
    }

    // Initialize world for spawning
    NewWorld->InitWorld();

    // Set WorldSettings GameMode
    AWorldSettings* Settings = NewWorld->GetWorldSettings();
    if (Settings)
    {
        Settings->DefaultGameMode = AInsimulGameMode::StaticClass();
        Settings->SetFlags(RF_Public);
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] WorldSettings.DefaultGameMode set"));
    }

    // ═══════════════════════════════════════════
    // SPAWN ALL GAME OBJECTS
    // ═══════════════════════════════════════════

    FVector WorldCenter = FVector::ZeroVector;

    // ── 1. SPAWN BUILDINGS ──
    TArray<TSharedPtr<FJsonValue>> Buildings = LoadJsonArrayFile(TEXT("DT_Buildings.json"));
    if (Buildings.Num() > 0)
    {
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawning %d buildings..."), Buildings.Num());

        double SumX = 0, SumY = 0;
        int32 Count = 0;

        for (const TSharedPtr<FJsonValue>& Val : Buildings)
        {
            const TSharedPtr<FJsonObject> Obj = Val->AsObject();
            if (!Obj.IsValid()) continue;

            const TSharedPtr<FJsonObject>* PosPtr;
            if (!Obj->TryGetObjectField(TEXT("Position"), PosPtr)) continue;

            double X = (*PosPtr)->GetNumberField(TEXT("X"));
            double Y = (*PosPtr)->GetNumberField(TEXT("Y"));
            double Z = (*PosPtr)->GetNumberField(TEXT("Z"));
            double Width = Obj->GetNumberField(TEXT("Width"));
            double Depth = Obj->GetNumberField(TEXT("Depth"));
            int32 Floors = Obj->GetIntegerField(TEXT("Floors"));
            double Height = Floors * 300.0; // 3m per floor

            FVector Pos(X, Y, Height / 2.0 + Z);
            FVector Scale(Width / 100.0, Depth / 100.0, Height / 100.0);
            FLinearColor Color(0.8f, 0.7f, 0.6f);

            AInsimulMeshActor* Building = SpawnColoredMesh(NewWorld, CubeMesh, BaseMaterial, Pos, Scale, Color);
            if (Building)
            {
                Building->SetActorLabel(FString::Printf(TEXT("Building_%d"), Count));
            }

            SumX += X;
            SumY += Y;
            Count++;
        }

        if (Count > 0)
        {
            WorldCenter = FVector(SumX / Count, SumY / Count, 0.0);
        }

        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned %d buildings — WorldCenter: %s"), Count, *WorldCenter.ToString());
    }

    // ── 2. SPAWN TERRAIN ──
    float HalfSize = 200000.f;
    FVector GroundPos = FVector(WorldCenter.X, WorldCenter.Y, -50.f);
    AInsimulMeshActor* Ground = SpawnColoredMesh(NewWorld, CubeMesh, BaseMaterial, GroundPos,
        FVector(HalfSize / 50.f, HalfSize / 50.f, 0.5f), FLinearColor(0.9f, 0.6f, 0.4f));
    if (Ground)
    {
        Ground->SetActorLabel(TEXT("Terrain"));
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned terrain at %s"), *GroundPos.ToString());
    }

    // ── 3. SPAWN LIGHTING ──
    FActorSpawnParameters LightParams;
    LightParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    // Directional Light
    AInsimulMeshActor* DirLightHost = NewWorld->SpawnActor<AInsimulMeshActor>(AInsimulMeshActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, LightParams);
    if (DirLightHost)
    {
        DirLightHost->SetActorLabel(TEXT("DirectionalLight"));
        UDirectionalLightComponent* DirLight = NewObject<UDirectionalLightComponent>(DirLightHost, TEXT("DirectionalLight"));
        DirLight->SetupAttachment(DirLightHost->GetRootComponent());
        DirLight->RegisterComponent();
        DirLight->SetIntensity(10000.f);
        DirLight->SetWorldRotation(FRotator(-45.f, 0.f, 0.f));
        DirLight->SetLightColor(FLinearColor(1.0f, 0.95f, 0.9f));
        DirLightHost->SetFlags(RF_Public);
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned directional light"));
    }

    // Sky Atmosphere + Sky Light
    AInsimulMeshActor* SkyHost = NewWorld->SpawnActor<AInsimulMeshActor>(AInsimulMeshActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, LightParams);
    if (SkyHost)
    {
        SkyHost->SetActorLabel(TEXT("SkyAtmosphere"));
        USkyAtmosphereComponent* SkyAtm = NewObject<USkyAtmosphereComponent>(SkyHost, TEXT("SkyAtmosphere"));
        SkyAtm->SetupAttachment(SkyHost->GetRootComponent());
        SkyAtm->RegisterComponent();

        USkyLightComponent* SkyLight = NewObject<USkyLightComponent>(SkyHost, TEXT("SkyLight"));
        SkyLight->SetupAttachment(SkyHost->GetRootComponent());
        SkyLight->RegisterComponent();
        SkyLight->SetIntensity(5.f);
        SkyLight->bRealTimeCapture = true;
        SkyLight->RecaptureSky();
        SkyHost->SetFlags(RF_Public);
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned sky atmosphere + sky light"));
    }

    // ── 4. SPAWN ROADS ──
    TArray<TSharedPtr<FJsonValue>> Roads = LoadJsonArrayFile(TEXT("DT_Roads.json"));
    if (Roads.Num() > 0)
    {
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawning road segments..."));
        int32 SegCount = 0;

        for (const TSharedPtr<FJsonValue>& Val : Roads)
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
                FVector RoadPos((AX + BX) / 2.0, (AY + BY) / 2.0, 5.0);
                FVector RoadScale(Len / 100.0, RoadWidth / 100.0, 0.1);
                FRotator RoadRot(0.f, (float)Angle, 0.f);

                AInsimulMeshActor* Road = SpawnColoredMesh(NewWorld, CubeMesh, BaseMaterial, RoadPos, RoadScale, FLinearColor(0.35f, 0.28f, 0.2f), RoadRot);
                if (Road)
                {
                    Road->SetActorLabel(FString::Printf(TEXT("Road_%d"), SegCount));
                }
                SegCount++;
            }
        }

        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned %d road segments"), SegCount);
    }

    // ── 5. SPAWN NPCs ──
    TArray<TSharedPtr<FJsonValue>> NPCs = LoadJsonArrayFile(TEXT("DT_NPCs.json"));
    if (NPCs.Num() > 0)
    {
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawning %d NPCs..."), NPCs.Num());

        for (int32 i = 0; i < NPCs.Num(); i++)
        {
            const TSharedPtr<FJsonObject> Obj = NPCs[i]->AsObject();
            if (!Obj.IsValid()) continue;

            double X = Obj->GetNumberField(TEXT("X"));
            double Y = Obj->GetNumberField(TEXT("Y"));
            FVector NPCPos(X, Y, 100.0);

            FActorSpawnParameters NPCParams;
            NPCParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

            ANPCCharacter* NPC = NewWorld->SpawnActor<ANPCCharacter>(ANPCCharacter::StaticClass(), NPCPos, FRotator::ZeroRotator, NPCParams);
            if (NPC)
            {
                NPC->SetActorLabel(FString::Printf(TEXT("NPC_%d"), i));
                NPC->SetFlags(RF_Public);
            }
        }

        UE_LOG(LogTemp, Display, TEXT("[Commandlet] Spawned %d NPCs"), NPCs.Num());
    }

    UE_LOG(LogTemp, Display, TEXT("[Commandlet] All game objects spawned into map"));

    // ═══════════════════════════════════════════
    // SAVE MAP
    // ═══════════════════════════════════════════

    FSavePackageArgs SaveArgs;
    SaveArgs.TopLevelFlags = RF_Public;
    bool bSaved = UPackage::SavePackage(MapPackage, NewWorld, *FilePath, SaveArgs);

    if (bSaved)
    {
        UE_LOG(LogTemp, Display, TEXT("[Commandlet] MainWorld saved successfully to: %s"), *FilePath);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("[Commandlet] Failed to save MainWorld to: %s"), *FilePath);
        return 1;
    }

    return 0;
}
