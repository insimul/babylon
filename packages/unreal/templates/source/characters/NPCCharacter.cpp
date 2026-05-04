#include "NPCCharacter.h"
#include "InsimulAnimInstance.h"
#include "../Core/InsimulPlayerController.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/SkeletalMesh.h"
#include "UObject/ConstructorHelpers.h"

ANPCCharacter::ANPCCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCharacterMovement()->MaxWalkSpeed = 200.f;
    AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;

    GetCapsuleComponent()->InitCapsuleSize(34.f, 88.f);

    VisualMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("VisualMesh"));
    VisualMesh->SetupAttachment(GetMesh());
    VisualMesh->SetRelativeLocation(FVector(0.f, 0.f, -88.f));
    VisualMesh->SetVisibility(false);

    // Load primitive meshes for procedural body
    static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

    UStaticMesh* SM_Sphere = SphereFinder.Succeeded() ? SphereFinder.Object : nullptr;
    UStaticMesh* SM_Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
    UStaticMesh* SM_Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;

    // Proportions (average body type from Babylon.js, in cm relative to capsule center)
    // Capsule half-height is 88, so center is 0, bottom is -88

    HeadMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Head"));
    HeadMesh->SetupAttachment(RootComponent);
    if (SM_Sphere) HeadMesh->SetStaticMesh(SM_Sphere);
    HeadMesh->SetRelativeLocation(FVector(0, 0, 55.f));
    HeadMesh->SetRelativeScale3D(FVector(0.34f, 0.34f, 0.34f));
    HeadMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    TorsoMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Torso"));
    TorsoMesh->SetupAttachment(RootComponent);
    if (SM_Cube) TorsoMesh->SetStaticMesh(SM_Cube);
    TorsoMesh->SetRelativeLocation(FVector(0, 0, 22.f));
    TorsoMesh->SetRelativeScale3D(FVector(0.38f, 0.20f, 0.52f));
    TorsoMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    float ShoulderZ = 44.f;
    float ArmX = 24.f;

    UpperArmL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperArmL"));
    UpperArmL->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperArmL->SetStaticMesh(SM_Cylinder);
    UpperArmL->SetRelativeLocation(FVector(0, -ArmX, ShoulderZ - 15.f));
    UpperArmL->SetRelativeScale3D(FVector(0.11f, 0.11f, 0.28f));
    UpperArmL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    UpperArmR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperArmR"));
    UpperArmR->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperArmR->SetStaticMesh(SM_Cylinder);
    UpperArmR->SetRelativeLocation(FVector(0, ArmX, ShoulderZ - 15.f));
    UpperArmR->SetRelativeScale3D(FVector(0.11f, 0.11f, 0.28f));
    UpperArmR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerArmL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerArmL"));
    LowerArmL->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerArmL->SetStaticMesh(SM_Cylinder);
    LowerArmL->SetRelativeLocation(FVector(0, -ArmX, ShoulderZ - 42.f));
    LowerArmL->SetRelativeScale3D(FVector(0.09f, 0.09f, 0.26f));
    LowerArmL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerArmR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerArmR"));
    LowerArmR->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerArmR->SetStaticMesh(SM_Cylinder);
    LowerArmR->SetRelativeLocation(FVector(0, ArmX, ShoulderZ - 42.f));
    LowerArmR->SetRelativeScale3D(FVector(0.09f, 0.09f, 0.26f));
    LowerArmR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    float HipZ = -5.f;
    float LegY = 9.f;

    UpperLegL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperLegL"));
    UpperLegL->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperLegL->SetStaticMesh(SM_Cylinder);
    UpperLegL->SetRelativeLocation(FVector(0, -LegY, HipZ - 17.f));
    UpperLegL->SetRelativeScale3D(FVector(0.15f, 0.15f, 0.33f));
    UpperLegL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    UpperLegR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperLegR"));
    UpperLegR->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperLegR->SetStaticMesh(SM_Cylinder);
    UpperLegR->SetRelativeLocation(FVector(0, LegY, HipZ - 17.f));
    UpperLegR->SetRelativeScale3D(FVector(0.15f, 0.15f, 0.33f));
    UpperLegR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerLegL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerLegL"));
    LowerLegL->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerLegL->SetStaticMesh(SM_Cylinder);
    LowerLegL->SetRelativeLocation(FVector(0, -LegY, HipZ - 50.f));
    LowerLegL->SetRelativeScale3D(FVector(0.13f, 0.13f, 0.33f));
    LowerLegL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerLegR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerLegR"));
    LowerLegR->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerLegR->SetStaticMesh(SM_Cylinder);
    LowerLegR->SetRelativeLocation(FVector(0, LegY, HipZ - 50.f));
    LowerLegR->SetRelativeScale3D(FVector(0.13f, 0.13f, 0.33f));
    LowerLegR->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

