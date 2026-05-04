#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "NPCMovementController.generated.h"

class UNavigationSystemV1;

/**
 * NPC movement controller component.
 * Handles patrol routes, wandering, target-based movement, and road following
 * using NavMesh pathfinding. Supports NPC and player avoidance.
 */
UENUM(BlueprintType)
enum class ENPCMovementMode : uint8
{
    Idle        UMETA(DisplayName = "Idle"),
    Patrol      UMETA(DisplayName = "Patrol"),
    WalkToTarget UMETA(DisplayName = "WalkToTarget"),
    Wander      UMETA(DisplayName = "Wander"),
    FollowRoad  UMETA(DisplayName = "FollowRoad")
};

UCLASS(ClassGroup = (Insimul), meta = (BlueprintSpawnableComponent))
class INSIMULEXPORT_API UNPCMovementController : public UActorComponent
{
    GENERATED_BODY()

public:
    UNPCMovementController();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Set the current movement mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Movement")
    void SetMovementMode(ENPCMovementMode Mode);

    /** Set a specific target location to walk to */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Movement")
    void SetTargetLocation(FVector Location);

    /** Set a patrol route (array of waypoints) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Movement")
    void SetPatrolRoute(const TArray<FVector>& Points);

    /** Set the wander radius around the current position */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Movement")
    void SetWanderRadius(float Radius);

    /** Get the current movement mode */
    UFUNCTION(BlueprintPure, Category = "Insimul|Movement")
    ENPCMovementMode GetCurrentMovementMode() const;

    /** Walking speed (cm/s) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    float WalkSpeed = 150.0f;

    /** Running speed (cm/s) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    float RunSpeed = 400.0f;

    /** Whether to avoid other NPCs */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    bool bAvoidOtherNPCs = true;

    /** Whether to avoid the player character */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    bool bAvoidPlayer = true;

    /** Avoidance radius for sphere overlap checks (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    float AvoidanceRadius = 100.0f;

    /** Acceptance radius for reaching a target point (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Movement")
    float AcceptanceRadius = 50.0f;

private:
    UPROPERTY()
    ENPCMovementMode CurrentMode = ENPCMovementMode::Idle;

    /** Target location for WalkToTarget mode */
    FVector CurrentTarget = FVector::ZeroVector;

    /** Patrol waypoints */
    TArray<FVector> PatrolPoints;

    /** Current patrol waypoint index */
    int32 CurrentPatrolIndex = 0;

    /** Center point for wander mode */
    FVector WanderCenter = FVector::ZeroVector;

    /** Radius for wander mode (cm) */
    float WanderRadius = 500.0f;

    /** Timer for picking next wander target */
    float WanderTimer = 0.0f;

    /** Interval between wander target changes (seconds) */
    float WanderInterval = 5.0f;

    /** Whether the NPC has reached the current target */
    bool bReachedTarget = true;

    /** Move toward a target location, returns true if reached */
    bool MoveToward(FVector Target, float Speed, float DeltaTime);

    /** Pick a random point within wander radius */
    FVector GetRandomWanderPoint() const;

    /** Check for nearby actors to avoid and return avoidance offset */
    FVector CalculateAvoidanceOffset() const;
};
