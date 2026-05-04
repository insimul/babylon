#include "PlayerCharacter.h"
#include "NPCCharacter.h"
#include "../Systems/BuildingInteriorSystem.h"
#include "../Systems/CombatSystem.h"
#include "../Core/InsimulMeshActor.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"
#include "InsimulAnimInstance.h"
#include "../Systems/AudioSystem.h"
#include "../Systems/InventorySystem.h"
#include "Engine/SkeletalMesh.h"

APlayerCharacter::APlayerCharacter()
{
    PrimaryActorTick.bCanEverTick = true;

    // Capsule
    GetCapsuleComponent()->InitCapsuleSize(42.f, 96.f);

    // Spring Arm
    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(RootComponent);
    SpringArm->TargetArmLength = 300.f;
    SpringArm->bUsePawnControlRotation = true;

    // Camera
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
    Camera->bUsePawnControlRotation = false;

    // Movement
    GetCharacterMovement()->MaxWalkSpeed = MoveSpeed * 100.f;
    GetCharacterMovement()->JumpZVelocity = JumpStrength * 100.f;
    GetCharacterMovement()->GravityScale = {{PLAYER_GRAVITY}};

    bUseControllerRotationYaw = false;
    GetCharacterMovement()->bOrientRotationToMovement = true;

    // ── Visible body parts (primitive meshes) ──
    // Load basic shapes
    static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

    UStaticMesh* SM_Sphere = SphereFinder.Succeeded() ? SphereFinder.Object : nullptr;
    UStaticMesh* SM_Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
    UStaticMesh* SM_Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;

    // Body proportions (matching Babylon.js 'average' type, in cm)
    // UE basic shapes are 100cm unit meshes, so scale = desired_cm / 100

    // Head — sphere, diameter 36cm, center at 155cm above capsule bottom
    // Capsule half-height is 96cm, so capsule center is at 0. Bottom is at -96.
    // We want head at +59cm relative to capsule center (155 - 96 = 59)
    HeadMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Head"));
    HeadMesh->SetupAttachment(RootComponent);
    if (SM_Sphere) HeadMesh->SetStaticMesh(SM_Sphere);
    HeadMesh->SetRelativeLocation(FVector(0, 0, 59.f));
    HeadMesh->SetRelativeScale3D(FVector(0.36f, 0.36f, 0.36f));
    HeadMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Torso — cube, 40x22x55cm, center at ~24cm (120 - 96)
    TorsoMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Torso"));
    TorsoMesh->SetupAttachment(RootComponent);
    if (SM_Cube) TorsoMesh->SetStaticMesh(SM_Cube);
    TorsoMesh->SetRelativeLocation(FVector(0, 0, 24.f));
    TorsoMesh->SetRelativeScale3D(FVector(0.40f, 0.22f, 0.55f));
    TorsoMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Arms — cylinders
    float ShoulderZ = 48.f; // ~144cm - 96cm
    float ArmX = 26.f;      // torso half-width + arm radius

    // Upper arms (clothing color)
    UpperArmL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperArmL"));
    UpperArmL->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperArmL->SetStaticMesh(SM_Cylinder);
    UpperArmL->SetRelativeLocation(FVector(0, -ArmX, ShoulderZ - 15.f));
    UpperArmL->SetRelativeScale3D(FVector(0.12f, 0.12f, 0.30f));
    UpperArmL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    UpperArmR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperArmR"));
    UpperArmR->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperArmR->SetStaticMesh(SM_Cylinder);
    UpperArmR->SetRelativeLocation(FVector(0, ArmX, ShoulderZ - 15.f));
    UpperArmR->SetRelativeScale3D(FVector(0.12f, 0.12f, 0.30f));
    UpperArmR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Lower arms (skin color)
    LowerArmL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerArmL"));
    LowerArmL->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerArmL->SetStaticMesh(SM_Cylinder);
    LowerArmL->SetRelativeLocation(FVector(0, -ArmX, ShoulderZ - 44.f));
    LowerArmL->SetRelativeScale3D(FVector(0.10f, 0.10f, 0.28f));
    LowerArmL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerArmR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerArmR"));
    LowerArmR->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerArmR->SetStaticMesh(SM_Cylinder);
    LowerArmR->SetRelativeLocation(FVector(0, ArmX, ShoulderZ - 44.f));
    LowerArmR->SetRelativeScale3D(FVector(0.10f, 0.10f, 0.28f));
    LowerArmR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Legs — cylinders
    float HipZ = -3.f;     // ~93cm - 96cm
    float LegY = 10.f;     // torso width * 0.25

    UpperLegL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperLegL"));
    UpperLegL->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperLegL->SetStaticMesh(SM_Cylinder);
    UpperLegL->SetRelativeLocation(FVector(0, -LegY, HipZ - 17.f));
    UpperLegL->SetRelativeScale3D(FVector(0.16f, 0.16f, 0.35f));
    UpperLegL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    UpperLegR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpperLegR"));
    UpperLegR->SetupAttachment(RootComponent);
    if (SM_Cylinder) UpperLegR->SetStaticMesh(SM_Cylinder);
    UpperLegR->SetRelativeLocation(FVector(0, LegY, HipZ - 17.f));
    UpperLegR->SetRelativeScale3D(FVector(0.16f, 0.16f, 0.35f));
    UpperLegR->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerLegL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerLegL"));
    LowerLegL->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerLegL->SetStaticMesh(SM_Cylinder);
    LowerLegL->SetRelativeLocation(FVector(0, -LegY, HipZ - 52.f));
    LowerLegL->SetRelativeScale3D(FVector(0.14f, 0.14f, 0.35f));
    LowerLegL->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    LowerLegR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("LowerLegR"));
    LowerLegR->SetupAttachment(RootComponent);
    if (SM_Cylinder) LowerLegR->SetStaticMesh(SM_Cylinder);
    LowerLegR->SetRelativeLocation(FVector(0, LegY, HipZ - 52.f));
    LowerLegR->SetRelativeScale3D(FVector(0.14f, 0.14f, 0.35f));
    LowerLegR->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void APlayerCharacter::BeginPlay()
{
    Super::BeginPlay();

    // Try to load imported skeletal mesh (from asset import step)
    USkeletalMesh* ImportedMesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Vincent-frontFacing.Vincent-frontFacing"));
    if (!ImportedMesh)
    {
        // Try alternate naming conventions UE may use during import
        ImportedMesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Vincent-frontFacing"));
    }

    if (ImportedMesh)
    {
        // Use the imported skeletal mesh instead of primitive shapes
        GetMesh()->SetSkeletalMesh(ImportedMesh);
        GetMesh()->SetVisibility(true);
        GetMesh()->SetRelativeLocation(FVector(0, 0, -90.f));
        GetMesh()->SetAnimInstanceClass(UInsimulAnimInstance::StaticClass());

        // Hide all primitive body parts
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

        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Player using imported skeletal mesh: Vincent"));
    }
    else
    {
        // Fallback: use primitive body with colored materials
        ApplyBodyMaterials();
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Player using primitive body (no imported mesh found)"));
    }

    // Start ambient audio
    UGameInstance* GI = GetGameInstance();
    if (GI)
    {
        UAudioSystem* Audio = GI->GetSubsystem<UAudioSystem>();
        if (Audio)
        {
            Audio->PlayAmbientLoop(TEXT("ambient_village"));
        }
    }
}