uint32 ANPCCharacter::HashString(const FString& Str)
{
    uint32 Hash = 5381;
    for (int32 i = 0; i < Str.Len(); i++)
    {
        Hash = ((Hash << 5) + Hash) + (uint32)Str[i];
    }
    return Hash;
}

void ANPCCharacter::ApplyBodyColors()
{
    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (!BaseMat) return;

    uint32 Hash = HashString(CharacterId);

    // Skin tone — warm range derived from hash
    float SkinR = 0.6f + (float)((Hash >> 0) & 0xFF) / 255.f * 0.3f;
    float SkinG = 0.4f + (float)((Hash >> 8) & 0xFF) / 255.f * 0.3f;
    float SkinB = 0.3f + (float)((Hash >> 16) & 0xFF) / 255.f * 0.3f;

    // Clothing — pick from a palette
    static const FLinearColor ClothPalette[] = {
        FLinearColor(0.2f, 0.3f, 0.5f),   // Blue
        FLinearColor(0.5f, 0.2f, 0.2f),   // Red
        FLinearColor(0.2f, 0.45f, 0.25f), // Green
        FLinearColor(0.45f, 0.35f, 0.2f), // Brown
        FLinearColor(0.5f, 0.3f, 0.45f),  // Purple
        FLinearColor(0.5f, 0.45f, 0.2f),  // Gold
        FLinearColor(0.3f, 0.3f, 0.35f),  // Gray
        FLinearColor(0.55f, 0.4f, 0.3f),  // Tan
    };
    FLinearColor ClothColor = ClothPalette[(Hash >> 4) % 8];

    // Accent (legs) — darker complementary
    FLinearColor AccentColor(ClothColor.R * 0.6f, ClothColor.G * 0.6f, ClothColor.B * 0.6f + 0.1f);

    UMaterialInstanceDynamic* SkinMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    SkinMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(SkinR, SkinG, SkinB));

    UMaterialInstanceDynamic* ClothMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    ClothMat->SetVectorParameterValue(TEXT("Color"), ClothColor);

    UMaterialInstanceDynamic* AccentMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    AccentMat->SetVectorParameterValue(TEXT("Color"), AccentColor);

    // Apply: head + lower arms = skin, torso + upper arms = clothing, legs = accent
    if (HeadMesh) HeadMesh->SetMaterial(0, SkinMat);
    if (LowerArmL) LowerArmL->SetMaterial(0, SkinMat);
    if (LowerArmR) LowerArmR->SetMaterial(0, SkinMat);

    if (TorsoMesh) TorsoMesh->SetMaterial(0, ClothMat);
    if (UpperArmL) UpperArmL->SetMaterial(0, ClothMat);
    if (UpperArmR) UpperArmR->SetMaterial(0, ClothMat);

    if (UpperLegL) UpperLegL->SetMaterial(0, AccentMat);
    if (UpperLegR) UpperLegR->SetMaterial(0, AccentMat);
    if (LowerLegL) LowerLegL->SetMaterial(0, AccentMat);
    if (LowerLegR) LowerLegR->SetMaterial(0, AccentMat);
}

