#include "NPCMovementController.h"
#include "NavigationSystem.h"
#include "AIModule/Classes/Navigation/PathFollowingComponent.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"

UNPCMovementController::UNPCMovementController()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.0f;
}

void UNPCMovementController::BeginPlay()
{
    Super::BeginPlay();
    WanderCenter = GetOwner()->GetActorLocation();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCMovementController initialized on %s"), *GetOwner()->GetName());
}

void UNPCMovementController::SetMovementMode(ENPCMovementMode Mode)
{
    if (Mode == CurrentMode) return;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] %s movement mode: %d -> %d"),
           *GetOwner()->GetName(), static_cast<int32>(CurrentMode), static_cast<int32>(Mode));

    CurrentMode = Mode;
    bReachedTarget = true;

    if (Mode == ENPCMovementMode::Wander)
    {
        WanderCenter = GetOwner()->GetActorLocation();
        WanderTimer = 0.0f;
    }
    else if (Mode == ENPCMovementMode::Patrol)
    {
        CurrentPatrolIndex = 0;
    }
}

void UNPCMovementController::SetTargetLocation(FVector Location)
{
    CurrentTarget = Location;
    bReachedTarget = false;
}

void UNPCMovementController::SetPatrolRoute(const TArray<FVector>& Points)
{
    PatrolPoints = Points;
    CurrentPatrolIndex = 0;
    if (PatrolPoints.Num() > 0)
    {
        CurrentTarget = PatrolPoints[0];
        bReachedTarget = false;
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] %s patrol route set with %d waypoints"), *GetOwner()->GetName(), PatrolPoints.Num());
}

void UNPCMovementController::SetWanderRadius(float Radius)
{
    WanderRadius = FMath::Max(Radius, 50.0f);
}

ENPCMovementMode UNPCMovementController::GetCurrentMovementMode() const
{
    return CurrentMode;
}

bool UNPCMovementController::MoveToward(FVector Target, float Speed, float DeltaTime)
{
    AActor* Owner = GetOwner();
    if (!Owner) return true;

    FVector CurrentLocation = Owner->GetActorLocation();
    FVector Direction = Target - CurrentLocation;
    float Distance = Direction.Size();

    if (Distance <= AcceptanceRadius)
    {
        return true; // Reached target
    }

    Direction.Normalize();

    // Apply avoidance
    FVector AvoidanceOffset = CalculateAvoidanceOffset();
    Direction += AvoidanceOffset * 0.5f;
    Direction.Normalize();

    // Move the actor
    FVector NewLocation = CurrentLocation + Direction * Speed * DeltaTime;
    Owner->SetActorLocation(NewLocation);

    // Face movement direction
    FRotator TargetRotation = Direction.Rotation();
    FRotator CurrentRotation = Owner->GetActorRotation();
    FRotator NewRotation = FMath::RInterpTo(CurrentRotation, TargetRotation, DeltaTime, 5.0f);
    Owner->SetActorRotation(FRotator(0.0f, NewRotation.Yaw, 0.0f));

    return false;
}

FVector UNPCMovementController::GetRandomWanderPoint() const
{
    float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
    float Dist = FMath::FRandRange(WanderRadius * 0.3f, WanderRadius);
    return WanderCenter + FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0.0f);
}

FVector UNPCMovementController::CalculateAvoidanceOffset() const
{
    if (!bAvoidOtherNPCs && !bAvoidPlayer) return FVector::ZeroVector;

    AActor* Owner = GetOwner();
    if (!Owner) return FVector::ZeroVector;

    UWorld* World = GetWorld();
    if (!World) return FVector::ZeroVector;

    FVector OwnerLocation = Owner->GetActorLocation();
    FVector AvoidanceForce = FVector::ZeroVector;

    // Sphere overlap to find nearby actors
    TArray<FOverlapResult> Overlaps;
    FCollisionShape SphereShape = FCollisionShape::MakeSphere(AvoidanceRadius);
    World->OverlapMultiByChannel(Overlaps, OwnerLocation, FQuat::Identity, ECC_Pawn, SphereShape);

    for (const FOverlapResult& Overlap : Overlaps)
    {
        AActor* OtherActor = Overlap.GetActor();
        if (!OtherActor || OtherActor == Owner) continue;

        // Check if we should avoid this actor
        bool bShouldAvoid = false;
        if (bAvoidPlayer)
        {
            APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
            if (PC && PC->GetPawn() == OtherActor)
            {
                bShouldAvoid = true;
            }
        }
        if (bAvoidOtherNPCs && !bShouldAvoid)
        {
            bShouldAvoid = true; // Assume other pawns are NPCs
        }

        if (bShouldAvoid)
        {
            FVector AwayDir = OwnerLocation - OtherActor->GetActorLocation();
            float Dist = AwayDir.Size();
            if (Dist > KINDA_SMALL_NUMBER && Dist < AvoidanceRadius)
            {
                AwayDir.Normalize();
                float Strength = 1.0f - (Dist / AvoidanceRadius);
                AvoidanceForce += AwayDir * Strength;
            }
        }
    }

    return AvoidanceForce;
}

void UNPCMovementController::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    switch (CurrentMode)
    {
    case ENPCMovementMode::Idle:
        // Do nothing
        break;

    case ENPCMovementMode::WalkToTarget:
        if (!bReachedTarget)
        {
            bReachedTarget = MoveToward(CurrentTarget, WalkSpeed, DeltaTime);
            if (bReachedTarget)
            {
                UE_LOG(LogTemp, Log, TEXT("[Insimul] %s reached target location"), *GetOwner()->GetName());
                CurrentMode = ENPCMovementMode::Idle;
            }
        }
        break;

    case ENPCMovementMode::Patrol:
        if (PatrolPoints.Num() == 0) break;
        if (bReachedTarget)
        {
            // Move to next patrol point
            CurrentPatrolIndex = (CurrentPatrolIndex + 1) % PatrolPoints.Num();
            CurrentTarget = PatrolPoints[CurrentPatrolIndex];
            bReachedTarget = false;
        }
        else
        {
            bReachedTarget = MoveToward(CurrentTarget, WalkSpeed, DeltaTime);
        }
        break;

    case ENPCMovementMode::Wander:
        WanderTimer -= DeltaTime;
        if (bReachedTarget || WanderTimer <= 0.0f)
        {
            CurrentTarget = GetRandomWanderPoint();
            bReachedTarget = false;
            WanderTimer = WanderInterval;
        }
        else
        {
            bReachedTarget = MoveToward(CurrentTarget, WalkSpeed * 0.7f, DeltaTime);
        }
        break;

    case ENPCMovementMode::FollowRoad:
        // Road-following uses patrol points set from road spline data
        if (PatrolPoints.Num() == 0) break;
        if (bReachedTarget)
        {
            if (CurrentPatrolIndex < PatrolPoints.Num() - 1)
            {
                CurrentPatrolIndex++;
                CurrentTarget = PatrolPoints[CurrentPatrolIndex];
                bReachedTarget = false;
            }
            else
            {
                UE_LOG(LogTemp, Log, TEXT("[Insimul] %s reached end of road"), *GetOwner()->GetName());
                CurrentMode = ENPCMovementMode::Idle;
            }
        }
        else
        {
            bReachedTarget = MoveToward(CurrentTarget, WalkSpeed, DeltaTime);
        }
        break;
    }
}