void APlayerCharacter::ApplyBodyMaterials()
{
    UMaterial* BaseMat = LoadObject<UMaterial>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    if (!BaseMat) return;

    // Skin color — warm tone
    UMaterialInstanceDynamic* SkinMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    SkinMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.76f, 0.57f, 0.42f));

    // Clothing color — blue tunic
    UMaterialInstanceDynamic* ClothMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    ClothMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.25f, 0.35f, 0.55f));

    // Accent color — brown pants
    UMaterialInstanceDynamic* AccentMat = UMaterialInstanceDynamic::Create(BaseMat, this);
    AccentMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.4f, 0.3f, 0.2f));

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

void APlayerCharacter::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    CheckDoorProximity();
    CheckNPCProximity();

    // Footstep audio when moving
    float Speed = GetVelocity().Size();
    if (Speed > 10.f && !GetCharacterMovement()->IsFalling())
    {
        FootstepTimer -= DeltaTime;
        if (FootstepTimer <= 0.0f)
        {
            FootstepTimer = FootstepInterval / FMath::Max(Speed / 300.f, 0.5f);
            UGameInstance* GI = GetGameInstance();
            if (GI)
            {
                UAudioSystem* Audio = GI->GetSubsystem<UAudioSystem>();
                if (Audio)
                {
                    Audio->PlaySoundAtLocation(TEXT("footstep_stone"), GetActorLocation());
                }
            }
        }
    }
    else
    {
        FootstepTimer = 0.0f;
    }
}