void ANPCCharacter::BeginPlay()
{
    Super::BeginPlay();

    // Priority 1: Externally assigned static mesh (via Blueprint or GameMode)
    if (CharacterMesh && VisualMesh)
    {
        VisualMesh->SetStaticMesh(CharacterMesh);
        VisualMesh->SetVisibility(true);
        GetMesh()->SetVisibility(false);
        if (HeadMesh) HeadMesh->SetVisibility(false);
        if (TorsoMesh) TorsoMesh->SetVisibility(false);
        return;
    }

    // Priority 2: Try to load an imported Quaternius skeletal mesh from Content/Characters/
    // Pick a model variant based on character ID hash for deterministic variety
    static const TCHAR* NPCModelPaths[] = {
        TEXT("/Game/Characters/anim_ual1_standard/anim_ual1_standard"),
        TEXT("/Game/Characters/anim2_ual2_standard/anim2_ual2_standard"),
        TEXT("/Game/Characters/anim2_mannequin_f/anim2_mannequin_f"),
    };
    static const int32 NumModelPaths = 3;

    uint32 Hash = HashString(CharacterId);
    int32 ModelIdx = Hash % NumModelPaths;
    USkeletalMesh* ImportedMesh = LoadObject<USkeletalMesh>(nullptr, NPCModelPaths[ModelIdx]);

    // Try each path until one works
    if (!ImportedMesh)
    {
        for (int32 i = 0; i < NumModelPaths; i++)
        {
            ImportedMesh = LoadObject<USkeletalMesh>(nullptr, NPCModelPaths[i]);
            if (ImportedMesh) break;
        }
    }

    if (ImportedMesh)
    {
        // Use imported skeletal mesh
        GetMesh()->SetSkeletalMesh(ImportedMesh);
        GetMesh()->SetVisibility(true);
        GetMesh()->SetRelativeLocation(FVector(0, 0, -88.f));
        GetMesh()->SetAnimInstanceClass(UInsimulAnimInstance::StaticClass());

        // Hide primitive body
        if (HeadMesh) HeadMesh->SetVisibility(false);
        if (TorsoMesh) TorsoMesh->SetVisibility(false);
        if (UpperArmL) UpperArmL->SetVisibility(false);
        if (UpperArmR) UpperArmR->SetVisibility(false);
        if (LowerArmL) LowerArmL->SetVisibility(false);
        if (LowerArmR) LowerArmR->SetVisibility(false);
        if (UpperLegL) UpperLegL->SetVisibility(false);
        if (UpperLegR) UpperLegR->SetVisibility(false);
        if (LowerLegL) LowerLegL->SetVisibility(false);
        if (LowerLegR) LowerLegR->SetVisibility(false);

        UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s using imported skeletal mesh (variant %d)"), *CharacterId, ModelIdx);
    }
    else
    {
        // Priority 3: Fallback to procedural primitive body
        ApplyBodyColors();
        UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s using primitive body (no imported mesh)"), *CharacterId);
    }
}

void ANPCCharacter::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // Schedule-driven behavior: query game time and evaluate schedule
    if (bHasSchedule)
    {
        UWorld* World = GetWorld();
        if (World)
        {
            // Game time: 1 real second = 1 game minute by default
            // GameTimeSeconds / 60 = game hours elapsed, mod 24 for hour of day
            float GameSeconds = World->GetTimeSeconds();
            float GameHour = FMath::Fmod(GameSeconds / 60.f, 24.f);
            EvaluateSchedule(GameHour);
        }
    }

    switch (CurrentState)
    {
    case ENPCState::Idle:
        // Stand at current position
        break;
    case ENPCState::Patrol:
        // Wander within PatrolRadius of HomePosition
        {
            FVector Current = GetActorLocation();
            FVector Offset = Current - HomePosition;
            Offset.Z = 0.f;
            if (Offset.Size() > PatrolRadius * 100.f)
            {
                // Walked too far — turn back toward home
                FVector Dir = (HomePosition - Current).GetSafeNormal();
                AddMovementInput(Dir, 0.5f);
            }
            else
            {
                // Wander in a random direction, changing occasionally
                float Time = GetWorld()->GetTimeSeconds();
                float Angle = FMath::Sin(Time * 0.3f + GetUniqueID()) * 180.f;
                FVector WanderDir = FRotator(0.f, Angle, 0.f).Vector();
                AddMovementInput(WanderDir, 0.3f);
            }
        }
        break;
    case ENPCState::ScheduleMove:
        MoveTowardTarget(DeltaTime);
        break;
    case ENPCState::Talking:
        // Face dialogue partner — handled by dialogue system
        break;
    case ENPCState::Fleeing:
        // Move away from threat — handled by AI controller
        break;
    case ENPCState::Pursuing:
        // Move toward target — handled by AI controller
        break;
    case ENPCState::Alert:
        // Look around — idle with occasional rotation
        break;
    }
}