// ── Audio helpers ──

static float FootstepTimer = 0.0f;
static const float FootstepInterval = 0.45f; // seconds between footstep sounds

void APlayerCharacter::CheckDoorProximity()
{
    NearbyBuilding = nullptr;
    NearbyBuildingId.Empty();

    // Sphere overlap to find nearby buildings
    TArray<FOverlapResult> Overlaps;
    FCollisionShape Sphere = FCollisionShape::MakeSphere(DoorProximityRange);
    GetWorld()->OverlapMultiByChannel(Overlaps, GetActorLocation(), FQuat::Identity,
        ECC_WorldStatic, Sphere);

    float BestDist = DoorProximityRange + 1.f;
    for (const FOverlapResult& Overlap : Overlaps)
    {
        AActor* Actor = Overlap.GetActor();
        if (!Actor) continue;

        // Check if it's a building (labeled "Building_*")
        FString Label = Actor->GetActorLabel();
        if (!Label.StartsWith(TEXT("Building_"))) continue;

        float Dist = FVector::Dist(GetActorLocation(), Actor->GetActorLocation());
        if (Dist < BestDist)
        {
            BestDist = Dist;
            NearbyBuilding = Actor;
        }
    }

    // Update interaction prompt
    if (NearbyBuilding)
    {
        InteractionPrompt = TEXT("[E] Enter Building");
    }
    else if (!NearbyNPC)
    {
        InteractionPrompt.Empty();
    }
}

void APlayerCharacter::CheckNPCProximity()
{
    NearbyNPC = nullptr;

    // Line trace forward to detect NPCs
    FVector Start = GetActorLocation() + FVector(0, 0, 50.f);
    FVector Forward = GetActorForwardVector();
    FVector End = Start + Forward * InteractRange;

    FHitResult Hit;
    FCollisionQueryParams QueryParams;
    QueryParams.AddIgnoredActor(this);

    if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Pawn, QueryParams))
    {
        ANPCCharacter* HitNPC = Cast<ANPCCharacter>(Hit.GetActor());
        if (HitNPC)
        {
            NearbyNPC = HitNPC;
            if (!NearbyBuilding)
            {
                InteractionPrompt = FString::Printf(TEXT("[E] Talk to %s"), *HitNPC->CharacterId);
            }
        }
    }
    else if (!NearbyBuilding)
    {
        InteractionPrompt.Empty();
    }
}

void APlayerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    PlayerInputComponent->BindAxis("MoveForward", this, &APlayerCharacter::MoveForward);
    PlayerInputComponent->BindAxis("MoveRight", this, &APlayerCharacter::MoveRight);
    PlayerInputComponent->BindAxis("LookUp", this, &APlayerCharacter::LookUp);
    PlayerInputComponent->BindAxis("Turn", this, &APlayerCharacter::Turn);
    PlayerInputComponent->BindAction("Jump", IE_Pressed, this, &ACharacter::Jump);
    PlayerInputComponent->BindAction("Jump", IE_Released, this, &ACharacter::StopJumping);
    PlayerInputComponent->BindAction("Attack", IE_Pressed, this, &APlayerCharacter::Attack);
    PlayerInputComponent->BindAction("Interact", IE_Pressed, this, &APlayerCharacter::Interact);
}

void APlayerCharacter::MoveForward(float Value)
{
    if (Value == 0.f || !Controller) return;
    const FRotator Rot = Controller->GetControlRotation();
    const FRotator YawRot(0, Rot.Yaw, 0);
    AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::X), Value);
}

void APlayerCharacter::MoveRight(float Value)
{
    if (Value == 0.f || !Controller) return;
    const FRotator Rot = Controller->GetControlRotation();
    const FRotator YawRot(0, Rot.Yaw, 0);
    AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y), Value);
}

void APlayerCharacter::LookUp(float Value)
{
    AddControllerPitchInput(Value);
}

void APlayerCharacter::Turn(float Value)
{
    AddControllerYawInput(Value);
}