void ANPCCharacter::InitFromData(const FString& InCharacterId, const FString& InNPCRole,
                                  FVector InHomePosition, float InPatrolRadius, float InDisposition)
{
    CharacterId = InCharacterId;
    NPCRole = InNPCRole;
    HomePosition = InHomePosition;
    PatrolRadius = InPatrolRadius;
    Disposition = InDisposition;

    SetActorLocation(HomePosition);

    // Apply body type variant based on role
    FString R = NPCRole.ToLower();
    if (R.Contains(TEXT("blacksmith")) || R.Contains(TEXT("guard")) || R.Contains(TEXT("soldier")) || R.Contains(TEXT("warrior")))
    {
        // Athletic: wider torso, thicker arms
        if (TorsoMesh) TorsoMesh->SetRelativeScale3D(TorsoMesh->GetRelativeScale3D() * FVector(1.15f, 1.0f, 1.05f));
        if (UpperArmL) UpperArmL->SetRelativeScale3D(UpperArmL->GetRelativeScale3D() * 1.25f);
        if (UpperArmR) UpperArmR->SetRelativeScale3D(UpperArmR->GetRelativeScale3D() * 1.25f);
    }
    else if (R.Contains(TEXT("innkeeper")) || R.Contains(TEXT("cook")) || R.Contains(TEXT("brewer")) || R.Contains(TEXT("baker")))
    {
        // Heavy: wide torso, shorter limbs
        if (TorsoMesh) TorsoMesh->SetRelativeScale3D(TorsoMesh->GetRelativeScale3D() * FVector(1.3f, 1.35f, 0.95f));
        if (UpperLegL) UpperLegL->SetRelativeScale3D(UpperLegL->GetRelativeScale3D() * 1.2f);
        if (UpperLegR) UpperLegR->SetRelativeScale3D(UpperLegR->GetRelativeScale3D() * 1.2f);
    }
    else if (R.Contains(TEXT("thief")) || R.Contains(TEXT("scout")) || R.Contains(TEXT("scholar")) || R.Contains(TEXT("mage")))
    {
        // Slim: narrow torso, thinner limbs
        if (TorsoMesh) TorsoMesh->SetRelativeScale3D(TorsoMesh->GetRelativeScale3D() * FVector(0.85f, 0.82f, 1.02f));
        if (UpperArmL) UpperArmL->SetRelativeScale3D(UpperArmL->GetRelativeScale3D() * 0.85f);
        if (UpperArmR) UpperArmR->SetRelativeScale3D(UpperArmR->GetRelativeScale3D() * 0.85f);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s initialized at %s (role: %s)"),
        *CharacterId, *HomePosition.ToString(), *NPCRole);
}

void ANPCCharacter::SetSchedule(const FNPCSchedule& InSchedule)
{
    Schedule = InSchedule;
    bHasSchedule = Schedule.Blocks.Num() > 0;
    CurrentBlockIndex = -1;
    LastEvaluatedHour = -1.f;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s schedule set: %d blocks, wake=%.1f, bed=%.1f"),
        *CharacterId, Schedule.Blocks.Num(), Schedule.WakeHour, Schedule.BedtimeHour);
}

void ANPCCharacter::EvaluateSchedule(float GameHour)
{
    // Only re-evaluate when the hour changes meaningfully (every ~6 game-minutes)
    if (FMath::Abs(GameHour - LastEvaluatedHour) < 0.1f)
    {
        return;
    }
    LastEvaluatedHour = GameHour;

    // Don't override dialogue state
    if (CurrentState == ENPCState::Talking)
    {
        return;
    }

    int32 BlockIdx = FindBlockForHour(GameHour);
    if (BlockIdx == CurrentBlockIndex)
    {
        return; // Same block, no change needed
    }

    CurrentBlockIndex = BlockIdx;

    if (BlockIdx < 0)
    {
        // No block covers this hour — default to idle at home
        CurrentState = ENPCState::Idle;
        ScheduleTargetPosition = HomePosition;
        return;
    }

    const FScheduleBlock& Block = Schedule.Blocks[BlockIdx];
    ENPCState NewState = ActivityToState(Block.Activity);

    // Determine target position based on activity
    if (Block.Activity == EScheduleActivity::Sleep || Block.Activity == EScheduleActivity::IdleAtHome)
    {
        ScheduleTargetPosition = HomePosition;
    }
    else if (!Block.BuildingId.IsEmpty())
    {
        // BuildingId is set — would resolve to building position via lookup
        // For now, use home position as fallback; building lookup is handled by GameMode
        ScheduleTargetPosition = HomePosition;
    }
    else
    {
        // Outdoor activity (wander/socialize) — stay near home
        ScheduleTargetPosition = HomePosition;
    }

    // If we need to move to a new location, enter ScheduleMove state first
    FVector CurrentPos = GetActorLocation();
    float DistToTarget = FVector::Dist2D(CurrentPos, ScheduleTargetPosition);

    if (DistToTarget > 150.f) // More than 1.5m away (in cm)
    {
        CurrentState = ENPCState::ScheduleMove;
    }
    else
    {
        CurrentState = NewState;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s schedule block %d: activity=%d, state=%d"),
        *CharacterId, BlockIdx, (int32)Block.Activity, (int32)CurrentState);
}