void APlayerCharacter::Attack()
{
    // Line trace forward to find target
    FVector Start = GetActorLocation() + FVector(0, 0, 50.f);
    FVector End = Start + GetActorForwardVector() * InteractRange;

    FHitResult Hit;
    FCollisionQueryParams Params;
    Params.AddIgnoredActor(this);

    if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Pawn, Params))
    {
        ANPCCharacter* TargetNPC = Cast<ANPCCharacter>(Hit.GetActor());
        if (TargetNPC)
        {
            // Use combat system for damage calculation
            UGameInstance* GI = GetGameInstance();
            UCombatSystem* Combat = GI ? GI->GetSubsystem<UCombatSystem>() : nullptr;
            if (Combat)
            {
                float Damage = Combat->CalculateDamage(Combat->BaseDamage, FMath::FRand() < Combat->CriticalChance);
                UE_LOG(LogTemp, Warning, TEXT("[Insimul] Player attacked %s for %.1f damage"), *TargetNPC->CharacterId, Damage);
            }
        }
    }
}

void APlayerCharacter::Interact()
{
    // Priority 1: Enter building
    UGameInstance* GI = GetGameInstance();
    if (NearbyBuilding && GI)
    {
        UBuildingInteriorSystem* Interior = GI->GetSubsystem<UBuildingInteriorSystem>();
        if (Interior)
        {
            if (Interior->IsInsideBuilding())
            {
                Interior->ExitBuilding();
            }
            else
            {
                // Get building data from actor metadata or label
                FVector DoorPos = NearbyBuilding->GetActorLocation();
                // Play door sound
                if (UAudioSystem* Audio = GI->GetSubsystem<UAudioSystem>())
                {
                    Audio->PlaySoundAtLocation(TEXT("interact_door"), NearbyBuilding->GetActorLocation());
                }

                Interior->EnterBuilding(
                    NearbyBuildingId.IsEmpty() ? NearbyBuilding->GetActorLabel() : NearbyBuildingId,
                    NearbyBuildingRole.IsEmpty() ? TEXT("residence") : NearbyBuildingRole,
                    DoorPos,
                    NearbyBuildingWidth > 0 ? NearbyBuildingWidth : 800.f,
                    NearbyBuildingDepth > 0 ? NearbyBuildingDepth : 600.f,
                    NearbyBuildingFloors);
            }
            return;
        }
    }

    // Priority 2: Talk to NPC
    if (NearbyNPC)
    {
        NearbyNPC->StartDialogue(this);
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Started dialogue with %s"), *NearbyNPC->CharacterId);
        return;
    }

    // Priority 3: Pick up nearby item
    TArray<FOverlapResult> ItemOverlaps;
    FCollisionShape ItemSphere = FCollisionShape::MakeSphere(150.f);
    GetWorld()->OverlapMultiByChannel(ItemOverlaps, GetActorLocation(), FQuat::Identity,
        ECC_WorldStatic, ItemSphere);

    for (const FOverlapResult& Overlap : ItemOverlaps)
    {
        AActor* Actor = Overlap.GetActor();
        if (Actor && Actor->Tags.Contains(TEXT("Pickup")))
        {
            // Add to inventory via subsystem
            FString ItemId = Actor->Tags.IsValidIndex(2) ? Actor->Tags[2].ToString() : TEXT("unknown");
            FString ItemType = Actor->Tags.IsValidIndex(1) ? Actor->Tags[1].ToString() : TEXT("item");

            UGameInstance* ItemGI = GetGameInstance();
            if (ItemGI)
            {
                UInventorySystem* Inventory = ItemGI->GetSubsystem<UInventorySystem>();
                if (Inventory)
                {
                    FInsimulItem NewItem;
                    NewItem.ItemId = ItemId;
                    NewItem.Name = Actor->GetActorLabel();
                    NewItem.ItemType = ItemType;
                    NewItem.Quantity = 1;
                    Inventory->AddItem(NewItem);
                }

                // Play pickup sound
                UAudioSystem* Audio = ItemGI->GetSubsystem<UAudioSystem>();
                if (Audio)
                {
                    Audio->PlaySoundAtLocation(TEXT("interact_button"), Actor->GetActorLocation());
                }
            }

            Actor->Destroy();
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] Picked up item: %s"), *ItemId);
            return;
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Nothing to interact with"));
}