int32 ANPCCharacter::FindBlockForHour(float Hour) const
{
    int32 BestIdx = -1;
    int32 BestPriority = -1;

    for (int32 i = 0; i < Schedule.Blocks.Num(); i++)
    {
        const FScheduleBlock& Block = Schedule.Blocks[i];
        bool bInRange;

        if (Block.StartHour <= Block.EndHour)
        {
            bInRange = (Hour >= Block.StartHour && Hour < Block.EndHour);
        }
        else
        {
            // Wraps midnight (e.g. 22:00 to 6:00)
            bInRange = (Hour >= Block.StartHour || Hour < Block.EndHour);
        }

        if (bInRange && Block.Priority > BestPriority)
        {
            BestIdx = i;
            BestPriority = Block.Priority;
        }
    }

    return BestIdx;
}

ENPCState ANPCCharacter::ActivityToState(EScheduleActivity Activity) const
{
    switch (Activity)
    {
    case EScheduleActivity::Sleep:
    case EScheduleActivity::IdleAtHome:
        return ENPCState::Idle;
    case EScheduleActivity::Work:
    case EScheduleActivity::Eat:
    case EScheduleActivity::Shop:
        return ENPCState::Idle; // Idle at destination
    case EScheduleActivity::Wander:
        return ENPCState::Patrol;
    case EScheduleActivity::Socialize:
    case EScheduleActivity::VisitFriend:
        return ENPCState::Idle; // Idle at friend's location
    default:
        return ENPCState::Idle;
    }
}

void ANPCCharacter::MoveTowardTarget(float DeltaTime)
{
    FVector CurrentPos = GetActorLocation();
    float Dist = FVector::Dist2D(CurrentPos, ScheduleTargetPosition);

    if (Dist <= 150.f)
    {
        // Arrived — switch to the activity state
        if (CurrentBlockIndex >= 0 && CurrentBlockIndex < Schedule.Blocks.Num())
        {
            CurrentState = ActivityToState(Schedule.Blocks[CurrentBlockIndex].Activity);
        }
        else
        {
            CurrentState = ENPCState::Idle;
        }
        return;
    }

    FVector Dir = (ScheduleTargetPosition - CurrentPos).GetSafeNormal2D();
    AddMovementInput(Dir, 1.f);
}

EScheduleActivity ANPCCharacter::GetCurrentScheduleActivity() const
{
    if (CurrentBlockIndex >= 0 && CurrentBlockIndex < Schedule.Blocks.Num())
    {
        return Schedule.Blocks[CurrentBlockIndex].Activity;
    }
    return EScheduleActivity::Sleep;
}

FString ANPCCharacter::GetCurrentScheduleBuildingId() const
{
    if (CurrentBlockIndex >= 0 && CurrentBlockIndex < Schedule.Blocks.Num())
    {
        return Schedule.Blocks[CurrentBlockIndex].BuildingId;
    }
    return FString();
}

void ANPCCharacter::StartDialogue(AActor* Initiator)
{
    CurrentState = ENPCState::Talking;

    // Tell the player controller to show the dialogue UI
    APawn* PlayerPawn = Cast<APawn>(Initiator);
    if (PlayerPawn)
    {
        APlayerController* PC = Cast<APlayerController>(PlayerPawn->GetController());
        if (PC)
        {
            // Use the Insimul player controller's ShowDialogue method
            AInsimulPlayerController* IPC = Cast<AInsimulPlayerController>(PC);
            if (IPC)
            {
                IPC->ShowDialogue(CharacterId, CharacterId);
            }
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC %s starting dialogue"), *CharacterId);
}
